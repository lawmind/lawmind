# LCC — PRODUCTION SEARCH + LEGAL SAFETY + API SPINE

Live checklist for the round opened 22 Aug 2026. **This file is the progress
board** — it is updated as each item lands, and every `[x]` means OBSERVED
(ran, measured, or tested), never "code exists".

Status key: `[ ]` not started · `[~]` in progress · `[x]` done + evidence · `[!]` blocked/founder

---

## P0 — STRUCTURAL BODY-TEXT SAFETY
- [x] P0.1 Trace every body-text-dependent path (sparse · dense · paragraph evidence · generation · counter-argument · briefing) — 5 sites; briefings read paragraph NUMBERS only, no body — no change needed
- [x] P0.2 One shared `body_text_safe` predicate module, mirroring `judgment_quality_contract`, not legacy `text_quality` — `search/body-text-safety.ts`
- [x] P0.3 Drift guard: predicate asserted against the DEPLOYED `pg_get_viewdef` output — 2 DB-backed tests green
- [x] P0.4 Dense arm refuses unsafe bodies as semantic evidence — `retrieve.ts` dense() outer filter
- [x] P0.5 Sparse arms refuse unsafe bodies as lexical evidence — sparse() + sparseAny()
- [x] P0.6 Paragraph/exact-span evidence suppressed for unsafe bodies (never invented, never silently shown) — fillParagraphFallback + final-read belt
- [x] P0.7 Metadata routes (citation/title/case number) still find damaged judgments — with state visible — proved: `cite:` found it, `bodyTextSafe:false`
- [x] P0.8 Generation inputs (counter-arguments, briefings) refuse unsafe bodies — counter.ts inherits + carries the flag; passagesForRerank filtered
- [x] P0.9 Recovered text: honour `digit_trust`, never treat OCR digits as primary-exact — nothing in the API reads recovered text; the rule is pinned at the predicate as `RECOVERED_DIGITS_NOT_PRIMARY` — nothing in the API reads recovered text yet; the rule is recorded at the predicate as `RECOVERED_DIGITS_NOT_PRIMARY`
- [x] P0.10 Fixtures incl. NEW2's measured damaged-chunk population — row-for-row agreement over 1,000 rows incl. convicted
- [x] P0.11 DONE proof: a newly-convicted damaged judgment is safe BEFORE NEW1 quarantine runs — 2023:PHHC:092818 — control-char paragraph withheld, no job involved

## P1 — SEARCH RESOURCE ISOLATION
- [x] P1.1 Inspect ACTUAL pool/server limits first (no dossier percentages) — max_connections 100, shared_buffers 2GB — the API pool of 10 was the constraint
- [x] P1.2 Minimum proven isolation: research admission control / separate pool / budgets — `pools.ts` + `search/admission.ts`
- [x] P1.3 Core paths protected: auth · save-to-matter · exact citation · billing webhook · judgment read — all on the CORE pool; no billing path exists yet to protect
- [x] P1.4 Bounded slow-query test proving core stays responsive under deliberate research load — core p95 2,809 ms → 69 ms
- [x] P1.5 Coordinate with NEW1 before any sparse semantics change (bus) — bus 1031; acted on NEW1's own 1025 evidence

## P2 — ALL-COMMON SPARSE FAILURE
- [x] P2.1 Read NEW1's paired evidence (current vs dense-only vs bounded rare-term) — bus 1025 — 4 arms, 60 gold queries
- [x] P2.2 Implement the smallest safe policy from that evidence — rarest-3 ANDed is now the ONLY sparse pass; arm C (delete the fallback) refuted
- [x] P2.3 Wire reports WHY sparse was skipped; no empty result from an arm that did not run — `degraded` + new `pin_timeout`

## P3 — PAGINATION + AMBIGUITY (core product gate)
- [x] P3.1 Design continuation contract WITH NEW1 (bus) — NEW1 1027; stability gate measured before choosing re-run over snapshot
- [x] P3.2 Result #6/#20 reachable — tested
- [x] P3.3 Pins keep position; ordering stable across pages; no dupes/missing — tested; `score DESC, id ASC` total order
- [x] P3.4 Filters part of continuation identity — tested — a filtered page returns only that court
- [x] P3.5 ALL ambiguous citation candidates reachable — tested against a real 6-20 group
- [x] P3.6 Honest total/count semantics — real `total` on the structured path; none invented on the hybrid path
- [x] P3.7 Additive — existing clients unaffected — defaults unchanged; 7/7 pagination tests

## P4 — CASE-NAME SERVER PATH
- [x] P4.1 Regression guard for the uppercase AND/OTHERS parser defect — `answerStructured` refuses to pre-empt a case_name; 25/25 query-shape tests
- [x] P4.2 Quality and latency reported separately — P9 table reports rank1, zero, degraded and p50/p95/max in separate columns

## P5 — SECURITY / PRIVACY BLOCKERS
- [x] P5.A Admin authorization: real roles, deny-by-default, advocate cannot reach `/admin/*` — migration 0074, `requireAdmin` on the prefix, 31/31 admin tests incl. 10 new 403s
- [x] P5.B Rate limiting: magic-link, auth, research/search, expensive routes — `rate-limit.ts`, 5/5 tests
- [x] P5.C Query-log privacy: stop logging raw query text; keep class/length/latency/arms/zero-result/degraded/request-id — `search_events` (0075) — no query text column exists
- [x] P5.D Account deletion / data requests: real backend (request → verify → cascade/anonymise → audit) — 6/6 erasure tests
- [x] P5.E API compatibility: minimal N-1 / additive envelope-version strategy — `contract-version.ts`, reported on `/version`

## P6 — CURRENTNESS PRODUCT TRUTH
- [x] P6.1 OD-14 three layers preserved; derived fields are the product source — briefings was the last raw-column surface; now derived
- [x] P6.2 Verified adverse treatment with unresolved scope never renders as "no adverse treatment" — server states `treatmentScope: UNRESOLVED`; the founder-facing UX stays OPEN and is NOT closed by this lane
- [x] P6.3 Minimum structured field for NEW3; no badge copy in the server — `treatmentScope` + `currentnessClaim`, no copy
- [x] P6.4 No-signal state scoped to LawMind's resolved sources + as-of date — `basis: 'lawmind_resolved_sources'` + `asOf`

## P7 — RELEASE / BACKUP PREP (local-first, no purchase)
- [~] P7.1 Release-pipeline proof — schema → export → restore → row/checksum verification PROVEN on this Postgres. **Linux, index-rebuild timings, search-equivalence and rollback are NOT proved** and are not claimed
- [x] P7.2 Curated-moat backup pack — 34 tables, deterministic dump + manifest + sha256 per file, **1.533 GB compressed, 85 s to dump**. Recurring cost NOT quoted: the R2 per-GB rate is a vendor number to read on the day, not from memory (`FQ-BACKUP-SPEND`)
- [x] P7.3 Fix stale job-registry entries — lcc-text-safety-corpus → FINISHED, verified two ways; other lanes' stale rows reported not edited

## P8 — eCOURTS (prepare only, no live request)
- [x] P8.1 Actor resolution · kill-switch · cap · ledger · one-canary runbook · raw observation preservation — runbook written; NO request made; the cumulative-cap gap is stated
- [x] P8.2 LISTED never implies HEARING_OCCURRED — restated in the runbook; no code path writes heard from a cause list

## P9 — MEASURE (label LOCAL_CONTENDED / LOCAL_QUIET)
- [x] P9.1 citation unique · citation ambiguity · case-name · statute/BNS · concept · core txn under research load — 6 classes measured through the real Hono app
- [x] P9.2 For each: quality status · p50 · p95 · max · degraded · timeouts — reported, LOCAL_CONTENDED labelled

---

## ADDENDUM (binding, 22 Aug 2026) — corrections that override the prompt

### A — DATE QUALITY MUST AFFECT TEMPORAL CLAIMS
- [x] A.1 `DATE_SUSPECT` never treated as authoritative for currentness chronology / "later case" ordering — `as-at.ts` returns `date_unreliable`
- [x] A.2 `DATE_UNKNOWN` ≠ `DATE_SUSPECT` ≠ absent row, all the way to the wire — `dateQuality` carries three values and a null
- [x] A.3 `judgment_date` never rewritten; derived temporal claims qualified or refused — refused, not qualified
- [x] A.4 Bus NEW3 on product representation — bus 1034

### B — REQUEST VALIDATION GAPS
- [x] B.1 `dateFrom` / `dateTo` really validated (V4 found them insufficient) — ISO + real-calendar-day refine + range order
- [x] B.2 court / filter strings validated — bounded to 120 chars
- [x] B.3 pagination inputs validated once P3 lands — page 1-100, pageSize 1-25, integers only; 5 rejection cases tested
- [x] B.4 Plan changes ONLY where EXPLAIN shows material cost — the MATERIALIZED fence was chosen from a 9,255,009 vs 18.72 cost comparison

### C — SERVER OBSERVABILITY IS LCC'S
- [x] C.1 Metrics interface: 5xx · search latency · degraded rate · timeouts · pool saturation · admission saturation · slow queries — `GET /admin/metrics`
- [x] C.2 Job/cron failure · checkpoint stall · disk · connection pressure · release-data age — connection pressure, longest statement, db size, corpus age
- [x] C.3 Alert CONDITIONS defined in code; no paid vendor activated — `ALERT_RULES` + evaluated `alerts[]`
- [x] C.4 "Logs only" is not observability — an endpoint a machine can read — JSON, admin-gated, no identities in it

### D — SEARCH EVENT PERSISTENCE, PRIVACY FIRST
- [x] D.1 Define the minimum privacy-safe event (class · length · latency · result count · degraded · zero-result · release id) — migration 0075
- [x] D.2 Raw query text omitted by DEFAULT — there is no column for it; `searches` stays unwired
- [x] D.3 Saved searches stay a separate, intentional user feature — never conflated with analytics — untouched

### E — BACKUP MUST BE RESTORABLE
- [x] E.1 dump → wipe disposable target → restore → verify — and it FAILED first: 6 enum-bearing tables missing (`pg_dump -t` omits types) and a checksum crying wolf on an unordered LIMIT. Both fixed; `--skip-dump` re-runs the restore half against an existing pack
- [x] E.2 Measure restore time — **820.7 s** to restore 1.53 GB into a disposable database and verify it (LOCAL_CONTENDED). 31 of 34 tables exact incl. 22,322,047 citation rows, content checksum MATCH; the 3 deltas are rows this session's own tests wrote to the live database AFTER the snapshot, not pack defects — and the tool now compares against the counts recorded at dump time rather than live ones
- [x] E.3 No full 287 GB clone locally — 1.53 GB packed; `judgments` (151 GB) and `judgment_paragraphs` (92 GB) deliberately excluded as rebuildable

### F — CITATION RESOLVER HANDOFF
- [x] F.1 Do NOT build a second resolver; wait for the fifth agent's canonicalization experiment — not built; NEW2's 26.3% constraint recorded

### G — LONG-QUERY FUTURE PATH
- [x] G.1 500 chars documented as the CURRENT SAFE BOUND, not a product limit — recorded at the schema with the intended long-passage route
- [x] G.2 Reject/guide honestly; never silently truncate; never imply long-passage research works — 400 with an explicit message; nothing is shortened

### H — TEST COURT ROWS
- [x] H.1 IDs + origin evidence + safe cleanup script + pre/post invariants, NOT executed — full census returns 0; `docs/ops/lcc/TEST_COURT_ROWS_FINDING.md`; NOT closed

### I — BILLING OWNERSHIP
- [!] I.1 Server entitlement truth is LCC's; contract agreed with NEW3 before either edits — NOT STARTED. The addendum scopes this to "if/when billing work begins"; it has not.

### GLOBAL CORRECTIONS
- [x] G1 No founder-queue item marked closed on an agent's recommendation — four entries filed, none closed
- [x] G3 Every search claim reports QUALITY + SAFETY/COVERAGE + LATENCY (P9 shape) — the P9 table carries rank1, unsafe-evidence, zero, degraded and p50/p95/max
- [x] G4 Release gates classed LEGAL_SECURITY / CORE_PRODUCT / FEATURE / COMMERCIAL_MEASUREMENT — `docs/ops/lcc/RELEASE_GATE_CLASSES.md`
- [x] G7 Quality state survives to where its legal meaning matters — and no further — bodyText, dateQuality and treatmentScope reach the wire; nothing else internal does

---

# ROUND 2 — PRODUCTION SEARCH · LEGAL TRUST · PRODUCT BACKEND · RELIABILITY

Opened 23 Aug 2026. Same status key. Every `[x]` means OBSERVED.

## R1 — DATE QUALITY REACHES TEMPORAL LOGIC (prompt P1)
- [x] R1.1 Re-checked at HEAD: `as-at.ts` was the ONLY consumer. Traced every `judgment_date` site — 22 files, 6 of them legally material
- [x] R1.2 One shared module, not a second comment — `judgments/date-quality.ts`, 6/6 tests against the live table
- [x] R1.3 `DATE_UNKNOWN` != `null` all the way to the wire — a string and a JSON null, never three values. Asserted directly
- [x] R1.4 Only `DATE_SUSPECT` refuses. Silence never refuses — the `is_bail_order` NULL failure, avoided by rule
- [x] R1.5 Wired: `GET /judgments/:id` · `/treatment` (+ `datesContradicted`, `chronologyReliable`) · `/graph` · `GET /citations/:id`
- [x] R1.6 `propagate-treatment.ts` — a SUSPECT citing date is DEMOTED below an equally strong candidate, never excluded; `citingDateState` travels with it
- [x] R1.7 Nothing removed from search. Discoverability untouched — the problem is derived certainty
- [x] R1.8 OBSERVED on the wire: all four values, and `chronologyReliable: false` firing on a real page
- [x] R1.9 `judgment_date` never rewritten

## R2 — TENANT / IDOR SECURITY BATTERY (prompt P13) · LEGAL_SECURITY GATE
- [x] R2.1 USER_A / USER_B / ADMIN, real tokens, direct ids — `security/tenant-isolation.test.ts`, 13/13
- [x] R2.2 **33 cross-tenant attempts · 0 FAIL · 0 403-instead-of-404**, matrix printed by the test
- [x] R2.3 Covered: matter · events · event visibility · authorities (read/write/delete) · shares (read/write) · briefings · documents (read/write/list) · document citations · saved searches (feed/delete) · annotations (list/delete)
- [x] R2.4 Writes checked at the ROW, not just the status — a 404 that still ran its UPDATE would pass a status-only test
- [x] R2.5 400 is INCONCLUSIVE, never a pass — a probe bounced by the body validator never reached the ownership check
- [x] R2.6 Admin separation with a POSITIVE control — a middleware refusing everyone would otherwise pass every assertion
- [x] R2.7 User enumeration: `/me` cannot be steered by a query parameter; `/admin/users` is admin-only
- [x] R2.8 Token replay: a token signed with an unknown secret is refused
- [ ] R2.9 Document/OCR download — **no route exists to test.** When one lands the ownership check goes BEFORE the signed URL (NEW3 1043 agrees)

## R3 — PROVIDER PRIVACY GATEWAY (prompt P14)
- [x] R3.1 Inventory of every provider egress in the repo — 4 modules, 1 in `services/api`
- [x] R3.2 The real defect: `call.ts` chose the PROVIDER by which API key was set. A deployment variable was making a confidentiality decision
- [x] R3.3 `canSendToProvider(payloadClass, provider)` — one contract, eight fields per provider — `llm/provider-policy.ts`
- [x] R3.4 Six payload classes; `PUBLIC_QUERY` treated as private in substance; `OTHER` resolves to sensitive
- [x] R3.5 Retention / training-use are `UNVERIFIED` for all three providers rather than plausible — a wrong term is worse than a blank
- [x] R3.6 Private generation REFUSES: no approved private-data provider exists. Not weakened for the walkthrough
- [x] R3.7 Proved by ZERO outbound requests with a counting fetch, not by a refusal after the fact — 10/10
- [ ] R3.8 `ingest/inferx.ts`, `ingest/openrouter.ts`, `harness/generate.ts` are OUTSIDE the gate. Corpus-only today, so no exposure; sent to NEW2/NEW1 rather than edited across lanes

## R4 — ENTITLEMENT SPINE · JOB CONTROL · CREDITS · WEBHOOKS (prompts P7/P15/P16/P18)
- [x] R4.1 Migration `0077` — entitlements · entitlement_events · credit_ledger · premium_jobs · experiments · activation. Applied
- [x] R4.2 Migration `0078` — a CHECK that let a refund ADD credit. Found by writing the test, fixed forward-only
- [x] R4.3 Capabilities, never a `PRO` boolean; no plan name or price anywhere in the server
- [x] R4.4 `adverse_treatment_visibility` is SAFETY_CRITICAL and `requireCapability` refuses to gate it IN CODE
- [x] R4.5 Idempotent grant — a redelivered purchase grants once, proven under `Promise.all`
- [x] R4.6 Expiry computed at READ, so a down sweep cannot give the product away
- [x] R4.7 Credit invariant: issued once · redeemed atomically · one job. **Two simultaneous redemptions of one credit spend exactly one** — observed
- [x] R4.8 A retry returns the ORIGINAL redemption; a failed generation reverses at most once
- [x] R4.9 Job control: client `idempotencyKey` + server `params_hash` + per-user cap 2 + global cap 20 + attempt-at-CLAIM + cancellation + requeue on SILENCE
- [x] R4.10 Webhooks: constant-time signature, **no development bypass**, replay window, unknown-user DEFERRED not dropped, forged events STORED as evidence, payload HASH with no body column
- [x] R4.11 28/28 in `entitlements.test.ts`; 10/10 in `premium/route.test.ts`
- [!] R4.12 No provider activated. No price. RevenueCat/store integration needs founder credentials — `FQ-BILLING-PROVIDER`

## R5 — PREMIUM PREVIEW, AFTER SPEC_V1 ARRIVED (prompt P8, correction 3)
- [x] R5.1 Waited for `PREMIUM_GROWTH_SPEC_V1`; built against it, not ahead of it
- [x] R5.2 `costClass: 'cheap'` on the wire so §6's table is a query, not an assertion
- [x] R5.3 **A test asserts the preview writes no `llm_calls` row** — structural, not promised
- [x] R5.4 `adverseAuthorities` is a LIVE read and is free to everyone, paid or not
- [x] R5.5 **SPEC_V1 §6 refuted:** supporting/contrary counts are not cheap and are not counted — `matter_authorities` has NO stance column. `stanceNotComputed: true` rather than a fabricated split. Sent to NEW3 (bus 1053)
- [x] R5.6 Every premium route behind a flag that DEFAULTS OFF — client existence never implies backend capability (correction 8)

## R6 — CITATION RESOLVER v0 (prompt P3, correction 1)
- [x] R6.1 ONE deterministic component, no backfill, **no `--apply` flag exists** — `citations/resolver.ts`, 13/13
- [x] R6.2 Reuses `lawmind_citation_keys`; ONE indexed read per batch; never a correlated scan
- [x] R6.3 `relationship: 'UNKNOWN'` and `verifiedTreatmentEligible: false` on EVERY result — resolver coverage cannot move currentness coverage
- [x] R6.4 AMBIGUOUS returns every candidate and picks no winner — not newest, not longest, no bench-folding. Asserted by scanning the payload for `chosen`/`best`/`preferred`/`winner`
- [x] R6.5 `UNIQUE` claims one judgment WE HOLD, never uniqueness in the world; `TARGET_NOT_HELD` is a separate state
- [x] R6.6 Bounded dry run n=8,000: **73.2% refused, ALL of it EMPTY rows** · formed 2,142 · hit 43.28% · unique 40.85% · ambiguous 2.43% (p50 2, p90 38, **max 845**) · not-held 56.72% · 34 ms/1k · **0 model calls**
- [x] R6.7 Rates are over FORMED, never over n — refusing more junk cannot flatter the rate
- [x] R6.8 **false-unique% deliberately NOT reported** — it needs an adjudicated sample, and a plausible number is what would let a backfill through
- [x] R6.9 The 73.2% independently corroborates NEW2's placeholder finding; verified by reading raw rows, not trusting my own gate

## R7 — NEW1's UNCITED-AUTHORITY BIAS (bus 1050)
- [x] R7.1 Reproduced against the DEPLOYED `pg_get_viewdef`, not the migration file — two `ca.judgment_id IS NOT NULL` rescue sites, and the `length(full_text) < 2000` gate is the one guarding 40%
- [ ] R7.2 **View NOT changed.** The threshold needs NEW2's class evidence; choosing a number that feels right is the failure this repo has already paid for. `FQ-ELIGIBILITY-UNCITED`; one counterfactual table requested from NEW1 (bus 1054)
- [x] R7.3 NEW1's instrument limit carried verbatim: ADVOCATE-100's 27/27 clean zero is a property of a gold made of landmarks, not a clean bill. Effective n is 27, not 281

## R8 — MEASUREMENT AND HOUSEKEEPING
- [x] R8.1 `docs/API_CONTRACTS.md` — additive entries for date quality and premium; status table repaired (7 rows missing, 3 of them pre-existing). Guard green: 102 endpoints, 89 built
- [x] R8.2 `services/api` eslint CLEAN, including one pre-existing `no-useless-assignment` in `qlang/parse.ts`; qlang 42/42 after the fix
- [x] R8.3 Staging: rewritten as the SERVER-SIDE INPUT to NEW3's package rather than a rival recommendation. 291 GB measured, and 83% of it is rebuildable
- [!] R8.4 **Full API suite did not complete, and is not claimed green.** Run 1 died with Postgres `could not read blocks ... Invalid argument` and `out of memory` under three-session contention; run 2 stalled on `arguments/counter`, which took 3,235,480 ms in run 1. Every targeted suite passes
- [ ] R8.5 P10 release proof (Linux → indexes → search-equivalence → rollback) NOT advanced — another session was live in `services/api/src/p10-probe.ts` and I did not collide with it
- [x] R8.6 P11 Test Court census — **RE-RUN, and the answer changed from 0 to 6.** Six `court = 'Test Court'` rows exist, all created **today between 02:41 and 02:51 UTC**, all carrying `source_url LIKE 'test://%'` and `case_title LIKE 'SYNTHETIC — %'`. They are leaked FIXTURES from a concurrent session's test run, not corpus data. **Nothing deleted.** This also explains the original "3 synthetic Test Court rows" claim the 22 Aug census could not reproduce: the population is transient, so a census answers 0 or N depending on whether a suite is mid-run. `docs/ops/lcc/TEST_COURT_ROWS_FINDING.md` §Re-census
- [x] R8.7 Regressions this round, caused and fixed: three `_at` columns cast to Postgres text (Hermes renders that as Invalid Date; the repo's own guard caught it), then the SAME guard catching the pattern inside the explanatory comment written about it; and `admin/data-requests.test.ts` seeding an ordinary advocate against an admin route, 4 failures predating this round from `0074`'s deny-by-default — the test was the stale half, not the middleware
