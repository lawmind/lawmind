# THE SPARSE ARM IS BOTH THE SLOWNESS AND THE QUALITY DEFECT — 17 August 2026

**Owner: NEW1.** Everything here is OBSERVED against
`LOCAL_DATABASE_URL` (7,296,068 judgments) unless labelled otherwise.

Two problems that looked separate have one root cause. Neither is the vector
index, and **neither is fixed by tuning HNSW.**

---

## 1. THE MEASUREMENT

`retrieve.ts`'s lexical arm takes the 40 **longest** lexemes of the query, ORs
them into one `tsquery`, and then `ORDER BY ts_rank(...) LIMIT 20`.

Query `criminal-187694cc` (885 chars), `EXPLAIN (ANALYZE, BUFFERS)`:

| | |
| --- | --- |
| lexemes OR'd | 40 |
| rows matched | **6,866,609 of 7,296,068 — 94.1% of the corpus** |
| **with `ORDER BY ts_rank`** | **781,289 ms** · Parallel **Seq Scan** · 4 workers |
| buffers | `shared hit=49,616,544 read=5,640,168 written=438,972` |
| **identical filter, no `ORDER BY`** | **4.47 ms** |

**~175,000×.** The GIN index is not used, and the planner is right not to use it:
an index that must return 94% of a table is worse than a scan.

**The cost is the ranking, not the probe.** The filter alone answers in
milliseconds. `ts_rank` must be computed for every one of 6.87M matching rows,
each requiring the `tsvector` to be read — hence 55M buffer accesses and 439k
buffers *written* on a read-only query.

## 2. THE ROOT CAUSE: "LONGEST" IS NOT "RAREST"

The code says so honestly:

> A cap, because a whole paragraph of terms turns the index scan into a
> sequential one. Longest first is a weak proxy for rarest first, and it is
> honest about being a proxy: "preventive" discriminates and "made" does not,
> and in this corpus the long word is nearly always the rarer.

**Measured on a 20,000-judgment random sample (`TABLESAMPLE`, 8.4 s). The last
clause is false in this corpus:**

    court        5 chars   90.6%      attun     5 chars   0.0%
    state        5 chars   73.3%      impos     5 chars   0.0%
    present      7 chars   52.6%      delin     5 chars   0.3%
    section      7 chars   44.2%      capit     5 chars   0.7%
    shall        5 chars   43.3%      madan     5 chars   1.4%

Of the 40 selected by length: **3 appear in ≥50% of the corpus, 21 in <5%.**
Length and rarity are close to uncorrelated here — the discriminating terms
(`attun`, `impos`, `delin`, `capit`) are *five characters* and are **excluded**
by the rule, while `court` at **90.6%** is **included**.

`court` alone accounts for essentially the whole 94.1% match set, and it carries
almost no ranking information: a term in 90.6% of documents cannot discriminate
between them.

## 3. THE SAME CAUSE EXPLAINS THE QUALITY DEFECT

CX1's controlled 283-query checkpoint:

    dense    success@5 21.6%   recall@20 40.6%   MRR 0.151
    hybrid   success@5 18.4%   recall@20 38.9%   MRR 0.121
    sparse   success@5 10.2%   recall@20 17.0%   MRR 0.070

A ranker whose query matches 94% of the corpus on mostly-common terms is close
to arbitrary, which is what `recall@20 17.0%` looks like. **`ts_rank` is not
BM25 — it has no IDF at all**, so nothing downstream compensates for the term
selection.

And that weak arm then damages the strong one. `pnpm rrf:displacement`, over the
same checkpoint:

    sparse FOUND gold    n=19   hybrid damaged 10.5%   (helped on 8)
    sparse MISSED gold   n=42   hybrid damaged 88.1%   (26 lost entirely)

**8.4×.** RRF scores a document found by both arms at
`1/(k+r_dense) + 1/(k+r_sparse)` and a dense-only document at one term, so any
document the two arms coincidentally agree on outranks gold that only dense
found. On the 61 queries where dense had gold in the top 5, **fusion knocked it
out on 26 — 42.6%**.

**One root cause, three symptoms:** 13-minute queries, a near-arbitrary sparse
ranking, and fusion that destroys the dense arm's advantage.

## 4. WHAT I AM *NOT* CLAIMING

- **Not claiming an IDF fix will improve quality.** Selecting the 8 rarest
  lexemes instead narrows the match set from 94.1% to **492,127 rows (6.75%)** —
  **14× narrower**, measured. That is a *latency* result. Narrowing a candidate
  set can just as easily cost **recall**, and recall is the thing already
  failing. It must be measured on the benchmark before it goes anywhere near
  production.
- **Not claiming dense-only is the answer**, though dense currently beats hybrid
  on every metric in the controlled pass. That pass is a Supreme Court haystack,
  pre-migration, and is **historical controlled evidence** — not the
  post-migration baseline.
- **Not claiming these numbers transfer to the 7.3M corpus.** §3's quality
  figures are CX1's controlled checkpoint. §1 and §2 *are* measured on the local
  7.3M corpus.

## 5. RECOMMENDED ORDER OF WORK, AND WHY

1. **Drop near-zero-IDF terms from the sparse query.** The safest possible
   version of the fix: a term appearing in >50% of documents contributes
   essentially nothing to `ts_rank`'s ordering but costs most of the scan. This
   is close to a pure latency win, and it is the one change whose quality risk is
   smallest.
2. **Then re-measure sparse quality.** If `recall@20` does not move off 17.0%,
   the sparse arm is not worth fusing at any weight.
3. **Then fix fusion** — weight the arms, or gate sparse's contribution on its
   own confidence. Do not do this before (2): the right fusion weight depends on
   how good sparse actually is once it is asking a sensible question.
4. **Only then** consider vector work. **Do not tune HNSW because hybrid is
   weak.** The vector index is not the subsystem at fault, and any HNSW result
   measured through the current fusion is measuring fusion.

## 6. LANE BOUNDARY

`services/api/src/search/retrieve.ts` is **LCC's file** and has not been touched
by NEW1. This document is a measurement and a recommendation; the change is
LCC's to make. Sent as bus 0656.

Reproduce: `pnpm --filter @lawmind/harness rrf:displacement` (offline) and
`gold:presence` (read-only, primary-key lookups).
