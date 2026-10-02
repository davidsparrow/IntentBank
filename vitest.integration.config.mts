import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Runs against the hosted Supabase project in .env.local. Creates and deletes its own test users.
process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: { include: ["src/**/*.integration.test.ts"], testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false },
});
