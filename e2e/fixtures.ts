import { test as base, expect, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { FIXTURES } from "./global-setup";

export { expect };
export const fixture = (name: string) => `${FIXTURES}/${name}`;

interface Account {
  uid: string;
  email: string;
  // Service-role client for asserting on stored rows. Always filter by uid.
  admin: SupabaseClient<Database>;
}

// A fresh, confirmed user signed in through real session cookies; deleted afterwards.
export const test = base.extend<{ account: Account }>({
  account: async ({ context }, provide) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const admin = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    const email = `ib-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const password = `e2e-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;

    const jar = new Map<string, string>();
    const ssr = createServerClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
      },
    });
    await ssr.auth.signInWithPassword({ email, password });
    await context.addCookies([...jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })));

    await provide({ uid: data.user.id, email, admin });
    await admin.auth.admin.deleteUser(data.user.id);
  },
});

// Runs one import through the real UI: pick files, read, review the preview, upload. Imports
// trigger an analysis (a paid model call); this waits for it to settle either way.
export async function importVia(page: Page, card: string, files: string[], opts: { csv?: boolean } = {}) {
  await page.goto("/import");
  await page.getByRole("button", { name: new RegExp(card) }).click();
  await page.locator('input[type="file"]').setInputFiles(files.map(fixture));
  await page.getByRole("button", { name: opts.csv ? "Read file" : "Read files" }).click();
  await page.getByText(/signals to keep/).waitFor();
  const kept = Number((await page.locator("p.text-3xl").innerText()).replace(/,/g, ""));
  const preview = await page.locator("main").innerText();
  await page.getByRole("button", { name: /Add .* signals to my IntentBank/ }).click();
  const added = await page.getByText(/Added \d+ signals/).innerText();
  const analysis = page.getByText(/Found \d+ intents|Analysis failed|couldn’t be completed|just analyzed|already running/);
  await analysis.waitFor({ timeout: 240_000 });
  return { kept, preview, added, analysis: await analysis.innerText() };
}
