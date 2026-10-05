import { requireUser } from "@/lib/auth";
import type { CategorySlug } from "@/lib/taxonomy";
import { Importer } from "./importer";
import { ManualForm } from "./manual-form";
import { SourcesList } from "./sources-list";

// Imports trigger intent analysis, which can take a while for large vaults.
export const maxDuration = 300;

export default async function ImportPage() {
  const { supabase } = await requireUser();
  const [{ data: sources }, { data: excluded }, { data: perms }] = await Promise.all([
    supabase
      .from("vault_sources")
      .select("id, kind, label, status, signal_count, dropped_sensitive_count, dropped_excluded_count, error, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("excluded_domains").select("domain"),
    supabase.from("category_permissions").select("category_slug, collect"),
  ]);

  const disabledCategories = (perms ?? []).filter((p) => !p.collect).map((p) => p.category_slug as CategorySlug);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Build your IntentBank</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Files are read in your browser. The raw export never leaves your device — only cleaned-up signals
          (page, search or purchase, with tracking parameters removed) are saved, and anything touching health,
          finances, politics, religion, sexuality, children, location or private messages is dropped first.
        </p>
      </div>

      <Importer excludedDomains={(excluded ?? []).map((e) => e.domain)} disabledCategories={disabledCategories} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Tell us directly</h2>
        <p className="text-sm text-muted-foreground">
          Something you’re shopping for or planning that your exports won’t show. Stated interests count as
          confirmed by you.
        </p>
        <ManualForm />
      </section>

      <SourcesList sources={sources ?? []} />
    </div>
  );
}
