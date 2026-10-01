import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "./taxonomy";

const migration = readFileSync(
  join(__dirname, "../../supabase/migrations/20261001000000_v0_core.sql"),
  "utf8",
);

// Rows look like: ('slug', 'Name', 'description', true|false, 10)
const seeded = [...migration.matchAll(/\('([a-z_]+)',\s*'([^']+)',\s*'[^']*',\s*(true|false),\s*\d+\)/g)].map(
  ([, slug, name, sensitive]) => ({ slug, name, sensitive: sensitive === "true" }),
);

describe("taxonomy", () => {
  it("matches the categories seeded by the core migration", () => {
    expect(seeded).toEqual(CATEGORIES.map(({ slug, name, sensitive }) => ({ slug, name, sensitive })));
  });
});
