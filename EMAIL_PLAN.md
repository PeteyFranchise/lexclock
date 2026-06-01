# LexClock — Email Scanning Plan (the "big draw")

Goal: a lawyer connects their inbox once, and LexClock turns billable email work
(reading, drafting, advising) into **pending drafts** in the Review hub — Gmail
**and** Outlook, with zero per-device setup and no raw email bodies ever stored.

This is the highest-value feature and the hardest one to ship to *outside* users,
because the inbox is privileged attorney-client data and both Google and
Microsoft gate inbox-reading apps behind a verification process that takes weeks.
**The engineering is ~1–2 weeks; the approvals are the long pole — they must be
started first and in parallel.**

---

## Why we're moving email scanning to the server

The current prototype reads Gmail **from the browser**: per-device Google Client
ID (Settings → `googleClientId`), a browser OAuth token, Gmail fetch, then a
Claude call using the user's own pasted key. That demos on Peter's machine but
**can't ship to testers**: each device needs its own Client ID, the token is
short-lived with no refresh, and the privileged email body transits the browser.

Server-side fixes all three and matches how Notion already works (see
`backend/lib/notionSync.js`, `backend/lib/estimate.js`):

| Concern            | Client-side today                 | Server-side target                          |
|--------------------|-----------------------------------|---------------------------------------------|
| App identity       | Per-device Client ID in Settings  | One app credential in Vercel env            |
| Token lifetime     | ~1h browser token, no refresh     | Refresh token in `source_connections`       |
| Background sync    | Only when tab is open             | Vercel Cron, like Notion (`api/cron`)       |
| AI key             | Each user pastes `sk-ant-…`       | One server key (Peter's, then ours)         |
| Privileged data    | Email body in the browser         | Body fetched, summarized, **never stored**  |

---

## Architecture (reuse what exists)

The Review hub is source-agnostic. A new source only has to produce drafts via
the same upsert path Notion uses — **no new review UI** (ROADMAP confirms this).

```
                ┌─────────── Vercel Cron (per user, like Notion) ───────────┐
                │                                                            │
  Gmail/Graph API ──fetch new msgs──► server ──Claude (estimate.js pattern)─┤
  (access token from refresh_token)         │  body → {minutes, narrative,  │
                                            │         confidence}           │
                                            ▼                               │
                              drafts.upsert(status:'pending')  ◄────────────┘
                              (user_id, source:'gmail'|'outlook', external_id)
                                            │
                                            ▼
                                Review hub → lawyer approves → billed
```

Files to add (mirrors the Notion trio):

- `backend/lib/gmail.js` — OAuth token refresh + Gmail `users.messages.list/get`,
  reuse `extractPlainTextFromPayload` logic from `index.html`.
- `backend/lib/outlook.js` — MSAL token refresh + Graph `/me/messages`.
- `backend/lib/emailSync.js` — provider-agnostic: pull new messages since
  `cursor`, call `estimateEmail()`, upsert drafts. Mirrors `notionSync.js`.
- `backend/lib/estimate.js` — add `estimateEmail(message, apiKey)` next to the
  existing task estimator (same prompt shape, email-tuned system prompt).
- `backend/api/oauth/google/callback.js`, `…/microsoft/callback.js` — the OAuth
  redirect endpoints that exchange the code for a refresh token and write
  `source_connections`.
- `backend/api/cron/email.js` — cron entry that loops connected users.

Schema change (one line): extend the `source` check constraint in
`backend/db/schema.sql` line 38 to include `'gmail'` and `'outlook'`:

```sql
source text not null check (source in
  ('notion','workspace','calendar','phone','gmail','outlook')),
```

`source_connections` already has `refresh_token`, `cursor`, `config`,
`last_synced_at`, and `status` — it was built for exactly this. No new table.

---

## Gmail path

- **Scope:** `gmail.readonly` is a **restricted** scope (stricter than the
  "sensitive" scope the prototype uses). Restricted scopes require a Google
  **CASA Tier 2 security assessment** by a third-party auditor before outside
  users can connect. Budget **3–6 weeks** and a few hundred to ~$1k for the
  assessment. *This is the single longest lead-time item — start it first.*
- **Auth:** server-side OAuth (offline access → refresh token). Exchange happens
  in `api/oauth/google/callback`, store the refresh token encrypted.
- **Read:** `messages.list` with `q=newer_than:1d -in:chats` and a stored
  `historyId`/date cursor for incremental pulls; `messages.get` format=full;
  decode base64url body (logic already written client-side).
- **Filtering before we spend tokens/AI:** only the user's *sent* mail and
  threads they replied to (evidence of work performed), skip newsletters/calendar
  noise, cap per-run volume.

## Outlook path

- **Scope:** Microsoft Graph `Mail.Read`. Microsoft requires **Publisher
  Verification** and, for many tenants, **admin consent** (the firm's IT admin
  approves the app once for the whole firm — which is actually a *distribution
  advantage*: one approval lands the whole firm).
- **Auth:** MSAL authorization-code flow with `offline_access` → refresh token;
  same `source_connections` row shape, `source:'outlook'`.
- **Read:** Graph `/me/mailFolders/sentitems/messages` and `/me/messages` with
  `$filter=receivedDateTime ge <cursor>`; `body.content` (HTML → text).
- Timeline: publisher verification is **days**, not weeks — lighter than Google.

---

## Privileged-email privacy design (non-negotiable for lawyers)

The inbox is attorney-client privileged. Our trust posture, baked into the code:

1. **Never persist raw email bodies.** Fetch → send to Claude → keep only the
   derived `{minutes, narrative, confidence}` + a minimal `evidence` string
   (e.g. subject + counts). The body is dropped from memory after the AI call.
2. **Encrypt tokens at rest.** Refresh tokens in `source_connections` get
   envelope-encrypted (libsodium / KMS) — not plaintext. RLS already blocks
   browser access; the service-role server is the only reader.
3. **Data minimization at fetch.** Pull only sent/replied mail, only since the
   cursor, only what's needed to estimate. No full-mailbox crawl.
4. **One-click disconnect → token revoke + purge** (`status:'revoked'`, delete
   refresh token, revoke upstream).
5. **No third-party data sharing.** Anthropic API: we are the only processor;
   no training on inputs. Document this for the lawyer.
6. **Audit everything** (already have `audit_log`): connection, each sync, each
   approval.
7. **GTM artifact:** a one-page "How LexClock handles your email" trust note —
   firms' IT/security will ask. This *is* a sales asset, not overhead.

---

## Phased build order

- **Phase 0 — start the clock (do now, in parallel with code):**
  open the **Google CASA assessment** and **Microsoft publisher verification**.
  These are the long poles; everything else finishes before they clear.
- **Phase 1 — Gmail server-side, internal:** `gmail.js` + `emailSync.js` +
  `estimateEmail()` + OAuth callback + cron, tested on Peter's own inbox under
  the app's existing OAuth (works for the developer/test users immediately while
  CASA is pending).
- **Phase 2 — Outlook server-side:** `outlook.js`, MSAL callback; same sync.
- **Phase 3 — Privacy hardening:** token encryption, disconnect/purge, trust
  note, finalize CASA submission.
- **Phase 4 — Open to outside testers** once CASA + publisher verification clear.

Net: real Gmail-driven drafts for Peter and invited testers in ~1–2 weeks of
code; general availability gated by the approvals started in Phase 0.

---

## Phase 1 — what's built (Gmail server-side) ✅

Shipped to the live backend (`https://lexclock-backend.vercel.app`), mirroring
the Notion pipeline. **Inert until the env vars below are set**, so it can't
affect existing routes.

New code:
- `backend/lib/gmail.js` — token refresh, code exchange, sent-mail list/get,
  base64url body decode. *Never persists bodies or access tokens.*
- `backend/lib/estimate.js` — `estimateEmail()` / `estimateEmailTask()` beside
  the Notion estimator, sharing one Claude call/parse helper.
- `backend/lib/emailSync.js` — `syncEmailForConnection()` (idempotent upsert of
  pending drafts on `(user_id, source, external_id)`), `getEmailConnection()`,
  `getActiveEmailConnections()`.
- `backend/lib/oauthState.js` — HMAC-signed, 10-min `state` so the callback can
  trust which user started the flow.
- `backend/api/oauth/google/start.js` (POST, Bearer → returns consent URL),
  `backend/api/oauth/google/callback.js` (stores refresh token → redirects
  `?gmail=connected`).
- `backend/api/email/sync.js` (POST, on-demand), `backend/api/email/status.js`
  (GET connected? / DELETE disconnect+purge).
- `backend/api/cron/nightly.js` — now also runs email connections.
- `backend/db/email.sql` — adds `gmail`/`outlook` to the source whitelist.

### Turn it on (one-time setup)

1. **DB migration** — Supabase → SQL Editor → run all of `backend/db/email.sql`.
2. **Google Cloud Console** (reuse the existing OAuth client from login):
   - Credentials → your **Web** OAuth client → **Authorized redirect URIs** →
     add `https://lexclock-backend.vercel.app/api/oauth/google/callback`.
   - OAuth consent screen → **Data access** → add scope
     `.../auth/gmail.readonly` (this is a **restricted** scope).
   - ⚠️ Restricted-scope nuance: the project **owner** and explicitly-added
     **test users** can grant it now without CASA. General users need the CASA
     assessment (Phase 0). So for testing this week, use your own Google account
     / add testers under **Audience → Test users**.
3. **Vercel env vars** (Project → Settings → Environment Variables, then redeploy):
   ```bash
   GOOGLE_OAUTH_CLIENT_ID=<same client id as login>
   GOOGLE_OAUTH_CLIENT_SECRET=<same client secret>
   GOOGLE_OAUTH_REDIRECT_URI=https://lexclock-backend.vercel.app/api/oauth/google/callback
   # OAUTH_STATE_SECRET is optional — falls back to CRON_SECRET if unset
   ```
4. **Frontend wiring** (remaining code step): repoint the existing "Connect
   Gmail" button to `POST /api/oauth/google/start` then redirect the browser to
   the returned `url`; add a "Sync Email" action calling `POST /api/email/sync`;
   on load, read `?gmail=connected|denied|error` and toast. Drafts then appear in
   the Review hub exactly like Notion.

### Verify
- `POST /api/oauth/google/start` with a Bearer token → `{ url: "https://accounts.google.com/..." }`.
- Open that URL, consent → lands back on the app with `?gmail=connected`; a
  `source_connections` row (source `gmail`) gets a refresh token.
- `POST /api/email/sync` → pending email drafts in Supabase + the Review hub.
