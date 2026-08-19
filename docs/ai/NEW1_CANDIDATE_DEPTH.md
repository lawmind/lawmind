# NEW1 — CANDIDATE DEPTH BUYS PRESENCE AND NOTHING ELSE

**Owner: NEW1.** 20 August 2026. P3.
Tool: `services/harness/src/candidate-depth-probe.mjs`.
Artifact: `docs/ai/new1-halfvec/candidate-depth.json`. 140 queries, `ef_search 40`,
production HNSW over `judgment_chunks`, run with the box otherwise free of my jobs.

---

## THE RESULT

`retrieve.ts` asks the index for `CANDIDATE_DEPTH * 4` chunks on an unfiltered
search and `* 40` on a filtered one — 200 and 2,000. Nobody had measured the curve
between them.

| annDepth | gold present in pool | success@5 | recall@20 | MRR | judgments/pool | p50 |
| --- | --- | --- | --- | --- | --- | --- |
| 200 | 64.3% | 18.6% | 37.1% | 0.105 | 114 | 512 ms |
| 500 | 72.1% | 18.6% | 37.1% | 0.106 | 277 | 598 ms |
| 1000 | 75.7% | 18.6% | 37.1% | 0.106 | 531 | 1,155 ms |
| 2000 | **80.0%** | **18.6%** | **37.1%** | 0.106 | 994 | 1,586 ms |

Marginal value of each step:

| step | presence | success@5 | recall@20 | latency |
| --- | --- | --- | --- | --- |
| 200 → 500 | **+7.86 pts** | **0.00** | **0.00** | +86 ms |
| 500 → 1000 | **+3.57 pts** | **0.00** | **0.00** | +557 ms |
| 1000 → 2000 | **+4.29 pts** | **0.00** | **0.00** | +431 ms |

**Going from 200 to 2,000 candidates — a 10x increase, 1,074 ms of added p50
latency — moves gold presence by 15.7 points and the advocate's result by exactly
zero.** Not "by a small amount". Zero, on all three of success@5, recall@20 and
(to three decimals) MRR.

---

## WHAT THAT MEANS, PRECISELY

The two things the probe deliberately separates:

- **PRESENCE** — is the gold judgment anywhere in the candidate pool? Depth fixes
  this and only this. A judgment absent from the pool cannot be recovered by any
  downstream stage, ever, so presence is a hard ceiling on everything after it.
- **RESULT** — is gold in the top 5 or top 20 after the chunk pool is collapsed to
  judgments? This is what the advocate sees, and it did not move.

**Depth is buying a reranking opportunity that nothing is currently taking.** The
extra 15.7 points of gold sit in the pool between rank 21 and rank 994 and no
stage exists to promote them. Until a reranker exists, every candidate past ~200
is latency with no return.

This also settles the earlier observation that "missed-gold presence increased
strongly when the candidate pool grew" — it did, and it was never the same claim
as quality improving. Reported as one number, the two are indistinguishable; that
is exactly why they are reported separately here.

---

## WHAT I RECOMMEND

**Do not raise `CANDIDATE_DEPTH`.** On this evidence the filtered path's
`* 40` = 2,000 is paying about a second of p50 for nothing an advocate can see.
Lowering it is a real latency win on a route NEW2 measured at p50 43 s under fleet
load — but it is LCC's call and it trades away headroom that a future reranker
would use.

**The 15.7 points are the argument FOR a reranker, and the first honest one.**
A cross-encoder over the top 200-2,000 has, on this measurement, up to 15.7 points
of recoverable gold to work with. Before this run, "deeper pools help" and "deeper
pools would help IF we reranked" were the same sentence.

---

## LIMITS

- 140 of the 283 queries, chosen as the first 140 of the frozen set (not sampled).
  The set is ordered by query id, which is a hash, so this is effectively arbitrary
  rather than a stratified sample — but it is not a random draw and does not carry
  a confidence interval.
- One `ef_search` (40). Depth and `ef_search` interact in pgvector: with
  `iterative_scan = relaxed_order` the scan widens until it can fill the LIMIT, so
  a deeper request is partly a bigger search. The halfvec probe measured what
  `ef_search = 40` costs in ANN recall (6-9% of true neighbours); sweeping the two
  together is the follow-up, not done here.
- Latency numbers are from a box carrying NEW2's ingest fleet. The DIRECTION is
  reliable — more candidates cost more — but the absolute milliseconds are not a
  production figure.
- Success@5 being identical at all four depths is a strong result, and a strong
  result should be read twice: it holds because the first ~114 judgments in the
  pool already contain whatever the top-5 will show, and the ranking function does
  not change with depth.
