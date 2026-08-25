# LAWMIND — FINAL R8.1 ORCHESTRATION LOCK
**Date:** 25 August 2026  
**Supersedes:** `LAWMIND_R8_EVIDENCE_CONVERGENCE_DATA_MOAT_PLAN_2026-08-25.md` where this file differs.  
**Current lanes to run:** LCC · NEW1 · NEW2 · FIFTH  
**Parked:** NEW3 · RCC  
**Purpose:** converge data/intelligence/backend before mobile UI/UX and website work.

# 0. Corrections to the previous orchestration

The prior R8 was directionally correct, but it still left gaps that could cause drift.

1. **RCC is the canonical `apps/**` / mobile implementation owner.** NEW3 owns later product/backend acceptance, premium/release strategy and claim governance. NEW3 does not edit `apps/**` without an explicit RCC lease handoff.
2. **The canonical public website source is not in the current app repo.** No agent may create a duplicate site or repurpose admin. Website work starts only after locating the real source/deployment.
3. **NEW3 stays parked now.** Its ten-matter product acceptance must run against frozen retrieval/currentness contracts, not a moving backend.
4. **Synthetic fixture leakage is a P0.** Sixteen synthetic `Test Court` rows were observed in the corpus. Handle by exact row manifest, never loose court-name deletion.
5. **OCR/recovery was under-scoped.** Full OCR is not a launch gate, but targeted recovery of high-value damaged authorities is.
6. **Source freshness/continuous ingest was under-scoped.** Authorization, holdings, parser health, newest legal date and ingest lag are separate facts.
7. **Evaluation needs real query-shape coverage:** exact IDs, short English legal concepts, long facts, doctrine, fact pattern, supporting/adverse authority, statutes/transition, and Hindi only if claimed.
8. **Cross-route confidence consistency is a release gate.** Search cannot say "nothing" while counterarguments or briefing return unqualified authorities unless the scope difference is explicit.
9. **Release-critical work is separate from continuing moat work.** Full OCR/date/coram/citation backfills must not automatically delay launch.
10. **One `HEAVY_BOX` lease** controls large GPU/DB work. Long jobs prove useful progress by durable output, not PID/GPU/heartbeat.
11. **One `GIT_COMMIT` mutex + LCC-owned `MIGRATION_SLOT`.** Exact-path staging alone has not prevented cross-lane commit/migration contamination.
12. **Canonical documentation drift is itself a risk.** Stale `CLAUDE.md`, old source rules and old `set_aside` semantics must be corrected only after current truth is measured.

# 1. Ownership lock

| Lane | Owns now | Must not do |
|---|---|---|
| LCC | server/API, DB schema/migrations, security/privacy, process control, release/recovery | no `apps/**`, no UI design |
| NEW1 | retrieval, passage embedding/index/eval, ANN-vs-exact, abstention/query-routing evidence | no UI; no full build without gates |
| NEW2 | corpus/data truth, ingest/source drift, citation/data repair, passage roles/damage, statutes, OCR | no UI; no destructive dedup |
| FIFTH | independent falsification, hidden holdout, gate adjudication | no ordinary implementation |
| NEW3 — parked | later product/backend acceptance, premium/release strategy, claim matrix, website-source discovery | no `apps/**` without RCC handoff |
| RCC — parked | later canonical `apps/**`, mobile UI/UX/client/device/store | no server/data truth invention |

If ownership is unclear: **stop and resolve the lease before editing.**

# 2. Mandatory START_STATE / no-drift protocol

Before any mutation, every active lane must:
1. read this file completely;
2. compute and record its SHA-256;
3. record HEAD SHA, dirty paths, DB/version, migration high-water, bus high-water, leases, running jobs and `HEAVY_BOX` owner;
4. publish `START_STATE_R8_1`;
5. treat contradictions as `CONFLICT_REQUIRES_REMEASUREMENT`, never choose a version from memory.

Allowed completion states: `PROVEN`, `PASS_AT_MEASURED_SCOPE`, `PARTIAL`, `BLOCKED`, `UNKNOWN`, `NOT_MEASURED`.

# 3. Single-box resource control

**Initial `HEAVY_BOX` owner: NEW1.**

Heavy work includes passage embedding/index, full-corpus scans, large resolver writes, OCR/classification fleets, restore/replay, mixed-load and large ANALYZE/VACUUM-like work.

Every >30-minute/heavy job registers:
`job_id, owner, purpose, command fingerprint, PID + creation time, input version, durable output metric, starting/current output, last progress time, contention class, pause/resume mechanism, launcher/startup mechanism`.

Progress rule:
- inspect each batch/checkpoint and at least every 15 minutes;
- compare durable output with previous measurement;
- zero useful delta for two consecutive windows => `STALLED_OR_REPLAYING` until investigated;
- GPU %, PID and log heartbeat are secondary signals only.

LCC maintains OS ↔ registry ↔ scheduler/service ↔ useful-output truth.

# 4. Git + migration safety

## `GIT_COMMIT`
Acquire across the full sequence:
re-read HEAD → status → exact-path stage → inspect staged paths → abort on foreign paths → commit → release.

Never `git add -A` or `git add .`.

## `MIGRATION_SLOT`
LCC owns migration numbering/journal truth. NEW1/NEW2 request a slot before creating/renumbering a migration.

Every migration gets owner, purpose, idempotency classification, fresh-install proof, live-Gold applicability and rollback/forward strategy.

# 5. Release-critical gates

## G0 — machine/ownership truth
Truthful process registry, no unmanaged duplicate critical workers, useful-output health, reconciled migration/journal state.

## G1 — data purity/identity safety
Exact synthetic fixture cleanup; no known despatch false pins; no materialized target on a known-ambiguous citation key; non-destructive identity; raw rows never presented as unique authorities.

## G2 — retrieval/eval inputs
Complete bounded tranche; final complete index; actual-tranche passage safety; frozen train/dev/hidden lineage; unavailable targets remain end-to-end misses; query-shape families explicit.

## G3 — retrieval/abstention
Exact identity preserved; ANN-vs-exact measured; family metrics; no hidden zero family; common legal concepts have safe path or explicit degraded state; long input has deliberate policy, never silent truncation; abstention frozen before hidden test; Fifth final holdout passes preregistered criteria.

**Do not blindly reuse an old 70% threshold if a new benchmark has a lower measured end-to-end ceiling. Fifth must reconcile threshold vs benchmark construction before judging.**

## G4 — legal evidence/currentness truth
Resolver uniqueness fails closed on unsafe freshness/risk state; `resolver_risk_replay` nonempty/current; NULL treatment cannot default optimistically; resolution ≠ treatment; date absence = `DATE_UNCHECKED`; passage role/damage travels with evidence; reporter text cannot masquerade as court reasoning.

## G5 — product-backend truth
One server-authoritative uncertainty contract across search/saved feed/counterarguments/briefing/preview/generation; degraded retrieval cannot become confirmed empty; matter access consistent; briefings/alerts only claim real producers; generation accepts only evidence-contract support; sensitive data stays blocked from unapproved external models.

## G6 — security/privacy
Tenant IDOR, admin deny-default, auth/session/token, rate/admission, log/telemetry privacy, provider egress, deletion/erasure, audit integrity, secrets and fail-closed flags.

## G7 — release/recovery
Canonical migrations, fresh install/restore, classified lab tables, release manifest, legal/user data isolation, smoke equivalence, rollback, host-loss/backup recovery, human paging or explicit launch substitute, remote-staging decision package.

# 6. NEW1 — current HEAVY_BOX owner

1. **Finish current passage embedding** by durable row delta. Publish final passage/document counts and natural-vs-forced Gold accounting.
2. **Rebuild HNSW on the complete tranche only.** Record HNSW params, rows, build time, index/heap bytes, RAM/RSS, WAL/temp, progress and probe-vs-production `ef_search`.
3. **Run the complete 295-task/four-arm eval.** Per-family before aggregate; END_TO_END + CONDITIONAL together; include target-absent, unsafe, wrong-domain and zero-result.
4. **Re-run the common-query benchmark** on the final index: bail, anticipatory bail, quashing, limitation, writ maintainability and the rest of the frozen set.
5. **Short-English/posed-query validity:** work only against NEW2/Fifth Gold V3 provenance. Keep short concept, doctrine, fact pattern, supporting/adverse and long facts separate.
6. **Long-input policy:** measure representative ≤500, 500–1000, ~2500 and ~5000-character inputs only where product intends support. No silent truncation. Unsupported input gets an explicit guideable outcome.
7. **Abstention:** run preregistered dev calibration unchanged. If absolute similarity again hits a grid edge, record signal failure. One bounded composite risk candidate may use margin, cross-arm/lexical-dense agreement, role/damage/domain/coverage state; then freeze.
8. **Do not alter `chunk.ts` during this tranche.** After the current experiment, run a versioned segmentation-V2 pinpoint/source-offset experiment before any full passage build.
9. Publish `PASSAGE_100K_VALIDATION_V1`, `HEAD_VS_PASSAGE_DECISION_V2`, `RETRIEVAL_CANDIDATE_R8_1`, `ABSTENTION_POLICY_R8_1`, process/resource report.
10. Explicitly RELEASE `HEAVY_BOX` and notify LCC/NEW2/FIFTH.

Forbidden now: full-corpus passage build, new vector DB, model bakeoff, HyDE, graph ranking, broad reranker program, hidden-label access.

# 7. NEW2 — data truth / moat

While NEW1 owns `HEAVY_BOX`: small samples/source probes/code/dry-runs only.

## 7.1 Synthetic fixture purity P0
Create exact fixture manifest: IDs, creation/source, dependent rows, proof of synthetic origin. No broad `"Test Court"` predicate. If execution is sandbox-blocked, provide exact-ID founder script. Fifth verifies zero afterward.

## 7.2 Deterministic statute-reference linking
Prepare and then apply exactly-one-target linking from judgment statute refs to held Acts. One canonical Act-key implementation; explicit ambiguous/unmatched reason; resumable/idempotent; truth sample before/after; no model.

## 7.3 Existing ambiguous citation-pin repair
Before scale: verify despatch pins zero; find materialized `cited_judgment_id` where canonical key maps to >1 target; clear only unsafe pointer; preserve citation text/span; explicit AMBIGUOUS state; rollback manifest; prove zero known ambiguous pins.

## 7.4 Resolver risk replay
Populate adjudicated risk classes: shared neutral, despatch, aliases, court/date collision, target-not-held, old-row mutation/backfill. It must be current/nonempty before safe uniqueness is served.

## 7.5 Shared-neutral primary-source RCA
Refetch bounded worst cases from canonical source. Classify `SOURCE_METADATA_WRONG`, `EXTRACTOR_WRONG`, `DOCUMENT_PRINTED_VALUE_WRONG`, `COMMON_ORDER/SHARED_ORDER`, `UNKNOWN`. Retain source locator + checksum/etag + fetch time + evidence excerpt. Do not extrapolate cause before evidence.

## 7.6 Unique-safe resolver — conditional
After 7.3/7.4 + LCC freshness + Fifth sample review: materialized candidate keys, indexed join, distinct target count, unique-only writes, explicit unresolved states, resumability, sampled semantic truth.

First run a bounded tranche and measure rows/sec, I/O, contention, false-unique sample and projected total duration. If the full backfill materially threatens launch, cut a safe versioned release snapshot and continue the moat build after backend freeze.

## 7.7 Actual-tranche passage safety
After NEW1 releases heavy lease, rerun on exact tranche. Measure **top-k**, not only pool base rate: party submission, quoted precedent, reporter, case header, unknown, damaged, SC vs HC. Role/damage must be stored or wired to evidence. `OTHER_UNKNOWN` is UNKNOWN.

## 7.8 Body quality + targeted OCR
Give LCC the non-vacuous `screened != clean` CI guard. OCR priority, not full fleet: Gold/hidden targets → highly cited authorities → currentness/treatment blockers → newly ingested high-value judgments → release-critical blocked evidence. Record source, method/version, checksum, paragraph/span validity and eligibility before/after.

## 7.9 SCR/reporter apparatus
Classify as `OFFICIAL_REPORTER` material; structurally detect running heads, editorial/headnote text, margin letters and reporter pin-cites. Reporter/editorial is never court reasoning. Keep legal/licensing policy separate from epistemic attribution.

## 7.10 Treatment replacement
The 0/11 proximity architecture remains DO NOT SCALE. Next candidate: role segmentation → citation anchor → referent/grammatical binding → modality/negation/quotation → chronology → exact evidence → candidate → independent adjudication. `set_aside` is not citation treatment merely because nearby. One bounded license-compatible Indian rhetorical-role model comparison is allowed as a candidate signal, never truth.

## 7.11 Treatment NULLs
Strong-treatment row with no provenance = explicit UNKNOWN/UNCLASSIFIED.

## 7.12 Gold V3
Audit Gold V2 supporting/adverse semantic honesty and missing doctrine/common/fact families. Final Gold V3 must be genuinely human/advocate-authored with provenance; no model-written final Gold. If insufficient: `HUMAN_ADVOCATE_INPUT_REQUIRED`.

## 7.13 Legal time
Prioritize treatment edges, top cited authorities, Gold targets, new ingest and old/new statute transition. Missing verdict = DATE_UNCHECKED. Statute sections need version/effective interval; they are not timeless.

## 7.14 Coram/hierarchy
No bindingness classifier. Recover high-precision coram/bench from primary text and later official/eCourts metadata; store provenance/verification.

## 7.15 IPC/CrPC/IEA
Reconcile historical repo claims instead of assuming "no source." Probe current official India Code DSpace/API/archive, Legislative Department and official Gazette/eGazette under canonical source policy. Record exact artifact, authority/provenance, completeness from artifact, section inventory, amendments/effectivity, checksum and parser recall. Never mark partial complete.

## 7.16 Citation aliases/provider signals
Re-measure current value of official Supreme Court parallel/equivalent-citation material and already-authorized BharatLaw/Supreme AI candidate signals. Provider outputs are candidate/teacher/metadata only; every row keeps source/license/provenance; canonical truth needs primary verification. Do not use Indian Kanoon from stale authorization assumptions.

## 7.17 Continuous source freshness
Make the source-drift contract executable per source: authorization state, holdings count, newest source item/legal date, last successful ingest, ingest lag, parser version/hash, listing fingerprint, last drift probe, failure/refusal state. Existing canonical judgment/statute sources need a repeatable incremental/delta path.

## 7.18 Language truth
Audit why language metadata is effectively English-only while native text exists. Before any Hindi claim, produce a bounded Hindi/Devanagari retrieval/evidence set or HOLD the claim.


# 8. LCC — server/security/release

While NEW1 owns `HEAVY_BOX`: bounded code/tests only.

## 8.1 Security/privacy P0 — now
Run tenant USER_A/USER_B/admin IDOR across matter/event/annotation/briefing/saved/push/subscription/data-request surfaces; admin deny-default; auth/session/refresh/replay; rate/admission; query-log privacy; telemetry scrub; provider sensitive-data gate; deletion/erasure; secrets/config; audit integrity; billing callback surfaces if present; default-off/fail-closed flags.

## 8.2 Process control
Adversarially verify recycled-PID fix. Registry identity = PID + creation time + command fingerprint + job ID.

Required states: `PAUSED`, `RUNNING_PROGRESSING`, `RUNNING_REPLAYING`, `STALLED`, `FAILED`, `COMPLETE`, `UNKNOWN`.

Health/alerts must cover zero output, stale worklist, sidecar/worker loss, disk pressure, DB failure, pool saturation, briefing-zero, source/release lag, backup age and alert-delivery failure. Thresholds are measured/configured, not invented here.

## 8.3 Durable dirty-work freshness
Move correctness away from timestamp-only frontiers where possible. New ingest/mutation creates committed work/dirty identity. Resolver uniqueness fails closed on relevant dirty state, stale version, absent/stale risk replay or ambiguity.

## 8.4 Timestamp precision
Audit postgres.js precision-sensitive timestamp bindings/cursors. Preserve microseconds where time remains and test both comparison directions.

## 8.5 One cross-route uncertainty vocabulary
Use one existing/versioned vocabulary across `/search`, saved feed, counterarguments, briefings, preview and generation. It must distinguish complete, partial, no-match-confident, coverage unknown, resource degraded, unsafe evidence, low relevance, ambiguous identity, date/currentness uncertainty and review-required states. Do not create a second competing vocabulary.

Fifth must be able to send the same matter/query through multiple routes and get logically consistent confidence.

## 8.6 Retrieval evidence wire
Generation support must carry judgmentId, passageId, exact span, paragraph state, role, passage damage/body evidence, decision identity, date quality, currentness/treatment provenance, relevance evidence and releaseId/source snapshot. Missing required evidence => not generation support.

## 8.7 Date/currentness propagation
Temporal/search/treatment/as-of paths consume date quality. Missing = DATE_UNCHECKED. Resolution != treatment. Reporter evidence != court treatment. Treatment edge != current legal status unless explicit policy derives it.

## 8.8 Synthetic fixture removal seam
Own DB-side cascade correctness for NEW2's exact manifest. Never broad-delete by court name.

## 8.9 Planner stats + mixed load — after heavy handoff
Inspect critical stats/plans first, targeted ANALYZE only where needed. Compare current queue vs bounded research admission. Protect AUTH/CORE, EXACT/IDENTITY and MATTER/WRITE from RESEARCH/HEAVY saturation. Research degrades/refuses before core starvation.

## 8.10 Migration/fresh install
Reconcile all divergent migration reports on **current** HEAD/Gold. Publish canonical list, applied classification, Gold-only object classification, fresh replay and restore path. Add an explicit fresh-install CI/job even if too expensive for every normal local CI run.

## 8.11 Release manifest
Bind corpus snapshot, source-freshness fingerprints, eligibility hash, segmentation version, passage safety policy, embedding model/dim/pooling, index/HNSW params, citation resolver/risk version, statute version, migration line, Gold/eval versions, abstention policy, API envelope/version and rollback target.

## 8.12 API compatibility before RCC resumes
Define response envelope/version, additive vs breaking rules, N-1 mobile compatibility or forced-min-version strategy, and build/release ID endpoint. RCC must never infer absent server fields.

## 8.13 Release/recovery
After data candidate freeze: fresh install/restore, release import, targeted ANALYZE, exact/currentness/semantic smoke equivalence, legal/user-data isolation, rollback, host-loss and backup restore.

## 8.14 Human paging
If real recipient/credentials remain absent: `BLOCKED_FOUNDER_CONTACT`. File receipts are not human paging.

## 8.15 Railway
Do not delete by recommendation alone. Prepare `RAILWAY_FINAL_DECOMMISSION_DECISION.md` proving no runtime/config/DNS dependency, no recent use, exact stale DB identity/size, archive choice, rollback independence and current cost source. Fifth verifies. Founder chooses DELETE vs PAID_ARCHIVE.

## 8.16 Documentation-truth sweep
After facts are measured, update stale canonical instructions/source maps and superseded `set_aside` assumptions. Mark historical docs historical so fresh agents cannot re-import obsolete truth.

# 9. FIFTH — independent R8.1 auditor

1. Produce a delta/falsification dossier, not another broad master plan.
2. Re-test current process registry, migrations/fresh install, resolver freshness, despatch pins, M09, synthetic fixtures and source authorization truth.
3. Attack every new 0%/100% claim with non-vacuous tests, denominator/scope and defect reintroduction where possible.
4. While NEW1 runs, verify durable passage output, job registry vs OS and absence of competing heavy jobs.
5. Audit Gold V2/V3 provenance, cluster leakage, supporting/adverse semantic honesty, short-English, doctrine/common/fact, and Hindi only if claimed. Keep hidden membership secret.
6. Publish benchmark ceiling + reachable conditional + end-to-end + harm-weighted family criteria **before** final holdout; do not mechanically reuse stale thresholds.
7. Independently hand-check a stratified sample of actual-tranche top-k passages, SC separately from HC.
8. Run a cross-route truth battery: same query/matter through search, counterarguments, briefing, preview and generation if enabled. Fail unexplained confidence contradictions.
9. Verify authorization ≠ holdings ≠ freshness. Do not reopen settled BharatLaw/Supreme AI/eCourts authorization merely because operational conditions are missing.
10. Classify every open item: `RELEASE_BLOCKER`, `RELEASE_WITH_HONEST_LIMIT`, `POST_FREEZE_MOAT`, `FOUNDER_EXTERNAL`.
11. Run final hidden holdout ONCE only after NEW1 candidate/index/abstention + NEW2 Gold lineage/actual-tranche safety + LCC outcome/evidence contracts are frozen.
12. Update G0–G7 only from current evidence.

Outputs:
- `LAWMIND_R8_1_DELTA_AUDIT_2026-08-25.md`
- later `LAWMIND_G3_FINAL_HIDDEN_HOLDOUT_2026-08-25.md`
- later `LAWMIND_BACKEND_FREEZE_VERDICT_R8_1.md`

# 10. Release-critical vs continuing moat

## Release-critical
1. Synthetic fixture purity.
2. Citation false-pin repair + nonempty risk replay.
3. Passage retrieval decision + safe evidence.
4. Cross-route uncertainty contract.
5. Deterministic statute-reference linking where safe.
6. Date/currentness fail-closed semantics.
7. Source freshness state.
8. Security/privacy.
9. Migration/release/recovery.

## Continuing moat — can continue after backend freeze under versioned releases
1. Full unique-safe citation expansion.
2. Broad targeted OCR recovery.
3. Larger date-quality coverage.
4. Coram/bench enrichment.
5. Broader provider alias/metadata candidate ingestion.
6. eCourts historical coverage.
7. Full-corpus passage expansion after approval.
8. Wider statute/gazette/state coverage.
9. Language breadth.
10. District/tribunal expansion.

No continuing moat job may silently mutate a frozen release dataset.

# 11. Observability/capacity facts required before freeze

Factory: GPU useful-output rate, vector/passage delta, resolver rows/sec, OCR pages/sec when used, disk/growth, DB/WAL/temp, pool saturation, source lag, backup age.

Serving candidate: route p50/p95 under `LOCAL_QUIET` and `LOCAL_CONTENDED`, timeout/refusal/degraded rate, DB acquire wait, core-vs-research isolation, generation cost if enabled.

Local timings remain local labels; never present as public mobile latency.

# 12. Product contracts that must survive into next phase

1. Ambiguity is shown; rank-1 never silently selected.
2. Safety/currentness evidence is never paywalled.
3. UNKNOWN stays UNKNOWN.
4. No-result differs from incomplete/degraded.
5. Citation resolution is not treatment.
6. Reporter evidence is attributed.
7. Date uncertainty is explicit.
8. Result #6+ remains reachable.
9. Matter/private data stays tenant-isolated.
10. Premium preview counts are deterministic unless explicitly synthesized.
11. Generation support is source-span grounded.
12. Product surfaces cannot invent confidence absent from backend.

# 13. When NEW3 may start

NEW3 activates only when Fifth says G3 + minimum G4 predecessor contracts are sufficiently frozen for product-backend acceptance.

Minimum:
1. complete bounded passage eval;
2. retrieval candidate frozen;
3. abstention frozen;
4. actual-tranche top-k role/damage policy frozen;
5. risk replay nonempty + citation uniqueness fail-closed;
6. treatment NULL state safe;
7. cross-route uncertainty contract implemented;
8. security/privacy P0 passed on exercised routes.

NEW3 then owns:
- ten synthetic/public matter backend acceptance;
- briefing/alert/generation/premium-preview truth and cost;
- activation/product metric design;
- public claim matrix;
- locating canonical website source/deployment;
- website plan only.

**NEW3 does not edit `apps/**`.**

# 14. When RCC may start

RCC activates after NEW3 backend acceptance + LCC API contract freeze.

RCC owns:
mobile UI/UX, client contracts, search/reader/matter/premium surfaces, accessibility, real device/network tests, client telemetry, push, deletion client, billing/store integration and release builds.

NEW3 supplies product requirements/claim matrix. LCC supplies server contract. RCC implements `apps/**`.

# 15. Website phase

After backend truth + claim matrix:
1. locate canonical site repo/deployment;
2. obtain access/ownership;
3. freeze supported claims;
4. remove/replace unsupported absolute statements;
5. then redesign/polish.

Do not create a second LawMind website unless founder explicitly chooses a migration.

# 16. Current founder/external items

Do not interrupt founder for engineering questions.

Known external items:
- real alert recipient/credentials;
- offsite backup destination/retention;
- Railway delete-vs-paid-archive after proof;
- exact eCourts numeric grant terms/actor only if truly unrecoverable from project artifacts;
- SCR retention/training legal policy where counsel is required;
- DPA/provider agreements before real private matter synthesis/uploads;
- genuine human advocate semantic queries if Gold V3 lacks enough authored material.

BharatLaw / Supreme AI / eCourts authorization itself is settled in the current canonical founder record and should not be casually reopened.

# 17. Do not do now

- NEW3 mobile edits.
- RCC work before backend/API freeze.
- website redesign.
- full-corpus passage build.
- new vector DB/search engine.
- HyDE/graph/reranker expansion.
- destructive dedup.
- mass treatment promotion.
- bindingness oracle.
- model-generated final Gold.
- broad OCR fleet while NEW1 owns heavy box.
- broad new tribunal/district scrape.
- Indian Kanoon use from stale authorization assumptions.
- live eCourts execution without exact operational grant terms.
- Railway deletion without proof + founder decision.
- public "good law", "every citation verified", Hindi, district or automatic-hearing claims unless current evidence supports them.

# 18. Phase order

```text
PHASE A — NOW
NEW1 = HEAVY_BOX
LCC = security/process/contracts (light)
NEW2 = data/source/repair prep (light)
FIFTH = delta falsification (light)

        ↓ NEW1 releases HEAVY_BOX

PHASE B
NEW2 actual-tranche safety + fixture/citation/statute repair
LCC risk/freshness integration
FIFTH verifies

        ↓ candidate + data-policy freeze

PHASE C
FIFTH final hidden holdout
NEW2 conditional resolver/moat tranches
LCC stats/mixed-load/release rehearsal

        ↓ G0–G7 backend freeze

PHASE D
NEW3 product/backend acceptance + claim matrix
(no apps edits)

        ↓ product/API contract freeze

PHASE E
RCC mobile UI/UX + device/store
canonical website work
NEW3 product/release coordination

        ↓ remote staging + stores

PUBLIC RELEASE
```

# 19. FINAL KICKOFF PROMPTS

## LCC — RUN NOW
> Read `LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md` completely. Compute its SHA-256 and publish `START_STATE_R8_1` with HEAD, dirty paths, DB/migration truth, bus high-water, process inventory and leases before mutation.
>
> You are LCC, canonical server/backend/schema/security/release owner. You do not own `apps/**`.
>
> NEW1 currently owns `HEAVY_BOX`; until explicit release, do not run mixed-load, restore, large ANALYZE/VACUUM or large corpus scans.
>
> Immediate order: (1) close security/privacy P0 including tenant IDOR/admin/auth/session/rate/log privacy/provider egress/erasure/secrets/audit/fail-closed flags; (2) adversarially verify process registry/startup with PID creation + command fingerprint + useful output; (3) establish `GIT_COMMIT` and own `MIGRATION_SLOT`; (4) implement/prepare durable dirty-work resolver freshness + nonempty risk replay with NEW2; (5) audit timestamp precision; (6) implement one cross-route uncertainty contract; (7) wire retrieval evidence fields; (8) propagate DATE_UNCHECKED/treatment/currentness truth; (9) support exact synthetic-fixture cleanup; (10) wire the non-vacuous `screened != clean` guard into canonical CI.
>
> After NEW1 releases `HEAVY_BOX`, coordinate targeted stats repair, mixed-load isolation, migration fresh-install, release manifest/restore/rollback/host-loss, paging and Railway decision packet.
>
> Every long job proves durable progress at checkpoints and at least every 15 minutes. No UI/website/pricing changes by inference.

## NEW1 — RUN/CONTINUE NOW
> Read `LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md` and `R7_FINAL_RUN_RUNBOOK.md`. Publish `START_STATE_R8_1`. You are NEW1 and current `HEAVY_BOX` owner.
>
> Do not resume the old HEAD walk. Finish the bounded passage program by durable output: complete embeddings; rebuild HNSW on complete tranche; record resources/params; run exact-vs-ANN + complete 295-task/four-arm eval; rerun common legal queries; cover separated real query shapes; run preregistered dev abstention and at most one bounded composite risk candidate; declare long-input policy with no silent truncation; freeze retrieval candidate + abstention. Do not modify `chunk.ts` mid-tranche; after closing it, design the bounded segmentation-V2 pinpoint/source-offset experiment before any full build.
>
> No full-corpus passage build, new vector DB, model bakeoff, HyDE, graph ranking or broad reranker. Use `GIT_COMMIT`; no self-allocated migrations.
>
> Every >30-minute job reports durable output at least every 15 minutes. Zero useful delta for two windows => STALLED/REPLAYING investigation.
>
> When candidate artifacts are frozen, explicitly RELEASE `HEAVY_BOX` and notify LCC/NEW2/FIFTH.

## NEW2 — RUN NOW, LIGHT UNTIL NEW1 RELEASES HEAVY_BOX
> Read `LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md`; publish `START_STATE_R8_1`. You are NEW2, corpus/data truth/ingest/provenance/statute/OCR owner. No UI. Request migration slots from LCC.
>
> While NEW1 owns `HEAVY_BOX`, do bounded probes/source research/code/dry-runs only.
>
> Prepare in order: exact synthetic fixture manifest; deterministic statute-ref→held-Act linking; ambiguous materialized citation-pin repair + rollback; current risk replay; primary-source shared-neutral RCA; actual-tranche top-k passage safety harness; targeted OCR queue; Gold V2→human-authored semantic Gold V3 lineage; official IPC/CrPC/IEA source reconciliation; executable source freshness/drift; Hindi/language truth; SCR structural attribution.
>
> After NEW1 releases heavy lease: remove exact synthetic fixtures safely; link unambiguous statute refs; repair ambiguous pins and prove zero; populate/replay risk set; rerun actual-tranche top-k passage safety; then only if LCC/Fifth gates pass run a bounded unique-safe resolver tranche and measure throughput/I/O/false-unique before deciding full duration; scale OCR only by value priority.
>
> Treatment proximity V1 remains DO NOT SCALE. Any replacement must bind treatment to the specific cited authority and stay candidate-only until independent precision clears the gate.
>
> Reporter/editorial is never court reasoning. OTHER_UNKNOWN is UNKNOWN. Missing date verdict is DATE_UNCHECKED. No destructive dedup. Use `GIT_COMMIT`. Long/heavy jobs report durable output at least every 15 minutes.

## FIFTH — RUN NOW
> Read `LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md`, current R7 audit, latest LCC/NEW1/NEW2 artifacts, HEAD/DB/process tree and bus; publish `START_STATE_R8_1`.
>
> You are FIFTH, independent falsification/hidden-holdout/gate judge. Do not implement ordinary fixes.
>
> Produce a delta audit: independently re-test current process/startup, migrations/fresh install, resolver freshness, despatch pins, M09, synthetic fixtures and source authorization truth; attack new 0%/100% claims non-vacuously; verify NEW1 final tranche/progress/natural-vs-forced accounting; verify NEW2 corrections and data-source claims; audit Gold V2 and design hidden human-authored semantic Gold V3; preregister final release criteria reconciling benchmark ceiling vs old thresholds; classify every unresolved item as RELEASE_BLOCKER / RELEASE_WITH_HONEST_LIMIT / POST_FREEZE_MOAT / FOUNDER_EXTERNAL.
>
> Do not run final hidden holdout until NEW1 freezes candidate/index/abstention and NEW2 freezes actual-tranche safety/Gold lineage and LCC freezes outcome/evidence contracts. Then run it once, revealing aggregate/family/harm verdicts only.
>
> Before backend freeze, run the cross-route truth battery on the same controlled queries/matters through search, counterarguments, briefing, preview and generation if enabled. Fail unexplained confidence contradictions.
>
> Outputs: `LAWMIND_R8_1_DELTA_AUDIT_2026-08-25.md`; later `LAWMIND_G3_FINAL_HIDDEN_HOLDOUT_2026-08-25.md`; later `LAWMIND_BACKEND_FREEZE_VERDICT_R8_1.md`.

# 20. PARKED ACTIVATION PROMPTS

## NEW3 — DO NOT RUN UNTIL §13
> Read R8.1 + Fifth predecessor verdict. You are product/backend acceptance, premium/release/claim-governance owner, not mobile implementation owner. Do not edit `apps/**`; RCC owns it. Run ten synthetic/public matters through frozen backend, verify uncertainty/briefing/alert/generation/preview truth and cost, produce acceptance + public claim matrix, locate canonical website source/deployment, and prepare website plan only. No real private matter data to external models unless provider/DPA gate permits.

## RCC — DO NOT RUN UNTIL §14
> Read R8.1 + NEW3 acceptance + LCC frozen API contract. You are canonical `apps/**` owner. Implement mobile UI/UX, client contracts, accessibility, device/network tests, client telemetry, push, deletion, billing/store and release builds. Never infer server truth absent from the API.

# End state
R8.1 ends when Fifth can issue a current-evidence backend-freeze verdict. The target is **release truth + strong data moat + bounded ongoing enrichment**, not endless pre-launch backfills and not a polished client over uncertain legal evidence.
