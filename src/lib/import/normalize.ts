// URL minimization: we keep origin + path only. Query strings and fragments routinely carry
// session tokens, emails and tracking IDs, so they are dropped — except a search term, which is
// lifted into its own field.

const SEARCH_PARAMS: { host: RegExp; path?: RegExp; param: string }[] = [
  { host: /(^|\.)google\.[a-z.]+$/, path: /^\/search/, param: "q" },
  { host: /(^|\.)bing\.com$/, path: /^\/search/, param: "q" },
  { host: /(^|\.)duckduckgo\.com$/, param: "q" },
  { host: /(^|\.)search\.yahoo\.com$/, param: "p" },
  { host: /(^|\.)search\.brave\.com$/, param: "q" },
  { host: /(^|\.)ecosia\.org$/, param: "q" },
  { host: /(^|\.)youtube\.com$/, path: /^\/results/, param: "search_query" },
  { host: /(^|\.)amazon\.[a-z.]+$/, path: /^\/s\b/, param: "k" },
  { host: /(^|\.)ebay\.[a-z.]+$/, path: /^\/sch\//, param: "_nkw" },
  { host: /(^|\.)reddit\.com$/, path: /^\/search/, param: "q" },
];

// Hosts that are never useful as intent and are often private.
const NOISE_HOST = [
  /^localhost$/,
  /^\d{1,3}(\.\d{1,3}){3}$/, // raw IPs
  /\.local$/,
  /\.internal$/,
  /^accounts\.google\.com$/,
  /^login\./,
  /^auth\./,
  /^sso\./,
  /^(www\.)?intentbank\.net$/,
];

export interface CleanUrl {
  url: string;
  host: string;
  domain: string;
  query: string | null;
}

export function cleanUrl(raw: string | null | undefined): CleanUrl | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (NOISE_HOST.some((re) => re.test(host))) return null;

  let query: string | null = null;
  for (const s of SEARCH_PARAMS) {
    if (s.host.test(host) && (!s.path || s.path.test(u.pathname))) {
      const q = u.searchParams.get(s.param)?.trim();
      if (q) query = q.slice(0, 300);
      break;
    }
  }

  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : "";
  return { url: `${u.protocol}//${host}${path}`.slice(0, 500), host, domain: registrableDomain(host), query };
}

// Good-enough eTLD+1 without shipping the public-suffix list: handles common two-part suffixes.
const TWO_PART_SUFFIX = /\.(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/;
export function registrableDomain(host: string): string {
  const h = host.replace(/^www\./, "");
  const parts = h.split(".");
  const keep = TWO_PART_SUFFIX.test(h) ? 3 : 2;
  return parts.slice(-keep).join(".");
}

export function normalizeDomainInput(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  try {
    return registrableDomain(new URL(s.includes("://") ? s : `https://${s}`).hostname);
  } catch {
    return null;
  }
}

export function cleanText(s: string | null | undefined, max = 300): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

// cyrb53: fast, stable 53-bit string hash. Collisions only matter within one user's vault.
export function hash53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
