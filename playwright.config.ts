import { defineConfig } from "@playwright/test";

// End-to-end tests against the hosted Supabase project in .env.local. Each test creates and deletes
// its own user. Uses the locally installed Google Chrome.
process.loadEnvFile(".env.local");

const PORT = 3217;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome", headless: true },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
