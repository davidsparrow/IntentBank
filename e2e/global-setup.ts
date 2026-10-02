import { mkdirSync, writeFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import initSqlJs from "sql.js";

// Synthetic exports, each seeded with sensitive and noisy entries that must never be stored.
export const FIXTURES = "e2e/.fixtures";

export default async function globalSetup() {
  mkdirSync(FIXTURES, { recursive: true });
  const day = (n: number, h = 12) => new Date(Date.now() - n * 86_400_000 + h * 3_600_000);
  const usec = (d: Date) => d.getTime() * 1000;

  const browserHistory = {
    "Browser History": [
      { title: "Bosch 800 Series Induction Range", url: "https://www.bosch-home.com/us/ranges/induction-800?utm_source=google&gclid=SECRET", time_usec: usec(day(20)), page_transition: "LINK" },
      { title: "Miele induction cooktops", url: "https://www.mieleusa.com/cooktops", time_usec: usec(day(19)), page_transition: "LINK" },
      { title: "Induction vs gas : r/Cooking", url: "https://www.reddit.com/r/Cooking/comments/abc", time_usec: usec(day(19)), page_transition: "LINK" },
      { title: "Migraine symptoms - WebMD", url: "https://www.webmd.com/migraine", time_usec: usec(day(18)), page_transition: "LINK" },
      { title: "Inbox (3)", url: "https://mail.google.com/mail/u/0/#inbox", time_usec: usec(day(18)), page_transition: "LINK" },
      { title: "Chase Online", url: "https://secure.chase.com/web/auth", time_usec: usec(day(18)), page_transition: "LINK" },
      { title: "New Tab", url: "chrome://newtab/", time_usec: usec(day(18)), page_transition: "LINK" },
      { title: "Some old page", url: "https://www.kayak.com/old", time_usec: usec(day(400)), page_transition: "LINK" },
    ],
  };
  const myActivity = [
    { header: "Search", title: "Searched for best induction range 2026", titleUrl: "https://www.google.com/search?q=best+induction+range+2026", time: day(21).toISOString(), products: ["Search"] },
    { header: "Search", title: "Searched for cheap flights to reykjavik", titleUrl: "https://www.google.com/search?q=cheap+flights+to+reykjavik", time: day(16).toISOString(), products: ["Search"] },
    { header: "Search", title: "Searched for how to file for bankruptcy", titleUrl: "https://www.google.com/search?q=how+to+file+for+bankruptcy", time: day(16).toISOString(), products: ["Search"] },
    { header: "Maps", title: "Searched for 42 Elm Street", time: day(16).toISOString(), products: ["Maps"] },
  ];
  writeFileSync(
    `${FIXTURES}/takeout-test.zip`,
    zipSync({
      "Takeout/Chrome/BrowserHistory.json": strToU8(JSON.stringify(browserHistory)),
      "Takeout/My Activity/Search/MyActivity.json": strToU8(JSON.stringify(myActivity)),
      "Takeout/Google Photos/IMG_0001.jpg": strToU8("should never be opened"),
    }),
  );

  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT); CREATE TABLE visits (id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER);");
  const chrome = (d: Date) => (d.getTime() + 11_644_473_600_000) * 1000;
  const rows: [string, string, Date][] = [
    ["https://www.edmunds.com/rivian/r2/review/", "2027 Rivian R2 Review - Edmunds", day(15)],
    ["https://www.google.com/search?q=rivian+r2+lease+deals&sourceid=chrome", "rivian r2 lease deals - Google Search", day(15)],
    ["https://insideevs.com/news/r2-range", "Rivian R2 range test", day(14)],
    ["https://www.betterhelp.com/start", "BetterHelp", day(14)],
    ["http://localhost:3000/dev", "dev server", day(14)],
  ];
  rows.forEach(([u, t, d], i) => {
    db.run("INSERT INTO urls VALUES (?,?,?)", [i + 1, u, t]);
    db.run("INSERT INTO visits (url, visit_time) VALUES (?,?)", [i + 1, chrome(d)]);
  });
  writeFileSync(`${FIXTURES}/History`, Buffer.from(db.export()));

  writeFileSync(
    `${FIXTURES}/Retail.OrderHistory.1.csv`,
    [
      '"Website","Order ID","Order Date","Currency","Total Owed","ASIN","Order Status","Shipping Address","Payment Instrument Type","Product Name"',
      `"Amazon.com","111-1","${day(25).toISOString()}","USD","89.99","B0COOKSET1","Closed","Jane Doe 1 Secret Ln","Visa - 1234","Induction-ready cookware set, 10 piece"`,
      `"Amazon.com","111-2","${day(24).toISOString()}","USD","24.99","B0VITAMIN1","Closed","Jane Doe 1 Secret Ln","Visa - 1234","Prenatal vitamins 90 count"`,
      `"Amazon.com","111-3","${day(23).toISOString()}","USD","9.99","B0CANCEL01","Cancelled","Jane Doe 1 Secret Ln","Visa - 1234","Cancelled item"`,
    ].join("\n"),
  );

  const us = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  writeFileSync(
    `${FIXTURES}/history-export.csv`,
    [
      "order,date,time,title,url,visitCount",
      `1,${us(day(12))},14:03:00,Icelandair flights to Reykjavik,https://www.icelandair.com/flights/kef,3`,
      `2,${us(day(11))},09:15:00,Blue Lagoon tickets,https://www.bluelagoon.com/tickets,1`,
    ].join("\n"),
  );
}
