# LCC SESSION CHECKLIST — 20 Aug 2026 (canonical truth / legal intelligence / graph / live state)

Maintained live. States: `TODO` · `RUNNING` · `VERIFIED DONE` · `BLOCKED`.
A state changes only when the result was **read back**, never when a command exited 0.

## Live state reconstructed at session start (measured, not carried)

```
judgments                           18,698,968   exact count(*), matches NEW2's 0857 correction
judgment_paragraphs                 91,231,179
judgment_citations                  22,322,047
embedding_content_representative     8,854,281
judgment_chunks                        620,300   = 40,161 distinct documents
new1_doc_vector_stage                  221,057
document_enrichments                    40,692
judgment_citation_aliases                4,394
judgments overruled_status <> 'none'        98
coverage_cell                              966
statute_mappings                           226
document_vector_staging                      0   drained
ecourts_fetch_ledger                        52   ALL `refused`/`kill_switch_off`, 9-11 Aug
                                                 -> "requests ever made: 0" verified BY QUERY
live processes                        0 fleet    postgres up, no ingest/enrich worker
pg_stat_user_tables                          0   stats zeroed by the crash; est. counts unusable
```

## Checklist

| # | item | prompt | state |
| --- | --- | --- | --- |
| 1 | Bind LCC lane, drain 99 pending bus messages | global | VERIFIED DONE |
| 2 | Reconstruct live state from DB + process table | global | VERIFIED DONE |
| 3 | eCourts observation model — migration 0061, 4 guards proved by execution | P11 | VERIFIED DONE |
| 4 | `ECOURTS_OBSERVATION_PIPELINE_READY` to NEW2 (bus 0896) | P11 | VERIFIED DONE |
| 5 | Coverage denominator: `bench=testcase` re-derived and asserted, not trusted | P1 | VERIFIED DONE |
| 6 | Coverage honest categories — migration 0062 `shortfall_reason` | P1 | VERIFIED DONE |
| 7 | `COVERAGE_TRUTH_V2_READY` to NEW2 + NEW1 (bus 0900, 0901) | P1 | VERIFIED DONE |
| 8 | Treatment manifest reconciled against LIVE data, row by row | P0 | VERIFIED DONE |
| 9 | Treatment edge vs derived currentness — measured, split confirmed intact | P0 | VERIFIED DONE |
| 10 | `TREATMENT_MANIFEST_RECONCILED` published + broadcast (0905-0907) | P0 | VERIFIED DONE |
| 11 | Eligibility axis C: `decided_brief` excluded on measured 15.6% | P2 | RUNNING |
| 12 | `semantic_tier` three-way split in the deployed view | P2 | RUNNING |
| 13 | Stratified purity sample for the independent gate | P3 | TODO |
| 14 | Legal-object trust lifecycle states | P4 | TODO |
| 15 | DeepSeek V4 Flash over NEW2's 190,102 uncertain manifest, 1k rung | P5 | TODO |
| 16 | Legal-object factory telemetry: tokens / CANONICAL_TRUSTED | P6 | TODO |
| 17 | Legal-object vector manifests for NEW1 | P7 | TODO |
| 18 | Statute mappings: authority classes kept separate | P8 | TODO |
| 19 | BNS/BNSS/BSA applicability vs mapping | P9 | TODO |
| 20 | Common decision / duplicate identity | P10 | PART DONE — one live case found and characterised in the treatment reconciliation (Bombay HC 2010-03-19 WP/4739/1990, two bench partitions). Scope measured: the ONLY duplicated identity in the overruled-class population. General policy still TODO. |
| 21 | Currentness fixtures for NEW1 | P12 | TODO |
| 22 | Leakage-safe feature contract | P13 | TODO |
| 23 | Performance on critical LCC paths | P14 | TODO |
| 24 | Premium readiness checklist (backend only) | P15 | TODO |

## Findings that changed a number someone else is using

1. **`judgments` is 18,698,968** — confirmed exact, matching NEW2's 0857.
2. **Coverage: 131 of 257 `PARTIAL` cells were not gaps.** 102 `SOURCE_ABSENT`,
   29 `RETRYABLE`. The genuinely unattributed gap is 153,204 rows over 115
   cells, not 1,579,075 over 257 — a 10.3× overstatement in rows.
3. **Allahabad's 50.03% / 50.29% is a 2.00× row-to-document ratio**, not a
   coverage figure. 88.6% of all "unexplained" shortfall is this one court.
4. **Treatment population is 27 unlinked, not 33.** Manifest V2 stale on three
   rows, all in the safe direction.
5. **73 of 98 non-current judgments carry `set_aside` for an `overruled` act.**
   Evidence sound, vocabulary wrong, product consequence real. Now **OD-14**.
6. **Tier A is ~94% admitted on the ABSENCE of evidence.** Two independent
   measurements the same day agree (NEW2 sampler 94.4%, LCC aggregate 94.79%).
   Every precision figure being quoted about Tier A describes ~5% of it.
7. **The `9,700,157` Tier-A figure is from a census that saw 17,945,147 rows.**
   The corpus is now 18,698,968. Re-measure before quoting.
