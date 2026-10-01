@AGENTS.md

# IntentBank

Consumer-controlled personal intent vault. Product spec: `IntentBank-PRD`. Current scope: **V0 — Personal IntentBank** (PRD §27). No advertiser marketplace yet.

## Stack
Next.js 16 App Router (TypeScript, Tailwind v4) · Supabase (Auth, Postgres + RLS) on a hosted project · Anthropic SDK for intent clustering · Vitest.

Next 16 notes: `middleware.ts` is now `src/proxy.ts`; `cookies()` is async; `LayoutProps`/`PageProps` are generated globals (`npm run typecheck` runs `next typegen` first).

## Commands
- `npm run dev` / `npm run build`
- `npm run typecheck` · `npm run lint` · `npm test`

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
- `src/lib/supabase/` — browser, server and proxy clients.
