# Verification Handoff — Google CASA + Microsoft Publisher Verification

**Purpose of this file:** a self-contained brief you can paste into Perplexity
(or any AI assistant) so it can walk you through getting LexClock approved to
read users' email. Everything an outside assistant needs to know is here — it
has no memory of how the app was built.

> **How to use:** paste the "Context for the assistant" block below first, then
> the track you're working on (Google or Microsoft). Fill in the `<…>`
> placeholders with your real values where noted.

---

## ⏭️ NEXT SESSION — start here (the real first step)

Tomorrow's walk-through, in order:

1. **Stand up a custom domain + homepage + privacy policy.** This gates BOTH
   verifications — `peteyfranchise.github.io` can't be verified for domain
   ownership. Buy/point a domain (e.g. `lexclock.com`), publish a homepage, and
   a Limited-Use-compliant privacy policy. *(Claude can wire the domain and draft
   the privacy policy.)*
2. **Then submit Google** Part A (OAuth consent / restricted-scope) and engage a
   **CASA assessor** for Part B — CASA is the long pole, start it first.
3. **In parallel, start Microsoft** Partner ID → Publisher Verification (lighter).
4. **Housekeeping:** rotate the Anthropic API key (it was pasted in chat) — create
   a new key at console.anthropic.com, then re-run
   `vercel env add ANTHROPIC_API_KEY production` + redeploy.
5. **Frontend wiring** (separate code task): repoint "Connect Gmail" to
   `/api/oauth/google/start` + add "Sync Email" → `/api/email/sync`. Doable the
   moment the Google OAuth env vars are set on Vercel.

---

## Context for the assistant (paste this first)

> I'm the founder of **LexClock**, a legal time-tracking / billing-automation
> web app for attorneys (targeting the Clio marketplace). The product reads a
> lawyer's **sent email** and uses AI to turn each email into a draft billable
> time entry that the lawyer reviews and approves. Nothing bills automatically.
>
> **Architecture:** static frontend (`https://peteyfranchise.github.io/lexclock/`)
> + a serverless backend on Vercel (`https://lexclock-backend.vercel.app`) +
> Supabase (Postgres + Auth). Email is read **server-side** with OAuth refresh
> tokens; raw email bodies are **never stored** — they're sent to the AI model,
> which returns only a time estimate + a billing narrative, then dropped.
>
> I need to pass two approvals so real users (not just me) can connect their
> inboxes:
> 1. **Google** — OAuth app verification for the **restricted** scope
>    `https://www.googleapis.com/auth/gmail.readonly`, which also requires a
>    **CASA** (Cloud Application Security Assessment).
> 2. **Microsoft** — **Publisher Verification** for an Entra ID (Azure AD) app
>    using Microsoft Graph **`Mail.Read`** + `offline_access`.
>
> Walk me through each step by step, tell me exactly what to click, what to
> prepare, what it costs, and how long it takes. Ask me for any values you need.

---

## Facts about my app (give these to the assistant when asked)

| Thing | Value |
|---|---|
| App / product name | LexClock |
| Frontend URL | `https://peteyfranchise.github.io/lexclock/` |
| Backend API URL | `https://lexclock-backend.vercel.app` |
| Google OAuth redirect URI (Gmail) | `https://lexclock-backend.vercel.app/api/oauth/google/callback` |
| Google scope requested | `https://www.googleapis.com/auth/gmail.readonly` (restricted) |
| Microsoft redirect URI (when built) | `https://lexclock-backend.vercel.app/api/oauth/microsoft/callback` |
| Microsoft Graph scopes | `Mail.Read`, `offline_access` |
| Google Cloud project | `<fill in: project name + project ID/number>` |
| Custom domain (if any) | `<fill in, e.g. lexclock.com — see "Prerequisite" below>` |
| Privacy policy URL | `<fill in — see "Prerequisite" below>` |

---

## Prerequisite for BOTH tracks: a domain + privacy policy you control

Both Google and Microsoft want a **real homepage and a privacy policy** on a
**domain you own and can verify**. My app currently lives on a `*.github.io`
subdomain, which **cannot be verified for domain ownership** in Google Search
Console (you don't own `github.io`). Before verification I most likely need:

1. **A custom domain** (e.g. `lexclock.com`) pointed at the frontend.
2. **A homepage** describing what LexClock does.
3. **A privacy policy page** that explicitly:
   - names Google user data / Gmail and Microsoft data the app accesses,
   - states the data is used **only** to generate the user's own billing drafts,
   - affirms compliance with the **Google API Services User Data Policy,
     including the Limited Use requirements**,
   - states raw email is **not stored** and **not used to train models or shared**.

> Ask the assistant to: (a) confirm whether a custom domain is strictly required
> or whether the github.io URL can pass, and (b) draft a privacy policy that
> satisfies Google's **Limited Use** language and Microsoft's requirements.

---

## TRACK 1 — Google OAuth verification + CASA

**What it gates:** without this, only the Google Cloud project **owner** and
explicitly-added **test users** can grant `gmail.readonly`. General users are
blocked. Restricted scopes require BOTH standard app verification AND an annual
security assessment (CASA).

**Two parts, done in sequence:**

### Part A — OAuth app / brand verification
1. Google Cloud Console → **APIs & Services → OAuth consent screen**.
2. Confirm: app name, **user support email**, app **logo**, **homepage URL**,
   **privacy policy URL**, **authorized domains** (your verified domain).
3. **Data access** → add the scope `.../auth/gmail.readonly`. For each restricted
   scope Google asks you to **justify the need** in writing.
4. **Verify domain ownership** in Google **Search Console** for your authorized
   domain (the privacy-policy / homepage domain).
5. Record a **demo video** (usually YouTube, unlisted) showing: the OAuth consent
   screen with your client ID visible in the URL, the user granting the scope,
   and exactly how the app uses the Gmail data. Google requires this.
6. Submit for verification. Google replies by email with any gaps.

### Part B — CASA (the security assessment)
- Restricted scopes (Gmail) require a **Cloud Application Security Assessment**,
  typically **CASA Tier 2**, performed via a **Google-authorized third-party
  assessor**. You complete a self-assessment + an automated scan of the app;
  the assessor issues a **Letter of Assessment / Letter of Validation (LOA)**,
  valid **12 months** (must be renewed annually).
- **Ask the assistant for:** the current list of Google-authorized CASA
  assessors, current **price range** (it changes; historically a few hundred to
  low-thousands USD), the Tier 2 scan/SAQ requirements, and the typical
  **timeline (often 3–6 weeks)**.
- Practical prep that speeds CASA: HTTPS everywhere (already true on Vercel),
  documented data handling, encryption of stored secrets/tokens, a clear data
  retention/deletion policy, and an incident-response note.

> **Questions for the assistant on Track 1:**
> 1. Step-by-step, what do I click in the OAuth consent screen to submit for
>    restricted-scope verification today?
> 2. Who are the currently authorized CASA assessors and what do they charge?
> 3. What exactly goes in the justification + demo video to avoid rejection?
> 4. Can I keep onboarding test users (and myself) while CASA is pending?

---

## TRACK 2 — Microsoft (Outlook / Graph) publisher verification

**What it gates:** the "unverified publisher" warning on the consent screen, and
some tenants block unverified apps. Publisher verification adds the **blue
"verified" badge** and is generally required for org adoption. Note: **firm IT
admin consent** can approve `Mail.Read` once for an entire firm — a distribution
advantage worth highlighting in sales.

### Steps
1. **Entra ID (Azure AD) app registration:** Azure Portal → **Microsoft Entra ID
   → App registrations → New registration**. Set the redirect URI
   `https://lexclock-backend.vercel.app/api/oauth/microsoft/callback`. Choose
   **multitenant** + personal accounts if you want both work and Outlook.com.
2. **API permissions:** add Microsoft Graph **delegated** `Mail.Read` and
   `offline_access`. (Delegated = acts as the signed-in user, not app-wide.)
3. **Publisher Verification prerequisites:**
   - A **verified Microsoft partner account** — i.e. a **Microsoft AI Cloud
     Partner Program** membership with a **Partner One ID / MPN ID**.
   - The partner account's primary domain verified, and the **same tenant** that
     owns the app registration.
4. In **Partner Center / App registration → Branding & properties**, set the
   **MPN/Partner ID** and click **Verify**. Once approved, the app shows
   "Publisher verified."
5. (Only if listing in **AppSource / Teams marketplace**) you'd additionally need
   **Microsoft 365 Certification** — not required just to use Graph in our own
   app. Confirm with the assistant.

> **Questions for the assistant on Track 2:**
> 1. Exact steps to get a Microsoft Partner ID (MPN) from scratch, and how long
>    it takes.
> 2. Do consumer **Outlook.com** accounts need admin consent for `Mail.Read`, or
>    only org tenants?
> 3. Is Microsoft 365 Certification required for my use case (reading the signed-
>    in user's own mail, no marketplace listing)?
> 4. Step-by-step to mark the app "Publisher verified."

---

## Suggested order & timeline

1. **Today/this week:** stand up the custom domain + homepage + privacy policy
   (blocks both tracks). *Ask the assistant to draft the privacy policy.*
2. **Google:** submit Part A, then immediately engage a CASA assessor for Part B
   — **CASA is the long pole (3–6+ weeks)**, so start it first.
3. **Microsoft:** start the Partner ID / publisher verification in parallel —
   it's lighter (days, not weeks).
4. While both pend, keep testing with me as owner + added Google test users.

---

## What's already done (so you don't redo it)
- Backend Gmail pipeline is **built and deployed** (`/api/oauth/google/start`,
  `/api/oauth/google/callback`, `/api/email/sync`, `/api/email/status`); it
  stores only a refresh token + derived billing drafts, never raw email.
- The Google redirect URI and scope above are already what the code expects.
- Microsoft endpoints are **not built yet** (Phase 2) but the redirect URI above
  is the planned path — fine to register now.
