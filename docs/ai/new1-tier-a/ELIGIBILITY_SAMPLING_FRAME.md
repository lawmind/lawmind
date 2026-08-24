# ELIGIBILITY SAMPLING FRAME — for NEW2's uncited-authority study

**Date:** 24 Aug 2026 · **Lane:** NEW1 · **Deliverable:** §7 NEW1-5
**Artefact:** `docs/ai/new1-tier-a/eligibility-sampling-frame.json`
**Instrument:** `services/harness/src/eligibility-frame-cli.ts` ·
`pnpm --filter @lawmind/harness frame:eligibility`
**Deployed eligibility view:** sha256 prefix `2e7b53afe35fa81c`

---

## 1. What this is, in one paragraph

NEW2 has already answered the substantive question and priced the follow-up
(bus 1073): **3.75% [1.28, 10.45] of what the 2,000-character gate refuses is a
substantive authority**, and estimating a rule's precision to ±10 points around
80% needs about **62 rule-positives**, i.e. roughly **1,650 hand-adjudicated
documents** under simple random sampling.

This is not a second opinion on that number. It is the **instrument that makes
the 1,650 cheaper without making the estimate dishonest**: a partition of the
refused population into strata, the true size of each stratum, an unequal
allocation, and the estimator that reweights the result back to the corpus.

**It is not a classifier and must not become one.** NEW2 was right to refuse
building one on 3 positives in 80.

## 2. The population, stated once

```sql
judgment_embedding_eligibility
WHERE axis_a_identity AND axis_b_text
  AND NOT is_cited_authority
  AND text_length >= 400 AND text_length < 2000
```

Identity passes, text passes, **no inbound citation**, and refused by the
**length gate alone** — exactly the population NEW2 measured. The 400-character
floor is NEW2's: a registry cover page is not a document anyone can adjudicate.

Census: `TABLESAMPLE SYSTEM (0.3) REPEATABLE (11)` over `judgments`, joined to
the view. **56,876 rows sampled, 21,416 in the population.**

> `TABLESAMPLE` cannot be applied to a view, only to a table or a materialised
> view. The sample is therefore taken on `judgments` and the view joined by id.
> The sampling unit is a `judgments` page either way.

## 3. What the refused population is made of

Every figure below is a **sampled count**, not a corpus count. Scale by 333× for
a corpus estimate, and read §6 before quoting one.

### By negative marker — the stratification variable

| stratum | n | share |
| --- | ---: | ---: |
| **RESIDUAL_NO_NEGATIVE_MARKER** | **9,201** | **43.0%** |
| M_WITHDRAWAL | 4,617 | 21.6% |
| M_BAIL | 3,791 | 17.7% |
| M_INFRUCTUOUS | 1,285 | 6.0% |
| M_COMPLIANCE | 900 | 4.2% |
| M_DEFAULT | 635 | 3.0% |
| M_ADJOURNMENT | 532 | 2.5% |
| M_CONDONATION | 295 | 1.4% |
| M_REPRESENTATION | 128 | 0.6% |
| M_RECORD_CORRECTION | 25 | 0.1% |
| M_RESTORATION | 7 | 0.0% |

### By length band

| band | n | share |
| --- | ---: | ---: |
| 400–799 | 5,785 | 27.0% |
| 800–1,199 | 5,578 | 26.0% |
| 1,200–1,499 | 3,852 | 18.0% |
| 1,500–1,999 | 6,201 | 29.0% |

### By year cohort

| cohort | n | share |
| --- | ---: | ---: |
| PRE_2015 | 5,004 | 23.4% |
| 2015–2020 | 6,628 | 30.9% |
| 2021–2024 | 6,512 | 30.4% |
| **RECENT_2025_PLUS** | **3,272** | **15.3%** |

### By current document class

| class | n | share |
| --- | ---: | ---: |
| **UNCLASSIFIED** | **15,757** | **73.6%** |
| procedural_disposal | 2,269 | 10.6% |
| decided_brief | 1,262 | 5.9% |
| bail_order | 1,041 | 4.9% |
| decided | 595 | 2.8% |
| reference_stub | 492 | 2.3% |

### By court tier

| tier | n | share |
| --- | ---: | ---: |
| HIGH_COURT | 21,416 | **100.0%** |
| SUPREME_COURT | 0 | 0.0% |

## 4. Four things in that table that change what the study should do

**(a) The Supreme Court contributes ZERO rows.** Not a rounding-to-zero — an
exact zero across 21,416. The length-gated uncited population is entirely a High
Court phenomenon, so any conclusion from it is a High Court conclusion and
carries no implication for SC coverage. It also means the study needs no SC
stratum and should not spend adjudications looking for one.

**(b) 73.6% has no class verdict at all.** This reproduces the ~77% figure this
lane reported in the threshold counterfactual (bus 1064) on a different draw.
It is worth restating in the sharpest form: **`hc_document_class` is unknown for
three of every four documents the length gate refuses.** Every statement of the
form "the refused population is mostly procedural" currently rests on the 26.4%
that has been looked at. `UNCLASSIFIED` is not a class — it is two populations,
refused-by-a-rule and never-looked-at, wearing one NULL.

**(c) 43.0% carries no negative marker.** The stratifier halves the search space
at best. That is a real but modest efficiency gain and it is stated as such
below, not sold as a solution.

**(d) The 2025+ cohort is 15.3% and is the one worth its own stratum later.**
BNS/BNSS/BSA took effect in July 2024, so a 2025 order reasons about a statute
book no frontier model knows. Its value as an authority is different in kind, not
in degree. This frame reports it; it does not oversample it, because doing so on
a hunch is the same error as allocating on an unscored marker.

## 5. The allocation and the estimator

Two strata, because two is what the evidence supports.

| stratum | population share | allocation at budget 600 | ids drawn |
| --- | ---: | ---: | ---: |
| RESIDUAL_NO_NEGATIVE_MARKER | 43.0% | 420 (70%) | 400 |
| MARKER_CARRYING | 57.0% | 180 (30%) | 180 |

**Estimator — this is the part that must not be skipped:**

```
rate    = Σ_h (N_h / N) · p_h
variance = Σ_h (N_h / N)² · p_h(1 − p_h) / n_h
```

`N_h` from the census, `p_h` the adjudicated positive rate in stratum *h*.
**Do not pool the two strata unweighted.** The allocation is deliberately
unequal, so a pooled rate reports the oversampled stratum as if it were the
corpus.

70/30 is not optimal allocation. Optimal allocation needs per-stratum variance,
which needs labels, which is what this is for. 70/30 keeps enough of the
marker-carrying stratum that its rate is **estimated rather than assumed to be
zero** — assuming it away is the one choice here that would quietly bias the
whole result.

**The first deliverable from these draws is the two per-stratum rates, not a
threshold recommendation.**

## 6. What this frame does not claim

- **The markers have never been scored against a label.** Their sensitivity and
  specificity are UNMEASURED. No number in this document depends on them being
  good.
- They are **stratification variables, not predictions**. A useless stratifier
  costs efficiency, never correctness. That asymmetry is the entire reason
  markers are permitted here while a phrase-list classifier is not — this
  repository has already measured a phrase list at 100% in-sample and 29% out.
- The marker phrases were taken from **NEW2's published category names**, not
  from reading their 80 adjudicated documents. So they are not in-sample to that
  study. They are also not out-of-sample validated. They are unvalidated.
- **There is already visible evidence they over-mark.** NEW2 read 11 withdrawals
  and 11 bail matters in 80 documents (13.8% each); the regexes mark 21.6% and
  17.7%. A regex catches a *mention*, not a disposition. For a stratifier this
  is tolerable; for a classifier it would be disqualifying.
- A regex over `full_text` is a lexical test on **English**. It will
  systematically under-mark Devanagari and legacy-font documents. That is a
  coverage bias in the STRATIFIER — an efficiency loss concentrated on those
  documents — not a bias in the estimate.
- **The corpus-size extrapolation is page-clustered.** `TABLESAMPLE SYSTEM`
  samples pages, not rows, so the true error is wider than a binomial interval.
  Three independent draws of this lane's headline gave 40.09 / 38.77 / 38.61
  percent; expect that order of variation here.
- **This frame cannot tell anyone whether the 2,000-character gate should move.**
  It can only make the adjudication that would answer that cheaper. NEW1's
  own counterfactual and NEW2's base rate both currently say the gate is closer
  to right than either lane first implied.

## 7. Handoff

The drawn id lists are in `eligibility-sampling-frame.json` under `draws`, keyed
by stratum, ordered by `md5(id)` so the draw is reproducible. Re-running with the
same `FRAME_SEED` reproduces the frame exactly; changing the seed produces a
different, equally valid one, and the two must not be pooled.
