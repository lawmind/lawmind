# NEW3 R15 — TRUST-STATE CCR ADJUDICATION AND UI SURFACE AUDIT DISPOSITION

**Lane:** NEW3. **Date:** 1 September 2026.
**HEAD at start and at finish of adjudication:** `e2a298e637721de68e02a0ae7419795a1c84cdbd`.
**Contract output:** `docs/product/RCC_V1_API_CONTRACT_R15_AMENDMENT.md`.
**Design output:** `docs/product/NEW3_FOUNDER_DESIGN_PACK_R15.md`.
**Registry output:** `docs/product/V1_CAPABILITY_REGISTRY_R15.json`.

**Inputs adjudicated:** LCC's trust-state contract exercise at `b3ca71b2`
(`docs/LCC_TRUST_STATE_CONTRACT_EXERCISE.md`, bus 1654) carrying CCR-LCC-XS-01
through -04; NEW3's own R14 cross-surface adjudication; RCC's physical-device
evidence at `e52e61eb` / bus 1653; and a UI Surface Audit whose findings were
supplied to this round as prose.

**No `apps/**`, `services/**` or `packages/db/**` file was modified. No migration was
run. No network request was made. No background worker was touched.** Every
database access this round was a read.

---

## 0 · REANCHOR — what was true when this round started

Read from committed source at HEAD, not from any lane's report.

```
RCC_API_CONTRACT (before)          R14
WIRE_PROTOCOL_VERSION              1
MIN_SUPPORTED_CONTRACT             1
PLATFORM_CAPABILITY_OVERRIDES      {}          capabilities.ts — empty literal
search.party_name (release-wide)   ENABLED     capabilities.ts
SEMANTIC_INDEX_SUFFICIENT          false       search/outcome.ts
runtime capability rows            25
product capability rows            30
PARTY_IOS_OVERRIDE_ACTIVATION      BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT
PARTY_DEFER_STATE                  INTACT
CCR-NEW3-XS-01                     DEFER, NON_GATE_P1_OPEN
```

**The party override guard holds and was not touched.** `PLATFORM_CAPABILITY_OVERRIDES`
is the empty object literal in `services/api/src/release/capabilities.ts`; the file's
own note says *"an empty override means 'the release-wide state stands', and adding the
row is the entire act of flipping the switch."* No row was added this round and none is
authorised by it.

---

## 1 · THE FOUR CCRs — DECISIONS

| CCR | subject | decision | revision effect |
|---|---|---|---|
| **CCR-LCC-XS-01** | `party_name_disabled` has no retrieval-outcome representation | **AMEND** | R15 §B1 — one additive reason value |
| **CCR-LCC-XS-02** | a fifth stored-layer surface, `GET /citations/:id` | **DEFER** (folded into CCR-NEW3-XS-01) + one engineering defect routed to LCC | R15 §B4, record only |
| **CCR-LCC-XS-03** | `treatmentAttribution` is on the wire; the prose says it is not | **AMEND (documentation only)** | R15 §B2, no shape moves |
| **CCR-LCC-XS-04** | trust state 6 claims a representation that does not exist | **NO_CHANGE (wire) + AMEND (record)** | R15 §B3, no field added |

```
CCR_LCC_XS_01_DECISION       = AMEND
NEW_RETRIEVAL_OUTCOME_REASON = capability_disabled
WIRE_CHANGE_REQUIRED         = ADDITIVE_VALUE_ONLY
R15_CREATED                  = YES
CURRENT_CONTRACT_REVISION    = R15
WIRE_PROTOCOL                = 1
WIRE_BREAKING_CHANGE         = NO
MIN_SUPPORTED_CONTRACT       = 1
```

**R14 is not overwritten.** It remains on disk, unedited, as the prior revision.

The full reasoning for each — including what was deliberately *not* built, and the two
guards that mask CCR-LCC-XS-01 today and are both scheduled for removal — is in the R15
amendment. It is not restated here.

### 1.1 The one thing that decided CCR-LCC-XS-01

`abstained` means *"we searched properly... here we looked."* With
`semanticIndexSufficient` true, a party query on a platform where the arm is disabled
returns exactly that, about an arm that never ran. Both masks that currently prevent it
— the empty override map and `SEMANTIC_INDEX_SUFFICIENT = false` — exist **to be
removed**, and neither has any reason to consult `outcome.ts` on the way out. The wrong
answer therefore arrives as a consequence of two good events. That is why this is
amended now and not when it fires.

**A generic `UNKNOWN` was rejected.** The system deterministically knows the arm was
disabled. Throwing that away at the one point where it is the entire content of the
answer is the opposite of the fix.

---

## 2 · PARTY OVERRIDE RELEASE CONDITION

```
PARTY_IOS_OVERRIDE_ACTIVATION = BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT
```

Unchanged by this round, and unchanged **by** this round's AMEND. The full six-step
sequence is binding and is written out in R15 §B1.7:

```
1 NEW3 contract            DONE (R15 §B1)
2 LCC implementation       PENDING
3 tests                    PENDING  — including updating LCC's deliberately-wrong pin
                                      at judgments/trust-state-cross-surface.test.ts:577
4 RCC consumption          PENDING  — no code change expected; searchTruth.ts is already right
5 independent verification PENDING  — a lane other than the implementer, at HEAD
6 override activation      BLOCKED  — a separate, separately authorised act
```

Completing steps 1-5 does not authorise step 6. Step 6 requires its own decision.

---

## 3 · TREATMENT MAPPING — CORRECTIONS APPENDED, NOT REWRITTEN

```
TREATMENT_MAPPING_CORRECTION_RECORDED = YES
PRIOR_NEW3_CLAIM_CORRECTED            = YES  (one claim, one half of it)
```

**No historical NEW3 artifact was rewritten.** `NEW3_CROSS_SURFACE_TREATMENT_ADJUDICATION_R14.md`
and the R14 ledger row are unedited. The corrections are appended here and in R15 §B4,
and the ledger carries a new row that names the corrected one.

### A. `search/saved.ts:292` serves the DERIVED banner — NEW3's record was half wrong

NEW3 recorded it as *"the raw stored value... strictly worse than the matter list"*.
Reproduced independently from committed source at HEAD:

```
saved.ts:31   import { ... hybridSearch ... } from './retrieve.ts'
saved.ts:238  results = await hybridSearch(...)
saved.ts:292  overruledStatus: r.overruledStatus        <- a SearchResult key
retrieve.ts:2420  overruledStatus: policy.bannerStatus  <- set before saved.ts sees it
```

**Line number exact. Missing `precedentialEffect` real. Layer wrong.** The saved feed is
not worse than the matter list on the banner axis — only on the finer field. What
survives unchanged: no `precedentialEffect`, no `overruledStatusStored`, therefore no
reconstruction path; unconsumed; `savedSearchFeed` is `DISABLED_NOT_READY` with OD-12
open; **must not ship without deriving.**

### B. A fifth stored surface exists in `citation_checks`, and is not user-reachable

`citations/check.ts:123` serves `r.overruled_status ?? r.overruled_status_shown` — the
joined stored column — beside `overruledStatusShown`. Reachability verified at HEAD:
`client.ts:904` is the only caller; `UnverifiedCitationScreen.tsx` and
`VerificationSheet.tsx` are the only consumers; grepping both for `overruled` returns
**one prose comment and zero renders**.

### C. `matters/authorities` remains the deliberate stored-layer case

Unchanged, and still covered by CCR-NEW3-XS-01's DEFER and by RCC's compensation at
`MatterScreen.tsx:521-522`, which is **contract-load-bearing and must not be deleted**.
RCC confirmed at `e52e61eb` that it left those two lines untouched with the explanation
intact.

### D. Does any of it change CCR-NEW3-XS-01, R14, the wire, or the RCC instruction?

```
CCR_NEW3_XS_01_DECISION  DEFER      UNCHANGED
R14                      unedited; superseded only by R15's named sections
WIRE_PROTOCOL            1          UNCHANGED
RCC_INSTRUCTION          UNCHANGED
```

Tested against all four exit conditions the DEFER named — banner-upgrade class (still
zero rows), a second `MatterAuthority` renderer (still none), the saved feed acquiring a
consumer or capability row (neither), RCC proposing to remove the override (it did not).
**None fires.** Correction A makes the saved feed *safer* than recorded, not less safe.

### E. THE NEW FINDING — a false LAW MOVED alert, latent, and NOT a contract change

`services/api/src/citations/recheck.ts:83` compares
`cc.overruled_status_shown` — **the derived banner**, on the reader, search and
counterargument surfaces — against `j.overruled_status`, **the stored column**. For an
`evidence_defect` judgment the two legitimately differ, the row is selected as
"diverged", and `applyOverruledChange` fires. **That is a LAW MOVED alert for a
movement our own precedential-effect policy already decided did not happen** — on the
one colour the product reserves for exactly that meaning.

Measured against the live database this session, read-only:

```
citation_checks for f83d0700 (1975 INSC 212, stored set_aside, derived none)
  shown 'none'       shown_to_user=true  document_id null  surface judgment_detail   4
  shown 'set_aside'  shown_to_user=true  document_id null  surface judgment_detail   4
active-matter annotations on that judgment                                            0

ALL shown rows corpus-wide where shown != stored                                     19
  across 5 judgments, every one shown 'none' / stored 'set_aside':
    2010 INSC 843 12 · 1975 INSC 212 4 · 2012 INSC 547 1 · 2017 INSC 1009 1 · 2011 INSC 114 1
  LAYER CONFLATION  (the evidence_defect judgment)                                    4
  GENUINE STALENESS (the recheck's correct job)                                      15

rows the recheck predicate SELECTS today, its full WHERE clause run verbatim           0
```

**Unreachable today by population, not by construction.** The gate is
`shown_to_user = true AND (an active-matter annotation OR an exported draft)`; the
judgment sits in zero active matters and every row has `document_id` null. The moment
any advocate saves any of those five to an active matter, four fire correctly and one
fires falsely.

```
CONTRACT_CHANGE_REQUIRED = NO
```

Server-internal, no wire field, no client. **Routed to LCC as an engineering defect,
P1-latent.** The fix is to compare like-for-like layers.

---

## 4 · SOURCE RETENTION vs SOURCE LINK

```
DOES_CURRENT_R14_ALREADY_ALLOW_TRUTHFUL_UI = YES
USER_HARM_IF_UNCHANGED                     = NONE
SOURCE_RETENTION_CONTRACT_DECISION         = NO_CHANGE (wire) + AMEND (record)
FIELD_ADDED                                = NONE
```

`corpus/source-artifact-state.ts` computes `sourceArtifactHeld`, `textState`,
`fullTextEvidenceAvailable` and `generationEvidenceAvailable`. Verified at HEAD: **its
only importers are its own test and LCC's new cross-surface test, and no route emits any
of the four fields.**

Trust state 6 was recorded as *representable: YES* on the evidence of
`judgment.source_evidence` — **which is a capability name, not a wire field.**

**No field is added, because no current v1 surface needs the distinction to be
truthful.** `SourceTrustBlock.tsx` renders `Source · <court>` and `Open the court's
copy` — link claims only. The banned claim ("verified from the retained official PDF",
false for 99.92% of the corpus) never appears and cannot, because no retention claim
exists anywhere on the surface. The product is truthful, and the mechanism is weaker
than the contract implied: **the banned claim is prevented by never making the opposite
claim.** That is now written down instead of assumed.

State 6 is corrected to `REPRESENTABLE = NO (PROTECTED_BY_PROHIBITION)`, with the
consequence stated: **any future surface asserting we hold the original document needs a
contract amendment first.** Adding a field because the backend has one internally is
exactly the move this declines.

---

## 5 · UI SURFACE AUDIT — WHAT THE AUDIT IS, AND WHAT IT IS NOT

```
AUDIT_STATUS = EVIDENCE, NOT PRODUCT AUTHORITY
```

**The audit is not a committed artifact.** Grepped repo-wide at HEAD for its identifiers
and its counts: **zero files.** It reached this round as prose. Its P0/P1 labels are
therefore **candidate classifications**, and every one below is independently
adjudicated against committed source.

Precedence applied, in order:

```
founder instruction  >  R14/R15 + governance + capability registry  >
verified implementation  >  audit finding  >  older design intent
```

### 5.1 The counts, checked

```
audit         verified at HEAD                                       verdict
29 mobile     31 route files under apps/mobile/app, minus
              index.tsx (a redirect) and s/[slug].tsx (the
              inventory shell router) = 29 real screens             CONSISTENT
2 desktop     THREE workspace files exist: ResearchWorkspace,
              MatterWorkspace, DraftWorkspace                        UNDERCOUNTED BY 1
              — immaterial: PD-15 was reversed 12 Aug 2026 and all
                three are frozen, inert below 900px, not extended
7 modals      6 files render <Sheet>                                 OVERCOUNTED BY 1
              (CauseList, MatterPicker, ReadingSheet,
               VerificationSheet, AddEventSheet, FiltersSheet)
42 variants   not independently recomputed                           NOT VERIFIED
```

**The counts are approximately right and were not relied on.** Every disposition below
rests on a file and a line, not on a count.

---

## 6 · THE SEVEN AUDIT P0 CANDIDATES — ADJUDICATED

Two vocabularies are recorded for each: the classification, and the gate.

```
UI_AUDIT_P0_VERIFIED = 7 of 7 examined
  real, and P0                                   2   (P1, P3)
  real, but not P0 as framed                     3   (P2, P4, P6)
  real, and the remedy is a registry correction  1   (P7)
  not a gap                                      1   (P5, in the half the audit named)
```

### P1 · Auth guard, recovery, and deep-link continuation — **REAL, P0**

```
CLASSIFICATION      CURRENT_V1_IMPLEMENTATION_REQUIRED_BUT_NO_CONTRACT_CHANGE
GATE                REQUIRED_BEFORE_GATE_C
FOUNDER_DESIGN      NO — the screens exist; the guard and the return destination do not
OWNER               RCC
```

Verified at HEAD:

- `app/index.tsx` redirects unconditionally to `/today`, with a comment that is now
  stale — *"there is no auth state to branch on yet"* — while `useSession` has carried
  `signed_out | identity_only | signed_in` since S5.
- **No global auth boundary exists.** Only `TodayScreen.tsx:186` and
  `MattersScreen.tsx:80` offer a "Sign in" action when signed out. Every other route —
  judgment, matter, search, acts, settings, profile, briefing, adjournment,
  client-update, precedent, subscription — has no signed-out handling and will issue
  API calls that 401.
- `app/auth/verify.tsx` always `router.replace('/today')` on success. **An advocate who
  followed a link to a judgment, was bounced to sign in, and verified, lands on Today.**
  The intended destination is discarded.

This is P0 because Gate C is a remote alpha: real deep links, real expired sessions,
real 401s, on someone else's phone.

### P2 · Matter edit / status / archive — **REAL, NOT P0**

```
CLASSIFICATION      FOUNDER_DESIGN_REQUIRED
GATE                REQUIRED_CURRENT_V1_BUT_CAN_LAND_AFTER_GATE_C
OWNER               founder design, then RCC
DESIGN_ID           D-2
```

`PATCH /matters/:id` accepts `caseTitle`, `cnrNumber`, `court`, `caseType`, `parties`,
`clientName`, `ourSide`, `nextHearingDate` and `status ∈ {active, disposed, archived}`.
The client's `updateMatter` exists at `client.ts:586` and is called **once**, at
`state/practice.ts:126`, with `nextHearingDate` only.

**So there is no way to correct a typed case title and no way to dispose or archive a
matter.** `matter.workspace` is `ENABLED_V1` and is described in `CLAUDE.md` as the
retention moat.

Not P0: an alpha cohort of a few advocates can run for weeks without archive, and
nothing false is stated by its absence. It needs design — what is editable, what
confirmation disposal takes, where archived matters live — and design is not RCC's to
invent.

### P3 · Adjournment date and purpose — **REAL, P0, AND MISFRAMED BY THE AUDIT**

```
CLASSIFICATION      IMPLEMENTATION_BUG_ONLY
GATE                REQUIRED_BEFORE_GATE_C
FOUNDER_DESIGN      NO
OWNER               RCC
```

**The screen exists and the date works.** `AdjournmentScreen.tsx` offers dates and
`save()` calls `setNextHearingDate(matterId, selected)`.

**The purpose is a false affordance.** `PURPOSES = ['Same purpose','Arguments','Evidence','Orders']`
is rendered as a selectable row set, the selection is held in state, and `save()`
**never sends it anywhere**. An advocate selects "Evidence", sees the ink stamp and
"The next hearing date is saved on this matter", and has recorded nothing.

That is the same class of harm as an unconfirmed OCR date: a control that appears to
record a fact about a hearing and does not. It is a bug, not a missing design, and
asking the founder to design a screen that already exists would be the wrong request.

**NEW3's specification for the fix**, so RCC needs no design decision: persist it
through the endpoint that already exists —
`POST /matters/:id/events { eventDate: <selected>, eventType: 'hearing', orderText: 'Adjourned to <date> for <purpose>' }`,
queued through `outbox.ts` like every other write on this screen, which preserves the
deliberate no-await behaviour. `orderText` and not `notes`: a purpose given in open
court is the court record, and the court record is the half that travels with a share.
**If RCC judges that write out of scope, the honest alternative is to remove the purpose
row entirely.** Either is correct. Leaving it is not.

### P4 · Data and Privacy centre — **SPLIT FOUR WAYS; ONE REAL GAP**

| sub-item | verified state | classification | gate |
|---|---|---|---|
| account deletion | **BUILT AND REACHABLE.** `DeleteAccountScreen.tsx`, from Settings, `POST /me/data-requests {kind:'erasure'}` | **NOT_REQUIRED (already exists)** | hardening at Gate D, as already scheduled |
| data export / correction | **REAL GAP.** Server accepts `kind ∈ {export, correction, erasure}`; the client sends only `erasure`; `listDataRequests` at `client.ts:490` has **no screen** | FOUNDER_DESIGN_REQUIRED (small) | SPRINT4_REQUIRED |
| permanent privacy / legal access | **REAL GAP.** Settings has Alerts, Coverage, Training data, Sign out, Delete account — **no privacy policy or terms link** | DESIGN_QUALITY_ONLY + store readiness | SPRINT4_REQUIRED |
| bulk corpus export | not a v1 product endpoint | **NOT_REQUIRED** | — |

The audit treated these as one P0 screen. They have four different owners and three
different gates, and the largest of them is already built.

### P5 · Corpus freshness / provenance — **HALF NOT A GAP, HALF REAL**

| half | verified state | classification |
|---|---|---|
| provenance | **NOT A GAP.** `SourceTrustBlock.tsx` renders it on the judgment reader; `/coverage` is reachable from Settings and consumes `GET /corpus/coverage` | NOT_REQUIRED |
| freshness | **REAL, SMALL.** `GET /corpus/freshness` and `GET /corpus/freshness/object` are mounted and **consumed by nothing in `apps/mobile`**; `CoverageScreen.tsx` calls `corpusCoverage()` only | IMPLEMENTATION_BUG_ONLY → but see below |

```
GATE   P1_NOT_P0 · REQUIRED_CURRENT_V1_BUT_CAN_LAND_AFTER_GATE_C
```

**And a constraint that is not optional if the freshness half is ever surfaced:** the
registry records *two* lag numbers — naive `lagDays 1` and legal-currency `lagDays 29` —
with the instruction **"quote both or neither"**. A freshness line showing "1 day
behind" alone would be the most misleading number in the product. That is why this is
not a free implementation task and carries a design note (D-5).

### P6 · Bare Acts discovery — **REAL, NOT P0, AND SMALLER THAN THE AUDIT SAID**

```
CLASSIFICATION      IMPLEMENTATION_BUG_ONLY  (built but unreachable)
GATE                REQUIRED_CURRENT_V1_BUT_CAN_LAND_AFTER_GATE_C
FOUNDER_DESIGN      NO, if the entry point goes where NEW3 specifies below
OWNER               RCC
```

`BareActsScreen.tsx` and `ActReaderScreen.tsx` are built, `app/acts/index.tsx` and
`app/acts/[id].tsx` are mounted, `statute.lookup` is `ENABLED_V1`, and
`GET /statutes` / `GET /statutes/sections` are live.

**Nothing in the app navigates to `/acts`.** Grepped repo-wide: the only push to
`/acts/[id]` is from `acts/index.tsx` itself. The only other path is `realRoutes.ts`
mapping the inventory slug `bare-acts-index`, reachable only through `/s/<slug>`, which
is reachable only from a screen shell or `+not-found`. **A shipped `ENABLED_V1`
capability with no entry point.**

**NEW3's specification, so this needs no founder design:** add the entry from Settings
and from the Search empty state. **Not a fifth tab** — `DESIGN_SYSTEM.md` fixes the bar
at four, and changing that is a design decision, not a routing one.

### P7 · Statute-linked judgments — **REAL, AND THE REMEDY IS A REGISTRY CORRECTION**

```
CLASSIFICATION      CONTRACT/REGISTRY CORRECTION REQUIRED (this round) + POST_V1 (the feature)
GATE                registry correction: NOW · feature: POST_V1
FOUNDER_DESIGN      NO
OWNER               NEW3 (done in this round), then nobody until post-v1
```

`V1_CAPABILITY_REGISTRY_R14.json` carries `statute.linked_judgments` as **`ENABLED_V1`
on ios and android**. Verified at HEAD:

```
DATA     703,768 of 905,156 references linked to a held Act — real, measured
ROUTE    NONE. app.ts mounts /statutes and /statutes/sections and nothing else.
CLIENT   NONE. The only occurrence in apps/mobile/src is the capability-name union type.
```

**A capability was ENABLED_V1 on the strength of a data artifact, with no route serving
it and no surface rendering it.** The registry's own assertion —
*"noCapabilityEnabledMerelyBecauseClientCodeExists"* — has an inverse it never stated,
and this row is the case that proves it needs one.

```
ENABLED_WITHOUT_EVIDENCE  = 1   (found this round)
                          → 0   (corrected in V1_CAPABILITY_REGISTRY_R15.json)
UNSUPPORTED_CLAIMS        = 0   — no claim in V1_CLAIMS_REGISTER_R14.md rests on this row
```

Corrected to `POST_V1` on every platform, with the reason recorded and the new inverse
assertion added. **Not designed as a v1 screen**, because the underlying link carries a
measured precision defect: 1,723 links whose statute was enacted *after* the judgment
citing it, 1,117 of them pre-1974 CrPC references pinned to the 1973 Code. A candidate
correspondence is not evidence, and a v1 surface would present it as one.

---

## 7 · CAPABILITY LEAKS — VERIFIED

```
CAPABILITY_LEAKS_CONFIRMED = 1 of 4 examined
```

The gating mechanism is `CapabilityBoundary` (`components/CapabilityBoundary.tsx`),
whose docstring states its purpose exactly: *"Keeps a held route absent even when a
stale deep link still names it."* At HEAD it wraps **four** routes:
`(tabs)/drafts.tsx`, `briefing/[id].tsx`, `counter-arguments.tsx`, `document/[id].tsx`.

### L1 · `/matter-sharing/[id]` — **MUST_GATE_NOW. The one real leak.**

`matterSharing` is `POST_V1` in `V1_SURFACE`. The **button** is correctly gated —
`MatterScreen.tsx:424-426` renders "Who can see this matter" only when `sharingEnabled`.
The **route** is not: `app/matter-sharing/[id].tsx` mounts `MatterSharingScreen`
unconditionally. A stale deep link, a saved link, or a shared URL reaches a POST_V1
surface, and its API effects run.

```
DECISION   MUST_GATE_NOW
FIX        wrap in <CapabilityBoundary surface="matterSharing">, exactly as
           counter-arguments.tsx does. One import, two lines.
OWNER      RCC
GATE       REQUIRED_BEFORE_GATE_C
```

### L2 · Today alert content while monitoring is disabled — **NOT_A_DEFECT**

**The audit conflated two different systems.** `TodayScreen.tsx` renders **citator
alerts** — `citations/fanout.ts`, driven by corpus treatment changes, PD-5/PD-6, gated
per-trigger by `users.alert_*` columns. The disabled `monitoring` surface is
`court.ecourts_live`: eCourts court-date observation, `monitoring.user_product`, of
which **zero observations exist**.

No capability in either registry disables citator alerts. Rendering them is correct.

### L3 · Alert Settings reachable while monitoring is disabled — **NOT_A_DEFECT**

Same conflation. `/alert-settings` is reached from Settings → Alerts, which is intended.
And the screen is already the honest version of exactly the concern the audit raised:
`settings.unavailable` is read from the server on every load, and a trigger with no
producer renders as **NOT YET WORKING with no switch** — because *"a switch in the 'off'
position implies flipping it would turn the alert on, and that is exactly the false
promise this key exists to remove."* Triggers 3 and 4 (awaiting OCR and the
cause-list-to-matter matcher) are covered by that mechanism today.

**Recorded per the addendum: monitoring is not resurrected by this round.**
`monitoring.user_product` stays `DISABLED_NOT_READY`; no polling frequency, SLA or price
may appear anywhere; no monitoring screen is designed.

### L4 · Stale draft recents navigating to gated functionality — **NOT A LEAK, A DEAD OFFER**

Verified at HEAD. `CommandPalette.tsx` gates the "Open drafts" **action** on
`draftingEnabled` (`:96`), but **does not gate recent rows**: a persisted
`kind: 'draft'` recent pushes to `/document/[id]` (`:141-142`) with no check.

**The boundary holds.** `document/[id].tsx` is wrapped in
`<CapabilityBoundary surface="drafting">`, so the tap redirects to `/today`. Nothing
gated is reached.

**But the palette advertises a destination the app then silently refuses**, and the
palette is phone-reachable (`TodayScreen.tsx:64`; the Cmd/Ctrl+K listener is web-only,
the trigger is not). A draft recent can only exist as a stale persisted entry from a
build where drafting was open — which is precisely what the audit said.

```
DECISION   NOT_A_DEFECT as a capability leak · IMPLEMENTATION_BUG_ONLY as an offer
FIX        filter recent rows by the same surface gate as the action. One predicate.
OWNER      RCC · P1
```

### L5 · Found by NEW3, not in the audit — `/directory` and `/gallery` ship in the binary

`app/directory.tsx` (the screen inventory) and `app/gallery.tsx` carry **no `__DEV__`
guard**, and `+not-found.tsx:21` offers *"Open the screen inventory"* as a recovery
action. A store build therefore contains a browsable list of every designed and
undesigned screen, reachable from any 404.

```
DECISION   MUST_GATE_NOW for a store build · not a capability leak (nothing gated is behind it)
CLASSIFICATION  IMPLEMENTATION_BUG_ONLY
GATE       SPRINT4_REQUIRED (store readiness), not Gate C
OWNER      RCC
```

---

## 8 · IMPLEMENTATION DEFECTS THAT NEED NO FOUNDER DESIGN

```
RCC_IMPLEMENTATION_ONLY_COUNT = 7
```

| # | defect | verified at HEAD | class |
|---|---|---|---|
| I1 | Cause List **"Open the briefing"** is dead | `CauseListScreen.tsx:168-171` pushes `/matter/[id]` with `briefing: '1'`; `app/matter/[id].tsx` reads **only** `id`; `MatterScreen.tsx` has no `briefing` param anywhere. The param is dropped. *And* `briefing` is `DISABLED_NOT_READY`, so the destination is gated even if it worked. | RCC_CAN_FIX_WITHOUT_DESIGN — remove the link while `briefing` is held; restore it with the param when the surface opens |
| I2 | Cause List **"Heard — order reserved"** records nothing | `CauseListScreen.tsx:153-156` pushes `/matter/[id]`, identical to the "Open the matter" link beneath it. The sheet offers two outcome buttons and only "Adjourned" records an outcome. | **FOUNDER_DESIGN_FIRST** — what "heard, order reserved" should record is a product question. `POST /matters/:id/events` could carry it, but which event type and what the advocate sees afterwards is a design call. D-3. |
| I3 | Adjournment **purpose** not persisted | `AdjournmentScreen.tsx:89` holds it; `save()` sends only the date. | RCC_CAN_FIX_WITHOUT_DESIGN — NEW3's mapping is specified in §6 P3 |
| I4 | Act reader **falsely claims tappable sections** | `ActReaderScreen.tsx:164` renders *"Section numbers are anchors — tap one to link it."* Section rows are plain `<View>` (`:119`); the only `Pressable` on the screen is Back (`:91`). | RCC_CAN_FIX_WITHOUT_DESIGN — delete the sentence. Building the anchor is a feature, not a bug fix. |
| I5 | Empty **MatterPicker** is a dead end | `MatterPicker.tsx` renders *"No matters yet."* with **no action**. `/matter/new` exists. An advocate who taps "Save to matter" from a judgment with no matters cannot proceed. | RCC_CAN_FIX_WITHOUT_DESIGN — add "Create a matter" pointing at the existing route |
| I6 | Bare Acts has **no entry point** | §6 P6 | RCC_CAN_FIX_WITHOUT_DESIGN — Settings + Search empty state, **not** a fifth tab |
| I7 | Command palette offers **gated draft recents** | §7 L4 | RCC_CAN_FIX_WITHOUT_DESIGN |

**"Duplicate / raw route chrome"** was examined and **not confirmed as a defect**: 24 of
31 route files set `Stack.Screen options`, which is the router's title bar, and the
screens beneath draw their own content headers by design. No duplicated chrome was found
that a line could be named for. Recorded as **NOT_A_REAL_GAP** rather than left implied.

```
NOT_REAL_GAP_COUNT = 5
  L2 Today alert content · L3 Alert Settings · L4 as a capability leak ·
  P5 provenance half · duplicate route chrome
DEFERRED_COUNT = 4
  P2 matter edit/archive (post-Gate-C) · P4 export/correction (Sprint 4) ·
  P4 privacy links (Sprint 4) · P5 freshness surface (post-Gate-C)
FOUNDER_DESIGN_REQUIRED_COUNT = 5   see the design pack
```

---

## 9 · APP COMPLETENESS — THE CONFLICT RESOLVED

RCC recorded `FULL_APPLICATION_BUILT = YES` for its required local-only scope. The audit
recorded three `NO`s. **Both are defensible about different questions, and the label
that caused the conflict is retired.**

```
FULL_APPLICATION_BUILT = RETIRED — it conflates six different questions
```

Replaced with six states, each independently checkable:

```
LOCAL_CORE_LOOP_COMPLETE            = YES
CURRENT_V1_REQUIRED_SURFACE_COMPLETE = NO
CURRENT_V1_FUNCTIONALLY_COMPLETE    = NO
CURRENT_V1_DESIGN_COMPLETE          = NO
CURRENT_CAPABILITY_GATING_COMPLETE  = NO
GATE_C_REMOTE_ALPHA_COMPLETE        = NO
```

| state | value | the evidence that decides it |
|---|---|---|
| `LOCAL_CORE_LOOP_COMPLETE` | **YES** | search → reader → save to matter → matter workspace → adjournment date runs end to end. Exercised across 10 synthetic matters against the real local API, and confirmed on a physical Galaxy S24 at `e52e61eb` including all three R14 A6 fields driving behaviour on the saved-authority route. **RCC's YES was about this and it stands.** |
| `CURRENT_V1_REQUIRED_SURFACE_COMPLETE` | **NO** | Two `ENABLED_V1` capabilities have no reachable surface: `statute.lookup` (Bare Acts, no entry point — P6) and the freshness half of `corpus.freshness_provenance` (P5). One `ENABLED_V1` row had no route at all and is corrected to POST_V1 (P7). |
| `CURRENT_V1_FUNCTIONALLY_COMPLETE` | **NO** | Named, not asserted: no auth guard and no deep-link continuation (P1); no matter edit, disposal or archive (P2); adjournment purpose not persisted (I3); "Open the briefing" and "Heard" dead (I1, I2); empty MatterPicker a dead end (I5); no data export or correction (P4). |
| `CURRENT_V1_DESIGN_COMPLETE` | **NO** | 5 items in the design pack. Independently: the screen inventory itself carries 1 row of 119 marked `designed: false`. |
| `CURRENT_CAPABILITY_GATING_COMPLETE` | **NO** | `CapabilityBoundary` wraps 4 routes; `/matter-sharing/[id]` is POST_V1 and unwrapped (L1); command-palette recents bypass the surface gate (L4); `/directory` and `/gallery` ship unguarded (L5). |
| `GATE_C_REMOTE_ALPHA_COMPLETE` | **NO** | Blocked on P1, P3 and L1 at minimum. RCC's device evidence is explicitly `PHYSICAL_ANDROID_LOCAL_ADB_EVIDENCE`, **not Gate C** — RCC said so itself in bus 1653. |

**No single boolean may be reintroduced.** "The tested flow works" and "the product is
complete" are different claims, and one of them was being read as the other.

---

## 10 · WHAT THIS ROUND DID NOT DO

- **Did not design any screen.** The design pack states jobs, information and truth
  states, never layout.
- **Did not write client or backend code.** No file outside `docs/product/**` and
  `.agents/bus/**` was modified.
- **Did not activate the party override**, and did not create a condition that
  authorises it.
- **Did not reopen** OD-12, OD-13, OD-14, PD-15, the §3.1 treatment-provenance DEFER, or
  CCR-NEW3-XS-01.
- **Did not resurrect monitoring** on the strength of a reachable screen.
- **Did not promote the audit's seven P0 items into Sprint 3.** Two are P0, three are
  real but later, one is a registry correction, and one is largely already built.
- **Did not recompute the audit's 42 state variants.** Stated rather than implied.

### Limits

- The layer map and every capability state were **read from committed source**, not
  observed by executing the API this session. The database halves in §3 **were**
  executed, read-only.
- The UI audit's own artifact does not exist in the repository. Its findings were
  re-derived from source; if it contained findings not restated to this round, they are
  not adjudicated here.
- `CURRENT_V1_FUNCTIONALLY_COMPLETE = NO` is supported by named defects. It is **not** a
  claim that the named list is exhaustive — no exhaustive surface-by-surface functional
  sweep was run this round.
