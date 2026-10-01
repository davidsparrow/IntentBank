import Papa from "papaparse";
import type { ParseOutput, ParsedRecord } from "../types";

// Amazon order history CSV. Two layouts:
//  - "Request Your Data" export: Retail.OrderHistory.N.csv
//      columns include "Order Date", "Product Name", "Total Owed", "ASIN", "Order Status", "Website"
//  - Legacy "Order History Reports": "Order Date", "Title", "Item Total", "ASIN/ISBN"
// Only date, product name, amount and ASIN are read. Address, payment and gift columns are ignored.

const COLUMNS = {
  date: ["Order Date"],
  title: ["Product Name", "Title"],
  amount: ["Total Owed", "Item Total", "Unit Price"],
  asin: ["ASIN", "ASIN/ISBN"],
  status: ["Order Status"],
  website: ["Website"],
};

export function parseAmazonCsv(text: string, fileName: string): ParseOutput {
  const { data, meta } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const pick = (names: string[]) => names.find((n) => meta.fields?.includes(n));
  const col = {
    date: pick(COLUMNS.date),
    title: pick(COLUMNS.title),
    amount: pick(COLUMNS.amount),
    asin: pick(COLUMNS.asin),
    status: pick(COLUMNS.status),
    website: pick(COLUMNS.website),
  };
  if (!col.date || !col.title) {
    return { records: [], notes: [`${fileName}: missing "Order Date"/"Product Name" columns — not an Amazon order history file.`] };
  }

  const records: ParsedRecord[] = [];
  let cancelled = 0;
  for (const row of data) {
    if (col.status && /cancel/i.test(row[col.status] ?? "")) {
      cancelled++;
      continue;
    }
    const occurredAt = new Date(row[col.date] ?? "");
    const title = row[col.title];
    if (!title || Number.isNaN(occurredAt.getTime())) continue;
    const asin = col.asin ? row[col.asin]?.trim() : undefined;
    const host = amazonHost(col.website ? row[col.website] : undefined);
    records.push({
      kind: "purchase",
      occurredAt,
      title,
      url: asin && /^[A-Z0-9]{10}$/i.test(asin) ? `https://${host}/dp/${asin}` : `https://${host}`,
      amountCents: col.amount ? parseMoney(row[col.amount]) : null,
    });
  }

  const notes = [`${fileName}: ${records.length.toLocaleString()} order items.`];
  if (cancelled) notes.push(`${fileName}: skipped ${cancelled.toLocaleString()} cancelled items.`);
  return { records, notes };
}

function amazonHost(website: string | undefined): string {
  const w = website?.trim().toLowerCase();
  return w && /^(www\.)?amazon\.[a-z.]+$/.test(w) ? w : "www.amazon.com";
}

export function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && raw.match(/\d/) ? Math.round(n * 100) : null;
}

export const AMAZON_WANTED = /(?:Retail\.OrderHistory\.\d+\.csv|Order.*History.*\.csv)$/i;
