import { describe, expect, it } from "vitest";
import { batchSchema, guardSignals } from "./guard";
import type { PreparedSignal } from "./types";

const base: PreparedSignal = {
  kind: "visit",
  occurred_at: "2026-09-01T10:00:00.000Z",
  title: "Rivian R2 review",
  url: "https://www.edmunds.com/rivian/r2",
  domain: "edmunds.com",
  query: null,
  amount_cents: null,
  category_slug: "automotive",
  dedupe_key: "abc123",
};
const ctx = { excludedDomains: new Set(["reddit.com"]), disabledCategories: new Set(["food"]) };

describe("guardSignals", () => {
  it("allows clean signals", () => {
    expect(guardSignals([base], ctx)).toEqual({ allowed: [base], rejected: 0 });
  });

  it.each<Partial<PreparedSignal>>([
    { title: "Chemo side effects" },
    { query: "bankruptcy lawyer", kind: "search" },
    { url: "https://mail.google.com/mail/u/0", domain: "google.com" },
    { url: "https://old.reddit.com/r/x", domain: "reddit.com" },
    { category_slug: "food" },
  ])("rejects tampered/disallowed %o", (patch) => {
    expect(guardSignals([{ ...base, ...patch }], ctx).rejected).toBe(1);
  });
});

describe("batchSchema", () => {
  it("rejects sensitive category slugs, bad URLs and oversized batches", () => {
    expect(batchSchema.safeParse([{ ...base, category_slug: "health" }]).success).toBe(false);
    expect(batchSchema.safeParse([{ ...base, url: "javascript:alert(1)" }]).success).toBe(false);
    expect(batchSchema.safeParse(Array(501).fill(base)).success).toBe(false);
    expect(batchSchema.safeParse([base]).success).toBe(true);
  });
});
