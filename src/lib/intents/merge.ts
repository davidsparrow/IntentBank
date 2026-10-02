import type { Item } from "./items";
import type { Analysis } from "./schema";

// Turns the model's answer into safe, normalized writes. Nothing the model returns is trusted
// as-is: refs must point at items we sent, categories must be enabled, and anything it flags as
// sensitive is removed everywhere.

export interface MergedIntent {
  key: string;
  label: string;
  category: string;
  explanation: string;
  purchaseHorizon: string;
  commercialValue: "low" | "medium" | "high";
  purchaseCompleted: boolean;
  signalIds: string[];
}

export interface MergeResult {
  intents: MergedIntent[];
  classifications: { signalIds: string[]; category: string }[];
  sensitiveSignalIds: string[];
}

export function intentKey(category: string, rawKey: string): string {
  const slug =
    rawKey
      .toLowerCase()
      .replace(/^[a-z_]+\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "intent";
  return `${category}/${slug}`;
}

export function mergeAnalysis(analysis: Analysis, items: Item[], opts: { disabledCategories: Set<string> }): MergeResult {
  const byRef = new Map(items.map((i) => [i.ref, i]));
  const sensitiveRefs = new Set(analysis.sensitive_items.filter((r) => byRef.has(r)));
  const usable = (ref: number) => byRef.has(ref) && !sensitiveRefs.has(ref);

  const merged = new Map<string, MergedIntent & { refs: Set<number> }>();
  for (const raw of analysis.intents) {
    if (opts.disabledCategories.has(raw.category)) continue;
    const refs = raw.item_refs.filter(usable);
    if (!refs.length) continue;
    const key = intentKey(raw.category, raw.key);
    const existing = merged.get(key);
    if (existing) {
      refs.forEach((r) => existing.refs.add(r));
      continue;
    }
    merged.set(key, {
      key,
      label: raw.label.trim().slice(0, 80) || "Untitled intent",
      category: raw.category,
      explanation: raw.explanation.trim().slice(0, 600),
      purchaseHorizon: raw.purchase_horizon,
      commercialValue: raw.commercial_value,
      purchaseCompleted: raw.purchase_completed,
      signalIds: [],
      refs: new Set(refs),
    });
  }

  const intents: MergedIntent[] = [];
  for (const { refs, ...intent } of merged.values()) {
    const supporting = [...refs].map((r) => byRef.get(r)!);
    const signalCount = supporting.reduce((n, i) => n + i.signalIds.length, 0);
    // One stray page view is not an intent; a stated interest is.
    if (signalCount < 2 && !supporting.some((i) => i.kind === "stated")) continue;
    intents.push({ ...intent, signalIds: supporting.flatMap((i) => i.signalIds) });
  }

  const classifications = analysis.classified_items
    .filter((c) => c.category !== "none" && usable(c.ref) && !byRef.get(c.ref)!.category && !opts.disabledCategories.has(c.category))
    .map((c) => ({ signalIds: byRef.get(c.ref)!.signalIds, category: c.category }));

  return {
    intents,
    classifications,
    sensitiveSignalIds: [...sensitiveRefs].flatMap((r) => byRef.get(r)!.signalIds),
  };
}
