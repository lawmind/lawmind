# ROLE_VERIFIED_SET_V1 — 128 documents, and about a quarter of them are not authorities

> **RENAMED 21 Aug 2026, after an independent audit refuted the old name.**
> This was `VERIFIED_CORE_V1`. NEW2 audited it blind (bus 0985,
> `docs/ops/new2/VERIFIED_CORE_V1_INDEPENDENT_AUDIT.md`) and found **27.5%
> [13.7, 41.3] are not substantive authorities**. The definition below is
> unchanged and still defensible. The word "core" was not: it invited every
> downstream lane to read this as a clean authority set, and it is not one.
>
> **Do not consume this as an authority set.** It is a set of documents whose
> extracted spans have passed a role check. That is all it has ever been, and the
> name now says so.

**21 August 2026 · LCC**

`VERIFIED_SEMANTIC_CORE` was **0** this morning. It is not zero any more, and the
number is small on purpose: this is a precision-first definition over the only
population that has ever been enriched, not a projection over 18.7M documents.

```
SEMANTIC_ROLE_VERIFIED rows      1,382   (of 30,007 SPAN_VERIFIED)
CANONICAL_ACCEPT claims          4,046   (of 11,034 adjudicated)
ROLE_VERIFIED_SET_V1 documents     128
```

**Restated after `semantic-role` v2.** The first version of this page said 1,344
/ 4,003 / 125. `relief` was being adjudicated as an OUTCOME and it is a prayer —
`TOKENS_PER_VERIFIED_OBJECT.md` has the whole correction, including the three
prayers that were certified as court orders and have since been demoted and
re-adjudicated. The numbers below are re-measured from
`document_enrichments.parsed_output.roleVerification` in the live database rather
than from the JSONL artefact, because the artefact is what went stale.

## The independent audit, and the number it produced

NEW2 read only `role-verified-set-v1-ids.txt`. `role-claims.jsonl`,
`ACCEPT_PRECISION_ADJUDICATION.md` and this page's per-document material stayed
closed until their verdicts were on disk. 40 of the set, drawn by
`sha256('new2-core-audit-v1:' + id)` order so the sample could not be re-rolled
until it agreed with somebody, and every verdict carries the sentence it rests on.

```
SUBSTANTIVE       18   45.0%
PROCEDURAL        11   27.5%   <- false-substantive
BAIL               4   10.0%
IDENTITY_UNSAFE    3    7.5%
UNCERTAIN          4   10.0%

false-substantive   11 / 40   27.5%   [13.7, 41.3]
excluding UNCERTAIN 11 / 36   30.6%   [15.5, 45.6]
```

The founder's standard for this work is that false-substantive rates of 12–15%
are unacceptable. **The lower bound of the interval is 13.7%**, so no favourable
reading of this sample clears the bar.

The eleven are transfer petitions, chamber summonses, vehicle-release directions,
interlocutory refusals, and orders directing an authority merely **to consider**
an application. One settles it in its own words — Himachal Pradesh
`CMPMO/158/2012`:

> *"This order does not pronounce on the finality of the rights of the parties
> and is confined solely to these proceedings."*

**It does not refute the verifier**, and NEW2 says so explicitly. Nine of their
eleven carry a correctly verified court-authored span AND are transfer orders.
`SEMANTIC_ROLE_VERIFIED` never claimed to identify a ratio. The finding is about
the SET and its name, not about the mechanism.

## The proposed one-clause fix does not work, and the measurement says why

NEW2's recommendation was to require a document role before admitting to a core:
*"Nine of the eleven are shapes `hc_document_class` already names."*

Measured against the whole set rather than the sample:

```
ROLE_VERIFIED_SET_V1 by hc_document_class
  decided               90
  NULL                  19
  bail_order            17
  procedural_disposal    2
```

**Only 2 of 128 are labelled `procedural_disposal`, 1.6%.** If 27.5% of the set
is procedural in substance, `hc_document_class` is not naming them — it is
calling them `decided`.

And it cannot do otherwise. Every one of the **1,128,830** rows labelled
`decided` was labelled by a single rule, `disposal_nature_merits`, which reads a
DISPOSAL STRING. `quality-state.ts` states the governing rule in as many words:

> *"**no arrow runs from DISPOSITION to CITABILITY.** `DISMISSED`, `DISPOSED`
> and `CLOSED` are registry bookkeeping about a FILE. A dismissal after a full
> hearing is precedent and a dismissal for non-prosecution is not, and both write
> the same string."*

A transfer petition allowed on its merits is `disposal_nature_merits` →
`decided`, exactly like a Constitution Bench judgment. **The proposed clause is
refuted by NEW2's own vocabulary rule**, and adding it would have removed 21 of
128 documents while leaving the failure it was meant to fix.

*(Caveat on the eleven specifically: reproducing their frame yields 128 ids where
they audited 125, so index-to-id alignment is not guaranteed and the per-row
check is not claimed. The whole-set tally above needs no alignment and is what
the argument rests on.)*

## What the real discriminator would have to be

Every one of NEW2's eleven is identifiable from its OPERATIVE span, not from its
class: *"no further specific directions are necessary"*, *"at this stage"*,
*"with these observations"*, *"to consider"*, *"does not pronounce on the
finality of the rights"*. That is a judgement about whether an order DETERMINES
anything or merely directs or defers.

**It has not been built.** It is a semantic distinction of exactly the kind this
ladder refuses to guess at, and one category error has already been found in this
verifier today (`relief` was a prayer). The honest state is: the discriminator is
identified, unbuilt, and named here so nobody assumes it exists.

## The definition

A document is in `ROLE_VERIFIED_SET_V1` when **all five** hold:

1. `axis_a_identity` — content hash, case number, judgment date, court, and a
   case title longer than three characters. Identity integrity, taken from the
   deployed eligibility view rather than re-derived.
2. `text_safety <> 'UNSAFE_VERIFIED'` — no screen has positively proved the text
   is not language. *(Not "the text is proven good" — see the exclusions.)*
3. At least one `CANONICAL_ACCEPT` claim in a **court-authored role**:
   `holding` · `reasoning` · `reasoning_proposition` · `proposition`.
4. At least one `CANONICAL_ACCEPT` claim in an **outcome role**:
   `relief_granted` · `court_action`.

   **`relief` is not on that list any more.** It is RELIEF SOUGHT — a prayer —
   and admitting it as an outcome is how three prayers were briefly certified as
   court orders.
5. **Zero `ROLE_MISMATCH` claims anywhere on the document.** One contradicted
   claim disqualifies the whole document — a file where the extractor put a
   party's contention in the court's mouth once is not a file to trust the rest
   of.

## The funnel — what each clause actually costs

```
documents with any adjudicated claim        1,707
  identity sound                            1,707    −0
  text not proven damaged                   1,702    −5
  has a court-authored ACCEPT                 285  −1,417
  + has an outcome ACCEPT                     252    −33
  + no ROLE_MISMATCH anywhere                 128   −124
```

**The −1,417 is the honest headline, and it is not a quality finding.** Most
enriched documents carry exactly one task row, so a document whose only
enrichment is `arguments` or `metadata` can never produce a court-authored
accept. The clause is doing what it says; the population simply has not been
enriched for it. That is a backlog, not a defect.

The −124 at the last step is the real purity cost: **half the documents that
reach the final clause are dropped by a single contradicted claim.**

## Two things called "verified core" that share no rows

```
ROLE_VERIFIED_SET_V1 documents, by the eligibility view's semantic_tier
  BROAD_SEARCHABLE          109
  BAIL_ORDER_REACHABLE       17
  UNRESOLVED_EXPERIMENTAL     2
  VERIFIED_SEMANTIC_CORE      0
```

**Not one of the 128 sits in the view's `VERIFIED_SEMANTIC_CORE` tier**, and that
is not a contradiction — the two names measure different things and neither is a
subset of the other:

- the **view's tier** requires `hc_document_class = 'decided'` AND a positively
  screened `script_quality`, which almost nothing has;
- **this core** requires verified court-authored role claims, and every one of
  its 128 documents is `text_safety = UNKNOWN`.

Two identically-named states with an empty intersection is a naming problem
waiting to mislead someone, and it is written down here rather than left for a
consumer to discover in a join. A consumer must say WHICH verified core it means.

**17 of the 128 are `BAIL_ORDER_REACHABLE`** — bail orders carrying a verified
court-authored holding and a verified outcome. Migration `0066` made those
reachable on NEW1's gold measurement, and this is the same conclusion reached
from the other end.

## Precision

Two adjudications, both by reading, both by one adjudicator who wrote the
verifier — stated plainly rather than dressed up.

| level | sampled | correct | rate | Wilson 95% CI |
|---|---|---|---|---|
| claim (`CANONICAL_ACCEPT`) | 24 | 22 | 91.7% | [74.2%, 97.7%] |
| document (`ROLE_VERIFIED_SET_V1`) | 6 | 6 | 100% | [61.0%, 100%] |

**Both were sampled under v1 and neither included a `relief` claim**, so the
v2 correction does not invalidate them — but it does show that a 24-claim read is
not a substitute for a cost measurement. The category error that read-through
missed was found by a ratio.

The document-level interval is wide enough to be nearly uninformative and is
reported anyway, because six documents read is what was done and six is not
sixty. `ACCEPT_PRECISION_ADJUDICATION.md` names both claim-level failures
individually.

**NEW2's independent audit arrived and is above.** My 6-of-6 document read and
their 18-of-40 substantive are not in conflict: I was grading whether the ROLE
CHECK was right, they were grading whether the DOCUMENT is an authority. Both
answers are true and only theirs is the one a consumer needs. A verifier graded
by its own author measures the mechanism; it cannot measure the set.

## Known exclusions — what is deliberately NOT in here

- **Everything unenriched.** 18.7M documents have no claims at all. This core is
  drawn from 1,707 adjudicated documents, which is 0.009% of the corpus.
- **Documents with one contradicted claim**, 124 of them, even where their other
  claims were accepted. Recoverable at claim level; excluded at document level.
- **`ROLE_UNPROVEN` claims — 4,787 of 11,034, 43.4%.** Unproven is not
  refused, it is *not yet decided*: the verifier had no marker within reach. Most
  of this is recoverable by better structural evidence, not by a looser rule.
- **`text_quality`.** It is still inside `axis_b_text` and it is still invalid —
  NEW2 measured 1,141 of 1,141 known-unreadable rows above the 0.85 floor with a
  median of 1.000. Nothing in this definition leans on it, and removing it from
  the contract is NEW2's axis-B v2, not this document's business.

## The unknown population, named rather than folded in

- `text_safety = 'UNKNOWN'` for **all 128** core documents. Not one is
  `SCREENED_OK`, because nothing in this pipeline can prove text is faithful —
  only a second extraction or the PDF's own font dictionary can, and neither has
  run on these. **The core is built on "not proven damaged", never on "proven
  good", and that distinction is load-bearing.**
- 4,787 `ROLE_UNPROVEN` claims are neither evidence for nor against their labels.
- The ratio decidendi of any of these 128 judgments is **unknown**. Nothing here
  identifies a ratio; `SEMANTIC_ROLE_VERIFIED` means the span is in the voice the
  role requires, is in readable text, and is not lifted from a quotation.

## Value bands

```
standard     50
substantial  39
full         39
```

No `brief` or `stub`: the 2,000-character floor is upstream of enrichment, so
this core inherits that exclusion rather than making one.

## Reproducing it

```
pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
  src/semantic-role-cli.ts --confirm          # writes trust_state + per-claim verdicts
node --env-file=.env .scratch/lcc/core-v1.mjs # measures the funnel
```

Per-claim verdicts live on each row as `parsed_output.roleVerification` —
additive, never overwriting `claims` — and **that is the source to read**. The
JSONL artefacts are a per-RUN record: `role-claims.jsonl` is the v1 pass and
`role-claims-relief-v2.jsonl` is the correction, so a reader of the first file
alone would still be scoring 280 relief claims under the rule that certified
three prayers as court orders. The row is what the re-run fixed.


## Three findings NEW2 returned that are not about this set

**Service-list tails.** Madras and Telangana orders end with the addressee block
and the certified-copy footer, so the last 1,800 characters contain no operative
text. Any method that reads a tail to find a direction gets a footer in those
courts. `semantic-role.ts` has one such rule — the `relativePosition > 0.9`
fallback for an outcome — and it is bounded only because it ALSO requires a
disposal verb inside the span itself. Worth re-reading if that conjunction is ever
loosened.

**One row, many decisions — the inverse of the identity problem.** Three of
NEW2's forty are a single document covering many registered cases:

```
Bombay    EXA/1367/2025    "SERIAL NOS. 901 TO 1086 AND 1090, 1094 AND 1097 TO 1156"
Gujarat   SCA/7364/2003    Special Civil Applications 7202 to 7456 of 2003
Telangana TRCMP/572/2015   23 Transfer CMPs in one common order
```

`DECISION_IDENTITY_V1` found 336,209 CNRs carried by more than one row. This is
the same model failing in the other direction, at 7.5% of a 40-row draw, and it
is why `CAPTION_WEAK` is never promotable.

**The damage screen's recall is not 100% and this is the evidence.** Two of the
forty carry visible extraction damage that the screen calls `UNKNOWN` — OCR noise
(`"Divisian Benc"`) and a header the extractor triplicated. Neither is a glyph
dump. Nothing is broken: the screen's states are `UNSAFE_VERIFIED` and `UNKNOWN`
and it never says CLEAN, which is precisely so that "not proven damaged" cannot be
read as "text fine". These two are what that gap costs.
