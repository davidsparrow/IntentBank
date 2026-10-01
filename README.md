# IntentBank
They Ask. You Decide.

See the commercial profile hiding inside your own data. Spec: [IntentBank-PRD](IntentBank-PRD).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Anthropic keys
supabase link --project-ref <ref>
supabase db push             # applies supabase/migrations
npm run dev
```

## Checks

```bash
npm run typecheck && npm run lint && npm test
```
