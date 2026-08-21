# VERIFIED_CORE_V1 — 128 documents, and every clause's cost is shown

**21 August 2026 · LCC**

`VERIFIED_SEMANTIC_CORE` was **0** this morning. It is not zero any more, and the
number is small on purpose: this is a precision-first definition over the only
population that has ever been enriched, not a projection over 18.7M documents.

```
SEMANTIC_ROLE_VERIFIED rows      1,382   (of 30,007 SPAN_VERIFIED)
CANONICAL_ACCEPT claims          4,046   (of 11,034 adjudicated)
VERIFIED_CORE_V1 documents         128
```

**Restated after `semantic-role` v2.** The first version of this page said 1,344
/ 4,003 / 125. `relief` was being adjudicated as an OUTCOME and it is a prayer —
`TOKENS_PER_VERIFIED_OBJECT.md` has the whole correction, including the three
prayers that were certified as court orders and have since been demoted and
re-adjudicated. The numbers below are re-measured from
`document_enrichments.parsed_output.roleVerification` in the live database rather
than from the JSONL artefact, because the artefact is what went stale.

## The definition

A document is in `VERIFIED_CORE_V1` when **all five** hold:

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
VERIFIED_CORE_V1 documents, by the eligibility view's semantic_tier
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
| document (`VERIFIED_CORE_V1`) | 6 | 6 | 100% | [61.0%, 100%] |

**Both were sampled under v1 and neither included a `relief` claim**, so the
v2 correction does not invalidate them — but it does show that a 24-claim read is
not a substitute for a cost measurement. The category error that read-through
missed was found by a ratio.

The document-level interval is wide enough to be nearly uninformative and is
reported anyway, because six documents read is what was done and six is not
sixty. `ACCEPT_PRECISION_ADJUDICATION.md` names both claim-level failures
individually.

**NEW2's held-out method is the independent check and has been asked for.** A
verifier graded by its own author is a candidate measurement, not a held-out one,
and this document should not be quoted as if it were.

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
