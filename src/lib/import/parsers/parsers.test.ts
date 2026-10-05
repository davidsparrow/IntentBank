import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { parseAmazonCsv } from "./amazon";
import { parseBrowserDb } from "./browser-db";
import { parseCsv, previewCsv } from "./csv";
import { parseTakeoutJson } from "./takeout";

describe("parseTakeoutJson", () => {
  it("reads Chrome BrowserHistory.json and skips reloads", () => {
    const json = JSON.stringify({
      "Browser History": [
        { title: "Bosch induction", url: "https://www.bosch-home.com/x", time_usec: 1_788_000_000_000_000, page_transition: "LINK" },
        { title: "Bosch induction", url: "https://www.bosch-home.com/x", time_usec: 1_788_000_001_000_000, page_transition: "RELOAD" },
      ],
    });
    const { records } = parseTakeoutJson(json, "BrowserHistory.json");
    expect(records).toEqual([
      { kind: "visit", occurredAt: new Date(1_788_000_000_000), url: "https://www.bosch-home.com/x", title: "Bosch induction" },
    ]);
  });

  it("reads My Activity entries, skipping Maps, Gmail and ads", () => {
    const json = JSON.stringify([
      { header: "Search", title: "Searched for best induction range", titleUrl: "https://www.google.com/search?q=best+induction+range", time: "2026-09-01T10:00:00.000Z", products: ["Search"] },
      { header: "Search", title: "Visited Miele Induction Cooktops", titleUrl: "https://www.google.com/url?q=https://www.mieleusa.com/cooktops&usg=x", time: "2026-09-01T10:01:00.000Z", products: ["Search"] },
      { header: "YouTube", title: "Watched Induction vs gas", titleUrl: "https://www.youtube.com/watch?v=abc", time: "2026-09-02T10:00:00.000Z", products: ["YouTube"] },
      { header: "YouTube", title: "Watched Some ad", titleUrl: "https://www.youtube.com/watch?v=ad", time: "2026-09-02T10:00:00.000Z", products: ["YouTube"], details: [{ name: "From Google Ads" }] },
      { header: "Maps", title: "Searched for 123 Home St", time: "2026-09-02T10:00:00.000Z", products: ["Maps"] },
      { header: "Gmail", title: "Searched for invoice", time: "2026-09-02T10:00:00.000Z", products: ["Gmail"] },
    ]);
    const { records, notes } = parseTakeoutJson(json, "MyActivity.json");
    expect(records.map((r) => [r.kind, r.query ?? r.title, r.url])).toEqual([
      ["search", "best induction range", "https://www.google.com/search?q=best+induction+range"],
      ["visit", "Miele Induction Cooktops", "https://www.mieleusa.com/cooktops"],
      ["video", "Induction vs gas", "https://www.youtube.com/watch?v=abc"],
    ]);
    expect(notes.join(" ")).toMatch(/skipped 2 .*Maps/);
    expect(notes.join(" ")).toMatch(/skipped 1 ad/);
  });

  it("explains HTML exports", () => {
    expect(parseTakeoutJson("<html>", "MyActivity.html").notes[0]).toMatch(/JSON, not HTML/);
  });
});

describe("parseAmazonCsv", () => {
  it("reads the Request Your Data layout without touching address or payment columns", () => {
    const csv = [
      '"Website","Order ID","Order Date","Currency","Unit Price","Total Owed","ASIN","Order Status","Shipping Address","Payment Instrument Type","Product Name"',
      '"Amazon.com","111-1","2026-08-14T18:22:10Z","USD","199.99","215.99","B0ABCDEFGH","Closed","Jane Doe 1 Secret Ln","Visa - 1234","Bosch 300 Series Induction Cooktop"',
      '"Amazon.com","111-2","2026-08-15T18:22:10Z","USD","9.99","9.99","B0ZZZZZZZZ","Cancelled","Jane Doe 1 Secret Ln","Visa - 1234","Cancelled thing"',
    ].join("\n");
    const { records } = parseAmazonCsv(csv, "Retail.OrderHistory.1.csv");
    expect(records).toEqual([
      {
        kind: "purchase",
        occurredAt: new Date("2026-08-14T18:22:10Z"),
        title: "Bosch 300 Series Induction Cooktop",
        url: "https://amazon.com/dp/B0ABCDEFGH",
        amountCents: 21599,
      },
    ]);
    expect(JSON.stringify(records)).not.toMatch(/Secret|Visa/);
  });

  it("reads the legacy report layout", () => {
    const csv = '"Order Date","Title","Item Total","ASIN/ISBN"\n"08/14/26","Trail running shoes","$129.00","B0RUNNERS1"';
    const [r] = parseAmazonCsv(csv, "orders.csv").records;
    expect(r.title).toBe("Trail running shoes");
    expect(r.amountCents).toBe(12900);
    expect(r.url).toBe("https://www.amazon.com/dp/B0RUNNERS1");
  });
});

describe("generic CSV", () => {
  const csv = "order,date,time,title,url,visitCount\n1,9/1/2026,14:03:00,Rivian R2,https://rivian.com/r2,3\n2,not a date,,x,https://x.com,1";

  it("guesses a mapping including split date/time columns", () => {
    expect(previewCsv(csv).guess).toEqual({ date: "date", time: "time", title: "title", url: "url", query: undefined, amount: undefined, kind: "visit" });
  });

  it("parses with a mapping and reports bad dates", () => {
    const { records, notes } = parseCsv(csv, "history.csv", { date: "date", time: "time", title: "title", url: "url", kind: "visit" });
    expect(records).toHaveLength(1);
    expect(records[0].occurredAt.getMonth()).toBe(8);
    expect(notes[1]).toMatch(/1 rows with unreadable dates/);
  });
});

describe("parseBrowserDb", async () => {
  const SQL = await initSqlJs();
  const since = new Date("2026-01-01T00:00:00Z");
  const visit = new Date("2026-09-01T12:00:00Z");

  it("reads Chrome history and respects the window", () => {
    const db = new SQL.Database();
    db.run("CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT); CREATE TABLE visits (id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER);");
    const chrome = (d: Date) => (d.getTime() + 11_644_473_600_000) * 1000;
    db.run("INSERT INTO urls VALUES (1, 'https://www.edmunds.com/rivian', 'Rivian review')");
    db.run("INSERT INTO visits VALUES (1, 1, ?), (2, 1, ?)", [chrome(visit), chrome(new Date("2025-06-01"))]);
    const { records } = parseBrowserDb(db, "History", since);
    expect(records).toEqual([{ kind: "visit", occurredAt: visit, url: "https://www.edmunds.com/rivian", title: "Rivian review" }]);
  });

  it("reads Safari and Firefox schemas", () => {
    const safari = new SQL.Database();
    safari.run("CREATE TABLE history_items (id INTEGER PRIMARY KEY, url TEXT); CREATE TABLE history_visits (id INTEGER PRIMARY KEY, history_item INTEGER, visit_time REAL, title TEXT);");
    safari.run("INSERT INTO history_items VALUES (1, 'https://www.kayak.com/flights')");
    safari.run("INSERT INTO history_visits VALUES (1, 1, ?, 'Flights')", [visit.getTime() / 1000 - 978_307_200]);
    expect(parseBrowserDb(safari, "History.db", since).records[0].occurredAt).toEqual(visit);

    const firefox = new SQL.Database();
    firefox.run("CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT); CREATE TABLE moz_historyvisits (id INTEGER PRIMARY KEY, place_id INTEGER, visit_date INTEGER);");
    firefox.run("INSERT INTO moz_places VALUES (1, 'https://www.rei.com/ebikes', 'E-bikes')");
    firefox.run("INSERT INTO moz_historyvisits VALUES (1, 1, ?)", [visit.getTime() * 1000]);
    expect(parseBrowserDb(firefox, "places.sqlite", since).records[0].occurredAt).toEqual(visit);
  });
});
