# RCC R26 — physical Android evidence, and the two defects only a phone found

Device: **SM-S921B (Galaxy S24), Android 16, serial RZCX90X1BNF, USB**.
`co.lawmind.app` is a Metro dev build, so the JS under test is this working tree:
local API on port 3000 against the real corpus database, Metro on 8081, both
reached through `adb reverse`.

Wireless adb was tried first and failed; USB is what the founder connected. The
diagnosis is kept in the round README because it was precise and wrong-footed by
one fact.

## What the device found that 1,274 unit tests and an e2e suite did not

### 1 · "Good morning" at 15:58

`TodayScreen` greeted every advocate with a hard-coded `'Good morning'`. Observed
on the phone at 16:02 local. It is small and it is the same class as everything
else this round is about: the app asserting something it had not checked, on the
Tier-B daily-loop surface that ships first and is the first thing opened each
day.

Nothing could have caught it. The string was a CONSTANT — there was no wrong
branch to test, and the one assertion that touched it (`TodayScreen.alerts.test`)
matched `/Good morning/` and so was *pinned to the defect*. It would have passed
forever.

`screens/today/greeting.ts` reads the device clock and takes it as an argument so
a test can stand at any hour. The alerts test now asks the helper what it should
say rather than naming one of the three answers.

    BEFORE   "Good morning, RCC Smoke Advocate"   at 16:02
    AFTER    "Good afternoon, RCC Smoke Advocate" at 16:04    <- re-observed on the device

### 2 · Today rendered a greeting and then nothing at all

The account has **1 matter and 0 events**. Every section of Today is
individually correct to render `null`, and the "No matters yet" empty state is
gated on `matters.length === 0` — which is false. So the screen drew the
greeting and then a void, all the way to the tab bar.

The defect is the CONJUNCTION: it exists only when six sections are empty at once
AND the seventh is suppressed by a count that is not zero. No unit test asserts
the absence of everything simultaneously, and the e2e suite does not render this
screen.

The new state says what is true and no more. Lawmind knows the hearing dates that
were RECORDED; it does not know the court's list. So it says no dates are
recorded — never "you have no hearings", which would be a claim about a court's
diary this product has no basis for.

    AFTER    "Nothing scheduled" / "No hearing dates are recorded on your matter,
             and nothing has moved under the authorities you have saved."
             + "Open matters"                                  <- observed on the device

## The matrix, as far as it got

| row | result | evidence |
| --- | --- | --- |
| app launches, authenticated session resumes | PASS | Today rendered for `RCC Smoke Advocate` |
| SEARCH | **PASS** | `Satender Kumar Antil v. CBI` → 3 judgments; `2022 INSC 690` at rank 1 with operative ¶41 and its evidence passage; verified citations render silently, as the rule requires |
| READER | **PASS** | identity → court/date → bench → case number → `WHERE THIS CAME FROM` (Source · Supreme Court of India, "Open the court's copy", and the truthful "From a law reporter's edition — the text may include editorial matter") → RELIED ON with four real authorities |
| SAVE authority | **PASS** | picker → matter → `matter_authorities` row written `2026-09-15T10:37:20.833Z`, and it appeared in the matter's AUTHORITIES block on the next screen |
| MATTER detail | **PASS** | court, title, parties, "No next date recorded", actions, authorities, timeline |
| MATTER list | PASS | grouped under `AWAITING A DATE` with an em-dash for the absent date — which is the state Today was failing to render |
| EVENT double-tap | **NOT PROVEN** | see below |
| MATTER create · ADJOURNMENT · ANNOTATION · VERIFY confirm · identity_only DELETE | **NOT RUN** | see below |
| background / resume | NOT RUN as such | the app survived repeated force-stop and relaunch cycles; that is not the same test |
| CRASHES | **1, and it was mine** | `[ReferenceError: Property 'timeOfDayGreeting' doesn't exist]` — Metro fast-refresh pushed the edited screen before the new module was in its graph. A dev-tooling artefact of editing mid-session, not a product crash. Clean relaunch was fine. |
| ANRs | none observed | |
| OOM | none observed | |

## Why the matrix stopped where it did — two separate causes, both real

**The phone locked.** `deviceLocked=1`, `isKeyguardShowing=true`,
`mWakefulness=Dozing`. Continuing means unlocking someone's phone, which this
lane does not do.

**The database is saturated by another lane.** Five parallel backends have been
running `CREATE INDEX new1_doc_vector_stage_hnsw` for **4h37m**, and ad-hoc
connections to the user tables now stall past 60s. The API itself is unaffected —
its warm pool served `/matters`, `/me`, `/alerts` and
`/matters/:id/authorities` in 1–103 ms throughout — so this bit only the direct
SQL used to *verify* writes, not the product.

RCC standing orders are explicit that NEW1/HNSW workers are not to be touched, so
nothing was killed and nothing was waited on.

## The one row that is outstanding, stated as unknown rather than guessed

The double-tap was performed: two taps dispatched at the Save control of the
add-event sheet, with a note reading `RCC R26 physical double-tap probe`. **Then
the verifying query stalled and the phone locked, so the number of durable rows
was never read.**

`EVENT_DOUBLE_TAP = UNVERIFIED`. Not PASS, not FAIL. The answer is one query
away and needs no device — `matter_events` for matter
`cedfe466-cdc1-4be3-b69e-03103593d986`, expecting exactly one row carrying that
text. It is recorded here so the next session runs it rather than assuming
either answer.

## What this run does not claim

- It is **local** physical evidence. The API was on this machine over
  `adb reverse`, not remote over mobile data — so it is **not** Gate C.
- No sign-in flow was exercised: the session was already established, so
  `AUTH_DEEP_LINK_PHYSICAL` is NOT RUN, not PASS.
- Timings observed during the HNSW build are not representative of anything.
