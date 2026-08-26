# ROLE_CENSUS_WIDENED_R8_3 — R8.3 §8.4 / §11 N2-7

**Lane:** NEW2 · **26 August 2026**
**48 queries, 480 passages, production `ef_search=200`. Reporter/editorial is 6.46% of top-k, not 10%. And the finding that replaces the enrichment story is worse: retrieval DEPLETES the court's own reasoning.**

**Artifacts** — `scripts/n2-role-census-widened.mts` ·
`docs/ai/new2-r83/role-census-widened.json`
**Supersedes** the 20-query point estimate in
`docs/ai/new2-r8/TRANCHE_PASSAGE_SAFETY_V1.md` §5, and the pool denominator it
was compared against.

---

## 1. Two things were wrong at once, and they pointed opposite ways

Correction 3 said the 10% figure was too small a sample to freeze. It was, but
the pool it was compared against was also biased — a `LIMIT` applied after a
`WHERE` took a court-clustered slab of the table (see my bus 1323). Fixing one
without the other would have produced a third wrong number.

```
                        old            corrected
pool  REPORTER_EDITORIAL  1.68%          4.44%     (n 4,000 biased -> 59,760 full draw)
top-k REPORTER_EDITORIAL 10.00%          6.46%     (20 queries -> 48, 200 -> 480 passages)
enrichment                5.95x          1.45x
```

---

## 2. The corrected enrichment table

Pool from the unbiased `%7` draw (59,760 passages); top-k from 48 legal queries
at k=10, `ef_search=200`.

| role | pool | top-k | enrichment |
| --- | ---: | ---: | ---: |
| `HOLDING_OPERATIVE` | 3.87% | 12.92% | **3.34×** |
| `REPORTER_EDITORIAL` | 4.44% | 6.46% | **1.45×** |
| `DAMAGED_OR_OCR_SUSPECT` | 0.49% | 0.63% | 1.29× |
| `PARTY_SUBMISSION` | 15.06% | 16.25% | 1.08× |
| `OTHER_UNKNOWN` | 60.36% | 58.75% | 0.97× |
| **`COURT_REASONING`** | **1.20%** | **1.04%** | **0.87×** |
| `PROCEDURAL_HISTORY` | 1.50% | 1.25% | 0.83× |
| `SPAN_UNVERIFIABLE` | 1.88% | 0.42% | 0.22× |
| `CASE_HEADER` | 10.04% | 2.08% | 0.21× |
| `FACTS` | 1.05% | 0.21% | 0.20× |
| `QUOTED_PRECEDENT` | 0.11% | 0.00% | 0.00× |

```
unsafe-as-court-reasoning   top-k 23.75%   pool 21.98%
```

### What dies

**"The retriever prefers the editor's version over the court's own, at the
court's own job, nearly three times harder than any other distilled holding."**
That was NEW1's sharpest line and it was built on my biased denominator.
Reporter/editorial is enriched 1.45× — the weakest positive enrichment in the
table apart from OCR damage.

### What replaces it, and it is not better news

**`COURT_REASONING` is the only substantive class the retriever DEPLETES.**
At 0.87× it is slightly less likely to surface than its share of the pool.
Meanwhile `HOLDING_OPERATIVE` is enriched 3.34×.

So the mechanism is real but it is about **form, not authorship**: the retriever
rewards short declarative statements of outcome — *"the appeal is allowed"*,
*"the impugned order is set aside"* — and is indifferent-to-hostile toward the
discursive first-person reasoning that explains WHY. An advocate wants the why.

```
judicial : reporter     pool   1.14 : 1
                        top-k  2.16 : 1     <- retrieval IMPROVES this 1.89x
```

NEW1's "degrades 2.70×" line inverts on the corrected pool. Retrieval returns a
*better* judicial-to-reporter ratio than the corpus contains. That does not make
6.46% acceptable — see §5 — but the asymmetry claim is gone.

---

## 3. The rate is concept-driven, which 20 queries could not show

`REPORTER_EDITORIAL` per concept, 40 passages each:

```
specific performance of a contract          10/40   25.0%
murder under the old and new criminal codes  7/40   17.5%
termination of service                       5/40   12.5%
limitation and condonation of delay          4/40   10.0%
interim relief in arbitration                2/40    5.0%
quashing of FIR                              1/40    2.5%
temporary injunction                         1/40    2.5%
dishonour of cheque                          1/40    2.5%
bail                                         0/40    0.0%
anticipatory bail                            0/40    0.0%
maintainability of a writ petition           0/40    0.0%
maintenance of wife and children             0/40    0.0%
```

**Four concepts return no reporter text at all; one returns a quarter.** A single
pooled percentage is a weighted average over a range that wide, and quoting 6.46%
as "the rate" hides that a commercial-contract question is ten times more exposed
than a bail question.

That is a usable policy shape rather than a global number: exposure concentrates
in **civil and commercial doctrine**, which is exactly where reporter series
publish most heavily.

---

## 4. The wrong-domain control, and what it suggests

Four off-domain queries, 40 passages:

```
REPORTER_EDITORIAL   4/40   10.00%
```

**Higher than the legal queries' 6.46%**, on a small sample. If reporter text
were being selected *because* it distils legal propositions, an off-domain query
should surface less of it, not more. This points at reporter apparatus being a
generic attractor — headnote-shaped text is dense, declarative and short — rather
than a semantic match to legal questions.

`n = 40`. This is a hint that the mechanism is not legal-semantic, not a result.

---

## 5. What does NOT change

**The licensing question is untouched by every number above.** A headnote is the
reporter's own copyrighted work — *Eastern Book Company v. D.B. Modak* — and
`CLAUDE.md` §6 already adopts the rule that follows: raw court text, never a law
report's edition of it. **6.46% of what this candidate retrieves is material our
own source rule excludes.** Enrichment ratios are about whether the retriever
*prefers* it; they say nothing about whether we may *serve* it.

§8.3's fail-closed rule stands unchanged: high-confidence `REPORTER_EDITORIAL`
cannot be represented as the court's own words, cannot support a generated legal
proposition, and cannot drive an unqualified treatment claim.

---

## 6. The half that is deliberately NOT run

§8.4 also asks for a stratified subset of the 295-task evaluation.
`PASSAGE_100K_METRICS.json` carries task ids, classes and per-arm results — **not
query texts** — because that set is in FIFTH's hidden-eval custody. §13 F-10
forbids consuming the broad hidden semantic holdout, and going to find those
queries in order to widen a census would consume it.

`NOT_RUN`, with the reason, rather than attempted quietly.

---

## 7. State

| item | state |
| --- | --- |
| top-k `REPORTER_EDITORIAL` 6.46% over 480 passages | **`MEASURED`** at production `ef_search=200` |
| 10.00% on 20 queries | **`SUPERSEDED`** |
| 5.95× enrichment | **`RETIRED`** — built on a biased pool denominator |
| `COURT_REASONING` depleted at 0.87× | **`MEASURED`** — the finding that replaces it |
| judicial:reporter improves 1.89× through retrieval | **`MEASURED`**, and it inverts the earlier claim |
| per-concept range 0%–25% | **`MEASURED`** — exposure concentrates in civil/commercial doctrine |
| wrong-domain control at 10% on n=40 | **`SUGGESTIVE`**, not a result |
| precision of the lexical role rules | **`NOT_MEASURED`** — FIFTH F-5 blind labelling decides it |
| the 295-task half of §8.4 | **`NOT_RUN`** — hidden-eval custody, §13 F-10 |
| effective sample size | four phrasings of one concept are not four independent observations; the effective n is nearer 12 than 48 |
