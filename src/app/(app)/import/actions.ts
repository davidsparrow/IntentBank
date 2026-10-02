"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { batchSchema, guardSignals } from "@/lib/import/guard";
import { hash53 } from "@/lib/import/normalize";
import { sensitiveCategory } from "@/lib/import/sensitive";
import { intentKey } from "@/lib/intents/merge";
import { assess, evidenceStrength } from "@/lib/intents/score";
import type { PreparedSignal, SourceKind } from "@/lib/import/types";
import { COMMERCIAL_CATEGORIES, getCategory } from "@/lib/taxonomy";

const SOURCE_LABELS: Record<Exclude<SourceKind, "manual">, string> = {
  google_takeout: "Google Takeout",
  chrome_history: "Browser history",
  amazon_orders: "Amazon orders",
  csv: "CSV upload",
};

async function loadFilters(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]) {
  const [{ data: excluded }, { data: perms }] = await Promise.all([
    supabase.from("excluded_domains").select("domain"),
    supabase.from("category_permissions").select("category_slug, collect"),
  ]);
  return {
    excludedDomains: new Set((excluded ?? []).map((r) => r.domain)),
    disabledCategories: new Set((perms ?? []).filter((p) => !p.collect).map((p) => p.category_slug)),
  };
}

export async function startImport(kind: Exclude<SourceKind, "manual">, fileNames: string[]) {
  const { supabase, userId } = await requireUser();
  const label = `${SOURCE_LABELS[kind]} · ${fileNames.slice(0, 2).join(", ")}${fileNames.length > 2 ? ` +${fileNames.length - 2}` : ""}`;
  const { data, error } = await supabase
    .from("vault_sources")
    .insert({ user_id: userId, kind, label: label.slice(0, 200) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { sourceId: data.id };
}

const sourceIdSchema = z.uuid();

export async function uploadSignals(sourceId: string, batch: PreparedSignal[]) {
  const { supabase, userId } = await requireUser();
  sourceIdSchema.parse(sourceId);
  const parsed = batchSchema.safeParse(batch);
  if (!parsed.success) throw new Error(`Invalid signal batch: ${parsed.error.issues[0]?.message}`);

  const { allowed, rejected } = guardSignals(parsed.data, await loadFilters(supabase));
  if (!allowed.length) return { inserted: 0, duplicates: 0, rejected };

  const rows = allowed.map((s) => ({
    ...s,
    user_id: userId,
    source_id: sourceId,
    classified_by: s.category_slug ? ("rule" as const) : null,
  }));
  const { data, error } = await supabase
    .from("signals")
    .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  const inserted = data?.length ?? 0;
  return { inserted, duplicates: allowed.length - inserted, rejected };
}

const finishSchema = z.object({
  droppedSensitive: z.number().int().min(0),
  droppedExcluded: z.number().int().min(0),
  found: z.number().int().min(0),
  duplicates: z.number().int().min(0),
  rejectedByServer: z.number().int().min(0),
});

export async function finishImport(sourceId: string, summary: z.infer<typeof finishSchema>) {
  const { supabase, userId } = await requireUser();
  sourceIdSchema.parse(sourceId);
  const s = finishSchema.parse(summary);
  const { count } = await supabase.from("signals").select("*", { count: "exact", head: true }).eq("source_id", sourceId);
  // A re-import that added nothing new leaves no empty source behind; the audit event still records it.
  const sources = supabase.from("vault_sources");
  const { error } = count
    ? await sources
        .update({
          status: "imported",
          signal_count: count,
          dropped_sensitive_count: s.droppedSensitive + s.rejectedByServer,
          dropped_excluded_count: s.droppedExcluded,
        })
        .eq("id", sourceId)
    : await sources.delete().eq("id", sourceId);
  if (error) throw new Error(error.message);
  await supabase.from("audit_events").insert({
    user_id: userId,
    actor: "user",
    action: "source.imported",
    subject_type: "vault_source",
    subject_id: sourceId,
    details: { ...s, stored: count ?? 0 },
  });
  revalidatePath("/import");
  revalidatePath("/bank");
  return { stored: count ?? 0 };
}

export async function failImport(sourceId: string, message: string) {
  const { supabase } = await requireUser();
  sourceIdSchema.parse(sourceId);
  await supabase.from("vault_sources").update({ status: "error", error: message.slice(0, 500) }).eq("id", sourceId);
  revalidatePath("/import");
}

export async function deleteSource(sourceId: string) {
  const { supabase, userId } = await requireUser();
  sourceIdSchema.parse(sourceId);
  const { data, error } = await supabase
    .from("vault_sources")
    .delete()
    .eq("id", sourceId)
    .select("kind, label, signal_count")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("audit_events").insert({
    user_id: userId,
    actor: "user",
    action: "source.deleted",
    subject_type: "vault_source",
    subject_id: sourceId,
    details: { kind: data.kind, label: data.label, signals_deleted: data.signal_count },
  });
  revalidatePath("/import");
  revalidatePath("/bank");
}

export type ManualState = { error?: string; message?: string };

const manualSchema = z.object({
  text: z.string().trim().min(3, "Describe it in a few words.").max(200),
  category: z.enum(COMMERCIAL_CATEGORIES.map((c) => c.slug) as [string, ...string[]], "Pick a category."),
  horizon: z.enum(["now", "soon", "someday"]).default("soon"),
});

const HORIZON_LABEL = { now: "buying now", soon: "next few months", someday: "someday" } as const;
const HORIZON_RANGE = { now: "0-30 days", soon: "1-3 months", someday: "6+ months" } as const;

export async function addManualInterest(_: ManualState, form: FormData): Promise<ManualState> {
  const { supabase, userId } = await requireUser();
  const parsed = manualSchema.safeParse({
    text: form.get("text"),
    category: form.get("category"),
    horizon: form.get("horizon") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { text, category, horizon } = parsed.data;

  const sensitive = sensitiveCategory({ title: text });
  if (sensitive) {
    return { error: `That looks like ${getCategory(sensitive)?.name.toLowerCase()}, which IntentBank never stores.` };
  }
  const { disabledCategories } = await loadFilters(supabase);
  if (disabledCategories.has(category)) {
    return { error: `Collection is turned off for ${getCategory(category)?.name}. Turn it on in Settings first.` };
  }

  // One "Manual interests" source per user, created on first use.
  let { data: source } = await supabase.from("vault_sources").select("id").eq("kind", "manual").maybeSingle();
  if (!source) {
    const created = await supabase
      .from("vault_sources")
      .insert({ user_id: userId, kind: "manual", label: "Manual interests", status: "imported" })
      .select("id")
      .single();
    if (created.error) return { error: created.error.message };
    source = created.data;
  }

  const title = `${text} (${HORIZON_LABEL[horizon]})`;
  const occurredAt = new Date().toISOString();
  const { data: signal, error } = await supabase.from("signals").insert({
    user_id: userId,
    source_id: source.id,
    kind: "stated",
    occurred_at: occurredAt,
    title,
    category_slug: category,
    classified_by: "user",
    dedupe_key: hash53(`stated|${text.toLowerCase()}`),
  }).select("id").single();
  if (error) {
    return { error: error.code === "23505" ? "You've already added that interest." : error.message };
  }

  // A stated interest is a user-confirmed intent right away — no model call needed. Later analyses
  // see its key and fold related activity into it.
  const key = intentKey(category, text);
  const { data: existingIntent } = await supabase.from("intents").select("id").eq("key", key).maybeSingle();
  let intentId = existingIntent?.id;
  if (intentId) {
    await supabase.from("intents").update({ user_confirmed: true }).eq("id", intentId);
  } else {
    const strength = evidenceStrength([{ kind: "stated", occurred_at: occurredAt, domain: null, title, query: null }]);
    const scored = assess({ base_strength: strength.base, last_signal_at: occurredAt, feedback: null, feedback_at: null, purchase_completed: false });
    const created = await supabase
      .from("intents")
      .insert({
        user_id: userId,
        key,
        category_slug: category,
        label: text.charAt(0).toUpperCase() + text.slice(1, 80),
        explanation: `You told IntentBank you're interested in this (${HORIZON_LABEL[horizon]}).`,
        purchase_horizon: HORIZON_RANGE[horizon],
        derived_by: "user",
        user_confirmed: true,
        base_strength: strength.base,
        ...scored,
        signal_count: 1,
        source_count: 1,
        first_signal_at: occurredAt,
        last_signal_at: occurredAt,
      })
      .select("id")
      .single();
    if (created.error) return { error: created.error.message };
    intentId = created.data.id;
  }
  await supabase.from("intent_signals").insert({ intent_id: intentId, signal_id: signal.id, user_id: userId });

  const { count } = await supabase.from("signals").select("*", { count: "exact", head: true }).eq("source_id", source.id);
  await supabase.from("vault_sources").update({ signal_count: count ?? 0 }).eq("id", source.id);
  await supabase.from("audit_events").insert({
    user_id: userId,
    actor: "user",
    action: "signal.stated",
    subject_type: "vault_source",
    subject_id: source.id,
    details: { category },
  });
  revalidatePath("/import");
  revalidatePath("/bank");
  return { message: `Added “${text}”.` };
}
