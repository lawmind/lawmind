# LCC R25 — the 15-second search defect, reproduced and closed

`HEAD_START = 75a84804`. Local, no network, no paid infrastructure. Every number
here was measured on this box against the live 18,761,920-judgment corpus.

## Reproduced first, at HEAD

`pnpm --filter @lawmind/api measure:round -- --gate-s1 --repeat 3`
· `docs/ai/lcc-r25/gate-s1-before-after.json` · n=36

| class | n | zero | degraded | p50 |
| --- | --- | --- | --- | --- |
| exact citation | 3 | 0 | 0 | 26 ms |
| CNR | 9 | 0 | 0 | 1 ms |
| case number | 9 | 0 | 0 | 430 ms |
| **filtered lexical** | 3 | **3** | **0** | **15,091 ms** |
| normal research query | 9 | 1 | 1 | 2,732 ms |
| broad / refused query | 3 | 3 | 3 | 1 ms |

`SEARCH_15S_REPRODUCED = YES` — `sparseMs` max 15,006 ms, correctly reported as
`sparse_timeout`.
`QLANG_15S_REPRODUCED = YES` — `court:"…" AND bail` at 15,086 / 15,091 /
15,100 ms, entirely in `structuredMs`, with `degraded: []`.

## The cause was not the one R24 named, and finding that out changed the fix

R24 diagnosed the qlang path as *"neither protection the hybrid path has"* — no
document-frequency admission and no `MATERIALIZED` fence. Both true. Adding them
was not enough, and the reason is a third thing nobody had looked at.

**`court:"…"` compiles to `j.court ILIKE '%…%'`.** A leading `%` cannot use
`judgments_court_idx`, so the population fence — the thing added to make the
query cheap — was itself a sequential scan:

```
Limit  (actual rows=18888)
  -> Gather
       -> Parallel Seq Scan on judgments j_1
            Rows Removed by Filter: 3,748,606
Execution Time: 23,760 ms
```

The corpus holds **27 distinct court names**. Resolving the pattern against that
list and emitting `court = ANY(...)` selects exactly the same rows and gives the
planner an index:

| shape | plan | time |
| --- | --- | --- |
| `court ILIKE '%…%'`, fenced | Parallel Seq Scan | **23,760 ms** |
| `court = ANY(ARRAY[…])`, fenced | Index Scan `judgments_court_idx` | **139 ms** |

This is the substitution `search/route.ts` already makes for court CATEGORIES,
applied to a court PATTERN, and it reuses `court-category.ts`'s existing loose
index scan (26 index descents, ~1 ms warm) rather than adding a source.

## The second cause: a backward date walk, and it is worst for RARE terms

```
EXPLAIN  court:"…Karnataka" AND kesavananda
  Limit -> Incremental Sort (Presorted Key: judgment_date)
    -> Index Scan Backward using judgments_judgment_date_idx
         Filter: court ~~* '%…%' AND full_text_tsv @@ 'kesavananda'
         cost 9,283,133
```

The planner cannot cost a parameterised tsquery, assumes matches are dense, and
walks the date index backward expecting to fill `LIMIT 5` quickly. The predicate
matches 94 rows out of 18.7 million, so the walk reads the corpus.

**The rarer the term, the worse it gets** — the exact mirror image of the
document-frequency bound. Materialising the match set first:

| candidates | plain plan | materialised |
| --- | --- | --- |
| 94 | **15,165 ms** | **10 ms** |
| 153,857 | 8,138 ms | 412 ms |
| 827,690 | 81,920 ms | **100,077 ms** (spilled past `work_mem`) |

The third row is why the materialised shape is applied only inside a measured
band and not everywhere: when matches are dense the backward walk finds five in
60 ms and materialising 827,690 ids spills to disk.

## What the structured path does now

One shared admission rule (`admitLexical`, lifted out of `sparseAny` so the two
paths cannot diverge), and one execution shape, earned two ways:

1. **The match set is small** — rarest lexeme `df ≤ 0.008`, derived from
   61.6 bytes per candidate × ~150,000 candidates ≈ 9.2 MB, at or under the
   largest materialisation observed to stay in memory. Runs inside a
   `MATERIALIZED` CTE that yields the exact total and the sorted page in ONE scan.
2. **The population is small** — the corpus-wide rule refused, but the query's
   own positive structural conjuncts bound it to ≤ 20,000 rows, counted with the
   same early-stopping probe the sparse arm uses.

Neither holds → a truthful refusal, in milliseconds.

`GIN_FUZZY_SEARCH_LIMIT_USED = NO`. It is not in the tree. PostgreSQL documents
that it returns a random subset, which cannot satisfy deterministic legal search.

## Gate-S1 after, same harness, same fixtures

`docs/ai/lcc-r25/gate-s1-after.json` (samples) and
`docs/ai/lcc-r25/gate-s1-before-after.json` (both reports, verbatim) · n=36

| class | n | zero | degraded | p50 | before p50 |
| --- | --- | --- | --- | --- | --- |
| exact citation | 3 | 0 | 0 | 136 ms | 26 ms |
| CNR | 9 | 0 | 0 | 1 ms | 1 ms |
| case number | 9 | 0 | 0 | 186 ms | 430 ms |
| **filtered lexical** | 3 | 3 | **3** | **8 ms** | **15,091 ms** |
| normal research query | 9 | 1 | 1 | 2,831 ms | 2,732 ms |
| broad / refused query | 3 | 3 | 3 | 1 ms | 1 ms |

| phase | before max | after max |
| --- | --- | --- |
| `structuredMs` | **15,100 ms** | **1,190 ms** |
| `sparseMs` | 15,014 ms | 15,014 ms |

`QLANG_503_EMPTY_DEGRADED_COUNT = 0`. The filtered-lexical class now reports
`degraded: ['sparse_unbounded']` on all three samples where it previously
reported an empty `degraded[]` behind a 15-second 503.

## What is NOT fixed, stated plainly

**`LOCAL_GATE_S1_P95 = 11,889 ms`, against the brief's 3-second goal.** The
qlang half is closed; the residual is entirely the HYBRID sparse arm on the
`normal research query` class — `sparseMs` max 15,014 ms, unchanged, and already
truthfully reported as `sparse_timeout` / `coverage_unknown`.

That arm is corpus-wide-admitted lexical ranking over the whole corpus, it has no
structural conjunct to fence on, and improving it is a retrieval-quality change
that needs NEW1's gold set to validate. R24 reached the same conclusion and this
round did not overturn it. **This is local readiness evidence only and Gate C is
not claimed.**

One shape is also deliberately unchanged: a query the corpus-wide rule ADMITS
whose match set is too large to materialise — `bail AND murder`, 153,857 matches,
8,138 ms. Materialising it measured 412 ms, but the same shape at 827,690 matches
measured 100,077 ms, so admitting it on the available evidence trades a known
cost for an unmeasured cliff.

## Quality: the new plans return the SAME rows

`docs/ai/lcc-r25/plan-equivalence.json` — the materialised plan against the plain
one, on the live corpus, comparing the exact total and the exact ordered id list.

**`COMPARED: 7, DIVERGENCES: 0`.**

| query | plain | new | total | ids |
| --- | --- | --- | --- | --- |
| `court:"…Manipur" AND type:criminal` | 23,087 ms | 1,172 ms | 962 = 962 | identical |
| `court:"…Manipur" AND (kesavananda OR bharati)` | 1,014 ms | 20 ms | 13 = 13 | identical |
| `kesavananda AND bharati` | 30 ms | 7 ms | 1,272 = 1,272 | identical |
| `judge:"CHANDRACHUD" AND section:138` | 540 ms | 15 ms | 18 = 18 | identical |
| `court:"…Karnataka" AND kesavananda AND bharati` | 3 ms | 2 ms | 55 = 55 | identical |
| `court:"High Court*" AND kesavananda` | 49 ms | 10 ms | 0 = 0 | identical |
| `court:"…Manipur" AND kesavananda` | 64 ms | 5 ms | 1 = 1 | identical |

Two more could not be compared because the BASELINE did not finish inside 60 s —
`court:"…Manipur" AND bail` (new: 4,433 ms) and `court:"…Karnataka" AND
kesavananda` (new: 484 ms). A query the old plan cannot answer is the defect, not
a gap in the evidence.

`SEARCH_QUALITY_REGRESSION = NONE OBSERVED`. Exact/CNR/case-number routes are
untouched; ordinary sparse quality is unchanged because `sparseAny`'s decision is
the same function it always called, now shared rather than copied.
