"use client";

import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteSource } from "./actions";

interface Source {
  id: string;
  kind: string;
  label: string;
  status: string;
  signal_count: number;
  dropped_sensitive_count: number;
  dropped_excluded_count: number;
  error: string | null;
  created_at: string;
}

export function SourcesList({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Your sources</h2>
      <ul className="divide-y rounded-xl border">
        {sources.map((s) => (
          <SourceRow key={s.id} source={s} />
        ))}
      </ul>
    </section>
  );
}

function SourceRow({ source: s }: { source: Source }) {
  const [pending, start] = useTransition();
  const remove = () => {
    if (!confirm(`Delete “${s.label}” and its ${s.signal_count.toLocaleString()} signals from your IntentBank? This can’t be undone.`)) return;
    start(() => deleteSource(s.id));
  };

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{s.label}</p>
        <p className="text-muted-foreground">
          {new Date(s.created_at).toLocaleDateString()} · {s.signal_count.toLocaleString()} signals
          {s.dropped_sensitive_count > 0 && ` · ${s.dropped_sensitive_count.toLocaleString()} sensitive items never stored`}
        </p>
        {s.error && <p className="text-destructive">{s.error}</p>}
      </div>
      <Badge variant={s.status === "error" ? "destructive" : "secondary"}>{STATUS[s.status] ?? s.status}</Badge>
      <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
        {pending ? "Deleting…" : "Delete"}
      </Button>
    </li>
  );
}

const STATUS: Record<string, string> = {
  importing: "Importing",
  imported: "Imported",
  classifying: "Analyzing",
  ready: "Analyzed",
  error: "Failed",
};
