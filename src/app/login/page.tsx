import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";
import { AuthForm } from "./auth-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? params.error : undefined;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect(next);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <Link href="/" className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            IntentBank
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Open your IntentBank</h1>
          <p className="text-sm text-muted-foreground">Your data stays yours. They ask. You decide.</p>
        </div>
        <AuthForm next={next} initialError={error} />
      </div>
    </main>
  );
}
