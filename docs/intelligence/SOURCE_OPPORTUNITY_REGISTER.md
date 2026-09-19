# LAWMIND — SOURCE OPPORTUNITY REGISTER

```text
GOVERNING            = NO
AUTO_PROMOTE_TO_ROADMAP = NO
DATED_INTELLIGENCE   = YES
AUTHORIZES_NOTHING   = TRUE
```

**Recording a source here authorizes nothing.** Installed by Amendment A2 (roadmap
v7.4 §26.2 / §26.12), 19 September 2026. Authorization is governed by
`CLAUDE.md` §6/§6a and by the Source Contract discipline in roadmap §26.2 — never
by presence in this list.

---

## 1 · The four rules this register exists to enforce

```text
OFFICIAL                   != AUTOMATIC PERMISSION
TECHNICALLY ACCESSIBLE     != AUTHORIZED
ADAPTER WORKS              != PUBLIC FEATURE
ONE SOURCE'S AUTHORIZATION != ANOTHER SOURCE'S AUTHORIZATION
```

The fourth is the one that costs real time. LawMind holds named authorizations for
**BharatLaw**, **Supreme AI** and **eCourts** (CLAUDE.md §6a, valid through
13 November 2029). None of them extends to a fourth source, and a working parser is
not a permission. `Supreme AI` and `Supreme Today` are different sources.

Two standing prohibitions from `CLAUDE.md` §6 are not relaxed by anything here:
never circumvent an access control you have not been authorized to, and never buy
data from someone who did.

## 2 · Entry format

```text
SOURCE                  name, owner, jurisdiction, court/body/publisher
SOURCE CLASS            primary official | official aggregator | licensed | other
CANONICAL ORIGIN        the authoritative URL or system
OFFICIALNESS            official | semi-official | third-party
AUTHORIZATION BASIS     the instrument, or NONE
AUTHORIZATION STATE     AUTHORIZED | NOT_AUTHORIZED | UNRESOLVED
ALLOWED TODAY           acquisition / storage / reproduction / linking, per the basis
EXPLICIT PROHIBITIONS   what the basis does NOT cover
WHY IT WOULD MATTER     the opportunity, phrased as an opportunity
BLOCKER                 what stands between us and it
NEXT LAWFUL STEP        usually: request permission — never: try it and see
REVIEW / EXPIRY         when this row stops being trustworthy
```

`AUTHORIZATION STATE = UNRESOLVED` means **do not acquire**. It does not mean
"probably fine".

## 3 · Register

### 3.1 Delhi High Court — reference source laboratory

```text
SOURCE               Delhi High Court (own systems: judgments, orders, cause lists,
                     case status, display board, roster, rules, e-DHCR)
SOURCE CLASS         primary official
OFFICIALNESS         official
AUTHORIZATION BASIS  NONE recorded in this repository
AUTHORIZATION STATE  NOT_AUTHORIZED for systematic ingest
ALLOWED TODAY        source-schema and identity-model design; parser design on
                     lawful bounded fixtures; direct linking where currently
                     permitted; a permission / partnership request
EXPLICIT PROHIBITIONS
                     NO systematic commercial mirror · NO production crawl ·
                     NO CAPTCHA bypass · NO authenticated-service automation ·
                     NO bulk storage or reproduction based merely on accessibility
WHY IT WOULD MATTER  the deepest single-court event and publication model available
                     to us; the proving ground for the court event graph (§26.5) and
                     the five-clock freshness model (§26.4)
BLOCKER              written permission / formal arrangement
NEXT LAWFUL STEP     permission or partnership request — see
                     docs/research/DELHI_HIGH_COURT_PRIMARY_SOURCE_PILOT.md
REVIEW / EXPIRY      on any founder decision, or on written permission arriving
```

`DHC_SYSTEMATIC_DATABASE_INGEST = BLOCKED_PENDING_WRITTEN_PERMISSION`. Delhi HC is
**not** a Gate-D blocker. The eCourts grant authorizes eCourts and says nothing
about Delhi HC's own systems.

### 3.2 Already-authorized sources — recorded so nobody re-opens them

```text
BharatLaw · Supreme AI · eCourts     AUTHORIZATION STATE = AUTHORIZED
```

Founder-declared and settled (CLAUDE.md §6a), valid through 13 November 2029. **Do
not** return these to `docs/FOUNDER_QUEUE.md` as unresolved licensing blockers or
treat them as an OPEN_DECISION. Source-specific operational constraints still bind
— in particular the eCourts rate limiter, fetch ledger and enumerated
`permittedDataTypes` in `services/api/src/court/authorisation.ts`.

### 3.3 SCI direct automation — untouched by A2

```text
SCI_AUTHORISATION_STATE = UNCHANGED
```

The Supreme Court direct-automation question (`docs/SCI_AUTHORISATION.md`,
FQ-LCC-R10-1 point 2) remains contested and is **not** resolved, inferred or
approved by the eCourts decision of 29 August 2026 or by A2.

### 3.4 Bulk judgment corpora — the settled position

Corpus acquisition in bulk is permitted and encouraged from AWS Open Data
(CC-BY-4.0, with attribution): there is no copyright in a judgment
(Copyright Act s. 52(1)(q)(iv)). What is protected is a reporter's copy-edited
version — headnotes, editorial numbering (*Eastern Book Company v. D.B. Modak*) —
so use raw court text and never a law report's edition of it. Recorded here for
completeness; this is `CLAUDE.md` §6, not a new opportunity.

---

*New entries append below. A row is evidence of a question asked, never of an
answer granted.*
