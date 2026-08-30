# GATE B — NEW3 PRODUCT PREFLIGHT

**NEW3, 30 August 2026. Gate B target: 4 September.**
**Revised same day at the Sprint-2 final convergence — contract revision R14.**
Sections 1, 2, 3, 5, 6, 7 and 8 are restated below against **current HEAD
`19920c0f`**, not against the sealed Day-0 HEAD. Four facts in the first cut had gone
stale between the seal and the convergence, and four RCC Sprint-2 CCRs had never been
ledgered.

**This is evidence prepared FOR FIFTH. It is not FIFTH's audit.** NEW3 does not
grade its own gate. Every claim below names the artifact that carries it so an
independent auditor re-checks rather than re-derives.

**Measured against `gitSha f3b31c963dd19741b7a849d8a007d42aa1b9bfb1`** — the HEAD
sealed by LCC's Day-0 integration seal (bus 1567, artifact
`docs/ai/lcc-r13/SPRINT2_DAY0_INTEGRATION_SEAL.md`, commit `2b378f7`).

---

## 1 · API CONTRACT — frozen, versioned, amendment process operational

| requirement | state | evidence |
|---|---|---|
| frozen | **YES** | `RCC_V1_API_CONTRACT_R12.md`, sha256 `e89d93c8…d5ed`, git blob `8c0159ba…` |
| versioned | **YES** | R12 → R13 → **R14**. R12 and R13 **not edited**; the current revision is `RCC_V1_API_CONTRACT_R14_AMENDMENT.md` |
| **every revision now hashed** | **YES** | R13 had **no recorded hash** — a reproducibility gap, fixed retrospectively in the ledger. R14 sha256 `6322203a…99f2`, git blob `55663677…b6c8` |
| process operational | **YES** | `CONTRACT_CHANGE_CONTROL.md` (process) + `CONTRACT_CHANGE_LEDGER.json` (decisions) |
| wire `contract` integer | **1**, unchanged | `CONTRACT_REVISION = R14` and `WIRE_PROTOCOL_VERSION = 1` are **different numbers** — see R14 §0. Every amendment is additive or semantic; nothing removed or narrowed, and **no `services/**` change was made or required by any R14 decision** |

**11 CCRs received · 7 AMEND · 2 DEFER · 1 REJECT_WITH_ALTERNATIVE ·
1 NOT_A_CONTRACT_CHANGE_ENGINEERING_DEFECT · 0 undecided ·
0 contract-change P0 open · 1 implementation P0 open (a RELEASE blocker; `GATE_B_ACCEPTANCE_IMPACT = NONE_OBSERVED`, §3).**

**The R13 count of 5 was wrong by four.** RCC had filed `CCR-RCC-S2-01…04` in
`apps/mobile/CONTRACT_CHANGE_REQUESTS.md` and none had reached the ledger, so
"5 received · 0 P0 open" described a ledger that was missing four rows. **Zero RCC
Sprint-2 CCRs remain unledgered.**

Two of the five are **retrospective, self-filed**, and are in the ledger precisely
because they are the failure modes the process exists to route: RCC re-measuring a
NEW3 row (it reported rather than edited — correct), and LCC editing a NEW3 frozen
artifact (correct content, wrong route — **ratified, not reverted**; reverting a
correct correction to make a process point would leave a false state in the
registry).

**`CCR-2026-08-30-04` (A3, `capabilities[].platforms`) is WITHDRAWN.** It specified a
second representation that was never built. LCC shipped a *resolved per-platform view*
instead — selector in, one platform's resolved states out — four minutes after the A3
row was committed, and to a different shape than the one decided. **R14 adopts the
shipped shape as canonical** rather than asking LCC to build a duplicate
representation, and records the chronology as it happened:
`LCC_IMPLEMENTATION_PREDATED_FORMAL_AMENDMENT = true`. Nothing here should be read as
implying governance ran in the prescribed order. It did not.

**One AMEND is deliberately NOT released to RCC.** `CCR-RCC-S2-02` (`precedentialEffect`
and `canAddToMatter` on saved matter authorities) is decided and handed to LCC. No
backend serves those fields on that route; `releasedToRCC: false` says so, and RCC's
existing fallback is honest meanwhile.

---

## 2 · CAPABILITY REGISTRY — per platform, no ENABLED without named evidence

`V1_CAPABILITY_REGISTRY_R14.json`, supersedes R13.

| | |
|---|---|
| rows | **30** |
| carries `platforms {ios, android, web}` | **30 / 30** |
| ENABLED on ≥1 platform | **18** |
| **ENABLED without named evidence** | **0** |
| **ENABLED on `WEB_ADVOCATE_APP`** | **0** |
| **rows still awaiting a founder answer** | **0** |
| every `docs/**` evidence path checked for existence on disk | **yes**, mechanically |
| carries `evidenceState` + `currentContractVersion` | **30 / 30** |

**No capability is enabled merely because client code exists.** Asserted and
checkable: `search.semantic.broad` has a working, client-reachable implementation
and stays `INTERNAL_EXPERIMENTAL` on every platform. The desktop workspace files
exist in the tree, are inert below 900 px, and enable no row.

**Three rows moved, 27 carried forward** and are marked
`carriedForwardFromR12: true`. A per-platform re-issue is not a licence to
re-adjudicate rows nobody measured.

**WEB GOVERNANCE IS SETTLED, AND NOTHING WEB IS ENABLED.** Master Roadmap v7.1 is the
latest governing roadmap and keeps a desktop/web advocate research surface **in v1
scope**. **In scope is not enabled.** The **18** rows that read
`UNKNOWN_PENDING_FOUNDER` for `web` now read `DISABLED_NOT_READY` — the gap is ours,
and closing it is our work. `platformStatus.web` moves
`CONTESTED_FOUNDER_INPUT_REQUIRED → IN_SCOPE_V1_NOT_BUILT`, and `FQ-WEB-SURFACE` closes
as `RESOLVED_BY_CURRENT_FOUNDER_ROADMAP_V7_1`.

**The count was 18, not 30.** Earlier NEW3 prose said *"every one of its 30 rows reads
`UNKNOWN_PENDING_FOUNDER` for web"*. Measured, 18 did; the other **12** already carried
truthful non-founder-pending states (`DISABLED_NOT_READY`, `DISABLED_EXTERNAL_BLOCK`,
`POST_V1`, `INTERNAL_EXPERIMENTAL`) and **were not touched**. Corrected here and in
`docs/FOUNDER_QUEUE.md`.

**`UNKNOWN_PENDING_FOUNDER` is retired** from the state vocabulary — zero rows used it
afterwards, and a state nothing uses is a state that gets misused later.

**The `web` homonym is removed.** `web` meant two things: the marketing website and the
advocate web application. The capability registry's `platforms.web` is now explicitly
**`WEB_ADVOCATE_APP`**, and the claims register splits the old single column into
`WEB_MARKETING_SITE` and `WEB_ADVOCATE_APP` (`V1_CLAIMS_REGISTER_R14.md`). **No claim's
truth value changed** — a column was split, not a verdict re-decided.

**Stale wording elsewhere, recorded not edited.** `PRODUCT_DECISIONS.md` PD-15 and
`CLAUDE.md` §1 still carry the 12 August reversal. NEW3 owns neither file and edited
neither. They are stale against v7.1 and are handed off as such; nothing in them
overrides v7.1 for registry purposes.

---

## 3 · ACCEPTANCE AND P0/P1 TRUTH — one open P0, and it is named

`NEW3_ACCEPTANCE_DELTA_R13.json`.

| case | verdict | why it was run |
|---|---|---|
| **AB-1** party-name workflows | `PASS_WITH_LIMIT` | backend `d96147e` landed |
| **AB-2** filtered broad-query workflows | `PASS_WITH_LIMIT` | backend `d96147e` landed |
| **CTRL-CITATION** exact-citation positive control | `PASS` | required by the round |
| **CTRL-CORELOOP** Search → Reader → Save → Matter | `PASS` | required by the round |

**RECOMPUTED FOR R14. R13's `P0_OPEN = 0` / `P1_OPEN = 2` are superseded and are NOT
carried forward** — they predate the four RCC Sprint-2 CCRs entering the ledger, and a
count taken over a ledger missing four rows is not a count.

**RECOMPUTED AGAIN 30 August 2026** by the NEW3 Sprint-2 final change-control
adjudication (`CCR-NEW3-S2F-01`). The block below **replaces** the R14 counters
(`ACCEPTANCE 0 / CONTRACT_CHANGE 0 / IMPLEMENTATION 1 / NON_GATE_P1 3`). Two things moved
and nothing else: `NON_GATE_P1_OPEN` gains the deferred retrieval-outcome gap, and the
magic-link P0's **gate coupling** is corrected on observed acceptance evidence.
**No severity was downgraded and no P0 was closed.**

```
ACCEPTANCE_P0_OPEN       = 0
CONTRACT_CHANGE_P0_OPEN  = 0
IMPLEMENTATION_P0_OPEN   = 1     <-- SUPERSEDED. CLOSED at the 30 Aug seal, §9.
GATE_B_P0_OPEN           = 0     <-- stated separately, because implementation,
                                     release and consumption are different states
NON_GATE_P1_OPEN         = 4
CONDITIONAL_P0_GUARDED   = 1     <-- CCR-NEW3-S2F-01, latent; becomes P0 only on an
                                     override activation that is now prohibited
```

**SUPERSEDED BY §9 (30 August 2026, final governance seal).** `IMPLEMENTATION_P0_OPEN`
is now **0** — the magic-link defect was fixed by LCC at `a4725682` and NEW3 verified the
fix against committed source at HEAD `784bab85` rather than accepting the report. The
block above is kept because the P0 was real and its history is not rewritten. **Read §9
for the current numbers.**

**There is no blanket "P0 = 0" here, because it would not be true.**

**`IMPLEMENTATION_P0_OPEN = 1` — `CCR-RCC-S2-03`, the magic-link email origin.** RCC
filed it as a P0 launch blocker and **NEW3 upholds the P0**. The contract is already
correct: the deployment-controlled origin RCC asked for exists as `AUTH_BASE_URL`. The
defect is its fallback — `services/api/src/env.ts` still defaults to the **retired**
`api-production-1c0b4.up.railway.app`, unchanged since 7 August. A sign-in link that
opens a dead endpoint is a sign-in path that does not work, and the client cannot
rewrite a URL the server already emitted. **It is an implementation defect under an
already-correct contract, so no fake API amendment was manufactured to close it.**
Routed to LCC. **Not downgraded to pass this gate.**

**REFINED 30 August 2026 — the severity stands, the gate coupling does not.** The three
states are separated because this round was required to separate them:

- **`AUTH_BASE_URL_CODE_DEFECT = YES`.** Real, unfixed, LCC's. `services/api/src/env.ts:50`
  reads `process.env['AUTH_BASE_URL'] ?? 'https://api-production-1c0b4.up.railway.app'`.
  The sibling secret two lines above it is `required('AUTH_SECRET')` with the reasoning
  written out — *"a fallback secret is a secret everyone has… failing to start is the
  cheap outcome."* The identical argument applies here and was not applied.
- **`REMOTE_API_NOT_DEPLOYED = YES`** — and that on its own is **not** a Gate-B P0. Remote
  serving is a Sprint-3 milestone. "No running production API" is not a product defect and
  is not counted as one here.
- **`GATE_B_ACCEPTANCE_IMPACT = NONE_OBSERVED`.** The Gate-B acceptance and core-loop
  smoke authenticated via a **fixture user** — `new3-acceptance-56b2c29a@example.test`,
  the raw response recorded in `TEN_MATTER_ACCEPTANCE_R12.json` — against
  `127.0.0.1:3011`, and passed. It never rendered or followed an emailed link, so the
  fallback cannot have blocked it, and R14's "Gate-B blocker" wording is not supported by
  the acceptance evidence.

So it is a **release / real-sign-in blocker**, not a Gate-B acceptance blocker.
**`IMPLEMENTATION_P0_OPEN` stays 1, the severity stays P0, the owner stays LCC, and it
stays open.** RCC's submitted severity and R14's own wording are preserved verbatim in
the ledger (`severitySubmittedByRCC`, `historicalGateBEffect_R14`) rather than rewritten.

**One observation, recorded rather than acted on.** `services/api/src/env.ts` is **modified
in the working tree** — not by NEW3, which does not write `services/**` and did not. The
uncommitted version replaces the fallback with a `resolveAuthBaseUrl(...)` that **refuses
to start** when `AUTH_BASE_URL` is unset in production: the fail-closed remedy this CCR
asked for. **It is not committed, so the P0 is not closed.** This preflight adjudicates
HEAD `acc478c3`, where the retired-host fallback is still line 50. NEW3 did not review,
run, or stage that change. **LCC closes the CCR by landing it and saying so.**

**`ACCEPTANCE_P0_OPEN = 0`.** AB-1 and AB-2 `PASS_WITH_LIMIT`, both controls `PASS`.
**No acceptance case was rerun in R14 and no verdict changed** — R14 mutated product
governance documents only and touched no `apps/**`, `services/**`, `packages/**` or
migration.

**`CONTRACT_CHANGE_P0_OPEN = 0`.** Two RCC CCRs were submitted P0 and are adjudicated
**P1**, with the reason stated rather than assumed: `CONTRACT_CHANGE_CONTROL.md` §3
defines P0 as a surface that *states or implies something false*, and under RCC's own
stated fallbacks both surfaces say **less** than the truth rather than something other
than it. **RCC's submitted severities are preserved verbatim in the ledger beside the
adjudication.** Neither was downgraded to clear a count.

**`NON_GATE_P1_OPEN = 4`** (3 at R14, plus `CCR-NEW3-S2F-01` below) — `CCR-RCC-S2-02` (treatment fields absent from the
saved-authority read shape, AMENDed, LCC-owned, not released); `CCR-2026-08-30-05`
(`treatment_provenance` not on the wire, DEFERRED to Gate C, unchanged by R14); and the
D6 backlog item (the registry enumerates no drafting or Hearing Pack row — absent by
**prohibition**, not oversight, and the schema requires no exhaustive enumeration, so
no feature taxonomy was invented in a convergence round).

**Closed in R14:** R13's P1-1 (`rarestDf` corpus-wide) stays closed as a semantic
amendment and is **not reopened** — restated in R14 §A8 as a corpus-wide/query-term
diagnostic that may not drive user-facing narrowing copy. `CCR-RCC-S2-01` and
`CCR-RCC-S2-04` are closed.

**The other eight ten-matter cases were NOT rerun and their R12 verdicts stand.**
Rerunning them would have spent fixture writes on append-only tables to re-observe
an unchanged result — and a suite killed part-way has already left rows behind in
this repo once.

**No acceptance case is labelled PASS whose backend dependency has not landed.**
`d96147e` is an ancestor of HEAD, verified by `git merge-base --is-ancestor`, not
by a filename.

**Cleanup verified, not assumed:** the run deleted by *owner*, not by the ids the
responses exposed — `matters 1, matter_authorities 1, users 1, auth_user 1`, and
residual `usersLeft 0, mattersLeft 0`.

---

## 4 · FIRM-READY WORKSPACE OWNERSHIP — frozen

```
FIRM_READY_WORKSPACE_OWNER = NEW3 (product definition) · LCC (schema)
FIRM_READY_FREEZE_STATE    = VERIFIED_UNCHANGED
```

Verified against the live database, not inferred from the freeze document:
**542** workspaces · **542** members · **0** matters with a null `workspace_id` ·
`monitoring_entitlements` **0 rows** (frozen and unused, as specified) · **0**
workspace columns on `ecourts_observation`.

LCC implemented the model in `7b570b7` (migrations 0097–0099) **to the frozen
model**, with no semantic redefinition, and RCC's contract gained no field. **No
second lane has independently redefined Workspace semantics.** Not redesigned in
this round.

---

## 5 · PARTY SEARCH — case-first, platform-flagged, iOS degrade defined

| requirement | state |
|---|---|
| case-first semantics | **YES** — no person-first surface, no person profile, no "search anyone's court history" |
| platform flag | **YES** — `ENABLED_V1_KILLABLE` on iOS, `ENABLED_V1` on Android |
| **served, not build-time** | **YES — corrected in R14.** `GET /release/capabilities` resolves `search.party_name` per platform; flipping the switch is a server-side config change, not an App Store release |
| **dedicated runtime row** | **YES — corrected in R14.** `search.party_name` exists and reads `ENABLED` on every platform including `unknown` |
| iOS degrade product definition | **YES** — visible degrade to case-number / citation / CNR with a stated message; never a silent disappearance |
| capabilities the switch must not disable | **named**: `search.exact_citation`, `search.cnr`, `search.case_number`, `search.case_title_full` |
| per-platform claim | **YES** — claims register A9; the sentence comes off the App Store listing the same day the switch flips |

**R14 CORRECTION — the honest limit recorded in the first cut is no longer the state.**
That cut said the switch is build-time and that *"the string `platform` appears nowhere
in the payload"*. Observed at HEAD `19920c0f` by executing the committed app: the route
accepts `X-Lawmind-Platform` (header, wins) or `?platform=` (fallback) and returns
`{registryVersion, asOf, platform, capabilities, platformOverrides}` over **25** rows.
A caller that sends neither still gets the three-key release-wide envelope,
byte-identical to before — which is why the wire integer stays `1`.

**The switch is unflipped, and that is the correct state.** `platformOverrides` is `[]`
on every platform. §9.5 says ship the switch, not disable the capability; **adding a row
to the override map IS flipping it.**

**Narrow-only, enforced in code:** a platform override may take a capability DOWN and
never UP, and one that would widen is ignored rather than obeyed. So the selector can
never become a back door, and a client that lies about its platform gains nothing.

**Verified, not asserted:** `services/api/src/search/party-search-platform.test.ts` run
at HEAD — **17 pass, 0 fail**. It asserts that no neutral citation, reporter citation,
CNR, case number or "X v. Y" title classifies as `party_name`, so flipping the switch
cannot take exact identity with it.

**Android is not weakened because the iOS switch exists.**

### 5.1 · THE SWITCH IS NOW EXPLICITLY BLOCKED FROM BEING FLIPPED — `CCR-NEW3-S2F-01`

```
PARTY_IOS_OVERRIDE_ACTIVATION = BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT
```

**Gate B requires the switch to EXIST and the degrade path to be DEFINED. Both are true
and neither is disturbed.** Gate B does not require the override to be *activated*, and
this guard does not weaken any row in the table above.

**What was found.** `/search` can emit `degraded: ["party_name_disabled"]`
(`retrieve.ts:2048-2049`) and that value reaches `deriveRetrievalOutcome` as
`degradedArms` (`route.ts:946-948`) — which ignores it. Observed by executing the
derivation at HEAD `acc478c3`:

| input | `state` | `reasons` | `safeForGeneration` |
|---|---|---|---|
| suppressed, 5 results | `answered` | `[]` | **`true`** |
| suppressed, 0 results | `abstained` | `["low_relevance"]` | `false` |
| **not** suppressed, 0 results | `abstained` | `["low_relevance"]` | `false` |

`answered` is defined in `outcome.ts` as *"the arms we needed ran"*; `low_relevance` as
*"the rankers ran and nothing cleared the bar"*. With the party arm switched off both
sentences are false — and the last two rows are **byte-identical**, which is exactly the
"there is no law on this" / "we could not search" collapse that file exists to prevent.
**No committed test would catch it:** `outcome.test.ts` contains zero occurrences of
`party`, and `party-search-platform.test.ts` asserts `degraded[]` visibility only.

**Why this is NOT a current Gate-B P0, and was not promoted into one.** The emitting
branch is **unreachable at HEAD**: `PLATFORM_CAPABILITY_OVERRIDES` is `{}` and
`search.party_name` is `ENABLED` release-wide, both observed. Suppression cannot occur on
any platform including `unknown`. `CONTRACT_CHANGE_CONTROL.md` §3 defines P0 as a surface
that *states or implies something false* — at HEAD, no surface here can. RCC is truthful
independently: `searchTruth.ts` classifies from `degraded[]` and returns `party_disabled`
**before** every other branch (shipped in Part B, `acc478c3`).

**Why it was DEFERRED rather than AMENDed.** `CONTRACT_CHANGE_REQUIRED = YES` — the
contract genuinely has no vocabulary for an administratively suppressed arm. But AMEND is
for a change that must land *now*, and nothing released is false. Creating R15 for an
unreachable branch would increment the revision for a fix NEW3 cannot write
(`services/**`) and leave the contract ahead of the server with no test holding it.
**R14 remains latest and its recorded identities are unchanged.**

**The guard is the price of the deferral.** It lifts only when all three land: the
amendment adding an `arm_administratively_disabled` reason; the derivation fix, which
must put the suppression into `couldNotLookProperly` and **not** merely into `reasons`
(otherwise the zero-result branch is reached first and still reports `abstained`); and a
test that fails on the false states. Under the **existing, unchanged** generation-safety
rule that yields `degraded` with results and `coverage_unknown` without —
**`GENERATION_SAFETY_CHANGED = NO`**, no policy is strengthened, and
`exactIdentityUsable` stays `true`. **`RCC_FOLLOWUP_REQUIRED = NO`:** RCC types
`reasons` as `string[]`, so the new value parses today.

**NEW3 does not modify backend configuration and did not.** This is a product /
change-control prohibition, not a code lock.

### 5.2 · SAVED-AUTHORITY OPTIONAL FIELDS — `SAVED_AUTHORITY_GATE_B_STATE = NON_BLOCKING`

Re-tested this round against current evidence and **unchanged**. `precedentialEffect`,
`canAddToMatter` and `citableForUntouchedPropositions` remain absent from the
saved-authority read shape, `releasedToRCC: false`, adjudicated **P1** in R14 §A6. No new
evidence proves a current P0: with RCC's fallback in force the Matter surface says *less*
than the truth, not something other than it, and Search → Reader → Save → Matter passes
(`CTRL-CORELOOP`). **No contract revision was created for these.**

---

## 6 · WHAT NEW3 IS HANDING FIFTH, BY PATH

| artifact | what it proves |
|---|---|
| `V1_CAPABILITY_REGISTRY_R14.json` | per-platform capability truth, 0 ENABLED without evidence, 0 ENABLED on the advocate web surface, 0 rows awaiting a founder |
| `V1_CLAIMS_REGISTER_R14.md` | per-platform claims, 0 unsupported, and the `web` homonym removed |
| `CONTRACT_CHANGE_CONTROL.md` + `CONTRACT_CHANGE_LEDGER.json` | the amendment process is operational, with decisions, every revision hashed, and 0 unledgered RCC CCRs |
| `RCC_V1_API_CONTRACT_R14_AMENDMENT.md` | the current contract: what RCC may consume, and what it may not |
| `V1_CAPABILITY_REGISTRY_R13.json` · `V1_CLAIMS_REGISTER_R13.md` · `RCC_V1_API_CONTRACT_R13_AMENDMENT.md` | superseded, unedited, kept as the historical record |
| `NEW3_ACCEPTANCE_DELTA_R13.json` | the affected-case rerun and both controls |
| `NEW3_R13_PRODUCT_AMENDMENTS.md` | the eCourts correction and the two capability moves |
| `TRUST_STATE_PRODUCT_CONTRACT_V1.md` | 10/10 states representable; the two under strain, named |
| `LAUNCH_SHAPES_V1.md` | both shapes executable, launch date fixed |
| `MONITORING_12_CONDITION_MATRIX.json` | the 8 September decision cannot cherry-pick |
| `CORRECTION_WORKFLOW_V1.md` · `ANALYTICS_EVENT_DEFINITIONS_V1.md` | correction states and metric denominators |
| `RESEARCH_TASK_SET_V1.json` | 50 tasks, threshold deliberately unset |
| `NEW3_V1_PRODUCT_DEFINITION_R12.md` | frozen baseline, **+68 / −0**, correction appended not rewritten |

---

## 7 · WHAT NEW3 IS **NOT** CLAIMING, STATED SO FIFTH DOES NOT HAVE TO FIND IT

- **Gate B check 0 is FIFTH's, not ours.** The Day-0 seal is LCC's artifact and
  partly audits LCC's own commits. NEW3 read it and built on it; NEW3 did not
  re-verify its git ancestry independently.
- **`ecourts_observation = 0` and the bounded stop report is LCC's to produce.**
  Roadmap v7.1 says this check passes only alongside a completed bounded stop
  report — *"0 because work was not attempted" is a HOLD*. LCC's
  `ECOURTS_AJAX_BLOCKER.md` records eight refuted hypotheses and a stop under the
  three-failure bound; **whether that satisfies the check is FIFTH's call, not
  NEW3's.**
- **Monitoring readiness.** 0 of 12 conditions pass. On present evidence the
  8 September decision selects Shape B, and the launch date does not move.
- **Web/desktop is in scope and NOT built.** NEW3 did not decide the surface — Master
  Roadmap v7.1 did, and v7.1 governs. What NEW3 decided is the only part that was
  ours: that "in scope" does not authorise a capability or a claim. **Every advocate-web
  row is `DISABLED_NOT_READY` and zero are ENABLED.** If FIFTH wants one number to
  check, it is that one.
- **NEW3 did not verify the platform implementation as LCC's auditor.** R14 adopts a
  shape LCC had already shipped. NEW3 read the committed source, ran LCC's own test file
  (17 pass) and observed the route in-process; NEW3 did **not** re-derive LCC's test
  coverage or audit the commits around it.
- **The magic-link P0 is stated, not fixed.** It is `services/**` and NEW3 does not
  write there. It is open, it is LCC's, and it blocks **release / real email sign-in**.
  R14 called it a Gate-B blocker; that coupling is corrected in §3 on observed acceptance
  evidence (the core-loop smoke authenticated via a fixture user and passed). **The P0
  itself is not downgraded.**
- **The eight unrerun acceptance cases.** Their R12 verdicts stand and were not
  re-observed this round.
- **Latency stability.** The AB-2 scopes were measured twice, ~40 minutes apart,
  and the same admitted query read **3,760 ms** cold and **418 ms** warm. The
  recorded numbers are the second run. **A single latency figure from this box is
  not a p50**, and no product decision here rests on one.

---

## 8 · HANDOFFS OUT OF THIS ROUND

**To LCC:**
1. **`CCR-2026-08-30-04` is WITHDRAWN — do not build `capabilities[].platforms`.** The
   resolved-per-platform view you already shipped is adopted as canonical in R14 §A4. No
   second representation, no work owed.
2. **`CCR-RCC-S2-03` — the magic-link origin. OPEN P0, upheld.**
   `services/api/src/env.ts:50` defaults `AUTH_BASE_URL` to the retired
   `api-production-1c0b4.up.railway.app`. Fail closed rather than emit a link to a dead
   origin, set it explicitly per deployment, and remove the retired host as a fallback.
   **The contract is not amended for this** — it is an implementation defect under an
   already-correct contract. **Scope corrected 30 Aug:** it blocks **release and real
   email sign-in**; `GATE_B_ACCEPTANCE_IMPACT = NONE_OBSERVED`, because the Gate-B
   core-loop smoke authenticated via a fixture user and passed without following an
   emailed link. Severity unchanged — see §3.
5. **`CCR-NEW3-S2F-01` — DO NOT FLIP THE PARTY SWITCH.**
   `PARTY_IOS_OVERRIDE_ACTIVATION = BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT`. Adding
   any narrowing row for `search.party_name` to `PLATFORM_CAPABILITY_OVERRIDES` is
   prohibited until (1) the contract amendment adding `arm_administratively_disabled`,
   (2) the `deriveRetrievalOutcome` fix — the suppression must join
   `couldNotLookProperly`, not just `reasons` — and (3) a test that fails on the false
   states, **all** land. When party suppression is next scheduled, **file back to NEW3
   first** so the amendment and the derivation fix land together. Full record in §5.1.
3. **`CCR-RCC-S2-02` — add `precedentialEffect`, `canAddToMatter` and
   `citableForUntouchedPropositions` to the saved-authority read shape.** Additive, no
   migration, no new endpoint; the write path in `matters/authorities.ts` already
   computes both. Read live on the request, never stored at save time.
4. `CCR-2026-08-30-05` — `treatment_provenance` on the wire. Deferred to Gate C, named here so it is not lost.
3. **Not a CCR, but you should know:** `platform_config.signups` is `enabled: false` on this box with `reason: "test cleanup"`, set by a test actor. Signups are OFF locally. Same class as the harvesting switch a killed suite left ON.

**To RCC:**
0. **Contract `R14` is released.** `WIRE_PROTOCOL_VERSION = 1` (unchanged). The
   platform-resolved capability view (§A4) and the eighth `precedentialEffect` value
   (§A5) are consumable now; the saved-authority treatment fields (§A6) are **not**.
   `RCC_CONSUMED = NO` until RCC changes and tests its client.
1. Contract **R13** is released for amendments A1 and A2. Both v1 search limits in R12 are superseded — a bare party name now resolves, and one named court plus a month admits a broad term.
2. **Do not build against `capabilities[].platforms`.** A3 is **withdrawn**, not
   pending — the shape was never built and never will be. Use §A4 instead, and **send
   `X-Lawmind-Platform` on every build**: a client that sends nothing gets the
   release-wide set and will not see its own narrowing.
3. `retrievalOutcome.rarestDf` is diagnostic only. Do not derive a user-facing narrowing hint from it. Use `emptyBecause` and `degraded[]`.
4. **Nothing is owed by RCC this round. `RCC_FOLLOWUP_REQUIRED = NO`.** The deferred
   retrieval-outcome gap (§5.1) needs no client change: `reasons` is typed `string[]`, so
   the future value parses today, and both target states are already in your union. Your
   Part-B party-disabled UI is correct and is **not** to be rebuilt.
5. The refusal screen must offer **one named court and a shorter date range**. A court *category* chip is not a narrowing remedy — measured, it is still refused.

**To the founder:** `FQ-WEB-SURFACE` is **CLOSED** —
`RESOLVED_BY_CURRENT_FOUNDER_ROADMAP_V7_1`. Master Roadmap v7.1 governs and keeps the
desktop/web advocate surface in v1 scope, so Sprint 5's 9 October desktop deliverable
stands as a real deliverable rather than a contested one. **Nothing is enabled by that
answer** — the surface is unbuilt and every row says so. One thing is handed over
rather than decided: `PRODUCT_DECISIONS.md` PD-15 and `CLAUDE.md` §1 still carry the
12 August reversal and now read stale against v7.1. NEW3 owns neither file and edited
neither.

---

## 9 · FINAL GOVERNANCE SEAL — 30 August 2026, HEAD `784bab85`

**Nothing here was taken on a report.** Every closure below was re-observed from
committed source at HEAD, and for the files that carry a test the worktree was confirmed
byte-identical to HEAD before the test was run.

### 9.1 Current counts

```
ACCEPTANCE_P0_OPEN       = 0
CONTRACT_P0_OPEN         = 0
IMPLEMENTATION_P0_OPEN   = 0     <-- was 1; CLOSED because it was FIXED, §9.3
GATE_B_P0_OPEN           = 0
CONDITIONAL_P0_GUARDED   = 1     <-- CCR-NEW3-S2F-01, latent and prohibited
NON_GATE_P1_OPEN         = 4
```

**This is not a blanket zero.** Four P1s are open, one conditional P0 is guarded, and
Gate-B check 5 is **waived, not passed**. What is *not* counted as a Gate-B P0, each for a
stated reason: deferred hosting, unmeasured hosting under the founder waiver, the
saved-authority optional fields, the SCI evidence-location inconsistency, backup-key
escrow, and unpushed commits. None is a current user-visible falsehood or a data-safety
condition.

### 9.2 Founder hosting override — **WAIVED IS NOT PASS**

```
HOSTING_MEASUREMENT_STATE = UNMEASURED
HOSTING_SELECTION_STATE   = DEFERRED_BY_FOUNDER
PAID_HOSTING_AUTHORIZED   = NO
GATE_B_CHECK_5            = WAIVED_BY_CURRENT_FOUNDER_INSTRUCTION_FOR_THIS_GATE
SPRINT3_REMOTE_HOSTING    = DEFERRED_BY_FOUNDER_UNTIL_FULL_APPLICATION_BUILT
```

The founder holds all paid VPS / hosting / managed remote-serving infrastructure until
**(A)** the full application is built **and (B)** the founder separately authorizes it.
That instruction is **newer than the Sprint-2 roadmap and prompt-pack hosting schedule**
and governs the current execution plan.

**`UNMEASURED` remains `UNMEASURED`.** No hosting candidate was measured, none was
selected, and **no number in any NEW3 artifact is derived from a vendor price page** — a
comparison assembled from pricing pages is not a measurement, and presenting one as though
it were is precisely what this line refuses. No roadmap or prompt-pack byte was altered.

Not authorized: VPS · managed database · paid remote API infrastructure · paid hosting
trials that can convert to billing. **Existing backup infrastructure is not disabled by
this** — the instruction concerns *new* spend. And it does **not** license skipping
truthful local development or testing; local verification was done for every closure here.

LCC recorded the same instruction independently as
`HOSTING_GATE_STATE = HOLD_MEASUREMENT_DEFERRED_BY_FOUNDER`. Two lanes, one founder
decision, no coordination required to agree.

### 9.3 Magic-link implementation P0 — **CLOSED, verified against committed HEAD**

```
MAGIC_LINK_CODE_DEFECT = CLOSED_VERIFIED_AGAINST_COMMITTED_HEAD
MAGIC_LINK_TESTS       = services/api/src/env.test.ts — 7 tests, 7 pass, 0 fail
IMPLEMENTATION_P0_OPEN = 0
```

Fixed by LCC at **`a4725682`**. Observed at HEAD, not accepted on the bus message:

- the retired host is **no longer an implicit production fallback** — `resolveAuthBaseUrl`
  has no production default at all, and the string survives in `services/api` only inside a
  comment and inside the test that forbids its return;
- **production missing `AUTH_BASE_URL` fails closed** — it throws rather than minting links
  against a guessed origin;
- **an explicit `AUTH_BASE_URL` is still honoured**, in production and outside it;
- it is **wired, not orphaned**: `env.ts:90` → `index.ts:157`, the value better-auth builds
  the link from.

**A running remote API was correctly not required for this closure.** This was always an
implementation defect under an already-correct contract; remote serving is separately
deferred by the founder. `REMOTE_API_DEPLOYED = NO`, unchanged, not counted here.

**History is not rewritten.** RCC's submitted P0, NEW3's upholding of it, and the 30 Aug
gate-coupling refinement all stand in the ledger. **It closes because it was fixed, not
because it was reclassified.**

*Residual, recorded and deliberately not reopened:* two diagnostic CLIs
(`services/harness/src/deployed-safety-cli.ts`, `deployed-judgment-safety-cli.ts`) still
carry the retired host as a `DEFAULT_BASE_URL`. They are probe tools on no user-facing
path. A tidy-up for LCC, **not a P0**.

### 9.4 Party override guard — **INTACT, and now enforced by a test**

```
PARTY_DEFER_STATE             = INTACT (CCR-NEW3-S2F-01 = DEFER)
PARTY_OVERRIDE_ACTIVATION     = BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT
CONDITIONAL_P0_GUARDED        = 1
```

Re-observed at HEAD: `PLATFORM_CAPABILITY_OVERRIDES` is `{}`, `search.party_name` is
`ENABLED`, and `outcome.ts` is **unmodified** — `party_name_disabled` appears nowhere in
it. LCC confirms it read the DEFER before touching anything and did not widen the response
contract. **The override is not activated.** No R15; R14 is still the current revision.

**Correcting this preflight's own earlier statement.** §5.1 said *"no committed test would
catch a violation."* That is **no longer true**:
`services/api/src/search/party-search-platform.test.ts:76-80` now asserts
`deepEqual(PLATFORM_CAPABILITY_OVERRIDES, {})` — 17 tests, 17 pass at HEAD — so an
activation breaks CI before it can land silently. **What is still missing is the other
half:** no test asserts that a *suppressed* arm reports something truthful in
`retrievalOutcome`. So enforcement of the prohibition improved; **the correction is still
owed and the guard stands unchanged.**

### 9.5 Saved authority — unchanged

`SAVED_AUTHORITY_GATE_STATE = NON_GATE_P1`. Still `releasedToRCC: false`. No contract
revision created, and **RCC is not told to consume unreleased fields.**

### 9.6 Supreme Court — permission settled, its filing location is not

```
SCI_PERMISSION_STATE        = SATISFIED
SCI_EVIDENCE_LOCATION_STATE = OPEN_NON_GATE_CONSISTENCY_ITEM
```

**Two questions, kept apart.** The permission is settled and is **not reopened, not
downgraded to `UNKNOWN`, and not broadened.** What is open is only *which document is its
canonical record*: `docs/SCI_AUTHORISATION.md` is **untracked** — one workstation, no Git
object, invisible to a clone — while tracked governance still carries the older contested
wording. The authoritative-looking record is the one that would vanish with the machine.

NEW3 did **not** commit the protected artifact, quote any grant text, broaden any
permission, or edit `CLAUDE.md` — a forbidden path for this lane. Owned as
`FQ-SCI-EVIDENCE-LOCATION`. **This is not one of Gate-B checks 0–10 and was not invented as
one.**

### 9.7 Capability and claims truth

```
ENABLED_WITHOUT_EVIDENCE = 0     (30 rows; every ENABLED row carries an evidence artifact)
UNSUPPORTED_CLAIMS       = 0     (11 claims are BLOCKED — forbidden, therefore not made)
```

Zero rows are ENABLED on web; `monitoring.user_product` stays `DISABLED_NOT_READY`.
**Nothing was enabled because it appears in future roadmap scope.** The acceptance suite
was **not** rerun — this check went only as deep as these two numbers need.

**Sprint 3 was not begun.**
