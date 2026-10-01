import type { ParseOutput, ParsedRecord } from "../types";

// Google Takeout (JSON format). Handles:
//  - Chrome/BrowserHistory.json            { "Browser History": [{ title, url, time_usec, page_transition }] }
//  - My Activity/<Product>/MyActivity.json [{ header, title, titleUrl, time, details? }]
//  - YouTube/history/watch-history.json    same shape as My Activity
//  - YouTube/history/search-history.json   same shape as My Activity

interface BrowserHistoryEntry {
  title?: string;
  url?: string;
  time_usec?: number;
  page_transition?: string;
}

interface ActivityEntry {
  header?: string;
  title?: string;
  titleUrl?: string;
  time?: string;
  products?: string[];
  details?: { name?: string }[];
}

// Products whose activity is private communication or precise location — never imported.
const SKIPPED_PRODUCTS = /^(maps|gmail|messages|google messages|assistant|voice|contacts|fit|google fit|takeout|location history|timeline|android|drive|docs|photos)$/i;

export function parseTakeoutJson(text: string, fileName: string): ParseOutput {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { records: [], notes: [`${fileName}: not valid JSON (choose JSON, not HTML, when exporting from Takeout).`] };
  }

  if (data && typeof data === "object" && !Array.isArray(data) && "Browser History" in data) {
    return parseBrowserHistory((data as { "Browser History": BrowserHistoryEntry[] })["Browser History"], fileName);
  }
  if (Array.isArray(data) && data.every((e) => e && typeof e === "object" && "time" in e && "title" in e)) {
    return parseActivity(data as ActivityEntry[], fileName);
  }
  return { records: [], notes: [`${fileName}: not a recognized Takeout file — skipped.`] };
}

function parseBrowserHistory(entries: BrowserHistoryEntry[], fileName: string): ParseOutput {
  const records: ParsedRecord[] = [];
  for (const e of entries ?? []) {
    if (!e.url || !e.time_usec || e.page_transition === "RELOAD") continue;
    records.push({ kind: "visit", occurredAt: new Date(e.time_usec / 1000), url: e.url, title: e.title });
  }
  return { records, notes: [`${fileName}: ${records.length.toLocaleString()} Chrome history entries.`] };
}

function parseActivity(entries: ActivityEntry[], fileName: string): ParseOutput {
  const records: ParsedRecord[] = [];
  let skippedProducts = 0;
  let skippedAds = 0;

  for (const e of entries) {
    const product = e.header ?? e.products?.[0] ?? "";
    if (SKIPPED_PRODUCTS.test(product) || e.products?.some((p) => SKIPPED_PRODUCTS.test(p))) {
      skippedProducts++;
      continue;
    }
    if (e.details?.some((d) => d.name === "From Google Ads")) {
      skippedAds++; // ads the user was shown, not something they sought out
      continue;
    }
    const occurredAt = new Date(e.time ?? "");
    const title = e.title ?? "";
    const url = unwrapGoogleRedirect(e.titleUrl);

    const m = /^(Searched for|Visited|Watched|Viewed|Saved|Subscribed to)\s+(.+)$/.exec(title);
    if (!m) continue;
    const [, verb, rest] = m;
    if (verb === "Searched for") records.push({ kind: "search", occurredAt, query: rest, url });
    else if (verb === "Watched") records.push({ kind: "video", occurredAt, title: rest, url });
    else if (verb === "Saved") records.push({ kind: "saved", occurredAt, title: rest, url });
    else if (verb === "Subscribed to") records.push({ kind: "subscription", occurredAt, title: rest, url });
    else records.push({ kind: "visit", occurredAt, title: rest, url });
  }

  const notes = [`${fileName}: ${records.length.toLocaleString()} activity entries.`];
  if (skippedProducts) notes.push(`${fileName}: skipped ${skippedProducts.toLocaleString()} Maps/Gmail/Assistant-type entries (location & communications are never imported).`);
  if (skippedAds) notes.push(`${fileName}: skipped ${skippedAds.toLocaleString()} ad impressions.`);
  return { records, notes };
}

// My Activity "Visited" links are often https://www.google.com/url?q=<real url>
function unwrapGoogleRedirect(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === "/url") return u.searchParams.get("q") ?? url;
  } catch {
    /* leave as-is */
  }
  return url;
}

// Paths inside a Takeout zip worth reading. Everything else (photos, mail, drive…) is never opened.
export const TAKEOUT_WANTED = /(?:BrowserHistory\.json|MyActivity\.json|watch-history\.json|search-history\.json)$/i;
