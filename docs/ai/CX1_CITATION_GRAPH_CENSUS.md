# CX1 Citation Graph Census

Generated: **2026-08-17T14:21:22.560Z**

## Scope

Workstream J offline checkpoint. This artifact summarizes existing measured citation/graph snapshots and prepares a read-only selector for later execution. It does not query PostgreSQL, run citation extraction, run resolution, write aliases, change treatment state, or make legal-authority claims from citation counts.

## Snapshot Inventory

| Snapshot | Date | Metric | Value | Caveat |
|---|---|---|---|---|
| `schema-truth-20260813-citation-denominator` | 2026-08-13 | sentinels / real unresolved / resolved | 625748 / 598759 / 112241 | snapshot in schema-truth; use live selector before making corpus-current claims |
| `data-moat-20260812-production-inventory` | 2026-08-12 | judgment_citations / resolved / sentinels; external_citations / resolved | 273383 / 99887 / 50645; 51272 / 15102 | older snapshot; corpus and extraction continued afterward |
| `data-moat-20260812-treatment-counts` | 2026-08-12 | cites/followed/distinguished/overruled/overruled_in_part/doubted/approved | 257460 / 14007 / 1734 / 117 / 23 / 21 / 21 | relationship counts are diagnostics; citation count is not legal authority |
| `retrieval-program-20260811-graph-architecture` | 2026-08-11 | judgment_citations edges / resolved; aliases | 227478 / 97876; judgment_citation_aliases 4097 | architecture snapshot; graph not a ranking signal yet |
| `treatment-gap-20260814-high-risk-unresolved` | 2026-08-14 | overruled/overruled_in_part/doubted unresolved | 32 fresh-check unresolved, down from 34 after two fixes | priority list, not target identity proof for every row |
| `pre-migration-20260815-overruled-count` | 2026-08-15 | overruled_status != none judgments | 95 | baseline spot-check; not a full Workstream J census |

## Priority Regions

| Region | Priority | Finding | Future selector |
|---|---|---|---|
| `J1-sentinel-safe-denominators` | P0-diagnostic-safety | Sentinel rows with empty citation_text must be excluded from unresolved-citation denominators and advocate-facing graph surfaces. | graph-census-selector.sql section sentinel_invariants |
| `J2-unresolved-treatment-targets` | P0-currentness-risk | Overruled/overruled_in_part/doubted unresolved targets are the highest-value graph region because the failure mode is live-law currentness, not ranking. | graph-census-selector.sql section unresolved_treatment_targets |
| `J3-citation-key-coverage` | P1-resolution-throughput | citation-key population is a derived table and must be measured without duplicating the active population job or using OFFSET. | graph-census-selector.sql section key_coverage |
| `J4-high-degree-authorities` | P2-prioritisation | High in-degree/out-degree authorities are triage signals only; citation count alone is not legal authority or ranking approval. | graph-census-selector.sql section degree_distribution |
| `J5-external-citation-gaps` | P2-source-gap | external_citations and citation_concordance_resolutions need separate accounting because model adjudication is an aid, never canonical identity. | graph-census-selector.sql section external_citation_gaps |
| `J6-ambiguous-yearless-parallel-keys` | P2-resolution-diagnostics | Ambiguous keys, yearless keys, and parallel citation alias multiplicity are separate resolution diagnostics; none should be collapsed into one unresolved count. | graph-census-selector.sql sections ambiguous_key_distribution, yearless_key_prevalence, parallel_alias_multiplicity |

## Prepared Selector

Read-only SQL selector: `docs/ai/cx1-citation-graph-census/graph-census-selector.sql`

It emits JSONB sections for citation-base counts, sentinel invariants, relationship distribution, degree buckets, top unresolved court/year cells, unresolved high-risk treatment targets, citation-key coverage, external-citation gaps, unresolved-key buckets, ambiguous-key buckets, yearless-key prevalence, parallel-alias multiplicity, and isolated held authorities.

## Boundary

Offline Workstream J only: no PostgreSQL query, no citation extraction/resolution run, no alias/treatment/currentness write, no model call, no provider fetch, and citation counts are diagnostics rather than legal authority.
