// Category taxonomy (PRD §7). Mirrors the `public.categories` seed in
// supabase/migrations/20261001000000_v0_core.sql — taxonomy.test.ts keeps them in sync.

export type CategorySlug =
  | "shopping"
  | "travel"
  | "automotive"
  | "home"
  | "technology"
  | "entertainment"
  | "food"
  | "education"
  | "professional"
  | SensitiveCategorySlug;

export type SensitiveCategorySlug =
  | "health"
  | "precise_location"
  | "finance"
  | "politics"
  | "religion"
  | "sexuality"
  | "children"
  | "private_communications";

export interface Category {
  slug: CategorySlug;
  name: string;
  sensitive: boolean;
}

export const CATEGORIES: readonly Category[] = [
  { slug: "shopping", name: "Shopping", sensitive: false },
  { slug: "travel", name: "Travel", sensitive: false },
  { slug: "automotive", name: "Automotive", sensitive: false },
  { slug: "home", name: "Home", sensitive: false },
  { slug: "technology", name: "Technology", sensitive: false },
  { slug: "entertainment", name: "Entertainment", sensitive: false },
  { slug: "food", name: "Food", sensitive: false },
  { slug: "education", name: "Education", sensitive: false },
  { slug: "professional", name: "Professional interests", sensitive: false },
  { slug: "health", name: "Health", sensitive: true },
  { slug: "precise_location", name: "Precise location", sensitive: true },
  { slug: "finance", name: "Personal finances", sensitive: true },
  { slug: "politics", name: "Political activity", sensitive: true },
  { slug: "religion", name: "Religion", sensitive: true },
  { slug: "sexuality", name: "Sexuality", sensitive: true },
  { slug: "children", name: "Children", sensitive: true },
  { slug: "private_communications", name: "Private communications", sensitive: true },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function getCategory(slug: string): Category | undefined {
  return BY_SLUG.get(slug as CategorySlug);
}

export function isSensitive(slug: string): boolean {
  return BY_SLUG.get(slug as CategorySlug)?.sensitive ?? false;
}

export const COMMERCIAL_CATEGORIES = CATEGORIES.filter((c) => !c.sensitive);
export const SENSITIVE_CATEGORIES = CATEGORIES.filter((c) => c.sensitive);

// PRD §35: three offer modes, Private by default.
export type OfferMode = "private" | "ask" | "auto";

export const OFFER_MODES: readonly { value: OfferMode; label: string; help: string }[] = [
  { value: "private", label: "Private", help: "Never commercialize this category." },
  { value: "ask", label: "Ask me", help: "Show me relevant offers." },
  { value: "auto", label: "Auto", help: "Automatically accept qualifying offers above my rules." },
];
