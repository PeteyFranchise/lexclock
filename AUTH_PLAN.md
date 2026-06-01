# LexClock — Login / Account Layer Plan

How we get from "paste an API key" to "lawyer logs into our website." This is
the thing standing between the working prototype and the lawyer-ready product
described in `BUSINESS.md`.

## Where we are today

- **No login.** Users are provisioned by a CLI script
  (`backend/scripts/create-user.mjs`) that inserts a row in `public.users` and
  prints a one-time `lxk_...` API key.
- The frontend stores that key in Settings (`settings.apiKey`) and sends it as
  `Authorization: Bearer <key>`.
- The backend hashes the key and looks the user up:
  `backend/lib/auth.js → requireUser(req)` → `users.api_key_hash`.
- All data access uses the Supabase **service role** (bypasses RLS). RLS is on
  with **no permissive policies** — only server functions touch data.
- App data (entries, matters, drafts, settings) lives in the **browser's
  localStorage**, so it is single-device and not tied to an account.

## Decision: adopt **Supabase Auth** (not a hand-rolled auth)

Why:
- We're already on Supabase Postgres — Auth is built in.
- Gives email+password, magic link, Google OAuth, password reset, and session
  management for free, with JWTs the frontend can send as a bearer.
- Hand-rolling auth for a **legal** product is a security liability we don't want.
- The existing contract is stable: every endpoint already calls
  `requireUser(req)` (the `auth.js` comment literally anticipates this swap), so
  we change `requireUser` internals, not 6 endpoints.

`lxk_` API keys stay as a **secondary** mechanism for headless/admin/testing use;
cron keeps using `CRON_SECRET`. We are adding user login alongside, not ripping
out what works.

## Target architecture

```
Browser (index.html + @supabase/supabase-js, anon public key)
  │  user signs up / logs in → Supabase returns a session (JWT)
  │  backendFetch sends:  Authorization: Bearer <session.access_token>
  ▼
Vercel functions (api/*)  — requireUser(req) now VERIFIES the JWT
  │     supabase.auth.getUser(jwt) → auth.uid()  → public.users row
  ▼
Supabase Postgres — auth.users (managed) + public.users/profiles (app fields)
                    RLS policies: using (user_id = auth.uid())  [defense in depth]
```

Key idea: keep service-role data access in the API path for now (least churn);
add RLS per-user policies as defense-in-depth and to unlock future
direct-from-browser reads.

## Schema changes

`public.users.id` must equal `auth.users.id` so existing foreign keys
(`source_connections.user_id`, `drafts.user_id`, `audit_log.user_id`) keep
working unchanged.

- Add a trigger: on `auth.users` insert → insert a matching `public.users` row
  (id = auth uid, email). Standard Supabase `handle_new_user` pattern.
- Make `users.api_key_hash` **nullable** (login users won't have one; keep the
  column for `lxk_` admin keys).
- Add account/billing fields to `public.users`: `plan` (`solo|pro|firm`),
  `firm_name`, maybe `trial_ends_at` — ties to the pricing tiers in BUSINESS.md.
- Add per-user RLS policies (`using (user_id = auth.uid())`) on
  `source_connections`, `drafts`, `audit_log`.

The additive SQL lives in **`backend/db/auth.sql`** (run it after enabling
Supabase Auth; it does not touch the working API-key path in `schema.sql`).

## `requireUser` swap (the only backend logic change)

`backend/lib/auth.js` — make `requireUser` try a JWT first, fall back to the
API-key path so nothing breaks during migration:

```js
export async function requireUser(req) {
  const token = getBearer(req);
  if (!token) throw status(401, 'Missing Authorization bearer token.');

  // 1. Supabase Auth JWT (logged-in users)
  const { data: { user } } = await supabaseAuth.auth.getUser(token);
  if (user) {
    // ensure a public.users row exists (trigger normally handles this)
    return { id: user.id, email: user.email };
  }

  // 2. Fallback: legacy lxk_ API key (admin / headless / cron tooling)
  const { data } = await supabase.from('users')
    .select('id, email, display_name')
    .eq('api_key_hash', hashApiKey(token)).maybeSingle();
  if (data) return data;

  throw status(401, 'Invalid credentials.');
}
```

Endpoints (`api/drafts`, `api/notion/*`, etc.) are untouched.

## Frontend changes (`index.html`)

- Add `@supabase/supabase-js` (CDN) + a public `SUPABASE_URL` / anon key
  (safe to ship — anon key is meant for the browser).
- **Auth screens:** sign up, log in (email+password, magic link, and "Sign in
  with Google"), and forgot-password. Gate the app behind a session check on
  load; show the auth screen if no session.
- `backendFetch` sends `session.access_token` instead of `settings.apiKey`.
  Remove the "API Key" Settings field (keep "Backend URL" until we hardcode the
  prod base URL).
- Account menu: signed-in email, sign out, plan/upgrade entry point.
- **Data:** login MVP can ship while app data still lives in localStorage, but
  true multi-device requires moving entries/matters/settings to server tables
  (Phase D). Be explicit with users about which is live.

## Phasing (the map)

- **Phase A — Auth backend.** ✅ code done. `requireUser` now verifies the
  Supabase JWT first (skipping `lxk_` keys) and falls back to the API-key
  lookup (`backend/lib/auth.js`); `db/auth.sql` written (trigger, nullable
  api_key_hash, plan fields, RLS). *Remaining: enable Supabase Auth in the
  dashboard + run `db/auth.sql` once the project exists.*
- **Phase B — Auth frontend.** ✅ code done. Login gate in `index.html`
  (email+password, magic link, "Continue with Google", forgot-password, session
  gating, sign-out); `backendFetch` uses the JWT via `backendCredential()`.
  **Dormant until `SUPABASE_URL` + `SUPABASE_ANON_KEY` are set** near the top of
  the script — blank today, so the app runs exactly as before. *Untested against
  a live project; needs a real Supabase URL/anon key + Google OAuth provider
  configured to verify end-to-end.*
- **Phase C — Account management.** Profile/firm settings, plan/tier field,
  sign-out, delete-account, basic billing hooks (Stripe later).
- **Phase D — Server-side app data.** Migrate entries/matters/settings from
  localStorage to Postgres so accounts are multi-device; enforce the RLS
  policies for any direct-from-browser reads.
- **Phase E — Clio SSO.** Add "Sign in with Clio" / OAuth as a login provider
  for the marketplace front door.

## Decisions (resolved 2026-06-01)

1. **Ship login first** — data stays in localStorage for now; the server-side
   data migration is a later Phase D. Goal: validate login/onboarding with real
   lawyers before the bigger data lift. Be explicit with users that data is
   single-device until then.
2. **MVP login methods: email+password, magic link, AND Google OAuth** — all
   three at launch. Clio SSO still deferred to Phase E. (Google moves up from
   "later" into Phase B.)
3. **Keep `lxk_` API keys as a secondary path** — `requireUser` verifies a JWT
   first, falls back to the API-key lookup. Preserves headless/admin/cron use
   and the `create-user` CLI; nothing breaks mid-migration.
4. **Seed the `plan` field now** — `plan` (default `solo`) ships in `db/auth.sql`
   today (already written), matching BUSINESS.md tiers. Stripe billing is wired
   later in Phase C; no second migration needed.

> Prerequisite still stands: Phases A–B need the live Supabase + Vercel project
> (to enable Auth in the dashboard and get the anon key). Google OAuth also needs
> a Google Cloud OAuth client configured in Supabase Auth providers.

> Prerequisite: Phases A–B need the live Supabase project + Vercel deploy to
> exist first (to enable Auth in the dashboard and set the anon key). The
> additive `db/auth.sql` is ready to run the moment that project is up.
