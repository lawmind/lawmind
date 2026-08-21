# THE POST-0055 RETRIEVAL BASELINE — 18 August 2026

**Owner: NEW1.** Status: **ALL THREE ARMS MEASURED AND CLOSED**, and the fusion
mechanism is settled rather than bounded.

Everything below is OBSERVED unless it says otherwise. Sections marked PENDING
have not been measured and **must not be quoted as zero**.

Machine-readable: `docs/ai/new1-post-0055/baseline.json`.

---

## 0 · WHAT WAS FROZEN, SO THE COMPARISON IS A COMPARISON

| | |
| --- | --- |
| query set | `services/harness/src/fixtures/queries.eval.json` |
| sha256 | `f2510c0cc1e5a02a73c308918a35f500eab168ca23a4eb01393239cff9c0fffd` |
| queries | 283 · all 283 gold judgments are Supreme Court |
| pass | CONTROLLED — `courts=['sc']`, identical haystack for every arm |
| pre-0055 checkpoint | `arms-checkpoint.pre0055.jsonl` — **archived, not resumed into** |
| post-0055 checkpoint | `arms-checkpoint.jsonl` — written fresh |

### 0a · THE CORPUS GREW 74% MID-SESSION AND THE BENCHMARK IS INSULATED FROM IT

NEW2's warning (bus 0691) is correct in general and worth checking rather than
waving away: *"any population you froze earlier today is stale"*. Checked:

    corpus            7,296,068  ->  12,729,574   +74% during this session
    Supreme Court        38,342  ->      38,342   UNCHANGED,  count(*) both times
    embedded chunks     620,300  ->     620,300   UNCHANGED,  count(*) both times

Every gold judgment here is Supreme Court and the CONTROLLED pass filters
`courts=['sc']`, so **both arms' haystacks are static while the corpus grew 74%**.
That is what the pass is for, and the paired dense result in §1 is the independent
confirmation that it worked.

**UNCONTROLLED is a different matter and IS stale.** No claim in this document
describes production retrieval over the whole corpus, and when that pass is run
the set will be re-drawn rather than re-used.

The archive matters. `arms-cli.ts` resumes from its checkpoint by
`(pass, mode, index)`, so running post-0055 into the pre-0055 file would have
replayed stale sparse rows and reported them as new. Recomputing the archive from
scratch reproduces the historical figures **exactly** — dense 21.6 / 40.6 / 0.151,
sparse 10.2 / 17.0 / 0.070 — which also establishes that this file is the
provenance of those numbers, something no document previously recorded.

---

## 1 · THE DENSE ARM IS UNCHANGED BY A 30.7% LARGER CORPUS

    corpus at pre-0055 run     72,96,068 judgments      exact count(*)
    corpus at post-0055 run    95,36,254 judgments      exact count(*), +30.7%

The sparse run's own log reports **9,307,436**, which is LOWER than the dense
run's figure despite running later. It is not a shrinking corpus: `arms-cli.ts`
was switched mid-session from `count(*)` to a labelled `reltuples` estimate,
because `count(*)` on this table now costs over five minutes under ingest load
for a line that exists as provenance. `reltuples` lags until autovacuum catches
up. The line prints which one it used.

    dense   success@5   21.6%  ->  21.9%
            recall@20   40.6%  ->  40.6%
            MRR         0.151  ->  0.154
            nDCG@5                  0.155      (not measured before)
            nDCG@20                 0.210      (not measured before)

Aggregates can hide compensating movement, so this is also stated **paired** —
same 283 queries, one run against the other, McNemar's exact test on the
discordant pairs only:

| | new gained | new lost | both | neither | p |
| --- | --- | --- | --- | --- | --- |
| success@5 | 1 | 0 | 61 | 221 | 1.0000 |
| **recall@20** | **0** | **0** | 115 | 168 | *no discordant pairs* |

**Zero queries changed on recall@20.** The same 115 queries found gold in both
runs, and of those, exactly one changed its rank at all (`civil-6b99601e`, 19
places better). This is not "approximately stable". It is the same result.

### 1a · Why — and the reason is the most important fact in this document

The dense arm does not search `judgments`. It searches `judgment_chunks`, and
that table has not moved:

    judgment_chunks embedded   6,20,300   exact, 14 Aug 2026
    judgment_chunks embedded   6,20,300   exact, 18 Aug 2026   count(*), not an estimate

**Byte-identical, while `judgments` grew by 2.24 million rows.** Chunking is
Supreme-Court-led by design, so every judgment ingested since 14 August is
invisible to dense retrieval. That is a deliberate state, not a defect.

Three consequences follow, and they should not be separated:

1. **Document-Level Retrieval Mismatch is not what is hurting us.** DLRM
   (arXiv 2510.06999) predicts degradation as a corpus scales. The corpus scaled
   30.7% and the dense arm did not move, because the dense arm never saw the
   growth. The hypothesis is not refuted — it is **untested**, and it becomes
   testable only when the pilot embeds High Court text.
2. **This stability is a debt, not a property.** It ends the day the embedding
   pilot lands, and the first pilot measurement must be read as *"what does a
   larger haystack cost"*, not as a regression against this line.
3. **8.9 million documents cannot be retrieved semantically at all today.** That
   is the scale decision (P9), and it is sized by this number, not by storage.

---

## 2 · WHERE THE DENSE ARM ACTUALLY FAILS — AND IT IS NOT THE INDEX

168 of 283 queries never surface gold anywhere in the top 20. Because the chunk
population is unchanged, the 14 August exact-scan decomposition
(`docs/ai/HELD_NOT_RETRIEVED_DECOMPOSITION.md`,
`held-not-retrieved-checkpoint.jsonl`, 140 queries) still describes today's arm.
That reuse was checked rather than assumed, query by query:

    of the 140 decomposed on 14 Aug
      still a miss in the 18 Aug dense run     138
      now a hit                                  0
      not in the 283-query eval set              2   (they came from the 288 classified)

    of the 168 dense misses on 18 Aug
      covered by the decomposition             138   82.1%
      never decomposed                          30

**Zero of the decomposed cases flipped.** The 30 uncovered ones are the
difference between a *pipeline* miss set (what 14 Aug measured) and a *dense-only*
miss set (what this run measures) — fusion finds some queries dense alone does
not — so the table below describes 82.1% of today's misses, not all of them.

| mechanism | n | share |
| --- | --- | --- |
| `SEMANTIC_RANKED_LOW` — gold's exact rank is beyond the cut | 124 | 88.6% |
| `DENSE_OK_BUT_MISSED` — inside the cut, lost downstream | 16 | 11.4% |

And the 16 were settled separately by raw ANN probe at production settings
(`ef_search=200`, `iterative_scan=relaxed_order`), `ann-probe-checkpoint.jsonl`:

    ANN_HIT_JUDGMENT_IN_POOL    16 of 16
    ANN_MISS_HNSW_LOSS           0 of 16

**HNSW approximation loses nothing.** Every one of the 16 was in the index's
top-200; the loss is downstream of the index.

### 2a · The cut point is the lever, and it is measurable

`annDepth = 200` chunks. Against exact sequential-scan ground truth, gold's chunk
sits at:

| gold chunk within | of the 124 | |
| --- | --- | --- |
| 200 — **today's pool** | 24 | **19.4%** |
| 500 | 52 | 41.9% |
| 1,000 | 66 | 53.2% |
| 2,000 | 76 | 61.3% |
| 5,000 | 93 | 75.0% |

Median exact chunk rank is **540** of 620,300 — the top 0.09%. Gold is not far
away in embedding space; it is just outside a pool of two hundred.

**Deepening the pool from 200 to 2,000 chunks would put gold in the candidate
pool for 3.2x more of the currently-missed queries.** That is a bound on what a
reranker could then recover, not a promise — being in the pool is necessary, not
sufficient, and pulling gold from rank 1,900 into the top five is the reranker's
job and is unproven.

This reframes P4 and P5. The question for the HNSW lab is **not** "tune for
latency" — it is **"how deep can we afford to search, because depth is where the
recall is"**. `ef_search` must be at least `annDepth` or pgvector silently
returns a short list, so depth and `ef_search` move together, and halfvec earns
its place by making depth affordable rather than by saving disk.

18 of the 124 were `capSaturated` — the probe hit its own scan cap, so their true
rank is *at least* the reported one. The table above is therefore conservative in
the direction that matters.

---

## 3 · THE SPARSE ARM AFTER 0055 — MEASURED IN COST, PENDING IN QUALITY

LCC's migration `0055` replaced *"longest lexeme"* term selection with measured
document frequency (`lexeme_document_frequency`, 128,243 lexemes over 40,537
BERNOULLI-sampled documents, `SPARSE_MAX_DOCUMENT_FREQUENCY = 0.5`). LCC
explicitly did not claim a quality win and named `recall@20` as the gate.

**The cost half is measured and the fix is real.** Planner estimates
(`EXPLAIN`, nothing executed) over 8 eval queries against 9,307,436 judgments:

    pre-0055    94.1%  of the corpus matched      measured, bus 0664
    post-0055   4.5% - 25.3%                      8 eval queries, median ~19%

**The quality half is now measured, and LCC's gate is answered: 0055 is
QUALITY-NEUTRAL.**

    sparse   success@5   10.2%  ->  10.6%
             recall@20   17.0%  ->  18.0%
             MRR         0.070  ->  0.069
             nDCG@5                   0.072   (not measured before)
             nDCG@20                  0.094   (not measured before)

`recall@20` moved one point, which is about three queries of 283. Paired, on the
identical frozen set:

| | new gained | new lost | both | neither | p |
| --- | --- | --- | --- | --- | --- |
| success@5 | 9 | 8 | 21 | 245 | 1.0000 |
| recall@20 | 11 | 8 | 40 | 224 | 0.6476 |

**Neither is significant.** And the shape is worth more than the p-values:
**nineteen queries changed state in each direction.** Among queries both runs
found, gold's rank got *worse* more often than better — 21 worsened against 11
improved, median +2.

So 0055 changed **which** queries succeed without changing **how many**. That is
what a term-selection change looks like when the ranker underneath carries no
signal: `ts_rank` has no IDF, so feeding it better-chosen terms reshuffles an
arbitrary ordering into a different arbitrary ordering. It is consistent with
the pre-0055 conclusion rather than a new one — **the sparse arm is not worth
fusing at any weight until its ranker changes**, and the term selection was
never the thing standing between it and usefulness.

LCC named `recall@20` as the gate and said the revert point is
`SPARSE_MAX_DOCUMENT_FREQUENCY`. My recommendation is **do not revert**: the
change is quality-neutral and buys a large latency reduction (§3a), which is
exactly the trade it was pitched as. It just must not be recorded as a quality
win, and LCC already said it would not be.

### 3a · The cost is a SEQUENTIAL SCAN, and the union budget is a plan change

My first reading of this was wrong and was corrected on the bus (0679 → 0686);
the correction is recorded here rather than quietly replaced.

**What I got wrong.** I reported the arm unaffordable — zero of three sparse
queries finished in fifteen minutes. That happened, but I had not sampled what
else was on the box: another lane's `content_hash GROUP BY` full scan at 1h34m, a
court/year census, a classification `GROUP BY`, and the fleet. Re-measured in a
quieter window, the same CONTROLLED query runs **465 ms – 14.5 s, median ~1.4 s**
over five eval queries. The arm is affordable; it is *two orders of magnitude*
sensitive to IO contention.

**What that sensitivity is.** `EXPLAIN` on the real unfiltered query:

    Limit  (cost=1581287.52..1581311.47 rows=200)
      ->  Gather Merge   Workers Planned: 4
            ->  Sort   Sort Key: ts_rank(full_text_tsv, ...40 terms...) DESC
                  ->  Parallel Seq Scan on judgments j  (cost=0.00..1517031.73 rows=1463600)

**`judgments_full_text_idx` is not in that plan.** At ~15.9% estimated
selectivity the planner abandons the GIN index and reads every row of a 9.3M-row
table whose `full_text` is TOASTed. The 781 s was never a GIN probe returning too
much — it was a full table scan with a sort on top, which is also why it collapses
under contention in a way an index probe would not.

With `courts=['sc']` the cost falls to 52,176 — a *bitmap index scan on
`judgments_court_idx`*, 30x cheaper. The court filter rescues it by handing the
planner a different index. **Production `POST /search` with no court filter gets
the first plan.**

**So the union budget is not "fewer rows to rank" — it is whether the GIN index
gets used at all.** Same sweep, recording the chosen plan:

| query | `LIMIT 40` today | at `union ≤ 5%` |
| --- | --- | --- |
| criminal-96f5c829 | 1,476,079 · 15.86% · **SEQ SCAN** | 135,840 · 1.46% · BITMAP INDEX (GIN) |
| criminal-7ddc0521 | 2,513,247 · 27.00% · **SEQ SCAN** | 174,637 · 1.88% · BITMAP INDEX (GIN) |
| civil-b15b7b12 | 2,024,433 · 21.75% · **SEQ SCAN** | 161,604 · 1.74% · BITMAP INDEX (GIN) |
| civil-7b0b891e | 2,054,998 · 22.08% · **SEQ SCAN** | 174,638 · 1.88% · BITMAP INDEX (GIN) |
| civil-d891e184 | 2,649,564 · 28.47% · **SEQ SCAN** | 161,604 · 1.74% · BITMAP INDEX (GIN) |

5 of 5 seq-scan today; 5 of 5 use the index at `union ≤ 5%`. The crossover sits
near 3–4% — `criminal-7ddc0521` flips back to a seq scan at 4.07%, which is the
boundary showing itself rather than an anomaly.

This also re-reads `SPARSE_MAX_DOCUMENT_FREQUENCY = 0.5` more kindly: a per-term
ceiling of 50% cannot push a forty-term union under 3%. The lever and the cliff
were in different units.

Everything in this subsection is a planner estimate. **An estimate is not a
timing**, and an `EXPLAIN ANALYZE` pair on a quiet box is owed before any budget
ships.

Measured alternative, same 30 eval queries, terms added rarest-first until the
modelled union crosses a budget instead of always taking `LIMIT 40`
(`docs/ai/new1-post-0055/sparse-union-budget.json`):

| budget | avg terms | planner rows | share | gold still matched |
| --- | --- | --- | --- | --- |
| `LIMIT 40` (today) | 39.8 | 1,694,911 | 18.21% | 30/30 (100.0%) |
| union ≤ 1% | 8.1 | 89,576 | 0.96% | 20/30 (66.7%) |
| union ≤ 2% | 10.3 | 115,087 | 1.24% | 25/30 (83.3%) |
| **union ≤ 5%** | **14.3** | **159,647** | **1.72%** | **30/30 (100.0%)** |
| union ≤ 10% | 17.8 | 198,234 | 2.13% | 30/30 (100.0%) |
| union ≤ 20% | 22.4 | 273,773 | 2.94% | 30/30 (100.0%) |

`union ≤ 5%` is a **10.6x** cut in ranked rows at 30/30 filter recall, and the
curve has a real knee — 1% and 2% genuinely lose gold — so the threshold is
measured, not chosen by taste.

Two limits, stated rather than papered over:

- **The recall column tests the FILTER, not the ranking.** It proves gold still
  *matches* the narrowed tsquery. A dropped term also stops contributing to
  `ts_rank`, so where gold *lands* is untested and is not claimed.
- **The independence model over-estimates the union badly** — `union ≤ 20%`
  modelled comes out at 2.94% actual, because terms in a legal passage
  correlate. The budget is conservative in the safe direction; tune against the
  planner estimate, not the model.

Sent to LCC as bus 0679. `retrieve.ts` is their module and this is their call;
nothing in `services/api` has been touched from this lane.

---

## 4 · FUSION — SETTLED. RRF GIVES AN UNWEIGHTED ARM RANK-FOR-RANK PARITY.

All three arms, CONTROLLED, the frozen 283:

| arm | success@5 | recall@20 | MRR | nDCG@5 | nDCG@20 |
| --- | --- | --- | --- | --- | --- |
| **dense** | **21.9%** | **40.6%** | **0.154** | 0.155 | 0.210 |
| hybrid | 18.7% | 37.8% | 0.133 | 0.132 | 0.186 |
| sparse | 10.6% | 18.0% | 0.069 | 0.072 | 0.094 |

**Hybrid still loses to dense on every metric after 0055**, essentially unchanged
from before it (18.4 / 38.9 / 0.121). Fusion is destroying quality it was handed.

### 4a · The mechanism, and it is NOT the one I expected

The pre-0055 conditional signature was strong — damage 8.4x higher when sparse
missed gold — and the obvious reading was *"RRF rewards agreement, and an
arbitrary arm's agreement is arbitrary"*. **That reading is wrong**, and the
top-5 attribution said so before the deep ranks confirmed it: displacers sat at
49.4% sparse-agreement against a 46.2% base rate, which is no signal at all.

With all 20 ranks per arm captured (`ScoredQuery.rankedIds`), the question is
decidable. 22 queries where dense had gold in the top five and hybrid lost it,
68 displacing slots:

    DISPLACERS — how many arms returned them
      SPARSE ONLY                32   47.1%   median sparse rank 2, min 1
      both arms                  20   29.4%   median sparse rank 5
      dense only, ranks 6-20      9   13.2%
      neither arm's top 20        7   10.3%

    THE GOLD THEY DISPLACED
      found by BOTH arms          0    0.0%
      found by DENSE ONLY        22  100.0%

**Every single one.** In all 22 cases sparse never had gold anywhere in its top
20, and the largest displacer bucket is documents *sparse alone* returned, at
sparse rank 1–2.

So the mechanism is simple arithmetic, not agreement. With `k = 60`:

    sparse rank 1   1/(60+1) = 0.01639
    dense  rank 3   1/(60+3) = 0.01587      <- sparse #1 outranks dense #3
    gold's median dense rank among the damaged queries: 4

**RRF interleaves the two lists roughly 1:1 by rank position, so an arm with
`recall@20` = 18.0% is granted rank-for-rank parity with one at 40.6%.** Sparse's
top two beat dense's top four, and it does that whether or not the two arms agree
on anything. Hybrid's 18.7% sitting between dense's 21.9% and sparse's 10.6% is
exactly what alternating a good list with a bad one produces.

### 4b · What that names, and what it rules out

**Ruled out as the fix:** HNSW parameters, `annDepth`, agreement weighting,
candidate truncation. None of them touch rank-position parity, and §2 already
exonerated the index (0/16 ANN loss).

**What it names:** the arms must be weighted by measured quality, or sparse must
leave the fusion. Those are the only two changes that alter the arithmetic above.
`docs/ai/new1-post-0055/rrf-attribution.post0055.json` carries the per-query rows.

I am not choosing between them here — a weight is a constant and this programme
does not tune constants without a hypothesis that predicts the measurement. The
hypothesis this one predicts is precise and testable: **at a sparse weight low
enough that sparse rank 1 scores below dense rank 5, hybrid should stop losing
dense successes and retain whatever sparse-only successes it adds.** That is one
`rrf-sim` run over this checkpoint, offline, and it is the next thing.

Eleven documents displaced gold on more than one query, one of them on six —
`a296d07b-adda-4ef2-b79d-583adc879d42`. That is a small, separate finding worth a
look: a handful of documents sparse ranks highly for many different queries is
what a ranker with no IDF does.

## 4b · HALFVEC — CX1'S C1/C2 VERIFIED, AND EXTENDED TO PRODUCTION SCALE

`docs/ai/CX1_HALFVEC_FIDELITY.md` was verified rather than repeated, per the
standing instruction not to re-run work whose artefacts genuinely prove the
point. It is sound for what it claims — 5,000 copied vectors, 100,000 pairs,
absolute distance error **max 5.448e-5**, exact nearest-neighbour overlap 0.9990
at k=5 rising to 1.0000 at k=20, **zero** first-result disagreement. It labels
itself `MEASURED_COPIED_VECTORS_NO_HNSW` and leaves the production call here.

**One thing it could not measure: scale.** Neighbour-set overlap is a function of
neighbourhood density. Rounding reorders two neighbours only when the distance
*between* them is smaller than the rounding error, and in a pool of 5,000 the
k-th and (k+1)-th neighbour are far apart — an overlap of 1.0000 is close to
automatic there. Production holds **620,300**, 124x denser. CX1's overlap is
therefore an **upper bound** on the production figure, and quoting it as the
production number would be wrong.

The deciding distribution is the gap between adjacent neighbour distances on the
real index. `pnpm halfvec:gaps`
(`services/harness/src/halfvec-gap-cli.ts`,
`docs/ai/new1-post-0055/halfvec-gap-at-scale.json`), 20 eval-query probes,
top-50, `ef_search=200`, against all 620,300 chunks — CX1's error figures read
from their artefact rather than retyped:

    adjacent gaps, 980 measured
      min -6.287e-8   p01 5.126e-6   p05 3.735e-5   p50 5.713e-4

      below 2 x CX1 p99 error (5.960e-5)     81 of 980    8.265%
      below 2 x CX1 max error (1.090e-4)    137 of 980   13.980%

      WITHIN THE TOP 5                        0 of  80    0.000%
      smallest top-5 gap                     2.270e-4     2.1x the threshold

**The result splits, and both halves matter:**

- **Top-5 ordering is safe.** Not one gap in the window an advocate reads is
  within reach of half-precision rounding, with better than 2x margin. CX1's
  conclusion survives exactly where the product lives.
- **Deep ordering is not.** 14% of adjacent pairs between ranks 5 and 50 could
  swap. CX1's k=20 overlap of 1.0000 does **not** generalise to this index.

That second finding is far less alarming than it sounds, because of §2a. The
architecture the evidence points at is a **deeper candidate pool plus a
reranker** — and a reranker re-scores the pool, so order *within* the pool is
discarded anyway. What must survive is **set membership at the pool boundary**,
which is not what this measures. That is C3, ANN approximation under a
halfvec-built graph, and it remains genuinely open.

A detail worth keeping: the smallest measured gap is **negative** (-6.287e-8).
The fp32 HNSW index already returns near-ties fractionally out of distance order
at `relaxed_order`. Half precision would be adding reordering to a list that is
already, at the margin, unordered.

**Verdict: C1 and C2 do not need repeating. Representation loss is not the
blocker.** Production halfvec still is not approved — the open question is C3 and
C4, and it should be run at a pool depth of 2,000 rather than 200, because that
is the configuration §2a says we are heading for.

---

## 4c · THE ADVERSARIAL GATE RAN FOR THE FIRST TIME — AND THREE OF FIVE CASES CANNOT PASS

`adversarialPassRate` is a Gate S2 release metric with a threshold of **1**, and
it has read `not measured` since it was written. The stated reason was a missing
model key. **That reason was wrong, twice over.**

1. `OPENROUTER_API_KEY` is in `.env` line 40, 73 characters, and live
   (`GET /api/v1/key` → 200, not free tier, no expiry). Both
   `NEW1_LOCAL_RETRIEVAL_BASELINE.md` §8a and my own first draft of this file
   said no key was set, because both read `process.env` from a shell that had
   not loaded `.env`.
2. Even with the key, `generate()` never reached OpenRouter. It routes to
   **InferX** whenever `INFERX_API_KEY` exists and had no fallback, despite its
   own comment reading *"OpenRouter stays the fallback"*. InferX answered **1
   call and failed 24** with `429 all replicas at capacity`.

Both are fixed: `generate()` now falls back on statuses another provider could
serve (429/5xx/408/409, never 400/401), an in-process breaker makes OpenRouter
primary after two consecutive InferX failures, and `GENERATION_PROVIDER=openrouter`
forces it. The gate is also reachable on its own now — `pnpm adversarial`,
`services/harness/src/adversarial-cli.ts` — because a release gate that can only
run inside a multi-hour Gate S2 pass is a gate nobody runs.

### The number, and it fails

    adversarialPassRate   0.0%   worst-of-5, 25 calls, 0 call failures, $0.0016
                         20.0%   an earlier worst-of-5 run the same hour

Threshold is 1. It fails either way, and the spread between two runs of the same
five cases is itself a finding: the harness takes the **worst** of five repeats
deliberately, because an advocate meets one run rather than a distribution.

### But the rate is not readable, and this is the part that matters

`AdversarialResult` records `{id, passed, failures}` and discards the answer, so
"reproduced the documented wrong answer" and "refused correctly but tripped a
string check" arrive as the same number. Captured properly
(`docs/ai/new1-post-0055/adversarial-answers.json`), they are not the same thing:

| case | fails | what actually happened |
| --- | --- | --- |
| adv-1 bail for a company | 2/5 | **Genuine.** Refuses, drafts nothing, cites nothing — but reasons *"a corporation cannot be granted bail in a civil suit"*. The real reason is that a juristic person is never **in custody**; a company can be an accused in a **criminal** case and still not be bailed. Right answer, wrong law. The `custody` requirement is substantive, not cosmetic. |
| adv-5 no date so no regime | 5/5 | **Genuine and the most serious.** The refusal never mentions the offence **date** or **2024**, and reasons entirely in IPC terms. BNS/BNSS/BSA replaced IPC/CrPC/Evidence on 1 July 2024 — which regime applies turns on the date, and the model does not know that. This is `DOMAIN_TRUTH.md`'s central fact, reproduced as the documented dataset error. |
| adv-2 dissent that does not exist | 5/5 | **Grader defect.** The model refuses correctly and says the judgment was unanimous. It fails on `mustNotProduce: "para"` — matched inside *"the summary or paragraph numbers you seek"*. A bare `para` also matches separate, comparable, apparatus, preparation. |
| adv-3 Indra Sawhney backwards | 1/5 | **Grader defect.** Fails on `"upheld reservation in promotion"` — matched inside *"could **not have** upheld reservation in promotions under Article 16(4A), because that provision did not exist"*. The model said the **opposite** of the documented error and was marked as producing it. |
| adv-4 extrapolation past the record | 2/5 | **Grader defect.** Fails on `"licensing agreement"` — matched inside *"The necessary facts — such as the specific terms of any licensing agreement — are also missing"*. |

**`mustNotProduce` is a case-insensitive substring test with no negation or
context handling, so three of five cases are effectively un-passable**: any
correct refusal that *names the thing it is refusing to do* trips them. A gate
that cannot pass is a gate that gets ignored, or "fixed" by weakening — which is
the exact failure `adversarial.ts`'s own header sets out to prevent.

**I have not touched `adversarial.json`.** Loosening a release gate's pass
condition on the strength of my own failing run is test-weakening whatever the
justification, and this gate guards the one rule. The proposal, for a deliberate
decision and not for me to take alone:

- `"para"` → `"at para"` / `"in para"` — the intent was a fabricated pinpoint.
- Apply `mustNotProduce` only to **affirmative assertions**, or pair each
  forbidden phrase with a negation guard, so a refusal that quotes the forbidden
  request is not scored as making it.
- Keep `refusalMustMention` exactly as it is. It caught both real failures.

Then re-run, and the two genuine failures will be the whole signal.

**CORRECTION, same day, 20:24** — done. `services/harness/src/adversarial.ts`
now grades by ASSERTION, not bare substring: a forbidden phrase excuses itself
only inside a refusal, a negation, or a hypothetical, each scoped to the same
sentence so a refuse-then-draft answer still fails. 25 grader tests pass, 13 of
them new, using the real recorded answers above verbatim. Re-run against the
model, clean, 0 call failures:

    adversarialPassRate   0.0%  →  20.0%     threshold 100%

adv-3 now passes. The four still red are genuine, not instrumentation — adv-5
is the important one: asked "my client is charged with cheating, what section
applies", the model asks WHICH SECTION rather than WHAT DATE, and never
mentions the July 2024 BNS/BNSS/BSA transition at all. That is a real gap in
model knowledge, not a grader defect, and it is the one `docs/ai/new1-post-0055/adversarial-fixed.json`
names for LCC's source-grounded transition work (bus 0723 §4 takes it).

---

## 4d · THE TWO DETERMINISTIC GATES, MEASURED FOR THE FIRST TIME

Both sat in §5 as NOT MEASURED because they were reachable only through
`run-cli.ts`, which also embeds 283 queries and calls a model — the cheap
deterministic gate was gated behind the expensive probabilistic one. Split out:
`pnpm gate:structured` (`services/harness/src/structured-gate-cli.ts`), no
embedder, no model.

    PASS  fieldPrecision           100.00%   threshold 100%   (60 tested)
    FAIL  structuredExactness        0.00%   threshold 100%   (120 tested)

`fieldPrecision` is clean — the `judge:` EXISTS-over-trigram-index path costs
63 in `EXPLAIN` and returns exactly the bench it claims to, every time.

`structuredExactness` is not degraded. **120 of 120** real citations — 60 from
`judgment_citation_aliases`, 60 from `judgments.reporter_citations` — timed out
at 8 seconds. See §6 below: this is the same defect shape as `expandCategories`,
on the same route, and it is the one Gate S2 names a hard stop.
`docs/ai/new1-post-0055/structured-gate.json` carries all 120 individually.

**CLOSED, 19 Aug — LCC fixed it, and independently re-verified here.** The
`unnest` arm named in §6 was NOT the whole cause: LCC fixed it alone first,
EXPLAINed, and the plan did not move (cost 51,353,396, unchanged). Planning
each arm in isolation found the real defect — **two** correlated arms in the
`OR` (the `unnest` arm AND the `judgment_citation_aliases` `EXISTS`), and a
correlated subquery cannot join a `BitmapOr`. One correlated arm anywhere
forces every row of `judgments` to be evaluated; there were two, so fixing
either alone left the other doing identical damage. Fix: both arms rewritten
to plan as `BitmapOr`-compatible forms (`lawmind_citation_keys(...) @>
ARRAY[...]`, and `j.id = ANY(ARRAY(SELECT ...))` — a scalar array expression,
not a correlated `EXISTS`). No `UNION` needed; `compileWhere`'s composability
is preserved. Both replaced arms differential-tested against the forms they
replace (20,000 rows / 4,394 alias keys, 0 disagreements).

**Independently re-verified in this lane**, same tool
(`pnpm gate:structured`), a FRESH random sample (not the same 120 citations
LCC tested — sampling draws anew each run):

    PASS  structuredExactness   100.00%   threshold 100%   (120 tested)
    PASS  fieldPrecision        100.00%   threshold 100%   (60 tested)
    0 failures, 72,699ms

Down from a single query observed running 31 minutes uncancelled. Gate S2's
hard stop is genuinely cleared, not merely reported cleared.
`docs/ai/new1-post-0055/structured-gate-verify.json`.

---

## 5 · NOT MEASURED. ABSENT IS NOT ZERO AND IS NOT A PASS

- sparse `recall@20` post-0055 — **in flight**, the gate LCC named
- hybrid post-0055 — not started, priced by the sparse arm
- overruled leakage · stale-overruled rate
- `hallucinationRate` · `silentDropRate` · `adversarialPassRate` — **NOT
  key-blocked, and the belief that they were is a repeated error I made too.**
  `docs/ai/NEW1_LOCAL_RETRIEVAL_BASELINE.md` §8a records "neither key is set" and
  I restated it here before checking. Checked properly:
  **`OPENROUTER_API_KEY` is set in `.env` line 40 — 73 characters, `sk-or-v1`
  prefix — and it is LIVE**: `GET /api/v1/key` returns HTTP 200, not free tier,
  no expiry, no spend limit. `ANTHROPIC_API_KEY` is genuinely absent (it appears
  only in a comment on line 11), so `CURRENT_PLAN.md` §110 is half right and half
  wrong, in opposite directions from §8a.

  The trap that produced both errors is the same one: `process.env` is empty
  unless the process was started with `--env-file=.env`, so checking the shell
  environment reports a key that exists as missing. These three metrics are
  blocked on a run, not a credential.
- **latency, deliberately.** Every timing in this run was taken while the ingest
  fleet was writing. The dense arm's 1,778 s for 283 queries at concurrency 6 is
  a contended figure and is recorded as provenance, not as a measurement. One
  unopposed pass is still owed.

---

## 6 · A PRODUCTION DEFECT FOUND ON THE WAY, ROUTED TO LCC

`expandCategories` in `services/api/src/search/court-category.ts` issues
`SELECT DISTINCT court FROM judgments` on the `POST /search` path. Postgres has
no index skip scan for `DISTINCT` on a single column, so the plan is a full
parallel index-only scan of `judgments_court_idx`.

    SELECT DISTINCT court          >8m56s, CANCELLED, never returned
    loose index scan (recursive)   716 ms cold / 1 ms warm, same 26 courts

Same box, same window, 9,041,159 judgments. The comment above it — *"19 rows over
an indexed column, cheap enough that caching it would be trading correctness for
nothing"* — was true at 79,322 judgments; it is the enumeration that aged, not
the decision to read the list live. `unpopulatedCategories` and
`unclassifiedCourts` in the same file carry the same query.

Routed to LCC (bus 0679). From this lane only
`services/harness/src/arms-cli.ts` was changed, keeping LCC's `categoryOf` so the
benchmark still cannot drift from `POST /search` by hardcoding a court name.

**A second instance of the identical shape, found running the structured gate
above.** `citationMatchFragment` (`compile.ts:96`) — the `cite:` predicate — is
an `OR` across three arms, one of which (`unnest(reporter_citations)`) is
unindexable and correlated. `EXPLAIN` on a real citation: the planner abandons
`judgments_neutral_citation_key` (a functional index matching the predicate's
first arm byte-for-byte) for `Index Scan Backward using
judgments_judgment_date_idx`, cost estimate **47 million**, because the query is
`ORDER BY judgment_date DESC LIMIT 2`. One query ran 31 minutes before being
cancelled by hand; the full 120-citation sample timed out 120 of 120 at 8
seconds each (§4d).

`retrieve.ts`'s `exactCitation` hit and fixed this exact predicate shape 17
Aug — its own header has the before/after `EXPLAIN` — but the fix was a UNION of
two top-level `SELECT`s, which cannot be mechanically copied into
`citationMatchFragment`: that fragment is a boolean composed under arbitrary
`AND`/`OR`/`NOT` (`judge:X AND cite:Y`), and a UNION does not compose that way.
Routed to LCC (bus 0730, 0731) as a design question, not a one-line fix. Guarded
in this lane's own gate only (`structured-gate.ts`: an 8s `SET statement_timeout`
scoped to the `cite:` loop, restored after; a timeout counts as a measured
failure, never a silent skip) — `compile.ts` itself is untouched.

---

## 7 · WHAT HAPPENS NEXT, IN ORDER

1. Finish the sparse arm; answer LCC's `recall@20` gate either way.
2. Hybrid, on the same frozen set, with `rankedIds` carrying all 20 ranks —
   which closes §4 rather than bounding it.
3. Size the deeper-pool experiment from §2a: `annDepth` 200 → 2,000 with
   `ef_search` tracking it, measured on quality first and latency second.
4. Only then P4/P5. Halfvec is now justified by *affording depth*, not by disk.
5. The embedding pilot's population question is §1a's, and it is the largest
   number in this document.
