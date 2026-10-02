"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CsvMapping, CsvPreview } from "@/lib/import/parsers/csv";
import { type PrepareStats, totalDropped } from "@/lib/import/pipeline";
import type { PreparedSignal, SignalKind, SourceKind } from "@/lib/import/types";
import type { ImportFormat, WorkerRequest, WorkerResponse } from "@/lib/import/worker";
import { type CategorySlug, getCategory } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { runAnalysis } from "../bank/actions";
import { failImport, finishImport, startImport, uploadSignals } from "./actions";

const BATCH = 500;

const FORMATS: { id: ImportFormat; source: Exclude<SourceKind, "manual">; title: string; blurb: string; accept: string; multiple: boolean }[] = [
  { id: "takeout", source: "google_takeout", title: "Google Takeout", blurb: "Chrome history, searches, YouTube", accept: ".zip,.json", multiple: true },
  { id: "browser_db", source: "chrome_history", title: "Browser history file", blurb: "Chrome, Edge, Brave, Safari, Firefox", accept: "", multiple: true },
  { id: "amazon", source: "amazon_orders", title: "Amazon orders", blurb: "From “Request your data”", accept: ".zip,.csv", multiple: true },
  { id: "csv", source: "csv", title: "Any CSV", blurb: "Map your own columns", accept: ".csv,text/csv", multiple: false },
];

const WINDOWS = [
  { days: 90, label: "Last 3 months" },
  { days: 180, label: "Last 6 months" },
  { days: 365, label: "Last 12 months" },
];

type Phase =
  | { name: "idle" }
  | { name: "parsing"; message: string }
  | { name: "mapping"; preview: CsvPreview; mapping: CsvMapping | null }
  | { name: "preview"; signals: PreparedSignal[]; stats: PrepareStats; notes: string[] }
  | { name: "uploading"; done: number; total: number }
  | { name: "done"; stored: number; duplicates: number; analysis: "running" | { intents: number } | { error: string } }
  | { name: "error"; message: string };

export function Importer({ excludedDomains, disabledCategories }: { excludedDomains: string[]; disabledCategories: CategorySlug[] }) {
  const router = useRouter();
  const [format, setFormat] = useState<ImportFormat | null>(null);
  const [windowDays, setWindowDays] = useState(180);
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  function worker(): Worker {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("../../../lib/import/worker.ts", import.meta.url), { type: "module" });
    }
    return workerRef.current;
  }

  function run(req: WorkerRequest) {
    const w = worker();
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") setPhase({ name: "parsing", message: msg.message });
      else if (msg.type === "error") setPhase({ name: "error", message: msg.message });
      else if (msg.type === "csvPreview") setPhase({ name: "mapping", preview: msg.preview, mapping: msg.preview.guess });
      else setPhase({ name: "preview", signals: msg.signals, stats: msg.stats, notes: msg.notes });
    };
    w.onerror = (e) => setPhase({ name: "error", message: e.message || "The file reader crashed." });
    w.postMessage(req);
  }

  function parse(mapping?: CsvMapping) {
    if (!format || !files.length) return;
    setPhase({ name: "parsing", message: "Starting…" });
    run({
      type: "parse",
      format,
      files,
      csvMapping: mapping,
      since: new Date(Date.now() - windowDays * 86_400_000).toISOString(),
      excludedDomains,
      disabledCategories,
    });
  }

  function onFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    setFiles(picked);
    setPhase({ name: "idle" });
    if (format === "csv" && picked[0]) {
      setPhase({ name: "parsing", message: "Reading columns…" });
      run({ type: "csvPreview", file: picked[0] });
    }
  }

  async function upload(signals: PreparedSignal[], stats: PrepareStats) {
    const fmt = FORMATS.find((f) => f.id === format)!;
    setPhase({ name: "uploading", done: 0, total: signals.length });
    let sourceId: string | null = null;
    try {
      ({ sourceId } = await startImport(fmt.source, files.map((f) => f.name)));
      let duplicates = 0;
      let rejected = 0;
      for (let i = 0; i < signals.length; i += BATCH) {
        const r = await uploadSignals(sourceId, signals.slice(i, i + BATCH));
        duplicates += r.duplicates;
        rejected += r.rejected;
        setPhase({ name: "uploading", done: Math.min(i + BATCH, signals.length), total: signals.length });
      }
      const { stored } = await finishImport(sourceId, {
        found: stats.found,
        droppedSensitive: Object.values(stats.dropped.sensitive).reduce((a, b) => a + (b ?? 0), 0),
        droppedExcluded: stats.dropped.excludedDomain,
        duplicates,
        rejectedByServer: rejected,
      });
      setFiles([]);
      // Analysis runs automatically after every import; a re-run button lives on Your Bank.
      setPhase({ name: "done", stored, duplicates, analysis: "running" });
      router.refresh();
      const r = await runAnalysis();
      setPhase({ name: "done", stored, duplicates, analysis: r.ok ? { intents: r.summary.intents } : { error: r.error } });
      router.refresh();
    } catch (err) {
      const message = (err as Error).message;
      if (sourceId) await failImport(sourceId, message).catch(() => {});
      setPhase({ name: "error", message });
    }
  }

  const busy = phase.name === "parsing" || phase.name === "uploading" || (phase.name === "done" && phase.analysis === "running");

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            disabled={busy}
            onClick={() => {
              setFormat(f.id);
              setFiles([]);
              setPhase({ name: "idle" });
            }}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors hover:bg-muted/60 disabled:opacity-50",
              format === f.id && "border-foreground bg-muted/60",
            )}
          >
            <p className="font-medium">{f.title}</p>
            <p className="text-sm text-muted-foreground">{f.blurb}</p>
          </button>
        ))}
      </div>

      {format && (
        <Card>
          <CardHeader>
            <CardTitle>{FORMATS.find((f) => f.id === format)!.title}</CardTitle>
            <CardDescription>
              <Instructions format={format} />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                multiple={FORMATS.find((f) => f.id === format)!.multiple}
                accept={FORMATS.find((f) => f.id === format)!.accept || undefined}
                disabled={busy}
                onChange={(e) => onFiles(e.target.files)}
                className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
              <select
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                disabled={busy}
                className="h-8 rounded-md border bg-background px-2 text-sm"
                aria-label="How far back to import"
              >
                {WINDOWS.map((w) => (
                  <option key={w.days} value={w.days}>
                    {w.label}
                  </option>
                ))}
              </select>
              {format !== "csv" && (
                <Button onClick={() => parse()} disabled={!files.length || busy}>
                  Read files
                </Button>
              )}
            </div>
            <PhaseView
              phase={phase}
              onMapping={(mapping) => phase.name === "mapping" && setPhase({ ...phase, mapping })}
              onParseCsv={(m) => parse(m)}
              onUpload={upload}
              onCancel={() => setPhase({ name: "idle" })}
            />
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function PhaseView({
  phase,
  onMapping,
  onParseCsv,
  onUpload,
  onCancel,
}: {
  phase: Phase;
  onMapping: (m: CsvMapping) => void;
  onParseCsv: (m: CsvMapping) => void;
  onUpload: (signals: PreparedSignal[], stats: PrepareStats) => void;
  onCancel: () => void;
}) {
  switch (phase.name) {
    case "idle":
      return null;
    case "parsing":
      return <p className="text-sm text-muted-foreground">{phase.message}</p>;
    case "error":
      return <p role="alert" className="text-sm text-destructive">{phase.message}</p>;
    case "uploading":
      return <Progress label={`Saving ${phase.done.toLocaleString()} of ${phase.total.toLocaleString()} signals…`} value={phase.done / phase.total} />;
    case "done":
      return (
        <div className="space-y-2 text-sm">
          <p role="status">
            Added <strong>{phase.stored.toLocaleString()}</strong> signals to your IntentBank
            {phase.duplicates > 0 && ` (${phase.duplicates.toLocaleString()} were already there)`}.
          </p>
          {phase.analysis === "running" ? (
            <p className="text-muted-foreground">Analyzing your IntentBank… this can take a minute.</p>
          ) : "error" in phase.analysis ? (
            <p role="alert" className="text-destructive">{phase.analysis.error}</p>
          ) : (
            <p>
              Found <strong>{phase.analysis.intents}</strong> intents.{" "}
              <Link href="/bank" className="font-medium underline underline-offset-4">
                See your IntentBank →
              </Link>
            </p>
          )}
        </div>
      );
    case "mapping":
      return <CsvMapper preview={phase.preview} mapping={phase.mapping} onChange={onMapping} onSubmit={onParseCsv} />;
    case "preview":
      return <Preview {...phase} onUpload={() => onUpload(phase.signals, phase.stats)} onCancel={onCancel} />;
  }
}

function Preview({ signals, stats, notes, onUpload, onCancel }: { signals: PreparedSignal[]; stats: PrepareStats; notes: string[]; onUpload: () => void; onCancel: () => void }) {
  const d = stats.dropped;
  const sensitive = Object.entries(d.sensitive) as [CategorySlug, number][];
  const categories = (Object.entries(stats.byCategory) as [CategorySlug | "unclassified", number][]).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...categories.map(([, n]) => n));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-3xl font-semibold tabular-nums">{stats.kept.toLocaleString()}</p>
        <p className="text-sm text-muted-foreground">
          signals to keep, from {stats.found.toLocaleString()} records ({totalDropped(stats).toLocaleString()} left out)
        </p>
      </div>

      {categories.length > 0 && (
        <div className="space-y-1.5">
          {categories.map(([slug, n]) => (
            <div key={slug} className="grid grid-cols-[9rem_1fr_4rem] items-center gap-3 text-sm">
              <span className="truncate">{slug === "unclassified" ? "Not yet classified" : getCategory(slug)?.name}</span>
              <span className="h-2 rounded-full bg-muted">
                <span className="block h-2 rounded-full bg-foreground/70" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums text-muted-foreground">{n.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 text-sm">
        <p className="font-medium">Left out</p>
        <ul className="space-y-1 text-muted-foreground">
          {sensitive.length > 0 && (
            <li className="flex flex-wrap items-center gap-1.5">
              Sensitive, never stored:
              {sensitive.map(([slug, n]) => (
                <Badge key={slug} variant="secondary">
                  {getCategory(slug)?.name} {n.toLocaleString()}
                </Badge>
              ))}
            </li>
          )}
          {d.excludedDomain > 0 && <li>Sites you excluded: {d.excludedDomain.toLocaleString()}</li>}
          {d.disabledCategory > 0 && <li>Categories you turned off: {d.disabledCategory.toLocaleString()}</li>}
          {d.outsideWindow > 0 && <li>Older than the selected window: {d.outsideWindow.toLocaleString()}</li>}
          {d.duplicate > 0 && <li>Repeat visits on the same day: {d.duplicate.toLocaleString()}</li>}
          {d.noise > 0 && <li>Browser pages, logins and local addresses: {d.noise.toLocaleString()}</li>}
        </ul>
      </div>

      {notes.length > 0 && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">File details</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}

      {signals.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Sample of what will be saved</summary>
          <ul className="mt-2 divide-y rounded-md border">
            {signals.slice(0, 10).map((s) => (
              <li key={s.dedupe_key} className="flex gap-3 px-3 py-2">
                <span className="w-16 shrink-0 text-muted-foreground">{s.kind}</span>
                <span className="min-w-0 flex-1 truncate">{s.query ?? s.title ?? s.url}</span>
                <span className="shrink-0 text-muted-foreground">{s.domain}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex gap-2">
        <Button onClick={onUpload} disabled={!signals.length}>
          Add {stats.kept.toLocaleString()} signals to my IntentBank
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

const KINDS: SignalKind[] = ["visit", "search", "purchase", "video", "saved", "subscription"];

function CsvMapper({ preview, mapping, onChange, onSubmit }: { preview: CsvPreview; mapping: CsvMapping | null; onChange: (m: CsvMapping) => void; onSubmit: (m: CsvMapping) => void }) {
  const m: CsvMapping = mapping ?? { date: "", kind: "visit" };
  const field = (key: keyof Omit<CsvMapping, "kind">, label: string, required = false) => (
    <label className="grid gap-1 text-sm">
      <span>
        {label}
        {required && " *"}
      </span>
      <select
        value={m[key] ?? ""}
        onChange={(e) => onChange({ ...m, [key]: e.target.value || undefined })}
        className="h-8 rounded-md border bg-background px-2"
      >
        <option value="">{required ? "Choose…" : "—"}</option>
        {preview.headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Match your columns. We guessed where we could.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {field("date", "Date", true)}
        {field("time", "Time (if separate)")}
        {field("title", "Title / name")}
        {field("url", "URL")}
        {field("query", "Search term")}
        {field("amount", "Amount")}
        <label className="grid gap-1 text-sm">
          <span>Each row is a</span>
          <select value={m.kind} onChange={(e) => onChange({ ...m, kind: e.target.value as SignalKind })} className="h-8 rounded-md border bg-background px-2">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button onClick={() => onSubmit(m)} disabled={!m.date || !(m.title || m.url || m.query)}>
        Read file
      </Button>
    </div>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-foreground transition-[width]" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

function Instructions({ format }: { format: ImportFormat }) {
  switch (format) {
    case "takeout":
      return (
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            Open <a className="underline" href="https://takeout.google.com" target="_blank" rel="noreferrer">takeout.google.com</a> and click <em>Deselect all</em>.
          </li>
          <li>Select <em>Chrome</em>, <em>My Activity</em> and (optionally) <em>YouTube and YouTube Music → history</em>.</li>
          <li>For My Activity, open <em>Multiple formats</em> and choose <strong>JSON</strong>.</li>
          <li>Export, download the .zip, and drop it here — we only open the history files inside.</li>
        </ol>
      );
    case "browser_db":
      return (
        <div className="mt-1 space-y-1">
          <p>Quit the browser, then pick its history file (in Finder press ⌘⇧G and paste the path):</p>
          <ul className="list-disc space-y-0.5 pl-5 font-mono text-xs">
            <li>Chrome: ~/Library/Application Support/Google/Chrome/Default/History</li>
            <li>Edge: ~/Library/Application Support/Microsoft Edge/Default/History</li>
            <li>Brave: ~/Library/Application Support/BraveSoftware/Brave-Browser/Default/History</li>
            <li>Safari: ~/Library/Safari/History.db</li>
            <li>Firefox: ~/Library/Application Support/Firefox/Profiles/*/places.sqlite</li>
            <li>Windows Chrome: %LOCALAPPDATA%\Google\Chrome\User Data\Default\History</li>
          </ul>
        </div>
      );
    case "amazon":
      return (
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            Go to <a className="underline" href="https://www.amazon.com/hz/privacy-central/data-requests/preview.html" target="_blank" rel="noreferrer">Amazon → Request your data</a> and choose <em>Your Orders</em>.
          </li>
          <li>Confirm the email. Amazon sends a download link, usually within a few days.</li>
          <li>Drop the .zip (or Retail.OrderHistory.1.csv) here. Addresses and payment details are never read.</li>
        </ol>
      );
    case "csv":
      return <p className="mt-1">Any CSV with a date column — browser-history extensions, other retailers, spreadsheets.</p>;
  }
}
