# NEW2 R23 — the refrozen 539

R23 is not a new adjudication. It is the R22 SAFE population with one row taken
out, and a lineage record that lets the next independent audit prove that
without opening 539 source documents again.

## What was verified before anything was built

- The eight R22 artifact files hash to the values in
  `docs/ai/new2-r22/artifact-manifest.json`, byte for byte.
- `correctionPopulationHashV2` over the 540 R22 rows recomputes to
  `f55e2ba64b75772fe33e568e7707b453227dcdb18c67a966a7ae5ff776bafd33`.
- R22 counts recompute to 540 / 441 / 86 / 13.
- `r22-safe-population.json` and `r22-preflight-manifest.json` describe one
  population, field by field, on all 540 rows.

A mismatch on any of those aborts the build. None occurred.

## The one exclusion

`ae156e65-5871-48f3-8dc8-93a5c7e172dc`, R22 class
`DETERMINISTIC_SUFFIX_REPLACE`, proposing `2024:HHC:17024` → `2024:HHC:17024-DB`.

The independent audit returned AMBIGUOUS: the document prints a clean bare
`2024:HHC:17024` own-form citation, while DB running stamps suggest a suffixed
form, but the required two-sided standard does not prove the stored bare value
false.

It is quarantined as `AMBIGUOUS_SUFFIX_OWNERSHIP_TWO_SIDED_PROOF_MISSING`. It was
not re-proposed, not turned to NULL, and no ownership was inferred from suffix
frequency, from sibling HHC convention, or from a content hash.

## The difference is pure

`R23 SAFE = R22 SAFE − {ae156e65-…}`, proven both directions: one id in
parent-minus-child, zero in child-minus-parent. Every retained row is carried
across untouched — ten semantic fields compared per row, **0** field changes over
539 rows, and each row's stable comparison hash equals its parent's. The lineage
artifact carries all 539 of those hashes plus a set hash over them.

One manifest-level consequence is recorded rather than hidden: the excluded row
was the sole candidate for replacement key `2024HHC17024DB`, so the holder-set
map drops from 96 keys to 95. No retained row gained or lost a holder set, and
both `VERIFIED_COMMON_ORDER_FAMILY` groups keep exactly their R22 membership —
the build asserts that, because an exclusion silently reshaping a family is the
subtle way this could have gone wrong.

## Frozen population

```
NEW2-R23-SAFE-e5caecc2b05a4d04
e5caecc2b05a4d047291f4b2bad45e108b6a7135006da502cced8d5b6ab990b4

TOTAL                        539
DETERMINISTIC_TO_NULL        441
DETERMINISTIC_TO_REPLACE      86
DETERMINISTIC_SUFFIX_REPLACE  12
```

## Current drift and the target-holder gate

Read-only against local Postgres, on all 539 retained candidates: every row
exists, and `neutral_citation`, `source_url` and `content_hash` are unchanged
from the frozen values. All 95 replacement keys still have zero existing holders,
so every `NO_EXISTING_HOLDER` classification still holds. **No row drifted, so no
row was held.** No canonical row, edge, alias or migration was written; the
database was opened read-only and the ingest frontier has advanced past the
freeze, which is the permitted direction.

## Quarantines

| source                             | rows |
| ---------------------------------- | ---: |
| R22 common-order ownership         |   29 |
| R22 Delhi unexplained many→one     |    2 |
| R23 HHC ambiguous suffix ownership |    1 |
| **total**                          |   32 |

No quarantined judgment id appears in SAFE.

## Preflight

Sixteen Mutation Protocol v2 attacks, all refused, each asserted against the
specific refusal it must produce rather than merely "not ok": duplicate id,
conflicting dispositions, TO_NULL with a replacement, a replacement set to NULL,
replacement equal to old, unknown disposition, missing source hash, malformed
citation, wrong population hash, changed old value, missing row, changed source
hash, already-corrected row, already-null TO_NULL, target-holder conflict, and
unexplained many→one target.

## Not fixed here, recorded for later

`deferred-technical-debt.json` carries the three debts the independent auditor
raised — imprecise common-order evidence pointers, the
`VERIFIED_COMMON_ORDER_FAMILY` preflight branch that only checks an evidence
pointer is non-empty, and the R21 concatenated-source narrative inconsistencies.
None of them reaches this population: every R23 replacement target classifies
`NO_EXISTING_HOLDER` and never enters that branch. They belong to the
citation-edge / common-order round.

## State

`READY_FOR_R23_DELTA_AUDIT = YES`. `READY_FOR_WRITE = NO`.
`CITATION_BULK_APPLY = HOLD`.

Rebuild with `pnpm exec tsx scripts/n2-r23-build.mts`; the gate is
`services/ingest/src/r23-population-delta.test.ts`, which needs neither the
database nor the network.
