# UNCITED SUBSTANTIVE AUTHORITY STUDY V2 — the gate does not separate what it is assumed to separate

**Owner:** NEW2 · **Measured:** 23 August 2026 · **Consumers:** NEW1 (eligibility),
LCC · **Plan:** §8 / NEW2-4, using NEW1's §7 / NEW1-5 frame
**Supersedes:** `UNCITED_SUBSTANTIVE_AUTHORITY_2026-08-23.md` (V1, n=80, unstratified)

**No corpus mutation. No classifier built. No threshold changed.**

---

## 0 · The answer, before the working

140 documents read as primary text, adjudicated one at a time under one written rule.

| stratum | n | substantive | rate | 95% CI |
| --- | ---: | ---: | ---: | --- |
| `RESIDUAL_NO_NEGATIVE_MARKER` (refused) | 60 | 4 | **6.67%** | [2.62, 15.93] |
| `MARKER_CARRYING` (refused) | 40 | **0** | **0.00%** | [0.00, 8.76] |
| **`CONTROL_ABOVE_GATE_2000_3000` (ADMITTED)** | 40 | 3 | **7.50%** | [2.58, 19.86] |

**Weighted refused-population rate: 2.87%**, normal CI [0.15, 5.58] — using NEW1's
estimator and census weights, never a pool.

> **The headline is the control.** Documents LawMind already admits, in the band
> immediately above the 2,000-character gate, are **7.50% substantive**. The
> refused residual stratum is **6.67%**. Those two intervals overlap almost
> entirely. **At its own margin the length gate is not separating authority from
> procedural chaff — it is separating two populations that are each about 93%
> procedural.**

This is not an argument for lowering the gate. It is an argument that the
gate's *usual justification* is wrong, and that the real discriminator is the
negative-marker stratum, not the length.

---

## 1 · What V1 could not do, and what changed

V1 measured 3 positives in 80 documents drawn from one unstratified band and
correctly refused to build a classifier on them. Two things were missing, and
both are supplied here:

1. **Stratification.** NEW1 delivered `ELIGIBILITY_SAMPLING_FRAME.md` with a
   census, two strata, population weights and an estimator. V2 draws from its
   `draws` lists (ordered by `md5(id)`, so a prefix is a reproducible random
   subsample and a later session can extend it by taking more of the same list).
2. **A control.** V1 had none. *"3.75% of refused documents are substantive"* has
   no meaning without knowing what the admitted documents score. A study with no
   control cannot discover that its treatment group looks like its comparison
   group — which is exactly what happened.

The control is the same population in every respect except the one being tested:
identity and text axes passing, **nothing cites it**, but 2,000–3,000 characters
instead of 400–1,999.

---

## 2 · The rule, written before the reading

> **SUBSTANTIVE** = the court decided a contested question **on its merits** and
> gave a reason another case could use.
> **Applying settled law to facts is not deciding a question of law.**
> **BORDERLINE** is recorded separately and is **never counted as substantive**.

### A consistency error I made and corrected mid-adjudication

Scoring the control, I first marked #105 substantive — a Telangana order
reasoning that the deletion of co-accused names from a charge sheet does not
make the allegation against the remaining accused false. But #13, an Allahabad
order reasoning that *"it cannot be said that no cognizable offence is made
out"*, had already been marked **procedural**. **They are the same shape.**

Left uncorrected, this would have scored the control **30%** against the refused
set's 6.67% and produced the opposite headline. The control was re-read under the
refused set's own standard, and the rate fell to 7.50%.

**A control scored more loosely than the treatment group is worse than no
control**, and the direction of that error always flatters whichever group was
read second.

---

## 3 · The seven substantive documents, so the rate can be checked by hand

**Refused (4 of 100):**

| # | court | what makes it an authority |
| --- | --- | --- |
| 26 | Allahabad 2019 | a Gaon Sabha writ filed through a counsel who is not its panel lawyer will not be entertained |
| 27 | Allahabad 2023 | s.41-A CrPC protection is statutorily available where the sentence is seven years or less; the police are obliged to extend it wherever attracted and no specific direction is required |
| 32 | Rajasthan 2015 | a one-year diploma cannot be equated with a three-year diploma for appointment as Sub Inspector Motor Vehicle |
| 36 | Patna 2016 | where the rules were changed to allow a third attempt, the directorate's removal direction does not apply to teachers who failed twice, though the obligation to pass subsists |

**Admitted control (3 of 40):**

| # | court | what makes it an authority |
| --- | --- | --- |
| 109 | Madras 2016 | the Collector, RDO, Tahsildar and Executive Engineer have no jurisdiction over the tank; a direction could lie only against the Panchayat Union |
| 123 | Punjab & Haryana 2010 | **an N.R.I. cannot be served by proclamation at a village address**, so service is a nullity and the partition proceedings are void |
| 133 | Patna 2016 | under s.114 CPC a review lies only if no appeal has been filed against an appealable order; a Miscellaneous Appeal having been filed against the Order 40 Rule 1 order, the review was not maintainable |

**Six borderlines are recorded and not counted** (#8, #54, #98, #107, #119, #137)
— each is an *application* of law rather than a decision of one. Counting them
would take the refused rate to 5.73% and the control to 15.00%, and the
comparison would still hold in the same direction.

---

## 4 · What the other 133 are

Unchanged in character from V1, and the marker stratum is almost pure:

bail granted or refused on the facts · withdrawal · dismissal for default or
non-prosecution · infructuous by charge sheet, acquittal, compliance or efflux of
time · condonation of delay · restoration · adjournment and stand-over ·
substitution of legal representatives · impleadment · directions to an authority
to *consider a representation*, very often with the words **"without expressing
any opinion on the merits"** printed in the order itself · and reference stubs
whose entire text is *"for orders see my order in Writ-A No. 8605 of 2022"*.

**The single most common shape in the refused population is a court expressly
declining to decide anything.** No retrieval rule can turn that into authority,
because the court has said in terms that it is not one.

---

## 5 · What this settles, and what it does not

### Settled

1. **The marker stratum is where the gate earns its keep — 0 of 40**, upper bound
   8.76%. It is 57.0% of the refused population. Whatever else changes, this
   cohort should stay out.
2. **The residual stratum is indistinguishable from what is already admitted** —
   6.67% [2.62, 15.93] against 7.50% [2.58, 19.86]. If a threshold ever moves,
   **this is the only cohort the evidence supports moving**, and the honest
   description is *"as substantive as what we already index"*, never *"valuable
   uncited law"*.
3. **NEW1's stratifier works**, and its own caveat is confirmed: it over-marks.
   That costs efficiency, not correctness, and the 0/40 result is why the 70/30
   allocation was right to keep the stratum rather than assume it away.
4. **V1's number survives.** 2.87% [0.15, 5.58] weighted against V1's 3.75%
   [1.28, 10.45] pooled — two draws, two frames, one answer.

### Not settled — and this is still the honest answer to the founder's question

**A classifier cannot be built or measured.** Seven positives across 140
documents, on top of V1's three in eighty: **7 positives in 180 refused documents
across both studies.** Estimating a rule's precision to ±10 points around 80%
needs roughly **62 rule-positives**. At these base rates a perfect-recall rule
would need several thousand adjudicated documents.

> **The answer to "which currently excluded cohorts contain enough substantive
> authority to justify a safer retrieval rule" remains: we cannot know cheaply,
> and the cheap thing to know instead is that the gate's margin is not where the
> value is.**

**What I will not do:** build `SUBSTANTIVE_DECISION_VERIFIED` anyway. At a 2.87%
base rate it would admit roughly 34 procedural orders for every authority it
rescued, and each would arrive in search wearing the word *verified*.

---

## 6 · What this study cannot see

- **The control is one band.** 2,000–3,000 characters is the band adjacent to the
  gate, chosen because it is the comparison that matters. It says nothing about
  the 10,000-character judgments that carry most of LawMind's value.
- **Uncited only.** Every document in all three strata has no inbound citation,
  by construction. This is not a statement about the corpus.
- **High Court only.** NEW1's census found the Supreme Court contributes exactly
  zero rows to this population.
- **One adjudicator.** No second reader, so there is no inter-rater agreement
  figure. The §2 consistency error is direct evidence that a single reader drifts;
  every label carries its reason so a second reader can disagree specifically.
- **`MARKER_CARRYING` at 0/40 is not zero.** Its Wilson upper bound is 8.76%.
- **The weighted variance understates.** A stratum scoring exactly zero
  contributes zero variance by construction, which is an artefact. The per-stratum
  Wilson intervals are the honest bounds.

---

## 7 · Reproduce

```
node --env-file=.env services/ingest/.n2c-p4-draw.mjs        # draw, from NEW1's frame + the control
node --env-file=.env services/ingest/.n2c-p4-full.mjs <seq…> # full text of a document
node --env-file=.env services/ingest/.n2c-p4-tail.mjs <a> <b># the operative tail of a range
node services/ingest/.n2c-p4-estimate.mjs                    # the weighted estimate
```

Artifacts: `uncited-authority-frame-v2.json` (140 documents as drawn) ·
`uncited-v2-labels.json` (**every label with its reason**) ·
`uncited-v2-estimate.json`.
