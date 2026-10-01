import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

export default async function BankPage() {
  const { supabase } = await requireUser();
  const [{ count: intentCount }, { count: signalCount }] = await Promise.all([
    supabase.from("intents").select("*", { count: "exact", head: true }),
    supabase.from("signals").select("*", { count: "exact", head: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your IntentBank</h1>
        <p className="text-sm text-muted-foreground">
          {intentCount ?? 0} intents · {signalCount ?? 0} signals
        </p>
      </div>

      {!signalCount && (
        <Card>
          <CardHeader>
            <CardTitle>Build your IntentBank</CardTitle>
            <CardDescription>
              Import a data export to see the commercial profile hiding inside your own data. Files are
              read in your browser — the raw export never leaves your device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/import" className={buttonVariants()}>
              Import a source
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
