# Handoff: LexClock — Brand System, Marketing Homepage & Approval-Flow App

## Overview
LexClock is an **automatic billing assistant for lawyers**. It watches where attorneys do work (email, tasks), uses AI to turn each item into a **draft billable time entry**, and lets the lawyer review and approve every entry before anything bills. It sells through the **Clio** legal-software marketplace.

This bundle contains three design references plus design tokens:
1. **`LexClock Brand System.html`** — the visual system: logo directions, color palette, type system, button & badge/chip components.
2. **`LexClock Homepage.html`** — marketing homepage (also serves as the Google/Microsoft verification homepage).
3. **`LexClock App.html`** (+ `app/app.css`, `app/app.jsx`) — interactive prototype of the core flow: *email → reviewed draft → approved & billed*.
4. **`tokens.css`** — all color + type + radius + shadow tokens as CSS variables, ready to paste.

**Core brand principles** (these drive every design decision):
1. **Nothing bills without approval.** Every surface keeps the lawyer in control. The orange accent ONLY ever means "go / approve" — never errors.
2. **Always show the evidence.** Each AI suggestion carries its source and reasoning as first-class "evidence chips."
3. **Trustworthy, precise, modern.** Legal-grade credibility, not flashy SaaS. Spacious, high-contrast, quietly modern.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing the intended look and behavior, **not** production code to copy verbatim. The task is to **recreate these designs in your target codebase's existing environment** (React, Vue, SwiftUI, etc.), using its established components, patterns, and libraries. If no frontend environment exists yet, pick the most appropriate framework for the project (the prototype is React 18, so React/Next.js will port most directly) and implement there.

The `app/app.jsx` prototype is plain React 18 with `useState`/`useRef` and no build step (in-browser Babel). Treat its component structure and state model as a faithful blueprint; replace inline SVG icons with your icon library and the hardcoded `SEED` array with real data.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, and interactions are all specified. Recreate the UI pixel-faithfully using your codebase's libraries. Exact hex values, font stacks, and measurements are in **Design Tokens** below and in `tokens.css`.

---

## Design Tokens

### Color
All text pairings noted below meet **WCAG AA**. The single most important rule: **orange = action/approval only. Never use orange for errors or warnings.** A cool red is reserved for the rare error case so it never visually competes with the approve action.

| Token | Hex | Usage |
|---|---|---|
| `--ocean-900` | `#08384C` | Deepest blue. Sidebar bg, dark band, headings, text on tint |
| `--ocean-800` | `#0B4F6C` | **Primary brand.** Primary buttons, key numerals |
| `--ocean-600` | `#1B6FA8` | Links, secondary actions, "Clock" in wordmark |
| `--ocean-400` | `#4E97C8` | Hover, lighter accents, focus borders |
| `--ocean-100` | `#DCEAF3` | Selected rows, tint |
| `--ocean-050` | `#EFF5F9` | Faint tint backgrounds, "why" panels |
| `--orange-500` | `#E8842B` | **Primary CTA / Approve button.** The brand's only default orange |
| `--orange-600` | `#CE6E18` | CTA hover / pressed |
| `--orange-400` | `#F2A341` | Highlights, focus glow, the orange clock hand |
| `--orange-050` | `#FDF1E2` | Approve-zone tint, evidence highlight `<mark>` |
| `--green-600` | `#2E9E6B` | Approved — icons, dots, confidence fill |
| `--green-700` | `#237A52` | Approved text on tint |
| `--green-050` | `#E6F4EC` | Approved-state backgrounds |
| `--red-600` | `#C0392B` | Errors ONLY (cool red, kept far from orange) |
| `--red-050` | `#FBEAE8` | Error backgrounds |
| `--white` | `#FFFFFF` | Cards, fields |
| `--surface` | `#F7F9FB` | App / page background |
| `--surface-2` | `#EEF2F6` | Secondary panels, low-confidence chip bg |
| `--line` | `#DCE3EA` | Borders, dividers |
| `--line-strong` | `#C2CCD6` | Stronger borders (secondary buttons, inputs) |
| `--ink` | `#15232E` | Primary text |
| `--ink-2` | `#34454F` | Secondary text |
| `--muted` | `#5B6B76` | Captions, labels |

### Typography
Load from Google Fonts: `Libre Franklin` (400,500,600,700,800), `Public Sans` (400,500,600,700 + italic 400), `Source Serif 4` (400,500,600), `IBM Plex Mono` (400,500).

| Token | Stack | Use |
|---|---|---|
| `--font-head` | `"Libre Franklin", "Helvetica Neue", Helvetica, Arial, sans-serif` | All headings, wordmark, big numerals |
| `--font-ui` | `"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` | UI & body. Built for legibility |
| `--font-serif` | `"Source Serif 4", "Iowan Old Style", Georgia, serif` | Gravitas accent: hero sub-copy, pull quotes, masthead |
| `--font-mono` | `"IBM Plex Mono", ui-monospace, Menlo, monospace` | Eyebrow labels, metadata, kicker tags |

**Type scale (as used):**
- Display (hero h1): Libre Franklin 800, 56–60px, letter-spacing −0.03em, line-height ~1.04
- Section h2: Libre Franklin 800, 40px, −0.025em
- Card/panel h3: Libre Franklin 700, 18–24px
- Serif lead: Source Serif 4 400, 21–23px, line-height 1.45–1.5
- Body/UI: Public Sans 400/600, 15–16.5px, line-height 1.5–1.6
- **Numerals (hours, $ amounts): Public Sans 600/700/800 with `font-variant-numeric: tabular-nums`** — essential so billing columns align
- Eyebrow/kicker: Public Sans 700, 12.5px, letter-spacing 0.14em, uppercase, color `--orange-600`
- Mono labels: IBM Plex Mono, 10–11px, letter-spacing 0.06–0.1em, uppercase

### Radii
`--r-sm: 6px` · `--r-md: 10px` (buttons, inputs) · `--r-lg: 14px` (cards) · `--r-xl: 20px` (feature panels) · `--r-pill: 999px` (chips, badges, pills)

### Shadows (soft, ocean-tinted — never neutral gray)
- `--shadow-sm`: `0 1px 2px rgba(11,79,108,.06), 0 1px 3px rgba(11,79,108,.08)`
- `--shadow-md`: `0 6px 18px rgba(11,79,108,.09), 0 2px 5px rgba(11,79,108,.06)`
- `--shadow-lg`: `0 24px 60px rgba(8,56,76,.18), 0 6px 16px rgba(8,56,76,.08)`

### Focus ring
`--focus: 0 0 0 3px rgba(242,163,65,.45)` — an orange glow (the brand's "go" color) applied on `:focus-visible`.

### Business constants (in `app/app.jsx`)
- `RATE = 325` ($/hr for the demo user) — replace with real per-user/matter rates.
- Minimum billing increment shown is **0.1 hr (6 min)**.
- `money(hrs)` = `'$' + (hrs * RATE).toFixed(2)` with thousands separators.

---

## Screens / Views

### A. Brand System sheet (`LexClock Brand System.html`)
Reference only — a one-page spec, not an app screen. Contains: the primary "Approval Clock" logo lockup; 5 logo directions each rendered in full-color / all-ink / reverse-on-ocean / favicon sizes (48/32/16px); the full color palette (click-to-copy swatches); the type system specimens; and all button/badge/chip components. Use it as the source of truth for the component library.

**Logo (primary — "Approval Clock"):** a clock whose two hands rest at an angle that reads as a checkmark; the long "approval" hand is the single orange (`--orange-500`), the rest ocean. Inline SVG, `viewBox="0 0 64 64"`. One-color version: set every stroke/fill to a single color (it still reads). Minimum wordmark height 20px; below that use the icon-only mark (holds to 16px). Clear space = the height of the clock mark on all sides. The full SVG markup is in the `<header>` of `LexClock Homepage.html` and in `app/app.jsx` (`logoSvg`).

### B. Marketing Homepage (`LexClock Homepage.html`)
Doubles as the Google/Microsoft **verification homepage**, so it includes real `<title>`, `<meta name="description">`, OG tags, and a substantive **Security & data use** section.

- **Sticky nav (h 68px):** logo lockup left; center links (How it works / Evidence / Approval / Security); right "Sign in" text link + orange "Add to Clio" CTA. Background `rgba(255,255,255,.85)` + `backdrop-filter: blur(12px)`, bottom border `--line`.
- **Hero (2-col grid, 1.02fr / 1.18fr, gap 56px):**
  - Left: a "Clio marketplace" pill (mono "CLIO" tag on `--ocean-800`); h1 *"Every billable minute, captured. Nothing billed you **didn't approve.**"* (the last clause in `--orange-500`); serif sub-paragraph; CTA row (orange "Add to Clio — free 14 days" + secondary "See how it works"); a micro reassurance line with a green check ("No card required · Your inbox stays read-only · Cancel anytime").
  - Right: **the hero centerpiece — a vertical 3-step pipeline** showing the transformation: (1) an *email* card ("You sent an email"), (2) a down-arrow label "LexClock drafts a time entry", (3) a **draft time-entry card** (0.4 hrs, matter, description, a high-confidence chip + source + evidence chip, and an orange "Approve & bill" button with a subtle recurring `pulse` glow), (4) arrow "You approve · it bills in Clio", (5) a green **"Approved & billed to Clio"** card with the dollar amount. This visual IS the product story — keep all three states visible at once.
- **Trust strip:** mono label + 4 badges (SOC 2 Type II / Inbox access is read-only / Nothing bills without approval / Native Clio sync).
- **How it works (3 cards):** numbered 1–3 — *captures the work → drafts the entry → you approve, it bills.*
- **Evidence feature (2-col):** copy + bullet list (Source-linked / Confidence-scored / Always editable) beside a realistic **evidence panel** mock (entry + a "Why LexClock suggested this" reasoning block + source chips).
- **Approval band (dark `--ocean-900`):** centered lock icon, h2 *"The lawyer is always the last word."*, serif sub, two CTAs.
- **Security & data use (3 cards):** read-only scoped access / encrypted & never sold / you stay in control. (Important for verification review.)
- **Footer:** brand + tagline, Product/Company/Legal link columns, legal line noting *"Clio is a trademark of its respective owner; LexClock is an independent product."*
- **Animation:** `.reveal` elements fade+rise in on scroll via `IntersectionObserver` (threshold 0.12). The above-the-fold hero pipeline cards do NOT use reveal (must be visible immediately). Respect `prefers-reduced-motion`.
- **Responsive:** ≤920px collapses both 2-col grids to single column, hides center nav links, scales h1 to 42px.

### C. Approval-Flow App (`LexClock App.html` + `app/`)
The core product. **App shell = 240px sidebar grid + main column.**

- **Sidebar (`--ocean-900`, white text):** logo lockup; "Timekeeping" section → **Review queue** (active; orange count badge = pending count) and **Approved** (muted count badge); "Firm" section → Matters, Sources & settings (demo toasts); bottom user chip (avatar "RW", name, "Wills Law · $325/hr").
- **Top bar (h 64px, white):** screen title + subtitle on the left; a green pulsing **"Synced with Clio"** pill on the right.
- **Summary stat row (3 cards):** *Captured today* (total hrs + $ found) · *Awaiting approval* (count, orange value) · *Approved & billed* (green $ value, # entries). These recompute live as entries are approved/skipped.
- **Review queue — Entry card** (the heart of the product). Each draft shows:
  - Left **time column**: big tabular `X.X` hours + `hrs · $amount` below.
  - **Middle**: matter line (CLIENT · matter type, uppercase muted); plain-English description; a **chip row**: a confidence badge (green ≥85% "High confidence", ocean 60–84% "Medium", gray <60% "Needs a look", each with a colored dot + the % ), a source chip (Gmail/Outlook/Tasks), and a clickable **evidence chip** (icon + source label) that opens the drawer.
  - **Action bar** (on `--surface`, top border): orange **"Approve & bill"** (primary action), secondary **"Edit"**, ghost **"Skip"**, and a right-aligned **"Show evidence"** link button.
  - **Queue header** also has an **"Approve all ($total)"** secondary button that approves sequentially (90ms stagger).
- **Edit mode (inline):** description becomes a textarea, hours becomes a number input (step 0.1, min 0.1); Cancel / Save changes buttons. Saving updates the card and recomputes summaries.
- **Evidence drawer (right slide-over, 480px):** opens from any evidence chip or "Show evidence". Header "Why LexClock suggested this"; shows hours+$, matter, the description; an animated **confidence meter** (bar fills to the % on open, colored by confidence tier); a **"The reasoning"** block (`--ocean-050` bg) with the plain-language explanation; a **source-evidence card** rendering the actual email/document/call with the key phrase wrapped in an orange `<mark>`; footer with Approve & bill + Close. Scrim is `rgba(8,56,76,.34)` + blur; closes on scrim click or X.
- **Approve interaction:** card border flashes green (`.approving`), a small **confetti burst** fires from the approve button (Web Animations API), the card slides right + fades out (`.leaving`), then moves to the Approved tab. A toast appears: *"Approved & billed to Clio — $X"* (green check icon). Total ~620ms choreography.
- **Skip interaction:** card slides out; toast *"Entry skipped"* with an **Undo** button (restores to top of queue).
- **Approved tab:** list of approved items (green check, hours, matter, description, $ amount @ rate). Empty state when none.
- **Empty state (queue cleared):** centered green check ring, *"All caught up."*, reassurance copy, and a "Billed today" total card.
- **Responsive:** ≤760px hides the sidebar and stacks the summary cards.

---

## Interactions & Behavior

| Interaction | Trigger | Behavior |
|---|---|---|
| Approve entry | "Approve & bill" button | Confetti burst at button → `.approving` green flash (280ms) → `.leaving` slide-right+fade (340ms) → remove from queue, prepend to approved, fire success toast. Total ~620ms. |
| Approve all | Queue header button | Approves each queued entry sequentially with 90ms stagger. |
| Skip entry | "Skip" button | `.leaving` slide-out (360ms) → remove from queue → toast with **Undo** (restores entry to top). |
| Edit entry | "Edit" button | Inline edit: description→textarea, hours→number input. Save updates entry + recomputes summary; Cancel reverts. |
| Open evidence | Evidence chip / "Show evidence" | Right drawer slides in (300ms `cubic-bezier(.2,.7,.2,1)`), scrim fades; confidence bar animates to % after 120ms. |
| Close drawer | X / scrim / Close | Reverse transition. |
| Tab switch | Sidebar Review/Approved | Swap main content; counts in badges update live. |
| Scroll reveal (homepage) | Element enters viewport | `.reveal` fades+rises in once (IntersectionObserver, threshold 0.12). |
| CTA pulse (homepage) | Always (hero approve button) | Subtle recurring glow ring, 2.6s loop, to draw the eye to the approve action. |
| Synced pill | Always | Green dot pulses (2s loop). |

**Easing:** primary motion uses `cubic-bezier(.2,.7,.2,1)`. Button press: `translateY(1px)` on `:active`. Honor `prefers-reduced-motion` — disable confetti/pulse/reveal and show end states.

## State Management
The prototype (`app/app.jsx`) holds all state in the top-level `App` component:
- `tab` — `'review' | 'approved'`.
- `queue` — array of draft entry objects (seeded from `SEED`). In production, fetch from the timekeeping/AI service.
- `approved` — array of approved entries (prepended on approve), each with `approvedAt`.
- `drawer` — the entry currently shown in the evidence drawer, or `null`.
- `toasts` — array of `{id, node}`; auto-dismiss after 4.2s.
- `lastSkip` (ref) — last skipped entry, for Undo.
- Per-card local state in `EntryCard`: `editing`, `hours`, `desc`, `state` (`idle|approving|leaving`).

Derived (recomputed each render): `pendingHours`, `approvedHours`, `capturedHours`.

**Entry object shape:**
```js
{
  id, hours,            // number (e.g. 0.4)
  client, matter,       // "Henderson v. Atlas Freight", "Litigation"
  desc,                 // plain-English narrative
  conf,                 // 0–100 confidence score
  source, sourceIcon,   // "Gmail" | "Outlook" | "Tasks"; icon key: 'mail'|'doc'|'task'
  evidence, evMeta,     // chip label + timestamp meta
  why,                  // reasoning paragraph (drawer)
  from, subj, snip      // source-evidence card; `snip` is HTML w/ <mark> on key phrase
}
```

**Data fetching (production):** replace `SEED` with the draft entries the AI service produces from connected sources (email/tasks). On approve, POST the approved entry to Clio's time-entry API; on skip, mark dismissed; on edit-save, persist the user's overrides. **Never auto-submit — approval is always an explicit user action.**

## Assets
- **Logo / favicon:** inline SVG (no external file). Full markup in `app/app.jsx` (`logoSvg`) and the homepage `<header>`. Generate favicon PNGs (16/32/48) from the icon-only mark, white on `--ocean-800`.
- **Icons:** all inline SVG (1.5–2.6 stroke width, `currentColor`, round caps/joins) in the `I` icon map in `app/app.jsx`. Swap for your icon library (Lucide/Phosphor are close in style) — names map directly (check, clock, mail, doc/file-text, task/check-circle, inbox, folder, settings, edit/pencil, bolt/zap, x).
- **Fonts:** Google Fonts (links in each HTML `<head>`). Self-host for production.
- **OG / social image (1200×630):** see `og-image.html` in the project root if present; otherwise compose from the hero lockup + tagline.
- **No raster imagery** — the system is type-, color-, and component-driven by design.

## Files
In this handoff folder:
- `LexClock Brand System.html` — brand & component spec (self-contained).
- `LexClock Homepage.html` — marketing + verification homepage (self-contained, Google Fonts only).
- `LexClock App.html` — app entry; loads `app/app.css` + `app/app.jsx`.
- `app/app.css` — all app styles + tokens.
- `app/app.jsx` — React 18 app (components, state, interactions, seed data).
- `tokens.css` — design tokens as CSS variables (paste into any project).
- `DESIGN_BRIEF.md` — the original product/brand brief for context.

A developer can implement the entire system from this README + `tokens.css` alone; the HTML/JSX files are the visual ground truth.
