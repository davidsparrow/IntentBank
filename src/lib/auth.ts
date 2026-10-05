import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Verifies the session (JWT signature checked by getClaims) and returns a user-scoped client.
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");
  return { supabase, userId: claims.sub, email: (claims.email as string | undefined) ?? null };
}
