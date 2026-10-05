import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { type StoredSignal, buildItems } from "./items";
import { mergeAnalysis } from "./merge";
import { INTENT_MODEL, runIntentModel } from "./model";
import { assess, evidenceStrength } from "./score";

type Client = SupabaseClient<Database>;

const PAGE = 1000; // PostgREST max rows per request
const LOOKBACK_DAYS = 365;
const STALE_RUN_MS = 15 * 60_000;
// Each run is a paid model call: back-to-back runs are refused unless new signals arrived in between.
const COOLDOWN_MS = 30_000;

export interface AnalysisSummary {
  runId: string;
  intents: number;
  itemsSent: number;
  classified: number;
  removed: number;
}

export class AnalysisInProgressError extends Error {}

// Runs as the signed-in user: every read and write below goes through RLS.
export async function analyzeIntents(supabase: Client, userId: string): Promise<AnalysisSummary> {
  // A crashed run must not block analysis forever.
  await supabase
    .from("analysis_runs")
    .update({ status: "failed", error: "Timed out", finished_at: new Date().toISOString() })
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - STALE_RUN_MS).toISOString());

  const { data: recent } = await supabase
    .from("analysis_runs")
    .select("started_at")
    .gte("started_at", new Date(Date.now() - COOLDOWN_MS).toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) {
    const { count } = await supabase
      .from("signals")
      .select("*", { count: "exact", head: true })
      .gt("created_at", recent.started_at);
    if (!count) throw new AnalysisInProgressError("Your IntentBank was just analyzed.");
  }

  const { data: run, error: runError } = await supabase
    .from("analysis_runs")
    .insert({ user_id: userId, model: INTENT_MODEL })
    .select("id")
    .single();
  if (runError) {
    if (runError.code === "23505") throw new AnalysisInProgressError("An analysis is already running.");
    throw new Error(runError.message);
  }

  try {
    const summary = await execute(supabase, userId, run.id);
    await supabase
      .from("analysis_runs")
      .update({ status: "succeeded", finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return summary;
  } catch (err) {
    await supabase
      .from("analysis_runs")
      .update({ status: "failed", error: (err as Error).message.slice(0, 500), finished_at: new Date().toISOString() })
      .eq("id", run.id);
    await supabase.from("vault_sources").update({ status: "imported" }).eq("status", "classifying");
    throw err;
  }
}

async function execute(supabase: Client, userId: string, runId: string): Promise<AnalysisSummary> {
  await supabase.from("vault_sources").update({ status: "classifying" }).in("status", ["imported", "ready"]);

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const signals = await fetchAll<StoredSignal>((from, to) =>
    supabase
      .from("signals")
      .select("id, kind, occurred_at, domain, title, query, category_slug")
      .gte("occurred_at", since)
      .order("occurred_at")
      .range(from, to),
  );

  const [{ data: existing }, { data: perms }] = await Promise.all([
    supabase.from("intents").select("id, key, label, category_slug, feedback, feedback_at, user_confirmed"),
    supabase.from("category_permissions").select("category_slug, collect"),
  ]);
  const disabledCategories = new Set((perms ?? []).filter((p) => !p.collect).map((p) => p.category_slug));

  const items = buildItems(signals);
  await supabase.from("analysis_runs").update({ signals_considered: signals.length, items_sent: items.length }).eq("id", runId);

  let result = { intents: [], classifications: [], sensitiveSignalIds: [] } as ReturnType<typeof mergeAnalysis>;
  let usage = { input: 0, output: 0 };
  if (items.length) {
    const model = await runIntentModel(
      items,
      (existing ?? []).map(({ key, label, category_slug, feedback }) => ({ key, label, category_slug, feedback })),
    );
    usage = model.usage;
    result = mergeAnalysis(model.analysis, items, { disabledCategories });
  }

  // 1. The model flagged something the rules missed: delete it and keep source counts honest.
  if (result.sensitiveSignalIds.length) {
    const removedBySource = new Map<string, number>();
    for (const ids of chunks(result.sensitiveSignalIds, 200)) {
      const { data, error } = await supabase.from("signals").delete().in("id", ids).select("source_id");
      if (error) throw new Error(error.message);
      for (const { source_id } of data ?? []) removedBySource.set(source_id, (removedBySource.get(source_id) ?? 0) + 1);
    }
    const { data: sources } = await supabase
      .from("vault_sources")
      .select("id, signal_count, dropped_sensitive_count")
      .in("id", [...removedBySource.keys()]);
    for (const src of sources ?? []) {
      const n = removedBySource.get(src.id) ?? 0;
      await supabase
        .from("vault_sources")
        .update({ signal_count: Math.max(0, src.signal_count - n), dropped_sensitive_count: src.dropped_sensitive_count + n })
        .eq("id", src.id);
    }
  }

  // 2. Second-pass classification for signals the rules couldn't place.
  let classified = 0;
  for (const c of result.classifications) {
    for (const ids of chunks(c.signalIds, 200)) {
      const { error } = await supabase.from("signals").update({ category_slug: c.category, classified_by: "ai" }).in("id", ids);
      if (error) throw new Error(error.message);
      classified += ids.length;
    }
  }

  // 3. Score and upsert intents. User feedback columns are never overwritten here.
  const bySignal = new Map(signals.map((s) => [s.id, s]));
  const prior = new Map((existing ?? []).map((e) => [e.key, e]));
  const now = new Date();
  const rows = result.intents.map((intent) => {
    const evidence = intent.signalIds.map((id) => bySignal.get(id)!);
    const strength = evidenceStrength(evidence);
    const before = prior.get(intent.key);
    const { confidence, state } = assess(
      {
        base_strength: strength.base,
        last_signal_at: strength.lastAt,
        feedback: before?.feedback ?? null,
        feedback_at: before?.feedback_at ?? null,
        purchase_completed: intent.purchaseCompleted,
      },
      now,
    );
    return {
      user_id: userId,
      key: intent.key,
      category_slug: intent.category,
      label: intent.label,
      explanation: intent.explanation,
      purchase_horizon: intent.purchaseHorizon,
      commercial_value: intent.commercialValue,
      purchase_completed: intent.purchaseCompleted,
      derived_by: "ai" as const,
      base_strength: strength.base,
      confidence,
      state,
      signal_count: strength.signalCount,
      source_count: strength.sourceCount,
      first_signal_at: strength.firstAt,
      last_signal_at: strength.lastAt,
      analyzed_at: now.toISOString(),
    };
  });

  const { data: written, error: upsertError } = rows.length
    ? await supabase.from("intents").upsert(rows, { onConflict: "user_id,key" }).select("id, key")
    : { data: [], error: null };
  if (upsertError) throw new Error(upsertError.message);
  const idByKey = new Map((written ?? []).map((w) => [w.key, w.id]));

  // 4. Re-link evidence for the intents just written.
  const writtenIds = [...idByKey.values()];
  for (const ids of chunks(writtenIds, 200)) {
    const { error } = await supabase.from("intent_signals").delete().in("intent_id", ids);
    if (error) throw new Error(error.message);
  }
  const links = result.intents.flatMap((intent) =>
    intent.signalIds.map((signalId) => ({ intent_id: idByKey.get(intent.key)!, signal_id: signalId, user_id: userId })),
  );
  for (const batch of chunks(links, 1000)) {
    const { error } = await supabase.from("intent_signals").insert(batch);
    if (error) throw new Error(error.message);
  }

  // 5. AI intents the model no longer sees are dropped, unless the person weighed in on them.
  const stale = (existing ?? []).filter((e) => !idByKey.has(e.key) && !e.feedback && !e.user_confirmed).map((e) => e.id);
  for (const ids of chunks(stale, 200)) {
    await supabase.from("intents").delete().in("id", ids);
  }

  // Intents kept for their feedback weren't rescored above.
  await refreshDecay(supabase, now);

  await supabase.from("vault_sources").update({ status: "ready" }).eq("status", "classifying");
  await supabase
    .from("analysis_runs")
    .update({
      intents_found: rows.length,
      signals_classified: classified,
      signals_removed: result.sensitiveSignalIds.length,
      input_tokens: usage.input,
      output_tokens: usage.output,
    })
    .eq("id", runId);
  await supabase.from("audit_events").insert({
    user_id: userId,
    actor: "agent",
    action: "intents.analyzed",
    subject_type: "analysis_run",
    subject_id: runId,
    details: {
      model: INTENT_MODEL,
      items_sent: items.length,
      intents: rows.length,
      classified,
      sensitive_removed: result.sensitiveSignalIds.length,
      stale_removed: stale.length,
    },
  });

  return { runId, intents: rows.length, itemsSent: items.length, classified, removed: result.sensitiveSignalIds.length };
}

// Recomputes confidence/state from stored fields so decay applies without re-running the model.
export async function refreshDecay(supabase: Client, now = new Date()): Promise<number> {
  const { data } = await supabase
    .from("intents")
    .select("id, base_strength, last_signal_at, feedback, feedback_at, purchase_completed, confidence, state");
  let changed = 0;
  for (const intent of data ?? []) {
    const next = assess({ ...intent, base_strength: Number(intent.base_strength) }, now);
    if (next.state !== intent.state || Math.abs(next.confidence - Number(intent.confidence)) >= 0.01) {
      await supabase.from("intents").update(next).eq("id", intent.id);
      changed++;
    }
  }
  return changed;
}

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
