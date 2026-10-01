import { describe, expect, it } from "vitest";
import { ruleCategory } from "./rules";

describe("ruleCategory", () => {
  it.each([
    [{ domain: "edmunds.com" }, "automotive"],
    [{ query: "rivian r2 vs model y" }, "automotive"],
    [{ query: "cheap flights to reykjavik" }, "travel"],
    [{ url: "https://www.google.com/travel/flights", domain: "google.com" }, "travel"],
    [{ domain: "amazon.com", title: "Zinus 12 inch mattress" }, "home"],
    [{ domain: "amazon.com", title: "USB-C cable 2 pack" }, "shopping"],
    [{ domain: "amazon.com", title: "Kitchen timer" }, "home"],
    [{ query: "macbook air m5 review" }, "technology"],
    [{ domain: "coursera.org" }, "education"],
  ])("%o → %s", (input, want) => expect(ruleCategory(input)).toBe(want));

  it("leaves unknown signals for the AI pass", () => {
    expect(ruleCategory({ domain: "example.org", title: "Some blog post" })).toBeNull();
  });
});
