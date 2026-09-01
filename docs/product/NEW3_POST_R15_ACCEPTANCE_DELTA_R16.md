# NEW3 post-R15 acceptance delta — R16

**Lane:** NEW3

**Evidence freeze:** 1 September 2026

**HEAD at evidence freeze:** `8f6b7e41fddff33ba6b3a126fb332950f85d7b24`

**Depends on:** NEW3 R15 `de373832`, LCC R18 `90547174`, NEW2 R20
`c15b2aac`, RCC R16 `8f6b7e4`, the R15 contract and capability registry,
`NEW3_FOUNDER_DESIGN_PACK_R15.md`, and RCC's committed
`FPASS_DESIGN_TRUTH_R16.md`.

This is an append-only acceptance delta. It does not rewrite R15, reopen Gate B,
release a capability, activate a platform override, or alter an API contract. Where
older and newer sources disagree, both positions are recorded before the current
disposition is stated.

## 1. Integration and evidence boundary

Mechanical ancestry checks at the evidence freeze returned:

| Round | Commit | In HEAD |
|---|---|---:|
| NEW3 R15 | `de373832` | YES |
| LCC R18 | `90547174` | YES |
| NEW2 R20 | `c15b2aac` | YES |
| RCC R16 | `8f6b7e41fddff33ba6b3a126fb332950f85d7b24` | YES |

`WORKTREE = DIRTY_OTHER_LANES_PRESERVED`. NEW3's pre-existing
`docs/product/**` files were clean. This delta relies only on committed source and
does not accept uncommitted work from another lane.

Focused independent verification at this HEAD passed:

- Mobile: `routeGates`, `searchTruth`, adjournment persistence, and
  `AuthBoundary` — 120/120 tests.
- API: `search/outcome`, `party-search-platform`, and cross-surface judgment trust
  state — exit 0, no failures.

## 2. Terminology correction

RCC's sentence “Both Gate-C P0s landed” describes two current-v1 P0 fixes; it is
not formal Gate C evidence.

`AUTH_GUARD_P0 = CURRENT_V1_P0`

`ADJOURNMENT_PURPOSE_P0 = CURRENT_V1_P0`

`CURRENT_V1_P0_TERMINOLOGY_CORRECTED = YES`

Formal Gate C remains the remote integrated-alpha gate in
`LAWMIND_SPRINT_PROMPTS_V2.md`: a physical phone over mobile data against the
remote API, the desktop shell against that same API, outside-network database and
security evidence, release/rollback and remote-restore evidence, and the named
reliability thresholds. None of that evidence was produced by RCC R16. Gate B is
unchanged.

## 3. R15 consumption and the party override gate

### `capability_disabled`

| Question | Result | Committed evidence |
|---|---|---|
| Backend emits the reason | YES | `services/api/src/search/outcome.ts` derives and appends `capability_disabled`; `services/api/src/search/route.ts` calls that derivation. |
| Client type can receive it | YES — `STRING_ARRAY_VALUE_SUPPORTED` | `retrievalOutcome.reasons` is `string[]`; no client enum blocks a new reason. |
| Client renders it | YES | `apps/mobile/src/screens/search/searchTruth.ts` maps the reason to the honest `party_disabled` state. |
| Unknown-reason fallback is safe | YES | Unknown values are ignored; they are not promoted to success or a different capability. |

`RCC_IMPLEMENTATION_GAP = NO`.

### Party-search iOS release sequence

| Gate step | State |
|---|---|
| CONTRACT | DONE — NEW3 R15 |
| LCC_IMPLEMENTATION | DONE — `90547174` |
| LCC_TESTS | DONE |
| RCC_CONSUMPTION | DONE — `8f6b7e4` |
| INDEPENDENT_VERIFICATION | DONE — focused NEW3 inspection and tests above |

The technical sequence is proven, but activation was deliberately reserved as a
separate explicit release act. `PLATFORM_CAPABILITY_OVERRIDES` remains `{}`.

`PARTY_IOS_OVERRIDE_ACTIVATION = BLOCKED_PENDING_SEPARATE_EXPLICIT_OVERRIDE_ACTIVATION`

This delta does not activate the override, weaken Android/web, or turn party
search into person dossiers.

## 4. `treatmentAttribution` contradiction

R15 said the field was on the wire. RCC R16 said it was absent from current
contract types and therefore unavailable to the reader. Both statements describe
different layers.

| Layer | FIELD_EXISTS | FIELD_NAME / FIELD_TYPE | OPTIONALITY | Emission or consumer |
|---|---:|---|---|---|
| Canonical legal data | YES | `treatment_provenance`: constrained text values including court reasoning, reporter annotation, modality defect | Nullable; null means unclassified | `packages/db/drizzle/0082_treatment_provenance_column.sql` |
| API derivation | YES | `treatmentAttribution`: `COURT \| REPORTER \| DEFECTIVE \| UNKNOWN` | Derived for every supplied edge collection | `services/api/src/judgments/precedential-effect.ts` |
| Judgment detail route | YES | `treatmentAttribution` | Emitted value | `services/api/src/judgments/route.ts` |
| Treatment route | YES | `treatmentAttribution` per treatment row | Emitted value | `services/api/src/judgments/treatment.ts` |
| Counter-authority route | YES | `treatmentAttribution` | Emitted on returned/excluded authorities | `services/api/src/arguments/counter.ts` |
| Document citation route | YES | `treatmentAttribution` | Emitted on citation records | `services/api/src/documents/route.ts` |
| Search retrieval internals | YES | `treatmentAttribution` | Computed | `services/api/src/search/retrieve.ts` |
| Search route result | NO | Field is dropped from structured and hybrid result projection | Absent | `services/api/src/search/route.ts` |
| R15 reader contract | YES | Frozen reader key `treatmentAttribution` | Existing route-specific contract | `RCC_V1_API_CONTRACT_R12.md` plus the R15 amendment |
| RCC client types | NO | No property on judgment, treatment, counter-authority, or document response types | Absent | Current `apps/mobile/src/**` types |
| RCC reader consumer | NO | No consumer | Absent | Zero client occurrences at the evidence freeze |

`TREATMENT_ATTRIBUTION_CLASSIFICATION = F. BOTH_PARTIALLY_RIGHT_DIFFERENT_LAYERS`

`TREATMENT_ATTRIBUTION_DECISION = API_EMITS_ON_FOUR_ROUTE_FAMILIES_BUT_RCC_TYPES_AND_CONSUMERS_ARE_MISSING; SEARCH_ROUTE_REMAINS_A_SEPARATE_DEFERRED_ASYMMETRY`

`CONTRACT_CHANGE_REQUIRED = NO` for the reader work: the existing frozen reader
contract and runtime route already carry the field. RCC owns optional type
alignment and consumption on judgment detail, treatments, counter-authorities,
and document citations. Only `COURT` may be written as a court holding;
`REPORTER` must be attributed to the reporter, and `DEFECTIVE`/`UNKNOWN` must not
be promoted. No new field may be invented.

`LCC_HANDOFF = NONE_FOR_CURRENT_READER_CONSUMPTION`. If a later decision requires
the field on search cards, LCC must first preserve it in the search route
projection; that is outside this reader acceptance delta.

## 5. “Safe to file” is not a good-law claim

`SAFE_TO_FILE_COPY = AUTHORIZED_EXACT_MEANING`.

The R12 contract authorizes the exact phrase on the user-opened citation
verification detail. Its narrow meaning is: the citation identity/existence and
reported citation were checked against the cited record, so that citation string
may be reproduced. It does **not** mean the authority remains precedentially
current, that a proposition is legally sound, that the whole document is
filing-ready, or that a court accepts the argument. Independent `LAW MOVED` and
coverage disclosures continue to govern treatment truth.

“Good law only” remains removed because `treatment.good_law_claim` is held. No RCC
copy-removal handoff is issued for the exact “Safe to file” phrase, and it must
not expand beyond the on-tap citation-level verification surface.

## 6. Founder design D-1 through D-5

The founder has now supplied designs, so none of these items may remain labelled
merely “waiting for founder design.” Unsafe or non-contracted copy within a design
is not accepted by the existence of the design.

| DESIGN_ID | DESIGN_REQUIREMENT | FOUNDER_DESIGN_NOW_EXISTS | CURRENT_IMPLEMENTATION | CURRENT_CAPABILITY_STATE | BACKEND_SUPPORT | CONTRACT_GAP | NEXT_DISPOSITION |
|---|---|---:|---|---|---|---|---|
| D-1 | Data export/correction request and request status | YES — fpass 19 | Erasure exists; export/correction request UI and list do not | Sprint 4 privacy work | FULL — create/list request routes, including `dueAt` and refusal reason | NO for truthful request/status UI | `SPRINT4_REQUIRED` |
| D-2 | Edit matter; dispose/archive matter | YES — fpass 17 | Only next-hearing-date editing | `matter.workspace = ENABLED_V1` on iOS/Android | FULL — PATCH supports contracted fields/status | NO if RCC uses `{active, disposed, archived}` | `RCC_IMPLEMENT_NOW` |
| D-3 | “Heard / order reserved” outcome | NO — a visual button exists in the large design, but no persistence, semantics, or after-action behavior is designed | Button routes to a matter and records no outcome | No released outcome capability | Matter events are not a contracted outcome model | YES for a new outcome capability | `NOT_REQUIRED_AFTER_R15` |
| D-4 | Permanent Terms and Privacy access | YES — fpass 19 | Onboarding acceptance exists; no permanent settings access | Sprint 4 legal/privacy work | FULL — current terms endpoint and accepted version fields exist | NO for approved document links; legal copy remains counsel-owned | `SPRINT4_REQUIRED` |
| D-5 | Corpus freshness/provenance UI | YES — fpass 20 | Coverage/provenance exists; freshness endpoint is unconsumed | `corpus.freshness_provenance = ENABLED_V1` on iOS/Android | FULL | NO, but the two-lag truth rule is mandatory | `RCC_IMPLEMENT_NOW` |

D-1 rejects invented device-only storage, backup, SMS, and made-up response-time
claims. It must render the actual returned due date and refusal reason. D-2 must
not add the design's uncontracted “On hold”, hard delete, or CNR re-sync. D-3's
dead one-tap button is to be removed from current-v1 UI; this delta does not
invent an outcome state. D-5 must show both source lag and LawMind lag, or neither;
the design's single-lag/source-outage copy is not accepted without evidence.

## 7. Fpass 16–30 product dispositions

These are product dispositions, not a repeated pixel audit.

| File / surface | Disposition | Remaining truth |
|---|---|---|
| 16 auth guard | `IMPLEMENTED_CURRENT` | Deep-link destination is held through auth and resumed. |
| 17 manage matter | `DESIGN_ONLY_CURRENT` | Build the normalized D-2 subset now. |
| 18 adjournment | `IMPLEMENTED_CURRENT` | Contracted purpose persistence landed; free text and removal remain post-v1. |
| 19 data/privacy | `SPRINT4` | D-1 and D-4, with unsafe claims stripped. |
| 20 corpus freshness | `PARTIAL_CURRENT` | Provenance exists; truthful two-lag UI remains. |
| 21 Bare Acts | `IMPLEMENTED_CURRENT` | Current statute entry points are present. |
| 22 statute-linked judgments | `GATED_PENDING_EVIDENCE` | Design exists; user-facing evidence does not. |
| 23 saved-authority states | `IMPLEMENTED_CURRENT` | Current matter-scoped saved states are represented. |
| 24 empty MatterPicker | `PARTIAL_CURRENT` | Matter creation works; pending save does not resume. |
| 25 edit profile | `IMPLEMENTED_CURRENT` | Contracted name/language editing exists; unsupported extras are excluded. |
| 26 search truth states | `IMPLEMENTED_CURRENT` | Capability-disabled and unknown-reason handling are current. |
| 27 judgment source/evidence | `PARTIAL_CURRENT` | Core trust facts render; `treatmentAttribution` consumption remains. |
| 28 desktop research | `DESIGN_ONLY_CURRENT` | Current-v1 web scope, still disabled and unbuilt. |
| 29 desktop matter | `DESIGN_ONLY_CURRENT` | Current-v1 web scope, still disabled and unbuilt. |
| 30 account/settings/training consent | `PARTIAL_CURRENT` | Account/training exist; D-4 permanent legal access remains Sprint 4. |

Contradiction recorded for 28–29: older `CLAUDE.md` / historical product-decision
wording describes phone-only v1, while Master Roadmap v7.1 and the later R15
registry explicitly place advocate web in current-v1 scope but
`DISABLED_NOT_READY`. Because this delta depends on and follows R15, the later
R15 state governs: these designs are not legacy or `NOT_REQUIRED`, and their
capabilities remain disabled until their named evidence exists.

## 8. MatterPicker resume decision

`AFTER_CREATE_FROM_MATTER_PICKER = A. CREATE_THEN_AUTO_SAVE_PENDING_AUTHORITY`

There is no contracted global “Save without a matter.” RCC acceptance criteria:

1. When and only when matter creation originates from `MatterPicker`, retain the
   pending save intent: judgment ID and citation-check ID for authority saves, or
   the exact passage/highlight identity and quote for annotation saves.
2. After one successful `POST /matters`, use the returned matter ID to perform the
   original add-authority or attach-annotation operation exactly once. Then open
   the new matter and show a truthful success confirmation.
3. Clear the pending intent only after the save succeeds or the user explicitly
   cancels it. A created matter plus failed save must be shown as that partial
   result with an explicit retry; it must never claim the authority was saved.
4. Duplicate submits, navigation re-entry, and retry must not create duplicate
   authority/annotation records.
5. Tests cover all current origins — judgment reader, reading passage, and search
   result — plus cancel, network failure, duplicate submit, and set-aside refusal.

## 9. Statute-linked judgments lifecycle

Founder design is necessary but does not prove safe user-facing links. The known
population includes 1,723 anachronistic relationships in the R15 evidence; NEW2
R20 did not remove the route/evidence gap.

`STATUTE_LINKED_IMPLEMENTATION_NEXT = LCC_ROUTE_THEN_RCC_IMPLEMENT_BEHIND_GATE`

`STATUTE_LINKED_REGISTRY_STATE = POST_V1_ON_IOS_ANDROID_WEB_UNCHANGED`

Lifecycle: `DISABLED → LCC scoped evidence-qualified route → RCC implementation
behind gate → route/surface and refusal tests → NEW3 acceptance → registry release`.

`RELEASE_EVIDENCE_REQUIRED = NAMED_ROUTE_CONTRACT_AND_TESTS; SCOPED_STATUTE_SUBSECTION_IDENTITY; ZERO_FORBIDDEN_ANACHRONISTIC_LINKS_IN_THE_ACCEPTED_DATASET; HONEST_EMPTY_STATE; ROUTE_AND_SURFACE_GATE_TESTS; NEW3_ACCEPTANCE`

## 10. Current-v1 classification corrections

| Surface | Current disposition |
|---|---|
| Data & Privacy | `SPRINT4_REQUIRED` |
| Profile editing | `ALREADY_IMPLEMENTED` for the contracted name/language surface |
| Corpus freshness | `CURRENT_V1_REQUIRED_NOW` |
| Matter management | `CURRENT_V1_REQUIRED_NOW` |

No historical UI-audit P0 label is revived.

## 11. Capability and route acceptance delta

Current committed route and navigation guards were inspected, and the mobile
route-gate suite passed. Matter sharing is capability-wrapped; directory and
gallery return not-found outside development; development inventory is not
offered in production; stale Draft recents are filtered while drafting is held;
Briefing, Drafts, and Counterarguments remain gated. Today/citation treatment
alerts are citator alerts, not eCourts monitoring. The unready monitoring product
is not exposed.

`INVALID_ENABLED_ROUTE_COUNT = 0`

`POST_V1_ROUTE_LEAKS = 0`

`INTERNAL_TOOLING_PRODUCTION_LEAKS = 0`

`MONITORING_LEAKS = 0`

`CITATOR_ALERT_REGRESSION = NO`

## 12. Completeness states

| State | Result | Reason |
|---|---:|---|
| `LOCAL_CORE_LOOP_COMPLETE` | YES | The R15/R16 named local device loop evidence remains valid. |
| `CURRENT_V1_REQUIRED_SURFACE_COMPLETE` | NO | Matter management, freshness, MatterPicker resume, attribution consumption, Sprint 4 legal/privacy, and current-v1 desktop work remain. |
| `CURRENT_V1_FUNCTIONALLY_COMPLETE` | NO | Required surfaces above are not functional end to end. |
| `CURRENT_V1_DESIGN_COMPLETE` | NO | The current manifest still has an undesigned `magic-link-sent` state, and current-v1 implementation dispositions remain unresolved in design. |
| `CURRENT_CAPABILITY_GATING_COMPLETE` | YES | For current committed routes and the R15 registry, disabled/post-v1 surfaces are gated with zero accepted leaks. This is not a capability release. |
| `GATE_C_REMOTE_ALPHA_COMPLETE` | NO | No remote integrated-alpha evidence was produced; Android regression was also not tested by RCC R16. |

## 13. Sole normalized RCC backlog

The following tables supersede scattered client to-do wording for the next RCC
implementation round. Priorities are within this handoff only.

### RCC_NOW

| ID | PRIORITY | SURFACE | CURRENT_STATE | EXPECTED_STATE | CONTRACT | BACKEND_SUPPORT | CAPABILITY_STATE | TEST_ACCEPTANCE | BLOCKER |
|---|---|---|---|---|---|---|---|---|---|
| R16-RCC-01 | P0 | Judgment treatment attribution | Field emitted but absent from client types/reader | Optional union typed and rendered with source-safe wording on judgment, treatment, counter-authority, and document citation surfaces | R12 + R15 amendment | FULL | Existing judgment/citator surfaces enabled | Each union value and missing value render without promoting reporter/unknown evidence | NONE |
| R16-RCC-02 | P0 | Matter management | Only next hearing date editable | Edit contracted fields; set `active`, `disposed`, or `archived`; no On hold/delete/CNR resync | Existing matter contract | FULL | `matter.workspace = ENABLED_V1` iOS/Android | PATCH success/error, status transitions, refresh, and no unsupported affordances | NONE |
| R16-RCC-03 | P0 | Corpus freshness | Endpoint unconsumed | Show source lag and LawMind lag together, or neither | Existing freshness contract | FULL | `corpus.freshness_provenance = ENABLED_V1` iOS/Android | Both-lag, unavailable, stale, and error states; ban unsupported outage claims | NONE |
| R16-RCC-04 | P0 | MatterPicker create/resume | Creates matter, silently loses pending save | Auto-save the exact pending authority/annotation after create | Existing matter-scoped authority/annotation contracts | FULL | Enabled current-v1 surfaces | All three origins, retry, cancel, duplicate, failure, set-aside refusal | NONE |
| R16-RCC-05 | P0 | Cause-list outcome action | “Heard / order reserved” records nothing | Remove the unsupported current-v1 action | No outcome contract | NOT CONTRACTED | No released capability | Route/screen test proves no dead outcome affordance | NONE |
| R16-RCC-06 | P1 | Desktop research | Founder design exists; web capability disabled/unbuilt | Implement current-v1 desktop research behind existing disabled web gates | Existing current-v1 web scope | Existing APIs, subject to normal integration | `DISABLED_NOT_READY` | Same-API, auth, route-gate, responsive, empty/error evidence; no release | Gate C/release evidence |
| R16-RCC-07 | P1 | Desktop matter | Founder design exists; web capability disabled/unbuilt | Implement current-v1 desktop matter behind existing disabled web gates | Existing current-v1 web scope | Existing matter APIs, subject to normal integration | `DISABLED_NOT_READY` | Same-API, auth, route-gate, matter-state, responsive, empty/error evidence; no release | Gate C/release evidence |

### RCC_AFTER_LCC

| ID | PRIORITY | SURFACE | CURRENT_STATE | EXPECTED_STATE | CONTRACT | BACKEND_SUPPORT | CAPABILITY_STATE | TEST_ACCEPTANCE | BLOCKER |
|---|---|---|---|---|---|---|---|---|---|
| R16-RCC-08 | P1 | Statute-linked judgments | Design only; no safe user route | Implement behind gate against LCC's scoped evidence-qualified route | Route contract required first | MISSING USER ROUTE | `POST_V1` all platforms | Honest empty/refusal, subsection scope, zero forbidden anachronisms, route/surface gate | LCC route + accepted evidence |

### RCC_SPRINT4

| ID | PRIORITY | SURFACE | CURRENT_STATE | EXPECTED_STATE | CONTRACT | BACKEND_SUPPORT | CAPABILITY_STATE | TEST_ACCEPTANCE | BLOCKER |
|---|---|---|---|---|---|---|---|---|---|
| R16-RCC-09 | P1 | Data export/correction/status | Erasure only | Create and list real requests; render returned due date/refusal; no invented SLA/SMS/export content | Existing data-request contract | FULL | Sprint 4 privacy | Request types, pending/completed/refused, error, actual dates, claim bans | Sprint 4 sequencing |
| R16-RCC-10 | P1 | Permanent Terms/Privacy access | Onboarding acceptance only | Settings access to current counsel-approved Terms and Privacy | Existing terms/profile contract | FULL | Sprint 4 legal/privacy | Version, unavailable/error, accessibility, accepted-state evidence | Counsel-approved documents/copy |

### DO_NOT_BUILD

| ID | PRIORITY | SURFACE | CURRENT_STATE | EXPECTED_STATE | CONTRACT | BACKEND_SUPPORT | CAPABILITY_STATE | TEST_ACCEPTANCE | BLOCKER |
|---|---|---|---|---|---|---|---|---|---|
| R16-RCC-X01 | HOLD | Global authority save | Matter-scoped contract | No “Save without a matter” | Explicitly matter-scoped | N/A | Not a capability | Absence test | Product/contract prohibition |
| R16-RCC-X02 | HOLD | Invented matter actions | Design includes On hold/delete/CNR resync | Exclude them | No current contract | N/A | Not released | Claim/route absence | Contract absent |
| R16-RCC-X03 | HOLD | SMS/OTP/phone merge | Design copy conflicts with email magic-link identity | Exclude it | No current contract | N/A | Not released | Claim absence | Contract absent |
| R16-RCC-X04 | HOLD | Unsupported privacy/freshness claims | Design contains device-only, backup, SLA, storage, and single-lag claims | Exclude them; render only returned evidence | Truth constraints above | N/A | Not released | Production-copy bans remain green | Evidence absent |
| R16-RCC-X05 | HOLD | eCourts monitoring product | No released monitoring producer/product | Keep unavailable; do not relabel citator alerts | R15 registry | N/A | `DISABLED_NOT_READY` | No monitoring route or claim leak | Capability evidence absent |
| R16-RCC-X06 | HOLD | Drafting/Briefing/Counterarguments | Routes and surfaces intentionally held | Keep gated until their individual release conditions pass | Existing held contracts | Backend existence is not release evidence | Disabled/held | Route/surface gates remain green | Individual capability evidence absent |

Counts: `RCC_NOW = 7`, `RCC_AFTER_LCC = 1`, `RCC_SPRINT4 = 2`,
`DO_NOT_BUILD = 6`.

## 14. Exact handoffs and terminal assertions

`RCC_HANDOFF = R16-RCC-01_THROUGH_R16-RCC-10; EXCLUDE_R16-RCC-X01_THROUGH_X06`

`LCC_HANDOFF = R16-RCC-08_ONLY: DEFINE_AND_IMPLEMENT_THE_SCOPED_EVIDENCE_QUALIFIED_STATUTE_LINKED_ROUTE_WITH_THE_NAMED_RELEASE_TESTS; NONE_FOR_CURRENT_READER_ATTRIBUTION`

`ENABLED_WITHOUT_EVIDENCE = 0`

`UNSUPPORTED_CLAIMS = 0` — thirteen unsupported founder-design claims remain
rejected and are not accepted for production.

`BLOCKERS = PARTY_IOS_SEPARATE_OVERRIDE_ACTIVATION; STATUTE_LINKED_LCC_ROUTE_AND_EVIDENCE; GATE_C_REMOTE_ALPHA_EVIDENCE; SPRINT4_SEQUENCING; COUNSEL_APPROVED_LEGAL_COPY`

This delta is the authoritative post-R15 NEW3 acceptance and the sole normalized
RCC client backlog until superseded by a later append-only NEW3 decision.

## 15. Exact decision record

```text
HEAD_START = 8f6b7e41fddff33ba6b3a126fb332950f85d7b24
RCC_R16_COMMIT = 8f6b7e41fddff33ba6b3a126fb332950f85d7b24
CURRENT_V1_P0_TERMINOLOGY_CORRECTED = YES
CAPABILITY_DISABLED_BACKEND = YES
CAPABILITY_DISABLED_CLIENT_TYPE = YES_STRING_ARRAY_VALUE_SUPPORTED
CAPABILITY_DISABLED_CLIENT_RENDER = YES
CAPABILITY_DISABLED_UNKNOWN_REASON_FALLBACK = YES
PARTY_IOS_OVERRIDE_ACTIVATION = BLOCKED_PENDING_SEPARATE_EXPLICIT_OVERRIDE_ACTIVATION
TREATMENT_ATTRIBUTION_CLASSIFICATION = F. BOTH_PARTIALLY_RIGHT_DIFFERENT_LAYERS
TREATMENT_ATTRIBUTION_DECISION = API_EMITS_ON_FOUR_ROUTE_FAMILIES_BUT_RCC_TYPES_AND_CONSUMERS_ARE_MISSING; SEARCH_ROUTE_REMAINS_A_SEPARATE_DEFERRED_ASYMMETRY
SAFE_TO_FILE_COPY = AUTHORIZED_EXACT_MEANING
D1 = SPRINT4_REQUIRED
D2 = RCC_IMPLEMENT_NOW
D3 = NOT_REQUIRED_AFTER_R15
D4 = SPRINT4_REQUIRED
D5 = RCC_IMPLEMENT_NOW
FPASS_16_30_DISPOSITION = 16 IMPLEMENTED_CURRENT; 17 DESIGN_ONLY_CURRENT; 18 IMPLEMENTED_CURRENT; 19 SPRINT4; 20 PARTIAL_CURRENT; 21 IMPLEMENTED_CURRENT; 22 GATED_PENDING_EVIDENCE; 23 IMPLEMENTED_CURRENT; 24 PARTIAL_CURRENT; 25 IMPLEMENTED_CURRENT; 26 IMPLEMENTED_CURRENT; 27 PARTIAL_CURRENT; 28 DESIGN_ONLY_CURRENT; 29 DESIGN_ONLY_CURRENT; 30 PARTIAL_CURRENT
MATTER_PICKER_RESUME_DECISION = A. CREATE_THEN_AUTO_SAVE_PENDING_AUTHORITY
STATUTE_LINKED_IMPLEMENTATION_NEXT = LCC_ROUTE_THEN_RCC_IMPLEMENT_BEHIND_GATE
STATUTE_LINKED_REGISTRY_STATE = POST_V1_ON_IOS_ANDROID_WEB_UNCHANGED
RCC_NOW_COUNT = 7
RCC_AFTER_LCC_COUNT = 1
RCC_SPRINT4_COUNT = 2
DO_NOT_BUILD_COUNT = 6
INVALID_ENABLED_ROUTE_COUNT = 0
POST_V1_ROUTE_LEAKS = 0
INTERNAL_TOOLING_PRODUCTION_LEAKS = 0
LOCAL_CORE_LOOP_COMPLETE = YES
CURRENT_V1_REQUIRED_SURFACE_COMPLETE = NO
CURRENT_V1_FUNCTIONALLY_COMPLETE = NO
CURRENT_V1_DESIGN_COMPLETE = NO
CURRENT_CAPABILITY_GATING_COMPLETE = YES
GATE_C_REMOTE_ALPHA_COMPLETE = NO
ENABLED_WITHOUT_EVIDENCE = 0
UNSUPPORTED_CLAIMS = 0
```
