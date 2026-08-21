# DOCUMENT-ROLE GOLD V2 — and the finding it produced about NEW2's own classifier

**Owner:** NEW2 · **21 Aug 2026** · **60 rows labelled from primary documents, on a
270-row stratified frame.**

---

## 1. Why the 87-row key had to be replaced as an evaluation set

`new2-heldout-key.json` drew UNIFORMLY from the documents the eligibility view
admits. That is right for estimating a rate and wrong for evaluating a
classifier, and the file says why in its own data:

```
stored class at key time:   null 80 · decided 4 · bail_order 3
```

**80 of 87 rows carried no class**, because the classifier had walked 1–2% of the
id space when the key was cut. `procedural_disposal` and `reference_stub` appear
zero times. LCC's pooled result — 90.6% on 64 scorable rows, ±7.3, with the
12.5% false-substantive figure resting on 40 procedural rows — cannot be tightened
by drawing more of the same.

**The 87-row key is not withdrawn.** It remains a valid rate estimate on the
population it drew from. V2 is the stratified evaluation set it could not be.

---

## 2. The frame

Six document classes × two length bands. Three cells are structurally empty and
the band estimate found them without being told: `decided` requires ≥1,500
characters by construction, `decided_brief` requires <1,500, and a
`reference_stub` is under 500.

```
decided:long                 pop~  1,087,656   drew 30
decided_brief:short          pop~    360,540   drew 30
procedural_disposal:short    pop~    376,925   drew 30
procedural_disposal:long     pop~    178,466   drew 30
bail_order:short             pop~     59,981   drew 30
bail_order:long              pop~    765,442   drew 30
reference_stub:short         pop~    183,466   drew 30
unclassified:short           pop~  4,736,173   drew 30
unclassified:long            pop~ 10,911,977   drew 30
                                              ─────
                                                270 questions
```

23 courts, unengineered: draws are over `judgments.id`, which is uuid v4 and
blind to court and year.

**Every row carries `stratumPopulationEstimated` and `inclusionProbability`.**
`reference_stub` is over-drawn about 55×. An accuracy computed on this file is
per class; a corpus figure needs re-weighting, and with those fields it is
arithmetic rather than judgement.

---

## 3. The finding: `decided` is 30% procedural

60 rows labelled so far, each from its own cause title and operative tail, each
carrying the sentence the verdict rests on.

```
decided:long   n=30      SUBSTANTIVE 14 · PROCEDURAL  9 · TEXT_UNSAFE 3 · UNCERTAIN 3 · IDENTITY_UNSAFE 1
procedural:long n=15     PROCEDURAL 14 · FALSE_PROCEDURAL 1
unclassified:long n=15   PROCEDURAL  5 · BAIL 4 · SUBSTANTIVE 3 · UNCERTAIN 2 · TEXT_UNSAFE 1
```

```
FALSE-SUBSTANTIVE in `decided`      9 / 30   30.0%   [13.6, 46.4]
  excluding unjudgeable rows        9 / 23   39.1%   [19.2, 59.1]
false-procedural in `procedural`    1 / 15    6.7%   [0.0, 19.4]
substantive share of `unclassified` 3 / 15   20.0%
```

**The asymmetry is five to one in the direction that admits non-law into an
authority set** — the same direction LCC measured at three to one on a model, and
larger, because this is the deterministic rule rather than the model.

### The nine, and what each actually is

```
transfer criminal petitions dismissed
applications about transfer between family courts dismissed
"the appeal is dismissed as withdrawn" — expressly without hearing the merits
"the writ petition is dismissed as withdrawn"
"dismissed for non-compliance of office objections" — a registry default
arbitrator consent sought; "List this matter on 07th May, 2026 for further orders"
interim protection plus a direction to decide a delay-condonation application
PIL not entertained because the authority is already seised of it
directs the authority to consider a representation on merit
```

### The mechanism, and it is a rule this repo already wrote down

`hc-classify.ts` reaches `decided` through `isMerits(disposal_nature)`.
`disposal_nature` is the REGISTRY's bookkeeping about a FILE — it says `ALLOWED`
or `DISMISSED` for a petition that was withdrawn, dismissed for non-compliance,
adjourned for further orders, or transferred to another court.

`docs/ops/new2/DOCUMENT_QUALITY_VOCABULARY.md` states the rule in terms:

> **no arrow runs from DISPOSITION to CITABILITY.**

`isMerits(disposal) -> decided` **is** that arrow. The vocabulary named the defect
before the classifier was measured against it; this is the measurement.

### What it costs

`decided` is 1,090,452 rows corpus-wide, and NEW1's Tier A takes 570,452 of them
in the value bands. At 30%:

```
~327,000 documents corpus-wide are `decided` and are not authorities
~171,000 of them are inside Tier A and will be embedded as authorities
```

For scale, that is larger than the 13.2% reachability ceiling NEW1 and LCC have
been trading, and it points the other way — not law we cannot reach, but non-law
we are about to index as law.

**It is not fixed here.** A fix means reading the TEXT for the operative act
rather than the disposal string, and that is a rule change with its own precision
to measure. What this file establishes is the size and the mechanism.

---

## 4. Three findings that are not about classification

**The tail is a service list in Madras and Telangana.** Five of the sixty rows are
`UNCERTAIN` and three of those are uncertain only because the last 1,800
characters are the addressee block and the certified-copy footer. Any method that
reads a tail for the operative direction silently gets a footer in those courts —
mine here, and any verifier's window.

**`text-damage-v2.0`'s recall is not 100%, and here is the evidence.** Four rows
are unusable and three were caught. The misses are a third damage mode:
**letter-spacing destruction** — `"g g k m x C y M g k mm g 45 C y m y x k g m"` —
which carries no control characters and no long letter runs, so the VERIFIED class
cannot see it and only the SUSPECT screens fire. Two more rows in the core audit
carried OCR noise and a triplicated header. **This is exactly why the detector's
states are `TEXT_UNSAFE_VERIFIED` and `UNKNOWN`, and why it never says CLEAN.**

**One row is one document covering many registered cases**, and another names a
review petition that was *not pressed* while the document's reasoning belongs to
its companion. Identity is not one-document-one-decision in either direction.

---

## 5. What this is not

- **60 labelled of 270.** The remaining six cells are drawn and unlabelled. The
  intervals above are wide and stated; `decided` at 30% has a lower bound of 13.6%.
- **One labeller, no model.** The same objection LCC raised about their own
  adjudication applies here. What this has instead is a quoted sentence per row.
- **Not a corpus rate.** Re-weight by `stratumPopulationEstimated` first.
- **`BAIL` is not `PROCEDURAL`.** Judges cite bail orders; 12 of NEW3's 250
  verified gold authorities are bail orders. Reported separately on purpose.
