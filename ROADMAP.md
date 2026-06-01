# LexClock Roadmap — Automatic Biller

The vision: LexClock watches where a lawyer actually does work (email, Notion,
Google Workspace, phone), estimates the billable time for each item, lets the
lawyer approve or amend every entry, and emails an end-of-day dashboard plus an
updated billing spreadsheet — to the lawyer and, optionally, their firm.

This file tracks what is built, what is next, and the constraints that shape the
order of the work. Target home: the Clio marketplace.

---

## Where we are today

- **Phase 1 — Manual billing core.** Timers, manual email-tier logging,
  clients/matters, rates/increments, log + export. (Single-file app, state in
  `localStorage`.)
- **Phase 2 — AI + email sync.** Claude email analysis (tier, time, narrative)
  and Gmail OAuth read-only sync. *Live OAuth/AI verified via mocks; needs an
  HTTPS host + real keys to exercise end-to-end.*
- **Review & Approve hub (just shipped).** A dedicated **Review** tab where
  auto-suggested time entries ("drafts") land. Each draft shows its **source**,
  a **confidence** badge, and **evidence**, and is fully editable (description,
  matter, date, hours, billable) before **Approve to Log**, **Save Changes**, or
  **Discard**. Includes **Approve All**, a manual draft form, a pending-count
  badge in the nav, and a dashboard Quick Start link.
  - This is the **hub every future integration plugs into.** Each new source
    (Notion, Workspace, phone, research) just needs to call
    `addDraft({ source, matterId, date, estimatedSeconds, description,
    confidence, evidence })`. No new review UI required.
- **Revenue-capture layer (just shipped).** Four client-side features that help
  the lawyer capture more money and log faster — all feeding the Review hub, so
  nothing bills without approval:
  - **Missing-time reconciliation.** A dashboard "Time check" compares today's
    logged hours (entries + running timers) against a configurable **Workday
    Target** (Settings; default 8h, `0` hides it). It surfaces the unaccounted
    gap with a one-field capture form → billable draft.
    (`getReconciliation`, `renderReconcileCardHtml`.)
  - **Narrative write-down linter.** Per-draft "Polish description" runs Claude
    to score billing-readiness (0–100), flag write-down risks (vague, block
    billing, wrong tense, clerical phrasing), and offer a past-tense rewrite the
    lawyer can accept. (`lintDescriptionWithClaude`, `runDraftLint`.) This is the
    inline half of Phase 6.
  - **Quick natural-language capture.** A dashboard box parses plain text like
    `call w/ Acme re lease 0.3` or `drafted motion 1h30m` into hours + matter +
    description → draft. (`parseQuickCapture`.)
  - **Under-billing nudges.** Live "Will bill X · $Y" readouts on the email-log
    and draft cards; entering time below the selected email tier's default
    triggers a warning + one-click bump. (`updateEmailBillNudge`,
    `draftBillNudgeHtml`.)

---

## The architecture decision (gates most of what's left)

Today everything runs in the browser with `localStorage`. The remaining features
need capabilities a static page cannot provide:

- **Scheduled jobs** — the end-of-day digest must run even when the browser is
  closed.
- **Webhooks** — phone systems push call events to a URL.
- **Secure OAuth + token storage** — Notion / Google / phone client secrets and
  refresh tokens must not live in client JS.
- **Server-side API calls** — avoid CORS limits and keep keys off the device.
- **Sending email** — needs a mail service (Postmark/SES/Resend).

**Decision made → backend scaffolded (`backend/`, Vercel + Supabase).** The
serverless backend now exists as a deployable scaffold:
- **Stack:** Vercel serverless functions + Supabase Postgres + Vercel Cron
  (Anthropic server-side; Resend to be added for the Phase 8 digest).
- **Schema (`db/schema.sql`):** `users` (bearer-key auth), `source_connections`
  (per-source tokens/config/cursor, secrets server-only), `drafts` (server
  mirror of the client draft shape, idempotent per `external_id`), and an
  append-only `audit_log`. RLS on every table; service-role access only.
- **Endpoints (`api/`):** `health`, `notion/connect` (stores the token
  off-device), `notion/sync` (on-demand pull → drafts), `drafts`
  (list/create/approve/discard), and `cron/nightly` (Vercel Cron, daily,
  syncs every active connection). Shared pipeline in `lib/notionSync.js`;
  Notion mapping (`lib/notion.js`) and the Claude/heuristic estimator
  (`lib/estimate.js`) are lifted straight from the proven client prototype.
- **Security posture** baked in for the eventual Clio review: secrets
  off-device, audit trail, data minimization (task titles, not document
  bodies), nothing bills without approval.
- **Status:** code complete + unit-verified (mapping + heuristic). Going live
  needs a Supabase project + Vercel deploy + env vars (see `backend/README.md`),
  then pointing the client's `syncNotionTasks` at the API.

Until each integration is wired to the backend, it can still be prototyped
client-side in a limited "generate while the app is open" mode (as Notion is).

---

## Phased plan

### Phase 3 — Review hub ✅ (done)
The override/amend surface. Foundation for everything below.

### Phase 4 — First activity source: Notion *(client-side prototype shipped)*
- **Prototype (shipped, client-side).** A **"Pull from a source"** card in the
  Review hub with **Sync Notion** and **Try sample tasks**. The full pipeline is
  built and wired to the Review hub:
  - Config in Settings → **Activity Sources → Notion Tasks**: integration token
    (`notionToken`), tasks Database ID (`notionDatabaseId`), and an optional
    matter property (`notionMatterProperty`); with a `notionToken` help entry
    covering integration setup + DB sharing.
  - `notionApiQuery` queries the DB for pages edited today; `mapNotionPage` /
    `extractNotionTitle` / `extractNotionProp` normalize each page; the **sample
    path feeds the identical shape** so the pipeline is provable today.
  - `estimateTaskWithClaude` estimates billable minutes + writes a past-tense
    narrative; `heuristicTaskEstimate` is the no-key fallback (minutes from the
    edit span). `matchMatterByText` maps each task → matter (reuses the
    quick-capture matcher). Each lands via `addDraft({ source: 'notion', ... })`
    with confidence + evidence (task title, matter hint, reasoning).
- **Confirmed limitation → forces the backend.** Notion's API **blocks direct
  browser calls (CORS)**; `notionApiQuery` detects this (`NOTION_CORS`) and the
  UI routes the lawyer to the sample path + the backend note. So **live** Notion
  sync — and secure token storage + scheduled pulls — is exactly what Phase 4/(a)
  the backend delivers. The client contract (`addDraft`-shaped) stays identical
  when the fetch moves server-side.
- **Next:** stand up the backend so `notionApiQuery` runs server-side with the
  token in the DB, on a nightly schedule.

### Phase 5 — Google Workspace activity
- Drive Activity API + Docs revision history + Calendar.
- "What was touched, by whom, when" → time signal (e.g. doc edited across a
  span → estimated duration) → drafts.
- **Dependency:** backend + Google OAuth (Workspace scopes trigger Google
  verification/security review).

### Phase 6 — Task-description coaching ✅ (done)
- A Claude-powered linter: given a Notion task title (or any draft
  description), score whether it is "billing-ready" and rewrite vague entries
  into proper past-tense narratives.
- Two surfaces, both shipped:
  - (a) inline in the Review hub ("improve this description") — ✅ **shipped**
    as "Polish description" on every draft card (`lintDescriptionWithClaude`,
    `runDraftLint`).
  - (b) guidance/templates teaching the lawyer how to title tasks so they read
    well automatically — ✅ **shipped** as the **Billing-ready writing** guide
    (`WRITING_GUIDE`, `renderWritingGuideHtml`, `openWritingGuide`). A modal
    opened from the Review hub header ("Writing guide") and an inline link on
    the manual-draft form. Covers the narrative formula (past-tense verb + what
    + re: subject), strong verb starters, weak→billing-ready rewrite examples,
    write-down risks to avoid, and tap-to-use templates that pre-fill a draft.
- Client-side; the linter reuses the existing Anthropic integration, the guide
  is static content + template insertion (no API).

### Phase 7 — Phone call tracking
- Per-provider integration (Twilio / Aircall / RingCentral / Dialpad). Pull
  call logs + duration, or receive webhooks.
- Match caller → client/matter; call duration seeds the estimate; optional
  transcript → Claude narrative → drafts.
- **Dependency:** backend (webhooks) + provider OAuth/API keys. Start with the
  provider the firm actually uses.

### Phase 8 — End-of-day digest + billing spreadsheet
- Scheduled job compiles the day's approved entries into:
  - an **HTML email dashboard** (hours, $, by matter, drafts still pending),
  - an attached/linked **billing spreadsheet** (CSV/XLSX).
- Configurable recipients: **lawyer only**, or **lawyer + boss** — gated and
  opt-in (visibility of billing to a supervisor is sensitive).
- **Dependency:** backend + scheduler + email service.

### Phase 9 — Claude research history *(blocked — design around it)*
- **Hard limit:** there is **no API to read a user's Claude.ai conversation
  history.** It is not exposed.
- Options: (a) capture research *inside* LexClock by routing it through the
  app's own Claude calls (so we own the log), (b) use a Claude data export if/
  when one exists, or (c) drop this source and rely on Notion/Workspace/calls.
- Plan around (a) or (c); do not promise reading existing claude.ai chats.

### Phase 10 — Clio marketplace integration & compliance
- Push approved entries straight into Clio (Activities API) instead of manual
  export.
- Complete Clio marketplace security review; finalize privacy posture for
  confidential client data.

---

## Backend scope for #5 (Calendar → drafts) and #6 (WIP / realization)

These are the two remaining items from the revenue-capture list. **#6 can ship
first, client-side; #5 is what forces the backend.**

### #6 — WIP / realization view ✅ *(shipped, client-side)*
"Work in progress" = approved billable entries that have **not yet been marked
billed** (`entry.syncedTo` is null). Built as a dashboard **Unbilled WIP** card
(`getWipSummary`, `renderWipCardHtml`):
- Total WIP **$ and hours**, plus **aging buckets** (0–7 / 8–30 / 30+ days from
  `entry.date`); the 30+ bucket highlights when non-zero.
- Per-matter rows sorted oldest-first, with a **stale** flag at ≥30 days.
- **"Mark billed"** (per matter, with a confirm) sets `entry.syncedTo` so the
  matter drops off WIP — entries stay in the Log. This mirrors the eventual
  Clio push (Phase 10), which will set `syncedTo` automatically.
- No backend required.

### #5 — Calendar → drafts *(requires backend)*
Auto-convert calendar events (meetings, calls, court) into draft entries with
real start/end durations → `addDraft({ source: 'calendar', ... })`. This is the
highest capture-per-effort source once OAuth exists, but it cannot run from a
static page:
- **Google/Microsoft OAuth + refresh tokens** must be stored server-side, not in
  client JS (same constraint as Phases 4/5/7).
- **Scheduled pull** (e.g. nightly) so drafts appear without the app being open.
- Server-side Calendar API calls (avoids CORS, keeps secrets off-device).

### Recommended backend (also unblocks Phases 4, 5, 7, 8)
- **Serverless functions** (Vercel / Cloudflare Workers / AWS Lambda) for OAuth
  callbacks, API proxying, and webhook receivers.
- **Database** (Postgres — Supabase/Neon) for tokens, source cursors, drafts,
  and an **audit trail**; encryption at rest + data minimization for privileged
  content.
- **Scheduler** (cron / Cloud Scheduler) for nightly pulls (#5) and the
  end-of-day digest (Phase 8).
- **Email service** (Postmark / Resend / SES) for the digest (Phase 8).
- **Migration note:** drafts move from `localStorage` to the DB; the client
  keeps calling the same `addDraft`-shaped contract via an API, so the Review
  hub UI is unchanged.

Doing this once covers Calendar (#5), Notion (P4), Workspace (P5), phone (P7),
and the digest (P8). Sequence: **#6 ✅ done → backend scaffolded ✅ (`backend/`)
→ deploy it + wire the client → #5 + P4 live.**

---

## Cross-cutting principles

- **Nothing bills without approval.** Every automated estimate is a *draft*
  until the lawyer approves it. (Already enforced by the Review hub.)
- **Always show the evidence.** Each draft carries why it was suggested
  (source + signal), so the lawyer can trust or correct it fast.
- **Confidence is advisory.** Surface it; never auto-approve on it.
- **Client confidentiality first.** Research and documents are privileged —
  data minimization, encryption, and access controls are requirements, not
  niceties.

---

## Immediate next step

The Phase 6 writing coach and the **client-side Notion prototype (Phase 4)** are
shipped, and the **backend is scaffolded** (`backend/`, Vercel + Supabase) with
server-side Notion sync, a nightly cron, drafts storage, and an audit trail —
unit-verified, not yet deployed.

The next step is to **take the backend live and wire the client to it**:
1. Create the Supabase project and run `backend/db/schema.sql`.
2. Set env vars and `vercel --prod` (see `backend/README.md`); provision a user
   API key with `npm run create-user`.
3. In `index.html`, add an `API_BASE` + stored API key, and point
   `syncNotionTasks` / the Notion Settings form at `/api/notion/connect`,
   `/api/notion/sync`, and `/api/drafts` (replacing the CORS-blocked browser
   fetch). The Review hub UI stays unchanged — same draft shape.

Once Notion is live end-to-end, the same backend pattern extends to Calendar
(#5), Workspace (P5), phone (P7), and the end-of-day digest (P8, + Resend).
