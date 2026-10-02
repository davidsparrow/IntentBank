"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { AnalysisInProgressError, type AnalysisSummary, analyzeIntents } from "@/lib/intents/analyze";
import { ModelRefusalError } from "@/lib/intents/model";

export type AnalysisResult = { ok: true; summary: AnalysisSummary } | { ok: false; error: string };

export async function runAnalysis(): Promise<AnalysisResult> {
  const { supabase, userId } = await requireUser();
  try {
    const summary = await analyzeIntents(supabase, userId);
    revalidatePath("/bank");
    revalidatePath("/import");
    return { ok: true, summary };
  } catch (err) {
    if (err instanceof AnalysisInProgressError) return { ok: false, error: `${err.message} Give it a minute.` };
    if (err instanceof ModelRefusalError) return { ok: false, error: "The analysis couldn’t be completed for this data." };
    console.error("analysis failed", err);
    return { ok: false, error: "Analysis failed. Your data is unchanged — try again shortly." };
  }
}
