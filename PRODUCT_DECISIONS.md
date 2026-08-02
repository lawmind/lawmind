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

## PD-8 · The AI-assisted mark — SUPERSEDED 1 Aug 2026

**The mark is removed from the document. Consent moves to onboarding.**

The advocate must actively accept a consent screen covering AI assistance, the
duty to verify before filing, and the terms of legal use. Acceptance is recorded
with a **timestamp and terms version** in `users`.

The exported document carries **no watermark and no hatched margin**. Two things
are kept: a single line in the **export metadata**, and the one-line **citation
summary in the draft footer** while in-app.

**Why this supersedes the earlier decision.** An advocate who has explicitly
accepted the terms is a professional operating under their own duty to the court.
A watermark on a court filing is both patronising and a competitive disadvantage —
it marks our output as provisional in a document that has to stand on its own at
the filing counter.

### What the earlier decision said, and what survives
The original PD-8 held that *editing never affects the mark; only explicit removal
clears it, and that removal is a signature moment.* Its reasoning was sound for a
world where the mark existed: auto-clearing above a threshold creates a gaming
incentive and implies editing equals ownership.

That reasoning is now **moot rather than wrong** — there is no mark to clear.
Consequences applied:

- `documents.watermark_removed`, `watermark_removed_at`, `watermark_removed_by`
  retired, as is `POST /documents/:id/clear-ai-mark`.
- The two-checkbox-plus-typed-`REMOVE` flow is removed.
- `design/screens/IMPLEMENTATION.md` §4 still specifies an `AIMarkBar` and a
  `DraftPage` AI-mark header band. **Both are superseded and must not be built**;
  that file is a design deliverable and was not edited.

**PD-7 is unaffected.** Citations stay locked in editing, enforced server-side —
that rule protects the verification chain, not the mark.

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
**Not captured.** Admin is internal; RCC builds from the live canvas. Separately,
admin still runs the v2 palette and needs an alignment pass — but capturing PNGs
of the old palette is wasted work.

## PD-12 · Domain context
Recorded in `PRODUCT_BRIEF.md` and `DOMAIN_TRUTH.md`. Most advocates are solo or
in chambers of two to five. Juniors appear at short notice, so a briefing must be
readable by someone who did not prepare it. The physical file remains the source
of truth. `.docx` export is non-negotiable. Court connectivity is genuinely bad.
Next dates are given orally and written on the file, so manual entry must feel
first-class.

## PD-13 · Tier names — Practice · Chamber · Expert · Firm
**Settled 2 Aug 2026.** Starter and Professional are retired. The site names win;
the docs move.

| Tier | Price | Unit | In-app purchase |
|---|---|---|---|
| **Practice** | ₹799/mo | One advocate, starting out | Yes |
| **Chamber** | ₹1,999/mo | One advocate, full practice | Yes |
| **Expert** | ₹3,499/mo | One advocate, heavy volume | Yes |
| **Firm** | Talk to us | 5–10 advocates, shared matters | **Never** |
| **Enterprise** | Off-app | Roadmap | **Never** — not shown in-app at all |

Starter / Professional are SaaS language. An advocate does not describe themselves
as being on a professional plan; they describe the size of their practice. The
first three tiers are **one advocate at three volumes** — Firm is the first tier
where the *unit* changes, which is why it is also the first with no price.

### The Chamber collision, resolved
**Chamber stays the solo tier. The multi-seat tier is Firm.**

The obvious objection is that "chamber" sounds collective. It is not, in Indian
practice: a solo advocate has *their* chamber, while *firm* is what several
advocates practising together call themselves. The alternative — renaming the solo
tier to Practice and shifting everything down — fails because **Practice is already
the entry tier and the better word for it.**

The deciding factor is cheaper than either argument: **the site is live with
Chamber at ₹1,999, and renaming a published tier costs more than naming an unbuilt
one.**

**This does not reopen PD-3.** Sharing remains **per matter, by invitation**. A
"Firm" tier is a billing unit, not an org chart — a chamber of two to five people
is still a list of names.

### Firm and Enterprise may never show an in-app purchase control
Not a pricing preference — an **App Store rejection under guideline 3.1.1**. And
**a link to a web checkout page is the same violation**: "Talk to us" opens a mail
composer. No price, no button, no URL on either row, ever.

## PD-14 · The founding offer
**Settled 2 Aug 2026. "Founding advocates keep 50% off, permanently. First 5,000
only."**

Both the discount and the cap are **bounded**, which is the whole reason it can be
published now.

**No "three months free."** The briefing cost per user is not yet computed, and a
free window is an **unbounded commitment against an unknown number of users** —
briefings are the most expensive thing we generate per advocate. It ships only once
that cost is measured from real beta usage. Condition recorded in
`docs/COMPETITIVE.md`.

**A counter, never a countdown clock** — "1,204 of 5,000". A clock reads as a
growth tactic to a senior advocate; a counter is a fact about how many seats are
gone.

The card sits **above** the tiers, so the struck-through prices below are already
explained by the time they are read. The layout is a **stack, not a grid**, so the
free window can append as a fourth line under the progress rule without moving
anything below it.
