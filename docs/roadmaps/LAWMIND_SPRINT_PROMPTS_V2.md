# LAWMIND — SPRINT PROMPTS v2
## Every agent, every sprint, with gate tests

**Companion to:** `LAWMIND_MASTER_ROADMAP_V7_1.md`
**Supersedes:** `LAWMIND_SPRINT_PROMPTS.md`
**Prepared:** 30 August 2026

---

# HOW TO USE THIS DOCUMENT

1. Read the sprint's **staffing table** — who is ACTIVE, CONTINUOUS, FROZEN, and why.
2. Full prompt to every **ACTIVE** agent.
3. **One-line continuation only** to every **CONTINUOUS** agent. A full prompt asks for new work, and a lane asked for new work will find some — that is how an embedding lane becomes a research lane.
4. Nothing to **FROZEN** agents.
5. Run the **gate test** at the end. The gate advances the sprint; dates are targets.

**Sprint 2 has a mandatory Day-0 prompt that runs before everything else.**

## Shared preamble — prepend to every ACTIVE prompt

```
OPERATING RULES

Leases and concurrency: use the existing atomic HEAVY_BOX, GIT_COMMIT and
MIGRATION_SLOT mechanisms. Stage/commit exact owned paths only; never sweep
another lane's staged work. If another lane owns a resource, coordinate rather
than bypass. Exactly one GPU writer exists at any time. One owner per logical
job. No fake RUNNING state.

Evidence: every number comes from a query or command you actually ran — show it.
UNKNOWN stays UNKNOWN. If a number contradicts a project doc, report BOTH and
label CONFLICT; never reconcile silently. Never relabel one snapshot as another.

Progress: long jobs report durable output every 15 minutes. Durable rows or files
are the only proof of progress; CPU and GPU activity are not.

Stop rule: three failed attempts at one issue → STOP. Report what was tried, the
actual outputs, your best hypothesis, and what would break the tie. Never a
fourth blind attempt. Do NOT re-test a hypothesis another lane has already
falsified unless new evidence directly revives it.

Settled: eCourts and Supreme Court authorization are SATISFIED and not reopened.
CAPTCHA_OPERATIONAL_BASIS = RETRACTED_AS_INVENTED_REQUIREMENT. Do not downgrade
to UNKNOWN, broaden scope, raise ceilings, bypass attribution or the audited
guard, or print confidential grant text. Permission existence and runtime quota
enforcement are different questions.

Claims: never assert a capability the v1 capability registry does not mark
ENABLED for that platform.
```

---

# SPRINT 2 — SEAL, CLOSE BACKEND GAPS, START THE CLIENT
**30 August – 4 September · Gate B target 4 September**

## Staffing

| Agent | State | Why |
|---|---|---|
| **LCC** | **ACTIVE** | Owns the seal, both reproducibility debts, eCourts, both search gaps, backup, hosting. Overloaded — see the must-land / may-slip split. |
| **RCC** | **ACTIVE — starts** | Contract frozen; NEW3 recommends starting. Holding costs calendar for nothing. |
| **NEW3** | **ACTIVE — light** | Change control, trust contracts, acceptance **delta** (not a full repeat). |
| **NEW1** | CONTINUOUS | Coarse walk healthy. Re-prompting invites a retrieval-research detour. |
| **NEW2** | CONTINUOUS | Ingestion automated and verified; citation bulk is HOLD, so no new scope. |
| **FIFTH** | FROZEN | Gate policy. Gate B re-verifies the Day-0 seal independently. |

## Continuation lines (issue exactly these)

**NEW1:** `Continue the coarse walk and incremental queue unchanged. No new scope. Report one line daily: snapshot eligible | embedded | remaining | vectors/hour | oldest pending delta age. Escalate only on a stall-kill trigger, disk-headroom risk, or a second GPU writer appearing. LCC will coordinate a snapshot_hash schema/writer fix with you over the bus — do not surrender the GPU lock and do not pause the walk for it.`

**NEW2:** `Continue HC/SCI ingestion and the daily delta unchanged. No new scope; citation bulk apply remains HOLD. Report one line daily: new judgments | newest upstream vs local decision date per source | accounted % and actually-held % | any clustered source failure. Escalate only on a clustered failure pattern, an unexpected publisher rewrite, or a daily-delta job that stops firing.`

---

## PROMPT — DAY-0 INTEGRATION SEAL (LCC) — run before all other Sprint-2 prompts

```
[shared preamble]

You are LCC. SPRINT-2 DAY-0 INTEGRATION SEAL. This is NOT a feature round.

Read: LAWMIND_MASTER_ROADMAP_V7_1.md · LAWMIND_SPRINT_PROMPTS_V2.md · current git
HEAD/worktree · lane leases · migration journal and live schema.

Latest completed lane commits that must be accounted for:
  LCC R11  = 6b90f98
  NEW1 R11 = edac0de
  NEW3 R12 = 831c6c2
Do not assume current HEAD equals any of them.

1. COMMIT ANCESTRY
For each, prove: ANCESTOR_OF_HEAD / HEAD / NOT_IN_HEAD / SUPERSEDED_BY_<commit>.
Do not infer from filenames.
If any completed product work is NOT in HEAD: STOP. Do not silently cherry-pick.
Report the exact missing commit and its changed paths.

2. WORKTREE / LEASE TRUTH
Inventory staged paths · tracked modifications · untracked product paths ·
GIT_COMMIT owner · MIGRATION_SLOT owner · HEAVY_BOX owner · NEW1 GPU lock owner.
Clear stale leases only through the existing safe mechanisms, and only after
proving the owning process or logical worker is dead.
NEW1's GPU worker stays untouched if durable progress proves it alive.

3. CORRECT STALE eCOURTS DOCUMENTATION
These artifacts still assert the retracted CAPTCHA blocker: FOUNDER_QUEUE.md
FQ-ECOURTS-CAPTCHA · the CURRENT_PLAN.md R11 entry ·
docs/ai/lcc-r11/LCC_R11_ECOURTS_CONTINUATION.md · bus messages 1521–1525.
Do not delete history. Append the canonical correction:
  CAPTCHA_OPERATIONAL_BASIS = RETRACTED_AS_INVENTED_REQUIREMENT
The settled conditions are only those in the canonical authorization record.
Do not broaden authorization; do not print confidential grant text.

4. RECONCILE THE TWO "M0" SNAPSHOTS
docs/ai/lcc-r11/m0-identity-receipt.json claims upstreamUnique = 18,947,807.
The authoritative NEW2/FIFTH Gate-A M0 was upstreamUnique = 18,951,606,
manifestSha = a72d98686d4d8a01006cb748a228126c4c781cd285c95745b95c25eeb5e5ac50.
Prove which snapshot the receipt actually binds to. NEVER relabel one snapshot
as another.
If it is the earlier snapshot: reclassify it as PRE_GATE_SNAPSHOT evidence, and
create the smallest durable receipt for the actual authoritative Gate-A M0 if the
required source manifest material still exists. If it does not, state exactly
which parts are no longer reproducible — an honest irreproducibility is the
correct outcome, a reconstructed receipt is not.
The authoritative receipt records: observedAt · manifest SHA · upstreamUnique ·
partition count · definition version/SHA · canonical identity-set digest ·
parity artifact SHA · freshness generation SHA · source bytes retained yes/no.

5. MIGRATION / HEAD TRUTH
Verify committed migrations · applied migrations · hashes · fresh-install schema.
Do not accept applied-only migration state.
Report NEW1's snapshot_hash status only — do NOT fix it in this preflight.

FINAL
HEAD = · LCC_R11_IN_HEAD = · NEW1_R11_IN_HEAD = · NEW3_R12_IN_HEAD =
STALE_LEASES = · UNKNOWN_PRODUCT_DIRT =
CAPTCHA_BLOCKER_RETRACTION = PASS/HOLD
PRE_GATE_RECEIPT = · AUTHORITATIVE_GATE_A_M0_RECEIPT =
AUTHORITATIVE_M0_UPSTREAM_UNIQUE = · AUTHORITATIVE_M0_MANIFEST_SHA =
M0_RECEIPT_TRUTH = PASS/HOLD
MIGRATION_HEAD_TRUTH = PASS/HOLD
SNAPSHOT_HASH_DURABILITY_STATE =
BLOCKERS =
```

---

## PROMPT — LCC — Sprint 2 backend closure

```
[shared preamble]

You are LCC. SPRINT 2 BACKEND CLOSURE. The Day-0 seal must already PASS.

Priority order — do not reorder because something is more interesting:
  P0 reproducibility / schema truth
  P1 get ecourts_observation from 0 to >= 1
  P2 the two measured search gaps
  P3 backup and restore
  P4 hosting selection

CAPACITY: this list exceeds five days. If you fall behind, cut from
"may slip" — never from P0 or backup.
  MUST land by Gate B: Day-0 seal · snapshot_hash durability · model files hashed
    and protected · backup WITH restore proof · eCourts browser diff + the one
    bounded experiment with an outcome either way · sparse admission incl. the
    quality slice · party routing + kill switch · hosting selection.
  MAY slip to Sprint 3: eCourts retention probe · daily pilot · trust-state
    contract exercise (shareable with NEW3) · model revision RECOVERY as distinct
    from hashing and protecting the files.

============================================================
1. EMBEDDING SNAPSHOT-HASH DURABILITY — BEFORE HNSW
============================================================
NEW1 found: new1_doc_vector_stage.snapshot_hash exists live; introduced through
hand-applied/default state; no committed migration reproduces it; the writer does
not explicitly bind every inserted row to the active snapshot; a future snapshot
can be silently mislabelled; the final HNSW predicate depends on this field.

Fix the durability defect WITHOUT stopping NEW1's coarse walk. Requirements:
A. committed schema/migration representation exists
B. fresh install gets the required column/type/index support
C. current live rows are not rewritten unnecessarily
D. future writes receive snapshot identity EXPLICITLY from the active manifest,
   never from a permanent constant default
E. the writer refuses or alerts on missing/unknown snapshot identity
F. delta writes carry correct snapshot/version semantics
G. tests prove snapshot A cannot be silently stamped as snapshot B
H. the final HNSW predicate is generatable from a named immutable snapshot identity

Coordinate with NEW1 over the bus. Do NOT take the GPU lock. Use MIGRATION_SLOT
if required.

============================================================
2. EMBEDDING MODEL REPRODUCIBILITY
============================================================
The upstream model revision is UNKNOWN — the fetch path used an unpinned
resolve/main reference. DO NOT retrain or re-embed.

Attempt recovery of the exact upstream revision from existing cache metadata,
retained HTTP metadata, repository state, or local model metadata.
If recoverable: record it and verify the local files hash to that identity.
If not: UNKNOWN remains UNKNOWN.

Either way: hash the local files NOW so the artifact identity is pinned even when
the revision is not, and classify the current local weights/tokenizer/config as
REPRODUCIBILITY_CRITICAL until a bit-identical remote source is proven. Do not
delete or replace them.

Before treating them as the protected canonical copy, confirm in one line that
the model licence permits retention in a private encrypted backup.

============================================================
3. eCOURTS — CONTINUE FROM R11 EVIDENCE, DO NOT REPEAT IT
============================================================
Current state: authorization SATISFIED · attribution configured · harvest switch
ON · raw capture working · 36 successful retained raw responses ·
ecourts_observation = 0 · parser FIXTURE_BOUND · fillDistrict returns Invalid
Request · cookie/session captured · rotating app_token handled · ajax_req present
· known custom ajax headers reproduced · request ordering already investigated ·
CAPTCHA_OPERATIONAL_BASIS retracted.
Current best hypothesis: request fingerprint / User-Agent / attribution transport.

DO NOT spend live requests retesting the falsified cookie/token/header/ordering
hypotheses unless new evidence directly revives them.

3A. BROWSER-PARITY DIFF — BEFORE ANY NEW LIVE REQUEST
Reconstruct the official browser request path from retained official JS/assets.
Produce a STRUCTURED DIFF of our request vs a genuine browser request at the
wire-contract level: method · URL/path · query · form field names · form encoding
· field ordering if relevant · cookies · Referer · Origin · Accept ·
Accept-Language · Content-Type · X-Requested-With · custom application headers ·
User-Agent · app_token lifecycle · session lifecycle.
Do not guess that a difference matters — diff it. Prefer a retained or manual
browser HAR or equivalent request evidence if available.

3B. ATTRIBUTION TRANSPORT — ONE BOUNDED EXPERIMENT
Read the canonical authorization record. If it specifies WHERE attribution must
be transported, obey exactly. If it requires attribution on every request but
does not prescribe the User-Agent, you may run ONE falsifiable experiment using:
  - a conventional standards-valid browser User-Agent
  - the required LawMind attribution in a dedicated ASCII-safe request header
  - the attribution value also bound into the fetch ledger / audit identity
The request is compliant only if attribution is still transmitted on the wire.
Do not remove attribution. Do not conceal the client. Do not broaden
authorization. Prove both headers are representable as legal HTTP header bytes
before sending.

COMPLIANCE FRAMING — do this, it matters more than the experiment: record the
rationale in the ledger and alongside the authorization record, so a later
registrar audit shows attribution was transmitted on every request and the
User-Agent change was a technical compatibility measure, not evasion.

Hypothesis: the custom attribution-as-User-Agent fingerprint causes the
fillDistrict rejection.
Refutation: an otherwise browser-equivalent request returns the same Invalid
Request. ONE request tests this.
On failure: STOP the fillDistrict branch. Publish the browser diff, the exact
result, and the next piece of evidence needed. No fifth or sixth blind attempt.
On success: immediately capture the real fixture (3C), then STOP live requests.

3C. FIXTURE DEFINITION
A session page, CAPTCHA image or lookup metadata is NOT a cause-list fixture.
REAL_CAUSE_LIST_FIXTURE = a retained authorized response containing the actual
cause-list result representation, OR a successful empty-result response whose
semantics are unambiguous from the application's returned status.
Once obtained: no more live network requests for parser development.

3D. PARSER / OBSERVATION
Offline, against the real fixture. Require: raw artifact linkage · source key ·
court/bench/establishment · list date · list type · case/CNR/case number where
present · item/serial · judge/court designation where present · party/advocate
only where returned · purpose/stage where returned · parser version · observedAt
· source uncertainty.
NEVER document-wide match "Record not found". Interpret result state only from
the actual result container/status the application returns.
CAPTCHA rejection != empty cause list. HTTP 200 != successful observation.
PARSE_EMPTY != NO_CASES unless the returned semantic state proves it.
Raw response reprocessing must be idempotent.
The official interface warns a displayed cause list may differ from the actual
list — preserve that uncertainty in the observation model.

3E. CANARY → RETENTION → PILOT
Canary PASS requires: real network request · raw artifact · successful parser
result · >= 1 append-only ecourts_observation · raw→observation trace · zero
unattributed requests.
Only then the bounded retention probe: T, T-1, T-7, T-30, T-90, T-365. Only
successful interpretable responses inform classification.
Only then register the daily pilot.

============================================================
4. SPARSE SEARCH — PERFORMANCE **AND** QUALITY (fixes AB-2)
============================================================
Filters must narrow the admission population BEFORE sparse-frequency refusal.
Test "bail", "anticipatory bail", "quashing FIR" plus the existing ~30-query
suite. For every query record: filter shape · pre-filter population · post-filter
population · candidate population · admitted/refused · p50/p95 ·
known-target present@10 · known-target present@50.
Where no known target exists, mark QUALITY_UNLABELED — do not invent relevance.
Add a small previously-adjudicated relevance slice so this cannot PASS merely by
returning results quickly.
Unfiltered broad queries may still refuse, but must return actionable narrowing
dimensions derived from REAL available filters.
If existing PostgreSQL ranking satisfies usefulness AND latency: close the
ParadeDB spike.

============================================================
5. PARTY-NAME ROUTING + PLATFORM KILL SWITCH (fixes AB-1)
============================================================
Party-name queries return CASE results only. No person profile, no
court-history-of-person endpoint, no cross-case individual dossier, no
aggregation by individual.
Add: an API contract test · a repository-wide route check · a platform capability
flag allowing party-name search to be disabled on iOS WITHOUT disabling exact
case/CNR/citation research.
Reason: case-first design mitigates App Review risk but does not guarantee
acceptance — Apple 5.1.1(viii) broadly covers apps compiling personal information
from even public databases.
When the switch is active, party search must DEGRADE VISIBLY to case-number /
citation / CNR search with a clear message — never silently vanish.
Do not weaken Android or web merely because the switch exists.

============================================================
6. TRUST-STATE CONTRACT GAPS
============================================================
Ensure the contract can represent and tests exercise:
citation: VERIFIED · UNVERIFIED · FAILED_CHECK · AMBIGUOUS · NO_CITATION
body/source: SOURCE_AVAILABLE · SOURCE_LINK_ONLY · EVIDENCE_WITHHELD ·
  IMAGE_ONLY · SOURCE_UNAVAILABLE
graph: coverage.declaredPartial = true, or equivalent explicit partial-coverage
judgment: sourceId · sourceEdition · authorization/provenance basis where
  product-safe · freshness/currentness fields
Do not fabricate live examples — use isolated fixtures for states not naturally
present. RCC receives the same states through the frozen/versioned contract.

============================================================
7. OFF-MACHINE BACKUP — GATE-B BLOCKER, YOU OWN EXECUTION
============================================================
Measure the irreplaceable set. Include at minimum: eCourts raw artifacts + fetch
ledger · citation resolution state · statute chronology/correction decisions ·
canonical identity decisions · source manifests · ingest ledgers · provenance ·
migrations/schema · eval/gold sets · worklists/checkpoints · recent official
source evidence · AND the current local embedding model weights/tokenizer/config,
because the revision is unpinned.
Do NOT include the HC/SC bulk corpus merely because it is large, or vectors
merely because they are expensive.
Encrypted off-machine copy → restore into scratch → verify file checksums,
schema, critical row counts, MODEL FILE HASHES, elapsed restore time.
A successful upload without a restore = HOLD.

============================================================
8. SERVING BAKEOFF — only after 1–7 PASS or are stopped by their bounded rule
============================================================
Measure the real v1 export footprint (remote v1 excludes dense vectors and HNSW).
Per serious candidate record: configuration · region · monthly compute · storage ·
backup/PITR · egress · measured India p50/p95 RTT · measured storage throughput ·
restore characteristics · support · operational complexity.
Do not compare unlike machine classes without stating the difference. Choose only
from measured configurations.

FINAL
HEAD = · SNAPSHOT_HASH_DURABILITY = PASS/HOLD
MODEL_REVISION = · MODEL_FILES_HASHED = · MODEL_WEIGHTS_PROTECTED = PASS/HOLD
ECOURTS_BROWSER_DIFF = · ECOURTS_ATTRIBUTION_TRANSPORT = · FILLDISTRICT_RESULT =
REAL_CAUSE_LIST_FIXTURE = · ECOURTS_OBSERVATION_COUNT = · RETENTION = · DAILY_PILOT =
SPARSE_ADMISSION = · SPARSE_QUALITY = · PARADEDB_STATUS = CLOSED/OPEN
PARTY_ROUTING = · IOS_PARTY_SEARCH_KILL_SWITCH = · TRUST_STATE_CONTRACT =
OFFSITE_BACKUP = · OFFSITE_RESTORE =
SERVING_EXPORT_SIZE = · HOSTING_SELECTION =
TESTS = · BLOCKERS =
```

---

## PROMPT — RCC — Sprint 2 (start)

```
[shared preamble]

You are RCC, canonical owner of apps/**. NEW3 has frozen the v1 capability
registry and the API contract. You start now.

1. FOUNDATION, IN THIS ORDER
Project setup against the frozen contract → auth → Search → Judgment Reader.
Search and Reader first: they are the core loop and the hardest to retrofit.
Saved Authorities and Matters follow in Sprint 3.

2. BUILD ONLY WHAT THE REGISTRY MARKS ENABLED, PER PLATFORM
A capability marked DISABLED or DISABLED_NOT_READY must not be visible, teased,
stubbed or navigable. Monitoring is DISABLED_NOT_READY — build no monitoring
surface. The launch shape is decided 8 September.
Party-name search carries a PLATFORM capability flag: design the iOS-disabled
path now, as a visible degrade to case-number / citation / CNR search with a
clear message. Never a silently missing feature.

3. THE READER IS THE PRODUCT
Typography and measure tuned for sustained reading, tested with a REAL long
judgment, not placeholder text. Virtualise by paragraph so a very large judgment
does not stall. Within-judgment search, deep-linkable paragraphs, citation and
statute highlights only where the backend marks them reliable, original-source
action.

4. HONEST STATES ARE FIRST-CLASS SCREENS
Build degraded, empty, unknown, stale, evidence-withheld, image-only and
could-not-observe states with the same care as the happy path. "Query too broad
to rank" offers tappable refinements and never implies no law exists. Unverified
and failed-check citations must be visibly distinguishable from verified.
Partial citation-graph coverage must be visibly partial. Coordinate exact shapes
with LCC's sparse-admission and trust-state work.

5. PARTY SEARCH IS CASE-FIRST
Results are cases, never people. No person profile, no "court history of X", no
dossier aggregation. Apple review guardrail as well as product rule.

6. CONTRACT GAPS — USE THE PROCESS
File CONTRACT_CHANGE_REQUEST on the bus: endpoint · what is missing · what you
will do without it · severity. NEW3 decides AMEND / DEFER / REJECT-with-
alternative. The frozen version stays the reference until an increment lands.
Never invent an endpoint or assume a response shape.

7. BILLING FLOOR (record now, implement Sprint 4)
Target Play Billing Library 8+ via RevenueCat's current supported integration.
PBL 7's new-app/update deadline is 31 Aug 2026; PBL 8 is supported to 31 Aug
2027. Never ship a PBL 7 build. Verify the deprecation table in Play Console
before writing billing code.

DO NOT: invent capabilities, soften an honest state for a screenshot, build
monitoring UI, or start store assets this sprint.

FINAL: what builds and runs today screen by screen · contract gaps filed with
severity · reader performance on a real long judgment · honest-state inventory ·
iOS party-search degrade path · blockers.
```

---

## PROMPT — NEW3 — Sprint 2 (light)

```
[shared preamble]

You are NEW3, light round. Do NOT rerun the full ten-matter acceptance — it
already established the baseline and found AB-1 and AB-2.

1. CONTRACT CHANGE CONTROL — stand it up now
You own every amendment to the frozen contract. Publish the process: RCC files
CONTRACT_CHANGE_REQUEST (endpoint · what is missing · what RCC does without it ·
severity) → you decide AMEND / DEFER / REJECT-with-alternative → on AMEND the
version increments and LCC implements. Never amend silently; never let RCC
self-serve.

2. ACCEPTANCE DELTA, NOT FULL REPEAT
The baseline exists and found AB-1 (party-name routing) and AB-2 (filters not
applied before sparse admission). Do not rerun unaffected cases.
After LCC fixes each gap: rerun the directly affected acceptance cases · rerun
one exact-citation positive control · rerun the Search → Reader → Save → Matter
core loop. Any new regression is a blocker.
Also validate the newly explicit trust states:
  - partial citation graph is visibly partial
  - unverified/failed citation is distinguishable from verified
  - source-link-only is distinguishable from retained evidence
  - image-only cannot appear as full-text evidence

3. PER-PLATFORM CAPABILITY REGISTRY AND CLAIMS REGISTER
Because party-name search can be disabled on iOS, capabilities and claims are now
PER PLATFORM. No store listing may claim a capability disabled on that platform.
Banned without current evidence anywhere: "live" · "every case" · "every citation
verified" · "good law" · Hindi · court counts · broad AI claims · district
coverage · unmeasured competitor comparisons · uniqueness claims about access or
architecture.

4. TWO LAUNCH SHAPES — write both now
Shape A (research + monitoring) and Shape B (research only). For each: what
ships · what premium is · what the website says · what the store copy says. The
founder decides 8 September against the twelve conditions in roadmap §5.3.1.
Writing both now removes the temptation to ship an unsupported monitoring claim
in October.

5. CORRECTION WORKFLOW SPEC
SUBMITTED → TRIAGED → PRIMARY_SOURCE_VERIFIED → APPROVED → RELEASED →
REPORTER_NOTIFIED. Hard rule: user evidence never directly mutates canonical
legal data; attachments and user text are untrusted input.
Metrics: validated submissions per 1k active users · % backed by primary source ·
median verification time · median correction-to-release time · repeat error rate
· corrections by source/parser class. NOT "corrections accepted per week" — that
rewards having more errors.

6. ANALYTICS EVENT SCHEMA
Events behind activation · first-search success · searches/user · saves/search ·
matters/user · monitored matters · alert engagement · D7/D30. Privacy-safe: no
judgment text and no matter content in payloads.

7. RESEARCH TASK SET
Begin the 50 curated realistic advocate research tasks. Do NOT choose a success
threshold — the Sprint-3 shadow beta sets the baseline and you freeze the number
by 18 September.

DO NOT: write client code, change lane ownership, reopen settled authorization,
or promise a capability the registry marks DISABLED.

FINAL: change-control process · acceptance delta results · trust-state validation
· per-platform registry and claims register · both launch shapes · correction spec
· event schema · task-set progress · blockers.
```

---

## FOUNDER — SPRINT 2 EXTERNAL / TRACK-C CHECKLIST

No engineering prompt can complete these.

```
By Gate B:

OFFSITE_BACKUP
- choose destination; approve spend; ensure LCC can upload and restore
- do NOT call it complete until restore proof exists

PLAY
- organization developer account
- D-U-N-S submitted / verified (issuance may take up to 30 days)
- inspect the ACTUAL production-access state in Play Console after verification;
  do not assume prior obligations disappeared

COUNSEL — one session covering:
- criminal-code transition rules
- SCR retain/index/display/train
- Rule 36 / named testimonials
- government-information store wording
- Apple public-database / party-search risk

DEVICES
- current physical iPhone available
- representative low/mid Android available

ECOURTS
No new authorization decision required. Intervene only if the canonical
authorization record genuinely needs a transport decision that cannot be answered
from its text.

SUPREME COURT
The canonical permission record must be internally consistent and usable in the
source-rights matrix without exposing confidential terms publicly.

OUTPUT
OFFSITE_DESTINATION = · RESTORE_PROOF =
PLAY_ORG = · DUNS = · PLAY_PRODUCTION_ACCESS_STATE =
COUNSEL_DATE = · COUNSEL_RESULT =
IPHONE = · ANDROID =
EXTERNAL_BLOCKERS =
```

---

## GATE B TEST — 4 September (FIFTH)

```
[shared preamble]

You are FIFTH. Gate B verdict. Ten checks. No architecture commentary, no
improvement suggestions.

0. REPRODUCIBLE HEAD
   All expected Sprint-2 commits are ancestors of HEAD · committed migrations =
   applied migrations · no applied-only schema · fresh-install schema equivalent ·
   no unresolved product-code dirt affecting audited behavior · the M0 receipt
   question is resolved without relabelling.

1. API CONTRACT — frozen, versioned, amendment process operational.

2. CAPABILITY REGISTRY — no ENABLED capability without named evidence, per
   platform.

3. ACCEPTANCE — no outstanding P0. Do NOT rerun the entire old ten-matter suite
   unless affected code changed; re-run affected workflows plus one core-loop
   smoke.

4. FIRM-READY OWNERSHIP — Workspace ownership frozen.

5. HOSTING — selected from comparable measured configurations.

6. OFF-MACHINE RESTORE — an ACTUAL restore PASS, including the current embedding
   model artifacts while their upstream revision remains unpinned. Upload without
   restore = HOLD.

7. eCOURTS — report the exact ecourts_observation count. PASS if either:
   A. observation >= 1 with a traceable raw → parser → observation path, OR
   B. observation = 0 AND the bounded diagnostic stop rule was actually
      exhausted, every attempted hypothesis and raw result is published, the
      current blocker is named, monitoring remains DISABLED_NOT_READY, and no
      unsupported monitoring claim exists anywhere.
   "0 because work was not attempted" = HOLD.

8. SPARSE ADMISSION — filtered broad queries are both fast enough AND
   demonstrably useful on the fixed known-target/relevance suite.

9. PARTY SEARCH — case-first test PASS · no person-centric endpoint · platform
   kill switch exists · iOS degrade path defined.

10. EMBEDDING SNAPSHOT DURABILITY — explicit snapshot-identity writer plus
    reproducible schema PASS. This does NOT require coarse completion or HNSW.

Verdict: PASS or HOLD with exact blockers only.
```

---

# SPRINT 3 — REMOTE INTEGRATED ALPHA
**5–18 September · Gate C target 18 September**

## Staffing

| Agent | State | Why |
|---|---|---|
| LCC | **ACTIVE** | Remote serving is the sprint. |
| RCC | **ACTIVE** | Client on staging; core loop on a physical phone. |
| NEW1 | **ACTIVE** | Snapshot integrity, first HNSW build, ANN evaluation — judgment work. **Entry criteria below must all pass first.** |
| NEW2 | **ACTIVE** | Citation falsifier fix + bounded statute-freshness measurement. |
| NEW3 | ACTIVE (part) | Shadow beta, thresholds, monitoring shape. |
| FIFTH | **GATE C** | Security exposure, release/rollback, data parity — a genuine audit moment. |

## NEW1 SPRINT-3 ENTRY CRITERIA — all must pass before ACTIVE

```
SNAPSHOT_HASH_SCHEMA_REPRODUCIBLE = yes
SNAPSHOT_HASH_WRITER_EXPLICIT     = yes
ACTIVE_SNAPSHOT_ID_IMMUTABLE      = yes

MODEL_LOCAL_FILES_HASHED          = yes
MODEL_REVISION                    = pinned commit OR explicitly UNKNOWN
MODEL_FILES_OFF_MACHINE           = yes if revision remains UNKNOWN

ELIGIBLE_FOUR_STATE_IDENTITY:
  eligible = embedded + content_hash_already_covered + queued + explicitly_refused
UNNAMED_RESIDUAL                  = 0
CURRENT_SNAPSHOT_DUPLICATE_IDENTITY = 0
INVALID_DIMENSION                 = 0
NONFINITE_VECTOR                  = 0
UNEXPECTED_NONUNIT_VECTOR         = 0

DELTA_OLDEST_PENDING_AGE          within normal observed bound
ONE_GPU_WRITER                    = yes

Only then: HNSW_BUILD_AUTHORIZED = yes
```

## PROMPT — NEW1 — Sprint 3

```
[shared preamble]

You are NEW1, returning to ACTIVE. Do not start any index build until every
Sprint-3 entry criterion above passes. One heavy GPU owner at a time; state your
ordering before starting.

1. COMPLETE THE COARSE SNAPSHOT (target 7–9 Sep)
Run to CAUGHT_UP_TO_SNAPSHOT=<id>. Four terminal states only: EMBEDDED,
CONTENT_HASH_ALREADY_COVERED, QUEUED, EXPLICITLY_REFUSED. Rows that fit none of
these are the finding, not a rounding error.

2. INCREMENTAL QUEUE STAYS ALIVE
Fairness if delta latency grows: finish current coarse batch → drain delta
backlog → resume coarse. Never a second GPU writer.

3. SNAPSHOT INTEGRITY REVIEW (9–11 Sep) — before any index
Zero unexplained eligible gaps · zero current-snapshot duplicate identity · valid
dimensions · no non-finite vectors · no unexpected non-unit vectors ·
model/tokenizer/text-selection identity recorded · old snapshot and orphan rows
excluded BY PREDICATE (the build predicate must provably exclude them, derived
from the named immutable snapshot identity LCC delivered) · disk headroom
confirmed. Publish the checklist with evidence per line. Any failure stops the
build.

4. HNSW BUILD (9–11 Sep, only after 3 passes)
Choose halfvec vs fp32 from existing probe measurements — no new bakeoff.
Extrapolate build time from a measured probe build rate before committing.
Session-local memory settings only, chosen from measured host headroom; treat the
current global maintenance_work_mem as UNMEASURED for this build and do not
exhaust host memory. Use index-build progress reporting.

5. ANN VS EXACT EVALUATION (10–12 Sep)
Publish a table with: ef_search · recall@10 · recall@50 · recall@100 · p50/p95/p99
WARM · p50/p95/p99 COLD-ISH · filtered result completeness · index size · EXPLAIN
plan.
Cold behaviour is required, not optional: a ~19–21 GB index on a ~32 GB host
behaves very differently after cache eviction, and a warm-only table would
certify performance the product will not see.
PUBLIC SEMANTIC SEARCH STAYS DISABLED EVEN IF HNSW IS EXCELLENT.

6. PASSAGES — Tranche V2 stays frozen. No new tranche. No "GPU is idle" logic.

FINAL: snapshot ID and four-state counts · integrity checklist with evidence ·
HNSW decision, projected vs actual build time · ANN table warm and cold ·
blockers.
```

## PROMPT — NEW2 — Sprint 3

```
[shared preamble]

You are NEW2, returning to ACTIVE. Two bounded pieces of work.

1–4. CITATION: EARN THE RIGHT TO LIFT THE HOLD
Root cause in one sentence before any fix. Address the self-citation failure
class and add write-time population/frontier verification so an advancing index
cannot invalidate the evidence vouching for it.
Then sign a NEW immutable apply population, frozen and hashed, with the evidence
referencing that hash.
Then a bounded precision attack (10–12 Sep): construct positives AND negatives
yourself. Deterministic exact citation/identity evidence only. Party/date/court
similarity may corroborate or disambiguate an existing citation identity but must
NEVER by itself create a resolved edge. A too-good-looking safe rate is a finding
to sample, not a win.
Bulk apply proceeds ONLY if the false-pin gate passes. If it does not, apply
stays held and you say so plainly. The goal is not maximum edge count.

5. CONTINUOUS WORK CONTINUES
HC/SCI ingestion, daily delta, provenance on every new row, freshness object
unchanged. Report accounted % and actually-held % separately.

6. STATUTE FRESHNESS — BOUNDED MEASUREMENT
Statute freshness is currently UNMEASURED. Do NOT start a new statute-ingestion
architecture.
Select a stratified sample covering: current central Acts · repealed Acts · Acts
with known amendments · BNS/BNSS/BSA · older IPC/CrPC/Evidence Act where retained
· Acts heavily referenced by judgments.
For each, compare canonical LawMind state against currently approved official
source evidence for: Act identity · current/repealed state · commencement ·
latest amendment represented · section existence · predecessor/successor relation
where relevant.
Report: sample denominator · exact matches · stale records · UNKNOWN · source
unavailable · material temporal errors.
Do NOT convert this into legal applicability conclusions.
Produce STATUTE_FRESHNESS_V1 with measuredAt, sample definition, source basis,
limitations.
If material stale patterns cluster by ingest or parser source: escalate the
cluster. Do NOT mass-edit from a tiny sample.

DO NOT: broad OCR, role classifier, provider experimentation, new frameworks, or
applying edges to hit a number.

FINAL: root cause in one sentence · fix and verification · signed population hash
· precision attack with positives and negatives · false-pin gate PASS/FAIL and the
apply decision · STATUTE_FRESHNESS_V1 · continuous ingestion numbers · blockers.
```

## PROMPT — LCC — Sprint 3

```
[shared preamble]

You are LCC. Stand up the remote product plane and prove the release cycle.

1. REMOTE PLANE (staging API online by 8 Sep)
HTTPS API · auth · corpus serving DB imported · user/matter DB SEPARATE from the
corpus DB · tenant isolation · deletion endpoint · rate limiting · observability
(provider metrics + Sentry + PostHog + UptimeRobot + native logs — nothing more).

2. PROVE THE RELEASE CYCLE (by 18 Sep)
DATA_RELEASE_<version>: schema compatibility version · source manifest
fingerprints · counts · newest upstream/local decisions · freshness object ·
provenance version · citation edge counts · checksums · rollback target.
local validated release → remote staging → smoke tests → production promotion.
PROVE: an incremental release lands, and a corpus rollback leaves user and matter
data untouched. Publish timings and row checksums.

3. SECURITY BOUNDARY — prove it, do not assert it
From an outside network, demonstrate the workstation's Postgres is unreachable
from the internet. A positive test with published evidence, not a config claim.

4. eCOURTS
Carry forward whatever Sprint 2 reached. If a canary landed: retention probe,
then the daily pilot; expand from one source key only after the first is stable;
begin request-economics measurement; link observations to canonical matters
WITHOUT making observations user-owned.
IF Shape A is selected on 8 September: begin the adaptive planner — group
monitored matters by source key → one cause-list fetch where several share a
source → targeted status/order check where cheaper → prioritise near-term
listings → obey remaining quota. Do not optimise request volume before the pilot
produces real economics.
IF Shape B: keep the pilot at Track-A pace and remove monitoring from the remote
critical path.

5. OFFSITE RESTORE — remote edition. Prove restore of the remote user/matter DB
from an offsite copy. Publish timings and checksums.

6. CARRY-OVER from Sprint 2's "may slip" list, if any: retention probe, daily
pilot, trust-state contract exercise, model revision recovery.

DO NOT: build a new release framework, run semantic research, touch role
classification, or start UI work.

FINAL: remote plane status per component · release + rollback proof with timings
and checksums · security boundary evidence · eCourts numbers and strategy mix ·
offsite restore proof · carry-over status · blockers.
```

## PROMPT — RCC — Sprint 3

```
[shared preamble]

You are RCC. Connect to staging and prove the core loop on real hardware.

1. COMPLETE THE V1 SURFACE — Search, Reader, Saved Authorities, Matters, Account.
   Monitoring only if Shape A is selected on 8 September, and only as the
   registry permits.
2. CONNECT TO STAGING (14 Sep) — signup → login → search → reader → save →
   matter. Token expiry and recovery must work; test it deliberately.
3. DESKTOP SHELL ON THE SAME API (14 Sep) — thin authenticated web: Search,
   Reader, Saved, Matter. Same API, same design tokens, no new backend, no AI.
   This is the research workstation and the insurance policy if a store delays us.
4. PHYSICAL PHONE, MOBILE DATA (16 Sep) — a real phone on mobile data, not wifi,
   not an emulator, completes Search → Reader → Save → Matter. Publish evidence.
5. HONEST STATES ON DEVICE — poor network, degraded search, could-not-observe,
   stale data, evidence-withheld, image-only, token expiry. Understandable on a
   real phone in real conditions.
6. CONTRACT CHANGE REQUESTS — keep filing; never self-serve. Report which were
   AMENDed, DEFERred, REJECTed, and what you built meanwhile.

DO NOT: add features outside the registry, build billing yet, or start store
assets.

FINAL: screen-by-screen status · staging integration evidence · physical phone
core-loop proof · desktop shell status · honest-state inventory on device ·
contract change dispositions · blockers.
```

## PROMPT — NEW3 — Sprint 3 (part-time)

```
[shared preamble]

You are NEW3, part-time. Three things.

1. THE 8 SEPTEMBER MONITORING SCOPE DECISION
Present the founder with the measured position against ALL TWELVE conditions in
roadmap §5.3.1 — including the manual correctness review (every observation if
<= 50 exist, otherwise a stratified sample of 50, with zero material
case-identity / list-date / list-type misbindings).
Record the decision with its evidence. SHAPE_A_SCOPE_CANDIDATE = yes/no.
"Candidate" is NOT permission to market — monitoring stays capability-gated until
remote scheduling is proven at Gate C.
If Shape B: remove monitoring from the claims register, website copy and store
copy THAT WEEK. Do not leave a claim standing against a deferred capability.

2. SHADOW BETA (12–18 Sep) — 3 to 5 practising advocates
Observed sessions, not marketing. Real tasks from the curated set. Capture
failures and friction verbatim. Establish the task-completion baseline.

3. FREEZE THE BETA THRESHOLDS BY 18 SEPTEMBER
From the observed baseline freeze: activation · successful-search · core-loop ·
weekly-active · monitoring activation · retention window · critical qualitative
failure criteria · the pass/iterate/stop decision rule.
Freeze BEFORE the larger beta and never move them. Thresholds set after seeing
results get rationalised, and an investor will notice.

Also: keep processing contract change requests.

FINAL: monitoring decision with evidence against all twelve conditions · shadow
beta findings ranked · frozen threshold definitions and decision rule · contract
dispositions.
```

## GATE C TEST — 18 September (FIFTH)

```
[shared preamble]

You are FIFTH. Gate C — remote integrated alpha. Attack these; do not accept
assertions.

1. PHYSICAL PHONE, MOBILE DATA, REMOTE API: Search → Reader → Save → Matter.
   Emulator and wifi results do not count.
2. Desktop shell performs the search and reader flow against the same API.
3. SECURITY: from an outside network, confirm the local workstation Postgres is
   NOT reachable. Test it yourself.
4. RELEASE AND ROLLBACK PROVEN: an incremental release landed; a corpus rollback
   left user/matter data intact. Verify checksums yourself on a sample.
5. REMOTE BACKUP RESTORE PROVEN, with timings and checksums.
6. NO P0 DATA OR SECURITY ISSUE.
7. BETA THRESHOLDS FROZEN from the observed baseline; the monitoring shape
   decision recorded with its evidence against all twelve conditions.

Also confirm without auditing in depth: NEW1's four-state counts sum to the
eligible population with no unnamed residual, the HNSW predicate derives from a
named immutable snapshot identity, and NEW2's citation apply decision matches its
false-pin gate result.

Verdict: PASS or HOLD with exact blockers.
```

---

# SPRINT 4 — PRODUCT QUALITY + COMMERCIAL READINESS
**19 September – 2 October · Gate D target 2 October**

**Staffing:** RCC ACTIVE · LCC ACTIVE · NEW3 ACTIVE · NEW1 CONTINUOUS · NEW2 CONTINUOUS · FIFTH FROZEN.

**Continuation lines:** NEW1 — `Incremental embedding queue only. No new scope. One line daily: oldest pending delta age | vectors/hour | errors.` NEW2 — `Continuous ingestion only. No new scope. One line daily: new judgments | newest upstream vs local per source | accounted % and actually-held % | clustered failures.`

*Why NEW1 drops to CONTINUOUS:* HNSW is built and evaluated; only the incremental queue remains. An idle NEW1 holding a prompt during a polish sprint is the most likely source of scope drift in this plan.

## PROMPT — RCC — Sprint 4

```
[shared preamble]

You are RCC. No major new features. Quality, devices, commercial readiness.

1. POLISH — the named list only: search speed and readability · broad-query
refinement UX · reader typography · saved/matter flow · poor-network states ·
auth expiry and recovery · accessibility · deep links · tablet and desktop
breakpoints.

2. PHYSICAL DEVICE MATRIX — no emulator result counts
Current iPhone and a representative low/mid Android. Publish pass/fail per device
for: scrolling · very large judgments · clipped text · keyboard and search ·
poor-network states · token-expiry recovery · VoiceOver and TalkBack · text
scaling · touch targets · cold and warm deep links · background/resume ·
crash-free core loop.

3. ACCOUNT DELETION END TO END, wired to the backend erasure path and proven.
   Apple requirement wherever accounts exist, and a DPDP requirement.

4. BILLING — only if day-one premium is confirmed
RevenueCat + StoreKit + Play Billing at PBL 8+. Verify the deprecation table in
Play Console first. Publish the sandbox state table on BOTH stores: purchase ·
restore · cancel · grace · expired · entitlement sync · offline · refund and
revocation · webhook idempotency · anonymous→account migration. The entitlement
source of truth is OURS.
If billing is not ready, say so — we ship a free beta rather than delay.

5. STORE ASSETS
Icons · screenshots · preview video · support URL · review credentials · demo
credentials · Apple App Privacy answers · Play Data Safety answers. Every answer
checked against NEW3's PER-PLATFORM claims register — including whether party
search is enabled on that platform.

DO NOT: add features, soften an honest state for a screenshot, or claim a
capability the registry does not mark ENABLED for that platform.

FINAL: device matrix per physical device · deletion proof · billing state table
or explicit not-ready · store asset status · remaining P0/P1 · blockers.
```

## PROMPT — LCC — Sprint 4

```
[shared preamble]

You are LCC. Operations, economics, and the evidence behind the store packs.

1. MONITORING ECONOMICS (Shape A only)
From real pilot data: average requests per source per day · successful
observations per request · monitored matters covered by one batched list · parser
failure rate · retention by source · cost per request · quota utilisation ·
near-hearing capacity. Publish the table. Tiers cannot be defined before these
numbers exist.

2. MONITORING SLA FIELDS
Every matter carries server-side: monitoringPolicy · lastObservedAt ·
nextPlannedObservationAt · observationSource · lastObservationOutcome ·
monitoringDegradedReason. The product must be able to tell an advocate when a
matter was last observed and when it will next be checked. Never let the UI imply
real-time watching the request budget does not fund.

3. BILLING BACKEND (if day-one premium): entitlement source of truth on our side ·
webhook idempotency · refund and revocation · anonymous→account migration ·
entitlement behavior on account deletion.

4. RELIABILITY: backup and restore re-check · rate limiting and quota enforcement
under load · alerting to the real on-call destination · rollback runbook written
and dry-run.

5. DEFENSIVE POSTURE: authenticated API only, no anonymous bulk paths · no bulk
export endpoint in the v1 contract · pagination depth caps · per-account rate
limits · response-level trace IDs and API response provenance.
ABSOLUTE RULE: never alter canonical legal data for any operational purpose — no
watermarking of judgments, citations, statutes, dates or case status. If a canary
is ever used it must be structurally incapable of surfacing as legal authority,
asserted by test.

DO NOT: new release frameworks, semantic research, or UI work.

FINAL: monitoring economics table · SLA field implementation · billing backend
status · reliability evidence · defensive-posture checklist · blockers.
```

## PROMPT — NEW3 — Sprint 4

```
[shared preamble]

You are NEW3. Turn measured economics into commercial decisions; finish store
packs.

1. MONITORING TIERS — only from LCC's measured economics. Define in user language
(standard schedule / increased frequency near listing / highest permitted). Do
NOT publish frequency promises the measured capacity cannot fund. If economics
remain uncertain, monitoring launches as beta or limited — never with an
aggressive paid SLA.

2. PRICING — quota tiers derived from the request budget, not storage or
intuition. Recommend whether premium ships day one or after beta. Safety, source
and currentness evidence is never paywalled.

3. STORE REVIEW PACKS — complete before submission
a) GOVERNMENT-INFORMATION PACK: named sources with verifiable URLs · explicit
   non-affiliation statement ("LawMind is an independent legal research product
   and is not an official government application; court information is sourced
   from identified official systems") · the written authorization available if
   requested · in-app source-attribution screenshots · freshness explanation ·
   review credentials and instructions.
b) SOURCE-RIGHTS MATRIX (one page): source · content displayed · permission or
   licence basis · attribution requirement · evidence location. Include CC-BY-4.0
   attribution for the AWS mirrors — a licence obligation. Include the settled
   eCourts and SC permissions without exposing confidential terms.
c) PARTY-SEARCH CONTEXT NOTE: the legitimate legal-research context — published
   judicial decisions, professional users, no dossiers on individuals, party
   search returns cases. State the iOS capability switch and what the app shows
   when it is off.
d) Privacy policy · deletion flow · Apple privacy answers · Play Data Safety.

4. CLAIMS AUDIT — every store, website and in-app claim re-checked against the
PER-PLATFORM capability registry. Monitoring claims must not exceed measured
capability; this is an explicit Gate D criterion.

5. BETA COHORT — recruit 10–30 practising legal users. If the Play account is
personal, this cohort is also the closed-testing cohort: recruit once, 18–20 for
buffer.

FINAL: tier definitions with their economics · pricing recommendation · all four
store packs · claims audit · beta cohort status · blockers.
```

## GATE D TEST — 2 October (founder-run, no FIFTH round)

```
Each item requires published evidence, not an assertion.

1. Physical-device matrix GREEN for the core loop on a current iPhone AND a
   representative low/mid Android. Emulator results do not count.
2. No P0 or P1 design issue open.
3. Account deletion works end to end, proven.
4. Store review packs COMPLETE: government-information pack · source-rights
   matrix · party-search context note · privacy policy · Apple privacy answers ·
   Play Data Safety · demo credentials · review instructions.
5. Billing sandbox GREEN on both stores if paid launch — or an explicit recorded
   decision to launch free.
6. MONITORING CLAIMS DO NOT EXCEED MEASURED CAPABILITY. Check every claim against
   LCC's economics table. This is the criterion most likely to be fudged under
   launch pressure — check it last and hardest.
7. PER-PLATFORM CLAIMS: no store listing claims a capability disabled on that
   platform.

HOLD on any failure.
```

---

# SPRINT 5 — CLOSED BETA + WEBSITE + FUNDRAISE READINESS
**3–16 October · Gate E target 16 October**

**Staffing:** NEW3 ACTIVE (heaviest) · RCC ACTIVE · LCC ACTIVE · NEW1/NEW2 CONTINUOUS · FIFTH at Gate E.

## PROMPT — NEW3 — Sprint 5

```
[shared preamble]

You are NEW3. Run the beta, produce the fundraise materials, hold the line on
thresholds.

1. CLOSED BETA — 10 to 30 practising legal users, measured against the FROZEN
definitions: Research Task Completion Rate · first-search success · source opens ·
saves per search · matters per user · return usage · failed and degraded search
rate · tasks that required another database · monitoring activation and alert
usefulness if available · qualitative trust failures.
DO NOT MOVE THE THRESHOLDS AFTER SEEING RESULTS. If the numbers miss, the answer
is iterate or delay — not redefine success.

2. WEBSITE CONTENT — every sentence against the per-platform claims register.
Home · Research · Monitoring (or "coming soon" under Shape B) · Data & Trust ·
Pricing · Company · Legal.
Data & Trust publishes coverage · source categories · freshness methodology ·
provenance · correction policy · CC-BY-4.0 attributions · AND an explicit
non-claims list. In a market of unaudited assertions, documenting our own limits
is the differentiator.
Real product screenshots only. Clear independent / non-government disclaimer.
Testimonials role-based and unnamed by default; named advocate endorsements need
counsel advice under BCI Rule 36 — flag, do not publish unilaterally.

3. FUNDRAISE MATERIALS — deck · architecture one-pager · data room · source and
licence registry · Derived Intelligence Coverage dashboard (coverage percentages,
not row counts) · competitive benchmark · beta metrics · monitoring economics ·
use of funds. Publish the method beside every number.
Prepare the grant-risk answer: the company is valuable on Moat A (grant-
independent legal intelligence) and Moat C (workflow flywheel) alone; Moat B
accelerates it.

4. COMPETITIVE BENCHMARK — using ordinary licensed or user access, in compliance
with each platform's terms. Do NOT build a competitor scraper; it would
contradict our entire provenance position. Measure freshness · search on the same
30–50 real queries · correctness · UX · workflow.

FINAL: beta metrics against frozen thresholds with the pass/iterate/stop call ·
website claims-compliance check · fundraise material status · benchmark results ·
blockers.
```

## PROMPT — RCC — Sprint 5

```
[shared preamble]

You are RCC. Beta response and desktop quality. No new features.

1. TRIAGE BETA FEEDBACK by advocate impact, not engineering effort. Fix P0/P1
   only; everything else to the post-launch backlog with a recorded reason.
2. DESKTOP: usable research workstation by 9 Oct; beta-quality Search, Reader,
   Saved, Matter by 16 Oct. This is the fundraise demo surface and the store-delay
   insurance — a launch surface, not a side project.
3. SUBMISSION CANDIDATE: a build that could freeze on 17 October. From 9 October
   no scope growth without a recorded founder decision.
4. STORE ASSETS FINAL: every screenshot from the real product, every answer
   checked against the per-platform claims register.

FINAL: beta fix log with impact ranking · desktop status · submission candidate
readiness · store asset status · remaining P0/P1.
```

## PROMPT — LCC — Sprint 5

```
[shared preamble]

You are LCC. Reliability, load, launch operations.

1. LOAD TEST at expected launch concurrency (k6 or Locust — a test, not a
   standing service). Verify quotas and rate limits hold. Publish p50/p95/p99 and
   error rates.
2. BACKUP AND RESTORE RE-CHECK, both corpus and user/matter, with timings.
3. INCIDENT AND ROLLBACK DRILL, for real. Publish time to detect, decide, roll
   back.
4. KILL-SWITCH INVENTORY and the day-1 runbook: what can be turned off, by whom,
   with what audit trail — including the iOS party-search capability switch.
5. MONITORING AND ALERTING to the real on-call destination, verified by a real
   alert firing.
6. eCOURTS continues at Track-A pace regardless of launch shape.

FINAL: load test results · backup/restore proof · incident drill timings ·
kill-switch inventory · alerting verification · blockers.
```

## GATE E TEST — 16 October (FIFTH, full pre-submission)

```
[shared preamble]

You are FIFTH. Last independent gate before public. Attack every claim.

1. SERVING VS LOCAL PARITY — sample records yourself; confirm the remote plane
   returns what local truth holds.
2. CLAIMS REGISTER VS CAPABILITY FLAGS, PER PLATFORM — every website, store and
   in-app claim maps to an ENABLED capability with named evidence, on that
   platform. Any claim without one is a HOLD.
3. MONITORING CLAIMS VS MEASURED ECONOMICS — if Shape A, no claim exceeds
   measured capacity. If Shape B, NO monitoring claim survives anywhere: website,
   store copy, in-app, deck.
4. BILLING STATES — sandbox state table on both stores, or the recorded
   free-launch decision.
5. ERASURE END TO END — run a deletion; verify the data is gone.
6. FRESHNESS HONESTY — the published freshness object matches what the data
   supports; recency and completeness reported separately, never collapsed.
7. eCOURTS GRANT COMPLIANCE — query the ledger. Every request inside the
   transcribed limits; zero unattributed requests; refusals recorded; the
   User-Agent/attribution rationale recorded.
8. LOAD TEST result and incident/rollback drill evidence.
9. BETA DECISION RULE — the pre-registered rule passed on its ORIGINAL
   definitions. Check the freeze date against the results date.
10. REPRODUCIBILITY DEBTS — snapshot_hash, model revision and the M0 receipt are
    CLOSED, or their open state is explicitly recorded and does not affect any
    public claim.

Verdict: PASS or HOLD with exact blockers. A HOLD here is much cheaper than a
public correction.
```

---

# SPRINT 6 — SUBMISSION + LAUNCH
**17–23 October · Review buffer 24–30 October**

**Staffing:** RCC ACTIVE · LCC ACTIVE · NEW3 ACTIVE (part) · NEW1/NEW2 CONTINUOUS · FIFTH FROZEN unless a P0 incident occurs.

## PROMPT — RCC — Sprint 6

```
[shared preamble]

You are RCC. Submission and review response.

17 Oct: SUBMISSION CANDIDATE FREEZE. No scope growth. Any change afterwards needs
a recorded founder decision and a re-run of the affected device tests.

17–19 Oct: Submit to Apple. Submit to Google Play if organization/production
access is ready. Attach demo credentials and review instructions.
Apple: controlled/manual release after approval; phased release applies to later
updates, not the initial release.
Google: follow the production-access policy for our account type; staged rollout
does not apply to a first production release.

20–23 Oct: REVIEW RESPONSE WINDOW. Respond using PREPARED evidence — the
government-information pack, source-rights matrix, party-search context note.
Never create documents during review; if a reviewer asks something the packs do
not answer, escalate to the founder rather than improvising a claim.
If Apple challenges party search under 5.1.1(viii): activate the iOS capability
switch rather than redesigning under pressure, and update the iOS claims entry.

Expect at least one rejection cycle. That is normal.

FINAL: submission status per store · reviewer questions and evidence used ·
approval or rejection with the exact reason · next action.
```

## PROMPT — LCC — Sprint 6

```
[shared preamble]

You are LCC. Launch operations.

1. Production monitoring, alerting and dashboards live before the first external
   user.
2. Rollback path ready and rehearsed; kill-switch inventory current.
3. Signups enabled with a REAL reason string in the config audit trail — not
   "test cleanup".
4. Watch: error rates · p95 latency · quota utilisation · backup success ·
   first-user funnel.
5. eCourts continues at Track-A pace.
6. Day-1 runbook active: who is on call, what gets turned off first, how a bad
   release is rolled back.

FINAL: launch readiness checklist · live metrics · incidents and resolutions ·
blockers.
```

## LAUNCH CHECK — 23 October

```
DONE when:
- Desktop web is public.
- Website is public and every claim matches the per-platform capability registry.
- Mobile is public on every store that approved it.
- First external advocates are active.
- No P0 or P1 open.
- Monitoring, alerting and rollback are live and verified.

IF A MOBILE STORE IS DELAYED: desktop web goes public, the website goes public,
beta users continue, and the company does not stop. A store delay is a channel
problem, not a launch failure.
```

---

# APPENDIX — WHY AN AGENT IS FROZEN OR CONTINUOUS

**FROZEN — deliberately paused, no attention.** FIFTH in Sprints 2, 4 and 6. FIFTH's value is independent adversarial audit at decision points. Running it continuously turns audit into overhead and makes lanes optimise for the audit rather than the outcome.

**CONTINUOUS — standing jobs run, no new scope, no prompt.** NEW1 and NEW2 in Sprints 2, 4, 5 and 6. These lanes own jobs that must never stop. They are not idle. But a full prompt asks for new work, and a lane asked for new work will find some — that is how an embedding lane becomes a retrieval-research lane and a data lane becomes a benchmark lane, both of which this project has already experienced. The one-line continuation keeps the machine running without inviting scope.

**ACTIVE — new scoped work needing judgment, on or near the critical path.**

**Promotion test:** is there new work requiring judgment rather than repetition, and is it on or near the critical path? NEW1 becomes ACTIVE in Sprint 3 because snapshot integrity and the first HNSW build require judgment; it returns to CONTINUOUS in Sprint 4 because the incremental queue is repetition.

**On the Day-0 seal being LCC's own audit:** the seal is mechanical — git ancestry, lease state, migration journal — and every claim is independently checkable. Gate B check 0 re-verifies it through FIFTH, which is where the independence belongs.
