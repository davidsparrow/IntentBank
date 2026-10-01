// Public values are inlined at build time, so they must be referenced literally.
export const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_PUBLISHABLE_KEY = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// Server-only secrets are read lazily so importing this module from client code never throws.
export function serverEnv() {
  return {
    supabaseSecretKey: required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
    anthropicApiKey: required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY),
  };
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name} — see .env.example`);
  return value;
}
