# IntentBank
They Ask. You Decide.

See the commercial profile hiding inside your own data. Spec: [IntentBank-PRD](IntentBank-PRD).

## Setup

```bash
npm install                  # also copies sql.js's wasm into public/
cp .env.example .env.local   # Supabase keys, SUPABASE_DB_URL, ANTHROPIC_API_KEY
npm run db:push              # applies supabase/migrations to the hosted project
npm run dev
```

Supabase dashboard → Authentication → URL Configuration: Site URL `http://localhost:3000`, Redirect URLs `http://localhost:3000/**`.

## Checks

```bash
npm run typecheck && npm run lint && npm test   # offline
npm run test:integration                        # hosted DB, model stubbed
npm run e2e                                     # Playwright + local Chrome, hosted DB
E2E_LIVE_MODEL=1 npm run e2e                    # + real Claude analysis (paid)
```

Integration and e2e tests create throwaway `@example.com` users and delete them afterwards.
