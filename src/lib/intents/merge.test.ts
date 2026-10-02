import { describe, expect, it } from "vitest";
import { type StoredSignal, buildItems, renderItems } from "./items";
import { intentKey, mergeAnalysis } from "./merge";
import type { Analysis } from "./schema";

const s = (id: string, kind: StoredSignal["kind"], day: number, extra: Partial<StoredSignal> = {}): StoredSignal => ({
  id,
  kind,
  occurred_at: `2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`,
  domain: null,
  title: null,
  query: null,
  category_slug: null,
  ...extra,
});

const signals: StoredSignal[] = [
  s("s1", "search", 1, { query: "best induction range", category_slug: "home", domain: "google.com" }),
  s("s2", "search", 2, { query: "Best Induction Range", category_slug: "home", domain: "google.com" }), // same query → same item
  s("s3", "visit", 3, { domain: "bosch-home.com", title: "Bosch 800 induction", category_slug: "home" }),
  s("s4", "visit", 4, { domain: "example-blog.com", title: "Why we switched from gas" }),
  s("s5", "visit", 5, { domain: "randomclinic.example", title: "Booking page" }),
  s("s6", "stated", 6, { title: "Electric cargo bike (next few months)", category_slug: "automotive" }),
  s("s7", "visit", 7, { domain: "news.example", title: "Morning news" }),
];

describe("buildItems", () => {
  const items = buildItems(signals);

  it("collapses repeats and numbers items oldest first", () => {
    expect(items).toHaveLength(6);
    expect(items[0]).toMatchObject({ ref: 1, kind: "search", count: 2, last: "2026-09-02", signalIds: ["s1", "s2"] });
  });

  it("keeps the most informative items when over budget", () => {
    const top = buildItems(signals, 2);
    expect(top.map((i) => i.kind).sort()).toEqual(["search", "stated"]);
  });

  it("renders only approved fields", () => {
    const text = renderItems(items);
    expect(text.split("\n")[0]).toBe("ref\tkind\tlast_seen\tcount\tdomain\tcategory\ttext");
    expect(text).toContain("1\tsearch\t2026-09-02\t2\tgoogle.com\thome\tbest induction range");
    expect(text).not.toMatch(/s1|https?:/);
  });
});

describe("mergeAnalysis", () => {
  const items = buildItems(signals);
  const ref = (id: string) => items.find((i) => i.signalIds.includes(id))!.ref;
  const intent = (over: Partial<Analysis["intents"][number]>): Analysis["intents"][number] => ({
    key: "induction-range",
    label: "Premium Induction Range",
    category: "home",
    item_refs: [],
    explanation: "You searched for induction ranges and compared Bosch models.",
    purchase_horizon: "0-30 days",
    commercial_value: "high",
    purchase_completed: false,
    ...over,
  });

  const analysis: Analysis = {
    intents: [
      intent({ item_refs: [ref("s1"), ref("s3"), ref("s4"), 999] }),
      intent({ key: "home/Induction Range!", item_refs: [ref("s4")] }), // duplicate key after normalization
      intent({ key: "cargo-bike", label: "Electric Cargo Bike", category: "automotive", item_refs: [ref("s6")] }),
      intent({ key: "news", label: "News", category: "entertainment", item_refs: [ref("s7")] }), // one stray visit
      intent({ key: "dinner", label: "Dinner", category: "food", item_refs: [ref("s1"), ref("s3")] }), // disabled category
      intent({ key: "clinic", label: "Clinic", category: "shopping", item_refs: [ref("s5")] }), // only sensitive evidence
    ],
    classified_items: [
      { ref: ref("s4"), category: "home" },
      { ref: ref("s7"), category: "none" },
      { ref: ref("s3"), category: "technology" }, // already rule-classified: ignored
    ],
    sensitive_items: [ref("s5"), 12345],
  };

  const result = mergeAnalysis(analysis, items, { disabledCategories: new Set(["food"]) });

  it("normalizes keys, merges duplicates and drops unknown refs", () => {
    expect(result.intents.map((i) => i.key)).toEqual(["home/induction-range", "automotive/cargo-bike"]);
    expect(result.intents[0].signalIds.sort()).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("requires real evidence and respects disabled categories", () => {
    expect(result.intents.some((i) => i.category === "food" || i.key.endsWith("/news") || i.key.endsWith("/clinic"))).toBe(false);
    expect(result.intents.find((i) => i.key === "automotive/cargo-bike")?.signalIds).toEqual(["s6"]); // stated alone is enough
  });

  it("only classifies unclassified items and removes sensitive ones", () => {
    expect(result.classifications).toEqual([{ signalIds: ["s4"], category: "home" }]);
    expect(result.sensitiveSignalIds).toEqual(["s5"]);
  });

  it("builds keys safely", () => {
    expect(intentKey("travel", "Iceland Trip 2026")).toBe("travel/iceland-trip-2026");
    expect(intentKey("travel", "travel/iceland-trip")).toBe("travel/iceland-trip");
    expect(intentKey("travel", "!!!")).toBe("travel/intent");
  });
});
