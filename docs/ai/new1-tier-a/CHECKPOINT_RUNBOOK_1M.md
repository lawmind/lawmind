# NEW1 — the 1M checkpoint runbook

**Why this file exists.** Two owed measurements both need one HNSW index build,
and that build is currently REFUSED by the shared resource gate. Deferred work
that lives only in a session summary is work that gets re-derived from scratch by
the next agent, or worse, re-litigated. This is the executable form: what to run,
in what order, and — the part that matters — what would make each step's answer
untrustworthy.

Written 21 Aug 2026 at 691,874 staged vectors, worklist 49/864.

---

## 0. The gate refused, and the refusal is the record

Do not start the build because the GPU looks idle for a moment. Ask:

```sh
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2-)"
node scripts/resource-gate.mjs status
```

Without `DATABASE_URL` the gate cannot read PostgreSQL and returns `DEFER` for
`DB_SCAN` and `VECTOR_BUILD` on UNREADABILITY. That is a different answer from
`DEFER` on pressure and must never be recorded as the same thing. Export it
first, every time.

Measured refusal at 17:26Z on 21 Aug, all four reasons independent:

```
DEFER  VECTOR_BUILD
       - CPU 68.6% > 50%
       - 13 active queries > 2
       - longest active statement 1367s > 120s
       - 17 ingest fleet process(es) writing — an index build wants the box to itself
```

`GPU_EMBED` also read `DEFER (GPU 100% busy)`. That is correct and is NOT a
reason to stop the walk: it means do not start a SECOND GPU job. The running one
is adopted.

**Proceed only when `VECTOR_BUILD` reads `ALLOW`.** The likely enabling event is
the ingest fleet finishing, not the walk finishing.

---

## 1. Snapshot, never the live table

`new1_doc_vector_stage` deliberately carries **no index** so its insert rate
survives an 11-day run (P6.1). Do not add one to it. Build on a snapshot, as
`probe-snapshot.mjs` already does:

```sh
node services/harness/src/probe-snapshot.mjs        # writes new1_probe_fp32_<label> / new1_probe_half_<label>
```

Set the label from the ACTUAL row count at snapshot time, not from the milestone
you hoped for. A table called `_1m` holding 940k is a lie that outlives the
session that told it.

---

## 2. The one measurement still owed on halfvec (P4/P5.3)

Everything else about halfvec is settled and should not be re-run:

| settled | value |
| --- | --- |
| fp32 vs halfvec task quality at `ef_search=200` | no difference on any query type, paired sign test p = 0.267 / 0.688 / 0.804; 94–97% of queries identical rank |
| index size | 669 MB vs 2,006 MB — 3.0x |
| latency | p50 14 vs 41 ms · p95 232 vs 519 ms |
| verdict | `HALFVEC_QUALITY_PASS_AT_TEST_SCALE`, n = 256,998 |

**Still owed, and only this:** ANN recall against EXACT ground truth, under the
same representation, at `ef_search=200`.

Method:

1. Pick ~100 queries spanning all query types — do **not** pool the types.
2. Exact arm: same table, `SET LOCAL enable_indexscan = off; SET LOCAL
   enable_bitmapscan = off;` so the planner cannot silently use the HNSW index.
   That sequential scan IS the ground truth.
3. ANN arm: `SET LOCAL hnsw.ef_search = 200;` — production's value. `ef_search=40`
   is the PROBES' historical setting and quoting a loss measured at 40 as a
   production loss has already happened once.
4. Report recall@k of ANN against exact, per query type, both representations.

Issue `HALFVEC_PRODUCTION_READY` **only** if quality holds at this scale. The
250k verdict was explicitly scoped as not production-ready because Tier A is 34x
larger; a pass at ~1M narrows that gap but should still name the population it
was measured on.

---

## 3. The expanded-gold benchmark, on the same index (P5/P6/P13)

One build, both measurements. The benchmark now takes its gold from the
environment and records the path it actually loaded:

```sh
MILESTONE=1m PROBE_TABLE=new1_probe_fp32_1m EF_SEARCH=200 \
  npx tsx services/harness/src/expansion-benchmark-v2.mjs                     # citation-derived, v2

MILESTONE=1m PROBE_TABLE=new1_probe_fp32_1m EF_SEARCH=200 GOLD_KIND=uncited \
  npx tsx services/harness/src/expansion-benchmark-v2.mjs                     # uncited, v2 (175 authorities)

MILESTONE=1m PROBE_TABLE=new1_probe_half_1m EF_SEARCH=200 \
  npx tsx services/harness/src/expansion-benchmark-v2.mjs                     # halfvec arm
```

Defaults are already NEW3 v2 for both kinds. The arm suffix carries `-goldv2`, so
a v1 re-run cannot overwrite a v2 report.

**Do not expect the citation-derived numbers to move because the gold was
rebuilt.** v1-usable and v2-usable are the identical 684 rows — the adapter was
already dropping the 66 NEW3 has now quarantined, and the two sets agree with
zero difference in either direction. v2's value is provenance. A metric that DOES
move on the rebuild is a bug in the harness, not a finding.

The uncited set is the real expansion: 26 → 175 authorities, and it is the only
instrument that measures an authority nobody has cited.

---

## 4. Report the funnel, never one number

`expansion-benchmark-v2.mjs` already refuses to collapse these, and the reason
is that each stage wants a different owner:

```
SOURCE_PRESENT     acquisition     (NEW3 / NEW2)
SEMANTIC_ELIGIBLE  eligibility     (LCC)      <- the ceiling below
EMBEDDED           throughput      (NEW1)
RETRIEVED          recall          (NEW1)
CORRECTLY_RANKED   ranking         (NEW1)
```

Carry `GOLD_REACHABILITY_CEILING` alongside, from
`gold-reachability-ceiling.json`, because it bounds every number downstream of
it and throughput cannot lift it:

| gold | authorities | staged | ceiling |
| --- | --- | --- | --- |
| citation-derived v2 | 228 | 198 (86.8%) | **16 = 7.0%** |
| uncited-authority v2 | 175 | 172 (98.3%) | **0 = 0.0%** |

---

## 5. Trust composition is part of the milestone, not a footnote

A staged-vector count is not a purity metric. Every milestone reports, from
LCC's canonical `judgment_embedding_eligibility.semantic_tier` and no NEW1
invention:

```
VERIFIED_SEMANTIC_CORE · BAIL_ORDER_REACHABLE · BROAD_SEARCHABLE
UNRESOLVED_EXPERIMENTAL · NOT_ELIGIBLE
```

At 691,874 staged (n = 27,477 sampled): BROAD_SEARCHABLE 86.37% ·
BAIL_ORDER_REACHABLE 13.61% · UNRESOLVED_EXPERIMENTAL 0.03% ·
**VERIFIED_SEMANTIC_CORE 0.00%**.

That zero is an unpopulated input, not a quality verdict: `script_quality` is
NULL on 100% of the sample and the tier requires it to be `IN` a list. 38.06% of
staged rows are already classed `decided` and are one populated column away.
Re-check this at the checkpoint — if `script_quality` has since been written, the
composition changes without anything else changing, and the milestone must not
report the old zero.

---

## 6. On `TEXT_UNSAFE_CONTRACT_READY`

Not yet landed. When it does, in this order:

1. recompute coverage (`stage-coverage-census.mjs`) — never resume from a batch number;
2. quarantine vectors of newly `TEXT_UNSAFE_VERIFIED` rows into
   `new1_doc_vector_stage_refused` — **move, never delete**;
3. resume the walk from the census.

Until then NEW1 applies **no private text filter**. The ~9.2% unreadable estimate
(50,108 of 542,980, bus 0936) came from an English-density screen. It is a number
to act on only through a shared contract, and the canonical column that would
express it is currently NULL for every staged row sampled.

---

## REFUSAL RECORD — 24 Aug 2026, 16:35Z

§7 NEW1-7 says the 1M halfvec checkpoint runs "only in a safe quiet window and
only after the more important representation experiment". The representation
experiment is **done** (`SEMANTIC_REPRESENTATION_DECISION_V3.md`), so the
precondition is satisfied and the gate was asked. It refused, and the refusal is
the record rather than a summary line:

```
DEFER  VECTOR_BUILD
  - 6 active queries > 2
  - longest active statement 1,012s > 120s
  - commit free 27.4% < 35%
  - 7 ingest fleet process(es) writing — an index build wants the box to itself
```

`DATABASE_URL` was exported first, so this is `DEFER` on **pressure**, not the
`DEFER` on unreadability that §0 above warns must never be recorded as the same
thing. Four independent reasons.

The 1,012 s statement is **LCC's**, from `services/api/src/search/retrieve.ts`,
stuck in `IO/DataFileRead`, with a live client. Reported as bus 1091 and not
touched.

### One thing this round changed about what the checkpoint is FOR

The runbook was written when the candidate serving artefact was **8.85M document
vectors**. The representation decision has moved the candidate to **30.0M passage
vectors** (measured 3.392 chunks/document). That makes halfvec-vs-fp32 *more*
decision-relevant, not less — 30M × 4 KiB fp32 is ~123 GB against ~61 GB halfvec
— and it means the 1M checkpoint should be built over **passage vectors**, not
document vectors, or it will be answering a question about an architecture nobody
is proposing any more.

A 250k halfvec/fp32 comparison already exists from 20 Aug
(`expansion-benchmark-250k-halfvec.json` / `expansion-benchmark-250k.json`) and
is close on both arms — fp32 better on `case_title` (5.70% vs 3.51% s@5),
halfvec better on `proposition` (22.81% vs 21.49%). **Neither is a scale result
and neither is over passages.** Do not quote them as settling the question.
