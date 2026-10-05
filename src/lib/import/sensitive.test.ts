import { describe, expect, it } from "vitest";
import { sensitiveCategory } from "./sensitive";

describe("sensitiveCategory", () => {
  it.each([
    [{ domain: "webmd.com" }, "health"],
    [{ query: "early symptoms of diabetes" }, "health"],
    [{ query: "how to file for bankruptcy" }, "finance"],
    [{ domain: "chase.com" }, "finance"],
    [{ title: "Republican primary results" }, "politics"],
    [{ query: "church near me sunday" }, "religion"],
    [{ domain: "grindr.com" }, "sexuality"],
    [{ domain: "google.com", host: "mail.google.com" }, "private_communications"],
    [{ url: "https://www.google.com/maps/dir/Home/Work" }, "precise_location"],
    [{ query: "123 Main St directions" }, "precise_location"],
    [{ query: "my daughter report card" }, "children"],
    [{ title: "Prenatal vitamins 90 count" }, "health"],
  ])("%o → %s", (input, want) => expect(sensitiveCategory(input)).toBe(want));

  it.each([
    { query: "best induction range 2026" },
    { domain: "rei.com", title: "Electric bikes for commuting" },
    { title: "Middlesex county hotels" },
    { domain: "google.com", host: "www.google.com", query: "iceland ring road itinerary" },
  ])("allows %o", (input) => expect(sensitiveCategory(input)).toBeNull());
});
