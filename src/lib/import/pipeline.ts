import { ruleCategory } from "@/lib/classify/rules";
import type { CategorySlug, SensitiveCategorySlug } from "@/lib/taxonomy";
import { cleanText, cleanUrl, hash53 } from "./normalize";
import { sensitiveCategory } from "./sensitive";
import type { ParsedRecord, PreparedSignal } from "./types";

export interface PrepareOptions {
  since: Date;
  now?: Date;
  excludedDomains: string[];
  disabledCategories: CategorySlug[];
}

export interface PrepareStats {
  found: number;
  kept: number;
  dropped: {
    outsideWindow: number;
    noise: number;
    sensitive: Partial<Record<SensitiveCategorySlug, number>>;
    excludedDomain: number;
    disabledCategory: number;
    duplicate: number;
  };
  byCategory: Partial<Record<CategorySlug | "unclassified", number>>;
  byKind: Record<string, number>;
  topDomains: [string, number][];
}

export function prepareSignals(records: ParsedRecord[], opts: PrepareOptions): { signals: PreparedSignal[]; stats: PrepareStats } {
  const now = opts.now ?? new Date();
  const latest = now.getTime() + 86_400_000; // tolerate clock skew / timezones
  const excluded = new Set(opts.excludedDomains);
  const disabled = new Set(opts.disabledCategories);
  const out = new Map<string, PreparedSignal>();
  const domains = new Map<string, number>();
  const stats: PrepareStats = {
    found: records.length,
    kept: 0,
    dropped: { outsideWindow: 0, noise: 0, sensitive: {}, excludedDomain: 0, disabledCategory: 0, duplicate: 0 },
    byCategory: {},
    byKind: {},
    topDomains: [],
  };

  for (const r of records) {
    const t = r.occurredAt.getTime();
    if (Number.isNaN(t) || t < opts.since.getTime() || t > latest) {
      stats.dropped.outsideWindow++;
      continue;
    }

    const clean = cleanUrl(r.url);
    if (r.url && !clean && r.kind !== "purchase" && r.kind !== "stated") {
      stats.dropped.noise++;
      continue;
    }
    const query = cleanText(r.query) ?? clean?.query ?? null;
    const kind = r.kind === "visit" && query ? "search" : r.kind;
    const title = cleanText(r.title);
    if (!title && !query && !clean) {
      stats.dropped.noise++;
      continue;
    }

    const sensitive = sensitiveCategory({ domain: clean?.domain, host: clean?.host, title, query, url: clean?.url ?? r.url });
    if (sensitive) {
      stats.dropped.sensitive[sensitive] = (stats.dropped.sensitive[sensitive] ?? 0) + 1;
      continue;
    }
    if (clean && (excluded.has(clean.domain) || excluded.has(clean.host))) {
      stats.dropped.excludedDomain++;
      continue;
    }
    const category = ruleCategory({ domain: clean?.domain, url: clean?.url, title, query });
    if (category && disabled.has(category)) {
      stats.dropped.disabledCategory++;
      continue;
    }

    const occurredAt = new Date(t);
    const signal: PreparedSignal = {
      kind,
      occurred_at: occurredAt.toISOString(),
      title,
      url: clean?.url ?? null,
      domain: clean?.domain ?? null,
      query,
      amount_cents: r.amountCents ?? null,
      category_slug: category,
      dedupe_key: dedupeKey(kind, occurredAt, clean?.url ?? null, query, title, r.amountCents ?? null),
    };
    if (out.has(signal.dedupe_key)) {
      stats.dropped.duplicate++;
      continue;
    }
    out.set(signal.dedupe_key, signal);
    stats.byCategory[category ?? "unclassified"] = (stats.byCategory[category ?? "unclassified"] ?? 0) + 1;
    stats.byKind[kind] = (stats.byKind[kind] ?? 0) + 1;
    if (signal.domain) domains.set(signal.domain, (domains.get(signal.domain) ?? 0) + 1);
  }

  stats.kept = out.size;
  stats.topDomains = [...domains].sort((a, b) => b[1] - a[1]).slice(0, 15);
  return { signals: [...out.values()], stats };
}

// Repeat visits/searches on the same day collapse into one signal; purchases are kept per item.
export function dedupeKey(
  kind: string,
  at: Date,
  url: string | null,
  query: string | null,
  title: string | null,
  amountCents: number | null,
): string {
  const day = at.toISOString().slice(0, 10);
  switch (kind) {
    case "search":
      return hash53(`search|${day}|${query?.toLowerCase()}`);
    case "purchase":
      return hash53(`purchase|${at.toISOString()}|${title}|${amountCents}`);
    case "stated":
      return hash53(`stated|${title?.toLowerCase()}`);
    default:
      return hash53(`${kind}|${day}|${url ?? title}`);
  }
}

export function totalDropped(s: PrepareStats): number {
  const d = s.dropped;
  return (
    d.outsideWindow + d.noise + d.excludedDomain + d.disabledCategory + d.duplicate +
    Object.values(d.sensitive).reduce((a, b) => a + (b ?? 0), 0)
  );
}
