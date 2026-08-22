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
