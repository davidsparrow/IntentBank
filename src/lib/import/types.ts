import type { CategorySlug } from "@/lib/taxonomy";

export type SignalKind = "visit" | "search" | "purchase" | "video" | "saved" | "subscription" | "stated";

export type SourceKind = "google_takeout" | "chrome_history" | "amazon_orders" | "csv" | "manual";

// A record as it comes out of a parser, before privacy filtering and normalization.
export interface ParsedRecord {
  kind: SignalKind;
  occurredAt: Date;
  title?: string | null;
  url?: string | null;
  query?: string | null;
  amountCents?: number | null;
}

// A record ready to upload. Field names match the `signals` table columns.
export interface PreparedSignal {
  kind: SignalKind;
  occurred_at: string;
  title: string | null;
  url: string | null;
  domain: string | null;
  query: string | null;
  amount_cents: number | null;
  category_slug: CategorySlug | null;
  dedupe_key: string;
}

export interface ParseOutput {
  records: ParsedRecord[];
  // Human-readable notes about what was recognized or skipped, shown in the preview.
  notes: string[];
}
