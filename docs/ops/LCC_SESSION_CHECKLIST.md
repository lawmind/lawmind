# LCC SESSION CHECKLIST — 20–21 Aug 2026

States: `TODO` · `RUNNING` · `VERIFIED DONE` · `BLOCKED`. A state changes only
when the result was **read back**, never when a command exited 0.

## Live state (measured this session, not carried)

```
judgments                           18,698,968   exact count(*)
judgment_paragraphs                 91,231,179
judgment_citations                  22,322,047
embedding_content_representative     8,854,281
judgment_chunks                        620,300   = 40,161 distinct documents
new1_doc_vector_stage                  221,057
new1_doc_vector_stage_refused           34,370   NEW1's quarantine, restorable
document_enrichments                    40,692   30,007 SPAN_VERIFIED · 0 above
judgment_citation_aliases                4,394
judgments overruled_status <> 'none'        98   all evidenced
coverage_cell                              966
statute_mappings                           226   all OFFICIAL_CORRESPONDENCE
hc_class_candidate                       1,000   0 promoted
ecourts_observation / _transition            0   schema live, traffic not started
ecourts_fetch_ledger                        52   ALL refused/kill_switch_off
```

`semantic_tier` over the whole corpus, read back after migration 0063:

```
BROAD_SEARCHABLE          9,934,916
NOT_ELIGIBLE              8,696,250
UNRESOLVED_EXPERIMENTAL      67,802
VERIFIED_SEMANTIC_CORE            0
                         ----------
                         18,698,968   exact
```

## Checklist

| # | item | prompt | state |
| --- | --- | --- | --- |
| 1 | Bind LCC lane, drain 105 inbound messages, cursor to 916 | global | VERIFIED DONE |
| 2 | Reconstruct live state from DB + process table | global | VERIFIED DONE |
| 3 | eCourts observation model, migration 0061, 4 guards proved | P11 | VERIFIED DONE |
| 4 | `ECOURTS_OBSERVATION_PIPELINE_READY` to NEW2 (0896) | P11 | VERIFIED DONE |
| 5 | Coverage denominator re-derived and asserted, not trusted | P1 | VERIFIED DONE |
| 6 | Coverage honest categories, migration 0062 `shortfall_reason` | P1 | VERIFIED DONE |
| 7 | `COVERAGE_TRUTH_V2_READY` to NEW2 + NEW1 (0900, 0901) | P1 | VERIFIED DONE |
| 8 | Treatment manifest reconciled against LIVE data | P0 | VERIFIED DONE |
| 9 | Treatment edge vs derived currentness — split confirmed intact | P0 | VERIFIED DONE |
| 10 | `TREATMENT_MANIFEST_RECONCILED` + broadcast (0905–0907) | P0 | VERIFIED DONE |
| 11 | Eligibility axis C, `decided_brief` excluded (migration 0063) | P2 | VERIFIED DONE — but see correction below |
| 12 | `semantic_tier` three-way split, read back over 18.7M rows | P2 | VERIFIED DONE |
| 13 | Independent purity gate with NEW2 | P3 | VERIFIED DONE — NEW2's 25,000-draw audit and my full aggregate agree (94.1% / 94.79% admitted on absence of evidence), reached independently |
| 14 | Legal-object trust lifecycle, migration 0064, 3 guards proved | P4 | VERIFIED DONE |
| 15 | DeepSeek V4 Flash over NEW2's manifest, 1k rung + audit | P5 | VERIFIED DONE — ladder HALTED, see `MODEL_CLASSIFICATION_1K_AUDIT.md` |
| 15b | Accuracy against NEW2's held-out key (written before any model ran) | P5 | RUNNING |
| 16 | Telemetry: tokens per CANONICAL_TRUSTED, reported UNDEFINED | P6 | VERIFIED DONE |
| 17 | Legal-object vector manifest stamped `trustLevel: SPAN_VERIFIED` | P7 | VERIFIED DONE |
| 18 | Statute authority classes, migration 0065, guard proved | P8 | VERIFIED DONE |
| 19 | BNS/BNSS/BSA applicability vs mapping | P9 | VERIFIED DONE — module correct and 19/19 green; **reachable from nothing in production**, recorded |
| 20 | Common decision / duplicate identity | P10 | PART DONE — one live case characterised, scope measured as the only one in the overruled-class population. General policy TODO |
| 21 | Currentness fixtures for NEW1 | P12 | VERIFIED DONE — 98 rows with adverse edges |
| 22 | Leakage-safe feature contract | P13 | VERIFIED DONE — NEW1's contract checked for a leak I own; disjoint by construction, and the forward risk flagged |
| 23 | Performance on critical LCC paths | P14 | PART DONE — plan shapes verified; wall-clock deferred, box under 3-lane load |
| 24 | Premium readiness checklist (backend only) | P15 | TODO |
| 25 | Bail orders reachable, migration 0066 | P2/NEW1 0916 | VERIFIED DONE |

## Corrections I owe, made in the open

1. **`decided_brief` costs ZERO rows, not "about one percent".** NEW2 caught it
   (0908). `BRIEF_MAX_CHARS = 1500` is below the 2,000-char band floor — 275,048
   rows, **0** at or above it, longest 1,499. My figure came from measuring
   against `text_length >= 1000` rather than the deployed `>= 2000`. The
   exclusion is still right as intent; it is a no-op, not a saving.
2. **My 16.9% "fabrication" is materially a corpus-damage figure.** NEW2's 0918:
   59.2% of `span_not_found` and 70.4% of `no_evidence_offered` are documents
   whose extracted text is not language in any script. And 25 of my 773
   "verified" spans verified **inside glyph garbage** — a substring match against
   glyph codes passes and carries no information.
3. **The first held-out run was n=1, not a 100% failure.** 44 of 45 were
   correctly refused by the difficult-subset gate, because the held-out set is
   drawn from ADMITTED documents that already carry a deterministic verdict.

## Findings that changed a number someone else is using

- **131 of 257 `PARTIAL` coverage cells were not gaps** — 102 `SOURCE_ABSENT`,
  29 `RETRYABLE`. Genuine unattributed gap is 153,204 rows over 115 cells, not
  1,579,075 over 257: a 10.3x overstatement.
- **Allahabad's 50.03% / 50.29% is a 2.00x row-to-document ratio**, not coverage.
  88.6% of all unexplained shortfall is that one court.
- **73 of 98 non-current judgments carry `set_aside` for an `overruled` act.**
  Evidence sound, vocabulary wrong, product consequence real. Now **OD-14**.
- **Model self-agreement is 81.0%** [76.2, 85.0] on the same document, and the
  flips land on the `decided`/`procedural_disposal` boundary that decides Tier A.
- **`VERIFIED_SEMANTIC_CORE` is 0**, reached independently by two lanes.
- **All 226 statute mappings are OFFICIAL_CORRESPONDENCE, none ENACTED.** BNS is
  4 of 358 sections mapped.
