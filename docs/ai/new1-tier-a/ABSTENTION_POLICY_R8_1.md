# ABSTENTION_POLICY_R8_1 — FROZEN AS A SIGNAL FAILURE

**Deliverable:** R8.1 §6.9 · **Lane:** NEW1 · **Frozen:** 2026-08-26T02:10Z
**Artifact:** `ABSTENTION_CANDIDATE.json`, built 2026-08-26T01:55:51Z, arm `ann_ef200`
**Verdict:** `NOT_DEPLOYABLE` — the feature set cannot calibrate abstention.

---

## 1. The finding

**The preregistered calibration was run unchanged on the complete index, and the chosen
`answer` threshold landed on the grid's lower edge for the second time.**

R8.1 §6.7 and the runbook both anticipated this and both said the same thing:

> *"If that repeats at full scale, do not widen the grid again: it is a finding about the
> signal, and the honest report is that this feature set cannot calibrate abstention, not
> a threshold fitted to an edge."*

**The grid was not widened. This is that report.**

---

## 2. Why the threshold is meaningless, in one table

`topSim` over the 153 DEVELOPMENT tasks:

| quantile | value |
|---|---:|
| p05 | 0.6329 |
| p50 | 0.7001 |
| p95 | 0.8117 |

**Every query scores between 0.63 and 0.81.** The chosen `answer` threshold is **0.20** —
below the entire observed distribution. It separates nothing. A rule with a threshold no
observation ever approaches is not a rule; it is a constant.

The artifact says so itself:

> `THE CHOSEN THRESHOLD SITS ON A GRID EDGE (answer). An optimum on a boundary is the
> search saying the answer lies outside where it looked. This candidate must NOT be
> deployed on this evidence.`

**Absolute cosine similarity does not discriminate answerable from unanswerable on this
feature set**, and the rule collapses to gap-only. This reproduces the partial-index
result (`topSim` p05 0.6219, everything in 0.62–0.77) at 6× the index size, which is what
makes it a property of the signal rather than of the sample.

By contrast `simGap` spans p05 0.0101 → p95 0.1076, a **10× dynamic range against
`topSim`'s 1.28×**. The margin carries the information; the absolute score does not.

---

## 3. What the candidate rule actually does

Thresholds `answer ≥ 0.2`, `review ≥ 0.2`, `gap ≥ 0.08`:

| split | tasks | useful coverage | false-confident | false-abstention | review | coverage unknown |
|---|---:|---:|---:|---:|---:|---:|
| DEVELOPMENT | 153 | 0.1176 | 0.0065 | 0 | 134 | 0 |
| HELD_OUT | 142 | 0.1901 | 0.0141 | 0 | 113 | 0 |

**It sends 88% of DEVELOPMENT and 80% of HELD_OUT to review.** A policy that refers four
in five queries to human review is not an abstention policy; it is a refusal with extra
steps.

Zero false-abstention on both splits is **not** reassurance — the V3.1 task set is almost
entirely tasks that *should* be answered, so the negative set is thin and
false-confident rate is estimated over very few observations.

### Discipline, as preregistered
- Tuned on **DEVELOPMENT only**. HELD_OUT scored **once**, from frozen thresholds, to
  report — never to choose.
- Split unit is the **target cluster**, never the task: two tasks sharing an authority are
  not independent.
- **Fifth owns the hidden holdout.** It has not been run and this file does not touch it.
- DEVELOPMENT and HELD_OUT disagree (0.1176 vs 0.1901 useful coverage). **That
  disagreement is a finding, not a reason to re-tune.**

---

## 4. The one permitted composite candidate — deliberately not spent

R8.1 §6.7 permits **one** bounded composite risk candidate over margin, cross-arm
agreement, and role/damage/domain/coverage state. **NEW1 is not spending it this round,
and the reason is a priority argument rather than a technical obstacle.**

Three of eleven families score zero — `supporting_authority` at **0/6 to rank 100**. An
abstention policy is a decision procedure over a retriever's confidence. **Calibrating
confidence over a retriever that returns nothing useful for supporting-authority,
adverse-authority and statute queries would be fitting a decision rule to a distribution
we already know is wrong for a quarter of the families.** The retrieval failure outranks
the calibration failure, and spending the one permitted candidate now would burn it on the
wrong problem.

**What that candidate should use when it is spent**, recorded so the reasoning survives:
`simGap` as the primary signal (10× the dynamic range of `topSim`), cross-arm agreement
between dense and lexical, and the coverage/role state that R8.1 §7.7 will produce. Not
absolute similarity — that is now measured as uninformative at two different index sizes.

---

## 5. Frozen state

| item | state |
|---|---|
| preregistered calibration | **RUN, unchanged, on the complete index** |
| chosen thresholds | `answer ≥ 0.2`, `review ≥ 0.2`, `gap ≥ 0.08` |
| grid edge | **HIT — `answer`, for the second time** |
| grid widened | **NO**, and it must not be |
| deployable | **NO** |
| composite candidate | **UNSPENT** — available to a future round |
| verdict | **`ABSTENTION_SIGNAL_FAILURE`** — absolute similarity cannot calibrate this feature set |

**What a downstream surface must not do with this.** There is no server-side abstention
threshold to consume. A product surface must not invent one, and must not read the absence
of a policy as permission to present low-confidence retrieval as confident. The existing
cross-route uncertainty vocabulary (LCC, §8.5) remains the only sanctioned way to express
this state, and the honest value here is **coverage unknown**, not *confident empty*.
