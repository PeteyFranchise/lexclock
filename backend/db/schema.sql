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
