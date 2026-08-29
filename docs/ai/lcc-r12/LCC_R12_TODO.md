# LCC R12 — LIVE CHECKLIST

**Round:** BACKEND INTELLIGENCE + ECOURTS CANARY + SPRINT-2 SERVING FOUNDATION.
**Started:** 29 August 2026. **HEAD_BEFORE:** `831c6c2`.
**Updated in place as items land.** `[x]` = observed, not inferred.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done and verified ·
`[!]` HOLD / blocked · `[-]` deliberately not done, with a reason.

---

## 0. Lane integration — prove all lane work is in one HEAD

- [x] `CURRENT_HEAD` = `831c6c28b6ec94f6368aaa30ff6b8127a4b734d6`
- [x] `LCC_R11_PRESENT` — `6b90f98` is an ancestor of HEAD
- [x] `NEW1_R11_PRESENT` — `edac0de` is an ancestor of HEAD
- [x] `NEW3_R12_PRESENT` — `831c6c2` is HEAD itself
- [x] Lease audit: **nothing stale, nothing cleaned.** All five resource leases
      are RELEASED except `HEAVY_BOX`, HELD by NEW1 and `HEALTHY_BY_PROGRESS`
      (heartbeat 4m, metric `count(*) FROM new1_doc_vector_stage` rising
      2,818,114 -> 2,820,502). The trap worth recording: NEW1's LANE lease reads
      DEAD while its WORKERS are alive, because a lane lease tracks the agent
      session and the workers run under Task Scheduler against the resource
      lease. Deleting another lane's dead session marker buys nothing and would
      read as "NEW1 is not running", so none were touched.
- [x] NEW1 coarse walk + doc-vector embed + NEW2 citations-cli confirmed RUNNING, untouched

## 1. Retract the false CAPTCHA blocker

- [x] `FQ-ECOURTS-CAPTCHA` corrected by APPENDED record (history not rewritten)
- [x] `docs/CURRENT_PLAN.md` R11 false-blocker wording corrected
- [x] `docs/ai/lcc-r11/LCC_R11_ECOURTS_CONTINUATION.md` carries a correction notice
- [x] Capability registry / status files relying on the blocker corrected
- [x] NEW corrective bus messages issued (1521-1525 remain immutable)
- [x] `AUTHORIZATION_REOPENED = no` held throughout

## 2. Fix the wrong M0 evidence receipt

- [x] Older `18,947,807` receipt PRESERVED and RELABELLED as a pre-gate snapshot
- [x] New durable receipt created for the actual Gate-A M0
- [x] `upstreamUnique = 18,951,606` re-derived FROM SCRATCH, not copied from NEW2
- [x] manifest SHA `a72d9868...5ac50` cross-checked
- [x] 1,438 non-fixture partitions; per-partition identity/ETag/size/rows
- [x] canonical per-partition + overall identity-set digests
- [x] parity result SHA, freshness generation/body SHA, definition version/SHA
- [x] `SOURCE_BYTES_RETAINED` / `SOURCE_REFETCH_REQUIRED` stated honestly

## 3. Embedding stage / snapshot_hash ownership

- [x] `VECTOR_STAGE_ROLE` determined from evidence (FACTORY_SCRATCH vs CANONICAL_SERVING)
- [x] `SNAPSHOT_IDENTITY_FIX_REQUIRED` answered
- [x] Explicit generation/snapshot identity contract for future vector inserts
- [x] Coordinated with NEW1 on the bus; live coarse batch NOT interrupted

## 4. AB-1 — party / title routing

- [x] Root cause READ FROM CODE, not inferred
- [x] NEW3's fixture reproduced DYNAMICALLY from current data, spread across courts
- [x] Test set: full title, one party, two-party abbrev, punctuation variant,
      common-name control, negative control
- [x] BEFORE measurement recorded (precision + latency)
- [x] Fix implemented — exact identifiers still win; case-FIRST; no person dossier
- [x] AFTER measurement recorded
- [x] Arbitrary concept queries proven NOT routed into the party path
- [x] `PARTY_SEARCH_AB1` verdict = **PASS** (party-only recall 3/6 -> 6/6, ranks 1-3)

## 5. AB-2 — filter-aware admission

- [x] Battery measured on CURRENT PostgreSQL first (no new engine, no router)
- [x] Queries: bail, anticipatory bail, quashing FIR, interim injunction, statute concept
- [x] Scopes: unfiltered, 1 court, court+month, court+year, court+statute, SC, small HC, large HC
- [x] Per query: eligible population, planner, index usage, rows scanned,
      candidates, p50/p95, state
- [x] Smallest safe design chosen from the four candidates, with the losers' reasons
- [x] No `date_part(year, ...)`; sargable range predicates; no ILIKE where an index exists
- [x] `EXPLAIN (ANALYZE, BUFFERS)` on bounded fixtures only
- [x] Honest broad-query guard NOT deleted
- [x] Acceptance minimum met
- [x] `FILTERED_ADMISSION_AB2` verdict = **PASS** (court-month `bail` refused -> 4.1 ms)

## 6. NEW3 data-trust API gaps (frozen contract — additive only)

- [x] judgment: `source`, `sourceEdition`, provenance basis, decision date,
      freshness/currentness, source URL/action
- [x] citation graph: partiality declaration (`coverage{...}`) — G-3
- [x] monitoring: six fields frozen with semantics, legitimately null while disabled
- [x] No AI fields added
- [x] `DATA_TRUST_API` = **PASS** (provenance block, graph coverage, six monitoring fields)

## 7. Firm-ready domain model — implementation, not design

- [x] Actual schema inspected (do NOT infer from NEW3's freeze)
- [x] Personal Workspace auto-exists for every v1 account
- [x] Matters migrated to personal Workspace
- [x] Saved authorities migrated
- [x] Single-user API behaviour unchanged for the mobile app
- [x] Tenant isolation tests
- [x] Rollback / reconciliation proof
- [x] `FIRM_READY_SCHEMA` = **PASS** (0097-0099, 529 workspaces, tenant isolation 23503)

## 8. eCourts — offline request blueprint BEFORE any live request

- [x] Official JS located in the RETAINED page: `fillDistrict`, `fillcomplex`,
      `fillCauseList`, `submitCauseList`, token rotation
- [ ] Executed OFFLINE with a recording transport that opens NO socket
- [ ] Captured: method, URL, query, content type, field names/order, headers,
      cookies, `app_token`, `ajax_req`, Origin/Referer/X-Requested-With,
      state/district/complex/establishment, civil/criminal encoding
- [x] `FIELD | OFFICIAL JS | LAWMIND | MATCH/MISMATCH` table published
- [x] `ECOURTS_OFFLINE_REQUEST_DIFF` = **RECONCILED / BLUEPRINT_PARTIAL** (searchByCauselist.js not retained)

## 9. User-Agent / attribution — settle from the binding contract

- [x] Binding attribution requirement read LITERALLY
- [x] User-Agent vs attribution separated only if the record permits
- [x] Test proving attribution on EVERY permitted network request
- [x] Secret / full grant string never logged
- [x] `ATTRIBUTION_TRANSPORT` = **SEPARATED** (User-Agent | x-lawmind-attribution)

## 10. Bounded live canary — MAX THREE diagnostic requests

- [ ] Only after the offline blueprint is reconciled
- [ ] One request-shape change per step unless the diff proved an inseparable unit
- [ ] Guard, atomic quota, ledger-before-send, raw-before-parse, attribution,
      cookies, rotating `app_token`, spacing/hour/day
- [ ] All traffic inside `court/ecourts.ts` only
- [ ] `LIVE_DIAGNOSTIC_REQUESTS` / `TOTAL_REAL_REQUESTS_DAY` recorded

## 11. CAPTCHA technical implementation

- [ ] PaddleOCR pipeline used under the committed permitted conditions
- [ ] Comparator evidence retained
- [ ] Per-solve metrics: confidence, raw OCR, normalized, accepted/rejected
- [ ] No training/overfitting on live CAPTCHA responses
- [ ] A rejected CAPTCHA consumes one bounded retry and does not raise the rate

## 12. First real cause-list fixture

- [ ] ONE actual served cause list captured; raw evidence FIRST
- [ ] Network frozen during parser development
- [ ] Parser tests built from the REAL fixture
- [ ] All required fields preserved; official "may differ" warning modelled
- [ ] UNKNOWN stays UNKNOWN; no LISTED to HEARING_OCCURRED inference

## 13. Observation writer — resolve the contradiction from HEAD

- [x] Actual INSERT path searched for in the tree
- [ ] Existing then tested with the real fixture; absent then implemented
- [ ] append-only, raw linkage, source key, observedAt, strategy,
      normalized payload, parser version, uncertainty, idempotency
- [x] `OBSERVATION_WRITER` = **EXISTS AND PASSES** (ecourts-observation-writer.ts, 5 tests)

## 14. Canary to retention to daily pilot

- [ ] `CANARY` criteria met (fetch, raw, parse, >=1 observation, zero unattributed)
- [ ] Retention probe on ONE source: T, T-1, T-7, T-30, T-90, T-365
- [ ] Only interpretable successes classified; failures prove nothing
- [ ] ONE daily pilot source registered through the existing scheduler
- [ ] `ECOURTS_SWITCH_FINAL` recorded

## 15. Internal eCourts coverage ledger

- [x] All internal metrics maintained; no marketing surface
- [x] `USER_MONITORING_PRODUCT = DISABLED_NOT_READY` held

## 16. Selective off-machine protection

- [x] eCourts raw artifacts + observation state confirmed in the CURATED manifest
- [x] Bulk corpus / whole vector table NOT included merely for being large
- [ ] Encrypted upload + readback IF an authorized destination exists
- [ ] Otherwise: exact size/checksum + founder action, no invented destination

## 17. Sprint-2 hosting bakeoff (Gate B)

- [x] Real v1 EXPORT footprint measured (not a clone of the factory DB)
- [x] Reduced serving release defined; user/matter DB separate
- [x] Providers evaluated on CURRENT official pricing + actual measurement
- [x] `HOSTING_BAKEOFF_BLOCKED_BY` = no provisioned in-region instance (~$250-300/mo, tearable down)
- [x] No production cutover this round

## 18. Full verification

- [ ] migration journal, live vs committed schema, fresh install
- [ ] API typecheck, ingest typecheck where touched
- [ ] court/eCourts suites, search battery, workspace/tenant, data-trust contract
- [ ] `platform_config` / audit fingerprint BEFORE and AFTER, proving no test mutation survived
- [ ] Full API suite from final HEAD, bounded concurrency, NEW1 never stopped
