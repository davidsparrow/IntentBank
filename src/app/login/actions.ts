"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string; email?: string };

const emailSchema = z.email("Enter a valid email address.");
const passwordSchema = z.string().min(8, "Use at least 8 characters.");

async function callbackUrl(next: string) {
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

function read(form: FormData) {
  return {
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
    next: safeNext(form.get("next") as string | null),
  };
}

export async function passwordAuth(_: AuthState, form: FormData): Promise<AuthState> {
  return form.get("intent") === "signup" ? signUp(form) : signInWithPassword(form);
}

async function signInWithPassword(form: FormData): Promise<AuthState> {
  const { email, password, next } = read(form);
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message, email };
  redirect(next);
}

async function signUp(form: FormData): Promise<AuthState> {
  const { email, password } = read(form);
  const e = emailSchema.safeParse(email);
  if (!e.success) return { error: e.error.issues[0].message, email };
  const p = passwordSchema.safeParse(password);
  if (!p.success) return { error: p.error.issues[0].message, email };

  // New accounts start at import — onboarding is "build your IntentBank" (PRD §36).
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: await callbackUrl("/import") },
  });
  if (error) return { error: error.message, email };
  if (data.session) redirect("/import"); // email confirmation disabled on the project
  return { message: `Check ${email} for a confirmation link.`, email };
}

export async function sendMagicLink(_: AuthState, form: FormData): Promise<AuthState> {
  const { email, next } = read(form);
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await callbackUrl(next) },
  });
  if (error) return { error: error.message, email };
  return { message: `Magic link sent to ${email}. Open it in this browser.`, email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
