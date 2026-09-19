# DELHI HIGH COURT — PRIMARY SOURCE PILOT (RESEARCH)

```text
GOVERNING                      = NO
DHC_SYSTEMATIC_DATABASE_INGEST = BLOCKED_PENDING_WRITTEN_PERMISSION
IMPLEMENTATION_TASK            = NONE CREATED BY THIS FILE
GATE_D_BLOCKER                 = NO
```

Installed by Amendment A2 (roadmap v7.4 §26.11), 19 September 2026. This is a
**source laboratory design document**, not a scraping plan and not a schedule.

---

## 1 · Why Delhi HC, and why not yet

Delhi HC is the richest single-court publication surface available to us: it
publishes judgments, orders and daily orders; cause lists in several versions;
case and filing status keyed by CNR; a display board; a roster; rules, practice
directions, circulars and notifications; and e-DHCR official reporting, with
corrections, withdrawals and revisions occurring against all of it.

That richness is exactly what the A2 data programs need in order to be designed
against something real rather than something imagined — the court event graph
(§26.5), the five-clock freshness model (§26.4) and the Source Passport (§26.3).

And that is also why it is **not** a target. LawMind holds no written
authorization for Delhi HC's own systems. The eCourts registrar's grant authorizes
eCourts and its enumerated data types; it says nothing about the Delhi HC website,
and extending it would be the precise mistake roadmap §26.2's fourth rule names:
`ONE SOURCE'S AUTHORIZATION != ANOTHER SOURCE'S AUTHORIZATION`.

## 2 · Research inventory — what exists

```text
JUDGMENTS · ORDERS · DAILY ORDERS

CAUSE LIST
  ADVANCE · MAIN · SUPPLEMENTARY · REVISED · DELETION · CORRIGENDUM · PRONOUNCEMENT

CASE / FILING STATUS · CNR / CASE IDENTITY

DISPLAY BOARD

ROSTER · BENCH · COURTROOM

RULES · PRACTICE DIRECTIONS · CIRCULARS · NOTIFICATIONS

e-DHCR / OFFICIAL REPORTING

CORRECTIONS · WITHDRAWALS · REVISIONS
```

Recording that a surface exists is not a plan to take it.

## 3 · Hard boundary until written permission or a formal arrangement exists

```text
NO systematic commercial mirror
NO production crawl
NO CAPTCHA bypass
NO authenticated-service automation
NO bulk storage or reproduction based merely on accessibility
```

The CAPTCHA line deserves saying plainly, because `CLAUDE.md` §6 permits bypass for
**eCourts**: that permission is a field on the eCourts grant, it lives only in
`services/api/src/court/ecourts.ts`, and it expires with that grant. It confers
nothing anywhere else. Bypassing a Delhi HC access control would be unauthorized
access, and no amount of strategic value changes that.

## 4 · Allowed planning work

- **Source schema** — the Source Contract fields (§26.2) filled in for DHC as a
  design exercise, with `AUTHORIZATION STATE = NOT_AUTHORIZED` stated on its face.
- **Identity model** — how a DHC case, its CNR, its listings and its orders relate;
  how a corrigendum attaches to what it corrects.
- **Parser design on lawful, bounded fixtures** — a handful of documents obtained
  lawfully, used to design extraction. Not a harvest, and not a standing job.
- **Direct linking** where currently permitted.
- **A permission or partnership request.**

## 5 · The non-inference invariants this pilot is designed to respect

```text
LISTED_OBSERVED          != HEARING_OCCURRED
DISPLAY_BOARD_OBSERVED   != FINAL_CASE_STATUS
PRONOUNCEMENT_ENTRY      != JUDGMENT_TEXT_PUBLISHED
MISSING_PDF              != NO_JUDGMENT_DELIVERED
FAILED_FETCH             != NOTHING_CHANGED
TIME_PASSING             != COURT_EVENT
```

Every one of these is a plausible-looking inference that a cause list plus a clock
invites, and every one of them would produce a confident wrong answer about a real
hearing. Observations are append-only and versioned; an overwritten observation
cannot later be distinguished from one that was never made.

## 6 · Next lawful step

A permission / partnership request. Until it is answered in writing:

```text
DHC_SYSTEMATIC_DATABASE_INGEST = BLOCKED_PENDING_WRITTEN_PERMISSION
```

This is a parallel strategic track (roadmap §24, A2 block) and **may not consume
the private-beta release critical path**.
