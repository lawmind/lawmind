# LCC SESSION CHECKLIST — 20 Aug 2026 (canonical truth / legal intelligence / graph / live state)

Maintained live. States: `TODO` · `RUNNING` · `VERIFIED DONE` · `BLOCKED`.
A state changes only when the result was **read back**, never when a command exited 0.

## Live state reconstructed at session start (measured, not carried)

```
judgments                     count(*) pending      pg_stat_user_tables reads 0 — stats zeroed by the crash
judgment_citations                  22,322,047      exact
judgment_citation_aliases                4,394      exact
judgments overruled_status <> 'none'        98      exact
coverage_cell                              966      exact
statute_mappings                           226      exact
document_enrichments                    40,692      exact
document_vector_staging                      0      exact — drained
ecourts_fetch_ledger                        52      exact, ALL `refused`/`kill_switch_off`, 9–11 Aug
                                                    -> "requests ever made: 0" verified by query, not by doc
live processes                        0 fleet       postgres up, no ingest/enrich worker running
```

Corpus figures adopted from NEW2 rather than re-derived (their lane, their measurement):
`judgments 18,698,968` (bus 0857 correction), historical actionable frontier **CLOSED**,
`bench=testcase` source exclusion **289,502 rows / 56 objects / all Bombay (27_1)**.

## Checklist

| # | item | prompt | state |
| --- | --- | --- | --- |
| 1 | Bind LCC lane, drain 99 pending bus messages, advance cursor | global | VERIFIED DONE |
| 2 | Reconstruct live state from DB + process table, not summaries | global | VERIFIED DONE |
| 3 | eCourts observation model — migration + schema + guard wiring | P11 | TODO |
| 4 | `ECOURTS_OBSERVATION_PIPELINE_READY` to NEW2 (blocks their next phase) | P11 | TODO |
| 5 | Coverage denominator: subtract `bench=testcase`, never silently | P1 | TODO |
| 6 | Coverage honest categories + `source_excluded` surfaced | P1 | TODO |
| 7 | `COVERAGE_TRUTH_V2_READY` to NEW2/NEW1 | P1 | TODO |
| 8 | Treatment manifest reconcile against LIVE data, row by row | P0 | TODO |
| 9 | Treatment edge vs derived currentness kept separate | P0 | TODO |
| 10 | `TREATMENT_MANIFEST_RECONCILED` published | P0 | TODO |
| 11 | Eligibility axis C: `decided_brief` decision on measured precision | P2 | TODO |
| 12 | Three-way split VERIFIED_SEMANTIC_CORE / BROAD_SEARCHABLE / UNRESOLVED | P2 | TODO |
| 13 | Stratified purity sample cut for the independent gate | P3 | TODO |
| 14 | Legal-object trust lifecycle states | P4 | TODO |
| 15 | DeepSeek V4 Flash pass over NEW2's 190,102 uncertain manifest, 1k rung | P5 | TODO |
| 16 | Legal-object factory telemetry: tokens / CANONICAL_TRUSTED | P6 | TODO |
| 17 | Legal-object vector manifests for NEW1 | P7 | TODO |
| 18 | Statute mappings: authority classes kept separate | P8 | TODO |
| 19 | BNS/BNSS/BSA applicability vs mapping | P9 | TODO |
| 20 | Common decision / duplicate identity | P10 | TODO |
| 21 | Currentness fixtures for NEW1 | P12 | TODO |
| 22 | Leakage-safe feature contract | P13 | TODO |
| 23 | Performance on critical LCC paths | P14 | TODO |
| 24 | Premium readiness checklist (backend only) | P15 | TODO |
