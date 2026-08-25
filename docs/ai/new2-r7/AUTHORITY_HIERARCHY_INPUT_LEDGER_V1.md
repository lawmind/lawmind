# AUTHORITY_HIERARCHY_INPUT_LEDGER_V1

**Lane:** NEW2 · **Round:** R7 §10 (P1) · **25 August 2026**

> R7 §10: *"Do not build a broad 'binding precedent' oracle from intuition.
> Produce first an input ledger covering what is actually known… This is an
> input ledger, not a final legal-conclusion engine."*

**Verdict: the evidence does not exist for a bindingness classifier over this
corpus, and the shortfall is not marginal — it is 99.8%.**

---

## 1. What bindingness would need, and what we hold

| input | held for | share of 18,698,984 |
| --- | ---: | ---: |
| **court level** (which court decided it) | 18,698,984 | **100%** |
| **coram / bench composition** | **38,326** | **0.20%** |
| named judges (`judgment_judges`) | 38,325 judgments, 44,360 rows | **0.20%** |
| source-verified bench size | **0** | **0%** |
| case type | 4,573,943 | 24.46% |
| HC document class | 4,865,352 | 26.02% |
| later treatment of the authority | 15,982 edges | 0.09% of real references |
| — of which court-verified rather than a reporter's note | **5 edges** | — |

## 2. The finding: coram is a Supreme Court field and nothing else

```
Supreme Court of India   38,342 judgments   38,326 carry a bench   (99.96%)
every High Court         18,660,626         0 carry a bench        (0%)
```

`judgment_judges` tells the same story: 44,360 rows across 38,325 judgments, all
Supreme Court. Average 1.16 named judges per judgment — which is itself below any
plausible bench size and suggests the extraction is partial even where it exists.

**Every High Court judgment in the corpus has no coram.** So for 99.8% of the
corpus we cannot answer:

- was this a Division Bench or a Single Judge?
- was it a Full Bench, and therefore binding on later Division Benches of the
  same court?
- is a conflicting decision from a larger bench of the same court?

Bench size is the *pivot* of Indian precedent doctrine. A Supreme Court decision
of a five-judge bench binds a three-judge bench; a High Court Full Bench binds a
Division Bench; a Single Judge binds nobody. **None of that is computable here.**

## 3. What IS computable, and its limits

**Court level alone** supports exactly one rule with confidence: *a Supreme Court
decision binds all High Courts (Constitution, Art. 141)*. That is 38,342 of
18,698,984 documents on the binding side — 0.21% of the corpus — and it says
nothing about which of two conflicting Supreme Court decisions prevails, because
that turns on bench size.

Everything else — a High Court binding its own subordinate courts, persuasive
value across High Courts, per incuriam, sub silentio — needs at least one input
we do not have.

## 4. Later treatment cannot substitute

15,982 treatment edges over 6,231,847 real references is 0.26%, and of those,
**5** rest on the court's own words rather than a reporter's editorial note
(`COURT_REASONING_TREATMENT_ENRICHMENT_V1`). A "has this been overruled" signal
built on 15,982 edges answers *no* for essentially every authority — and *no*
from absence of evidence is exactly the failure mode
`verification-catches-false-positives-only` names: a claim never made leaves no
trace.

## 5. Recommendation

**Do not build a bindingness classifier this sprint, and do not ship a
`persuasive` / `binding` field on any surface.** The one defensible signal —
Supreme Court decisions bind High Courts — is already carried by `court` and
needs no classifier.

**For Fifth to challenge:** the claim here is that bench metadata is *absent*,
not that it is *unavailable*. It may be recoverable — the coram is usually
printed in the judgment's own header text, which is 99.87% segmented into
paragraphs, and `CASE_HEADER` passages are 6.81% of the passage pool and contain
exactly the `Hon'ble … , J.` pattern. **That is a hypothesis, not a measurement**;
this ledger records what is in the columns today. If Fifth judges the evidence
sufficient, extracting coram from the header is a bounded, testable task and the
single highest-value structured-metadata gap in the corpus.

## 6. States

| question | state |
| --- | --- |
| court level | `OBSERVED_BY_LIVE_DB` — complete |
| coram / bench | `OBSERVED_BY_LIVE_DB` — 0.20%, Supreme Court only |
| bench SIZE from primary metadata | **`NOT_HELD`** — no column, no source |
| whether coram is recoverable from header text | **`HYPOTHESIS`** — untested |
| whether `judgment_judges`' 1.16 names per judgment is complete | **`UNKNOWN`** — implausibly low |
| Art. 141 (SC binds HCs) | `DERIVED` from `court`, needs no classifier |
