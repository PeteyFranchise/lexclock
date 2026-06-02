# LexClock — Design Brief

A short, self-contained brief to hand to a design assistant. Goal: branding +
design assets we can drop into the app, a marketing homepage, and the
verification submissions. No prior context needed.

---

## What LexClock is
An **automatic billing assistant for lawyers**. It watches where attorneys
actually do work (email, tasks), uses AI to turn each item into a **draft
billable time entry**, and lets the lawyer review and approve every entry before
anything bills. Sells through the **Clio** legal-software marketplace.

**One-liner:** *Capture every billable minute — without lifting a finger, and
without ever billing something you didn't approve.*

## Who it's for
Solo and small-firm attorneys who lose real money to unbilled time and dread
manual timekeeping. They are **risk-averse, detail-driven, and trust-sensitive**
— their inbox is privileged client data.

## Brand principles (these drive the visuals)
1. **Nothing bills without approval.** Every design should feel like it puts the
   lawyer in control — review, confidence, consent.
2. **Always show the evidence.** Transparency over magic. Surfaces "why" behind
   each suggestion.
3. **Trustworthy, precise, modern.** Legal-grade credibility, not flashy SaaS.

## Personality
Confident · precise · calm · credible · quietly modern. *Not* playful, *not*
trendy-startup. Think "the tool a careful attorney would trust with their
billing."

## Visual direction
- **Color:** lives comfortably **next to Clio** (so it reads as a native Clio
  add-on) while being its own mark. Palette = **ocean/deep blue + an orange
  accent + clean white**, with neutral grays for UI.
  - Starting anchors (refine as you like):
    - Deep ocean blue (primary): `#0B4F6C` / brand blue `#1B6FA8`
    - Orange accent (CTAs, approval/"go"): `#F2A341` → `#E8842B`
    - White `#FFFFFF`, off-white surface `#F7F9FB`
    - Ink/text `#15232E`, muted `#5B6B76`
    - Success green for "approved" states `#2E9E6B`
- **Type:** a confident humanist sans for headings (trust + clarity), a highly
  legible sans for UI/body. Suggest a pairing (e.g. a serif accent is OK for the
  wordmark if it adds gravitas).
- **Logo / wordmark:** "LexClock" — *lex* (law) + *clock* (time/billing). Explore
  a mark that fuses a clock/time element with something legal or "approval"
  (a checkmark, a gavel-free abstract). Must work small (favicon) and in one
  color.
- **UI feel:** spacious, calm, high-contrast, clear hierarchy; rounded-but-not-
  bubbly; confidence badges and evidence chips are first-class UI elements.

## Deliverables (prioritized)
1. **Primary logo + wordmark** (full color, all-white, all-ink) + clear-space.
2. **App icon / favicon** (square, works at 16–32px).
3. **Color palette** with hexes + usage notes (primary, accent, success,
   neutrals) — ready as CSS variables.
4. **Type system** — heading + body pairing, with web-font names and a fallback
   stack.
5. **Button & badge styles** — primary (orange "Approve"), secondary, the
   confidence + evidence chips.
6. **Marketing homepage hero** — headline, sub, and a hero visual concept that
   conveys "email → reviewed draft → billed." (We also need this homepage for
   Google/Microsoft verification.)
7. **Social / OG share image** (1200×630).

## Constraints
- Feels at home beside Clio's brand, but legally its **own** identity.
- Accessible contrast (WCAG AA) — these are professionals reading numbers.
- The orange accent = action/approval; never use it for errors.
- Deliver hexes/tokens in a form we can paste into a single-file HTML/CSS app.

## Tone of copy (for any sample headlines)
Plain, confident, reassuring. e.g. *"Every billable minute, captured. Nothing
billed you didn't approve."*
