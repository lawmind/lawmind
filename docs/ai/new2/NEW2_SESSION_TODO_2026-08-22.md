# NEW2 — DATA TRUTH / CITATION IDENTITY / GOLD · session checklist
**22 Aug 2026.** Derived from the founder's NEW2 round contract (P0–P9) and its addendum.
Lane question: *can the rest of LawMind trust the underlying evidence?*
`[x]` done + evidence · `[~]` partial, stated why · `[!]` founder-queued · `[-]` deliberately not done

---

## P0 — quality jobs without starving the box
- [x] **P0.1 Checkpoints inspected** — date-quality COMPLETE (713,136 read = written; 86.90% VERIFIED / 8.41% UNKNOWN / 4.68% SUSPECT) · text-safety screen COMPLETE (18,698,968 screened) · recovery worker idle with 67 documents recovered
- [x] **P0.1b hc-classify STOPPED mid-session — corrected, because I reported it as live**
      When first inspected its cursor was advancing and I recorded it as LIVE. It is not.
      It stopped at **4,865,352 of 18,698,968 classified (26.0%)**, 13,833,616 remaining,
      last cursor write ~13:33 local. Its error log's write-cancellation retries
      (`57014`) are stamped **10:24 — before my first heavy scan at ~12:34** — and the
      text-damage persist I resumed did not start until ~14:11, well after it stopped.
      **So I cannot attribute the stop to my own work, and I am not going to claim
      either way.** [INFER, weak]
      The cursor file is now empty. That is **safe by design**: an unparseable
      checkpoint restarts from zero, and the walk's predicate is
      `hc_class_method IS NULL`, so a zero restart redoes nothing and skips nothing —
      it only pays a longer first page. Not restarted: the gate read CPU 90.2% /
      commit free 3.3%.
- [x] **P0.2 Gate read before every heavy step** — and `DATABASE_URL` exported first, or DB_SCAN reads DEFER for the wrong reason
- [x] **P0.3 Resumed the one stopped job, in a quiet window** — text-damage persist had been stopped at line 578,845 on resource grounds. Resumed at CPU 28% / GPU 1% and **finished the full 1,626,762-row export in 2,328s**: 79,381 `script_quality` claims written (+51,265 this session), 56,641 refused as stored-echo-only, 1,490,740 already claimed. One orphaned 12m47s query from my own killed process was cancelled rather than left holding IO.
- [x] **P0.4 Distinctions checked in the data** — and one is broken. `body_text_safe` collapses TEXT_UNSAFE vs UNKNOWN; see P9.

## P1 — the ≥100,000 shared neutral-citation question
- [x] **P1.1 True census** — **155,388 groups · 361,045 rows · worst group 1,257** (NEW1's 303 was a capped sample). **26.3% of all 1,370,683 citation-bearing rows share their citation.** Allahabad is 75.3% of it.
- [x] **P1.2 Provenance from live code** — `neutralCitationFrom()` takes the FIRST citation-shaped token in the first 3,000 chars of the document's own text (`hc-load.ts:217`); SC takes `case_id` from metadata (`sci.ts:196`). **No batch-stamping code path exists**, so NEW1's hypothesis (b) as worded was ruled out before any document was read.
- [x] **P1.3 Stratified sample** — 1,786 groups across 24 courts × 4 size bands × byte-identity; **6,595 source documents read**
- [x] **P1.4 Source-document evidence** — offset, repetition, solo-line and 260 chars of context per document; every row carries the addendum's evidence class (PRINTED_ON_DOCUMENT / OFFICIAL_METADATA_ONLY / NOT_FOUND / SOURCE_UNAVAILABLE)
- [x] **P1.5 Classified** + **P1.6 prevalence with CIs, by court**
- [x] **P1.7 Sent to NEW1 (bus 1019) and LCC (bus 1020). Nothing deduplicated or rewritten.**

| verdict | share of shared rows | 95% CI | ~rows |
|---|---|---|---|
| DUPLICATE_DOCUMENT | 53.89% | 53.78–54.00 | 194,577 |
| CONNECTED_MATTER_COMMON_ORDER | 30.74% | 23.22–37.05 | 110,978 |
| MULTIPLE_ORDERS_SAME_CASE | 13.85% | 7.69–21.47 | 50,018 |
| COURT_SHARED_BATCH_CITATION | 0.91% | 0.63–1.31 | 3,296 |
| **EXTRACTOR_STAMP_CONTAMINATION** | **0.11%** | 0.04–0.25 | **414** |
| **NOT_A_CITATION** | **0.10%** | — | **366** |
| SOURCE_UNAVAILABLE / UNDETERMINED | 0.38% | — | 1,388 |

**Answer: the corpus identity is not wrong. It is legally complex, plus a duplicate-ingestion problem.**
All three mechanisms proven on the PDFs with an independent extractor (poppler, not the `unpdf` path used at ingest):
`2025:PHHC:052490-DB` is line 1 of 253 separate orders (the court) · `2026:PHHC:027747-DB` is line 27 of 53, inside *"placed reliance upon … M/s Bansal Casting"* (us) · `2011:AUGUST:23` is the Madras despatch stamp `DM::2011:AUGUST:23::` (never a citation).

## P2 — citation resolver ground truth
- [x] **P2.1/2.2 Truth set built** — 412 records across NEUTRAL_BENCH_QUALIFIED · NEUTRAL_UNQUALIFIED · INSC · SCC · SCC_ONLINE · AIR · SCR · OTHER, each carrying raw source span, recorded and found offset, normalised key, every candidate from all three identity sources, party-name corroboration, true target where provable, alternates, ambiguity reason and provenance
- [x] **P2.3 Ambiguity never resolved by picking one** — 31 records expect REFUSE, split by whether the candidates are the same authority held twice or genuinely different judgments
- [x] **P2.4 Falsifies an over-aggressive canonicalizer** — month-code pseudo-citations, OCR-corrupted court codes, and 12 cross-court `INSC` keys sitting on High Court judgments
- [x] **Versioned** — `truth_set_version` 1.0.0, `source_checked_at`, `normalizer_version_being_tested`

## P3 — resolved-citation battery, four numbers not one
- [x] **A EXTRACTION PRECISION — 100%** printed in the citing judgment, 99.75% at the recorded offset. *My first pass said 82.28%; that was my own bug — a newline inside `citation_text` against a whitespace-collapsed haystack. Corrected and recorded.*
- [x] **B TARGET RESOLUTION — 100% over the 91 provable pins**, 0 contradicted, 37 unprovable either way
- [x] **C AMBIGUITY SAFETY — 1 materially unsafe pin of 17**, after splitting duplicate-row ambiguity (harmless) from different-authority ambiguity (dangerous). One number for both would have read 62.5% unsafe and been wrong.
- [x] **D DAMAGED-TEXT BEHAVIOUR** — no pseudo-citation reached the edge table from damaged text in this sample
- [x] **E Stratified** by form class, citing court, decade, text quality and proven script damage. `AIR` is 97.8% target-not-held; `SCR` and `INSC` resolve best.

## P4 — ADVOCATE-100, the real bound artifact
- [x] **100 tasks, 100 bound, 0 leakage failures, 281 distinct held target judgments, 42 proposition families**
- [x] Every field bound from the row, not the author: target ids · primary source URL · court · date · **date_state** · quality state · citability · overruled status · statute row with commencement date
- [x] **Leakage guard** — longest shared word run between query and target text, limit 6 for concept classes; identifier classes exempt *structurally* (the query IS the citation) with the run still measured
- [x] **All 17 classes covered**, including **6 LONG_FACT_PATTERN / PASTED_PASSAGE tasks marked PRODUCT_REQUIRED / CURRENTLY_UNSUPPORTED** and kept in the set
- [x] **27 tasks expect a refusal** — false premise, insufficient information, target-not-held, not-a-citation
- [x] `A100-007` resolves to the **253-judgment disposal event**; `A100-073` carries a real `set_aside` with add-to-matter disabled

## P5 — BNS / BNSS / BSA, three questions kept apart
- [x] **P5.1 LCC's `canonicalAct` repair audited — CORRECT, and INCOMPLETE.** 273 folded spellings, **0 wrong**; State statutes (MP Rajya Suraksha Adhiniyam, Chhattisgarh Panchayat Raj Adhiniyam …) correctly refused. **Not reverted.** But 40 keys / 592 refs of OCR variants remain unreachable, and 3 of them are genuinely ambiguous and must not be folded.
- [x] **P5.2/5.3 Official inventory, typed** — 196 of 1,059 sections have a usable official row = **18.51%**. BNS **2.23%**. 69 of 226 rows carry a mangled section number; 23 name a section that does not exist. `OFFICIAL_NO_EQUIVALENT` / `NEW_PROVISION` / `REPEALED_NO_DIRECT_EQUIVALENT` are **empty and stay empty**.
- [x] **P5.4 Correspondence ≠ applicability** — commencement date read from `statutes`, offence date is an input, nothing mounted on a correspondence row
- [!] **FQ-BNS-CORRESPONDENCE-COVERAGE** — we hold none of IPC/CrPC/IEA, so the old-section half is unverifiable in principle

## P6 — targeted OCR
- [x] **ADVOCATE-100 wired into the recovery queue** as a gold source — one line, because `goldIds()` already walks for `judgment_id` (`recovery-queue-cli.ts`). 281 gold ids now read; `tsc --noEmit` clean.
- [x] **6 new CITED_AUTHORITY documents enqueued** — all newly convicted by the persist run I finished this session
- [~] **Worker not run.** The gate went to CPU 82.6% / commit free 6.0% / GPU 99% when the queue was filled. OCR at 6.2s/page into that is the convoy P0 forbids. Queued, not started, deliberately.
- [x] Provenance rules already enforced by the existing pipeline: original text never overwritten, engine/version/page/digit_trust recorded, no promotion past `digit_trust`

## P7 — date quality
- [x] **Not reopened** — v1.1 stands
- [x] **Bound into the gold** — every ADVOCATE-100 target carries DATE_VERIFIED / DATE_SUSPECT / DATE_UNKNOWN / NOT_ANALYSED, and each currentness-critical task carries a resolved requirement: `QUALIFY_OR_REFUSE_CHRONOLOGY` where any target is suspect, permission for a chronological claim only where every target is DATE_VERIFIED
- [x] No date rewritten

## P8 — eCourts acceptance
- [x] **Zero requests made.** Ledger remains refusals-only; `FQ-ECOURTS-ACTOR` unanswered.
- [x] **Independent acceptance suite authored** — 7 acceptance questions and 10 fixtures covering raw-response truth, CNR identity, next-date interpretation, bench fields, LISTED ≠ HEARD, order-link semantics, duplicate transitions, stale-page ordering, soft 404, and two establishments sharing a case number. Written before any data exists so the data cannot shape them.

## P9 — one queryable quality contract
- [x] **The defect found and measured** — `body_text_safe` is true for **16,906,647 rows (90.42%)** that mean *never screened*. No writer has ever emitted `clean`; the branch is unreachable. The same view's `text_state` calls those rows TEXT_UNKNOWN — it answers one question two ways and the boolean is what consumers filter on.
- [x] **The view NOT changed.** `body-text-safety.test.ts` pins the expression against `pg_get_viewdef` on purpose. That tripwire worked; I coordinated instead.
- [x] **Exact consumer guidance sent to LCC, NEW1 and NEW3** (bus 1022–1024) with an additive proposal: a `body_text_evidence` column, a `quality_screen_runs` coverage table to make `SCREENED_NO_DAMAGE_FOUND` populatable, and the name `SCREENED_NO_DAMAGE_FOUND` rather than `SCREENED_CLEAN`

---

## Corrections I made to my own work this session
1. **Extraction precision 82.28% → 100%.** A newline inside `citation_text` matched against a whitespace-collapsed span. The data was right, my check was wrong.
2. **A "new damage class" that never existed.** A read script passed `E'\s+'` through a JS template into a Postgres E-string, where `\s` is just `s` — so the "regex" was `s+` and it deleted the letter s from every judgment I printed. Clean text looked like glyph-dropped OCR. Caught because my own letter-frequency measurement contradicted what I was seeing; the screen built on that premise was killed before it finished.
3. **Ambiguity safety 62.5% → 5.9%.** Counting duplicate rows of one judgment as dangerous ambiguity.
4. **Twelve BSA correspondence "contradictions" that were mine.** `3, para 8` is the BPR&D spelling of section 3 paragraph 8; the stored `3(8)` was right and my reader was wrong.
5. **`body_text_safe` numbers moved under other lanes' feet** — 90.68% → 90.42% because the persist job I resumed convicted 51,265 more rows. Both figures recorded rather than one overwritten.

## Do-not-do — honoured
- [-] no corpus-wide citation resolver · no fuzzy dedup of shared-citation groups · no broadened ingestion · no corpus-wide OCR · no search ranking · no product UI · no view or contract changed unilaterally

## Artifacts
`docs/ai/new2/` — `SHARED_NEUTRAL_CITATION_TRUTH_2026-08-22.md` · `BNS_BNSS_BSA_INVENTORY_2026-08-22.md` · `QUALITY_CONTRACT_CONSUMER_GUIDANCE_2026-08-22.md` · `ADVOCATE100.json` · `advocate100-authored.json` · `citation-truth-set.json` · `citation-battery.json` · `shared-neutral-census.json` · `shared-neutral-sample.json` · `shared-neutral-verdicts.json` · `shared-neutral-pdf-evidence.json` · `extraction-precision.json` · `neutral-code-distribution.json` · `insc-key-contamination.json` · `canonicalact-audit.json` · `canonicalact-residue.json` · `bns-correspondence-inventory.json` · `ecourts-acceptance-fixtures.json` · `citation-edge-census.json` · `body-text-safe-audit.json` · `strata-population.json`
