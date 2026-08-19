# NEW1 — THE MINIMUM VECTOR MULTIPLIER, AND IT IS FIVE

**Owner: NEW1.** 19 August 2026. P5.
Tool: `pnpm --filter @lawmind/harness rep:layers`
(`services/harness/src/representation-layers-cli.ts`).
Artifacts: `docs/ai/new1-halfvec/representation-layers.json` (layers A–D and the
matched random control) and `representation-layers-v2.json` (the isolating run:
E, F, G and a second control).

Successor to `NEW1_REPRESENTATION_LAB.md` (18 Aug), which established the floor
(HEAD, 1 vector/document, 89–96% of full-chunk quality) and the ceiling
(ALL_CHUNKS, 32.82 vectors/document). This asks the question that one could not:
**which ADDITIONAL vector earns its storage?**

---

## THE HEADLINE

**Five vectors per document BEAT the 32.82-vector ceiling at 15.2% of the vectors,
a seeded-random selection of the same size does not, and the two hand-designed
legal-structure layers contribute nothing at all.**

| representation | vec/doc | succ@5 | rec@20 | MRR | nDCG@5 | nDCG@20 |
| --- | --- | --- | --- | --- | --- | --- |
| A · HEAD | 1.00 | 20.1% | 37.8% | 0.140 | 0.137 | 0.186 |
| B · HEAD+TAIL | 2.00 | 18.4% | 37.8% | 0.135 | 0.128 | 0.182 |
| C · HEAD+TAIL+ISSUE | 3.00 | 19.4% | 38.5% | 0.133 | 0.128 | 0.182 |
| **D · HEAD+TAIL+ISSUE+MEDOID2** | **5.00** | **24.0%** | **44.9%** | **0.166** | **0.164** | **0.223** |
| CONTROL · HEAD+RANDOM4 | 4.99 | 18.7% | 43.1% | 0.139 | 0.129 | 0.198 |
| CEILING · ALL_CHUNKS | 32.82 | 23.0% | 41.7% | 0.157 | 0.153 | 0.207 |

Retention against the ceiling:

| representation | vector share | succ@5 kept | rec@20 kept | beats ceiling |
| --- | --- | --- | --- | --- |
| A · HEAD | 3.0% | 87.7% | 90.7% | no |
| B · HEAD+TAIL | 6.1% | 80.0% | 90.7% | no |
| C · HEAD+TAIL+ISSUE | 9.1% | 84.6% | 92.4% | no |
| **D** | **15.2%** | **104.6%** | **107.6%** | **YES** |
| CONTROL · HEAD+RANDOM4 | 15.2% | 81.5% | 103.4% | no |

**The control is the load-bearing row.** D and CONTROL_HEAD_RANDOM4 spend the
same budget — 5 vectors per document, 15.2% of the ceiling's — and D scores 24.0%
success@5 against the control's 18.7%. So this is not "more vectors help". It is
a specific selection helping, and the counterfactual was run rather than argued.

---

## THE ISOLATING RUN — WHICH selection, and how few

D carries five vectors, two of which (TAIL, ISSUE) scored WORSE than head-only on
their own. So a second run took the positional proxies away and left the geometry.
Same pool, same queries, same seed, same embedder.
Artifact: `docs/ai/new1-halfvec/representation-layers-v2.json`.

| representation | vec/doc | succ@5 | rec@20 | MRR | vs ceiling (succ@5 / rec@20) |
| --- | --- | --- | --- | --- | --- |
| A · HEAD | 1.00 | 20.1% | 37.8% | 0.140 | 87.7% / 90.7% |
| **G · MEDOID2 only** | **2.00** | 20.8% | 41.3% | 0.159 | 90.8% / 99.2% |
| **E · HEAD+MEDOID2** | **3.00** | 21.9% | 43.1% | 0.165 | 95.4% / **103.4%** |
| **F · HEAD+MEDOID4** | **4.99** | **24.0%** | 43.8% | 0.167 | **104.6% / 105.1%** |
| D · HEAD+TAIL+ISSUE+MEDOID2 | 5.00 | **24.0%** | **44.9%** | 0.166 | **104.6% / 107.6%** |
| CONTROL · HEAD+RANDOM2 | 3.00 | 18.7% | 37.1% | 0.123 | 81.5% / 89.0% |
| CONTROL · HEAD+RANDOM4 | 4.99 | 18.7% | 43.1% | 0.139 | 81.5% / 103.4% |
| CEILING · ALL_CHUNKS | 32.82 | 23.0% | 41.7% | 0.157 | — |

**Four things this settles.**

1. **TAIL and ISSUE contribute nothing.** F (HEAD + 4 medoids) matches D's 24.0%
   success@5 exactly, using the same vector budget with no closing span, no issue
   marker, no regex and no extraction stage. D keeps a 1.1-point edge on recall@20
   and that is the whole of what two hand-designed legal-structure layers bought.
2. **The selection is confirmed at BOTH budgets, not one.** Random controls score
   18.7% at 3 vectors and 18.7% at 5 — flat, and 3.2 to 5.3 points below the
   medoid arms at the identical count. A count effect would have moved the control.
3. **Three vectors is 95.4% / 103.4% of full chunking** — under the ceiling on
   success@5, over it on recall@20, at 9.1% of the vectors.
4. **Two medoids with no HEAD at all (20.8%) beat HEAD alone (20.1%).** The
   opening of a judgment is not the best single thing to embed; the centre of its
   own semantic mass is.

### The recommendation this produces

**HEAD + 4 medoids (F), 5 vectors per document.** Same success@5 as the
five-vector D, and it needs no marker lexicon, no assumption about where Indian
judgments put their holdings, and no legal-object extraction stage that does not
exist yet. Everything it needs is the chunk vectors and one HEAD span.

If storage is the binding constraint, **E at 3 vectors** gives up 2.1 points of
success@5 for 40% fewer vectors and still beats full chunking on recall@20.

---

## THE THREE THINGS THAT SURPRISED ME

**1 · The positional proxies are not merely useless — they cost.** B (+TAIL) and
C (+ISSUE) both score BELOW A on success@5: 18.4% and 19.4% against 20.1%. Under
MAX pooling an extra vector cannot mathematically hurt a document's own best
score, so this is not a pooling artefact — it is the extra vectors giving OTHER
documents a better shot at outranking the gold. A vector that matches broadly
promotes its document on queries it should not.

Both were built as text-addressable proxies for legal objects that do not exist
yet: TAIL for the operative holding, ISSUE for the question presented. **The proxy
does not work, and that is a finding about the proxy, not about the objects.** A
real extracted holding may well behave differently — this measured a heuristic
about where holdings usually sit, and that heuristic lost.

**2 · Geometry beat position.** MEDOID2 — the two chunks nearest the document's
own centroid — is the only additive layer that pays. It needs no rule about
Indian judgment structure, no marker list, and no extraction stage. It is
computed from vectors the corpus already has.

**3 · The winning arms beat the ceiling, they do not merely approach it.** 104.6% of the
ceiling's success@5 and 107.6% of its recall@20. Full chunking is not an upper
bound on quality; it is 32.82 vectors that include a great many that only add
noise. This inverts the intuition the whole exercise started from.

---

## WHY THIS IS CREDIBLE, AND WHERE IT IS NOT

**The document side is one embedder, verified rather than assumed.** Chunk
vectors are read from `judgment_chunks`; HEAD/TAIL/ISSUE spans are embedded on
the GPU sidecar. Mixing two embedders would put a systematic offset inside the
comparison, so the tool samples 60 stored chunks, re-embeds their text, and
**aborts** below cosine 0.999. Measured this run: **mean 0.999998, min 0.999978**.

**The query side is frozen and shared.** The same `eval-query-vectors.json` the
halfvec C3/C4 probe uses, so the two experiments cannot disagree about the query
side.

**The pool is real competition, not a sample.** 4,546 judgments — every document
the dense arm returned across the 283 eval queries, plus all gold. Rebuilt from
`arms-checkpoint.jsonl` rather than a saved list, so it cannot drift from the
frozen record.

**What this does NOT establish:**

- **Exact search over 4,546 documents is not HNSW over the corpus.** Absolute
  percentages here are not production numbers. The comparison BETWEEN
  representations, on identical infrastructure and an identical pool, is the
  measurement.
- **The pool is Supreme Court.** LCC's Tier-A census (bus 0785) puts 10.0% of the
  corpus in a `substantial` band averaging 27,949 characters — 5.1x the `full`
  band. A fixed HEAD window loses most exactly there, and this pool cannot show
  it.
- **One seed per random control.** RANDOM2 and RANDOM4 are one draw each. That
  two independent draws both landed on 18.7% is reassuring, but two points are not
  a distribution and repeating across seeds has not been done.

---

## WHAT IT MEANS FOR TIER-A SIZING

Against LCC's exact census — Tier A 9,700,157 documents, 8,854,281 distinct texts
after dedup (bus 0785):

| representation | vectors at 8,854,281 texts | halfvec at 5,571 B/vector |
| --- | --- | --- |
| 1/doc (HEAD) | 8.85M | ~46 GiB |
| **3/doc (E)** | **26.6M** | **~138 GiB** |
| **5/doc (F or D)** | **44.3M** | **~230 GiB** |
| 15.45/doc (old chunk shape) | 136.8M | ~710 GiB |

**F is 3.1x cheaper than the old chunk architecture and scores better than it on
this pool**, and E is 5.2x cheaper while still beating it on recall@20. That is the trade actually on the table, and it is a different
statement from "one vector per document is enough" — which is the shape currently
being staged.

Staging continues at 1 vector/document (`HEAD:4800`) because that is what is
measured end-to-end and what the manifest contract describes. **Moving to F is a decision that needs a
re-measurement at HNSW scale over the real Tier-A distribution — this pool is
Supreme Court and exact-search — and it is not taken here.**
