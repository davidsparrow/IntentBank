import { describe, expect, it } from "vitest";
import { cleanUrl, normalizeDomainInput, registrableDomain } from "./normalize";

describe("cleanUrl", () => {
  it("drops query strings and fragments", () => {
    expect(cleanUrl("https://www.bosch-home.com/us/ranges/induction?utm_source=x&token=abc#reviews")).toEqual({
      url: "https://www.bosch-home.com/us/ranges/induction",
      host: "www.bosch-home.com",
      domain: "bosch-home.com",
      query: null,
    });
  });

  it("lifts search terms out of search engine URLs", () => {
    expect(cleanUrl("https://www.google.com/search?q=best+induction+range&oq=best")?.query).toBe("best induction range");
    expect(cleanUrl("https://www.amazon.com/s?k=standing+desk&ref=nb")?.query).toBe("standing desk");
    expect(cleanUrl("https://www.youtube.com/results?search_query=iceland+ring+road")?.query).toBe("iceland ring road");
  });

  it.each(["chrome://settings", "file:///Users/me/x.pdf", "http://localhost:3000/x", "http://192.168.1.1/", "https://accounts.google.com/signin", "not a url"])(
    "rejects %s",
    (u) => expect(cleanUrl(u)).toBeNull(),
  );
});

describe("registrableDomain", () => {
  it.each([
    ["www.bbc.co.uk", "bbc.co.uk"],
    ["shop.example.com", "example.com"],
    ["example.com", "example.com"],
  ])("%s → %s", (host, want) => expect(registrableDomain(host)).toBe(want));

  it("normalizes user-entered domains", () => {
    expect(normalizeDomainInput(" https://WWW.Reddit.com/r/x ")).toBe("reddit.com");
    expect(normalizeDomainInput("news.ycombinator.com")).toBe("ycombinator.com");
    expect(normalizeDomainInput("")).toBeNull();
  });
});
