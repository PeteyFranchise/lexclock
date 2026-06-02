# LexClock — Design Brief

A short, self-contained brief. Goal: branding + design assets we can drop into the app, a marketing homepage, and the verification submissions.

## What LexClock is
An **automatic billing assistant for lawyers**. It watches where attorneys actually do work (email, tasks), uses AI to turn each item into a **draft billable time entry**, and lets the lawyer review and approve every entry before anything bills. Sells through the **Clio** legal-software marketplace.

**One-liner:** *Capture every billable minute — without lifting a finger, and without ever billing something you didn't approve.*

## Who it's for
Solo and small-firm attorneys who lose real money to unbilled time and dread manual timekeeping. They are **risk-averse, detail-driven, and trust-sensitive** — their inbox is privileged client data.

## Brand principles
1. **Nothing bills without approval.** Every design should feel like it puts the lawyer in control — review, confidence, consent.
2. **Always show the evidence.** Transparency over magic. Surfaces "why" behind each suggestion.
3. **Trustworthy, precise, modern.** Legal-grade credibility, not flashy SaaS.

## Personality
Confident · precise · calm · credible · quietly modern. *Not* playful, *not* trendy-startup.

## Visual system (as built)
- **Color:** Deep ocean blue primary + orange accent (action/approval only) + clean white, neutral grays for UI. Success green for approved states. See `tokens.css`.
- **Type:** Libre Franklin (headings), Public Sans (UI/body), Source Serif 4 (wordmark accent).
- **Logo:** "LexClock" — *lex* (law) + *clock* (time/billing). Mark fuses a clock with an approval checkmark.
- **UI feel:** spacious, calm, high-contrast, clear hierarchy; rounded-but-not-bubbly; confidence badges and evidence chips are first-class UI.

## Deliverables
1. Primary logo + wordmark (full color, all-white, all-ink) + clear-space.
2. App icon / favicon (square, 16–32px).
3. Color palette + CSS variables (`tokens.css`).
4. Type system.
5. Button & badge styles (primary "Approve", secondary, confidence + evidence chips).
6. Marketing homepage hero (doubles as verification homepage).
7. Social / OG share image (1200×630).

## Constraints
- Feels at home beside Clio, but legally its own identity.
- Accessible contrast (WCAG AA).
- Orange = action/approval; never errors.
- Tokens paste straight into single-file HTML/CSS.

## Files in this repo
- `LexClock Brand System.html` — brand & design-system sheet
- `LexClock Homepage.html` — marketing + verification homepage
- `LexClock App.html` — interactive approval-flow prototype
- `tokens.css` — color + type CSS variables
- `og-image.html` → `og-image.png` — 1200×630 share image
