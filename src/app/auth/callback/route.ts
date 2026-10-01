import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

// Landing point for email confirmation and magic links.
// Supports the default PKCE flow (?code=) and token-hash email templates (?token_hash=&type=).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let error: { message: string } | null = null;

  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else {
    error = { message: "This link is missing its sign-in code." };
  }

  if (error) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }
  return NextResponse.redirect(new URL(next, origin));
}
