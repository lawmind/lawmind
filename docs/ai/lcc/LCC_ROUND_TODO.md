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
- [~] P0.9 Recovered text: honour `digit_trust`, never treat OCR digits as primary-exact — nothing in the API reads recovered text yet; the rule is recorded at the predicate as `RECOVERED_DIGITS_NOT_PRIMARY`
- [x] P0.10 Fixtures incl. NEW2's measured damaged-chunk population — row-for-row agreement over 1,000 rows incl. convicted
- [x] P0.11 DONE proof: a newly-convicted damaged judgment is safe BEFORE NEW1 quarantine runs — 2023:PHHC:092818 — control-char paragraph withheld, no job involved

## P1 — SEARCH RESOURCE ISOLATION
- [x] P1.1 Inspect ACTUAL pool/server limits first (no dossier percentages) — max_connections 100, shared_buffers 2GB — the API pool of 10 was the constraint
- [x] P1.2 Minimum proven isolation: research admission control / separate pool / budgets — `pools.ts` + `search/admission.ts`
- [~] P1.3 Core paths protected: auth · save-to-matter · exact citation · billing webhook · judgment read
- [x] P1.4 Bounded slow-query test proving core stays responsive under deliberate research load — core p95 2,809 ms → 69 ms
- [ ] P1.5 Coordinate with NEW1 before any sparse semantics change (bus)

## P2 — ALL-COMMON SPARSE FAILURE
- [ ] P2.1 Read NEW1's paired evidence (current vs dense-only vs bounded rare-term)
- [ ] P2.2 Implement the smallest safe policy from that evidence
- [ ] P2.3 Wire reports WHY sparse was skipped; no empty result from an arm that did not run

## P3 — PAGINATION + AMBIGUITY (core product gate)
- [ ] P3.1 Design continuation contract WITH NEW1 (bus)
- [ ] P3.2 Result #6/#20 reachable
- [ ] P3.3 Pins keep position; ordering stable across pages; no dupes/missing
- [ ] P3.4 Filters part of continuation identity
- [ ] P3.5 ALL ambiguous citation candidates reachable
- [ ] P3.6 Honest total/count semantics
- [ ] P3.7 Additive — existing clients unaffected

## P4 — CASE-NAME SERVER PATH
- [ ] P4.1 Regression guard for the uppercase AND/OTHERS parser defect
- [ ] P4.2 Quality and latency reported separately

## P5 — SECURITY / PRIVACY BLOCKERS
- [ ] P5.A Admin authorization: real roles, deny-by-default, advocate cannot reach `/admin/*`
- [ ] P5.B Rate limiting: magic-link, auth, research/search, expensive routes
- [ ] P5.C Query-log privacy: stop logging raw query text; keep class/length/latency/arms/zero-result/degraded/request-id
- [ ] P5.D Account deletion / data requests: real backend (request → verify → cascade/anonymise → audit)
- [ ] P5.E API compatibility: minimal N-1 / additive envelope-version strategy

## P6 — CURRENTNESS PRODUCT TRUTH
- [ ] P6.1 OD-14 three layers preserved; derived fields are the product source
- [ ] P6.2 Verified adverse treatment with unresolved scope never renders as "no adverse treatment"
- [ ] P6.3 Minimum structured field for NEW3; no badge copy in the server
- [ ] P6.4 No-signal state scoped to LawMind's resolved sources + as-of date

## P7 — RELEASE / BACKUP PREP (local-first, no purchase)
- [ ] P7.1 Small release-pipeline proof: schema → export → Linux PG → indexes → checksums → search-equivalence → rollback
- [ ] P7.2 Curated-moat backup pack: exact tables, deterministic dump/manifest/checksum, compressed bytes, exact recurring cost
- [ ] P7.3 Fix stale job-registry entries

## P8 — eCOURTS (prepare only, no live request)
- [ ] P8.1 Actor resolution · kill-switch · cap · ledger · one-canary runbook · raw observation preservation
- [ ] P8.2 LISTED never implies HEARING_OCCURRED

## P9 — MEASURE (label LOCAL_CONTENDED / LOCAL_QUIET)
- [ ] P9.1 citation unique · citation ambiguity · case-name · statute/BNS · concept · core txn under research load
- [ ] P9.2 For each: quality status · p50 · p95 · max · degraded · timeouts

---

## ADDENDUM (binding, 22 Aug 2026) — corrections that override the prompt

### A — DATE QUALITY MUST AFFECT TEMPORAL CLAIMS
- [ ] A.1 `DATE_SUSPECT` never treated as authoritative for currentness chronology / "later case" ordering
- [ ] A.2 `DATE_UNKNOWN` ≠ `DATE_SUSPECT` ≠ absent row, all the way to the wire
- [ ] A.3 `judgment_date` never rewritten; derived temporal claims qualified or refused
- [ ] A.4 Bus NEW3 on product representation

### B — REQUEST VALIDATION GAPS
- [ ] B.1 `dateFrom` / `dateTo` really validated (V4 found them insufficient)
- [ ] B.2 court / filter strings validated
- [ ] B.3 pagination inputs validated once P3 lands
- [ ] B.4 Plan changes ONLY where EXPLAIN shows material cost

### C — SERVER OBSERVABILITY IS LCC'S
- [ ] C.1 Metrics interface: 5xx · search latency · degraded rate · timeouts · pool saturation · admission saturation · slow queries
- [ ] C.2 Job/cron failure · checkpoint stall · disk · connection pressure · release-data age
- [ ] C.3 Alert CONDITIONS defined in code; no paid vendor activated
- [ ] C.4 "Logs only" is not observability — an endpoint a machine can read

### D — SEARCH EVENT PERSISTENCE, PRIVACY FIRST
- [ ] D.1 Define the minimum privacy-safe event (class · length · latency · result count · degraded · zero-result · release id)
- [ ] D.2 Raw query text omitted by DEFAULT
- [ ] D.3 Saved searches stay a separate, intentional user feature — never conflated with analytics

### E — BACKUP MUST BE RESTORABLE
- [ ] E.1 dump → wipe disposable target → restore → verify row/checksum invariants
- [ ] E.2 Measure restore time
- [ ] E.3 No full 287 GB clone locally

### F — CITATION RESOLVER HANDOFF
- [ ] F.1 Do NOT build a second resolver; wait for the fifth agent's canonicalization experiment

### G — LONG-QUERY FUTURE PATH
- [ ] G.1 500 chars documented as the CURRENT SAFE BOUND, not a product limit
- [ ] G.2 Reject/guide honestly; never silently truncate; never imply long-passage research works

### H — TEST COURT ROWS
- [ ] H.1 IDs + origin evidence + safe cleanup script + pre/post invariants, NOT executed

### I — BILLING OWNERSHIP
- [ ] I.1 Server entitlement truth is LCC's; contract agreed with NEW3 before either edits

### GLOBAL CORRECTIONS
- [ ] G1 No founder-queue item marked closed on an agent's recommendation
- [ ] G3 Every search claim reports QUALITY + SAFETY/COVERAGE + LATENCY (P9 shape)
- [ ] G4 Release gates classed LEGAL_SECURITY / CORE_PRODUCT / FEATURE / COMMERCIAL_MEASUREMENT
- [ ] G7 Quality state survives to where its legal meaning matters — and no further
