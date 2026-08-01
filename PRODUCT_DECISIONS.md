# PRODUCT DECISIONS

Settled. Each carries its reasoning, because the reasoning is what keeps the next
decision consistent. Do not reopen one without a stated cause.

For unsettled items see `docs/OPEN_DECISIONS.md`.

---

## PD-1 · Sign-in verification
**SMS OTP to any number the advocate enters. Enrolment verified separately, later.**

Bar Council rolls carry stale phone numbers. Gating signup on a roll-matched
number blocks legitimate users before they have seen any value. WhatsApp OTP is a
Phase 2 delivery channel — a channel swap, not a different decision.

## PD-2 · Access while enrolment is pending
**Full access. A quiet banner until verified.**

No public Bar Council verification API exists, so gating means a manual queue on
every signup. The enrolment number exists for positioning — a tool for licensed
practitioners — not for security.

## PD-3 · Firm sharing unit
**Per-matter. The owner invites specific colleagues to specific matters.**

Indian chambers work case-by-case; a junior is briefed on a matter, not given the
run of the chamber. Chamber-wide default sharing is also a conflicts hazard — two
advocates in one chamber can be on opposing sides of related matters.

## PD-4 · Notes in a shared matter
**Private by default. Shareable per note.**

The court record is shared; what the advocate thinks about it is theirs until
they say otherwise.

## PD-5 · Citator alert triggers
**Four of five.** An authority saved to a matter is set aside or overruled · an
authority cited in a filed draft is set aside · a judgment in one of the
advocate's own matters is uploaded · a matter is listed on a date they did not
know about.

**Excluded:** new judgments on a frequently searched subject. That is discovery,
not an alert. It belongs in the app, never in a notification.

## PD-6 · Alert cadence
**Batched into the evening briefing.** Two standing exceptions push immediately:
`set_aside` on a citation in an **exported** draft, and a newly discovered
listing for **tomorrow**.

A wrong cadence trains advocates to disable notifications permanently, and they
do not come back.

## PD-7 · In-app editing
**Paragraph-level. Tap a paragraph, edit its text. Citations locked.**

Export-only is too weak; full rich editing loses to Word. **Citations locked is
load-bearing** — a hand-edited citation breaks the verification chain and the
badge would assert something we no longer checked. Changing a citation goes
through the picker, which re-verifies. Free-typing over a verified citation must
be impossible.

## PD-8 · Editing and the AI-assisted mark
**Editing never affects it. Only explicit removal clears it.**

The mark is about provenance, not about how much text changed. Auto-clearing
above a threshold creates a gaming incentive and implies editing equals
ownership. Ownership is an act. That removal is a signature moment.

## PD-9 · Judgment reading view
All six, in priority order: paragraph anchors (tappable, linkable) · jump to any
paragraph cited elsewhere · highlight and save a passage to a matter · in-text
search · adjustable text size · reading progress across sessions.

Paragraph anchors are first because advocates cite by paragraph. Without them the
reading view is decorative.

## PD-10 · Search filters
**Ship:** court and bench strength · date range · subject or practice area · only
verified authorities · exclude set aside or doubted.

**Cut for v1:** judge name, reporter. Neither is how an advocate searches for law
— they are how a researcher searches for a document.

## PD-11 · Admin golden renders
**Not captured.** Admin is internal; CX2 builds from the live canvas. Separately,
admin still runs the v2 palette and needs an alignment pass — but capturing PNGs
of the old palette is wasted work.

## PD-12 · Domain context
Recorded in `PRODUCT_BRIEF.md` and `DOMAIN_TRUTH.md`. Most advocates are solo or
in chambers of two to five. Juniors appear at short notice, so a briefing must be
readable by someone who did not prepare it. The physical file remains the source
of truth. `.docx` export is non-negotiable. Court connectivity is genuinely bad.
Next dates are given orally and written on the file, so manual entry must feel
first-class.
