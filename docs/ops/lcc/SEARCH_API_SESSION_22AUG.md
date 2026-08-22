# LCC PUBLIC-LAUNCH BACKEND — session TODO (22 Aug 2026)
All work LOCAL. DATABASE_URL = 127.0.0.1:5432/lawmind. API probed on :3077.
Timings are LOCAL_CONTENDED (ingest fleet + GPU embed + classifier + autovacuum live).

 1. [DONE] P0/P6 Bound every API DB statement (statement_timeout + idle_in_txn).
 2. [DONE] P0/P6 Rankers degrade honestly on their own budget -> `degraded[]` on the wire.
 3. [DONE] P0    Arms run concurrently: request bound = max(arm), not sum.
 4. [DONE] P0.4/P0.5/P3 canonicalAct: BNS/BNSS/BSA + 498 transliteration variants.
 5. [DONE] P3    Backfill act_key for the 2023 codes (5,723 rows).
 6. [DONE] P0.4  Section queries route to judgment_statute_refs, not full text.
 7. [DONE] P0.1  Exact citation/section lookup runs FIRST and skips the sparse arm.
 8. [DONE] P0.2  Case-name trigram lookup under its own 2.5s budget.
 9. [DONE] P2    precedentialEffect wired into GET /judgments/:id (was add-to-matter only).
10. [DONE] P2    Measure the propagate-treatment backlog (adverse edge, stored 'none').
11. [DONE] P2    Wire the derived effect into POST /search results + /treatment.
12. [DONE] P0.1b `cite:1995 INSC 227` unquoted returns 0 silently.
13. [DONE] P6    No index on judgments.overruled_status - status queries scan 18.7M.
14. [DONE] P1    Evidence/provenance: what the API claims vs what the ladder proves.
15. [DONE] P7    Real-path benchmark, 5 groups, p50/p95/max/timeouts.
16. [DONE] Run api test suite; update docs/CURRENT_PLAN.md; bus the other lanes.
17. [OPEN] P4    eCourts audit actor - NOT STARTED this session, see below.

## NOT DONE, and saying so
- P4 eCourts canary: not started. Needs FQ-ECOURTS-ACTOR resolved and NEW2
  coordination; NEW2's own bus says eCourts is blocked on that and nothing else.
- P5 premium backend spine: traced only as far as add-to-matter and the
  precedential layers. matters/timeline/hearing-prep untouched.
- P1 semantic roles (holding vs party argument vs quoted precedent): NOT built.
  Verified only that the API does NOT overclaim - it asserts no semantic role,
  `holding` is honestly empty, and no route reads ROLE_VERIFIED_SET_V1.
- Concept queries: sparse arm times out on 6 of 6. Bounded and made visible,
  NOT fixed. Handed to NEW1 (bus 1014).

## NEEDS THE USER (blocked, not forgotten)
- 3 synthetic rows remain in `judgments` (court='Test Court',
  case_title LIKE 'SYNTHETIC — Duplicate Copy%', source_url LIKE 'test://dup/%',
  created 2026-08-22T05:14Z). They are route.test.ts fixtures whose teardown did
  not run because I stopped that test mid-way. They make
  `court-category.test.ts` "NO court in the corpus is unclassified" FAIL.
  The DELETE was refused by the auto-mode classifier. Either approve it or run
  `services/api/src/search/route.test.ts` to completion so its own teardown runs.
