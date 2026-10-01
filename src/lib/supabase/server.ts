import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, serverEnv } from "@/lib/env";

// Request-scoped client acting as the signed-in user. All data access goes through RLS.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes sessions.
        }
      },
    },
  });
}

// Bypasses RLS. Reserved for operations RLS cannot express (deleting the auth user).
// Never use it to read vault data.
export function createAdminClient() {
  return createSupabaseClient(SUPABASE_URL, serverEnv().supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
