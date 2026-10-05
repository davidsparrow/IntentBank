import type { SignalKind } from "@/lib/import/types";

// Collapses raw signals into compact "items" for the model: repeated searches and visits become one
// line with a count. Only the fields approved for model input are carried: kind, date, domain,
// title or search text, and the rule category. Never URLs paths, amounts or IDs.

export interface StoredSignal {
  id: string;
  kind: SignalKind;
  occurred_at: string;
  domain: string | null;
  title: string | null;
  query: string | null;
  category_slug: string | null;
}

export interface Item {
  ref: number;
  kind: SignalKind;
  text: string;
  domain: string | null;
  count: number;
  last: string; // YYYY-MM-DD
  category: string | null;
  signalIds: string[];
}

export const MAX_ITEMS = 1500;

const PRIORITY: Record<SignalKind, number> = { stated: 0, purchase: 1, search: 2, saved: 3, subscription: 3, visit: 4, video: 4 };

export function buildItems(signals: StoredSignal[], max = MAX_ITEMS): Item[] {
  const groups = new Map<string, Omit<Item, "ref">>();
  for (const s of signals) {
    const text = (s.query ?? s.title ?? s.domain ?? "").trim();
    if (!text) continue;
    const key =
      s.kind === "stated" || s.kind === "purchase"
        ? `${s.kind}|${s.id}`
        : s.kind === "search"
          ? `search|${text.toLowerCase()}`
          : `${s.kind}|${s.domain}|${text.toLowerCase()}`;
    const day = s.occurred_at.slice(0, 10);
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.signalIds.push(s.id);
      if (day > g.last) g.last = day;
      g.category ??= s.category_slug;
    } else {
      groups.set(key, { kind: s.kind, text: text.slice(0, 160), domain: s.domain, count: 1, last: day, category: s.category_slug, signalIds: [s.id] });
    }
  }

  // Keep the most informative items when over budget: deliberate actions first, then classified
  // browsing, then everything else; more frequent and more recent first within each tier.
  const tier = (i: Omit<Item, "ref">) => PRIORITY[i.kind] + (i.category ? 0 : 2);
  const kept = [...groups.values()]
    .sort((a, b) => tier(a) - tier(b) || b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, max);

  return kept.sort((a, b) => a.last.localeCompare(b.last)).map((item, i) => ({ ...item, ref: i + 1 }));
}

// One line per item: ref, kind, last date, count, domain, rule category, text. Tabs keep it compact.
export function renderItems(items: Item[]): string {
  const clean = (s: string) => s.replace(/[\t\n\r]+/g, " ");
  return [
    "ref\tkind\tlast_seen\tcount\tdomain\tcategory\ttext",
    ...items.map((i) => [i.ref, i.kind, i.last, i.count, i.domain ?? "-", i.category ?? "?", clean(i.text)].join("\t")),
  ].join("\n");
}
