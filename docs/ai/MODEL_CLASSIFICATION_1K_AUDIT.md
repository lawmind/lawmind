# MODEL CLASSIFICATION — THE 1K RUNG, AND WHY THE LADDER STOPS HERE

**20 August 2026 · LCC · DeepSeek V4 Flash (`deepseek-v4-flash-0731`) via InferX**

The directive's ladder was `1k → audit → 10k → audit → 50k → audit`, "remaining
only if precision supports it". The 1k rung ran and the audit says **precision
does not support it in this form.** The recommendation is not more volume; it is
a different method at the same volume.

---

## 1 · WHAT RAN

`hc-adjudicate-cli.ts --manifest new2-model-classification-manifest.jsonl
--limit 1000 --persist`

The manifest is NEW2's enumeration (bus 0850) of the **190,102 rows the frozen
deterministic screen cannot call either way** — the near-ties. Rows the screen
*can* call are excluded on purpose: paying a capacity-limited free tier to
re-derive a verdict a two-marker margin already reached buys nothing.

Nothing was written to `judgments`. Candidates land in `hc_class_candidate`
(migration 0064), whose CHECK refuses a `promoted_at` without
`CANONICAL_TRUSTED`. Zero rows are promoted.

## 2 · THE HEADLINE NUMBERS, n = 1,000

```
verified               773    77.3%
span_not_found         169    16.9%   <- quoted words the document does not contain
cannot_determine        48     4.8%
span_too_short           5     0.5%
unparseable              5     0.5%
```

Class distribution among the 773 span-verified:

```
procedural_disposal    541    70.0%
decided                121    15.7%
bail_order              61     7.9%
reference_stub          31     4.0%
decided_brief           19     2.5%
```

**16.9% fabrication.** Roughly one call in six quotes words the document does not
contain. `adjudicate()` discards the class whenever the span fails, so none of
those became a classification — but it is the rate at which this model invents
supporting text when asked for it, and it is the reason nothing here may
auto-promote.

**70% procedural.** On the near-ties the model reads the residue as
overwhelmingly procedural. NEW2 stated that their screen **leans `decided`** and
that the 662,884 it excluded are therefore an **upper bound** on substantive
content. This measurement is consistent with that and sharpens it: where the
screen cannot decide, the answer is mostly *not a decision*.

## 3 · THE FINDING THAT STOPS THE LADDER — n = 300

300 documents from the 1,000 were adjudicated a **second time**, independently,
same model, same prompt, same window.

```
identical CLASS                       243 / 300   81.0%   [76.2, 85.0]
identical span VERDICT                257 / 300   85.7%   [81.2, 89.2]
both runs span-verified               218 / 300
   ...and agreeing on the class       191 / 218   87.6%   [82.6, 91.3]
```

Wilson 95% intervals. An earlier n=40 pass gave 82.5%, so the figure is stable
across two sample sizes.

### Three things follow, and the third is the one that matters

**Self-agreement bounds achievable precision.** A verdict the model will not
reproduce cannot be more accurate than it is stable. **81.0% is a ceiling**, and
any single-run precision claim materially above it would be measuring noise
rather than the model.

**Span verification does not stabilise the class.** Restricting to documents
where *both* runs produced a verified span, class agreement only rises from 81.0%
to 87.6% — and 27 of those 218 pairs are two verified quotations supporting two
*different* classes. This is `MODEL_PROPOSED → SPAN_VERIFIED →
SEMANTIC_ROLE_VERIFIED` (migration 0064) demonstrated rather than argued: a real
span proves the words are in the document and proves nothing about the role
assigned to them.

**The flips land on the boundary that decides Tier A.**

```
  6   decided -> procedural_disposal
  6   procedural_disposal -> decided
```

Symmetric, both directions, on the one distinction that determines whether a
document enters the semantic core. Twelve documents in 300 — **4%** — crossed it
between two runs of the same model on the same text. The next-largest group,
`procedural_disposal -> (none)` at 11, is a refusal rather than a
misclassification and is the harmless direction.

## 4 · THE EVIDENCE ITSELF READS WELL — AND THAT IS NOT THE SAME THING

Eight `procedural_disposal` candidates were read against their spans:

- petition filed prematurely, court declines to entertain
- disposed in terms of consent terms
- disposed directing the respondent to consider an application
- time extended to execute sureties
- audit report accepted under s. 462, application disposed
- application infructuous on counsel's own submission
- disposed at the admission stage

**Eight of eight are correctly procedural on my reading.** The model is not
guessing wildly; where it commits, it commits sensibly.

But one span was `"This original petition is disposed of as above."` That
verifies trivially, appears in thousands of documents, and **supports no class on
its own** — the reasoning did the work, and the reasoning is unverified prose.

Measured across all 773 verified spans:

```
mean length                                     133 chars
median                                          112 chars
under 60 characters                             135    17.5%
pure disposal boilerplate, no case content       38     4.9%
```

So the span check confirms a quotation is **present**. It cannot confirm it is
**discriminative**, and ~5% provably are not. That is a concrete, nameable
requirement for the `SEMANTIC_ROLE_VERIFIED` stage rather than a vague one.

## 5 · RECOMMENDATION — CHANGE THE METHOD, NOT THE VOLUME

**Do not run the 10k rung as a single pass.** It would produce 10,000 verdicts of
which roughly 1,900 would not survive a re-run, distributed across exactly the
boundary that matters, and no downstream consumer could tell which 1,900.

Instead, at the same or lower spend:

1. **Two independent runs, and require agreement.** Documents where the two runs
   agree AND both spans verify are the only ones worth carrying forward — about
   64% of documents (0.727 both-verified × 0.876 agreeing) at 2× the per-document
   cost. Same money buys half the population with a stability guarantee instead
   of twice the population without one.
2. **Disagreement is `UNCERTAIN`, and it stays there.** Not a tie-break, not a
   third run, not the higher-confidence answer. The directive is explicit that
   UNCERTAIN remains UNCERTAIN, and a model's `stated_confidence` is a token
   distribution rather than a calibrated probability — `hc_class_candidate`
   records it and nothing acts on it.
3. **Require a discriminative span, not merely a present one.** Reject spans
   under 60 characters and spans that are pure disposal boilerplate. On this
   sample that is ~17.5% and ~4.9% of verified spans respectively.
4. **Do not force 100% classification.** The directive says so and the data
   agrees: at 81% self-agreement, the marginal document is one the model will
   answer differently tomorrow.

## 6 · WHAT THIS DOES NOT SHOW

- **No accuracy measurement against ground truth.** Everything here is
  self-agreement, span presence and one reader's spot-check of eight documents.
  Self-consistency bounds accuracy from above; it does not establish it. A
  human-labelled sample is still owed and nothing in this file substitutes for
  one.
- **The 8/8 evidence audit is a single annotator, unblinded, on a
  non-random draw** (`ORDER BY random()` over `procedural_disposal` only). It
  says the class is not obviously broken. It is not a precision estimate.
- **Only `procedural_disposal` evidence was read.** `decided` — the class that
  actually admits documents to Tier A, and the one with the higher error cost —
  was not audited here.
- **The manifest is a frozen snapshot and the corpus is not.** Rows whose
  `hc_class_method` changed since enumeration are refused by the gate at fetch
  time rather than adjudicated on a stale premise, but the population itself
  ages.
- **Second runs were not persisted.** `--persist` was omitted on the
  reproducibility pass, so `hc_class_candidate` holds the first answer for every
  document. The disagreement measurement lives in the JSONL artifacts, not in the
  table.

---

# ADDENDUM — 21 August 2026: the accuracy measurement §6 said was owed

§6 stated plainly that nothing above bounds accuracy against ground truth. NEW2
supplied the ground truth (bus 0918): **45 documents drawn uniformly from what
the eligibility view ADMITS**, adjudicated by hand from the operative text,
**with the key written before any model output existed** and zero overlap with
the 1,000.

## The first attempt measured nothing, and that is worth recording

Run through the normal path, the report read `span-verified 0.0%, fabrication
100.0%`. It was **n = 1**.

`selectsForModel` admits only rows a deterministic rule looked at and declined.
The held-out set is drawn from ADMITTED documents, and an admitted document
usually already carries a class from a rule — so **44 of 45 were correctly
refused by the gate**. The gate did its job; the experiment was the wrong shape
for it.

A `--ignore-gate` flag now makes this a deliberate, separate mode. **It refuses
`--persist` outright**: these rows already have a deterministic verdict, and
storing a model candidate beside one invites a later promotion sweep to overwrite
a rule with a model. Deterministic-first is the architecture, not a preference.

## The result, on the population that matters

```
matched documents                                45
key verdict UNCERTAIN — unscorable by the key's own rule    9
model abstained on a scorable row                 3
SCORABLE                                         33
CORRECT                                          29    87.9%   [72.7, 95.2]
```

Confusion, key → model:

```
  17   NON_SUBSTANTIVE_PROCEDURAL  ->  NON_SUBSTANTIVE_PROCEDURAL
  12   HIGH_CONFIDENCE_SUBSTANTIVE ->  HIGH_CONFIDENCE_SUBSTANTIVE
   3   NON_SUBSTANTIVE_PROCEDURAL  ->  HIGH_CONFIDENCE_SUBSTANTIVE   <- the costly direction
   2   NON_SUBSTANTIVE_PROCEDURAL  ->  ABSTAIN
   1   HIGH_CONFIDENCE_SUBSTANTIVE ->  NON_SUBSTANTIVE_PROCEDURAL
   1   HIGH_CONFIDENCE_SUBSTANTIVE ->  ABSTAIN
```

Span verification also runs better here than on the near-ties: **86.7% verified,
13.3% span-not-found**, against 77.3% and 16.9%.

### The two error directions are not equally expensive

**3 of 20 scored procedural documents were called substantive — a 15%
false-substantive rate.** That is the direction that admits non-law into an
authority set, and it is the one that matters. The reverse (1 substantive called
procedural) loses a real authority, which is recoverable by other routes.

`UNCERTAIN` rows were excluded rather than scored, per the key's own rule that
*"UNCERTAIN is a verdict, not an abstention"*. Of the 9, the model called 5
procedural, 1 substantive, and abstained on 3.

## What this does and does not change

**It does not reopen the ladder.** 87.9% on admitted documents and 81.0%
self-agreement on near-ties are not in tension — they are two populations, and
the near-ties are hard by construction. The reason for halting was never the
absolute accuracy; it was that **a single-run verdict is not reproducible on the
population the ladder would actually process**, and nothing here touches that.

**It does raise the value of screening before spending.** NEW2's 0918 shows
16.3% of the 1,000 were documents whose extracted text is not language in any
script — 59.2% of all `span_not_found` and 70.4% of `no_evidence_offered`. So the
16.9% headline is materially a **corpus-damage** figure rather than a fabrication
one, and 25 of the 773 "verified" spans verified **inside glyph garbage**, which
reads as evidence while carrying none. Screening for a readable document before
the call recovers that spend and removes a class of false verification.

## Caveats, and they are load-bearing at this n

- **33 scorable documents.** The interval is [72.7, 95.2] and the point estimate
  should never be quoted without it.
- **Single annotator, unblinded to the corpus though blind to the model.** The
  key was written first, which removes the worst bias and not all of them.
- **The class mapping is mine, not the key's.** `decided` was scored as
  substantive and `bail_order` / `procedural_disposal` / `reference_stub` /
  `decided_brief` as non-substantive, following NEW2's own adjudication which
  counts bail among the non-substantive half. A different mapping gives a
  different number.
- **Nothing was persisted.** `--ignore-gate` cannot write, so
  `hc_class_candidate` is unchanged at 1,000 rows, none promoted.


---

# ADDENDUM 2 — 21 August 2026: the pooled key, and the number that belongs on the front page

NEW2 doubled the ground truth (bus 0926) — **87 rows, not 45** — because a
33-row scorable set gave a ±11-point interval, "wider than the decisions it
informs". 42 new documents from the same uniform draw under contract v2,
adjudicated the same way, with **unreadable documents now excluded from the
draw** because a key row nobody can read is a key row nobody can score.

The same prompt ran the 42 new ids.

```
matched                                     87
key verdict UNCERTAIN, unscorable           17
model abstained on a scorable row            6
SCORABLE                                    64
CORRECT                                     58    90.6%   [81.0, 95.6]
```

The interval narrowed from ±11 points to ±7.3, and the point estimate rose from
87.9% to 90.6%.

## The asymmetry, which NEW2 is right to call the front-page number

```
FALSE-SUBSTANTIVE   procedural called substantive   5 / 40   12.5%   [5.5, 26.1]
false-procedural    substantive called procedural   1 / 24    4.2%   [0.7, 20.2]
```

**A procedural document is about three times more likely to be called substantive
than the reverse.** That is the direction that admits non-law into an authority
set, and it does not cancel against the other one — losing a real authority is
recoverable through other routes, and admitting a non-decision as precedent is
not.

Confusion, key → model:

```
  35   NON_SUBSTANTIVE_PROCEDURAL  ->  NON_SUBSTANTIVE_PROCEDURAL
  23   HIGH_CONFIDENCE_SUBSTANTIVE ->  HIGH_CONFIDENCE_SUBSTANTIVE
   5   NON_SUBSTANTIVE_PROCEDURAL  ->  HIGH_CONFIDENCE_SUBSTANTIVE
   4   NON_SUBSTANTIVE_PROCEDURAL  ->  ABSTAIN
   2   HIGH_CONFIDENCE_SUBSTANTIVE ->  ABSTAIN
   1   HIGH_CONFIDENCE_SUBSTANTIVE ->  NON_SUBSTANTIVE_PROCEDURAL
```

Span verification on the 42 new rows: **88.1% verified, 4.8% span-not-found**,
against 16.9% on the near-ties. Two `call_failed`. The gap between 4.8% and 16.9%
is the clearest confirmation yet of NEW2's 0918 point — the near-tie manifest is
**enriched for unreadable documents**, because a document with no readable text
gives a rule nothing to be confident about.

## Still does not reopen the ladder

90.6% on admitted documents and 81.0% self-agreement on near-ties remain two
populations. The halt was never about absolute accuracy on easy rows; it is that
a single-run verdict is **not reproducible** on the population the ladder would
process. Nothing here touches that, and the 12.5% false-substantive rate is a
second, independent reason not to auto-promote.

## Caveats

- 64 scorable. Still small, and the false-substantive rate's own interval is
  [5.5, 26.1] — wide enough that "about one in eight" is the honest phrasing.
- `bail_order` is scored non-substantive here, following NEW2's adjudication of
  *"is this a reasoned adjudication of a lis"*. **That is not a reopening of
  migration 0066** — their vocabulary maps `bail_order` to `citable_with_care`,
  never `not_citable`. Usable, not precedent, reachable. Three different
  questions.
- Nothing was persisted: `--ignore-gate` cannot write, and
  `hc_class_candidate` is unchanged at 1,000 rows with none promoted.
