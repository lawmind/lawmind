# CAN WE FIND A SUBSTANTIVE AUTHORITY THAT NOBODY HAS CITED YET? — measured, and the answer is UNKNOWN

**Owner:** NEW2 · **Measured:** 23 August 2026 · **Answers:** NEW1 bus 1049/1065,
LCC bus 1054/1064 · **Founder question:** P6

NEW1 measured **40.09%** of the corpus unreachable solely for want of an inbound
citation, and decomposed it honestly: **39.25% is the <2,000-character LENGTH
gate**, 0.84% is the refused-CLASS gate. The length gate is 47× the class gate.

The founder's question: can a **high-precision positive class** —
`SUBSTANTIVE_DECISION_VERIFIED` — be built that does not require a document to be
popular, without converting ordinary procedural orders into authority? *"If not:
say UNKNOWN. Do not build a classifier simply because search wants more
coverage."*

**The answer is UNKNOWN, and the reason is a number rather than a shrug.**

---

## 1 · The base rate in the refused population

Frame: 80 documents drawn by `TABLESAMPLE SYSTEM (0.35) REPEATABLE (7)` from the
population NEW1's counterfactual names — 400–1,999 characters, identity and text
axes passing, **no inbound citation**. Split 40 train / 40 held out; the held-out
half was not read until the train half had been read and the candidate signals
written down. Every document was read as primary text.

`SUBSTANTIVE_DECISION` = the court decided a contested question **on its merits**
and gave a reason another case could use.

| | n | substantive | share |
| --- | ---: | ---: | ---: |
| train | 40 | 2 | 5.00% |
| held out | 40 | 1 | 2.50% |
| **pooled** | **80** | **3** | **3.75%** · 95% CI **[1.28, 10.45]** |
| pooled, counting 3 borderlines as substantive | 80 | 6 | 7.50% · CI [3.48, 15.41] |

**Between 1.3% and 10.5% of what the length gate refuses is an authority.** The
other ~95% is: withdrawal (11 of 80), fact-bound bail granted or refused (11),
dismissal for default or non-prosecution (6), condonation of delay (5),
compliance recorded and contempt closed (6), adjournment or passed-over (4),
restoration (3), infructuous or abated (4), record correction (2), registry
cover pages (2), directions to an authority to consider a representation (5).

The three that qualified:

- a writ **allowed** on the merits with a reasoned finding that a named hospital
  is a recognised referral hospital, directing reimbursement
- an order stating a rule of general application — *"no institution can claim as
  of right that it be appointed Examination Centre"*
- reasons on **what a detaining authority must consider before passing a
  detention order**, before discharging the rule

Three borderlines are recorded and deliberately **not** counted: a restoration
applying the settled "a litigant should not suffer for counsel's mistake", a
routine protection order, and a contempt rejected on a restoration report. Every
one is an *application* of law, not a decision of one.

## 2 · The candidate positive signal I found, and refuted myself

Reading the train half turned up something that is not our inference at all —
several High Courts stamp their own orders:

```
Whether reportable?          Yes / No
Whether reasoned/speaking?   Yes / No
```

That is the **registry's own classification, printed on the paper**, which is
exactly the shape of evidence this question wants. Measured over a
30,000-document system sample before it was believed:

| | |
| --- | ---: |
| documents carrying the stamp | 630 = **2.10%** |
| of which **Punjab & Haryana High Court** | **629** |
| every other court, combined | 1 (Rajasthan) |
| stamped `Yes` | 544 = **86.35%** |
| stamped `No` | 86 |

**Refuted, twice over.** It is one court, and within that court it is nearly a
constant — a field stamped `Yes` on 86% of orders separates nothing. A rule built
on it would inherit Punjab & Haryana's entire order stream, procedural orders
included, and reach 2% of the corpus while doing it.

That is the whole finding on this signal, and it is worth more than a plausible
rule would have been: the most promising *court-issued* substantive marker in the
corpus does not discriminate.

## 3 · Why precision is UNKNOWN and not "low"

With **3 positives in 80**, no rule's precision can be estimated. A rule that
fired on exactly those three would read 100%, on n=3, and mean nothing. This is
the `decided_brief` lesson in a new place: a rate over a tiny numerator is not a
measurement.

**What it would take.** To estimate a rule's precision to ±10 points around 80%
needs roughly **62 rule-positives**. At a 3.75% base rate, a rule with perfect
recall would have to be run over about **1,650** documents of this population,
every one of them read by a human or an adjudicated model — and a realistic rule
with partial recall needs several thousand. That is the honest cost of the
question, and it is not this session's work.

**What I will not do:** build the classifier anyway. A `SUBSTANTIVE_DECISION_VERIFIED`
shipped on this evidence would, at the measured base rate, admit roughly 25
procedural orders for every authority it rescued — and each one would arrive in
search wearing the word *verified*.

## 4 · What this DOES settle, for LCC and NEW1

1. **The length gate is closer to right than it looks.** Admitting the whole
   39.25% would add ~96% chaff at this base rate. NEW1's own counterfactual
   (bus 1064) reached the same shape from the other side: chaff among *classified*
   additions runs 26.5% → 53.4% as the threshold drops. Neither number supports
   moving the 2,000-character threshold on general grounds.
2. **The rescue clause is the thing to fix, not the threshold.** It fires for
   **0.03%** of documents while the refusal it guards catches 40%. A rule whose
   exception fires three times in ten thousand is a rule without an exception.
3. **`cited_authority` remains a popularity proxy standing in for a quality
   claim.** They are different claims on different evidence, and a rise in
   resolver coverage must never be reported as a rise in currentness coverage —
   `RESOLUTION_IS_NOT_TREATMENT_2026-08-23.md`.
4. **The gold cannot see this.** ADVOCATE-100's 27 distinct substantive
   authorities are landmarks: long, `decided`, cited by everything. A gold made
   of landmarks reports zero uncited-authority bias however large the bias is.
   NEW1 recorded that as an instrument limit and it is accepted here as one.

## 5 · One thing found on the way that is not about P6

Frame document #2 (Bombay HC, 1,206 characters) passed `text_quality >= 0.85` and
is a **glyph dump**: *"L K V K W V L L 67 / / … v ate f r ppellants"*. It sits in
a population every eligibility axis has cleared. That is
`text_quality certifies garbage` appearing again inside a sample drawn for an
unrelated reason, and it is one more argument for `body_text_evidence` over
`text_quality` — `BODY_TEXT_EVIDENCE_STATE_2026-08-23.md`.

## 6 · Reproduce

```
node --env-file=.env services/ingest/.n2b-p6-frame.mjs        # draw the frame
node --env-file=.env services/ingest/.n2b-p6-reportable.mjs   # the stamp census
node services/ingest/.n2b-p6-label.mjs                        # labels + base rate
```
Artifacts: `uncited-authority-frame.json` (80 documents, labelled, with reasons
for the borderlines) · `reportable-stamp-census.json`.
