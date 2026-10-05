import { expect, importVia, test } from "./fixtures";

test("imports every format, filtering sensitive and noisy data before it is stored", async ({ page, account }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("dialog", (d) => d.accept());

  const takeout = await importVia(page, "Google Takeout", ["takeout-test.zip"]);
  expect(takeout.kept).toBe(5);
  expect(takeout.preview).toMatch(/Health 1/);
  expect(takeout.preview).toMatch(/Personal finances 2/);
  expect(takeout.preview).toMatch(/Private communications 1/);
  expect(takeout.preview).toMatch(/Older than the selected window: 1/);

  const again = await importVia(page, "Google Takeout", ["takeout-test.zip"]);
  expect(again.added).toMatch(/Added 0 signals.*5 were already there/);

  expect((await importVia(page, "Browser history file", ["History"])).kept).toBe(3);
  const amazon = await importVia(page, "Amazon orders", ["Retail.OrderHistory.1.csv"]);
  expect(amazon.kept).toBe(1);
  expect(amazon.preview).toMatch(/Health 1/);
  expect((await importVia(page, "Any CSV", ["history-export.csv"], { csv: true })).kept).toBe(2);

  const { data: signals } = await account.admin.from("signals").select("*").eq("user_id", account.uid);
  expect(signals).toHaveLength(11);
  const stored = JSON.stringify(signals);
  expect(stored).not.toMatch(/webmd|bankrupt|\bchase\b|mail\.google|prenatal|betterhelp|localhost|SECRET|gclid|Secret Ln|\bVisa\b/i);
  expect(signals!.every((s) => !s.url?.includes("?"))).toBe(true);
  expect(signals!.find((s) => s.query === "rivian r2 lease deals")).toMatchObject({ kind: "search", category_slug: "automotive" });

  const { data: sources } = await account.admin
    .from("vault_sources")
    .select("kind, signal_count, dropped_sensitive_count")
    .eq("user_id", account.uid)
    .order("created_at");
  expect(sources!.map((s) => `${s.kind}:${s.signal_count}:${s.dropped_sensitive_count}`)).toEqual([
    "google_takeout:5:4",
    "chrome_history:3:1",
    "amazon_orders:1:1",
    "csv:2:0",
  ]);

  // Deleting a source removes its signals.
  await page.goto("/import");
  await page.locator("li", { hasText: "CSV upload" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("li", { hasText: "CSV upload" })).toHaveCount(0);
  const { count } = await account.admin.from("signals").select("*", { count: "exact", head: true }).eq("user_id", account.uid);
  expect(count).toBe(9);
  expect(consoleErrors).toEqual([]);
});

test("stated interests become confirmed intents; sensitive ones are refused", async ({ page, account }) => {
  await page.goto("/import");
  const form = page.locator("form").filter({ has: page.locator('input[name="text"]') });
  await form.locator('input[name="text"]').fill("Standing desk for home office");
  await form.locator('select[name="category"]').selectOption("home");
  await form.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(/Added “Standing desk/)).toBeVisible();

  const { data: intent } = await account.admin
    .from("intents")
    .select("key, user_confirmed, derived_by, state")
    .eq("user_id", account.uid)
    .single();
  expect(intent).toEqual({ key: "home/standing-desk-for-home-office", user_confirmed: true, derived_by: "user", state: "strong" });

  await form.locator('input[name="text"]').fill("Find a therapist for anxiety");
  await form.locator('select[name="category"]').selectOption("professional");
  await form.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(/never stores/)).toBeVisible();

  await page.goto("/bank");
  await expect(page.getByText("Standing desk for home office")).toBeVisible();
});
