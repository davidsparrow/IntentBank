"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { runAnalysis } from "./actions";

export function AnalyzeButton({ label = "Re-analyze" }: { label?: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            const r = await runAnalysis();
            setMessage(r.ok ? `Found ${r.summary.intents} intents.` : r.error);
          })
        }
      >
        {pending ? "Analyzing…" : label}
      </Button>
    </div>
  );
}
