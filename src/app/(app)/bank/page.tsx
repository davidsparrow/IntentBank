import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { refreshDecay } from "@/lib/intents/analyze";
import { LIVE_STATES } from "@/lib/intents/score";
import { getCategory } from "@/lib/taxonomy";
import { AnalyzeButton } from "./analyze-button";

export const maxDuration = 300;

const STATE_LABEL: Record<string, string> = {
  strong: "Strong",
  active: "Active",
  emerging: "Emerging",
  cooling: "Cooling",
  dormant: "Dormant",
  purchased: "Purchased",
  dismissed: "Dismissed",
};

export default async function BankPage() {
  const { supabase } = await requireUser();
  await refreshDecay(supabase);

  const [{ data: intents }, { count: signalCount }, { data: lastRun }] = await Promise.all([
    supabase
      .from("intents")
      .select("id, label, category_slug, confidence, state, signal_count, source_count, purchase_horizon, explanation, last_signal_at")
      .order("confidence", { ascending: false }),
    supabase.from("signals").select("*", { count: "exact", head: true }),
    supabase
      .from("analysis_runs")
      .select("status, model, items_sent, intents_found, finished_at, started_at, error")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const all = intents ?? [];
  const live = all.filter((i) => LIVE_STATES.includes(i.state));
  const fading = all.filter((i) => i.state === "cooling" || i.state === "dormant");
  const closed = all.filter((i) => i.state === "purchased" || i.state === "dismissed");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your IntentBank</h1>
          <p className="text-sm text-muted-foreground">
            {live.length} active intents · {(signalCount ?? 0).toLocaleString()} signals
            {lastRun?.status === "succeeded" &&
              ` · analyzed ${new Date(lastRun.finished_at ?? lastRun.started_at).toLocaleString()} (${lastRun.items_sent.toLocaleString()} summaries sent to ${lastRun.model})`}
          </p>
        </div>
        {!!signalCount && <AnalyzeButton label={all.length ? "Re-analyze" : "Analyze my data"} />}
      </div>

      {!signalCount && (
        <Card>
          <CardHeader>
            <CardTitle>Build your IntentBank</CardTitle>
            <CardDescription>
              Import a data export to see the commercial profile hiding inside your own data. Files are read in your
              browser — the raw export never leaves your device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/import" className={buttonVariants()}>
              Import a source
            </Link>
          </CardContent>
        </Card>
      )}

      {lastRun?.status === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          The last analysis didn’t finish. Your data is unchanged — try again.
        </p>
      )}

      {live.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Active intent</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {live.map((i) => (
              <IntentCard key={i.id} intent={i} />
            ))}
          </div>
        </section>
      )}

      {fading.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Cooling off</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {fading.map((i) => (
              <IntentCard key={i.id} intent={i} />
            ))}
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Purchased or dismissed ({closed.length})</summary>
          <ul className="mt-2 space-y-1">
            {closed.map((i) => (
              <li key={i.id}>
                {i.label} <span className="text-muted-foreground">· {STATE_LABEL[i.state]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface IntentRow {
  label: string;
  category_slug: string;
  confidence: number;
  state: string;
  signal_count: number;
  source_count: number;
  purchase_horizon: string | null;
  explanation: string | null;
}

function IntentCard({ intent: i }: { intent: IntentRow }) {
  const pct = Math.round(Number(i.confidence) * 100);
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate">{i.label}</CardTitle>
            <CardDescription>
              {getCategory(i.category_slug)?.name} · {i.signal_count} signals from {i.source_count} sources
              {i.purchase_horizon && ` · ${i.purchase_horizon}`}
            </CardDescription>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-semibold tabular-nums">{pct}%</p>
            <Badge variant="secondary">{STATE_LABEL[i.state]}</Badge>
          </div>
        </div>
      </CardHeader>
      {i.explanation && (
        <CardContent>
          <p className="text-sm text-muted-foreground">{i.explanation}</p>
        </CardContent>
      )}
    </Card>
  );
}
