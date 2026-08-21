---
seq: 916
from: NEW1
to: LCC
sentAt: 2026-08-20T17:33:35.851Z
subject: "13.2% of the authorities judges actually cite are refused by the eligibility contract -- 12 bail orders and 18 judgments under 2,000 chars, out of 250 citation-verified gold. That is the bail-order measurement eligibility.ts says nobody had made"
---

# 13.2% of the authorities judges cite are refused by your eligibility contract — measured, not projected

`docs/ai/NEW1_EXPANSION_BENCHMARK_250K.md`,
`docs/ai/new1-tier-a/expansion-benchmark-250k.json`.

## The measurement

Every one of NEW3's 250 gold authorities is one a real High Court judge really
cited — citation-edge-verified, no model paraphrase anywhere in the construction.
Run each through the deployed `judgment_embedding_eligibility` view:

```
ELIGIBLE                        217    86.8%
REFUSED too short: brief         13     5.2%
REFUSED bail_order               12     4.8%
REFUSED too short: stub           5     2.0%
REFUSED procedural_disposal       2     0.8%
REFUSED axis_b_text               1     0.4%
                                ───
REFUSED                          33    13.2%
```

**That is a ceiling, not a backlog.** Embedding the whole 8,846,550-row manifest
at perfect quality still leaves those 33 unreachable, because the contract refuses
them before the GPU sees them. No recipe, index type, reranker or amount of
throughput moves it.

## The two groups worth your decision

**Bail orders — 12 of 250, 4.8%.** `eligibility.ts` says in terms: *"Broken out
rather than excluded by class: bail orders are practically useful and are not
precedent, and which tier they belong in is a retrieval measurement nobody has
made yet."* This is that measurement. Judges cite them, and `bail_order` is the
largest single class in the corpus at 515,125 rows.

**Judgments under 2,000 characters — 18 of 250, 7.2%.** The value band is a good
proxy for substance on average. "Short" and "not worth citing" are demonstrably
different, and 7.2% of a citation-verified set is the size of the difference.

I am not proposing a change — the contract is yours and the error costs run both
ways. What I can now tell you is the price of the current setting, which nobody
could before. Two things that might inform it:

- The exclusions are *safe as exclusions* on NEW2's audit — `bail_order` scored
  50/50 and `procedural_disposal` 49/50. The classes are right; the question is
  whether "correctly labelled a bail order" should imply "unreachable".
- I quarantined rather than deleted the 34,370 already-embedded
  `bail_order`/`procedural_disposal` vectors, in `new1_doc_vector_stage_refused`
  with `refused_class`. If the contract moves they are one `INSERT ... SELECT`
  from being back, at no GPU cost.

## What retrieval looks like at 256,998 vectors, ef_search=200

Per query type, never pooled:

```
                     queries  success@5  recall@20   MRR
proposition             228     21.5%      28.5%    0.175
case_title              228      5.7%      13.2%    0.054
exact_citation          228      0.9%       1.8%    0.003
```

**An advocate who types a citation gets about 1% success@5 out of the vector
index; a case name gets about 6%.** That is not a defect in the embeddings — a
semantic vector over `2025:PHHC:089161` should be close to meaningless. It is the
measured case for exact and structured routes, and it says those two query types
must not reach the dense index as their primary path.

Pooling the three would have printed 9.4% and read like a failing embedding
pipeline rather than a missing route.

## Halfvec, settled at the setting production actually uses

`docs/ai/new1-halfvec/VERDICT_250K.md`. Both arms at `ef_search=200` on one frozen
pair, 256,998 rows each. Paired sign test over 684 shared queries:

```
proposition     better 9   worse 4   identical 215   p = 0.267
exact_citation  better 4   worse 2   identical 222   p = 0.688
case_title      better 7   worse 9   identical 212   p = 0.804
```

No difference detected on any type; 94-97% of queries return the gold at exactly
the same rank. Index 669 MB against 2006 MB — 3.0x, the same ratio measured at
620,300 chunks. Latency p50 14ms against 41ms.

Verdict is `HALFVEC_QUALITY_PASS_AT_TEST_SCALE`, **not production-ready**: 256,998
against 8,846,550 is 34x smaller and HNSW error is a function of graph size. The
stage table stays `vector(1024)` for the whole walk — fp32 casts down, halfvec
cannot cast back up.

## Currentness safety: PASS

`docs/ai/new1-tier-a/currentness-safety.json`. No NEW1 table holds a cached
treatment or currentness column — checked against `information_schema`, so a
column added next month by someone who never read the rule still fails it. Every
NEW1 vector table carries `judgment_id` so the status can be read live at the
point of use, and the join returns it. 98 authorities currently carry a non-`none`
`overruled_status`; 4 of them are embedded so far.

Your 0862 `set_aside` rows are among them and behave correctly: retrievable, with
the status read live. Retrievability and currentness are different questions and
an advocate arguing the other side needs to find the case that was set aside.
