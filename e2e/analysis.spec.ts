import { expect, importVia, test } from "./fixtures";

// Calls the real model (Claude Sonnet 5.5) several times. Opt in with E2E_LIVE_MODEL=1.
test.skip(!process.env.E2E_LIVE_MODEL, "set E2E_LIVE_MODEL=1 to run against the real model");

test("turns imported activity into explained, scored intents", async ({ page, account }) => {
  test.setTimeout(900_000);
  for (const [card, files, csv] of [
    ["Google Takeout", ["takeout-test.zip"], false],
    ["Browser history file", ["History"], false],
    ["Amazon orders", ["Retail.OrderHistory.1.csv"], false],
    ["Any CSV", ["history-export.csv"], true],
  ] as const) {
    const r = await importVia(page, card, [...files], { csv });
    expect(r.analysis, card).toMatch(/Found \d+ intents/);
  }

  const { data: intents } = await account.admin
    .from("intents")
    .select("id, key, label, category_slug, confidence, explanation, signal_count")
    .eq("user_id", account.uid);
  const has = (cat: string, re: RegExp) => intents!.some((i) => i.category_slug === cat && re.test(`${i.key} ${i.label}`));
  expect(has("home", /induction|range|cooktop/i)).toBe(true);
  expect(has("automotive", /rivian|r2|ev|electric/i)).toBe(true);
  expect(has("travel", /iceland|reykjavik/i)).toBe(true);
  expect(JSON.stringify(intents)).not.toMatch(/bankrupt|migraine|webmd|prenatal|therap/i);
  for (const i of intents!) {
    expect(i.explanation).toBeTruthy();
    expect(i.signal_count).toBeGreaterThanOrEqual(2);
  }

  const { data: runs } = await account.admin.from("analysis_runs").select("status, input_tokens").eq("user_id", account.uid);
  expect(runs!.every((r) => r.status === "succeeded" && (r.input_tokens ?? 0) > 0)).toBe(true);

  // Re-analysis keeps keys stable so user corrections carry over.
  const before = intents!.map((i) => i.key).sort();
  await page.goto("/bank");
  await page.getByRole("button", { name: "Re-analyze" }).click();
  // Nothing new was imported, so the cooldown may refuse; either outcome keeps keys.
  await page.getByText(/Found \d+ intents\.|just analyzed/).waitFor({ timeout: 240_000 });
  const { data: after } = await account.admin.from("intents").select("key").eq("user_id", account.uid);
  expect(after!.map((i) => i.key).sort()).toEqual(before);
});
