# LexClock — Business & Go-to-Market Notes

Working notes on how LexClock reaches lawyers, how they set it up, and how we
price it. Living document — update as decisions firm up.

## Product in one line

Passive time capture for lawyers: LexClock watches the tools a lawyer already
uses (Notion tasks today; email, calendar, phone next), drafts billable time
entries automatically, and lets the lawyer approve each one before it bills.
**Nothing bills without approval.**

## Distribution model

LexClock is a **web app, not downloaded software**. Lawyers use it in a browser
(Chrome/Safari/Edge), like Gmail or Clio. There are two front doors into the
same hosted app:

1. **Direct — login on our website** (primary, e.g. `app.lexclock.com`)
   - Lawyer signs up / logs in (email+password, magic link, or "Sign in with Google").
   - Data lives in our database (Supabase), tied to their account → follows them
     across laptop, desktop, phone.
   - This is the version we own end-to-end and sell directly.

2. **Clio App Directory** (a *listing*, not an install)
   - The marketplace is a directory of integrations, not an app store that
     installs software.
   - Lawyer clicks **Connect** → Clio shows an OAuth "Allow LexClock to access
     your Clio data?" screen → they're bounced into the *same* web app, now
     linked to their Clio account.
   - The listing is a front door that drives signups and connects billing.
     One codebase, two doors.

**No desktop download.** Runs in the browser → instant updates, any OS, nothing
for firm IT to approve. *Optional later:* ship as a PWA (installable icon that
opens the web app in its own window) — feels like an app, still the web app.

## Lawyer setup flow (target experience)

1. Open LexClock, add firm details (name, hourly rate, rounding increment).
2. Connect a source — one click "Connect Notion / Gmail / Calendar", an OAuth
   "Allow?" popup, click Allow. No tokens or IDs to paste.
3. Work normally — don't open the app to track time.
4. Each evening, open **Review** — drafts are already waiting, each with its
   evidence, a suggested narrative, and a confidence level. Nothing has billed.
5. Approve / edit / discard each draft → approved entries go to the billing log.
6. (Later) One click pushes approved time to Clio.

**Where the prototype is today:** steps 3–5 work. Step 2 is still technical —
connecting Notion requires pasting an integration token, database id, backend
URL, and API key in Settings. Turning that into "click Allow" (OAuth) +
real accounts is the next product work. See `AUTH_PLAN.md`.

## Pricing

Anchor: **billable time recovered.** A lawyer billing $300/hr who recaptures
~0.5 hr/day ≈ $30k+/yr recovered → $50/mo is ~50x ROI. Price as premium
per-seat SaaS, not a cheap utility. Lead every sales conversation with this math.

### Starting tiers — per lawyer, per month (billed annually)

| Tier | Price | Who | What's in it |
|------|-------|-----|--------------|
| **Solo** | ~$29/mo | Single attorney | Auto-capture from 1–2 sources, Review/approve, manual export |
| **Pro**  | ~$49–59/mo | Most lawyers | All sources, AI narratives, Clio push, daily digest |
| **Firm** | ~$79/mo + admin seat | Multi-lawyer firms | + firm dashboard, billing review, SSO, support SLA |

Per-*seat* (per lawyer), matching legal SaaS norms. Reference band: Clio
~$39–$129/user/mo; AI-timekeeping tools (WiseTime, Ping, Memtime) ~$20–$60/user/mo.
Pro at $49–59 undercuts full practice-management suites while sitting mid-band.

### Billing cadence: **monthly default, annual discounted, no quarterly**

- **Monthly** — the expected default; low commitment, easy "yes."
- **Annual** — offer ~2 months free (~17% off). What we want most customers on:
  better cash flow, lower churn, funds acquisition cost.
- **Quarterly — skip it.** Worst of both: uncommon in SaaS, adds friction
  without annual's retention/cash benefit. Lawyers think monthly or annual.

### How to set the actual number

Validate with the first 5–10 design-partner firms, don't guess in a vacuum.
- Launch Pro at **$49/mo** with a "founding firm" rate (e.g. $39 locked for life)
  to seed early adopters + testimonials.
- Watch whether people balk at *price* or at *trust* (will it bill correctly?).
  If it's trust, there's room to raise price later.
- Until auto-capture is proven with real firms, price for **adoption** (logos +
  proof), then raise prices on new cohorts as the recovered-hours data lands.
