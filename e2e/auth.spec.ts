import { test as base } from "@playwright/test";
import { expect, test } from "./fixtures";

base("signed-out visitors are sent to login, and links can't redirect off-site", async ({ page, request }) => {
  await page.goto("/bank");
  await expect(page).toHaveURL(/\/login\?next=%2Fbank/);
  await expect(page.getByRole("tab", { name: "Magic link" })).toBeVisible();

  const res = await request.get("/auth/callback?next=//evil.com", { maxRedirects: 0 });
  expect(res.headers()["location"] ?? "").not.toContain("evil.com");
});

test("signed-in users skip login and see their bank", async ({ page, account }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/bank$/);
  await expect(page.getByRole("heading", { name: "Your IntentBank" })).toBeVisible();
  await expect(page.getByText(account.email)).toBeVisible();
});
