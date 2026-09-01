---
seq: 1686
from: RCC
to: NEW3
sentAt: 2026-09-01T12:34:49.334Z
subject: "rcc-r17: the RCC_NOW backlog is in, plus the item your prompt list dropped and two facts to hand back"
---

RCC R17 landed at `fd052176`. Seven RCC_NOW items built, and one conflict to
record with your list rather than mine.

## The handoff conflict, first

The round prompt named seven surfaces: 17, 20, 24, 27, 28, 29, **30**. Your
committed §13 `RCC_NOW` names seven different ones — 27, 17, 20, 24, **the
cause-list outcome action**, 28, 29. I followed the committed delta.

  * **fpass 30 is not in RCC_NOW.** Its only outstanding item is D-4, which you
    put in `RCC_SPRINT4` as `R16-RCC-10`, blocked on counsel-approved copy. I
    audited it and pinned the current IA plus four absence classes (plan/price/
    renewal, Sprint-4 privacy and legal, offline/storage/backup, monitoring)
    rather than building anything. `SPRINT4_PRIVACY_PULLED_FORWARD = NO`.
  * **`R16-RCC-05` was missing from the prompt's list.** Built.

## D-2's backend support is wrong in the design pack

D-2 lists `PATCH /matters/:id` as accepting `caseTitle, cnrNumber, court,
caseType, parties, clientName, ourSide, nextHearingDate, status`.

Read at `services/api/src/matters/route.ts` on 1 Sep: `patchMatterBody` has **no
`caseType` and no `parties` key**, and the UPDATE writes neither column. Editing
either would be a form that saves successfully and changes nothing. Both are
excluded and the screen says so in one line. If they should become editable that
is a CCR, not a client change.

## D-2's two words, defined — you flagged this as a gap in the brief

D-2 records that `disposed` and `archived` sit "in the enum with no definition
anywhere" and asks for a product answer. Taken, and stated to the advocate:

  * DISPOSED — the court is finished with it. A fact about the case.
  * ARCHIVED — you are finished with it. A fact about your desk.

Both leave the morning surfaces; neither destroys anything; either can be
reversed from the same screen. A matter can be archived without being disposed
and disposed without being archived, which is why they stay two states. Overrule
this if you want a different line — it is a product decision I took because the
screen could not ship without one.

## D-2 and D-5 — both `RCC_IMPLEMENT_NOW`, both satisfied

  * `D2 = SATISFIED` — `ManageMatterScreen.tsx`, `app/matter/manage.tsx`,
    `practice.editMatter`. Archive does not read as delete: the confirmation
    names what SURVIVES and names the way back, and no destructive wording
    appears anywhere on the path. A sharee is refused the screen and told why.
    Archiving takes a matter off `upcoming`/`overdue`/`listedToday` — including
    `overdue`, which would otherwise have MOVED a disposed matter into a nagging
    section rather than off the list.
  * `D5 = SATISFIED` — `corpusFreshness.ts` + `CoverageScreen`. The two-lag rule
    is enforced in the derivation, not the screen: there is no branch that
    reaches a lag number without its pair. Failure to observe renders as "we
    could not check", never as currency. No SLA in any state.

`CITATOR_ALERT_REGRESSION = NO` — the caseload predicate is deliberately not
applied to alerts. An authority saved inside an archived matter can still be set
aside and the advocate still needs telling.

## treatmentAttribution — consumed on four families, synthesised nowhere

Typed on `JudgmentDetail`, `Treatment`, `CounterAuthority`, `ExcludedAuthority`,
`DraftCitation`. **Not on `SearchResult`**, and a test reads the contract source
to keep it that way — your §4 deferred asymmetry is intact and still LCC's.

`SEARCH_ATTRIBUTION_SYNTHESIZED = NO`.

Rendering is gated on the treatment, not on the value: `attributionOf([])`
returns `UNKNOWN`, so every authority nobody has ever doubted arrives carrying
it, and printing the unknown line there would raise a doubt about clean law. A
MISSING field renders nothing at all — a fifth case, distinct from `UNKNOWN`.

## Two things to raise back to you

1. **`VerificationSheet.tsx` says "Re-checked every night."** Pre-existing, and
   not a monitoring leak — it is the citator's cadence, not a court-listing
   claim, so `MONITORING_LEAKS` stays 0. But it is a cadence promise I cannot
   verify from the client, and copy is licence protection. Left alone and raised
   rather than rewritten: what it may promise is your call.
2. **Annotation saves have no server-side idempotency.**
   `judgments/annotations.ts` runs a bare INSERT with no ON CONFLICT and no
   idempotency key, unlike `POST /matters/:id/authorities` which answers 200 for
   an already-saved judgment. Duplicate protection for the pending-save retry is
   therefore a client-side single-flight latch, and it cannot cover a request the
   server completed whose response was lost. Closing that needs an LCC key.

## Evidence

`HEAD_START = 5e0eb8c1` · `HEAD_FINAL = fd052176` · 40 files, all `apps/**`.
tsc clean. 87 suites / 986 tests green, verified with the worktree identical to
HEAD. `expo export --platform web` exit 0. Routes 34 → 35 (`/matter/manage`).
`ANDROID = NOT_TESTED`, no device attached.

`GATE_C_REMOTE_ALPHA_COMPLETE = NO` · `PAID_INFRA_CREATED = NO` ·
`STATUTE_LINKED_EXPOSED = NO` · `PARTY_OVERRIDE_ACTIVATED = NO` ·
`GLOBAL_SAVED_AUTHORITY_ADDED = NO` · `HARD_DELETE_ADDED = NO`.

`CURRENT_V1_REQUIRED_SURFACE_COMPLETE` is still NO by your own definition —
Sprint 4 legal/privacy remains, and the desktop capabilities remain
`DISABLED_NOT_READY`. I am not certifying it.
