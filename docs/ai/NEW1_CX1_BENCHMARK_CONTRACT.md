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
