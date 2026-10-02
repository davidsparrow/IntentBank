import { COMMERCIAL_HINT } from "@/lib/classify/rules";
import type { Database } from "@/lib/database.types";
import type { SignalKind } from "@/lib/import/types";

// Deterministic scoring (PRD §11). Claude decides which signals belong together; this module decides
// how strong that evidence is and how it fades. Keeping it out of the model makes decay predictable
// and every number explainable.

export type IntentState = Database["public"]["Enums"]["intent_state"];
export type IntentFeedback = Database["public"]["Enums"]["intent_feedback"];

export interface EvidenceSignal {
  kind: SignalKind;
  occurred_at: string;
  domain: string | null;
  title: string | null;
  query: string | null;
}

const KIND_WEIGHT: Record<SignalKind, number> = {
  stated: 2,
  saved: 1.2,
  search: 1,
  purchase: 1,
  subscription: 0.8,
  visit: 0.6,
  video: 0.5,
};

const DAY = 86_400_000;
// Confidence halves every 21 days without new evidence.
const HALF_LIFE_DAYS = 21;

export interface Strength {
  base: number;
  signalCount: number;
  sourceCount: number;
  firstAt: string | null;
  lastAt: string | null;
}

// Strength of the evidence, ignoring its age. 0–1.
export function evidenceStrength(signals: EvidenceSignal[]): Strength {
  if (!signals.length) return { base: 0, signalCount: 0, sourceCount: 0, firstAt: null, lastAt: null };

  const weight = signals.reduce((sum, s) => sum + KIND_WEIGHT[s.kind], 0);
  const volume = 1 - Math.exp(-weight / 4); // ~0.5 at 3 searches, ~0.9 at 9
  const domains = new Set(signals.map((s) => s.domain).filter(Boolean)).size;
  const kinds = new Set(signals.map((s) => s.kind)).size;
  const diversity = 0.5 * Math.min(1, domains / 4) + 0.5 * Math.min(1, kinds / 3);
  const hints = signals.filter((s) => COMMERCIAL_HINT.test(`${s.query ?? ""} ${s.title ?? ""}`)).length;
  const shopping = Math.min(1, hints / 3);
  const stated = signals.some((s) => s.kind === "stated");

  let base = 0.55 * volume + 0.25 * diversity + 0.2 * shopping;
  if (stated) base = Math.max(base, 0.8); // the user told us directly

  const times = signals.map((s) => Date.parse(s.occurred_at)).sort((a, b) => a - b);
  return {
    base: round(clamp(base, 0.05, 0.99)),
    signalCount: signals.length,
    sourceCount: domains + (stated ? 1 : 0),
    firstAt: new Date(times[0]).toISOString(),
    lastAt: new Date(times[times.length - 1]).toISOString(),
  };
}

export function recencyFactor(lastAt: string | null, now: Date): number {
  if (!lastAt) return 0;
  const days = Math.max(0, (now.getTime() - Date.parse(lastAt)) / DAY);
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

export interface Assessment {
  confidence: number;
  state: IntentState;
}

// Current confidence and lifecycle state. Pure function of stored fields + now, so decay can be
// recomputed at any time without re-running the model.
export function assess(
  intent: {
    base_strength: number;
    last_signal_at: string | null;
    feedback: IntentFeedback | null;
    feedback_at: string | null;
    purchase_completed: boolean;
  },
  now = new Date(),
): Assessment {
  // "Still shopping" counts as fresh evidence from the moment the user said it.
  const freshest =
    intent.feedback === "still_shopping" && intent.feedback_at && (!intent.last_signal_at || intent.feedback_at > intent.last_signal_at)
      ? intent.feedback_at
      : intent.last_signal_at;

  let base = intent.base_strength;
  if (intent.feedback === "still_shopping") base = Math.max(base, 0.8);
  if (intent.feedback === "just_researching") base = Math.min(base, 0.5);

  const confidence = round(clamp(base * recencyFactor(freshest, now), 0, 0.99));

  if (intent.feedback === "not_interested") return { confidence: 0, state: "dismissed" };
  if (intent.feedback === "already_bought" || (intent.purchase_completed && intent.feedback !== "still_shopping")) {
    return { confidence, state: "purchased" };
  }

  const days = freshest ? (now.getTime() - Date.parse(freshest)) / DAY : Infinity;
  let state: IntentState;
  if (days > 90) state = "dormant";
  else if (days > 30) state = "cooling";
  else if (confidence >= 0.75) state = "strong";
  else if (confidence >= 0.5) state = "active";
  else state = "emerging";
  return { confidence, state };
}

// States shown as "active intent" on the dashboard.
export const LIVE_STATES: IntentState[] = ["strong", "active", "emerging"];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n * 1000) / 1000;
