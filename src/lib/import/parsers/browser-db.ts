import type { Database } from "sql.js";
import type { ParseOutput, ParsedRecord } from "../types";

// Browser history databases, read with sql.js. Only URL, title and visit time are selected.
//  - Chrome / Edge / Brave / Arc: "History"     urls + visits, µs since 1601-01-01
//  - Safari:                      "History.db"  history_items + history_visits, s since 2001-01-01
//  - Firefox:                     "places.sqlite" moz_places + moz_historyvisits, µs since 1970

const CHROME_EPOCH_OFFSET_MS = 11_644_473_600_000;
const SAFARI_EPOCH_OFFSET_S = 978_307_200;

export function parseBrowserDb(db: Database, fileName: string, since: Date): ParseOutput {
  const tables = new Set(
    (db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values ?? []).map((r) => String(r[0])),
  );

  let browser: string;
  let sql: string;
  let toDate: (t: number) => Date;
  let cutoff: number;

  if (tables.has("urls") && tables.has("visits")) {
    browser = "Chromium";
    toDate = (t) => new Date(t / 1000 - CHROME_EPOCH_OFFSET_MS);
    cutoff = (since.getTime() + CHROME_EPOCH_OFFSET_MS) * 1000;
    sql = "SELECT u.url, u.title, v.visit_time FROM visits v JOIN urls u ON u.id = v.url WHERE v.visit_time >= ?";
  } else if (tables.has("history_items") && tables.has("history_visits")) {
    browser = "Safari";
    toDate = (t) => new Date((t + SAFARI_EPOCH_OFFSET_S) * 1000);
    cutoff = since.getTime() / 1000 - SAFARI_EPOCH_OFFSET_S;
    sql = "SELECT i.url, v.title, v.visit_time FROM history_visits v JOIN history_items i ON i.id = v.history_item WHERE v.visit_time >= ?";
  } else if (tables.has("moz_places") && tables.has("moz_historyvisits")) {
    browser = "Firefox";
    toDate = (t) => new Date(t / 1000);
    cutoff = since.getTime() * 1000;
    sql = "SELECT p.url, p.title, v.visit_date FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id WHERE v.visit_date >= ?";
  } else {
    return { records: [], notes: [`${fileName}: not a Chrome, Safari or Firefox history database.`] };
  }

  const records: ParsedRecord[] = [];
  const stmt = db.prepare(sql);
  try {
    stmt.bind([cutoff]);
    while (stmt.step()) {
      const [url, title, time] = stmt.get() as [string, string | null, number];
      records.push({ kind: "visit", occurredAt: toDate(time), url, title });
    }
  } finally {
    stmt.free();
  }
  return { records, notes: [`${fileName}: ${records.length.toLocaleString()} ${browser} visits since ${since.toLocaleDateString()}.`] };
}
