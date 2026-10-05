@AGENTS.md

# IntentBank

Consumer-controlled personal intent vault. Product spec: `IntentBank-PRD`. Current scope: **V0 — Personal IntentBank** (PRD §27). No advertiser marketplace yet.

## Stack
Next.js 16 App Router (TypeScript, Tailwind v4) · Supabase (Auth, Postgres + RLS) on a hosted project · Anthropic SDK for intent clustering · Vitest.

Next 16 notes: `middleware.ts` is now `src/proxy.ts`; `cookies()` is async; `LayoutProps`/`PageProps` are generated globals (`npm run typecheck` runs `next typegen` first).

## Commands
- `npm run dev` / `npm run build`
- `npm run typecheck` · `npm run lint` · `npm test` (offline unit tests)
- `npm run test:integration` — Vitest against the hosted DB (model stubbed); creates/deletes its own users
- `npm run e2e` — Playwright in local Chrome against the hosted DB; `E2E_LIVE_MODEL=1` adds the paid real-model spec. Note: every e2e import triggers an analysis (a paid model call when credits exist)
- `npm run db:push [-- --dry-run]` · `npm run db:types` — hosted project via `SUPABASE_DB_URL` in `.env.local` (session pooler :5432; the CLI login is a different Supabase account, so `supabase link` isn't used). Regenerate types after every migration.

## Privacy architecture (non-negotiable)
- **Raw export files never reach the server.** Imports are parsed in the browser; only normalized signals are sent.
- **Sensitive categories (PRD §7) are never stored** — dropped client-side and rejected by DB trigger (`reject_disallowed_signal`). They are locked to `collect=false, offer_mode='private'` by `enforce_sensitive_category_lock`.
- Every user-owned table has `user_id` + RLS `user_id = auth.uid()`. Linked rows use composite `(id, user_id)` FKs so cross-user links are impossible.
- `createAdminClient()` (secret key, bypasses RLS) is only for deleting the auth user. Never read vault data with it.
- `audit_events` is append-only for users — log consequential actions there.
- Keep the three layers distinct (PRD §8): raw signals · AI/rule-derived intents (`derived_by`) · user-confirmed facts (`user_confirmed`, `feedback`).
- Before sending anything to Claude, strip sensitive signals and send only the minimum fields needed.

## Layout
- `supabase/migrations/` — schema; `src/lib/taxonomy.ts` mirrors the category seed (enforced by `taxonomy.test.ts`).
- `src/lib/supabase/` — browser, server and proxy clients (typed with `src/lib/database.types.ts`).
- `src/lib/auth.ts` `requireUser()` — use in every signed-in page/action; `(app)/` route group is the signed-in shell.
- Import (`src/lib/import/`): parsers (Takeout JSON/zip, Chromium/Safari/Firefox SQLite via sql.js, Amazon CSV, generic CSV) → `prepareSignals` pipeline (window, URL minimization, `sensitive.ts`, excluded domains, disabled categories, day-level dedupe) — all inside `worker.ts` in the browser. Server actions in `(app)/import/actions.ts` re-check every batch with `guard.ts`. `public/sql-wasm.wasm` is copied by `postinstall`.
- `src/lib/classify/rules.ts` — deterministic category rules (first pass of the hybrid classifier).
- Intent engine (`src/lib/intents/`): `items.ts` collapses signals into ≤1500 de-duplicated summaries (only kind, date, domain, title/search text, rule category — never URL paths, amounts or IDs) → `model.ts` (Claude Sonnet 5.5, structured output, `fallbacks: "default"`) → `merge.ts` validates refs/keys/categories → `analyze.ts` writes as the user (RLS). The model groups and second-pass classifies; it never scores. Confidence = `base_strength` × 21-day half-life decay, computed in `score.ts`; `refreshDecay` reapplies it without a model call. User feedback columns are never overwritten by analysis. Stated interests become `derived_by: 'user'` intents immediately.
- Auth: email+password and magic link; email links land on `/auth/callback` (PKCE `code` or `token_hash`). Post-auth redirects go through `safeNext()`.
