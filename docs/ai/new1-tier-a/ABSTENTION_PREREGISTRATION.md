# ABSTENTION — PRE-REGISTRATION

**Date:** 25 Aug 2026 · **Lane:** NEW1 · **Deliverable:** convergence sprint V2 §7 NEW1-3
**Split artifact:** `docs/ai/new1-tier-a/V31_ABSTENTION_SPLIT.json`
**Manifest:** `docs/ai/new1-tier-a/V31_MANIFEST.json`
**Instrument:** `services/harness/src/v31-split-cli.mjs`

> **This document is written BEFORE any abstention score exists.** No threshold
> has been fitted, no held-out query has been scored, and no calibration curve
> has been looked at. That ordering is the entire value of the document: a rule
> chosen after seeing the answer is not a rule, it is a description.
>
> If you are reading this alongside results, check `git log` — this file must
> predate them.

---

## 1. The product statement being defended

LawMind must be able to say:

> **"No sufficiently relevant authority found."**

instead of returning the nearest real judgment and letting an advocate infer that
it is on point.

The failure this prevents is specific and already observed. NEW3's bus 1076: a
**commercial breach-of-contract** query returned an **IPC 394 robbery** judgment.
Nothing about that result is malformed — it is a real judgment, correctly
retrieved as the nearest neighbour, rendered with correct citation state. It is
simply *not an answer to the question asked*, and today the product has no way to
say so.

That is the target. Not "improve ranking" — **stop presenting a confident wrong
domain answer as an answer.**

---

## 2. What is already fixed, and cannot be changed after seeing results

| | |
| --- | --- |
| split artifact | `V31_ABSTENTION_SPLIT.json` |
| unit of split | **target cluster**, never the task |
| stratification | by `(POSED:<queryClass> \| LIFTED)`, exact seeded prefix per stratum |
| seed | `lawmind-new1-v3.1-2026-08-25` |
| DEVELOPMENT | 153 tasks · 108 clusters · 109 targets · 29 POSED |
| HELD_OUT | 142 tasks · 103 clusters · 104 targets · 16 POSED |
| leak check | **CLEAN** — no target on both sides |

### Why the unit is the cluster

295 tasks collapse to 211 target clusters, because several tasks ask about the
same authority. Splitting by *task* would put two questions about one judgment on
opposite sides — and then a threshold tuned on the development side has already
seen the held-out side's target, its text and its embedding neighbourhood. The
held-out number would be optimistic by construction and nobody could tell.

### Why stratified — a correction recorded, not hidden

The first implementation hashed each cluster independently against the ratio. It
was measured before use and it was **wrong**:

```
DEVELOPMENT    7 POSED tasks
HELD_OUT      38 POSED tasks
long_narrative / pasted_passage / statute:   ZERO in development
```

250 of the 295 tasks are LIFTED singleton clusters and they drowned the 45 POSED
ones. A threshold calibrated on 7 tasks across 5 classes is not calibrated, and
three classes could not have been calibrated for at all. Fixed by bucketing
clusters per stratum and taking an exact seeded prefix — with 3 clusters in a
stratum, independent coin flips leave a side empty about a quarter of the time
and a prefix never does.

---

## 3. ⚠ A limit that must be stated before results, not after

Two POSED classes have too few **independent target clusters** to divide:

| class | dev | held-out |
| --- | ---: | ---: |
| `statute` | 3 | **0** |
| `pasted_passage` | 3 | **0** |

**Held-out abstention will therefore cover 6 of 8 POSED classes.** No held-out
abstention claim may be made about `statute` or `pasted_passage`, in this
document, in a report, or in product copy. This is a property of the gold set,
not of the splitter, and it is being written down now precisely so it cannot be
quietly dropped when the results look good elsewhere.

This matters commercially: `statute` scores **0 for every representation tested**
in V3. A statute question is one where LawMind most needs to abstain, and it is
one of the two where the evidence to prove abstention works will be weakest.

---

## 4. The decision rule — form fixed now, parameters fitted on DEVELOPMENT only

### 4.1 Form

For a query `q` with ranked candidates `c₁…c_k` and similarity scores `s₁…s_k`:

```
ABSTAIN  if   s₁ < τ_abs
         or   (s₁ − s₂) < δ_margin  AND  s₁ < τ_soft
ANSWER   otherwise
```

Three parameters: `τ_abs` (absolute floor), `δ_margin` (top-1 to top-2 gap),
`τ_soft` (the ceiling under which the margin rule may fire).

**Why a margin term and not a bare threshold.** A bare floor answers "is anything
close?". It does not answer "is the top result *distinctively* the answer?". The
wrong-domain failure mode looks like a *flat* neighbourhood — several unrelated
judgments at similar middling similarity, with the IPC 394 robbery case winning
by a hair. A margin term is the only one of the two that can see that shape. If
the margin term turns out to contribute nothing, that is a reportable negative
result and `δ_margin = 0` will be published as the fitted value.

### 4.2 Selection criterion — committed now

Parameters are chosen on **DEVELOPMENT only**, by maximising

```
coverage   subject to   wrong-domain confident answer rate ≤ 5%
```

Ties broken toward **higher abstention** (the conservative direction, because the
cost of a confidently wrong authority is not symmetric with the cost of an
unnecessary "we could not find one").

**The 5% ceiling is chosen now, before seeing any curve.** If no parameter
setting on DEVELOPMENT reaches it, that is reported as *"abstention cannot be
calibrated to the committed safety bound on this evidence"* — the bound is **not**
relaxed to manufacture a passing result.

### 4.3 What is forbidden

- Fitting, tuning, or "sanity-checking" any parameter against HELD_OUT.
- Looking at HELD_OUT scores before DEVELOPMENT parameters are frozen and
  committed to git.
- Re-running the split with a different seed after seeing results.
- Reporting a held-out number for `statute` or `pasted_passage`.
- Reporting aggregate coverage without the per-class breakdown beneath it.

---

## 5. What gets measured on HELD_OUT

All four are reported per class and with the three denominators (tasks, distinct
targets, target clusters).

| metric | definition | why |
| --- | --- | --- |
| **false confident answer rate** | answered, and no target in top-5 | the headline harm |
| **wrong-domain confident answer rate** | answered, top-1 is in a different subject domain than the query | the NEW3-1076 failure specifically |
| **false abstention rate** | abstained, but a target *was* in top-5 | the cost of the cure |
| **coverage** | share of queries answered at all | what the product loses |

### Two accounting rules, fixed now

1. **A target with no vector in the index counts as a MISS, not as an
   abstention success.** 12 of 213 gold (5.6%) have no production vector. If the
   system abstains because the answer was never in the index, that is *correct
   behaviour reported honestly* — it must appear in coverage loss, and it must
   **not** be scored as the threshold working.

2. **Wrong-domain is judged against the query's class and the target's subject,
   never against similarity.** Otherwise the metric is a function of the thing
   being tuned.

---

## 6. What would falsify the whole approach

Stated in advance so it cannot be explained away later:

- If **false abstention exceeds ~30%** at the safety bound, abstention is not
  ready: the product would be refusing a third of answerable questions and an
  advocate would stop trusting the refusal.
- If the margin term contributes **nothing** over the bare floor, say so and ship
  the simpler rule.
- If wrong-domain confident answers cannot be pushed under 5% **at any coverage
  above ~20%**, the honest conclusion is that **abstention cannot rescue the
  current representation** and the answer is the passage build (§7 NEW1-5), not a
  threshold.

That last one is the live hypothesis. Arm A scores s@5 **2.2%** on posed
questions. A threshold cannot manufacture relevance that retrieval never found —
at best it converts a confidently wrong answer into an honest refusal, which is
worth doing on its own terms but is **not** a search feature.

---

## 7. Status

- [x] Split built, stratified, leak-checked, committed (`7a9600c`)
- [x] Rule form, selection criterion and safety bound pre-registered — **this document**
- [ ] Fit parameters on DEVELOPMENT
- [ ] Freeze fitted parameters to an artifact and commit **before** touching HELD_OUT
- [ ] Evaluate HELD_OUT once
- [ ] Report, including the two classes that have no held-out evidence

**Not yet run.** Fitting requires scoring the development queries against an
index, which needs the GPU sidecar currently serving the live HEAD walk. §13
forbids overlapping decision-critical GPU work, so this waits for the same quiet
window as the 100k tranche (§7 NEW1-2).
