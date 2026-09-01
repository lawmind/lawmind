# NEW3 — FOUNDER DESIGN PACK, R15

**Lane:** NEW3. **Date:** 1 September 2026. **HEAD:** `e2a298e6`.
**Source of every row:** `docs/product/NEW3_R15_ADJUDICATION.md`, which adjudicated a
UI Surface Audit against committed code.

**What this is.** Five items that genuinely need the founder to design something, stated
so they can be designed **externally** and delivered as a ZIP. Each row says what the
advocate is trying to do, what already exists behind it, what is missing, and what must
be true on the screen. **None of them draws a screen, and none may be read as a layout
instruction.**

**What this deliberately excludes.** Everything the adjudication classified as
`IMPLEMENTATION_BUG_ONLY` or `NOT_A_REAL_GAP` — seven items — is **not** here.
A dead link, an unpersisted field and a false copy line are bugs. Asking the founder to
design a fix for a bug is how a correctness defect becomes a design backlog and then
never lands.

**Also excluded, and stated so its absence is not read as an oversight:** no monitoring
screen. `monitoring.user_product` is `DISABLED_NOT_READY` on every platform, zero
observations exist, and a reachable alert screen is not evidence that monitoring should
be designed. `CLAUDE.md` and `V1_CLAIMS_REGISTER_R14.md` §C both hold; nothing in the
audit moves them.

**Sequencing.** Nothing here blocks Gate C. The two Gate-C blockers the adjudication
found (auth guard / deep-link continuation, and the `matter-sharing` route gate) are
both RCC implementation and are handed over directly, not through this pack.

---

## D-1 · DATA EXPORT AND CORRECTION

```
DESIGN_ID              D-1
PRIORITY               P1 · SPRINT4_REQUIRED · not a Gate C blocker
PLATFORM               ios · android   (web: out of scope, PD-15 reversed)
CURRENT_ENTRY_POINT    NONE. Settings offers Alerts, Coverage, Training data,
                       Sign out, Delete account — and nothing else.
USER_JOB               "The enrolment number on my account is wrong and I need it
                       fixed", and "send me everything you hold about me".
CURRENT_FUNCTION       NONE on the client for these two kinds.
BACKEND_SUPPORT        FULLY BUILT.
                         POST /me/data-requests  kind ∈ {export, correction, erasure}
                                                 note: string ≤ 1000 (correction only)
                         GET  /me/data-requests  returns id, kind, status, dueAt,
                                                 completedAt, refusalReason
                       Client methods already exist and are unused for these kinds:
                         api.createDataRequest  (client.ts:476-489)
                         api.listDataRequests   (client.ts:490)
                       `erasure` is already wired through DeleteAccountScreen.tsx.
MISSING_UX             A place to raise an export or a correction, and a place to see
                       what was raised and where it stands.
REQUIRED_INFORMATION   · the three kinds, and that they are different requests
                       · for a correction, a free-text field, ≤ 1000 characters
                       · per outstanding request: kind · status · the DUE DATE
                       · a refused request must show its refusal reason
REQUIRED_ACTIONS       raise an export · raise a correction · view outstanding requests
REQUIRED_TRUTH_STATES  · REQUESTING IS NOT EXECUTING. The server's own module note is
                         binding: a request is created, nothing is performed on this
                         surface, and erasure runs from the admin side because it is
                         irreversible. The screen must not imply the data is gone or
                         the export is ready.
                       · The DPDP clock is a promise. `dueAt` is served; showing the
                         request without its due date turns an obligation into a
                         suggestion.
                       · Never claim complete PII removal — coverage is partial, and
                         `CLAUDE.md` requires that to be said plainly wherever it is
                         implied.
CONTRACT_REVISION      NONE. Every route and every client method already exists.
IMPLEMENT_AFTER_DESIGN_BY   RCC
```

---

## D-2 · MATTER EDIT, DISPOSAL AND ARCHIVE

```
DESIGN_ID              D-2
PRIORITY               P1 · REQUIRED_CURRENT_V1_BUT_CAN_LAND_AFTER_GATE_C
PLATFORM               ios · android
CURRENT_ENTRY_POINT    NONE. A matter is created at /matter/new and is thereafter
                       immutable except for its next hearing date.
USER_JOB               "I typed the case title wrong." · "This matter is disposed and
                       I do not want it on my list every morning."
CURRENT_FUNCTION       Only `nextHearingDate` can be changed. Verified: the client's
                       updateMatter (client.ts:586) is called exactly once, at
                       state/practice.ts:126, with that one field.
BACKEND_SUPPORT        FULLY BUILT.
                         PATCH /matters/:id accepts caseTitle, cnrNumber, court,
                         caseType, parties, clientName, ourSide, nextHearingDate,
                         and status ∈ {active, disposed, archived}
                       Ownership is checked on every write. A sharee cannot write.
MISSING_UX             An edit affordance, a disposal/archive affordance, and a place
                       archived matters go.
REQUIRED_INFORMATION   · which fields are editable and which are identity
                       · what `disposed` means as against `archived` — this is a
                         PRODUCT decision, not a data one, and the two words are in
                         the enum with no definition anywhere
                       · where an archived matter can be found afterwards
REQUIRED_ACTIONS       edit the editable fields · dispose · archive · find an archived
                       matter · reverse an archive
REQUIRED_TRUTH_STATES  · ARCHIVE MUST NOT LOOK LIKE DELETE. A matter carries saved
                       authorities, events, briefings and possibly a share. Nothing
                       on this path may read as destruction.
                       · A SHAREE MUST NOT BE OFFERED IT. `accessMode` is served per
                       matter precisely so an absence and a permission boundary are
                       distinguishable; the workspace already uses it and this must too.
                       · ARCHIVING CHANGES WHAT THE MORNING SHOWS. Today, the cause
                       list and the briefing sweep all read matter state. Whether an
                       archived matter can still surface an alert about an authority
                       saved in it is a truth question, not a styling one.
CONTRACT_REVISION      NONE expected. If the design needs a state the enum does not
                       have, that is a CCR and must be filed before build.
IMPLEMENT_AFTER_DESIGN_BY   RCC
```

---

## D-3 · HEARING OUTCOME — "HEARD, ORDER RESERVED"

```
DESIGN_ID              D-3
PRIORITY               P1 · REQUIRED_CURRENT_V1_BUT_CAN_LAND_AFTER_GATE_C
PLATFORM               ios · android
CURRENT_ENTRY_POINT    Cause list → tap a listed matter → the outcome sheet.
                       CauseListScreen.tsx:151-161.
USER_JOB               Standing in a corridor after a hearing: record what happened,
                       in one tap, and move to the next matter.
CURRENT_FUNCTION       The sheet offers TWO outcomes. "Adjourned — record next date"
                       goes to the adjournment recorder and works. **"Heard — order
                       reserved" navigates to the matter and records nothing** — it is
                       byte-for-byte the same destination as the "Open the matter" link
                       directly beneath it.
BACKEND_SUPPORT        PARTIALLY BUILT, and the gap is a product decision not a code one.
                         POST /matters/:id/events accepts
                           eventDate · eventType ∈ {hearing, order, filing, note}
                           orderText (the court record, always travels with a share)
                           notes (the advocate's own thinking, private by default)
                           noteVisibility
                       There is no `outcome` concept and no "order reserved" state
                       anywhere in the schema.
MISSING_UX             What one tap on "Heard" should record, and what the advocate
                       sees afterwards.
REQUIRED_INFORMATION   · whether "order reserved" is a distinct thing from "heard"
                       · whether the matter leaves the morning list once heard
                       · whether an order-reserved matter should be resurfaced later,
                         and if so on what signal
REQUIRED_ACTIONS       record the outcome in one tap · optionally add a line about it
REQUIRED_TRUTH_STATES  · NO DATE MAY BE INVENTED. An order-reserved matter has no next
                       date. The product must not fabricate one and must not leave the
                       matter looking as though a date is known.
                       · IF IT IS NOT PERSISTED, IT MUST NOT BE OFFERED. The present
                       state — a button that looks like an outcome and records nothing —
                       is the defect. Removing the button is an acceptable answer to
                       this design brief.
                       · NO CONFIRMATION DIALOG. The screen's standing rule, and the
                       reason it works in a corridor.
CONTRACT_REVISION      NONE if the answer maps onto matter_events. A new outcome state
                       on `matters` would be a CCR and must be filed before build.
IMPLEMENT_AFTER_DESIGN_BY   RCC
```

---

## D-4 · PERMANENT PRIVACY AND LEGAL ACCESS

```
DESIGN_ID              D-4
PRIORITY               P1 · SPRINT4_REQUIRED — store and commercial readiness
PLATFORM               ios · android
CURRENT_ENTRY_POINT    NONE after onboarding. Terms are accepted once
                       (users.terms_accepted_at / terms_version, PD-8) and
                       GET /terms/current is mounted and unconsumed after that point.
USER_JOB               "What did I agree to?" — months later, without reinstalling.
CURRENT_FUNCTION       Onboarding consent only.
BACKEND_SUPPORT        GET /terms/current is live. Training consent already has its
                       own permanent surface (TrainingConsentScreen.tsx, DPDP s. 6),
                       reachable from Settings — that is the pattern to follow.
MISSING_UX             A permanent, reachable home for the privacy policy, the terms,
                       and the version the advocate actually accepted.
REQUIRED_INFORMATION   · the current terms, readable in the app
                       · WHICH VERSION this advocate accepted, and WHEN — the columns
                         exist; reading them back is the point
                       · how data is handled, in the product's own words
REQUIRED_ACTIONS       read the terms · read the privacy policy · see what was accepted
REQUIRED_TRUTH_STATES  · NO AI-ASSISTED MARK ON DOCUMENTS. Consent is given once at
                       onboarding, recorded on the user row. PD-8 is superseded and
                       nothing here may reintroduce a per-document mark.
                       · PII COVERAGE IS PARTIAL and must be described as partial.
                       · THE DPA IS STILL OWED. OD-6 is resolved but the countersigned
                       data-processing agreement is outstanding, and the admin surface
                       refuses sensitive routing without one. Nothing on this screen
                       may promise a processing posture that is not yet contracted.
CONTRACT_REVISION      NONE.
IMPLEMENT_AFTER_DESIGN_BY   RCC
```

---

## D-5 · CORPUS FRESHNESS ON THE COVERAGE SURFACE

```
DESIGN_ID              D-5
PRIORITY               P2 · REQUIRED_CURRENT_V1_BUT_CAN_LAND_AFTER_GATE_C
PLATFORM               ios · android
CURRENT_ENTRY_POINT    Settings → "Coverage — what we hold". The screen exists and is
                       reachable; it shows coverage only.
USER_JOB               "Is the judgment from last month in here yet?" — the question
                       an advocate asks before trusting an empty result.
CURRENT_FUNCTION       CoverageScreen.tsx calls api.corpusCoverage() and renders held
                       counts by court. It calls NOTHING about freshness.
BACKEND_SUPPORT        FULLY BUILT AND UNCONSUMED.
                         GET /corpus/freshness
                         GET /corpus/freshness/object  — additionally reports
                           upstreamLocalCompleteness 0.9697 and
                           sourceUnavailableCount 46,754
                       Both self-describe their publication generation. Measured p50
                       on the object route: 7.5 ms.
MISSING_UX             A truthful freshness statement on a screen that already answers
                       the neighbouring question.
REQUIRED_INFORMATION   TWO LAG NUMBERS, AND THIS IS THE WHOLE DESIGN PROBLEM:
                         naive         lagDays  1   — max(judgment_date) is yesterday
                         legalCurrency lagDays 29   — the newest month at ≥60% of a
                                                      134,810/month baseline
REQUIRED_ACTIONS       read it. Nothing is actioned from this screen.
REQUIRED_TRUTH_STATES  · **QUOTE BOTH OR NEITHER.** The registry states this as a rule,
                       not a preference. "1 day behind" alone would be the single most
                       misleading number in the product: it is true, and it describes
                       the newest row rather than the newest usable month.
                       · A COVERAGE GAP IS NOT A SEARCH FAILURE. This screen exists so
                       an advocate who gets nothing from their own High Court learns
                       which of the two it was.
                       · NO SLA. A freshness observation is not a promise about
                       tomorrow, and must not be shaped like one.
CONTRACT_REVISION      NONE. Both routes are mounted and stable.
IMPLEMENT_AFTER_DESIGN_BY   RCC
```

---

## SUMMARY

```
FOUNDER_DESIGN_REQUIRED_COUNT = 5     D-1 · D-2 · D-3 · D-4 · D-5
GATE_C_BLOCKERS_IN_THIS_PACK  = 0
CONTRACT_REVISIONS_REQUIRED   = 0     every backend route named above already exists
NEW_CAPABILITIES_AUTHORISED   = 0
NEW_CLAIMS_AUTHORISED         = 0
```

Every one of the five is a screen for a capability that **already ships and already has
a working server behind it**. None of them turns anything on. If a design comes back
needing a state or a field the backend does not have, that is a CCR and it must be filed
before the build, not discovered during it.
