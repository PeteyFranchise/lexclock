# LexClock — Deployment Runbook

Get from the working prototype to a live, logged-in product. Steps marked
**[you]** need your accounts / a browser; steps marked **[cli]** I can run with
you once you're logged in. Do them in order.

Prereqs already done: backend code compiles, deps installed (`backend/node_modules`),
Vercel CLI available via `npx vercel`. Auth code is in place but dormant until
step 6.

---

## 1. Create the Supabase project — [you]
1. supabase.com → New project. Pick a region near your users; save the DB password.
2. Project Settings → **API**. Copy these three (used below):
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY` (safe in the browser)
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, secret)

## 2. Run the database schema — [you]
Supabase → **SQL Editor** → New query. Run these two files **in order**:
1. Paste all of `backend/db/schema.sql` → Run.
2. Paste all of `backend/db/auth.sql` → Run. *(adds accounts, the signup
   trigger, plan field, RLS — must run after schema.sql.)*

## 3. Enable Auth providers — [you]
Supabase → **Authentication → Providers**:
- **Email** — enable. (Email+password and magic link both come from this.)
- **Google** — enable, then paste a Google OAuth **Client ID + Secret**:
  - Google Cloud Console → APIs & Services → Credentials → Create OAuth client
    (type: Web application).
  - Authorized redirect URI: the value Supabase shows on the Google provider
    page (looks like `https://<project>.supabase.co/auth/v1/callback`).
- Authentication → **URL Configuration** → set **Site URL** to your deployed
  frontend origin (from step 5), and add it to **Redirect URLs**.

## 4. Deploy the backend to Vercel — [cli, with you]
From `backend/`:
```bash
npx vercel login        # interactive — your browser/account
npx vercel link         # create/link the project
npx vercel --prod       # first production deploy
```
Note the deploy URL (e.g. `https://lexclock-backend.vercel.app`).

## 5. Set backend env vars — [cli, with you]
Set each in the Vercel dashboard (Project → Settings → Environment Variables)
**or** via CLI, then redeploy:
```bash
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add ANTHROPIC_API_KEY production      # server-side estimates
npx vercel env add CRON_SECRET production            # long random string
npx vercel env add ALLOWED_ORIGINS production         # your frontend origin
# optional: AI_MODEL  (defaults to claude-haiku-4-5-20251001)
npx vercel --prod                                     # redeploy with env
```
Smoke test: `curl https://<deploy>/api/health` → `{"ok":true,...}` with
`config.supabase: true`, `config.anthropic: true`.

## 6. Turn on login in the frontend — [cli, with you]
In `index.html`, set the two constants (near `const AI_MODEL`):
```js
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = '<anon public key>';
```
Also point the app at the backend — either set the **Backend URL** in Settings
to your Vercel deploy URL, or hardcode `apiBaseUrl` if frontend+backend share an
origin. Deploy the frontend (GitHub Pages or Vercel). Once these are set, the
login gate activates automatically.

## 7. (Optional) Make an admin / test user — [cli]
For headless testing without the login UI:
```bash
cd backend
npx vercel env pull .env.local       # pulls SUPABASE_URL + service role locally
npm run create-user you@firm.com "Your Name"
# prints a one-time lxk_... key — paste into Settings → API Key for admin access
```

---

## Verify end-to-end
1. Open the deployed frontend → you should hit the **login gate**.
2. Sign up with email, or "Continue with Google" → land in the app.
3. Settings → set Backend URL → **Test connection** → "Backend connected".
4. Add a Notion token + DB id → Review → **Sync Notion** → drafts appear.
5. Approve a draft → check the Supabase `drafts` row flips to `approved` and an
   `audit_log` row is written.

## Rollback / safety
- Login is gated by the two frontend constants — blank them to instantly revert
  to the no-login localStorage prototype.
- The `lxk_` API-key path still works alongside JWT auth, so existing tooling and
  cron are unaffected.
