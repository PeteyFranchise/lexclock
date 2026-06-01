# LexClock Backend

Serverless backend for LexClock's automatic biller — **Vercel functions +
Supabase Postgres + Vercel Cron**. It exists to do the things a static page
cannot: store source secrets off the device, call third-party APIs server-side
(no CORS), and run scheduled pulls so drafts appear without the app being open.

The first capability it delivers is **live Notion sync** — the exact thing the
browser prototype proved impossible (Notion blocks direct browser calls). The
client keeps its `addDraft`-shaped contract; only storage + the fetch move
server-side.

## Architecture

```
Frontend (index.html, GitHub Pages)
        │  Authorization: Bearer <user apiKey>
        ▼
Vercel serverless functions  (api/)
  ├─ GET  /api/health            liveness + config sanity
  ├─ POST /api/notion/connect    store Notion token + DB id (secret -> Postgres)
  ├─ POST /api/notion/sync       on-demand: pull today's tasks -> drafts
  ├─ GET  /api/drafts            list this user's drafts (Review hub)
  ├─ POST /api/drafts            create a manual draft / approve / discard
  └─ GET  /api/cron/nightly      Vercel Cron: sync every active connection
        │
        ▼
Supabase Postgres  (db/schema.sql)
  users · source_connections · drafts · audit_log   (RLS on; service role only)
```

Shared logic lives in `lib/`: `supabase.js` (service-role client + `audit`),
`auth.js` (bearer-token user lookup + cron guard), `cors.js` (`withApi` wrapper),
`notion.js` (page mapping — same logic as the client), `estimate.js` (Claude +
heuristic fallback), `notionSync.js` (the pipeline both sync routes call).

## Setup

1. **Create the Supabase project**, then run `db/schema.sql` in the SQL editor.
2. **Configure env vars** — copy `.env.example` to `.env.local` (for `vercel dev`)
   and set the same keys in the Vercel dashboard:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` (+ optional `AI_MODEL`)
   - `CRON_SECRET` (long random string)
   - `ALLOWED_ORIGINS` (your frontend origin)
3. **Install + run locally**:
   ```bash
   cd backend
   npm install
   vercel dev          # serves the functions locally
   curl localhost:3000/api/health
   ```
4. **Provision a user / API key**:
   ```bash
   vercel env pull .env.local        # pull Supabase keys locally
   npm run create-user you@firm.com "Your Name"
   # prints a one-time  lxk_...  key — store it; the frontend sends it as a bearer.
   ```
5. **Deploy**: `vercel --prod`. The cron in `vercel.json` runs `/api/cron/nightly`
   daily at 04:00 UTC; Vercel auto-authenticates it with `CRON_SECRET`.

## Connecting the frontend (next step)

The client currently calls `notionApiQuery` in the browser and hits CORS. To go
live, point `syncNotionTasks` at the backend instead:

```js
// Connect once (from Settings):
await fetch(`${API_BASE}/api/notion/connect`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({ token, databaseId, matterProperty }),
});

// Sync (from the Review hub "Sync Notion" button):
const r = await fetch(`${API_BASE}/api/notion/sync`, {
  method: 'POST', headers: { authorization: `Bearer ${apiKey}` },
}).then((res) => res.json());

// Load drafts the cron created overnight:
const { drafts } = await fetch(`${API_BASE}/api/drafts?status=pending`, {
  headers: { authorization: `Bearer ${apiKey}` },
}).then((res) => res.json());
```

The draft objects returned match the client's draft shape (source, matterId,
estimatedSeconds, description, confidence, evidence), so the Review hub renders
them unchanged. Matter mapping stays client-side against the user's own matters.

## Security posture (for the eventual Clio review)

- **Secrets off-device.** Source tokens live only in `source_connections`, read
  by the service role; the browser never sees them.
- **RLS on every table.** No anonymous policies; only server functions (service
  role) touch the data.
- **Audit trail.** `audit_log` records every sync, connect, and draft decision.
- **Data minimization.** We store task titles + timestamps, not full document
  bodies. Nothing bills without the lawyer's approval (drafts stay `pending`).

## Roadmap fit

This unblocks: live Notion (P4), Google Workspace (P5), Calendar (#5), phone
(P7), and the end-of-day digest (P8 — add an email service such as Resend and a
second cron). Each new source adds a `lib/<source>.js` + a sync route and reuses
`drafts`, `audit_log`, and the cron.
