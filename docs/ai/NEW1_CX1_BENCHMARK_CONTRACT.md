# NEW1 → CX1 — THE BENCHMARK CONTRACT

**Owner: NEW1.** Created 17 August 2026, on the founder's CX1 coordination
addendum. This file is what CX1 consumes; it is not a plan, it is an interface.

CX1 may **run** experiments. NEW1 owns **relevance gold, benchmark correctness,
final retrieval-quality interpretation, embedding model choice, whether halfvec
is acceptable, production retrieval architecture, and every SCALE / LIMITED
SCALE / DO NOT SCALE decision.**

**CX1 must never modify the gold labels.** If a label looks wrong, that is a
finding to send back, not an edit to make. A benchmark whose labels move under
an experiment measures nothing.

---

## 0. HANDOFF — CX1 IS UNAVAILABLE, NEW1 INHERITS ITS EXECUTION WORK (17 Aug 2026)

CX1 hit usage limits. NEW1 inherits the unfinished retrieval/vector execution.
**Its harnesses are adopted, not recreated** — `scripts/cx1-retrieval-matrix.mjs`,
`docs/ai/cx1-*/`, `CX1_EXPERIMENT_REGISTRY.*`. Its historical controlled
checkpoint is **not to be overwritten**.

### What CX1 already settled, and what it explicitly did not

`CX1_HALFVEC_FIDELITY.md`, on **copied** vectors, 100,000 pairs:

    absolute cosine error   p50 0.0000076 · p95 0.0000224 · max 0.0000545
    exact top-k overlap     k=5 0.9990 · k=10 0.9995 · k=20 1.0000 · k=50 0.9998
    first-result disagreement 0.0000 · rank correlation 1.0000

**Representation loss is measured and negligible.** That is C1/C2 and no more.
CX1 said so itself: *"This report isolates representation loss; it does not
approve production halfvec."*

**Still unproven, and now NEW1's:**

- **ANN approximation loss** — HNSW fp32 and HNSW halfvec against an **exact
  fp32** reference. Representation loss and approximation loss are different
  quantities and must not be summed into one "halfvec is fine".
- **End-task quality** — `success@5`, `recall@20`, `MRR`, nDCG on the frozen gold
  benchmark.

### The sequencing decision, which is NEW1's to make and is now made

**The halfvec end-task measurement runs against the DENSE ARM ALONE, never
through hybrid.**

Measured reason, not preference: fusion currently destroys the dense arm's
advantage — RRF damages gold **8.4× more** when the sparse arm misses it, and
knocks gold out of the top 5 on **42.6%** of the queries where dense had it
(`pnpm rrf:displacement`; `NEW1_SPARSE_ARM_ROOT_CAUSE.md`). A halfvec-vs-fp32
delta measured through that fusion would be swamped by fusion noise — it would
measure fusion, not the vector representation.

**Consequently, and this is the founder's own instruction confirmed by
measurement: do NOT tune HNSW because hybrid is weak.** Fusion is the defect.
HNSW parameter work (staged small → medium → finalist, never a full grid) comes
**after** halfvec remains viable, and its results are read against the dense arm.

### Resource rule

The machine is shared with LCC's index work and NEW2's ingest fleet. Machine
state is measured, never assumed from a stale snapshot. **Busy → benchmark
analysis, failure decomposition, query stratification, harness preparation.
Quiet → the heavy vector experiment.**

## 1. STATUS — NOT YET FROZEN

**Do not consume this benchmark for scale decisions yet.** The post-migration
local baseline is still being measured for the first time against the 7,296,068
-judgment corpus; every prior number in this repo was taken against 79,321
judgments and is a different measurement, not a comparable one.

The handshake fires when NEW1 sends **`BENCHMARK_FROZEN`** with a path and a
SHA-256. Until then, treat anything here as shape, not values.

## 2. THE QUERY SETS, AND WHICH IS WHICH

| set | file | n | what it is |
| --- | --- | --- | --- |
| eval | `services/harness/src/fixtures/queries.eval.json` | 283 | the graded set. Relevance gold. |
| derived | `services/harness/src/fixtures/queries.derived.json` | 20 | generated from corpus structure |
| hand | `services/harness/src/fixtures/queries.hand.json` | 5 | hand-written |
| adversarial | `services/harness/src/fixtures/adversarial.json` | 5 | must-not-fabricate cases |
| gate | in-CLI, `TARGET_QUERIES = 30` | 25 usable | Gate S2's own set. 5 BNS queries are NOT WRITTEN — `statute_mappings` holds no rows |

**308 total across the three query files.** Measured today: **zero of the 308**
route to `exactCitation`, so none of them exercises the exact-citation hot path.
That is a property of the set, and it is a gap worth naming rather than a
convenience — the hot path LCC is indexing under migration `0052` is currently
graded only by the adversarial cases and the structured gate, not by the eval
set.

## 3. METRICS CX1 MUST RETURN

Return **all** of these per configuration, or say explicitly which could not be
measured and why. A metric silently omitted reads as a metric that passed.

### 3.1 Retrieval quality — the ranked list
- `successAt5`, `successAt10` — is a gold-relevant authority in the top k
- `NDCG@10` — graded, not binary
- `MRR` — first relevant rank
- `recallAtCandidateSet` — before fusion and before rerank, did the arm's
  candidate set contain the gold authority **at all**. This one separates a
  ranking failure from a retrieval failure and is the single most useful number
  for deciding where to spend effort.

### 3.2 Vector-specific — the CX1 mandate
- `exactNeighbourOverlap@k` — ANN result set against exhaustive search on the
  same vectors. Report k = 10, 50, 100.
- `annRecall@k` — against the exact-neighbour set, not against gold
- `fp32 vs halfvec fidelity` — cosine delta distribution (mean, p50, p95, max)
  **and** the resulting change in `exactNeighbourOverlap@10`. A storage saving
  that moves no neighbours is a different decision from one that moves some;
  report both, never the size saving alone.
- HNSW Pareto frontier over `m` × `ef_construction` × `ef_search`: build time,
  index size, query latency p50/p95, `annRecall@10`.

### 3.3 Cost and latency — measured, not modelled
- index build wall-clock and peak memory
- on-disk index size
- query latency p50 / p95 / p99, **cold and warm** stated separately
- embedding throughput (chunks/sec) and the hardware it was measured on

### 3.4 Always, alongside every number
- corpus snapshot: row counts for `judgments`, `judgment_chunks`,
  `judgment_paragraphs`
- embedding model id and dimensionality
- the exact query-set file and its SHA-256
- postgres version and whether the run had the box to itself

## 4. HOW TO REPORT A RESULT

One JSON per configuration, plus one sentence saying what you think it means.
The sentence is not a decision — NEW1 draws the conclusion — but an experimenter
who cannot say what a number means usually has a number that does not mean
anything.

**Report failures as failures, with the actual output.** A configuration that
OOMed, timed out, or could not be built is a result. It goes in the matrix with
the error text, not omitted from it.

## 5. WHAT CX1 SHOULD NOT DO

- **Do not re-run large HNSW / vector grids NEW1 has already assigned** — that
  duplication is the thing this contract exists to prevent. Ask first.
- **Do not treat a measured win as a production decision.** SCALE / LIMITED
  SCALE / DO NOT SCALE is NEW1's call, on measured evidence.
- **Do not embed the full corpus.** The pilot population is bounded on purpose;
  see §6.
- **Do not modify gold labels, query files, or thresholds.** `THRESHOLDS` in
  `services/harness/src/metrics.ts` are release gates with a standing
  never-weaken rule.

## 6. THE EMBEDDING PILOT POPULATION — BOUNDED, AND WHY

Not the full corpus. The founder's direction and this lane's own measurements
agree, for different reasons:

- **NEW2's composition measurement** of the plain HC variant: `decided` 18.0%,
  `unclassified` 44.5%, `procedural_disposal` 17.0%, `bail_order` 12.5%,
  `decided_brief` 5.5%, `reference_stub` 2.5%. **18.0% is an upper bound on the
  authority share**, and the 44.5% is the `DISPOSED*`/`CLOSED` residue the
  classifier deliberately refuses — on the order of 8–9 million documents.
  Embedding that residue buys nothing retrievable.
- **`judgment_chunks` currently holds 620,300 chunks against 7,296,068
  judgments.** Chunk coverage is the constraint, not embedding throughput.

Eligibility is NEW1's to define and is **not yet frozen**. Preference order,
per the founder: canonical substantive judgments → holdings → issues → legal
propositions → important paragraphs.

**A third outcome the current gate does not distinguish, and CX1 must:** a gold
authority sitting in the `unclassified` residue is *unclassified*, not
*missing*. Scoring it as a retrieval miss overstates the failure rate and points
effort at the wrong subsystem.

## 7. PROVIDER TEACHERS

Indian Kanoon, Supreme Today AI and Bharat NyaI are permitted for **hard-query
candidate generation only**. They are teachers, not truth:

**Primary-source verification remains gold.** A citation a provider returns is a
candidate to verify against our own corpus and the court record — never a label,
and never a reason to mark one of our results wrong. Measure: unique correct
authorities, hard negatives, ranking differences, citation identity,
treatment/currentness differences.

Anything a teacher produces that reaches a user's screen still passes the
citation harness unchanged. `docs/CITATION_HARNESS.md` is not relaxed for
experiments.

---

**Contact:** bus lane `NEW1`. Send results as a message with the JSON path;
NEW1 will interpret and record the decision.
