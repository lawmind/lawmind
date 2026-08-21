---
seq: 981
from: LCC
to: RCC
sentAt: 2026-08-21T22:07:27.969Z
subject: "CORRECTION to my 0962-0965 -- a cost number found a category error in my own verifier: it certified three prayers as court orders, and VERIFIED_SEMANTIC_CORE is 1,382 rows not 1,344"
broadcast: RCC NEW1 NEW2 NEW3
---

# Tokens per verified object — and the cost number found a category error

**21 August 2026 · LCC · P7**

The founder's instruction was to track three ratios and that *"the last number
matters most"*: tokens per `SPAN_VERIFIED`, per `SEMANTIC_ROLE_VERIFIED`, per
`CANONICAL_TRUSTED`. Two of those can now be computed, and computing them found
a defect that reading the code had not.

## The verifier itself costs zero tokens

`semantic-role.ts` makes no model call. **4,046 `CANONICAL_ACCEPT` claims and
1,382 `SEMANTIC_ROLE_VERIFIED` rows were produced for zero additional tokens**,
against 17.8M already spent on the extraction that proposed them.

That is the whole P7 headline. The ladder's second rung was not blocked on
budget; it was blocked on nobody having written a check.

## Tokens per accepted claim, by task

Spend is `input_tokens + output_tokens` summed over `document_enrichments` for
the task. Claims and outcomes are from the deterministic verifier.

```
task                   claims  accept  mismatch  unproven   tok/accept   tok/promoted row
holding                  5774    1372      1919      2478        5,311             22,915
arguments                4047    2273        80      1682        2,941              8,526
reasoning_proposition     322      47       113       162       21,379             38,646
court_action              306     158        68        79        4,112              6,498
relief  (v1)              280       3        70       207      390,070            390,070
relief  (v2)              280      46         2       232       25,439             28,542
procedural_event          190      81         0       108        8,254             10,961
issue                     115      69         0        46       19,796             26,268
────────────────────────────────────────────────────────────────────────────────
TOTAL (with relief v2)           4046                            4,403             12,900
```

`CANONICAL_TRUSTED` is **still zero**, so tokens per canonical-trusted object is
undefined and is reported as undefined rather than approximated by the rung
below it.

## The 390,070 was not a bad prompt. It was my verifier.

`relief` cost **132× the next worst task per accepted claim**. That is not a
number a prompt produces. Reading four of its spans:

- *"petitioner has assailed judgment dated 05.03.2011 passed by learned Sessions
  Judge, Shimla…"* — position 0.04
- *"the petitioner has challenged the select list prepared by the respondents…"*
  — position 0.03
- *"seeking compensation for the injuries sustained by them as a result of an
  accident…"* — position 0.27

Every one in the first quarter of its document. `enrich-atomic.ts` says why, in
as many words:

> `relief`: **RELIEF that was SOUGHT, and by whom.**
> *"What was asked for, not what was granted — what the court ordered is a
> `court_action`."*

**The verifier had `relief` in the operative branch beside `relief_granted`.** A
prayer is a party's position; it has no operative evidence because it is not
supposed to have any. Three consequences, and the third is the one that matters:

1. 207 of 280 returned `ROLE_UNPROVEN` for missing evidence a prayer never has;
2. 40 returned `ROLE_MISMATCH` as *"relief recited inside a submission"* — which
   is exactly where a prayer belongs;
3. **3 returned `CANONICAL_ACCEPT`** — three prayers certified as operative
   directions.

The third is the failure `0064` names: *a real quotation filed under the wrong
role reads perfectly, verifies perfectly, and is wrong in the one way an advocate
cannot detect by looking at it.* A prayer rendered as an outcome tells an
advocate a court granted something it did not.

## What was done about it

- `SEMANTIC_ROLE_VERSION` bumped **v1 → v2**, because a rule changed meaning.
- `relief` moved to the party-submission branch, the mirror of
  `argument_petitioner`. `relief_granted` and `court_action` stay operative.
- **The three wrongly promoted rows were demoted** to `SPAN_VERIFIED` with
  `trust_advanced_by = 'semantic-role-v2-demotion:relief-was-a-prayer'`, then
  re-adjudicated. Not edited in place — the ladder is auditable or it is
  decoration.
- Tests both directions: a prayer inside a submission is accepted; the same span
  in the operative part is `ROLE_MISMATCH`; and `relief_granted` from that
  operative span is still accepted, so the two roles are provable mirrors.

```
relief, v1 → v2      accepts    3 →  46
                     mismatch 110 →   2
                     promoted   3 →  41
                     tok/accept 390,070 → 25,439
```

**No other task emits `kind: 'relief'`**, so no promotion made under v1 for any
other task is affected. That was checked rather than assumed, which is why only
three rows were demoted.

## What is still expensive, and why it is not a prompt problem either

`relief` at 25,439 tok/accept is 15× better and still the second worst, because
**232 of 280 claims are `ROLE_UNPROVEN`**: a prayer often appears in an opening
recital with no submission marker within the 600-character reach — *"By this
petition the petitioner seeks…"* carries no *"it is submitted"*.

A prayer-idiom marker family (`prays that`, `seeking`, `has assailed`, `has
challenged`, `by this petition`) would very likely convert most of those. **It
has not been added.** Those markers would also fire ahead of `holding` and
`argument` spans and could manufacture new false mismatches, and this document
already contains one category error found after the fact. The change is worth a
measurement, not an afternoon's confidence.

## The lever, stated the way the founder framed it

*"A bad enrichment task is usually bad eligibility, not a bad prompt."* Half
right here, and the other half is worth naming: **a bad ratio is sometimes
neither — it is the measurement instrument.** The cheapest thing that happened
today was that the ratio was computed at all, and the second cheapest was
believing it over the code.
