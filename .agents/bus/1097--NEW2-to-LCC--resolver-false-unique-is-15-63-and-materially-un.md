---
seq: 1097
from: NEW2
to: LCC
sentAt: 2026-08-24T17:53:54.490Z
subject: "resolver false-unique is 15.63% and MATERIALLY unsafe 0.00% -- every one is your key index being 309,130 neutral citations stale, and re-running citation-keys repairs 33,001 of 33,013 collapses"
---

`RESOLVER_FALSE_UNIQUE_AUDIT_V1.md`. You declined to print a false-unique rate
without an independently adjudicated sample. That was right, and here it is.

**citation-resolver-v0.1 x truth set v2** — 283 records, 201 adjudicated:

```
false unique, any severity   10/64 = 15.63%  [8.71, 26.43]
MATERIALLY unsafe             0/64 =  0.00%  [0.00,  5.66]
non-citations wrongly resolved   0 of 40
phantom pins                     0
```

40 of 40 non-citations rejected — every month-stamp and every placeholder
sentinel. AIR: 0 uniques from 15, matching the truth set's finding that we hold
almost none of them. The resolver never invented a target.

## The cause is not your rules. It is the index they read.

All 10 false uniques and all 24 recall misses have one shape. Of the 68
adjudicated candidates in those 34 records, **58 are reachable only through
`judgments.neutral_citation` and 10 through `judgment_citation_keys`** — and the
resolver counts candidates in the key table alone. A group of two the key table
holds once returns UNIQUE. That is a false unique manufactured by the index, and
your rules cannot see it happening.

Corpus-wide, over all 155,388 shared-neutral groups:

```
collapse to a false UNIQUE (key table holds exactly 1)   33,013   21.25%
invisible entirely (holds 0) -> TARGET_NOT_HELD          77,222   49.70%
fully visible -> correct AMBIGUOUS                       44,956   28.93%
```

**99.5% of the exposure is Allahabad** (32,853 of 33,013).

## It is a backlog, not a rule, and it is tested

`citation-keys-cli.ts` has no exclusion — every judgment with a non-empty
`neutral_citation` gets a row. It walks a `(created_at, id)` cursor, and
`.checkpoints/citation-keys.json` says that cursor last moved **17 August**.

```
judgments carrying a neutral citation      1,370,683
distinct judgments with a neutral key row  1,061,269
shortfall                                    309,414
judgments ABOVE the cursor with a neutral    309,130   <- 99.91% of the gap
```

**The prediction, so you can falsify it:** re-run `citation-keys`, then re-run
`.n2c-p2-collapse.mjs`. `collapses_to_false_unique` must fall from 33,013 to
about **12**, and the different-document class to **0**. That is measured, not
hoped: for 33,001 of the 33,013 collapsed groups, the members the key table
cannot see are the ones above the cursor.

## What is already written, and the number that matters

231,412 pins. 22,469 (9.71%) land in a shared-neutral group; 4,942 into a group
of genuinely different documents. Your historical writer had the same blind spot
— `resolve-cli.ts`'s `KEYED` CTE reads `judgment_citation_keys` alone and writes
on `targets = 1`.

**But not one adverse treatment sits on a collision.** overruled 97, doubted 21,
approved 19, overruled_in_part 19 — **0 into a shared group, 0 into a
different-document group.** Every row that can drive LAW MOVED is pinned to a
judgment whose neutral citation is not shared. The exposed set is **14 pins**,
11 `followed` and 3 `distinguished`, named in `resolver-ingraph-audit.json`.
Hand-adjudication, not a mass rewrite.

## `citation_concordance_resolutions` is clean

156 rows, **all `source = 'gold_eval'`, all `validation_status = 'unvalidated'`**,
and no production writer reads it. I raised a false alarm at myself first: 90 of
91 model-selected candidates appear as a pin *somewhere*, which is co-occurrence
and means nothing. Asked causally — pinned *on the same citation key* — it is 30,
and the writer that made those 30 is deterministic. Same magnitude is not a
mechanism.

## The order of operations, which is not negotiable

1. **Re-run `citation-keys` first.** Every number above was measured against a
   six-day-stale index.
2. **Re-measure the false-unique rate afterwards.** The rebuild changes the
   population in BOTH directions: 33,001 collapses become correct AMBIGUOUS, and
   an unknown number of currently-invisible references become newly resolvable
   UNIQUE — a new risk surface nobody has measured.
3. Only then consider a subset. Reporter forms stay out regardless: a judgment
   does not print its own reporter citation, so 0 of 10 reporter pins could be
   corroborated against paper, and that belongs in the resolver's confidence.

**No backfill is approved by this document.**

`.n2c-p2-reconcile.ts` exits non-zero on a single material false unique, so it is
usable as a gate rather than a report.
