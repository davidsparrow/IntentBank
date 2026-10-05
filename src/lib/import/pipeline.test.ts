import { describe, expect, it } from "vitest";
import { prepareSignals } from "./pipeline";
import type { ParsedRecord } from "./types";

const now = new Date("2026-10-01T00:00:00Z");
const at = (iso: string) => new Date(iso);
const opts = { since: at("2026-04-01T00:00:00Z"), now, excludedDomains: ["reddit.com"], disabledCategories: ["food" as const] };

describe("prepareSignals", () => {
  const records: ParsedRecord[] = [
    { kind: "visit", occurredAt: at("2026-09-01T10:00:00Z"), url: "https://www.edmunds.com/rivian/r2/?utm=x", title: "Rivian R2 review" },
    { kind: "visit", occurredAt: at("2026-09-01T18:00:00Z"), url: "https://www.edmunds.com/rivian/r2/", title: "Rivian R2 review" }, // same day → dup
    { kind: "visit", occurredAt: at("2026-09-02T10:00:00Z"), url: "https://www.google.com/search?q=rivian+r2+lease+deals" },
    { kind: "visit", occurredAt: at("2026-09-02T11:00:00Z"), url: "https://www.webmd.com/a", title: "Migraine" },
    { kind: "search", occurredAt: at("2026-09-02T11:00:00Z"), query: "how to get out of debt" },
    { kind: "visit", occurredAt: at("2026-09-03T11:00:00Z"), url: "https://old.reddit.com/r/rivian", title: "r/rivian" },
    { kind: "visit", occurredAt: at("2026-09-03T12:00:00Z"), url: "https://www.allrecipes.com/x", title: "Pasta" },
    { kind: "visit", occurredAt: at("2026-09-03T13:00:00Z"), url: "chrome://newtab" },
    { kind: "visit", occurredAt: at("2025-01-01T00:00:00Z"), url: "https://www.kayak.com/" },
    { kind: "purchase", occurredAt: at("2026-08-14T18:22:10Z"), url: "https://amazon.com/dp/B0ABCDEFGH", title: "Bosch Induction Cooktop", amountCents: 21599 },
  ];

  const { signals, stats } = prepareSignals(records, opts);

  it("keeps clean, categorized signals", () => {
    expect(signals.map((s) => [s.kind, s.category_slug, s.url ?? s.query])).toEqual([
      ["visit", "automotive", "https://www.edmunds.com/rivian/r2"],
      ["search", "automotive", "https://www.google.com/search"],
      ["purchase", "home", "https://amazon.com/dp/B0ABCDEFGH"],
    ]);
    expect(signals[1].query).toBe("rivian r2 lease deals");
  });

  it("never lets sensitive content through and accounts for every drop", () => {
    expect(JSON.stringify(signals)).not.toMatch(/webmd|debt|Migraine/i);
    expect(stats.dropped).toEqual({
      outsideWindow: 1,
      noise: 1,
      sensitive: { health: 1, finance: 1 },
      excludedDomain: 1,
      disabledCategory: 1,
      duplicate: 1,
    });
    expect(stats.found).toBe(records.length);
    expect(stats.kept).toBe(3);
  });

  it("produces stable dedupe keys", () => {
    expect(prepareSignals(records, opts).signals.map((s) => s.dedupe_key)).toEqual(signals.map((s) => s.dedupe_key));
  });
});
