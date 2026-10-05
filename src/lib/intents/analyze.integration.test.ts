import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import type { Item } from "./items";
import type { Analysis } from "./schema";

// The model is stubbed: this verifies everything around it (RLS-scoped reads and writes, merge,
// scoring, deletion of flagged signals, key stability, decay) against the real database.
const modelAnswer = vi.fn<(items: Item[]) => Analysis>();
vi.mock("./model", () => ({
  INTENT_MODEL: "stub-model",
  ModelRefusalError: class extends Error {},
  runIntentModel: async (items: Item[]) => ({ analysis: modelAnswer(items), usage: { input: 1234, output: 56 } }),
}));
const { analyzeIntents, refreshDecay } = await import("./analyze");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
let user: SupabaseClient<Database>;
let uid: string;
let sourceId: string;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const refOf = (items: Item[], text: RegExp) => items.find((i) => text.test(i.text))!.ref;

beforeAll(async () => {
  const email = `ib-int-${Date.now()}@example.com`;
  const password = `int-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  uid = data.user.id;
  user = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  await user.auth.signInWithPassword({ email, password });

  const src = await user.from("vault_sources").insert({ user_id: uid, kind: "csv", label: "fixture", status: "imported" }).select("id").single();
  sourceId = src.data!.id;
  const rows = [
    { kind: "search", query: "best induction range", category_slug: "home", d: 3 },
    { kind: "search", query: "bosch vs miele induction", category_slug: "home", d: 2 },
    { kind: "visit", title: "Bosch 800 Series Induction", domain: "bosch-home.com", category_slug: "home", d: 2 },
    { kind: "visit", title: "Why we switched from gas", domain: "kitchen-blog.example", category_slug: null, d: 4 },
    { kind: "visit", title: "Clinic appointment booking", domain: "neighborhood-care.example", category_slug: null, d: 1 },
    { kind: "search", query: "cheap flights to reykjavik", category_slug: "travel", d: 10 },
    { kind: "visit", title: "Icelandair flights", domain: "icelandair.com", category_slug: "travel", d: 9 },
  ] as const;
  const { error: sigErr } = await user.from("signals").insert(
    rows.map((r, i) => ({
      user_id: uid,
      source_id: sourceId,
      kind: r.kind,
      occurred_at: daysAgo(r.d),
      title: "title" in r ? r.title : null,
      query: "query" in r ? r.query : null,
      domain: "domain" in r ? r.domain : null,
      category_slug: r.category_slug,
      classified_by: r.category_slug ? ("rule" as const) : null,
      dedupe_key: `int-${i}`,
    })),
  );
  if (sigErr) throw sigErr;
  await user.from("vault_sources").update({ signal_count: rows.length }).eq("id", sourceId);
});

afterAll(async () => {
  if (uid) await admin.auth.admin.deleteUser(uid);
});

describe("analyzeIntents (integration)", () => {
  it("writes scored intents, links evidence, classifies and deletes flagged signals", async () => {
    modelAnswer.mockImplementation((items) => ({
      intents: [
        {
          key: "induction-range",
          label: "Premium Induction Range",
          category: "home",
          item_refs: [refOf(items, /best induction/), refOf(items, /bosch vs/), refOf(items, /Bosch 800/), refOf(items, /switched from gas/)],
          explanation: "You compared Bosch and Miele induction ranges.",
          purchase_horizon: "0-30 days",
          commercial_value: "high",
          purchase_completed: false,
        },
        {
          key: "iceland-trip",
          label: "Iceland Trip",
          category: "travel",
          item_refs: [refOf(items, /reykjavik/), refOf(items, /Icelandair/)],
          explanation: "You searched for flights to Reykjavik.",
          purchase_horizon: "1-3 months",
          commercial_value: "medium",
          purchase_completed: false,
        },
      ],
      classified_items: [{ ref: refOf(items, /switched from gas/), category: "home" }],
      sensitive_items: [refOf(items, /Clinic appointment/)],
    }));

    const summary = await analyzeIntents(user, uid);
    expect(summary).toMatchObject({ intents: 2, itemsSent: 7, classified: 1, removed: 1 });

    const { data: intents } = await user.from("intents").select("*").order("key");
    expect(intents!.map((i) => [i.key, i.state, i.signal_count])).toEqual([
      ["home/induction-range", "active", 4], // 4 signals: active, not yet strong (PRD §12 calibration)
      ["travel/iceland-trip", expect.stringMatching(/active|emerging/), 2],
    ]);
    expect(Number(intents![0].confidence)).toBeGreaterThanOrEqual(0.5);

    const { count: links } = await user.from("intent_signals").select("*", { count: "exact", head: true });
    expect(links).toBe(6);

    const { data: blog } = await user.from("signals").select("category_slug, classified_by").eq("domain", "kitchen-blog.example").single();
    expect(blog).toEqual({ category_slug: "home", classified_by: "ai" });

    const { count: clinic } = await user.from("signals").select("*", { count: "exact", head: true }).eq("domain", "neighborhood-care.example");
    expect(clinic).toBe(0);
    const { data: source } = await user.from("vault_sources").select("status, signal_count, dropped_sensitive_count").eq("id", sourceId).single();
    expect(source).toEqual({ status: "ready", signal_count: 6, dropped_sensitive_count: 1 });

    const { data: run } = await user.from("analysis_runs").select("status, input_tokens, output_tokens, model").single();
    expect(run).toEqual({ status: "succeeded", input_tokens: 1234, output_tokens: 56, model: "stub-model" });
  });

  it("keeps user feedback across re-analysis and drops stale AI intents", async () => {
    const at = new Date().toISOString();
    await user.from("intents").update({ feedback: "already_bought", feedback_at: at }).eq("key", "travel/iceland-trip");
    // Next run: the model only returns the induction intent, using the existing key.
    modelAnswer.mockImplementation((items) => ({
      intents: [
        {
          key: "home/induction-range",
          label: "Induction Range",
          category: "home",
          item_refs: items.filter((i) => i.category === "home").map((i) => i.ref),
          explanation: "Still comparing induction ranges.",
          purchase_horizon: "0-30 days",
          commercial_value: "high",
          purchase_completed: false,
        },
      ],
      classified_items: [],
      sensitive_items: [],
    }));
    // Nothing new since the last run: refused as a cooldown, then allowed once it has passed.
    await expect(analyzeIntents(user, uid)).rejects.toThrow(/just analyzed/);
    await user.from("analysis_runs").update({ started_at: daysAgo(1) }).neq("model", "");
    await analyzeIntents(user, uid);
    const { data } = await user.from("intents").select("key, label, state, feedback").order("key");
    expect(data).toEqual([
      { key: "home/induction-range", label: "Induction Range", state: "active", feedback: null },
      // Not returned by the model, but kept because the person weighed in.
      { key: "travel/iceland-trip", label: "Iceland Trip", state: "purchased", feedback: "already_bought" },
    ]);
  });

  it("allows only one analysis at a time", async () => {
    await user.from("analysis_runs").update({ started_at: daysAgo(1) }).neq("model", "");
    const { data } = await user.from("analysis_runs").insert({ user_id: uid, model: "x", started_at: daysAgo(0.001) }).select("id").single();
    await expect(analyzeIntents(user, uid)).rejects.toThrow(/already running/);
    await user.from("analysis_runs").update({ status: "failed" }).eq("id", data!.id);
  });

  it("decays confidence over time without re-running the model", async () => {
    await user.from("intents").update({ last_signal_at: daysAgo(100) }).eq("key", "home/induction-range");
    expect(await refreshDecay(user)).toBeGreaterThanOrEqual(1);
    const { data } = await user.from("intents").select("state, confidence").eq("key", "home/induction-range").single();
    expect(data!.state).toBe("dormant");
    expect(Number(data!.confidence)).toBeLessThan(0.1);
  });
});
