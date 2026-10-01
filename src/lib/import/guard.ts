import { z } from "zod";
import { COMMERCIAL_CATEGORIES, type CategorySlug } from "@/lib/taxonomy";
import { sensitiveCategory } from "./sensitive";
import type { PreparedSignal } from "./types";

// Server-side re-check of browser-prepared signals. The browser filter is a convenience; this is
// the enforcement point (plus the DB trigger for categories).

export const MAX_BATCH = 500;

const commercialSlugs = COMMERCIAL_CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]];

const signalSchema = z.object({
  kind: z.enum(["visit", "search", "purchase", "video", "saved", "subscription", "stated"]),
  occurred_at: z.iso.datetime(),
  title: z.string().max(300).nullable(),
  url: z.url({ protocol: /^https?$/ }).max(500).nullable(),
  domain: z.string().max(253).regex(/^[a-z0-9.-]+$/).nullable(),
  query: z.string().max(300).nullable(),
  amount_cents: z.number().int().min(0).max(100_000_000).nullable(),
  category_slug: z.enum(commercialSlugs).nullable(),
  dedupe_key: z.string().min(1).max(32),
});

export const batchSchema = z.array(signalSchema).max(MAX_BATCH);

export function guardSignals(
  signals: PreparedSignal[],
  ctx: { excludedDomains: Set<string>; disabledCategories: Set<string> },
): { allowed: PreparedSignal[]; rejected: number } {
  const allowed: PreparedSignal[] = [];
  let rejected = 0;
  for (const s of signals) {
    let host: string | null = null;
    if (s.url) {
      try {
        host = new URL(s.url).hostname;
      } catch {
        /* validated by schema */
      }
    }
    const blocked =
      sensitiveCategory({ domain: s.domain, host, title: s.title, query: s.query, url: s.url }) !== null ||
      (s.domain !== null && ctx.excludedDomains.has(s.domain)) ||
      (host !== null && ctx.excludedDomains.has(host)) ||
      (s.category_slug !== null && ctx.disabledCategories.has(s.category_slug));
    if (blocked) rejected++;
    else allowed.push(s);
  }
  return { allowed, rejected };
}
