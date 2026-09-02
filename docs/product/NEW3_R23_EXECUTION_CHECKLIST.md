# NEW3 R23 — current-v1 integration and R17 release checklist

**Owner:** NEW3 / release coordinator  
**Source:** Lawmind V7.2 NEW3 R23 final current-v1 integration + R17 release brief  
**Status legend:** `[ ]` not observed · `[x]` observed with evidence · `[!]` stop/deferred with reason

This is an execution checklist, not a product audit. Mark an item complete only
after observing its required result. Preserve exact commits and another lane's
patches; do not infer completion from branch or bus claims.

## Execution result

The detailed controls below remain as the reusable audit procedure. This table
is the authoritative R23 completion record; a checked phase means every
applicable control in that phase was executed and evidenced in the linked round
record. A deferred item is an intentionally retained downstream blocker, not an
unfinished NEW3 action.

- [x] Preflight and hard bounds — lane, ownership, no-network, no-migration, and
      no-paid-infrastructure constraints observed.
- [x] Phase A — all four completed commits mechanically proven on one base;
      no integration mutation required.
- [x] Phase B — combined backend/client R17 lifecycle and refusal-total
      acceptance passed; R17 released on wire protocol 1.
- [x] Phases C–D — physical split role-routing invariant and executable
      regression-guard requirement frozen for LCC R28.
- [x] Phase E — external deletion behavior, identity-verification, and
      `identity_only` coverage contract frozen for RCC R25.
- [x] Phase F — Gate S1, concurrency, citation hold, NEW1 coverage, and HNSW
      precheck state recorded without reopening benchmark or starting HNSW.
- [x] Phase G — LCC R28 and RCC R25 P0 handoffs sent before final documentation.
- [x] Phase H — exact NEW3-only release commit `f45c3f0` and post-commit path,
      worktree, and NEW1-continuity proofs passed.
- [!] Downstream implementation — public deletion resource remains an RCC/store
  blocker. LCC R28 subsequently closed physical split activation; the
  transient API typecheck defect reported in bus `1760` also closed.
- [!] Device evidence — Android export passes, but physical-device acceptance
  remains `PENDING_DEVICE` because `adb devices -l` found no device.
- [!] New P2 contract finding — LCC bus `1759` identifies eight R17-adjacent
  missing-target wording surfaces. It is ledgered and deferred to the next
  semantic round; R23 does not widen released R17 or create R18 for it.

Evidence: [R23 integration and release record](NEW3_R23_CURRENT_V1_INTEGRATION_AND_R17_RELEASE.md)
and [R17 acceptance JSON](NEW3_R23_R17_ACCEPTANCE.json).

## 0 · Hard bounds and preflight

- [ ] Confirm lane is `NEW3 / RELEASE_COORDINATOR`.
- [ ] Confirm owned writes are limited to `docs/product/**`, the NEW3 contract
      ledger, NEW3 capability/acceptance evidence, and NEW3 bus artifacts.
- [ ] Confirm no edits will be made under `apps/**`, `services/**`, `packages/**`,
      `migrations/**`, `services/ingest/**`, `NEW1/**`, `NEW2/**`, `FIFTH/**`, or
      `CURRENT_PLAN.md`.
- [ ] Confirm `NETWORK_ALLOWED = NO`.
- [ ] Confirm `DB_MIGRATION_ALLOWED = NO`.
- [ ] Confirm all background workers remain running, especially NEW1.
- [ ] Confirm paid remote infrastructure remains unauthorized.
- [ ] Confirm required prior state:
  - [ ] R16 is released.
  - [ ] R17 read contract is frozen.
  - [ ] R17 write contract is frozen.
  - [ ] `identity_only` deletion backend has landed.
  - [ ] `identity_only` deletion client has landed.
  - [ ] Local Gate-S1 single-request p95 is below 3 seconds.
  - [ ] Split-DB foundation has landed.
- [ ] Capture `HEAD_START = ________________________________`.
- [ ] Record the exact evidence/command used for each observed result.

## A · Integrate the current wave

### A1 · Mechanical ancestry

Use `rtk git merge-base --is-ancestor <commit> HEAD`; classify only by exit
status. Do not infer from log order, filenames, or reports.

- [ ] `f60bfaaa` (NEW3 R22): `HEAD / ANCESTOR / MISSING = __________`.
- [ ] `6124b5f0` (LCC R27): `HEAD / ANCESTOR / MISSING = __________`.
- [ ] `7cc830a1` (RCC R24): `HEAD / ANCESTOR / MISSING = __________`.
- [ ] `f5ce4d44` (NEW2 R24): `HEAD / ANCESTOR / MISSING = __________`.

### A2 · Exact integration

- [ ] If all four commits are already ancestors, make no integration mutation.
- [ ] If a commit is missing, verify its paths are compatible before mutation.
- [ ] Acquire the `GIT_COMMIT` lease before integrating anything.
- [ ] Re-anchor immediately before integration.
- [ ] Integrate only the exact completed missing commit(s).
- [ ] Preserve commit contents; do not manually recreate patches.
- [ ] Do not reset, rebase, stash, force, or broad-stage.
- [ ] If a true semantic conflict appears, abort cleanly, record
      `INTEGRATION_CONFLICT`, and **STOP** without resolving another lane's logic.

### A3 · Final base proof

- [ ] Prove all four completed commits are ancestors of final integration HEAD.
- [ ] Prove migration chain includes `0100`, `0101`, `0102`, and `0103`.
- [ ] Prove the V7.2/V3 authority artifacts remain exact.
- [ ] Prove NEW1-owned paths and workers are unaffected.
- [ ] Record `INTEGRATION_BASE = ________________________________`.
- [ ] Set `INTEGRATION_BASE_READY = YES` only after all proofs pass.

## B · R17 end-to-end release

### B1 · Combined environment

- [ ] Run the actual local API, not separate branch mocks or claims.
- [ ] Use physically split disposable/local database roles where the existing
      split harness supports them.
- [ ] Record API build/commit and user/corpus database identities.
- [ ] Identify one corpus judgment `J` for the complete lifecycle.
- [ ] Capture cleanup steps for all disposable rows and generation switches.

### B2 · Available authority save

- [ ] Confirm active corpus contains `J`.
- [ ] Save `J` to a matter through the real API/client path.
- [ ] Observe successful write.
- [ ] Observe exactly one `matter_authorities` row.
- [ ] Observe normal `authorities[]` hydration.
- [ ] Observe no unavailable shell.
- [ ] Record `R17_AVAILABLE_SAVE = PASS / FAIL: __________`.

### B3 · Active corpus loses `J`

- [ ] Switch to a corpus generation that does not contain `J`.
- [ ] Observe the existing user-owned row persists.
- [ ] Observe `GET Matter` returns the row in `unavailableAuthorities[]`.
- [ ] Prove the shell contains only R17-authorized user-owned fields.
- [ ] Prove raw JSON fabricates no title, court, date, citation, treatment,
      currentness, or source URL.
- [ ] Record `R17_UNAVAILABLE_READ = PASS / FAIL: __________`.

### B4 · Save while target is absent

- [ ] Attempt to save a corpus UUID absent from the active corpus.
- [ ] Observe exact HTTP status `409`.
- [ ] Observe exact code `CORPUS_TARGET_UNAVAILABLE`.
- [ ] Prove no `matter_authorities` row was created.
- [ ] Prove response is not `404`, `NOT_FOUND`, or "no judgment with that id".
- [ ] Prove client performs no automatic retry.
- [ ] Record `R17_MISSING_TARGET_WRITE = PASS / FAIL: __________`.

### B5 · Idempotent already-saved unavailable authority

- [ ] Exercise the R17 path where the live saved row already exists and its
      corpus target is unavailable.
- [ ] Observe HTTP `200` with `unavailableAuthority` where applicable.
- [ ] Prove no duplicate row and no mutation.
- [ ] Record `R17_IDEMPOTENT_UNAVAILABLE = PASS / FAIL: __________`.

### B6 · Corpus returns

- [ ] Switch back to the generation containing `J`.
- [ ] Observe the same `authorityId`.
- [ ] Observe the same `addedAt`.
- [ ] Observe normal authority hydration resumes.
- [ ] Observe unavailable warning disappears.
- [ ] Prove no user re-save and no duplicate row.
- [ ] Record `R17_RECOVERY = PASS / FAIL: __________`.

### B7 · Truthful refusal totals

- [ ] Exercise `sparse_unbounded`.
- [ ] Prove raw JSON omits `total` when exhaustive total is not trusted.
- [ ] Exercise `sparse_timeout`.
- [ ] Prove raw JSON omits `total` when exhaustive total is not trusted.
- [ ] For timeout, observe `reason = timeout`.
- [ ] For timeout, observe `degraded` includes `sparse_timeout`.
- [ ] Prove neither refusal is rendered or interpreted as confirmed-empty.
- [ ] Record `REFUSAL_TOTAL = PASS / FAIL: __________`.

### B8 · Release decision

- [ ] Confirm B2–B7 all pass together on the integrated base.
- [ ] Set `R17_BACKEND_ACCEPTED = YES` only after backend observations pass.
- [ ] Set `R17_CLIENT_ACCEPTED = YES` only after client observations pass.
- [ ] Set `R17_RELEASED = YES` only after both acceptance values are `YES`.
- [ ] Keep `WIRE_PROTOCOL = 1` unless the frozen current contract explicitly
      requires otherwise.
- [ ] Do not create R18 merely to mark R17 release state.
- [ ] Update the contract ledger using the existing NEW3 convention.

## C · Freeze the final split-DB target

- [ ] Record the invariant exactly: **every current-v1 query executes through
      the database role that owns its tables**.
- [ ] Use the already-committed role map as authority; do not recreate table
      classification manually.
- [ ] Confirm user/matter-role coverage includes every current-v1 user-owned
      table named by the committed map, including matters, saved authorities,
      shares, events, annotations, deletion/data-request state, user citation
      confirmations, consent, idempotency, and user-owned OCR/eCourts transition
      state where applicable.
- [ ] Confirm corpus-role coverage includes current-v1 judgments, chunks,
      citation graph/resolver, aliases, statutes, provenance, legal metadata,
      retrieval, and vector data where applicable.
- [ ] Freeze `CROSS_ROLE_JOIN_ALLOWED = NO`.
- [ ] Freeze `CROSS_ROLE_FK_ALLOWED = NO`.
- [ ] Freeze `FDW_DBLINK_ALLOWED = NO`.
- [ ] Freeze the cross-role request model:
  - [ ] Query the owner database first.
  - [ ] Collect stable IDs.
  - [ ] Perform bounded/batched reads from the other role.
  - [ ] Merge deterministically in application code.
  - [ ] No N+1 queries.
  - [ ] No fake distributed transaction.
  - [ ] Every write belongs to one database.

## D · Require a role-routing regression guard

- [ ] Freeze `ROLE_ROUTING_REGRESSION_GUARD_REQUIRED = YES` for LCC R28.
- [ ] Require an executable static/runtime guard or an equivalently stronger
      design; do not freeze implementation syntax.
- [ ] Require a failing guard/test when a current-v1 module queries a user table
      through the corpus database.
- [ ] Require a failing guard/test when a current-v1 module queries a corpus
      table through the user database.
- [ ] Require physical split end-to-end proof in addition to route fixes.

## E · External account-deletion web contract

### E1 · Public behavior

- [ ] Publicly reachable URL.
- [ ] Identifies LawMind and the current developer identity.
- [ ] Prominently exposes account deletion.
- [ ] Lets a user initiate deletion without opening/reinstalling the mobile app.
- [ ] Is not merely an FAQ directing the user back to the app.
- [ ] Uses truthful "request deletion" language unless deletion is synchronous.
- [ ] Explains approved retention at a high level or links the current privacy
      policy.

### E2 · Identity verification and safety

- [ ] No arbitrary unauthenticated deletion by entering another person's email.
- [ ] Prefer established web authentication, magic link, or equivalent verified
      identity flow before the deletion request.
- [ ] If public web auth is unavailable, use an authenticated verification link
      or an existing supportable request workflow.
- [ ] Do not invent an email-only destructive endpoint.

### E3 · Account coverage

- [ ] Works for a profile-backed account.
- [ ] Works for an authenticated `identity_only` account.
- [ ] Does not require completion of LawMind onboarding.
- [ ] Record `IDENTITY_ONLY_EXTERNAL_DELETE_REQUIRED = YES`.

## F · Preserve current project state

- [ ] Record `LOCAL_GATE_S1 = PASS` without reopening the benchmark.
- [ ] Record local single-request p95 as approximately `2.7–2.8s`.
- [ ] Record `GATE_S1_CONCURRENCY = DEGRADES_GRADUALLY`.
- [ ] Record worker starvation as `NO through tested C8`.
- [ ] Record `GATE_S1_STAGING = UNPROVEN`.
- [ ] Do not reopen SQL optimization in this round.
- [ ] Record physical Android acceptance as `PASS` only with device evidence;
      otherwise `PENDING_DEVICE`.
- [ ] Do not block backend engineering on missing device evidence.
- [ ] Keep `CITATION_BULK_APPLY = HOLD`.
- [ ] Record that citation-edge apply does not block Gate C.
- [ ] Keep NEW1 continuous.
- [ ] Read the latest durable NEW1 coverage receipt using the roadmap's actual
      required definition.
- [ ] Set `HNSW_PRECHECK_DUE = YES` only if durable coverage is at least 75% by
      that definition.
- [ ] Do not start HNSW.

## G · Early handoffs

### G1 · LCC R28

- [ ] Send before final documentation.
- [ ] `kind = HANDOFF`.
- [ ] `severity = P0`.
- [ ] `requiresAck = true`.
- [ ] `blockingGate = PHYSICAL_DB_SPLIT_ACTIVATION`.
- [ ] Include `INTEGRATION_BASE`.
- [ ] Include the database role-routing invariant.
- [ ] Include physical split end-to-end requirements.
- [ ] Include static/runtime regression-guard requirements.
- [ ] Include R17 release state.
- [ ] Set `LCC_R28_AUTHORIZED = YES` only after the handoff is sent.

### G2 · RCC R25

- [ ] Send before final documentation.
- [ ] Include `INTEGRATION_BASE`.
- [ ] Include R17 release state.
- [ ] Include `identity_only` deletion backend/client state.
- [ ] Include the external deletion web contract.
- [ ] Include physical-device testing requirements.
- [ ] Set `RCC_R25_AUTHORIZED = YES` only after the handoff is sent.

## H · NEW3-only commit

- [x] Confirm the diff contains NEW3-owned files only.
- [x] Re-anchor against the original R23 brief.
- [x] Acquire the `GIT_COMMIT` lease.
- [x] Stage exact files only; no broad staging.
- [x] Review `rtk git diff --cached` before commit.
- [x] Commit with the repository's NEW3 convention.
- [x] Prove the commit did not alter another lane's files or background workers.
- [x] Capture the release commit and emit exact post-seal `HEAD_FINAL` in the
      user handoff (a Git commit cannot contain its own object ID).
- [x] Capture `COMMITS = f45c3f029f4ebba8430ea9b79505d6da4da847b6`
      plus this checklist-seal commit.

## Final release record

Do not publish `YES`/`PASS` values without attached observation evidence.

```text
HEAD_START = 6124b5f02754d2a61db590d1630a7f0287c8fd8f
INTEGRATION_BASE = 6124b5f02754d2a61db590d1630a7f0287c8fd8f
HEAD_FINAL = POST-SEAL OBSERVATION IN USER HANDOFF
COMMITS = f45c3f029f4ebba8430ea9b79505d6da4da847b6 + checklist-seal commit

NEW3_F60BFAAA = ANCESTOR
LCC_6124B5F0 = INTEGRATION_BASE
RCC_7CC830A1 = ANCESTOR
NEW2_F5CE4D44 = ANCESTOR

INTEGRATION_BASE_READY = YES
INTEGRATION_CONFLICT = NONE

R17_AVAILABLE_SAVE = PASS
R17_UNAVAILABLE_READ = PASS
R17_MISSING_TARGET_WRITE = PASS
R17_IDEMPOTENT_UNAVAILABLE = PASS
R17_RECOVERY = PASS

REFUSAL_TOTAL = PASS
R17_BACKEND_ACCEPTED = YES
R17_CLIENT_ACCEPTED = YES
R17_RELEASED = YES

DB_ROLE_ROUTING_INVARIANT = EVERY_CURRENT_V1_QUERY_USES_OWNER_ROLE
CROSS_ROLE_JOIN_ALLOWED = NO
CROSS_ROLE_FK_ALLOWED = NO
FDW_DBLINK_ALLOWED = NO

ROLE_ROUTING_REGRESSION_GUARD_REQUIRED = YES

EXTERNAL_DELETION_WEB_CONTRACT = FROZEN
IDENTITY_ONLY_EXTERNAL_DELETE_REQUIRED = YES

LOCAL_GATE_S1 = PASS_LOCAL_ONLY; R28 REPEAT HAS ONE OF THREE OVER BOUND
GATE_S1_CONCURRENCY = DEGRADES_GRADUALLY
GATE_S1_STAGING = UNPROVEN

ANDROID_LOCAL_ACCEPTANCE = PENDING_DEVICE

NEW1_COVERAGE = 5,863,970 / 7,654,179 = 76.6114% AT RELEASE SEAL
HNSW_PRECHECK_DUE = YES

CITATION_BULK_APPLY = HOLD

LCC_R28_AUTHORIZED = YES; PHYSICAL_DB_SPLIT_ACTIVATION = PASS
RCC_R25_AUTHORIZED = YES; REAL_SERVER_CONSUMPTION = PASS

READY_FOR_REMOTE_SPEND_DECISION = NO
PAID_REMOTE_INFRA_AUTHORIZED = NO

BLOCKERS = PHYSICAL_ANDROID_DEVICE; PUBLIC_EXTERNAL_DELETION_SITE; GATE_S1_STAGING; DEFERRED_P2_CCR_LCC_R28_01
```

## Stop conditions

- [ ] A semantic integration conflict: abort cleanly and stop.
- [ ] Any R17 lifecycle failure: do not release R17; record exact failure.
- [ ] Any fabricated unavailable-authority legal/corpus metadata: do not release.
- [ ] Any false confirmed-zero `total`: do not release.
- [ ] Missing Android device: record `PENDING_DEVICE`; continue backend work.
- [ ] Missing external deletion resource: retain the store-release blocker; do
      not weaken identity verification.
- [ ] Open founder decision, credential, account, or spend dependency: record it
      durably without authorizing paid remote infrastructure.
