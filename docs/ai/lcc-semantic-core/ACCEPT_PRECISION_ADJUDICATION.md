# CANONICAL_ACCEPT precision — 24 claims read, 22 correct

**21 August 2026 · LCC · `semantic-role.ts` v1**

The only number that matters for this verifier is the precision of
`CANONICAL_ACCEPT`, because that is the state that promotes a row to
`SEMANTIC_ROLE_VERIFIED` and puts it in front of the retrieval layer. Everything
else it can emit — `ROLE_UNPROVEN`, `ROLE_MISMATCH` — costs recall and cannot
cost safety.

So the accepts were read.

## What was measured, and the criterion used

Each sampled claim was adjudicated against **the role label the enrichment
carries**: is this span really a holding / an argument / a relief / an issue /
a procedural event?

That is a stricter test than the one the verifier actually applies. The verifier
tests VOICE and POSITION — court's own words, not a party's recital, not inside
a block quote — which is exactly what migration `0064` specified for `holding`.
Grading it against the stricter criterion is deliberate: the number a consumer
needs is "how often is the label right", not "how often did the rule fire as
designed".

## Result

```
sampled                24 accepted claims, spread across 7 roles
label correct          22
label wrong             2      91.7%   Wilson 95% CI [74.2%, 97.7%]
```

**The two failures, both named rather than summarised:**

1. `holding` — *"Following the said decision, several other Writ Petitions were
   disposed of."* Court-authored, not a submission, not quoted, so the verifier's
   own test passed correctly. It is **narration, not a holding**. The model's
   label was wrong and structure alone cannot see it.

2. `procedural_event` — *"the petitioner's appeal dated 25.04.2025 is directed to
   be disposed of by the third respondent within a time frame to be fixed by this
   Court."* The date parses and falls inside the case's lifetime, which is what
   `0064` asked for. It is a **direction**, not a past procedural event. The date
   rule cannot distinguish a date that happened from a date being ordered.

Both failures are the same shape: **the structural rule is satisfied and the
label is still wrong.** That is the residual, and it is stated here rather than
discovered later.

## What `SEMANTIC_ROLE_VERIFIED` therefore means, exactly

> The span exists in the document, sits in readable text, is in the voice the
> role requires, and is not lifted from quoted material.

It does **not** mean the span is the ratio decidendi. Nothing in this pipeline
identifies a ratio, and the eight rows above are the reason that sentence is
written down.

## Honest limits of this measurement

- **n = 24.** The interval is wide and it is reported wide.
- **One adjudicator**, and that adjudicator wrote the verifier. NEW2's held-out
  method is the independent check and has been asked for on the bus.
- Sampled from a **400-row dry pass**, spread across roles by stride rather than
  drawn uniformly at random from the promoted population.
- The two roles with the fewest accepts in the sample — `issue` (2) and
  `procedural_event` (2) — carry almost no information individually.

## The rule change this measurement forced, before any of it was written

The first cut of the verifier used *"the nearest voice marker before the span, at
any distance"*. It refused **127 of 180 `holding` claims** as party submissions.
Five were read and **all five were genuine court determinations**:

- *"Viewing from any angle, it is not a fit case to grant bail to the
  petitioners-A.1 and A.2 under Section 438 Cr.P.C."*
- *"this Court is not acceded to the prayer of the petitioner for anticipatory
  bail."*
- *"offence under SC/ST Act is not made out and the parties have settled their
  dispute amicably"*

Each sits thousands of characters after the last *"it is contended"*, with no
court-voice idiom in between, because the judge did not use one. A marker four
thousand characters away is not evidence about this sentence.

`MARKER_REACH = 600` was introduced for that reason, and the population moved:

```
                     unbounded      600-char reach
CANONICAL_ACCEPT       42.1%            35.4%
ROLE_MISMATCH          35.9%            18.8%
ROLE_UNPROVEN          21.7%            45.5%
```

**`ROLE_MISMATCH` nearly halved and `ROLE_UNPROVEN` doubled**, which is the
correct direction: most of what the first version called a mismatch was the
absence of a marker, and absence of a marker is not evidence of anything.
