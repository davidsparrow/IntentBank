-- IntentBank V0 core schema (PRD §6, §7, §27, §38).
--
-- Every user-owned row carries user_id and is guarded by RLS (auth.uid() = user_id).
-- Raw export files never reach the server: imports are parsed in the browser and only
-- normalized signals are inserted. Sensitive-category signals are dropped client-side
-- and additionally rejected here by trigger.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.offer_mode as enum ('private', 'ask', 'auto');

create type public.source_kind as enum (
  'google_takeout', 'chrome_history', 'amazon_orders', 'csv', 'manual'
);

create type public.source_status as enum (
  'importing', 'imported', 'classifying', 'ready', 'error'
);

create type public.signal_kind as enum (
  'visit', 'search', 'purchase', 'video', 'saved', 'subscription', 'stated'
);

-- Who produced a classification or intent: deterministic rules, Claude, or the user.
create type public.provenance as enum ('rule', 'ai', 'user');

-- PRD §11 lifecycle, plus terminal states driven by user feedback.
create type public.intent_state as enum (
  'emerging', 'active', 'strong', 'cooling', 'dormant', 'purchased', 'dismissed'
);

create type public.intent_feedback as enum (
  'still_shopping', 'already_bought', 'just_researching', 'not_interested'
);

create type public.audit_actor as enum ('user', 'system', 'agent');

-- ---------------------------------------------------------------------------
-- Reference data: categories
-- ---------------------------------------------------------------------------

create table public.categories (
  slug         text primary key,
  name         text not null,
  description  text not null,
  is_sensitive boolean not null default false,
  sort_order   int not null default 0
);

insert into public.categories (slug, name, description, is_sensitive, sort_order) values
  ('shopping',      'Shopping',               'General retail, apparel, gifts and everyday purchases', false, 10),
  ('travel',        'Travel',                 'Trips, flights, hotels, destinations',                 false, 20),
  ('automotive',    'Automotive',             'Vehicles, EVs, parts, insurance quotes for vehicles',   false, 30),
  ('home',          'Home',                   'Remodeling, appliances, furniture, garden, real estate',false, 40),
  ('technology',    'Technology',             'Devices, software, electronics, developer tools',      false, 50),
  ('entertainment', 'Entertainment',          'Streaming, games, events, books, music',               false, 60),
  ('food',          'Food',                   'Groceries, restaurants, kitchen, meal kits',           false, 70),
  ('education',     'Education',              'Courses, degrees, learning platforms',                 false, 80),
  ('professional',  'Professional interests', 'Career, B2B tools, industry research',                 false, 90),
  -- Sensitive (PRD §7): never monetized, never collected in V0.
  ('health',                 'Health',                 'Medical, conditions, pharmacy, mental health', true, 900),
  ('precise_location',       'Precise location',       'Home address, real-time whereabouts',          true, 910),
  ('finance',                'Personal finances',      'Debt, credit, bankruptcy, loans, income',      true, 920),
  ('politics',               'Political activity',     'Parties, campaigns, causes, voting',           true, 930),
  ('religion',               'Religion',               'Faith, worship, religious organizations',      true, 940),
  ('sexuality',              'Sexuality',              'Sexual orientation, dating, adult content',    true, 950),
  ('children',               'Children',               'Information about minors',                     true, 960),
  ('private_communications', 'Private communications', 'Email bodies, messages, chats',                true, 970);

alter table public.categories enable row level security;
create policy "categories readable by signed-in users"
  on public.categories for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  onboarded_at timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "own profile: select" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile: update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Category permissions (PRD §6 Permission, §35 three modes)
-- ---------------------------------------------------------------------------

create table public.category_permissions (
  user_id          uuid not null references auth.users(id) on delete cascade,
  category_slug    text not null references public.categories(slug),
  collect          boolean not null default true,   -- may detect + store
  offer_mode       public.offer_mode not null default 'private',
  min_price_cents  int check (min_price_cents is null or min_price_cents >= 0),
  updated_at       timestamptz not null default now(),
  primary key (user_id, category_slug)
);

-- Sensitive categories are locked: not collected, never offered.
create function public.enforce_sensitive_category_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.categories c where c.slug = new.category_slug and c.is_sensitive) then
    new.collect := false;
    new.offer_mode := 'private';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger category_permissions_sensitive_lock
  before insert or update on public.category_permissions
  for each row execute function public.enforce_sensitive_category_lock();

alter table public.category_permissions enable row level security;
create policy "own permissions: select" on public.category_permissions for select to authenticated using (user_id = auth.uid());
create policy "own permissions: insert" on public.category_permissions for insert to authenticated with check (user_id = auth.uid());
create policy "own permissions: update" on public.category_permissions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Excluded domains (PRD §9: allow sites to be excluded)
-- ---------------------------------------------------------------------------

create table public.excluded_domains (
  user_id    uuid not null references auth.users(id) on delete cascade,
  domain     text not null check (domain = lower(domain)),
  created_at timestamptz not null default now(),
  primary key (user_id, domain)
);

alter table public.excluded_domains enable row level security;
create policy "own excluded domains: all" on public.excluded_domains for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Vault sources (one per import)
-- ---------------------------------------------------------------------------

create table public.vault_sources (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         public.source_kind not null,
  label        text not null,
  status       public.source_status not null default 'importing',
  signal_count int not null default 0,
  dropped_sensitive_count int not null default 0, -- filtered client-side, reported for transparency
  dropped_excluded_count  int not null default 0,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id) -- target for owner-matching composite FKs
);

create index vault_sources_user_idx on public.vault_sources (user_id, created_at desc);

alter table public.vault_sources enable row level security;
create policy "own sources: all" on public.vault_sources for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Signals (PRD §6: individual behavioral observation — the "raw" layer)
-- ---------------------------------------------------------------------------

create table public.signals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  source_id       uuid not null,
  kind            public.signal_kind not null,
  occurred_at     timestamptz not null,
  title           text,
  url             text,
  domain          text,
  query           text,
  amount_cents    int,
  category_slug   text references public.categories(slug),
  classified_by   public.provenance,
  dedupe_key      text not null, -- stable hash of (kind, occurred_at, url|query|title); prevents re-import dupes
  created_at      timestamptz not null default now(),
  unique (user_id, dedupe_key),
  unique (id, user_id),
  foreign key (source_id, user_id) references public.vault_sources(id, user_id) on delete cascade
);

create index signals_user_time_idx on public.signals (user_id, occurred_at desc);
create index signals_user_category_idx on public.signals (user_id, category_slug);
create index signals_source_idx on public.signals (source_id);

-- Defense in depth: never store a signal in a sensitive or user-disabled category.
create function public.reject_disallowed_signal()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.category_slug is null then
    return new;
  end if;
  if exists (select 1 from public.categories c where c.slug = new.category_slug and c.is_sensitive) then
    raise exception 'signals in sensitive category % are not stored', new.category_slug
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.category_permissions p
    where p.user_id = new.user_id and p.category_slug = new.category_slug and not p.collect
  ) then
    raise exception 'collection disabled for category %', new.category_slug
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger signals_reject_disallowed
  before insert or update of category_slug on public.signals
  for each row execute function public.reject_disallowed_signal();

alter table public.signals enable row level security;
create policy "own signals: all" on public.signals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Intents (PRD §6, §10, §11 — the AI-derived / user-confirmed layer)
-- ---------------------------------------------------------------------------

create table public.intents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  category_slug     text not null references public.categories(slug),
  key               text not null,           -- stable machine key, e.g. 'home/induction-range'
  label             text not null,           -- 'Premium Induction Range'
  explanation       text,                    -- "Why IntentBank thinks this"
  confidence        numeric(4,3) not null check (confidence between 0 and 1),
  state             public.intent_state not null default 'emerging',
  derived_by        public.provenance not null,
  user_confirmed    boolean not null default false,
  feedback          public.intent_feedback,
  purchase_horizon  text,                    -- '0–30 days'
  commercial_value  text check (commercial_value in ('low', 'medium', 'high')),
  signal_count      int not null default 0,
  source_count      int not null default 0,
  first_signal_at   timestamptz,
  last_signal_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, key),
  unique (id, user_id)
);

create index intents_user_state_idx on public.intents (user_id, state, confidence desc);

alter table public.intents enable row level security;
create policy "own intents: all" on public.intents for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Composite FKs guarantee an intent can only link signals owned by the same user.
create table public.intent_signals (
  intent_id uuid not null,
  signal_id uuid not null,
  user_id   uuid not null references auth.users(id) on delete cascade,
  weight    numeric(4,3) not null default 1 check (weight between 0 and 1),
  primary key (intent_id, signal_id),
  foreign key (intent_id, user_id) references public.intents(id, user_id) on delete cascade,
  foreign key (signal_id, user_id) references public.signals(id, user_id) on delete cascade
);

create index intent_signals_signal_idx on public.intent_signals (signal_id);

alter table public.intent_signals enable row level security;
create policy "own intent_signals: all" on public.intent_signals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Audit events (PRD §24 Trust Ledger precursor) — append-only for users
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  actor        public.audit_actor not null,
  action       text not null,              -- 'source.imported', 'signal.deleted', 'intent.feedback', ...
  subject_type text,
  subject_id   text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index audit_events_user_time_idx on public.audit_events (user_id, created_at desc);

alter table public.audit_events enable row level security;
create policy "own audit: select" on public.audit_events for select to authenticated using (user_id = auth.uid());
create policy "own audit: insert" on public.audit_events for insert to authenticated with check (user_id = auth.uid());
-- No update/delete policies: users cannot rewrite history. Rows are removed only by account deletion cascade.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger vault_sources_touch before update on public.vault_sources
  for each row execute function public.touch_updated_at();
create trigger intents_touch before update on public.intents
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- New-user bootstrap: profile + default category permissions
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  -- Default every category to Private (PRD §41: nothing is monetized without an explicit choice).
  insert into public.category_permissions (user_id, category_slug)
    select new.id, c.slug from public.categories c;
  insert into public.audit_events (user_id, actor, action)
    values (new.id, 'system', 'account.created');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
