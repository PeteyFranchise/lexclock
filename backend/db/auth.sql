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
