-- LexClock — combined setup (generated convenience copy of schema.sql + auth.sql).
-- Run this once in the Supabase SQL Editor. Order matters; it is preserved here.

-- LexClock backend schema (Supabase / Postgres)
-- Run this in the Supabase SQL editor, or via `supabase db push`.
--
-- Design principles (see ROADMAP "Cross-cutting principles"):
--   * Nothing bills without approval  -> drafts.status defaults to 'pending'.
--   * Always show the evidence         -> drafts.evidence + drafts.confidence.
--   * Client confidentiality first     -> tokens isolated, audit_log on every action,
--                                         data minimization (we store task titles, not
--                                         full document bodies).
--
-- NOTE: Source secrets (Notion token, etc.) live ONLY in source_connections,
-- never in client JS. Restrict table access with RLS + the service role key,
-- which is used exclusively by server-side functions.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Users. v1 auth is a per-user API key (bearer token) the frontend sends.
-- Swap for Supabase Auth / Clio SSO later without touching the draft contract.
-- ---------------------------------------------------------------------------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  display_name  text,
  -- sha-256 hex of the API key; the raw key is shown once at creation.
  api_key_hash  text unique not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Source connections: OAuth / integration tokens per user per source.
-- One row per (user, source). `secret` is the Notion integration token today;
-- `refresh_token` is for OAuth sources (Google/Microsoft) later.
-- ---------------------------------------------------------------------------
create table if not exists source_connections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  source         text not null check (source in ('notion','workspace','calendar','phone')),
  secret         text,                 -- integration token / access token
  refresh_token  text,                 -- OAuth refresh token (server-only)
  config         jsonb not null default '{}'::jsonb,  -- e.g. {databaseId, matterProperty}
  cursor         text,                 -- incremental sync cursor (last_edited_time, page token)
  status         text not null default 'active' check (status in ('active','revoked','error')),
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, source)
);

-- ---------------------------------------------------------------------------
-- Drafts: the server-side mirror of the client's localStorage drafts.
-- Same shape the client already calls addDraft() with, so the Review hub UI
-- is unchanged. external_id + source give idempotency for repeated syncs.
-- ---------------------------------------------------------------------------
create table if not exists drafts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  source            text not null,
  external_id       text,             -- e.g. Notion page id (dedupe key)
  matter_id         text,             -- LexClock matter id (client-owned namespace)
  entry_date        date not null default current_date,
  estimated_seconds integer not null default 0,
  description       text not null default '',
  billable          boolean not null default true,
  confidence        numeric,          -- 0..1, advisory only
  evidence          text not null default '',
  status            text not null default 'pending' check (status in ('pending','approved','discarded')),
  created_at        timestamptz not null default now(),
  -- A given external item produces at most one live draft per user+source.
  unique (user_id, source, external_id)
);

create index if not exists drafts_user_status_idx on drafts (user_id, status);

-- ---------------------------------------------------------------------------
-- Audit trail: append-only record of every privileged action, required for
-- the Clio marketplace security review and client-confidentiality posture.
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references users(id) on delete set null,
  action     text not null,           -- 'notion.sync', 'draft.create', 'draft.approve', ...
  source     text,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_user_idx on audit_log (user_id, created_at desc);

-- Keep updated_at fresh on source_connections.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists source_connections_updated_at on source_connections;
create trigger source_connections_updated_at
  before update on source_connections
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: lock every table. Server functions use the service-role
-- key (which bypasses RLS); no anonymous/browser access to secrets or drafts.
-- ---------------------------------------------------------------------------
alter table users              enable row level security;
alter table source_connections enable row level security;
alter table drafts             enable row level security;
alter table audit_log          enable row level security;
-- No permissive policies are defined on purpose: only the service role
-- (server-side) can read/write. Add per-user policies when Supabase Auth lands.


-- ============================================================
-- auth.sql (accounts / login layer)
-- ============================================================

-- LexClock — Supabase Auth migration (ADDITIVE; run AFTER schema.sql).
--
-- Turns the API-key-only model into real accounts. Safe to run on top of an
-- existing schema.sql database: it does not drop or rewrite any table, and the
-- legacy lxk_ API-key path keeps working (api_key_hash just becomes optional).
--
-- Prerequisite: enable Supabase Auth in the dashboard first (it owns auth.users).
-- See AUTH_PLAN.md (Phase A).

-- ---------------------------------------------------------------------------
-- 1. Account / billing fields on public.users (match BUSINESS.md tiers).
--    api_key_hash becomes nullable: login users authenticate via JWT, not a key.
-- ---------------------------------------------------------------------------
alter table users alter column api_key_hash drop not null;

alter table users add column if not exists plan          text not null default 'solo'
  check (plan in ('solo','pro','firm'));
alter table users add column if not exists firm_name     text;
alter table users add column if not exists trial_ends_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Link Supabase Auth users to our app rows.
--    public.users.id is set equal to auth.users.id so every existing foreign
--    key (source_connections.user_id, drafts.user_id, audit_log.user_id) keeps
--    pointing at the right account with no change.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data->>'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. RLS policies (defense in depth).
--    The API path uses the service role and bypasses RLS, so these are not
--    required for current endpoints. They (a) harden the DB and (b) let the
--    browser eventually read its OWN drafts directly with the user's JWT.
--
--    NOTE: source_connections holds secrets (Notion token, refresh tokens).
--    We deliberately add NO user policy there — it stays server-role only.
-- ---------------------------------------------------------------------------

-- A user can see and edit their own profile row.
drop policy if exists users_self on users;
create policy users_self on users
  for select to authenticated
  using (id = auth.uid());

-- A user owns their drafts (the Review hub may read these directly later).
drop policy if exists drafts_own on drafts;
create policy drafts_own on drafts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A user can read their own audit trail (append-only; writes stay server-side).
drop policy if exists audit_own_read on audit_log;
create policy audit_own_read on audit_log
  for select to authenticated
  using (user_id = auth.uid());

-- source_connections: no policy on purpose -> only the service role can touch
-- secrets. Do not add a permissive policy here.
