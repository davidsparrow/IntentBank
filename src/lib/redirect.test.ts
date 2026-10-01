import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";

describe("safeNext", () => {
  it("keeps relative paths", () => {
    expect(safeNext("/import?x=1")).toBe("/import?x=1");
  });

  it.each([null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "bank"])(
    "falls back for %s",
    (value) => {
      expect(safeNext(value)).toBe("/bank");
    },
  );
});
