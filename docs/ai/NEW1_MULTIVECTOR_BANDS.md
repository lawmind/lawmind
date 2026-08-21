# NEW1 — multi-vector rescoring: no band shows a detectable benefit, and short documents get worse

20-21 Aug 2026. `docs/ai/new1-tier-a/multivector-bands.json`,
`services/harness/src/multivector-bands.mjs`. This is P4, and the answer is
**do not scale it**.

## The design, and what it can and cannot see

Each of the 228 `proposition` queries takes its top-50 pool from the existing
one-vector `HEAD:4800` index, and the pool is then rescored by MAX cosine over
five evenly spaced 4,800-character windows of each candidate's text. 8,815
distinct documents were re-embedded for this — median 3 windows per gold.

The windows are **positional, not legal**: HEAD / EARLY / MIDDLE / LATE / TAIL.
The hand-designed legal layers (`TAIL`, `ISSUE`) were measured at zero
contribution once already, and a positional split has the property that it cannot
be wrong about a document's structure because it makes no claim about it.

**It is a rescoring experiment.** Gold that never reaches the pool cannot be
rescued, and this does not claim otherwise. That limitation turns out to dominate
everything else: **133 of 228 queries have their gold nowhere in the top 50**, so
only 74 queries are even eligible to move.

## The result

```
band         in pool   success@5             MRR              better  worse  tied   sign p
ALL             74     21.49% -> 24.56%   0.1749 -> 0.1984      14     18    196    0.597
short           40     56.00% -> 60.00%   0.4629 -> 0.4776       3      9     38    0.146
medium          13     52.63% -> 57.89%   0.3938 -> 0.4838       5      2     12    0.453
long            15     36.84% -> 52.63%   0.3341 -> 0.4437       5      5      9    1.000
very_long        6     57.14% -> 71.43%   0.4147 -> 0.5324       1      2      4    1.000
```

Bands are by gold document length: short <8,000 chars, medium 8,000-16,000, long
16,000-40,000, very long ≥40,000.

**Nothing is significant.** `long` gaining 15.8 points of success@5 rests on 15
in-pool queries and a pairwise record of 5 better, 5 worse. `very_long` gaining
14.3 points rests on **six** queries, of which one improved and two got worse. The
rate moved because the few improvements were large, not because the ranking got
better more often than it got worse.

## The one thing the numbers do say, and it points the other way

**Overall, MORE queries got worse than better — 14 against 18 — while success@5
and MRR both rose.** That combination has a specific meaning: multi-vector
rescoring makes the ranking **more variable**, not uniformly better. It rescues a
handful of documents dramatically and demotes rather more of them slightly.

`short` is the clearest instance and it is the one the theory predicts: 3 better
against 9 worse (p = 0.146, so still not significant, but the only band whose
direction is consistent). A document under 8,000 characters is mostly inside its
own HEAD window already, so the extra windows are near-duplicates and the MAX over
them can only add noise. Giving a short document five vectors buys nothing and
costs a little.

## Verdict

**Do not scale multi-vector, on any band, on this evidence.** The directive asked
for the bands that measurably benefit; at these sample sizes there are none. What
would change the answer:

1. **A pool the gold actually reaches.** 133 of 228 golds are outside the top 50,
   so the experiment is running on a third of its intended sample. Rerunning at
   pool 200 would roughly double the eligible set — but candidate depth has now
   been measured three times as buying presence and not position, so the honest
   expectation is more queries and the same conclusion.
2. **A per-band sample in the hundreds.** `very_long` had six.
3. **Retrieval rather than rescoring.** If multi-vector helps, the place it should
   help most is getting a long document INTO the pool, which is exactly what this
   design cannot test. That needs a second index, which is days of GPU the Tier-A
   walk needs first.

The cost side is worth stating even though the quality side did not clear: median
3 windows per document means a multi-vector index of this shape is roughly **3x
the vectors and 3x the index bytes** for a change that is not detectable at
n = 74.
