import Papa from "papaparse";
import type { ParseOutput, ParsedRecord, SignalKind } from "../types";
import { parseMoney } from "./amazon";

// Generic CSV: the user maps their columns onto ours. We guess a mapping from header names.

export interface CsvMapping {
  date: string;
  time?: string; // some exports split date and time into two columns
  title?: string;
  url?: string;
  query?: string;
  amount?: string;
  kind: SignalKind;
}

export interface CsvPreview {
  headers: string[];
  sample: Record<string, string>[];
  guess: CsvMapping | null;
}

const GUESS: Record<Exclude<keyof CsvMapping, "kind">, RegExp> = {
  date: /^(date|datetime|timestamp|time ?stamp|visit(ed)?[ _]?(date|time)|last[ _]?visit(ed)?|created[ _]?(at)?|order[ _]?date|purchase[ _]?date)$/i,
  time: /^(time|visit[ _]?time)$/i,
  title: /^(title|name|product|product[ _]?name|item|description|page[ _]?title)$/i,
  url: /^(url|link|href|address|page[ _]?url)$/i,
  query: /^(query|search|search[ _]?term|term|keyword)s?$/i,
  amount: /^(amount|price|total|cost|item[ _]?total|order[ _]?total)$/i,
};

export function previewCsv(text: string): CsvPreview {
  const { data, meta } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, preview: 5 });
  const headers = meta.fields ?? [];
  const find = (re: RegExp) => headers.find((h) => re.test(h.trim()));
  const date = find(GUESS.date);
  const guess: CsvMapping | null = date
    ? {
        date,
        time: date === find(GUESS.time) ? undefined : find(GUESS.time),
        title: find(GUESS.title),
        url: find(GUESS.url),
        query: find(GUESS.query),
        amount: find(GUESS.amount),
        kind: find(GUESS.amount) ? "purchase" : find(GUESS.query) ? "search" : "visit",
      }
    : null;
  return { headers, sample: data, guess };
}

export function parseCsv(text: string, fileName: string, m: CsvMapping): ParseOutput {
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const records: ParsedRecord[] = [];
  let badDates = 0;
  for (const row of data) {
    const raw = m.time ? `${row[m.date] ?? ""} ${row[m.time] ?? ""}` : row[m.date];
    const occurredAt = parseDate(raw);
    if (!occurredAt) {
      badDates++;
      continue;
    }
    const rec: ParsedRecord = {
      kind: m.kind,
      occurredAt,
      title: m.title ? row[m.title] : null,
      url: m.url ? row[m.url] : null,
      query: m.query ? row[m.query] : null,
      amountCents: m.amount ? parseMoney(row[m.amount]) : null,
    };
    if (rec.title || rec.url || rec.query) records.push(rec);
  }
  const notes = [`${fileName}: ${records.length.toLocaleString()} rows.`];
  if (badDates) notes.push(`${fileName}: skipped ${badDates.toLocaleString()} rows with unreadable dates.`);
  return { records, notes };
}

// Accepts ISO strings, "MM/DD/YYYY [HH:MM[:SS]]", and unix seconds/milliseconds.
export function parseDate(raw: string | undefined): Date | null {
  const s = raw?.trim();
  if (!s) return null;
  if (/^\d{10}(\.\d+)?$/.test(s)) return new Date(Number(s) * 1000);
  if (/^\d{13}$/.test(s)) return new Date(Number(s));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
