# SEMANTIC REPRESENTATION DECISION V3

**Date:** 24 Aug 2026 · **Lane:** NEW1 · **Deliverable:** §7 NEW1-1
**Artefact:** `docs/ai/new1-tier-a/representation-lab-v3.json`
**Instrument:** `services/harness/src/representation-lab-v3-cli.ts` ·
`pnpm --filter @lawmind/harness rep:lab3`
**Run:** 19,932 documents · 67,618 chunks · 147,467,434 characters embedded ·
5,376 s · walk deliberately paused

---

## Outcome, first sentence

**Passage-level representation wins on advocate-posed questions and the previous
round's answer was wrong** — `POOLED_ALL` is not the free win V2 reported, its
73.3% was produced against a pool containing none of the documents the production
arm actually returns, and once real hard negatives are present the ordering
reverses: `F_ALL_CHUNKS` 37.8% > `D_MULTI_3` 28.9% > `B_POOLED_ALL` 17.8% >
`A_HEAD_4800` **2.2%**.

---

## 1. Two corrections before any number

### 1.1 The brief's premise is wrong, and this matters more than the re-run

> "The previous POOLED_ALL result … used lifted/verbatim target sentences."

It did not. `representation-lab-v2-cli.ts` embeds `task.query` from
`ADVOCATE100.json`, whose concept queries are **authored from the legal
question** under a leakage guard that fails above six shared words. Measured over
the 45 concept tasks the lab scored:

| longest shared word run | 1 | 2 | 3 | 4 | 5 | exempt |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tasks | 1 | 5 | 18 | 13 | 5 | 3 |

**Maximum 5, zero failures.** The three exempt are `pasted_passage`, whose query
is deliberately the opponent's verbatim text.

The lifted sets are different files that say so themselves —
`new3-uncited-authority-gold-v2.json`, `new3-noncitation-gold.json`,
`new3-semantic-expansion-gold-v2.json`. They are what `buildLaunchGold()`
consolidates, and therefore what `LONG_FACT_SEARCH_CONTRACT_V1` rests on. That is
where the brief's concern genuinely lands, and `LONG_FACT_VALIDATION_V2.md`
addresses it.

### 1.2 V2 drew ZERO hard negatives, and that is why its numbers were wrong

V2's central methodological claim was that its distractors were arm A's own
nearest neighbours — "every negative is a document the production representation
already ranks above the gold … the CONSERVATIVE direction".

**It never happened.** V2 issued

```sql
SET LOCAL hnsw.ef_search = 200;
SELECT judgment_id FROM new1_probe_half_250k ORDER BY embedding <=> $1 LIMIT $2
```

as **one tagged template with bound parameters**. postgres.js sends a
parameterised query as a prepared statement, and PostgreSQL refuses multiple
commands in one. Every call threw `cannot insert multiple commands into a
prepared statement`, every throw was swallowed by a `catch` that printed one skip
line to a console nobody kept, and the pool fell back to the random `TABLESAMPLE`
fill alone.

Reproduced deliberately, 24 Aug: the V2 form fails, the transaction form returns
rows. V2 is the **only** site in the repository using that shape — every other
`SET LOCAL hnsw` call already uses `sql.begin` + `tx.unsafe`.

V3 draws them: **45 of 45 draws succeeded, 2,244 distinct hard negatives.**

---

## 2. What V3 changed, and what it held

| | V2 | V3 |
| --- | --- | --- |
| queries | ADVOCATE-100 posed (unchanged) | same, **plus** 250 explicitly lifted tasks scored separately |
| arm A | re-embedded HEAD:4800 | **read from `new1_doc_vector_stage`** — the vector LawMind would serve |
| hard negatives | 0 (silently) | 2,244, from arm A's own ANN neighbours |
| random fill | `new1_probe_half_250k` (250k subset) | `new1_doc_vector_stage` (1,097,864 staged) |
| pool | 2,500 | **nested 2,500 → 7,500 → 19,932**, each a prefix of the next |
| CI | none | bootstrap over tasks, plus the **paired** B−A difference |
| NOT_IN_INDEX | invisible by construction | measured **before** the pool force-includes gold |

**Arm A's stored vectors are faithful — the collapse is the pool, not drift.**
25 staged documents re-embedded at HEAD:4800 and compared to the stored vector:
cosine **min 0.999336, median 1.000000**, every stored vector unit-norm, 1024-d.
So arm A falling from V2's 20.0% to V3's 2.2% at the same 2,500 pool is
attributable to pool composition alone.

---

## 3. The result

### 3.1 s@5 by arm, provenance and pool size (bootstrap 95% CI)

**POSED** — n = 45, 20 distinct targets

| arm | 2,500 | 7,500 | 19,932 |
| --- | --- | --- | --- |
| A_HEAD_4800 (production) | 2.2% [0.0, 6.7] | 2.2% [0.0, 6.7] | **2.2%** [0.0, 6.7] |
| B_POOLED_ALL | 24.4% [13.3, 37.8] | 24.4% [13.3, 37.8] | 17.8% [6.7, 28.9] |
| C_POOLED_SALIENT | 20.0% [8.9, 33.3] | 20.0% [8.9, 33.3] | 15.6% [6.7, 26.7] |
| D_MULTI_3 | 31.1% [17.8, 44.4] | 31.1% [17.8, 44.4] | 28.9% [15.6, 42.2] |
| **F_ALL_CHUNKS** | 46.7% [33.3, 60.0] | 44.4% [28.9, 60.0] | **37.8%** [24.4, 53.3] |

**LIFTED** — n = 250, 193 distinct targets (tight CIs; an **upper bound**, never
advocate performance)

| arm | 2,500 | 7,500 | 19,932 |
| --- | --- | --- | --- |
| A_HEAD_4800 | 32.0% [26.4, 38.0] | 26.4% [21.2, 31.6] | 23.2% [18.0, 28.4] |
| B_POOLED_ALL | 54.0% [47.6, 60.0] | 46.4% [40.4, 52.8] | 40.4% [34.4, 46.4] |
| C_POOLED_SALIENT | 52.8% [46.8, 58.8] | 44.4% [38.4, 50.8] | 39.2% [33.2, 45.2] |
| D_MULTI_3 | 58.8% [52.4, 64.8] | 53.6% [47.6, 60.0] | 48.4% [42.4, 54.4] |
| **F_ALL_CHUNKS** | 62.4% [56.8, 68.4] | 58.8% [52.8, 64.8] | **53.2%** [47.2, 59.6] |

### 3.2 Full metrics at the 19,932 pool

**POSED**

| arm | s@1 | s@5 | r@20 | r@100 | **r@500** | MRR | nDCG@20 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A_HEAD_4800 | 2.2 | 2.2 | 6.7 | 20.0 | **35.6** | 0.031 | 0.035 |
| B_POOLED_ALL | 2.2 | 17.8 | 48.9 | 75.6 | **95.6** | 0.123 | 0.197 |
| C_POOLED_SALIENT | 2.2 | 15.6 | 31.1 | 62.2 | 84.4 | 0.099 | 0.140 |
| D_MULTI_3 | 13.3 | 28.9 | 40.0 | 66.7 | 80.0 | 0.210 | 0.248 |
| F_ALL_CHUNKS | **20.0** | **37.8** | **57.8** | **77.8** | 91.1 | **0.309** | **0.364** |

### 3.3 The failure split the brief asked for, POSED at 19,932

| arm | NOT_IN_INDEX | INDEXED_NOT_IN_CANDIDATES | CANDIDATE_BADLY_RANKED | GOLD/IDENTITY | succeeded@5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| A_HEAD_4800 | 17 | **18** | 9 | 0 | 1 |
| B_POOLED_ALL | 14 | **2** | **21** | 0 | 8 |
| C_POOLED_SALIENT | 15 | 6 | 17 | 0 | 7 |
| D_MULTI_3 | 11 | 8 | 13 | 0 | 13 |
| F_ALL_CHUNKS | 11 | 4 | 13 | 0 | 17 |

Branch order is GOLD/IDENTITY → succeeded@5 → NOT_IN_INDEX → not-in-candidates →
badly-ranked, so `NOT_IN_INDEX` counts **failures attributable to absence** and
varies by arm. The arm-independent figure: **12 of 213 gold documents (5.6%) have
no production vector; for the 20 POSED targets it is 8 of 20 = 40%.**
`GOLD_IDENTITY_ISSUE` is **0** everywhere — no target was missing text.

### 3.4 The per-class table, POSED at 19,932

| class | n | target in production | A | B | D | F |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| doctrine | 12 | 7 | 0 | 1 | 3 | **4** |
| fact_pattern | 10 | 5 | 0 | 1 | 3 | **4** |
| current_law | 4 | 2 | 0 | 2 | 2 | **4** |
| long_narrative | 3 | 3 | 1 | 2 | 2 | 2 |
| supporting_authority | 6 | 4 | 0 | 1 | **1** | 0 |
| adverse_authority | 4 | 2 | **0** | **0** | **0** | **0** |
| statute | 3 | 3 | **0** | **0** | **0** | **0** |
| *pasted_passage (lifted by design)* | 3 | 2 | 0 | 1 | 2 | 3 |

**`adverse_authority` and `statute` are zero for every arm.** No representation
tested here answers "what is the strongest authority against me" or a statute
question. That is not a ranking gap and this experiment does not diagnose it.

---

## 4. What the numbers actually say

**(a) V2's headline was an artefact of an empty distractor set.** Arm B falls
73.3% → 24.4% at the same pool size on the same tasks, with the arm itself
unchanged. The only difference is 2,244 hard negatives and a fill drawn from the
real staged population. **A pool that excludes the documents your production arm
returns will flatter any challenger by roughly 3×.**

**(b) V2's conclusion "more vectors per document is NOT the lever" is
REVERSED.** D_MULTI_3 (3 vectors) beats B_POOLED_ALL (1 vector) at every pool
size and both provenances — 28.9% vs 17.8% posed, 48.4% vs 40.4% lifted — and
F_ALL_CHUNKS (3.39 vectors/document measured) beats both. **Granularity is the
lever.** Pooling averages away exactly the specificity a posed question needs.

**(c) V2's "A degrades with pool size and B does not" is REFUTED.** On the
n=250 lifted set, from 2,500 to 19,932 every arm loses ground and the per-decade
decay factors are close: A 0.697, B 0.722, C 0.716, **D 0.806, F 0.838**. The
passage arms decay **slowest**, which is the opposite of V2's property and points
the same way as (b).

**(d) B is a candidate generator, not a ranker.** B has the best posed
`recall@500` of any arm (**95.6%**) and the second-worst `s@5` (17.8%): 21 of 45
tasks are `CANDIDATE_BADLY_RANKED`, only 2 are not in candidates. A one-vector
pooled representation, at exactly production storage, **finds** the right document
and cannot **order** it.

**(e) The current production representation is at the floor.** Arm A posed:
s@1 2.2%, s@5 2.2%, `recall@500` **35.6%** — in a 19,932-document pool, i.e. the
top 2.5%. An independent check against the real 250k probe index by ANN scored
**0 of 6** on the tasks whose target is present. Whatever is promoted, it must not
be this.

**(f) A lifted benchmark overstates, and it overstates the POOLED arms most.**
At 19,932, lifted ÷ posed: A 10.5×, B 2.27×, C 2.51×, D 1.67×, **F 1.41×**.
Pooled representations gain disproportionately from verbatim overlap, so a lifted
benchmark does not merely inflate every arm — **it changes which arm appears to
win.** That is the precise sense in which the brief's concern was right, even
though its premise about V2 was not.

---

## 5. Corpus-scale cost, and the thing that decides this

The framing everyone has been carrying — "40–45M passage vectors, 50+ GPU-days,
100+ GB" — is **wrong by a large factor**, and measuring it changes the decision.

**Measured in this run:** 3.392 chunks per document, 7,399 characters embedded
per document. The walk's own accounting gives ~993 tokens per 4,800-character
head and ~8,700 tok/s sustained on this GPU.

Against the Tier-A deduplicated population of **8,854,281 documents** (prior
lane measurement, not re-derived here):

| build | vectors | halfvec storage | GPU-days @ 8,700 tok/s | posed s@5 @19,932 |
| --- | ---: | ---: | ---: | ---: |
| **A** HEAD:4800 — *the walk running today* | 8.85M | 18 GB | **11.7** | **2.2%** |
| **B** POOLED_ALL | 8.85M | 18 GB | **18.0** | 17.8% |
| **D** MULTI_3 | 26.6M | 54 GB | **18.0** | 28.9% |
| **F** ALL_CHUNKS | **30.0M** | **61 GB** | **18.0** | **37.8%** |

**B, D and F cost the SAME GPU time.** All three require embedding every chunk of
every document; they differ only in what is kept afterwards. B throws 2.39 of
every 3.39 vectors away and loses 20 points of s@5 doing it.

So the real decision is not "passages vs pooled". It is:

> **6.3 additional GPU-days and 43 GB over the head-only walk already in
> progress, for 2.2% → 37.8% at 19,932-document pool scale.**

61 GB against 290 GB free. Storage is not the constraint and never was.

### 5.1 What this becomes at 8.85M — labelled INFER, and weakly

Fitting a constant per-decade decay to the n=250 lifted curve and extending it
2.65 decades beyond the measured range:

| arm | posed s@5, extrapolated to 8.85M |
| --- | ---: |
| F_ALL_CHUNKS | ~23% |
| D_MULTI_3 | ~16% |
| B_POOLED_ALL | ~7% |
| A_HEAD_4800 | ~0.8% |

**This is an extrapolation of 2.65 decades from 0.9 decades of data and should be
treated as an order of magnitude, not a forecast.** Its one validation point is
weak and consistent: arm A measured against the real 250k probe scored 0 of 6.
**No decision below depends on these numbers** — they are here so nobody has to
invent worse ones.

---

## 6. Recommendation

**Do not promote the current HEAD:4800 staged vectors.** At 2.2% posed s@5 and
35.6% recall@500 they cannot support any semantic claim, and the brief's
prohibition stands on measured grounds rather than caution.

**Build passage-level, not pooled.** F is the measured winner on every posed
metric except `supporting_authority`, costs the same GPU as B, and decays
slowest with scale. If storage ever becomes the constraint, D_MULTI_3 is the
fallback at 54 GB and −9 points.

**The candidate/rank split is the design.** B's 95.6% posed recall@500 at exactly
production storage, against F's 37.8% s@5, says a two-stage shape is available
where stage 1 is one pooled vector per document and stage 2 orders by passage.
That is a **finding, not an approved plan** — §7 NEW1-4's bar was "no reranker
sprint unless candidate presence becomes strong enough for one to matter", and
95.6% at 19,932 documents is the first evidence that it might. It is **not**
evidence at 8.85M: recall@500 in a 20k pool is the top 2.5%; the same 2.5% at
8.85M is 221,000 documents.

**Nothing here is a launch threshold.** The arms, pools, metrics and failure
taxonomy were frozen in the instrument's header before the first document was
read, and no threshold has been invented since.

---

## 7. What this does NOT claim

- **Not a production latency number.** This artefact contains none. Scoring is
  exhaustive in-memory cosine over a fixed pool; nothing here may be quoted as a
  search time. A winning arm's latency against a real HNSW index is a separate
  measurement.
- **Not a result at corpus scale.** 19,932 documents is 0.23% of Tier A. Every
  arm was still losing ground at the largest pool measured.
- **POSED n = 45, carried by 20 distinct target documents.** The CIs are wide and
  are printed with every figure. The per-class table has cells of n = 3.
  Individual class rows are indications, not rates.
- **`CONDITIONAL_RECALL`.** Gold is force-included in the pool, so recall@k
  measures ranking among documents that are present. Real-world reachability is
  the separate production-coverage figure: **8 of 20 posed targets have no
  production vector at all.**
- **This does not diagnose `adverse_authority` or `statute`, both 0 for every
  arm.** Adverse-authority retrieval asks for documents that *contradict* a
  proposition, which is not a similarity relation, and no arm here was designed
  for it.
- **The lifted numbers are an upper bound and are never advocate performance.**
  They are in this document for exactly one purpose: to size the overstatement.
- **The GPU-day figures assume this box's sustained 8,700 tok/s and the walk's
  measured tokens-per-character.** They are engineering estimates, not a schedule.
