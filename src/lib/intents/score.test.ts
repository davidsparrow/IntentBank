import { describe, expect, it } from "vitest";
import { type EvidenceSignal, assess, evidenceStrength, recencyFactor } from "./score";

const now = new Date("2026-10-01T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const sig = (kind: EvidenceSignal["kind"], d: number, extra: Partial<EvidenceSignal> = {}): EvidenceSignal => ({
  kind,
  occurred_at: daysAgo(d),
  domain: null,
  title: null,
  query: null,
  ...extra,
});

describe("evidenceStrength", () => {
  it("grows with volume, diversity and shopping language", () => {
    const weak = evidenceStrength([sig("visit", 3, { domain: "a.com" })]);
    const strong = evidenceStrength([
      sig("search", 2, { query: "best induction range" }),
      sig("search", 3, { query: "bosch vs miele induction" }),
      sig("visit", 3, { domain: "bosch-home.com" }),
      sig("visit", 4, { domain: "mieleusa.com" }),
      sig("visit", 5, { domain: "ajmadison.com", title: "Induction range price" }),
      sig("video", 6, { domain: "youtube.com" }),
    ]);
    expect(weak.base).toBeLessThan(0.3);
    expect(strong.base).toBeGreaterThan(0.75);
    expect(strong.sourceCount).toBe(4);
    expect(strong.firstAt).toBe(daysAgo(6));
    expect(strong.lastAt).toBe(daysAgo(2));
  });

  it("treats a stated interest as strong evidence on its own", () => {
    expect(evidenceStrength([sig("stated", 0)]).base).toBeGreaterThanOrEqual(0.8);
  });
});

describe("recencyFactor", () => {
  it("halves every 21 days", () => {
    expect(recencyFactor(daysAgo(0), now)).toBe(1);
    expect(recencyFactor(daysAgo(21), now)).toBeCloseTo(0.5);
    expect(recencyFactor(null, now)).toBe(0);
  });
});

describe("assess", () => {
  const base = { base_strength: 0.9, last_signal_at: daysAgo(2), feedback: null, feedback_at: null, purchase_completed: false };

  it("moves through the lifecycle as evidence ages", () => {
    expect(assess(base, now).state).toBe("strong");
    expect(assess({ ...base, last_signal_at: daysAgo(12) }, now).state).toBe("active");
    expect(assess({ ...base, base_strength: 0.4 }, now).state).toBe("emerging");
    expect(assess({ ...base, last_signal_at: daysAgo(45) }, now).state).toBe("cooling");
    expect(assess({ ...base, last_signal_at: daysAgo(120) }, now).state).toBe("dormant");
  });

  it("honors user feedback", () => {
    expect(assess({ ...base, feedback: "not_interested" }, now)).toEqual({ confidence: 0, state: "dismissed" });
    expect(assess({ ...base, feedback: "already_bought" }, now).state).toBe("purchased");
    expect(assess({ ...base, purchase_completed: true }, now).state).toBe("purchased");
    expect(assess({ ...base, feedback: "just_researching" }, now).confidence).toBeLessThanOrEqual(0.5);
    // "Still shopping" revives an old intent from the time the user said it.
    const revived = assess({ ...base, base_strength: 0.3, last_signal_at: daysAgo(100), feedback: "still_shopping", feedback_at: daysAgo(1) }, now);
    expect(revived.state).toBe("strong");
    expect(assess({ ...base, purchase_completed: true, feedback: "still_shopping", feedback_at: daysAgo(1) }, now).state).toBe("strong");
  });
});
