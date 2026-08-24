# SEMANTIC SEARCH — THE RELEASE DECISION

**NEW1 · 23 Aug 2026.** Every number here is measured, with its artefact named.
No launch threshold is invented; the conclusion is one of the four the lane was
asked to choose between, with the evidence that forces it.

---

## THE VERDICT

> ### C — SEMANTIC RESEARCH MUST REMAIN HIDDEN / EXPERIMENTAL.
>
> **But the reason is not the one anyone has been working from, and it changes
> what to do next.** Semantic search is not failing because the ranking is bad or
> the representation is wrong. **It is failing because the documents are not in
> the index.** On the small population where the dense arm can actually see the
> target, it finds it at rank ≤20 in **83–100%** of cases — while the lexical arm
> finds it in **0%**.
>
> That is not a weak component. That is a working component pointed at an empty
> shelf.

**Identity search — citation, case number, case title — is a different product
and it is ready.** It should not be held back by this.

---

## 1. WHAT IS READY NOW

| surface | evidence | quality | safety / coverage | latency |
| --- | --- | --- | --- | --- |
| **Citation lookup** | `advocate100-results.json` | **6/6** bound targets, all rank 1 | 0 false identities | **p50 8 ms**, p95 74 ms |
| **Case number** | same | **4/4** in top 5 | — | p50 1,776 ms |
| **Case title, UNIQUE** | `case-title-battery.json` | **155/155 rank 1 (100.00%)** | 0 wrong pins, 0 degraded | p50 408 ms, p95 ~1.2 s |
| **Case title, DUPLICATED** | same | s@5 **86.49%**, 75.7% ambiguity-correct | 0 silent drops | p50 397 ms |

Case-title search moved this round from p95 **19,196 ms with 9 timeouts** to
p95 **~1.3 s with zero**, and unique-title rank-1 from 94.2% to **100%**.
`CASE_TITLE_SEARCH_CONTRACT_V1.md` holds the gates.

**One open product gap, not a retrieval one:** all 10 remaining case-title misses
are titles held by **16 to 200 judgments**. A five-slot page cannot represent a
200-judgment set and no ordering makes it able to.

---

## 2. WHAT IS NOT READY, AND WHY — THE CORRECTED DIAGNOSIS

### 2.1 The measurement everyone has been reading wrong

ADVOCATE-100 reports doctrine **1/12**, fact_pattern **0/10**,
supporting_authority **0/6**, adverse_authority **0/4**. This lane, and this
lane's previous round, read those as ranking or representation failures and built
a representation lab on that reading.

Then the cheaper question got asked: **is the target even in the index the dense
arm searches?**

`retrieve.ts`'s dense arm reads `judgment_chunks`. That table holds
**40,161 distinct judgments — about 0.2% of the corpus** — and **11 of the 27**
distinct ADVOCATE-100 targets.

`dense-reachability-ceiling.json`, `pnpm ceiling:dense`:

| class | n | dense-reachable | ceiling | in top 5 |
| --- | --: | --: | --: | --: |
| fact_pattern | 10 | **0** | **0.0%** | 0 |
| supporting_authority | 6 | **0** | **0.0%** | 0 |
| adverse_authority | 4 | **0** | **0.0%** | 0 |
| long_narrative / pasted_passage / statute | 9 | **0** | **0.0%** | 0 |
| doctrine | 12 | **2** | 16.7% | 1 |
| current_law | 4 | 4 | 100.0% | **0** |
| misspelling | 5 | 5 | 100.0% | **0** |
| overruled | 5 | 5 | 100.0% | 2 |
| case_title | 6 | 5 | 83.3% | 3 |
| **TOTAL** | **72** | **26** | **36.1%** | **16** |

**A perfect dense arm scores 36.1%.** Measured is 22.2%.

**The falsifier fired and I am reporting it against my own theory:** I predicted
zero top-5 hits on unreachable targets; there are **five** — four `case_number`,
one `citation` — because exact routes need no vector. So this ceiling bounds
**dense**, not the product.

### 2.2 The two failures this splits into, which want opposite work

- **COVERAGE (the majority).** fact_pattern, supporting_authority,
  adverse_authority, long_narrative, pasted_passage, statute and 10 of 12
  doctrine targets have **no vector at all**. No representation, no `ef_search`,
  no reranker can return them.
- **GENUINE RETRIEVAL (the minority, and real).** `current_law` **0/4 despite
  4/4 reachable**, `misspelling` **0/5 despite 5/5 reachable**. These are in the
  index and still missed.

### 2.3 The dense arm is not weak — it is empty

`two-stage-candidates.json`, `pnpm stage1:candidates`. Candidate recall on
targets that ARE in `judgment_chunks` (n=6):

| stratum | generator | r@20 | r@100 | r@500 |
| --- | --- | --: | --: | --: |
| LONG_FULL | **dense ANN** | **83.3%** | **100.0%** | 100.0% |
| LONG_FULL | lexical rarest-3 | 0.0% | 0.0% | 16.7% |
| SHORT_FAMILY | **dense ANN** | **100.0%** | **100.0%** | 100.0% |
| SHORT_FAMILY | lexical rarest-3 | 0.0% | 0.0% | 50.0% |

Across all 39 concept probes regardless of reachability, the lexical arm's
candidate recall at depth 500 is **10.3%** (long) / **25.6%** (short), and the
union beats either alone. **Reranking is not the indicated work**: the authority
is not in the pool to be reordered.

*Caveat, stated plainly: n=6 in the matched table. Directionally strong, not a
precise estimate.*

### 2.4 The eligibility contract is part of the coverage problem

`uncited-authority-bias.json`, corpus sample n=40,000 through the deployed view:
**16,035 documents — 40.09% — are unreachable ONLY because nothing cites them.**
15,701 of those (39.25%) are the **length** gate, 334 (0.84%) the class gate.
The rescue that is meant to save real authorities fires for **11 in 40,000
(0.03%)**.

A judgment delivered last month is uncited because it is recent, not because it
is unimportant. Escalated as `FQ-ELIGIBILITY-UNCITED`; the view is LCC's file and
the class evidence is NEW2's, so it is not changed by this lane alone.

---

## 3. WHAT IS SAFE TODAY — the part that does not block release

`retrieval-safety.json`, `pnpm safety:retrieval`.

**FALSE_IDENTITY_RATE = 0/6.** Six fabricated identifiers — `2099 INSC 9999`,
`2098:DHC:888888-DB`, `(2097) 14 SCC 991`, two invented case titles, an
impossible case number — each **confirmed absent from the corpus before use**,
and **no exact route answered any of them**. Threshold is zero and it is met.

This is the metric that matters: a ranked list says *"these are the closest
things I hold"*; an exact route says *"this is the case you named"*. Only the
second can end the company.

`NON_EMPTY_RATE 25/38` is reported as **behaviour, never pass/fail** — `/search`
returns authorities, not answers, and a page of near-misses is often the right
response to a proposition nobody has held.

**An instrument bug caught rather than reported around:** the first run printed
`FALSE_IDENTITY_RATE 0/0`. A `count(*)` over a three-way `OR` timed out at 15 s
(`neutral_citation` alone measures **21.2 s**), so no probe's absence was ever
confirmed. **A denominator of zero is not a pass.**

---

## 4. WHY NOT THE OTHER THREE VERDICTS

- **A — ready for public V1.** No. 22.2% of bound targets in top 5, and every
  concept class at or near zero. An advocate typing a fact pattern gets nothing.
- **B — ready for specific courts / query types.** This is *nearly* right and is
  what §1 already describes — but calling it "semantic research for some courts"
  would be a mislabel. What is ready is **identity lookup**, which is not
  semantic search. Shipping identity search under an AI label is exactly the "AI
  label over weak retrieval" the founder said no to.
- **D — delay release because this is core positioning.** No, and this is the
  substantive disagreement. Tier B (the daily loop) and identity search are ready
  and are what create the habit. Holding them for semantic research would delay
  the product for a component whose blocker is an embedding backlog with a known
  remedy.

---

## 5. WHAT WOULD MOVE IT TO A — in dependency order

1. **Coverage, and it is already running.** The Tier-A walk has staged
   **>1.02M document vectors**. The measured ceiling is 36.1% because
   `judgment_chunks` holds 40,161 judgments; promoting a document-vector index
   raises reach by orders of magnitude. **This is the binding constraint.**
2. **But NOT the current recipe unmeasured.** See §6 — the production HEAD:4800
   representation is the weakest arm measured. Promoting more of the weakest
   representation buys reach at the cost of quality.
3. **Then** re-run ADVOCATE-100 and re-read the ceiling. Reranking is justified
   only if candidate recall becomes strong while top ranks stay weak.
4. **Separately and now: `misspelling` 0/5 and `current_law` 0/4** are reachable
   failures and do not wait on coverage.

---

## 6. THE REPRESENTATION QUESTION — ANSWERED, AT SCALE

`representation-lab-v2.json`, `pnpm rep:lab2`. **45 ADVOCATE-100 concept tasks,
2,500-document pool** whose negatives are arm A's own ANN neighbours — every
negative is a document the production representation already ranks above the
gold, which is the conservative direction.

| arm | vectors/doc | s@1 | **s@5** | r@20 | r@100 | r@500 | nDCG@20 | KiB/doc |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| **A HEAD_4800 — PRODUCTION** | 1.00 | 11.1% | **20.0%** | 35.6% | 51.1% | 68.9% | 0.207 | 2.0 |
| **B POOLED_ALL** | **1.00** | 46.7% | **73.3%** | 86.7% | 97.8% | **100.0%** | **0.663** | **2.0** |
| C POOLED_SALIENT | 1.00 | 44.4% | 62.2% | 77.8% | 88.9% | 97.8% | 0.580 | 2.0 |
| D MULTI_3 | 3.00 | 42.2% | 66.7% | 77.8% | 86.7% | 95.6% | 0.588 | 6.0 |
| F ALL_CHUNKS — ceiling | 4.09 | 48.9% | **80.0%** | 88.9% | 97.8% | 100.0% | 0.695 | 8.2 |
| E LEXICAL→SEMANTIC | 1.00 | 24.4% | 35.6% | 40.0% | 44.4% | 44.4% | 0.308 | 2.0 |

### The core research question is answered

> **Can we get paragraph/fact sensitivity WITHOUT storing embeddings for every
> paragraph of 18M judgments?**
>
> **YES, and it costs nothing extra.**

- **B beats A by 3.7× on s@5 (73.3% vs 20.0%) at IDENTICAL storage** — one vector
  per document, 2.0 KiB either way. The only difference is that B is the
  L2-normalised mean of every chunk vector and A is the opening 4,800 characters.
- **B reaches 100% recall@500; A reaches 68.9%.** Nearly a third of targets are
  not in A's top 500 of a 2,500-document pool.
- **B is at 92% of the every-chunk ceiling (73.3 vs 80.0) at one quarter the
  storage** (2.0 vs 8.2 KiB/doc).
- **D MULTI_3 costs 3× storage and is WORSE than B on every metric.** More vectors
  per document is not the lever; a better single vector is.
- **E LEXICAL→SEMANTIC caps out at 44.4% recall@500** — reranking cannot rescue
  what the lexical candidate generator never proposed. Same conclusion as P3, by a
  different route.

The pilot said the same thing on 260 documents and the scaled run made the gap
*wider*, not narrower: A fell from 37.8% to 20.0% s@5 as the pool grew, while B
held at 73.3%. **A degrades with corpus size and B does not** — which is the
property that matters at 18M.

---

## 7. THE HC-DENSE DECISION (P7)

**Do NOT promote the 8.85M staged document vectors. They use the recipe that
measured WORST.**

The staged vectors are `HEAD:4800` — arm A. Promoting them would fix coverage
(the binding constraint, §2) while locking in a representation measured at
**20.0% s@5 against 73.3% for a pooled vector at the same storage cost.**

**Recommendation, in order:**

1. **Re-pool, do not re-select.** The expensive work — eligibility, text-safety
   screening, staging, accounting — is representation-independent and is already
   done for 1.02M documents. What changes is the recipe fed to the GPU.
2. **Promote POOLED_ALL.** Same storage, same index shape, same `halfvec` +
   HNSW plan in `HC_DENSE_RELEASE_PATH.md`. Nothing about the release mechanism
   changes.
3. **The current 8.85M HEAD:4800 vectors are useful as COARSE CANDIDATES only.**
   Saying so plainly is better than treating sunk GPU time as an argument. They
   are not wasted: they proved the walk, the accounting and the contract-hash
   gate all work at scale.

**What this does not settle:** the lab embeds its own documents in memory. A
production HNSW over pooled vectors at 8.85M has its own build time, RAM and
recall-vs-`ef_search` behaviour, and P6's 1M halfvec checkpoint is still the
measurement that answers it. That checkpoint remains deferred on resource
pressure, and no extrapolation from 1M to 8.85M is made here.

---

## 8. CAVEATS — the ones that would change these conclusions

- **ADVOCATE-100's effective n is 27, not 281.** One task (A100-007, a neutral
  citation naming a disposal event) carries 253 of the 281 bound targets. Every
  per-authority statistic has n=27.
- **Latency in the v2 run is contaminated** and labelled `LOCAL_CONTENDED`: the
  walk was staging and the representation lab was embedding throughout. p50
  5,109 ms here vs 1,716 ms on a quieter box. A clean-box re-run is owed before
  any latency number from that file is quoted.
- **The matched candidate-recall table is n=6.**
- **`SHORT_FAMILY` probes are built from proposition-family slugs**, which often
  contain the party name — this flatters lexical recall on that stratum.
- **Three case-title families are untested**: normalised variants, misspellings,
  V/VS/VERSUS. The gold contains none. ADVOCATE-100's misspelling class then read
  **0/5**, so this is a known gap, not a passing one.
- **No lawyer has reviewed any of this.** `PREFER_OVER_CURRENT_WORKFLOW` is not
  invented and no reviewer answer is fabricated.
- **The representation lab is 45 tasks over 2,500 documents.** The direction is
  large and consistent across two independent pool sizes; the exact percentages
  are not precise estimates, and none of it has been measured through a real
  HNSW index.
- **Temporal correctness passed and the first run of that probe was WRONG.**
  `temporal-correctness.json` now reports **0 date-bound violations across 8
  probes**, all returning results. The first run reported violations in five of
  eight — because it sent `dateTo` at the top level of the request when the
  schema nests it under `filters`, so zod stripped it and the search ran
  unfiltered. The product was correct and the instrument was not.
  `DATE_SUSPECT_SURFACED` is **UNMEASURED**: there is no `date_state` column on
  `judgments` on this database.
