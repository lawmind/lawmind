# LAWMIND — SPRINT PROMPTS v3
## Companion to Master Roadmap v7.2

**Prepared:** 1 September 2026  
**Supersedes:** `LAWMIND_SPRINT_PROMPTS_V2.md`

This pack is intentionally execution-oriented. It does not repeat every historical prompt.

---

# HOW TO USE

1. Run the **INTER-WAVE INTEGRATION SEAL** before any new mutation wave.
2. Full prompt only to ACTIVE agents.
3. One-line continuation only to CONTINUOUS agents.
4. Nothing to FROZEN agents.
5. Use temporary **AUDIT-RO** sessions for intermediate independent falsification.
6. FIFTH remains reserved for formal Gate C / Gate E or emergency P0 data/security.
7. Dates are targets; gate prerequisites advance work.

---

# SHARED PREAMBLE — prepend to every ACTIVE prompt

```text
OPERATING RULES

Authority:
current founder instruction
→ verified repo/DB/primary-source truth
→ MASTER ROADMAP v7.2 + SPRINT PROMPTS v3
→ latest verified lane evidence.

Read current HEAD, status, leases, relevant bus handoffs and authority hashes
before mutating anything.

Concurrency:
atomic HEAVY_BOX / GIT_COMMIT / MIGRATION_SLOT.
Exactly one GPU writer.
One owner per logical job.
Exact-path staging only.
Never git add ., git add -A, git commit -a.
Never reset/rebase/stash/checkout over another lane's work.

Evidence:
every number comes from a command/query actually run.
UNKNOWN stays UNKNOWN.
Contradictions are reported as CONFLICT, never silently reconciled.
Durable rows/files/declared receipts are proof of long-job progress.
PID/session/GPU activity alone are not.

Long-worker restart safety:
UNKNOWN is NOT restart-safe.
Never kill/restart/take over because a wrapper PID died if durable progress moves.
Respect HEALTHY_BY_PROGRESS leases as takeover vetoes.

Stop rule:
three materially equivalent failed attempts on one issue → STOP.
No fourth blind attempt.
Do not touch the known Windows NUL pseudo-entry after its existing stop.

Bus:
before mutation, process explicit unacknowledged P0 / CCR / HANDOFF /
ACTION_REQUIRED messages addressed to your lane.
Do not infer urgency from age alone.

Claims:
no capability claim unless registry ENABLED for that platform.
Configuration does not prove runtime observation.
UNKNOWN remains UNKNOWN.

Settled:
eCourts/SCI authorization SATISFIED.
CAPTCHA_OPERATIONAL_BASIS retracted.
Do not reopen settled permission.
```

---

# WAVE 0 — INTER-WAVE INTEGRATION SEAL
## Run first. Read-only. No feature work.

```text
LANE = LCC / COORDINATION_SEAL

OWNED PATHS = NONE required
FORBIDDEN PATHS = all product mutation
MUTATION ALLOWED = NO
NETWORK ALLOWED = NO
DB MIGRATION ALLOWED = NO
BACKGROUND WORKERS TO PRESERVE = ALL

EXPECTED LATEST COMMITS FROM THE COMPLETED CONCURRENT WAVE:
LCC  = 9a4066a8
RCC  = ba307f30
NEW2 = c43e7e15
NEW3 = 2e6c148a

Do NOT assume current HEAD contains all four.

1. HEAD
Record HEAD and git status.

For each expected commit run mechanical ancestry proof:
ANCESTOR_OF_HEAD / HEAD / NOT_IN_HEAD / SUPERSEDED_BY_<commit>.

Any required NOT_IN_HEAD:
SEAL = HOLD.
Do not cherry-pick automatically.

2. WORKTREE
Inventory:
staged paths
tracked modifications
untracked product paths
GIT_COMMIT owner
MIGRATION_SLOT owner
HEAVY_BOX owner
NEW1 durable progress truth

The known NUL pseudo-entry is recorded, not retried.

3. AUTHORITY
Verify exact repo copies of:
LAWMIND_MASTER_ROADMAP_V7_2.md
LAWMIND_SPRINT_PROMPTS_V3.md

Record SHA256.

If v7.2 is not yet committed in the repo:
report AUTHORITY_INSTALL_REQUIRED.
Do not pretend an attachment alone is repo authority.

4. BUS ACTIONABILITY
Without advancing cursors blindly, identify explicit:
P0
CCR
HANDOFF
ACTION_REQUIRED
BLOCKER

addressed to the lanes that will run Wave A.

For new metadata-aware messages, list unacknowledged requiresAck=true.

Legacy messages: classify only from explicit subject/header/field markers.

5. FINAL

HEAD =
LCC_COMMIT =
RCC_COMMIT =
NEW2_COMMIT =
NEW3_COMMIT =

MISSING_COMPLETED_COMMITS =
PRODUCT_DIRT =
LEASES =
NEW1_PROGRESS =

ROADMAP_SHA =
PROMPTS_SHA =
AUTHORITY_INSTALL_REQUIRED =

UNACKED_ACTIONABLE_BY_LANE =

SEAL = PASS/HOLD
BLOCKERS =
```

No mutation wave starts until PASS.

---

# WAVE A — RUN IN PARALLEL AFTER SEAL PASS

## A1 — AUDIT-RO: R22 CORRECTION CANDIDATE

```text
LANE = AUDIT_RO_R22
OWNED PATHS = NONE
MUTATION ALLOWED = NO
DB WRITES = NO
NETWORK ALLOWED = NO

DEPENDENCIES:
NEW2 R22 c43e7e15
population NEW2-R22-SAFE-f55e2ba64b75772f
hash f55e2ba64b75772fe33e568e7707b453227dcdb18c67a966a7ae5ff776bafd33

Goal:
independently falsify all 540 SAFE candidate rows and the strengthened manifest /
target-holder / write-preflight logic.

1. Recompute population/artifact hashes.
Mismatch = STOP.

2. Audit every 540 row independently.
Do not use NEW2's proposal as ground truth.
Ground truth:
retained primary-source artifact
source identity/hash
court-issued case/CNR identity
deterministic exact evidence.

Verdict per row:
NULL_CONFIRMED
REPLACE_CONFIRMED
SUFFIX_REPLACE_CONFIRMED
CURRENT_VALUE_CORRECT
AMBIGUOUS
UNTESTABLE

PASS population requires:
false NULL = 0
false replacement = 0
false suffix replacement = 0
AMBIGUOUS in SAFE = 0
UNTESTABLE in SAFE = 0.

3. Manifest structural attack.
Verify refusal of:
duplicate row ID
conflicting disposition
TO_NULL + replacement
replacement with NULL
replacement == old
missing source hash
wrong population hash
changed old value
missing row
already-corrected
already-null TO_NULL
unknown disposition.

4. Target-holder attack.
Every replacement key:
NO_EXISTING_HOLDER
SAME_JUDGMENT
or explicitly evidenced allowed family.

Unexplained holder or unexplained many→one = FAIL for that row/population.

Audit the two Delhi many→one rows remain OUTSIDE SAFE.

Audit the 29 common-order rows remain OUTSIDE SAFE.

5. Source-concatenated diagnostic.
Confirm the source-mention artifact is not being used to relax the strict query parser.

Do not require closure of quarantined rows to PASS the 540 safe subset.

6. No mutation.

FINAL:
HEAD =
R22_HASH =
ROWS_AUDITED = must be 540
FALSE_NULL =
FALSE_REPLACE =
FALSE_SUFFIX_REPLACE =
AMBIGUOUS_IN_SAFE =
UNTESTABLE_IN_SAFE =
MANIFEST_ATTACKS =
TARGET_HOLDER_ATTACKS =
QUARANTINE_LEAK =
VERDICT = PASS/FAIL/INCONCLUSIVE
READY_FOR_GUARDED_EXECUTION = YES/NO
FILES_CHANGED = 0
DB_ROWS_CHANGED = 0
BLOCKERS =
```

---

## A2 — LCC: R16 IDEMPOTENCY PERSISTENCE

```text
LANE = LCC

OWNED PATHS =
services/api/**
packages/db/**
migrations/** only under MIGRATION_SLOT
LCC-owned tests/evidence/bus

FORBIDDEN PATHS =
apps/**
services/ingest/**
NEW3 governance
FIFTH
CURRENT_PLAN.md

DEPENDENCIES =
NEW3 R16 amendment
current committed HEAD

MUTATION ALLOWED = YES
NETWORK ALLOWED = NO
DB MIGRATION ALLOWED = YES only after MIGRATION_SLOT

Goal:
implement R16 exactly and generically for the six current-v1 mutation classes,
without six ad-hoc per-table idempotency designs.

0. Re-anchor and read exact R16.

1. Inventory existing transaction helpers and all six routes:
annotations
matters
matter events
data requests
verification confirmations
training consent.

Also confirm natural idempotency for matter-authority add and citation-copy.

2. Preferred architecture:
one generic user/matter DB idempotency ledger keyed by:
principal + method + canonical route + Idempotency-Key.

If a generic ledger cannot be made atomic with domain writes:
prove why before using per-table keys.

3. Schema minimum:
key identity
request fingerprint
operation state/result sufficient for deterministic replay
timestamps
appropriate unique constraint.

Do NOT invent pruning/retention policy.
Do NOT store more sensitive response data than needed for replay.

4. Atomicity:
domain mutation + successful idempotency completion must commit atomically.

Lost response after durable commit:
retry same key+fingerprint must not create a second domain mutation.

Concurrent same key:
one logical executor.

Same key/different fingerprint:
409 IDEMPOTENCY_KEY_REUSE_MISMATCH, no domain mutation.

No key:
legacy behavior.

5. Failure-first tests:
lost response retry
concurrent same key
same key/different body
same key/different path param
same key/different operation-significant query
validation failure before mutation
server failure before durable mutation
successful mutation / response lost
two intentional writes with fresh keys
legacy no-key request.

6. Apply to all six R16-required create mutations.

No content-based dedupe.

7. Migration:
acquire MIGRATION_SLOT.
fresh-install schema
upgrade schema
rollback/compatibility evidence according to repo convention.
Do not touch canonical legal-data tables.

8. Run targeted + API neighborhood + typecheck.

FINAL:
HEAD_START =
HEAD_FINAL =
COMMITS =
IDEMPOTENCY_ARCHITECTURE =
MIGRATION =
SIX_ROUTES =
ATOMICITY_PROVEN =
LOST_RESPONSE =
CONCURRENT_DUPLICATE =
MISMATCH_409 =
LEGACY_NO_KEY =
SENSITIVE_RESULT_STORAGE =
RETENTION_POLICY = MUST BE UNSET/EXISTING_VERIFIED_POLICY
TESTS =
TYPECHECK =
RCC_HANDOFF =
NEW3_HANDOFF =
BLOCKERS =
```

---

## A3 — RCC: STORE + CADENCE PRECHECK

```text
LANE = RCC

OWNED PATHS =
apps/**
RCC-owned tests/evidence

FORBIDDEN PATHS =
services/**
packages/db/**
migrations/**
NEW3 governance
CURRENT_PLAN.md

DEPENDENCIES =
RCC ba307f30 or current descendant
NEW3 R16 cadence handoff
current build config

MUTATION ALLOWED = YES within apps/** if a bounded correction is required
NETWORK ALLOWED = only existing build tooling if already authorized; no paid infra
DB MIGRATION ALLOWED = NO

Goal:
remove unsupported operational cadence copy and prove current store submission
toolchain facts before Sprint 4.

1. Re-anchor.

2. Citator copy.
Locate every reachable equivalent of:
"Re-checked every night."

NEW3 says static cadence requires runtime evidence.
Remove/rewrite static promise unless current deployed runtime evidence is actually available.

Do not conflate citator with eCourts monitoring.

Prefer copy derived from actual lastCheckedAt where available.

3. Android submission preflight.
Inspect actual:
Expo SDK
React Native
app config
native Gradle if generated/committed
merged/release targetSdk if build can prove it.

Required ordinary Play submission target as of 1 Sep 2026:
API 36+.

Do not infer compliance from package version alone.

If target < 36:
report STORE_P0_BLOCKER.
Choose the smallest supported framework/config path.
Do not blind-upgrade dependencies in this round unless the upgrade is clearly bounded and testable.

4. Android edge-to-edge.
If project targets Android 16, preserve safe-area/system-navigation behavior already proven on S24.
Do not regress the tab-bar fix.

5. iOS submission preflight.
Inspect actual production EAS/native build config.
Required App Store upload toolchain:
Xcode26+ / iOS26 SDK+.

If current Expo SDK/default EAS image should satisfy it:
still report actual build profile/image evidence.

If not:
STORE_P0_BLOCKER.

6. Billing inventory only.
Do not implement billing.
If any billing dependency already exists, report actual transitive Play Billing version.
PBL7 ordinary submission deadline is past.
Future paid build must use supported PBL8+.

7. Party-search submission state.
Do NOT activate switch here.
Report current iOS default and exact mechanism.
NEW3 later decides release submission state under v7.2 default-off policy.

8. Tests/build.
No vendor that uploads repo code.

FINAL:
HEAD_START =
HEAD_FINAL =
COMMITS =
STATIC_NIGHTLY_COPY_REMOVED =
LAST_CHECKED_AT_COPY =
EXPO_SDK =
ANDROID_TARGET_SDK_RELEASE =
ANDROID_API36_READY =
ANDROID_EDGE_TO_EDGE_REGRESSION =
IOS_BUILD_IMAGE =
XCODE_VERSION =
IOS_SDK =
APPLE_UPLOAD_READY =
BILLING_PRESENT =
PLAY_BILLING_VERSION =
IOS_PARTY_SEARCH_CURRENT_DEFAULT =
TESTS =
TYPECHECK =
BUILD =
PAID_INFRA_CREATED = NO
BLOCKERS =
```

---

## CONTINUOUS — NEW1

Issue only:

`Continue coarse snapshot + incremental queue unchanged. No new scope. Durable report: eligible | embedded/accounted terminal states | remaining | vectors/hour | oldest pending delta age | one-GPU-writer state. Escalate only on durable stall, disk/headroom risk, second writer, snapshot-identity conflict, or when HNSW PRECHECK threshold is reached.`

---

# WAVE B — CONDITIONAL

## B1 — NEW2: GUARDED R23 CANONICAL CORRECTION
### Run only if AUDIT-RO R22 PASS

```text
LANE = NEW2

OWNED PATHS =
services/ingest/**
NEW2 execution/evidence
canonical citation identity rows only through the established correction mutator

FORBIDDEN =
edge apply
aliases
apps
services/api
migrations unless separately authorized

DEPENDENCY:
AUDIT-RO R22 PASS on exact hash.

1. Build NEW execution manifest from independently audited SAFE rows only.
New ID/hash. Do not execute directly from R22 source file.

2. Immediately before write:
run full Mutation Protocol v2 preflight:
population hash
unique IDs
one disposition
expected old values
source hashes
frontier
target holders
no ambiguous/untestable
no drift.

Any mismatch => REFUSE.

3. Acquire appropriate write protection / lease.

4. Mutation:
exact rows only
expected-old-value predicate
transactional where designed
no graph edges.

5. Read back EVERY changed row.
Expected new value exact.

6. Create immutable post-write receipt:
execution population hash
before/after
row count
failed/refused rows
frontier
timestamp
HEAD
source hashes
readback result.

7. Release lock.

8. Do NOT regenerate/apply edges in same transaction/round.

FINAL:
EXECUTION_POPULATION =
PREWRITE_PREFLIGHT =
EXPECTED_ROWS =
UPDATED =
REFUSED =
READBACK =
POSTWRITE_RECEIPT =
CANONICAL_CORRECTION = PASS/HOLD
EDGES_CHANGED = 0
CITATION_BULK_APPLY = HOLD
BLOCKERS =
```

---

## B2 — RCC: CONSUME R16 IDEMPOTENCY
### Run only after LCC implementation commit

```text
LANE = RCC
OWNED PATHS = apps/**
DB MIGRATION ALLOWED = NO

Read exact R16 and LCC handoff.

For the six required current-v1 writes:
generate a fresh opaque UUID-like key at the start of ONE intentional mutation;
reuse the same key across transport retries/lost-response retry;
new intentional mutation gets new key.

Do not derive key from content.
Do not reuse across routes.
Do not create client-side dedupe as legal truth.

Test:
retry
lost response
background/resume
double tap
two intentional same-content writes
409 mismatch
409/contract-approved in-progress
legacy fallback if old server is allowed by contract.

Do not send keys on read-only POST search/lookup unless contract says so.

Run mobile + typecheck + affected physical-device test if mutation flow materially changed.

FINAL:
R16_BACKEND_IN_HEAD =
SIX_WRITES =
KEY_LIFETIME =
RETRY_REUSE =
INTENTIONAL_NEW_KEY =
TESTS =
ANDROID_TARGETED =
NEW3_HANDOFF =
BLOCKERS =
```

---

## B3 — NEW3: LOCAL V1 ACCEPTANCE + R16 RELEASE

```text
LANE = NEW3
OWNED PATHS = NEW3 product/contract/capability/claims artifacts only

Inputs:
RCC auth/coverage physical P0 closure
RCC store/cadence preflight
LCC R16 implementation
RCC R16 client consumption
current capability registry
current screens/routes
latest local device evidence.

1. Verify actual current HEAD ancestry.

2. R16:
backend persistence
six-route coverage
RCC consumption
mismatch/concurrency/lost-response tests
legacy compatibility.
Only then R16_RELEASED = YES.

3. Local current-v1 acceptance:
CURRENT_V1_REQUIRED_SURFACE_COMPLETE
CURRENT_V1_FUNCTIONALLY_COMPLETE
CURRENT_V1_DESIGN_COMPLETE
CURRENT_CAPABILITY_GATING_COMPLETE

Every YES cites named evidence.
Do not call Sprint4 commercial/privacy work current-v1 if previously adjudicated later.

4. Store preflight:
Android API36
Apple Xcode26/iOS26
static cadence removed
party-search release default recorded.

5. If all local prerequisites:
READY_FOR_REMOTE_SPEND_DECISION = YES.

Do NOT authorize spend.
Do NOT create infrastructure.

6. Publish exact remaining RCC/LCC backlog.

FINAL:
R16_RELEASED =
LOCAL_CORE_LOOP_COMPLETE =
CURRENT_V1_REQUIRED_SURFACE_COMPLETE =
CURRENT_V1_FUNCTIONALLY_COMPLETE =
CURRENT_V1_DESIGN_COMPLETE =
CURRENT_CAPABILITY_GATING_COMPLETE =
ANDROID_API36_READY =
APPLE_TOOLCHAIN_READY =
STATIC_CADENCE_CLAIM_CLOSED =
IOS_PARTY_SEARCH_SUBMISSION_DEFAULT =
READY_FOR_REMOTE_SPEND_DECISION =
BLOCKERS =
```

---

# HNSW PRECHECK — AUDIT-RO

Run when NEW1 reports roughly 75–80% durable coarse coverage.

No mutation.

Check:
snapshot schema
explicit writer
immutable active snapshot
model hashes/revision
off-machine model copy if UNKNOWN
build predicate exclusion
integrity tools
disk
halfvec evidence
maintenance memory plan
progress query
one writer.

Output:
HNSW_STATIC_PRECHECK = PASS/HOLD
STATIC_BLOCKERS =

This does NOT set HNSW_BUILD_AUTHORIZED.

FINAL HNSW remains NEW1's full four-state integrity predicate after snapshot completion.

---

# SPRINT 3 REMOTE — AFTER LOCAL ACCEPTANCE + FOUNDER SPEND AUTHORIZATION

## LCC

```text
Stand up remote alpha:
HTTPS API
corpus DB
separate user/matter DB
auth
tenant isolation
rate limit
deletion
observability
backup/restore
DATA_RELEASE manifest
incremental promotion
corpus rollback preserving user/matter
outside-network local Postgres isolation.

Search instrumentation:
pool_wait_ms
per-arm SQL
degraded[]
total
fixed Gate-S1 suite.
No timeout inflation.

Gate C evidence, not production marketing.
```

## RCC

```text
Consume same remote API on mobile + desktop.
Physical phone MUST use mobile data, not Wi-Fi, not adb reverse.
Run Search → Reader → Save → Matter.
Auth expiry/recovery.
Honest poor-network/degraded/currentness states.
```

## NEW3

```text
3–5 practising advocates.
Observed realistic tasks.
Freeze thresholds before larger beta.
Record another-database requirement and research reconstruction/resume friction.
Run 12-condition monitoring decision.
No monitoring claim before Gate C evidence.
```

## NEW2

```text
Continuous acquisition.
After guarded canonical corrections, create NEW citation-edge candidates from corrected truth.
No reuse of old apply population.
New immutable edge population → common-order/source-span/alias/cross-court falsifier
→ false-pin gate → independent pre-apply AUDIT-RO → separate edge apply decision.

Statute resolution follows higher-priority citation work.
```

## FIFTH — Gate C only

Attack:
mobile-data physical phone
desktop same API
outside-network local DB isolation
release/rollback
remote restore
no P0 data/security
frozen beta/monitoring decision
Gate-S1 staging search p95 ≤ 3s with pool-wait evidence and truthful degraded states.

---

# SPRINT 4 POLICY ADDITIONS

Before Gate D prove:
- Android targetSdk 36+ in release;
- App Store build Xcode26+/iOS26 SDK+;
- PBL8+ if paid billing;
- iOS party search OFF by default unless explicit recorded exception;
- account deletion end-to-end;
- current iPhone + representative low/mid Android.

No framework/version-name inference.

---

# POST-GATE-C PRODUCT DECISIONS — NO AUTOMATIC BUILD

`RESEARCH_SESSION_V1`:
promote only if shadow beta shows meaningful repeated/reconstructed research or context loss.

`EVIDENCE_LOCKED_SYNTHESIS_EXPERIMENT`:
run only if advocates consistently leave LawMind for synthesis after correct verified retrieval.

No generic chatbot.
No freehand citation generation.
No public synthesis without claim-to-evidence adversarial evaluation.


---

# AUTHORITY INSTALLATION PROMPT
## Use only if Wave-0 seal reports v7.2 authority missing from repo

```text
LANE = LCC / AUTHORITY_INSTALL

OWNED PATHS =
the repository's canonical roadmap/prompt-doc location only

MUTATION ALLOWED = YES — docs only
NETWORK ALLOWED = NO
DB MIGRATION ALLOWED = NO
BACKGROUND WORKERS TO PRESERVE = ALL

INPUT FILES:
LAWMIND_MASTER_ROADMAP_V7_2.md
LAWMIND_SPRINT_PROMPTS_V3.md
LAWMIND_V7_2_AUTHORITY_MANIFEST.json

1. Verify the supplied files' SHA256 against the manifest BEFORE copying.

2. Locate the repository's canonical authority-doc directory from current
tracked files and historical conventions. Do not invent a second roadmap home.

3. Preserve v7.1/V2 as historical files. Do not delete them.

4. Install v7.2/V3 and the manifest.

5. Update only the minimal authority pointer/index if one exists and is
LCC/docs-owned. Do not rewrite CURRENT_PLAN.

6. GIT_COMMIT lease, re-anchor, exact doc staging, commit.

FINAL:
SOURCE_HASHES =
DESTINATION_PATHS =
TRACKED =
OLD_AUTHORITY_RETAINED =
AUTHORITY_POINTER =
COMMIT =
BLOCKERS =
```

After this commit, rerun Wave-0 seal.

---

# AFTER R23 CANONICAL CORRECTION — CITATION EDGE REGENERATION
## NEW2, separate round; never in the same write transaction as canonical correction

```text
LANE = NEW2

OWNED PATHS =
services/ingest/**
NEW2 citation candidate/evaluation artifacts

FORBIDDEN =
apps/**
services/api/**
packages/db migrations unless handoff
FIFTH
CURRENT_PLAN

DEPENDENCIES =
successful guarded canonical correction receipt
current corrected canonical citation identities

MUTATION ALLOWED =
candidate generation/evidence only
NO edge apply

1. Re-anchor after canonical correction.

2. Generate citation-edge candidates FROM CORRECTED truth.
Do not reuse R17/R19/R20/R21/R22 edge apply populations.

3. Freeze immutable population:
NEW2-EDGE-<hash>

Include:
source judgment
target judgment
raw citation text/span
canonical citation key
resolution path
source artifact/hash
common-order/furniture classification
alias use
writer-path identity
frontier.

4. Apply current common-order/page-furniture guard on BOTH writer paths.

5. If SOURCE_CITATION_SPAN_V1 work is run:
it is a separate strict bounded source-text scanner.
Do NOT change the user exact-query parser.
Preserve raw offsets/context.
UNKNOWN/ambiguous/damaged spans do not become edges.

6. Falsifier:
self-citation
page furniture
common order
connected matters
aliases
cross-court
DB/FB
short orders
foreign precedent
multiple citations
source damage
target-holder ambiguity.

Use self-constructed positives AND negatives.

7. Report:
FALSE_PIN
FALSE_REJECTION
AMBIGUOUS
UNTESTABLE

No bulk edge apply.

FINAL:
EDGE_POPULATION_ID =
EDGE_POPULATION_HASH =
CANDIDATES =
FALSE_PIN =
FALSE_REJECTION =
READY_FOR_INDEPENDENT_PRE_APPLY_AUDIT =
CITATION_BULK_APPLY = HOLD
EDGES_CHANGED = 0
BLOCKERS =
```

---

# INDEPENDENT PRE-APPLY CITATION AUDIT — AUDIT-RO

```text
LANE = AUDIT_RO_CITATION_EDGE
OWNED PATHS = NONE
MUTATION ALLOWED = NO
DB WRITES = NO

Verify exact immutable edge-population hash.

Attack:
self pins
common-order/page-furniture
aliases
ambiguous canonical keys
cross-court keys
target holder
source span
connected matters
negative controls
known true outgoing controls.

PASS requires zero known false canonical pins in the proposed apply population.
Ambiguous/untestable rows must be excluded.

PASS does NOT apply edges.
It only makes a separate NEW2 apply-authorization round possible.

FINAL:
POPULATION_HASH =
ROWS_AUDITED =
FALSE_PIN =
FALSE_REJECTION =
AMBIGUOUS_IN_APPLY =
UNTESTABLE_IN_APPLY =
VERDICT =
READY_FOR_SEPARATE_APPLY_DECISION =
FILES_CHANGED = 0
DB_ROWS_CHANGED = 0
```

---

# STATUTE_LINK_RESOLUTION_V1 — NEW2
## Run after higher-priority citation truth work, unless founder reprioritizes

```text
LANE = NEW2

OWNED PATHS =
services/ingest/**
NEW2 statute-resolution evidence

FORBIDDEN =
apps/**
services/api route behavior
automatic legal applicability
bulk blind approval

Goal:
turn a bounded set of raw/unclassified judgment_statute_refs into
resolver-confirmed relationships with deterministic evidence.

1. Re-anchor and measure current resolution-state census.
Do not carry forward the 905,944/905,853 figures as current without re-query.

2. Define exact relationship vocabulary from current schema.
At minimum distinguish:
raw textual reference
resolver-confirmed cite/reference
chronology-permitted where currently defined
refused
ambiguous/unclassified.

Do NOT introduce "applies", "interprets", "governs", or "good law" without exact
canonical evidence and NEW3 approval.

3. Bounded representative population first.
Stratify:
major current codes
legacy codes
repealed/predecessor acts
sections with high counts
low counts
OCR variants
ambiguous act spellings.

4. Exact identity:
canonical Act
canonical section
source text/span
source artifact/hash
judgment date
commencement/chronology facts.

Predecessor/successor identity is not applicability.

5. Build failure-first resolver/evidence tests.

6. Precision attack before any large apply.
Zero known false linked relationships in the candidate sample.

7. Apply only a separately frozen, independently audited population if a later
round authorizes it.

8. Handoff measured confirmed population to LCC/NEW3.
The public capability remains disabled.

FINAL:
CURRENT_CENSUS =
CANDIDATE_ID =
CONFIRMED =
REFUSED =
AMBIGUOUS =
UNCLASSIFIED =
FALSE_LINK =
CHRONOLOGY_VIOLATION =
PUBLIC_CAPABILITY_ENABLED = NO
BLOCKERS =
```

---

# HNSW FINAL ROUND — NEW1
## Only after PRECHECK PASS + coarse terminal census

```text
LANE = NEW1

OWNED PATHS =
NEW1 embedding/index/evaluation artifacts
existing NEW1 index path

MUTATION ALLOWED = YES only after all entry criteria pass
DB MIGRATION ALLOWED = NO unless LCC separately owns/authorizes
BACKGROUND WORKERS TO PRESERVE = delta queue

Recompute from current snapshot:

SNAPSHOT_HASH_SCHEMA_REPRODUCIBLE
SNAPSHOT_HASH_WRITER_EXPLICIT
ACTIVE_SNAPSHOT_ID_IMMUTABLE
MODEL_LOCAL_FILES_HASHED
MODEL_REVISION
MODEL_FILES_OFF_MACHINE if revision UNKNOWN

Four-state invariant:
eligible =
EMBEDDED
+ CONTENT_HASH_ALREADY_COVERED
+ QUEUED
+ EXPLICITLY_REFUSED

Require:
UNNAMED_RESIDUAL=0
CURRENT_SNAPSHOT_DUPLICATE_IDENTITY=0
INVALID_DIMENSION=0
NONFINITE_VECTOR=0
UNEXPECTED_NONUNIT_VECTOR=0
DELTA_OLDEST_PENDING_AGE within normal observed bound
ONE_GPU_WRITER=yes.

Any fail:
HNSW_BUILD_AUTHORIZED=NO
STOP.

If PASS:
HNSW_BUILD_AUTHORIZED=YES.

Build only the approved coarse halfvec/index form.
Use session-local maintenance_work_mem within measured host headroom.
Do not starve Postgres/OS.
Monitor pg_stat_progress_create_index.
Record build duration/index size.

ANN evaluation:
exact baseline vs ANN
ef_search
recall@10/50/100
warm p50/p95/p99
cold-ish p50/p95/p99
filtered completeness
EXPLAIN
index size.

Public semantic search remains disabled.

FINAL:
ENTRY_CRITERIA =
HNSW_BUILD_AUTHORIZED =
BUILD =
INDEX_SIZE =
ANN_TABLE =
PUBLIC_SEMANTIC_SEARCH = DISABLED
BLOCKERS =
```

---

# REMOTE SPRINT-3 LCC PROMPT — v7.2

```text
LANE = LCC

OWNED PATHS =
services/api/**
packages/db/**
remote deployment/ops paths
migrations under MIGRATION_SLOT
LCC evidence

DEPENDENCIES =
NEW3 READY_FOR_REMOTE_SPEND_DECISION=YES
explicit founder paid-remote authorization
current R16 if released

NETWORK ALLOWED = YES only for authorized remote-alpha work
PAID INFRA = only within explicit founder authorization

Goal:
remote integrated alpha, not production marketing.

1. Re-anchor and record authorized spend/resource ceiling.

2. Remote topology:
HTTPS API
corpus serving DB
separate user/matter DB
auth
tenant isolation
rate limits
structured logs/metrics
backup/restore.

Founder workstation/Postgres must never be public serving plane.

3. Import a signed DATA_RELEASE version.
Corpus release identity explicit.

4. User/matter DB:
R16 idempotency schema
tenant isolation
deletion paths
no corpus rollback coupling.

5. Release:
local validated release
→ staging
→ smoke
→ promotion mechanism.

Prove:
incremental corpus release
rollback to prior corpus version
user/matter writes survive corpus rollback.

6. Security:
outside-network founder/local Postgres unreachable.
No remote DB public exposure beyond intended controlled endpoints.

7. Search observability:
measure before S1 grading:
pool_wait_ms
classification_ms
exact/structured
sparse_sql_ms
dense_ms
fallback_ms
derived_effects_ms
serialization_ms
degraded[]
total_ms.

Do not raise statement_timeout to pass.

Fixed query suite:
exact citation
CNR
case number
filtered lexical
normal research
broad/refused.

Gate-S1 target remains whole-request p95 <= 3s on staging fixed suite.
A timeout/degraded request must identify its real arm/reason.

If an index/migration is proposed:
prove with staging/representative EXPLAIN and known-target usefulness; speed alone
cannot certify search quality.

8. Remote backup restore:
actually restore user/matter DB into isolated target and verify critical counts.

9. No monitoring scheduler claim unless Shape-A prerequisites and NEW3 allow it.

FINAL:
REMOTE_API =
CORPUS_RELEASE =
USER_DB_SEPARATE =
TENANT_ISOLATION =
LOCAL_DB_EXTERNAL_REACHABILITY =
RELEASE_PROOF =
ROLLBACK_PROOF =
REMOTE_RESTORE =
SEARCH_S1 =
POOL_WAIT =
PAID_SPEND =
RCC_HANDOFF =
FIFTH_GATE_C_EVIDENCE =
BLOCKERS =
```

---

# REMOTE SPRINT-3 RCC PROMPT — v7.2

```text
LANE = RCC
OWNED PATHS = apps/**

DEPENDENCIES =
LCC staging/remote API
current NEW3 capability registry
current R16 released contract

Goal:
same remote API on mobile + desktop and physical mobile-data Gate-C proof.

1. Point sanctioned staging profile at remote API.
No direct DB connections.

2. Mobile:
auth
session expiry/recovery
Search
Reader
Save
Matter
Matter edit
honest degraded/currentness/source states.

3. Desktop:
same API and same legal truth.
Research workstation + Matter workspace.

4. Physical Gate-C device:
disable Wi-Fi.
NO adb reverse.
Use cellular/mobile data.
Prove server sees remote request.

Run:
sign in
Search
open Reader/source
save authority
open Matter.

Record timings and route outcomes.

5. iOS party-search:
use current NEW3 platform status.
Do not self-enable.

6. R16 mutation flows:
retry/lost-response semantics remain green remotely.

7. No static operational cadence copy.

FINAL:
REMOTE_API =
MOBILE_DATA =
WIFI_DISABLED =
ADB_REVERSE = MUST BE NONE
SEARCH =
READER =
SAVE =
MATTER =
DESKTOP_SAME_API =
R16_REMOTE =
CRASHES =
GATE_C_REMOTE_EVIDENCE =
BLOCKERS =
```

---

# NEW3 SHADOW-BETA PROMPT — v7.2

```text
LANE = NEW3

OWNED PATHS =
product acceptance/analytics/claims/beta evidence

DEPENDENCIES =
remote alpha usable
current contract/capability registry

Run 3–5 practising advocates on realistic tasks.

For every task record:
task ID
start/end
query reformulations
authority opened
source opened
treatment/currentness checked
saved to matter
task completed
another database used
why another database was used
trust-state confusion
research had to be reconstructed/repeated
user wanted to resume an earlier research trail.

Do not coach users to pass the task.

Set/freeze Research Task Completion baseline.

Monitoring:
evaluate all 12 conditions.
No invented threshold.
Shape A only if all pass.
Otherwise Shape B.

Post-Gate-C decision evidence:
RESEARCH_SESSION_V1 need
EVIDENCE_LOCKED_SYNTHESIS need.

Do not promote either feature merely because competitors have it.

FINAL:
ADVOCATES =
TASKS =
RTC_BASELINE =
ANOTHER_DB_RATE =
RESUME_FRICTION =
TRUST_CONFUSION =
MONITORING_12 =
LAUNCH_SHAPE =
THRESHOLDS_FROZEN =
RESEARCH_SESSION_DECISION_INPUT =
SYNTHESIS_DECISION_INPUT =
```

---

# GATE C — FIFTH v7.2

```text
LANE = FIFTH
MUTATION ALLOWED = NO

FIFTH is invoked only now because this is formal Gate C.

Attack the exact committed remote-alpha state.

0 reproducible integrated HEAD / authority hashes.

1 physical phone on MOBILE DATA talks to remote API and completes
Search → Reader → Save → Matter.

2 desktop uses same remote API/contract.

3 founder/local workstation Postgres is unreachable from outside network.

4 real incremental corpus release + rollback; user/matter data survives.

5 remote user/matter backup restore proof.

6 no P0 data/security issue.

7 beta thresholds frozen and monitoring Shape A/B decision recorded.

8 Search Gate S1:
fixed staging suite p95 <= 3s whole-request;
pool wait measured;
degraded/timeouts named honestly;
no timeout inflation used to pass.

Shallow confirms:
NEW1 HNSW predicate/current state truthful.
NEW2 citation decision matches latest false-pin evidence.
R16 idempotency release truth.

FIFTH outputs PASS/HOLD per check and exact blockers.
Gate receipt produced now and retained.
```

---

# SPRINT 4 — RCC DEVICE / STORE / DELETION PROMPT

```text
LANE = RCC

No major features.

Required physical matrix:
current iPhone
representative low/mid Android
plus existing S24 evidence as high-end Android.

Exercise:
auth/deep links
Search
Reader
Save
Matter
large judgments
text scaling
reduced motion/accessibility
poor network
background/resume
account/settings
account deletion initiation.

Store build:
Android release targetSdk 36+
iOS production build Xcode26+/iOS26 SDK+
billing dependency PBL8+ if billing exists.

iOS party-name search submission default OFF unless current NEW3 decision
explicitly says otherwise.

No PBL7 release.
No policy claim inferred from Expo package name.

FINAL:
IPHONE =
LOW_MID_ANDROID =
S24 =
ACCESSIBILITY =
DELETION_UI =
ANDROID_TARGET_SDK =
IOS_XCODE =
IOS_SDK =
PBL =
IOS_PARTY_SEARCH =
TESTS =
BLOCKERS =
```

---

# SPRINT 4 — LCC COMMERCIAL/RELIABILITY PROMPT

```text
LANE = LCC

No new research feature.

Close:
account deletion backend end-to-end
remote backup/recovery operational checks
real alerting/on-call destination
rate limits/observability
billing backend only if founder chooses paid launch
current R16 retention/privacy implications if policy has been decided.

If free launch:
do not build billing merely to satisfy old plan.

Any operational cadence shown to user must have runtime observation evidence.

FINAL:
DELETION =
BACKUP =
ALERTING =
BILLING_MODE =
R16_RELIABILITY =
BLOCKERS =
```

---

# SPRINT 4 — NEW3 COMMERCIAL / STORE CLAIMS PROMPT

```text
LANE = NEW3

Freeze per-platform public claims from actual capability registry/evidence.

Required:
privacy/terms/counsel-reviewed copy
store source-rights matrix
account deletion description
government-independence/source attribution
iOS party-search submission decision
Android/iOS screenshots only from real current build
free-vs-paid launch decision.

Monitoring claim must be checked LAST and hardest.

No claim that structural_unreviewed statute links are verified.
No static scheduler cadence without runtime evidence.

FINAL:
IOS_CLAIMS =
ANDROID_CLAIMS =
WEB_CLAIMS =
PARTY_SEARCH_IOS =
MONITORING_CLAIMS =
DELETION_COPY =
FREE_OR_PAID =
BLOCKERS =
```

---

# GATE D — v7.2 CHECKLIST

Gate D requires:

1 current iPhone and low/mid Android physical green.
2 no P0/P1 design issue.
3 deletion initiation and backend execution/receipt truth.
4 store packs complete.
5 billing green OR explicit free launch.
6 monitoring claims do not exceed measured capability.
7 platform claims match capability registry.
8 Android targetSdk 36+ release build.
9 App Store build uses Xcode26+/iOS26 SDK+.
10 if billing exists, Play Billing PBL8+.
11 iOS party-name search release state explicitly recorded.
12 no static operational cadence claim lacking runtime evidence.

FIFTH remains FROZEN at Gate D under master policy.
NEW3/LCC/RCC provide normal acceptance evidence.
```

---

# SPRINT 5 — COMPETITOR BENCHMARK + CLOSED BETA

```text
LANE = NEW3 lead, with RCC/LCC support

Use 10–30 practising legal users.

Competitor benchmark:
ordinary licensed/user access only.
No scraping.
Same frozen tasks/queries.

Candidates where legitimately accessible:
SCC
Manupatra
Indian Kanoon
CaseMine
Bharat.Law
Jhana
others only if comparable and licensed.

Do NOT benchmark against vendor marketing claims.

Measure:
correct useful authority
source access
treatment/currentness correctness
false-premise handling
time to usable authority
task completion
another-database need
workflow retention.

Freeze definitions before run.

Post-beta product decisions:
RESEARCH_SESSION_V1 = PROMOTE/DEFER
EVIDENCE_LOCKED_SYNTHESIS_EXPERIMENT = RUN/DEFER

These remain v1.1 unless founder explicitly changes launch scope.
```

---

# GATE E — FIFTH v7.2

Formal independent pre-submission audit.

In addition to existing v7.1 checks, attack:

authority/hash reproducibility
current remote release/rollback/restore
R16 idempotency semantics
store target/build versions
account deletion
per-platform party-search claims
monitoring/cadence claims
citation/currentness/source truth
no stale disabled routes
no unsupported statute-linked claim
no public semantic search
no generic AI/drafting leak
actual beta/benchmark evidence not marketing.

Gate receipt produced at Gate E.
```

---

# SPRINT 6 — CANDIDATE FREEZE / SUBMISSION

```text
17 Oct target candidate freeze.

After freeze:
only P0/store-review fixes.
No new research/data semantics without reopening candidate.

Submit using prepared evidence:
source-rights matrix
government-independence statement
privacy/delete flow
test credentials
per-platform capability claims
current build-policy versions.

Target launch 23 Oct.
Buffer through 30 Oct.

If mobile review delays:
web/desktop may launch only if web capability rows are independently enabled and
Gate E evidence covers that platform.
```
