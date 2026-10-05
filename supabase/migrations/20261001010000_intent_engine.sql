-- Intent engine (PRD §10, §11): stored strength before time decay, feedback timing, and a record of
-- each analysis run so users (and we) can see exactly what was sent to the model.

alter table public.intents
  add column base_strength      numeric(4,3) not null default 0 check (base_strength between 0 and 1),
  add column purchase_completed boolean not null default false,
  add column feedback_at        timestamptz,
  add column analyzed_at        timestamptz;

comment on column public.intents.base_strength is
  'Strength of the evidence ignoring age; confidence = base_strength x recency decay (src/lib/intents/score.ts).';

create type public.analysis_status as enum ('running', 'succeeded', 'failed');

create table public.analysis_runs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  status             public.analysis_status not null default 'running',
  model              text not null,
  signals_considered int not null default 0,
  items_sent         int not null default 0,  -- de-duplicated summaries actually sent to the model
  intents_found      int not null default 0,
  signals_classified int not null default 0,
  signals_removed    int not null default 0,  -- flagged sensitive by the model and deleted
  input_tokens       int,
  output_tokens      int,
  error              text,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz
);

create index analysis_runs_user_idx on public.analysis_runs (user_id, started_at desc);

alter table public.analysis_runs enable row level security;
create policy "own runs: select" on public.analysis_runs for select to authenticated using (user_id = auth.uid());
create policy "own runs: insert" on public.analysis_runs for insert to authenticated with check (user_id = auth.uid());
create policy "own runs: update" on public.analysis_runs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Only one analysis per user at a time.
create unique index analysis_runs_one_running on public.analysis_runs (user_id) where status = 'running';
