/// <reference lib="webworker" />
// Runs entirely in the browser. Raw files are read and filtered here; only PreparedSignals leave.
import type { CategorySlug } from "@/lib/taxonomy";
import { decodeText, extractWanted } from "./files";
import { AMAZON_WANTED, parseAmazonCsv } from "./parsers/amazon";
import { parseBrowserDb } from "./parsers/browser-db";
import { type CsvMapping, parseCsv, previewCsv } from "./parsers/csv";
import { TAKEOUT_WANTED, parseTakeoutJson } from "./parsers/takeout";
import { prepareSignals } from "./pipeline";
import type { ParsedRecord } from "./types";

export type ImportFormat = "takeout" | "browser_db" | "amazon" | "csv";

export type WorkerRequest =
  | {
      type: "parse";
      format: ImportFormat;
      files: File[];
      csvMapping?: CsvMapping;
      since: string;
      excludedDomains: string[];
      disabledCategories: CategorySlug[];
    }
  | { type: "csvPreview"; file: File };

export type WorkerResponse =
  | { type: "progress"; message: string }
  | { type: "result"; signals: ReturnType<typeof prepareSignals>["signals"]; stats: ReturnType<typeof prepareSignals>["stats"]; notes: string[] }
  | { type: "csvPreview"; preview: ReturnType<typeof previewCsv> }
  | { type: "error"; message: string };

const post = (msg: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const req = e.data;
    if (req.type === "csvPreview") {
      post({ type: "csvPreview", preview: previewCsv(await req.file.slice(0, 64 * 1024).text()) });
      return;
    }

    const since = new Date(req.since);
    const records: ParsedRecord[] = [];
    const notes: string[] = [];
    const add = (r: { records: ParsedRecord[]; notes: string[] }) => {
      // Avoid spread: Takeout histories can exceed the engine's argument limit.
      for (const rec of r.records) records.push(rec);
      notes.push(...r.notes);
    };

    if (req.format === "takeout" || req.format === "amazon") {
      post({ type: "progress", message: "Reading files…" });
      const wanted = req.format === "takeout" ? TAKEOUT_WANTED : AMAZON_WANTED;
      const { files, ignored } = await extractWanted(req.files, wanted);
      if (ignored.length) notes.push(`Ignored: ${ignored.join(", ")}`);
      for (const f of files) {
        post({ type: "progress", message: `Parsing ${f.name}…` });
        add(req.format === "takeout" ? parseTakeoutJson(decodeText(f.bytes), f.name) : parseAmazonCsv(decodeText(f.bytes), f.name));
      }
    } else if (req.format === "browser_db") {
      post({ type: "progress", message: "Loading SQLite reader…" });
      const { default: initSqlJs } = await import("sql.js");
      const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
      for (const file of req.files) {
        post({ type: "progress", message: `Reading ${file.name}…` });
        const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
        try {
          add(parseBrowserDb(db, file.name, since));
        } catch (err) {
          notes.push(`${file.name}: could not be read (${(err as Error).message}). Quit the browser and copy the file again.`);
        } finally {
          db.close();
        }
      }
    } else {
      if (!req.csvMapping) throw new Error("Choose which columns hold the date and content.");
      for (const file of req.files) {
        post({ type: "progress", message: `Parsing ${file.name}…` });
        add(parseCsv(await file.text(), file.name, req.csvMapping));
      }
    }

    post({ type: "progress", message: "Filtering and classifying…" });
    const { signals, stats } = prepareSignals(records, {
      since,
      excludedDomains: req.excludedDomains,
      disabledCategories: req.disabledCategories,
    });
    post({ type: "result", signals, stats, notes });
  } catch (err) {
    post({ type: "error", message: (err as Error).message });
  }
};
