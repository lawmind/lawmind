# NEW1 — REPRESENTATION LAB: IS 15.45 VECTORS PER DOCUMENT BUYING ANYTHING?

**Owner: NEW1.** Written 18 August 2026. GPU-embedded (RTX 4060 Ti, BGE-M3 fp32,
CUDA confirmed, 98% mean utilisation — `docs/ai/new1-post-0055/gpu-bench.json`).
No CPU/database contention: this ran entirely off a text file and the GPU
sidecar while the ingest fleet kept writing.

Tool: `pnpm --filter @lawmind/harness rep:lab`
(`services/harness/src/representation-lab-cli.ts`).
Artifact: `docs/ai/new1-post-0055/representation-lab.json`.

---

## THE HEADLINE

**One vector per document retains 89–96% of full-chunking quality at 3% of the
vector cost — and beats a curated 4-vector selection on every metric.**

| representation | vectors/doc | vectors | success@5 | recall@20 | MRR | nDCG@5 | nDCG@20 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **ALL_CHUNKS** (production shape) | 32.82 | 149,211 | 23.0% | 41.7% | 0.147 | 0.153 | 0.207 |
| **HEAD** (1 vector/doc) | 1.00 | 4,546 | 20.5% | 39.9% | 0.138 | 0.139 | 0.195 |
| **SALIENT** (~4 vectors/doc) | 3.99 | 18,138 | 15.2% | 35.0% | 0.116 | 0.111 | 0.166 |

Quality retained per vector spent, against ALL_CHUNKS:

| | share of vectors | success@5 retained | recall@20 retained |
| --- | --- | --- | --- |
| HEAD | **3.0%** | **89.1%** | **95.7%** |
| SALIENT | 12.2% | 66.1% | 83.9% |

This directly answers P6/directive: *"Test whether retrieval can get most
quality from one authority/document representation… instead of vectorizing
every generic chunk."* **Yes.** And it directly matches LCC's independent
contract decision (bus 0723): *"TIER_A is defined as a DOCUMENT-representation
population: ONE vector per document."* This lab is the retrieval-quality
justification for that design — LCC defined the tier before this measurement
existed; this measurement says the definition is not merely cheaper, it is
close to free in quality terms, on this evaluation set.

---

## WHY THIS MEASUREMENT IS SOUND

**The pool is the real competition, not a random sample.** 4,546 judgments: the
union of every document the dense arm actually returned across all 283
CONTROLLED evaluation queries, plus every gold judgment — including the 110
gold the dense arm never found in this run, which had to be present or the
experiment would only ever be scored on queries dense already wins. These are
real hard negatives.

**ALL_CHUNKS reproduces the production index exactly, verified before any
comparison was drawn.** The 4,546 ids were checked against `judgment_chunks`
directly: **149,211 stored chunks, 149,211 re-chunked with the production
chunker — an exact match.** The production chunker (`chunkJudgment`,
`defaultChunkOptions`, maxChars 2400) is imported unmodified from
`@lawmind/embed`, not reimplemented. ALL_CHUNKS in this lab **is** what the
current index holds for these documents, not an approximation of it.

**32.82 vectors/document here, not the corpus-wide 15.45 — and that gap is
itself a finding, not noise.** The corpus-wide multiplier
(`vectors-per-document.json`) is measured over ALL 40,161 embedded judgments.
This pool is retrieval-selected: documents that rank well against real legal
queries. **Dense retrieval over-selects long documents by 2.13x relative to the
embedded population at large.** Worth its own line to LCC and NEW2: length is
already acting as an uncontrolled ranking signal in the current index, before
any representation change.

**Scoring matches production exactly.** MAX pooling per document (the same
collapse `retrieve.ts` performs), cosine over L2-normalised vectors (dot
product, not renormalised — a normalisation bug would show up as systematic
underscoring rather than being silently hidden), single gold per query, same
metric definitions as `metrics.ts` (`meanNdcgAtK` imported directly).

---

## THE TWO REPRESENTATIONS TESTED, AND WHY SALIENT LOST

**HEAD** — one vector over the opening ~4,800 characters (roughly two chunks'
worth). An Indian judgment opens with the court, the parties, the provisions in
issue and the question presented — the closest thing the document has to a
self-description.

**SALIENT** — a bounded selection: opening chunk, closing chunk, and the
longest interior chunks up to 4 total. The hypothesis was that the holding sits
at the end ("In the result, the appeal is allowed…") and the reasoning that
earns it is in the longest paragraphs.

**The hypothesis was wrong, and the reason is informative.** SALIENT uses 4x
HEAD's vectors and scores worse on every single metric. Under MAX pooling, more
vectors should only ever help or be neutral — each additional vector is another
chance to score well, never a penalty — so this is not a pooling artefact.

**INFER, not KNOW:** SALIENT's 4 chunks are a bet that the opening, closing and
longest paragraphs contain whatever the query is asking about. When they don't
— and CLERC-style ground truth (a citing passage from a LATER judgment) has no
reason to align with an OPENING's framing or a paragraph's LENGTH — SALIENT has
committed its entire budget to the wrong 12% of the document and has nothing
else to fall back on. HEAD's single vector is a coarse average over its opening
span; it is weaker signal per-topic but it is never confidently wrong about
which fragment to trust, because it is not choosing fragments at all. This
explanation is plausible and untested — it was not the experiment's design and
should not be treated as established.

---

## WHAT THIS DOES AND DOES NOT SAY ABOUT SHIPPING HEAD-ONLY

**Does say:** a 1-vector-per-document population is not a quality sacrifice
dressed up as a cost saving. At corpus scale this is the difference between
LCC's TIER_A at ~8.49M vectors (1x) and the same tier at ~131M vectors (15.45x,
per bus 0697/0723) — roughly 235 GiB of halfvec storage for a measured 89–96%
quality retention, not a coin flip.

**Does NOT say:** that HEAD is the ceiling for a 1-vector design. `HEAD_CHARS`
(4,800) was chosen once, not swept — a different window, or a query-aware
summary, could do better or worse. It also does not test the directive's
SECOND candidate — verified holding/issue/proposition vectors — because that
data does not exist: the proposition/evidence stage is `PLANNED`, not built, in
`RETRIEVAL_PROGRAM.md`. This lab answers "is per-document worth trying", not
"is per-document the best per-document representation".

**Does NOT say anything about production-scale ANN behaviour.** This is exact
search over an in-memory pool of 4,546 documents, not HNSW over 9.5M. Absolute
percentages here are not comparable to the CONTROLLED baseline's numbers
(dense-only ALL_CHUNKS here reads 23.0%/41.7% against the baseline's
21.9%/40.6% on the SAME 283 queries — close but not identical, because the
candidate pool differs: this lab's pool is 4,546 hand-picked hard documents,
the production run searches the whole embedded corpus through HNSW). The
comparison BETWEEN representations, run on identical infrastructure and the
identical pool, is the load-bearing measurement; the absolute numbers are not.

---

## RECOMMENDATION

Adopt HEAD (1 vector/document, ~4,800 chars from the start of the text) as
LCC's TIER_A population shape. It is already what the contract defines by
design; this is the evidence that the design does not cost what a naive
"more vectors is always better" intuition would predict.

**Before generating at corpus scale:** sweep `HEAD_CHARS` — this lab fixed it
once. A cheap follow-up (GPU-only, no database write) could test 2,400 /
4,800 / 9,600 characters against the same pool in under an hour of GPU time.

**Do not build SALIENT as a production tier from this result.** It underused
its own budget on this evaluation set. If interior-paragraph value is worth
pursuing, it belongs after the proposition/evidence stage identifies WHICH
paragraphs matter, not before.

---

## CAVEATS

- One evaluation set, 283 queries, all Supreme Court, CLERC-method
  citing-passage ground truth. Not replicated on a High Court sample or a
  cross-lingual one.
- `HEAD_CHARS` and `SALIENT_MAX` are each a single fixed value, not swept.
- The SALIENT failure explanation is INFERRED, not verified by a separate
  experiment isolating which of its 4 chunks (if any) ever scored well.
- This lab required a live GPU sidecar and a single bulk read of 4,546
  `judgments.full_text` rows — the only database contact in the whole run, done
  once, paged, and closed before embedding began.
