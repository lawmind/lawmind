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
- [ ] Stale leases cleaned ONLY after proving the owning process/session is dead
- [x] NEW1 coarse walk + doc-vector embed + NEW2 citations-cli confirmed RUNNING, untouched

## 1. Retract the false CAPTCHA blocker

- [ ] `FQ-ECOURTS-CAPTCHA` corrected by APPENDED record (history not rewritten)
- [ ] `docs/CURRENT_PLAN.md` R11 false-blocker wording corrected
- [ ] `docs/ai/lcc-r11/LCC_R11_ECOURTS_CONTINUATION.md` carries a correction notice
- [ ] Capability registry / status files relying on the blocker corrected
- [ ] NEW corrective bus messages issued (1521-1525 remain immutable)
- [ ] `AUTHORIZATION_REOPENED = no` held throughout

## 2. Fix the wrong M0 evidence receipt

- [ ] Older `18,947,807` receipt PRESERVED and RELABELLED as a pre-gate snapshot
- [ ] New durable receipt created for the actual Gate-A M0
- [ ] `upstreamUnique = 18,951,606` re-derived FROM SCRATCH, not copied from NEW2
- [ ] manifest SHA `a72d9868...5ac50` cross-checked
- [ ] 1,438 non-fixture partitions; per-partition identity/ETag/size/rows
- [ ] canonical per-partition + overall identity-set digests
- [ ] parity result SHA, freshness generation/body SHA, definition version/SHA
- [ ] `SOURCE_BYTES_RETAINED` / `SOURCE_REFETCH_REQUIRED` stated honestly

## 3. Embedding stage / snapshot_hash ownership

- [ ] `VECTOR_STAGE_ROLE` determined from evidence (FACTORY_SCRATCH vs CANONICAL_SERVING)
- [ ] `SNAPSHOT_IDENTITY_FIX_REQUIRED` answered
- [ ] Explicit generation/snapshot identity contract for future vector inserts
- [ ] Coordinated with NEW1 on the bus; live coarse batch NOT interrupted

## 4. AB-1 — party / title routing

- [x] Root cause READ FROM CODE, not inferred
- [x] NEW3's fixture reproduced DYNAMICALLY from current data, spread across courts
- [ ] Test set: full title, one party, two-party abbrev, punctuation variant,
      common-name control, negative control
- [ ] BEFORE measurement recorded (precision + latency)
- [ ] Fix implemented — exact identifiers still win; case-FIRST; no person dossier
- [ ] AFTER measurement recorded
- [ ] Arbitrary concept queries proven NOT routed into the party path
- [ ] `PARTY_SEARCH_AB1` verdict

## 5. AB-2 — filter-aware admission

- [ ] Battery measured on CURRENT PostgreSQL first (no new engine, no router)
- [ ] Queries: bail, anticipatory bail, quashing FIR, interim injunction, statute concept
- [ ] Scopes: unfiltered, 1 court, court+month, court+year, court+statute, SC, small HC, large HC
- [ ] Per query: eligible population, planner, index usage, rows scanned,
      candidates, p50/p95, state
- [ ] Smallest safe design chosen from the four candidates, with the losers' reasons
- [ ] No `date_part(year, ...)`; sargable range predicates; no ILIKE where an index exists
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` on bounded fixtures only
- [ ] Honest broad-query guard NOT deleted
- [ ] Acceptance minimum met
- [ ] `FILTERED_ADMISSION_AB2` verdict

## 6. NEW3 data-trust API gaps (frozen contract — additive only)

- [ ] judgment: `source`, `sourceEdition`, provenance basis, decision date,
      freshness/currentness, source URL/action
- [ ] citation graph: partiality declaration (`coverage{...}`) — G-3
- [ ] monitoring: six fields frozen with semantics, legitimately null while disabled
- [ ] No AI fields added
- [ ] `DATA_TRUST_API` verdict

## 7. Firm-ready domain model — implementation, not design

- [ ] Actual schema inspected (do NOT infer from NEW3's freeze)
- [ ] Personal Workspace auto-exists for every v1 account
- [ ] Matters migrated to personal Workspace
- [ ] Saved authorities migrated
- [ ] Single-user API behaviour unchanged for the mobile app
- [ ] Tenant isolation tests
- [ ] Rollback / reconciliation proof
- [ ] `FIRM_READY_SCHEMA` verdict

## 8. eCourts — offline request blueprint BEFORE any live request

- [ ] Official JS located in the RETAINED page: `fillDistrict`, `fillcomplex`,
      `fillCauseList`, `submitCauseList`, token rotation
- [ ] Executed OFFLINE with a recording transport that opens NO socket
- [ ] Captured: method, URL, query, content type, field names/order, headers,
      cookies, `app_token`, `ajax_req`, Origin/Referer/X-Requested-With,
      state/district/complex/establishment, civil/criminal encoding
- [ ] `FIELD | OFFICIAL JS | LAWMIND | MATCH/MISMATCH` table published
- [ ] `ECOURTS_OFFLINE_REQUEST_DIFF` verdict

## 9. User-Agent / attribution — settle from the binding contract

- [ ] Binding attribution requirement read LITERALLY
- [ ] User-Agent vs attribution separated only if the record permits
- [ ] Test proving attribution on EVERY permitted network request
- [ ] Secret / full grant string never logged
- [ ] `ATTRIBUTION_TRANSPORT` verdict (HOLD if the record forbids the change)

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

- [ ] Actual INSERT path searched for in the tree
- [ ] Existing then tested with the real fixture; absent then implemented
- [ ] append-only, raw linkage, source key, observedAt, strategy,
      normalized payload, parser version, uncertainty, idempotency
- [ ] `OBSERVATION_WRITER` verdict

## 14. Canary to retention to daily pilot

- [ ] `CANARY` criteria met (fetch, raw, parse, >=1 observation, zero unattributed)
- [ ] Retention probe on ONE source: T, T-1, T-7, T-30, T-90, T-365
- [ ] Only interpretable successes classified; failures prove nothing
- [ ] ONE daily pilot source registered through the existing scheduler
- [ ] `ECOURTS_SWITCH_FINAL` recorded

## 15. Internal eCourts coverage ledger

- [ ] All internal metrics maintained; no marketing surface
- [ ] `USER_MONITORING_PRODUCT = DISABLED_NOT_READY` held

## 16. Selective off-machine protection

- [ ] eCourts raw artifacts + observation state confirmed in the CURATED manifest
- [ ] Bulk corpus / whole vector table NOT included merely for being large
- [ ] Encrypted upload + readback IF an authorized destination exists
- [ ] Otherwise: exact size/checksum + founder action, no invented destination

## 17. Sprint-2 hosting bakeoff (Gate B)

- [ ] Real v1 EXPORT footprint measured (not a clone of the factory DB)
- [ ] Reduced serving release defined; user/matter DB separate
- [ ] Providers evaluated on CURRENT official pricing + actual measurement
- [ ] `HOSTING_SELECTED` or `HOSTING_BAKEOFF_BLOCKED_BY`
- [ ] No production cutover this round

## 18. Full verification

- [ ] migration journal, live vs committed schema, fresh install
- [ ] API typecheck, ingest typecheck where touched
- [ ] court/eCourts suites, search battery, workspace/tenant, data-trust contract
- [ ] `platform_config` / audit fingerprint BEFORE and AFTER, proving no test mutation survived
- [ ] Full API suite from final HEAD, bounded concurrency, NEW1 never stopped
