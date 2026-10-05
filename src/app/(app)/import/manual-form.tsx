"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMMERCIAL_CATEGORIES } from "@/lib/taxonomy";
import { type ManualState, addManualInterest } from "./actions";

export function ManualForm() {
  const [state, action, pending] = useActionState<ManualState, FormData>(addManualInterest, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input name="text" required maxLength={200} placeholder="e.g. Electric cargo bike for school runs" className="min-w-64 flex-1" />
        <select name="category" required defaultValue="" className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Category">
          <option value="" disabled>
            Category…
          </option>
          {COMMERCIAL_CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="horizon" defaultValue="soon" className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="When">
          <option value="now">Buying now</option>
          <option value="soon">Next few months</option>
          <option value="someday">Someday</option>
        </select>
        <Button type="submit" disabled={pending}>
          Add
        </Button>
      </div>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-muted-foreground">{state.message}</p>}
    </form>
  );
}
