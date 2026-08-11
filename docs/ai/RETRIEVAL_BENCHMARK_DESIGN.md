# RETRIEVAL-SCALE BENCHMARK — design, not execution

**11 August 2026, LCC, per the founder's HC CORPUS CHARACTERIZATION
directive, §2 (retrieval benchmark).** Explicit instruction: *"Do not choose
a retrieval technology based on generic benchmarks"* and *"do not begin a
massive embedding/indexing job until the evaluation architecture and corpus
characterization justify it."* This document is the design those two
sentences call for — what to run, on what, measuring what — not a rewrite of
`docs/ai/RETRIEVAL_PROGRAM.md` (the recoverable-state file for the retrieval
workstream generally) and not a new embedding job.

**Everything below was checked against the actual code this session, not
recalled.** `RETRIEVAL_PROGRAM.md`'s own architecture table says fusion is
"UNKNOWN whether RRF or ad-hoc; not inspected this session" — that was true
when written; it no longer is, and §1 below corrects it.

---

## 1 · WHAT ALREADY EXISTS, MAPPED TO THE FOUNDER'S SIX ARMS

| requested arm | code | state |
| --- | --- | --- |
| lexical/BM25 | — | **DOES NOT EXIST.** No BM25 extension on Railway (confirmed in `RETRIEVAL_PROGRAM.md` task 004); the sparse arm below is not BM25 |
| PostgreSQL text search baseline | `retrieve.ts`'s sparse half — `ts_rank`/`ts_rank_cd` over `full_text_tsv`, GIN index (`judgments_full_text_idx`, **325 MB**, measured this session) | **IMPLEMENTED**, but only ever runs fused with dense, never scored alone (§3) |
| dense retrieval | `judgment_chunks.embedding`, BGE-M3, pgvector HNSW (`judgment_chunks_embedding_hnsw`, **4,811 MB**, measured this session) | **IMPLEMENTED, Supreme Court only** — 616,197 chunks, **0 High Court chunks**, a deliberate REJECT decision (`RETRIEVAL_PROGRAM.md` DECISIONS: full-corpus embedding estimated ~490 GB, rejected 11 Aug) |
| hybrid lexical+dense | `hybridSearch` (`retrieve.ts`) | **IMPLEMENTED** — this is what every query already runs through |
| RRF | `rrf()`, `retrieve.ts:101`, `RRF_K = 60` | **IMPLEMENTED.** This *is* how the two arms above are fused — in this codebase, "hybrid" and "RRF" are not two separate things to compare, they are the same mechanism. There is no second, non-RRF fusion implementation to compare it against (§4) |
| reranking | `rerank-passages.ts`, cross-encoder, toggled via `HARNESS_RERANK=1` / `scoreQuery`'s `rerank` param | **IMPLEMENTED AND ALREADY MEASURED**: +4.6 success@5 over 45 queries combined with graph expansion (`retrieval.ts` comment); 4,136 ms mean for 20 candidates at `max_length` 512 |

**Correction to `RETRIEVAL_PROGRAM.md`'s fusion table entry, made here and to
be carried back into that file**: fusion is RRF, confirmed by reading
`retrieve.ts` directly, not "UNKNOWN."

---

## 2 · THE EVALUATION SET — what it actually is, checked directly

`services/harness/src/fixtures/queries.eval.json` — **283 queries**, this
session confirmed by direct read, not cited from memory:

| | |
| --- | --- |
| total | 283 |
| `criminal` | 83 |
| `civil` | 200 |
| cited judgment's court | **283 of 283 — Supreme Court of India, 100%** |

**This is the single most important fact for scoping the benchmark
cheaply**: every gold judgment in the entire golden set is a Supreme Court
judgment, and the Supreme Court is exactly the corpus that already has dense
embeddings (616,197 chunks, 100% coverage). **Running the full six-arm
comparison on the existing golden set requires embedding nothing new.** The
directive's instruction not to start a massive embedding job is not a
constraint this benchmark needs to work around — the benchmark as scoped
does not need one.

**A second, previously-undocumented finding**: three different harness
entry points read three different slices of query fixtures, and conflating
them would silently under-power any comparison:

| entry point | fixtures loaded | query count |
| --- | --- | --- |
| `pnpm harness` (`run-cli.ts`, Gate S2, CI-gating) | `queries.derived.json` + `queries.hand.json` | **25** |
| `pnpm --filter @lawmind/harness ab <lever>` (`ab-cli.ts`) | `queries.eval.json`, sliced by `AB_LIMIT` (default 100) | **100 of 283** |
| — | `queries.eval.json` in full | **283** |

The gate intentionally runs on 25 for CI speed (`SPRINT_2.md`'s fixed 30-
query set). `ab-cli.ts` already defaults to 100 rather than the full 283 for
runtime, but accepts `AB_LIMIT=283` to use all of them. **A retrieval-scale
bake-off should run against the full 283**, not the CI-sized subset — the
existing McNemar paired-significance machinery (`stats.ts`) already exists
to make that comparison honest at that scale (`ab-cli.ts`'s own header:
*"100 queries... one query changing its mind"* is the exact failure mode a
6-arm comparison must not repeat by using too few).

---

## 3 · THE GAP: NO ISOLATED-ARM MODE

`hybridSearch` always fuses sparse and dense via RRF — there is no flag
anywhere to run "lexical only" or "dense only" and get back a ranking scored
against the golden set. `ab-cli.ts`'s `lever` argument (`rerank | graph |
both | hyde | all`) toggles enhancement *stages on top of* the fixed hybrid
base; it does not let the base itself vary.

**This is the concrete, scoped engineering gap** — not a redesign, an
additive mode. `hybridSearch`'s internals already compute the sparse
candidate list and the dense candidate list as two separate `Ranked[]`
arrays before calling `rrf()` on them (`retrieve.ts`); returning those two
lists alongside the fused result, or accepting a `mode: 'sparse' | 'dense' |
'hybrid'` parameter that skips the other arm and skips fusion, is a small
change to a function whose shape already supports it. **Sizing this
precisely was out of scope for a design pass and is the first item of
implementation work, not estimated here as anything more than "small."**

---

## 4 · WHAT "BM25" ACTUALLY REQUIRES HERE — not assumed, scoped

Railway does not offer a BM25 extension (confirmed, `RETRIEVAL_PROGRAM.md`
task 004, unchanged this session). Two real paths, not chosen between here:

1. **Hand-rolled BM25 in application code**, scoring candidates already
   fetched by the existing `tsvector`/GIN path using Postgres's own
   `ts_stat()` for per-term document frequency (computable from
   `full_text_tsv` directly, no new extension) and the standard BM25 formula
   (`k1`, `b` tunable). This changes *scoring*, not *retrieval* — the GIN
   index still supplies the candidate set; BM25 only reweights it. Feasible
   without new infrastructure, real engineering (a scoring function, a
   `ts_stat()` call cached rather than run per-query, tests against known
   BM25 behaviour), not a config flag.
2. **A dedicated BM25 library/service** (e.g. an in-process implementation
   over pre-tokenised text held outside Postgres) — heavier, and the
   `CLAUDE.md` OSS-first / no-new-vendor-without-asking rule applies before
   this path is chosen.

**Recommendation, not a decision**: try (1) first — it reuses the existing
index and needs no new dependency, matching the Ponytail-ladder default of
the smallest change that answers the question. Not started here; this
document's job was to establish that "BM25" is not something a flag turns
on, so nobody schedules it as a one-line change later by mistake.

**PostgreSQL text search baseline** (as requested, distinct from BM25) is
simpler: it already exists as `ts_rank`, and the only work is exposing it
*unfused* (§3), not building it.

---

## 5 · METRICS — what exists, what's a genuine gap

Already computed today, `services/harness/src/retrieval.ts` +
`run-cli.ts`/`ab-cli.ts`, verified by reading the code, not assumed:

| metric | where | note |
| --- | --- | --- |
| precision@5 (single-gold ⇒ success@5) | `scoreQuery`, `metrics.ts` | THE gate metric; single gold per query (`goldJudgmentIds` always length 1 in the sampled query above — not independently re-verified corpus-wide this session) |
| recall@20 | `run-cli.ts`/`ab-cli.ts` | `foundAtAnyRank !== null` |
| MRR | `run-cli.ts`/`ab-cli.ts` | `1/foundAtAnyRank`, already reciprocal-rank, already correct for single-gold |
| DRM (document-level retrieval mismatch) | `scoreQuery` | share of top-K from no gold document — the closest existing proxy to "evidence retrieval accuracy" at the retrieval layer |
| paired significance (McNemar) | `stats.ts` | already used by `ab-cli.ts` for lever comparisons |

**Genuinely missing, scoped:**

- **nDCG@K** — not computed anywhere. **Cheap to add**: with exactly one
  gold judgment per query and binary relevance, `IDCG@K = 1` always (the
  ideal ranking places the single relevant item first), so
  `nDCG@K = 1/log2(rank+1)` if the gold judgment is found within the top K,
  else `0`. This is a closed-form function of `goldRanks`/`foundAtAnyRank`,
  which `scoreQuery` already returns — no new retrieval work, a few lines in
  `metrics.ts` or the CLI aggregation step.
- **Per-arm latency** — some numbers exist ad hoc (retrieval p95 488 ms,
  reranking 4,136 ms/20 candidates, both cited in `retrieval.ts`/
  `RETRIEVAL_PROGRAM.md`), but `scoreQuery` does not time itself, so there is
  no systematic per-query, per-arm latency series from a single run. Needs a
  `performance.now()` wrap around each stage inside `scoreQuery`, reported
  alongside the existing metrics.
- **Index/storage cost, per arm** — measured this session, not previously
  written down in one place: GIN (`ts_rank`/PG-text arm) **325 MB**, HNSW
  (dense arm) **4,811 MB**, on the *current, Supreme-Court-only* corpus. A
  hypothetical BM25 arm reusing the same GIN/`ts_stat()` path would add
  negligible storage (computed, not indexed separately) — **not measured
  because it is not built (§4)**.
- **Citation-resolution accuracy** — **this is not a metric this benchmark
  produces.** `cite:"..."`/`judge:"..."` structured queries never reach
  `hybridSearch` at all (`structured.ts`'s `looksStructured` routes them
  around it entirely, confirmed in `RETRIEVAL_PROGRAM.md` §BENCHMARK
  RESULTS step 1) — they are graded by `structuredExactness`/
  `fieldPrecision`, already gated at 1.0 in `metrics.ts`. Listing it as an
  output of the ranking bake-off would conflate two different code paths;
  it is already measured, elsewhere, and does not need re-deriving here.
- **Evidence retrieval accuracy** — closest existing signal is DRM (above);
  the stronger form (does the returned passage actually *support* the
  claim, not just come from the right document) needs the generation path
  (`gradeReferences`/`hallucinationRate`, `generate.ts`) which requires a
  model key and is a different, already-tracked gap
  (`RETRIEVAL_PROGRAM.md`'s BLOCKED table).

---

## 6 · THE PROPOSED BENCHMARK, CONCRETELY

**Run against the existing corpus, existing embeddings, all 283 queries.
No new ingestion, no new embedding job.**

1. Extend `hybridSearch` (or add a thin wrapper) with a `mode: 'sparse' |
   'dense' | 'hybrid'` switch (§3) — the one real prerequisite.
2. Add BM25 scoring over the existing GIN/`ts_stat()` path as a distinct
   `mode: 'bm25'` (§4) — separable from step 1; can land after it or be
   deferred to a second pass if the founder wants results on the four
   arms that already exist before the fifth is built.
3. Add nDCG@K to the metrics module (§5) — no dependency on 1 or 2.
4. Wrap `scoreQuery`'s stages in timers; report per-arm latency (§5).
5. Run all six configurations (`sparse` (ts_rank) / `bm25` / `dense` /
   `hybrid` (today's default) / `hybrid+rerank` / `hybrid+graph+rerank`)
   against the full `queries.eval.json` (283 queries, not the 100-query
   default), through `ab-cli.ts`'s existing paired-comparison machinery so
   every arm is compared against the same hybrid baseline with an interval,
   not a bare percentage difference.
6. Report success@5, recall@20, MRR, nDCG@5/nDCG@20, DRM, mean latency,
   index/storage cost — per arm, in one table, plus the paired McNemar
   result for every arm against the current production baseline (hybrid, no
   rerank).

**Explicitly out of scope for this benchmark, and why:**

- **A High Court dense arm** — would require embedding a meaningful slice
  of 20.5M HC rows, exactly the "massive embedding job" the directive says
  not to start before the evaluation architecture justifies it, and the
  golden set (§2) cannot even measure it today (0 HC gold judgments in the
  283). If HC retrieval quality needs measuring later, it needs its own
  golden set built from HC citation edges first — a separate, real task,
  not a rerun of this one.
- **A non-RRF fusion comparison** — nothing in this codebase implements an
  alternative (e.g. linear score combination), so "RRF vs. something else"
  is not a comparison the current code can produce; building an alternative
  fusion method purely to have something to compare RRF against would be
  the "generic benchmark" the directive explicitly warns against, not a
  measurement LawMind's own evaluation set has an opinion on yet.

---

## 7 · WHAT THIS DOCUMENT DOES NOT DO

- Does not implement the `mode` switch, BM25 scoring, nDCG@K, or latency
  timers — scoped, not built, per the directive's own sequencing
  ("do not begin... until the evaluation architecture... justif[ies] it" —
  this document is the justification step).
- Does not run any benchmark or report a single retrieval number — there is
  nothing to report until §6's five prerequisites exist.
- Does not revisit the REJECT decision on full-corpus HC embedding
  (`RETRIEVAL_PROGRAM.md` DECISIONS) — reaffirmed, not reopened, by §6's
  scoping choice to stay within the Supreme-Court-only golden set.
