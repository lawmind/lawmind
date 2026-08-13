# Treatment extraction — measured, and set against the published state of the art

**13 Aug 2026, LCC.** The first real measurement of LawMind's treatment layer,
with outside benchmarks to say whether the numbers are good, bad or ordinary.

---

## 1 · Why this needed outside numbers

The treatment graph is the citator: *followed*, *distinguished*, **overruled**.
It is the difference between "this case exists" and "this case is still good
law", and `CLAUDE.md` puts the stale-overruled threshold at **zero**.

Judged only against itself, an extraction pass always looks fine — it produces
rows, the rows read plausibly. So the question worth asking is *how hard is this
task actually*, and the literature answers it.

---

## 2 · WHAT THE PUBLISHED WORK SAYS

**Frontier models are not close to solved on this task.** Benchmarked on
multi-label precedent treatment classification (arXiv 2605.17691):

| | |
| --- | --- |
| Gemini 2.5 Flash, high-level schema | **79.1%** accuracy |
| GPT-5-mini, fine-grained schema | **67.7%** accuracy |

**And the incumbents are not a gold standard either.** Studies of the commercial
citators — Shepard's, Westlaw — find *"significant rates of error and
inconsistency, with services missing or mislabeling a substantial portion of
negative citation treatments"*. The thing we would be compared against is itself
unreliable on exactly the labels that matter most.

**The benchmark authors introduced an "Average Severity Error" metric** because
plain accuracy misleads here: mislabelling *overruled* as *cites* is
categorically worse than confusing *followed* with *applied*. That is the same
asymmetry `CLAUDE.md` encodes, arrived at independently.

---

## 3 · WHAT OURS MEASURES

Every claim carries a verbatim `evidence` span, and the span is located in the
source text before the claim is believed. So our number is a **grounding rate**,
not an accuracy rate — *"could this claim be traced to text the judgment
actually contains"*. It is a weaker claim than the benchmarks make and a
stronger guarantee than they offer.

Measured over 6,000 enrichment rows:

| relationship | grounded | rejected | rate | n |
| --- | --- | --- | --- | --- |
| `cites` | 3,886 | 664 | **85.4%** | 4,550 |
| `followed` | 120 | 40 | 75.0% | 160 |
| `applied` | 99 | 34 | 74.4% | 133 |
| `distinguished` | 89 | 19 | 82.4% | 108 |
| `explained` | 23 | 6 | 79.3% | 29 |
| `approved` | 10 | 2 | 83.3% | 12 |
| **`overruled`** | **9** | **2** | 81.8% | 11 |
| `not_followed` | 8 | 2 | 80.0% | 10 |
| `affirmed` | 5 | 5 | **50.0%** | 10 |
| `doubted` | 2 | 1 | 66.7% | 3 |
| `overruled_in_part` | 1 | 2 | **33.3%** | 3 |

**Document-level: 4,239 verified · 776 rejected · 396 unverified.**

### The 776 rejections are the system working

Each is a claim whose evidence span could not be found in the source. None
reached the graph. That is the whole safety property: hallucination becomes a
throughput cost rather than a correctness failure, because the string match —
not the model — decides what is believed.

### 446 flagged `quoted_or_argued`

Treatment language appearing **inside a quotation, or in a party's submission
the court did not accept**. This is the adversarial case the literature warns
about — *"the word 'overruled' appearing in a quoted historical passage"*, *"a
party claiming precedent was overruled where the bench rejects the claim"* — and
the prompt catches it as a distinct signal rather than silently scoring it as
treatment.

---

## 4 · THE FINDING THAT MATTERS: RARE LABELS ARE THE WEAK ONES

Grounding is **75–85% on the common labels and falls off a cliff on the rare
ones** — `overruled_in_part` at 33.3%, `affirmed` at 50.0%, `doubted` at 66.7%.

**n is 3, 10 and 3.** Those percentages are not yet rates; they are three coin
flips wearing a decimal point. But the direction matches the class-imbalance
problem the benchmark literature describes, and the rare labels are precisely
the ones with the highest cost of error.

**Consequence, and it is a refusal rather than a plan:** nothing from this layer
is promoted to `judgment_citations.relationship`. The production treatment graph
still carries its deterministic values only. Promotion needs per-label
measurement at a decision-capable n, and for `overruled` and `overruled_in_part`
that bar is higher than for the rest — the same reasoning that keeps
`overruled-resolve-cli` report-only over 34 rows.

---

## 5 · WHAT WOULD CHANGE THE VERDICT

Stated before the work, so it cannot be invented afterwards:

1. **n ≥ 200 per rare label**, not 3. Until then their rates are noise.
2. **A severity-weighted error measure**, following the benchmark's own
   reasoning: a false `overruled` is not one error, it is the error this product
   exists to prevent.
3. **An adversarial set** built from the `quoted_or_argued` population — the
   446 flagged rows are the natural seed, and they are the cases where a citator
   is most likely to be wrong in the direction that hurts.

---

## 6 · A CONCRETE MISATTRIBUTION, FOUND BY NEW3 — the defect class this layer has

**Bus 0172.** I asked NEW3 to spot-check the 446 `quoted_or_argued` rows against
outside sources, on the reasoning that they are where a citator is most likely
to be wrong in the direction that hurts. They found a real instance, not a
reassurance.

**HARIHARAN v. HARSH VARDHAN SINGH RAO (2022-12-14)**, evidence span *"the
decision in N.R. Parmar is overruled"*. The extractor recorded: **Hariharan
overruled N.R. Parmar.**

**That is wrong, and the span is real.** Multiple independent sources put the
overruling in **K. MEGHACHANDRA SINGH v. NINGAM SIRO (2019-11-19)**. Hariharan
is a 2022 judgment *discussing an overruling that had already happened three
years earlier*.

### The defect class, stated plainly

> **A judgment that REPORTS an overruling is recorded as having PERFORMED it.**

The evidence span passes verification because the sentence genuinely appears in
the document. Source grounding proves the words are there; it cannot tell you
*whose act they describe*. That is the ceiling on what the current verification
can guarantee, and it is worth being precise about rather than discovering later.

### Why this one is fixable without acquiring anything

**Both judgments are already in our corpus** — NEW3 checked the ids directly.
So the correct edge is expressible today; nothing needs to be bought, scraped or
licensed. What is missing is the *attribution step*, not the data.

### What it changes

- **Nothing is promoted, and this is now a second reason.** §4's rare-label
  grounding was the first; misattribution is a distinct failure that a better
  grounding rate would not fix.
- **The `quoted_or_argued` flag is doing real work.** It surfaced this row. Of
  466 flagged claims, 449 are `cites` (low stakes) and **17 are
  followed/applied/overruled/distinguished** — a tractable set for exactly this
  kind of external check.
- **A control exists too:** *WORLD SPORT GROUP v. MSM SATELLITE* (2014),
  `distinguished` on *N. Radhakrishnan*, externally confirmed correct. The flag
  is not simply marking everything suspect.

### The check that would catch it

**A date ordering test, deterministic and cheap:** an overruling judgment must
postdate the judgment it overrules, and where the corpus already holds a
*different* judgment that overrules the same target *earlier*, the later one is
reporting rather than performing. Both facts are queryable from
`judgment_citations` and `judgments.judgment_date` without a model.

**Not built.** It is written down here because the next person to look at
promoting treatment needs to know the trap exists before they decide the
grounding rate is good enough.
