# LONG-FACT VALIDATION V2 — the condensation finding on posed queries

**Date:** 24 Aug 2026 · **Lane:** NEW1 · **Deliverable:** §7 NEW1-3
**Artefact:** `docs/ai/new1-tier-a/long-fact-posed.json`
**Instrument:** `services/harness/src/long-fact-posed-cli.ts` ·
`pnpm --filter @lawmind/harness long:posed`

---

## Outcome, first sentence

**Every arm scored 0 of 6, at every input size, at rank 5 and at rank 20** —
including at 500 characters, where there is no dilution at all. The dilution
question the brief asked cannot be answered by this experiment, because the floor
is already zero before any noise is added.

## 1. What was changed, and only that

`long-passage-cli.ts` produced `LONG_FACT_SEARCH_CONTRACT_V1.md`, whose finding
is the one LawMind's long-input design rests on:

| size | DIRECT | CONDENSED | CONTROL_500 |
| ---: | ---: | ---: | ---: |
| 500 | 8/25 | 8/25 | 8/25 |
| 1,000 | **4/25** | 8/25 | 8/25 |
| 2,500 | **4/25** | 8/25 | 8/25 |
| 5,000 | **4/25** | 8/25 | 8/25 |

Its queries came from `buildLaunchGold()`, which consolidates NEW3's verified
files. **Those files record in their own `caveat` that the query IS an
`own_text_span` substring of the target.** So the brief's suspicion was right —
about *this* experiment, not about the representation lab.

This run changes **one variable**: the queries are ADVOCATE-100 posed questions,
authored from the legal question under a ≤6 shared-word leakage guard. The
dilution construction, the sizes, the condenser, the probe index, `ef_search` and
top-K are byte-for-byte P4's. Two runs differing in one variable are a
comparison; two differing in five are two anecdotes.

## 2. The coverage wall, which is the real result

Before a single query was run:

| | |
| --- | ---: |
| posed tasks in the long/concept classes | 39 |
| distinct target judgments | 19 |
| **targets present in `new1_probe_half_250k`** | **2 (10.5%)** |
| scorable tasks | **6** |
| excluded for absence | **33** |

Excluded by class: doctrine 11, fact_pattern 8, supporting_authority 4,
adverse_authority 4, current_law 4, long_narrative 2.

Six tasks survive, and they are carried by **two documents**. Effective n for any
per-authority statement is **2**.

Widening the lens to every index LawMind holds, over the 20 distinct targets of
all 45 concept tasks:

| index | targets present | share |
| --- | ---: | ---: |
| `new1_doc_vector_stage` (1,097,864 staged) | 12 | 60.0% |
| `judgment_chunks` (shipped passages) | 4 | 20.0% |
| `new1_probe_half_250k` (the searchable probe) | **2** | **10.0%** |

**The documents an advocate's question is about are not in the index that would
answer it.** `adverse_authority` and `pasted_passage` have **zero** targets in the
probe; `current_law` has zero in the probe but four in `judgment_chunks`.

## 3. The measurement

| size | DIRECT | CONDENSED | CONTROL_500 | LEXICAL_RAREST3 | advocate-word retention | embed p50 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 0/6 | 0/6 | 0/6 | 0/6 | **0.924** | 446 ms |
| 1,000 | 0/6 | 0/6 | 0/6 | 0/6 | 0.320 | 390 ms |
| 2,500 | 0/6 | 0/6 | 0/6 | 0/6 | 0.244 | 382 ms |
| 5,000 | 0/6 | 0/6 | 0/6 | 0/6 | 0.244 | 437 ms |

At rank 20 the table is identical: **0/6 everywhere**.

`LEXICAL_RAREST3` is measured here for the first time. P4's header listed a
lexical arm; P4's executed rows contained only DIRECT, CONDENSED and CONTROL.
The arm was documented and never run. It scores zero as well.

## 4. What follows, and what does not

**(a) P4's curve was measuring the decay of a verbatim overlap.** With a lifted
query, 500 characters starts at 8/25 because the query is a sentence from the
target and the vector is nearly a duplicate; appending noise dilutes that
duplicate and the score halves. With a posed query there is no duplicate to
dilute — the run starts at zero and stays there. **The 8/25 → 4/25 finding is
real and it is about lifted sentences.** It should not be quoted as evidence
about what an advocate's paragraph of facts does.

**(b) The condensation contract is not refuted — it is untested.** CONDENSED held
flat at 8/25 in P4 and holds flat at 0/6 here. Flat at zero is not evidence of
robustness. `LONG_FACT_SEARCH_CONTRACT_V1`'s recommendation to condense rather
than truncate remains the best available design and now has **no** posed-query
support either for or against it.

**(c) The condenser discards three quarters of the advocate's own words.**
Advocate-word retention falls **0.924 → 0.244** as input grows. The condenser
selects sentences carrying the rarest lexemes by measured document frequency, and
the appended judgment text is rarer than an advocate's plain-English framing — so
it keeps the noise and drops the question. **This is invisible in a lifted
benchmark**, where the query's own words are the target's rare words and
selecting for rarity selects for the query. It is visible the moment the query is
paraphrased. A condenser that wins the benchmark by discarding the advocate's
framing is winning the benchmark and losing the product.

> Retention counts word overlap, not meaning. A condenser can keep every word and
> still lose the question. 0.244 is a floor on the loss, not a measure of it.

**(d) Determinism is now measured rather than asserted.** Every input was
condensed twice: **0 disagreements in 24 pairs.** The contract says a condensation
that varies between identical requests breaks pagination; that was a claim about
the code, and it now has a measurement behind it. 24 pairs is small; it is the
number the coverage wall permits.

**(e) The 500-character cap is not the problem here and raising it would not
help.** At 500 characters — the product's current behaviour, no dilution, no
condensation — the score is already 0/6.

## 5. What this does NOT claim

- **n = 6, effective n = 2.** No rate, no interval, no comparison between arms is
  supportable at this size. What is supportable is the direction: zero is zero at
  every size and every arm, and a coverage wall of 2 targets in 19 is not a
  sampling artefact.
- This is a result about **`new1_probe_half_250k`**, the searchable probe. It is
  not a corpus result. 60% of these targets *do* have a staged document vector;
  they are simply not in the index anything searches.
- It does not re-measure the embedder truncation probe. P4 settled that: cosine
  to the 1,000-character prefix falls 1.0000 → 0.6625 while cosine to the full
  text rises 0.6435 → 1.0000. The model reads long input; the 500-character cap
  protects the sparse arm, not the model.
- It does not propose raising or keeping the API cap. That is a product decision
  resting on the lexical arm's safety, not on this measurement.
- **It says nothing about whether condensation is the right design.** It says the
  evidence offered for it so far was measured on queries of the wrong kind.

## 6. What would make this answerable

Not a better condenser, and not a bigger input cap. **Coverage.** The same
experiment becomes informative the moment the targets an advocate's question is
about are in the index being searched — which is the question
`SEMANTIC_REPRESENTATION_DECISION_V3` is measuring, and is why NEW1-4's refusal
to start a reranker sprint still holds. Reranking a pool that does not contain
the document cannot produce the document.
