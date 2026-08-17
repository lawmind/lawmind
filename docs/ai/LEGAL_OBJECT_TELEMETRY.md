# Legal-object telemetry — what is already recorded, and what it says

LCC, 17 August 2026.

## Why this file is short

The CX1 handoff addendum §E asks LCC to "start recording sufficient metrics" for
tokens per document, tokens per accepted object, accept/reject rate,
span-verification failure, and task/document-class combinations with poor yield —
and explicitly says **not** to build an analytics detour.

No detour is needed. **Every one of those metrics is already computable from
columns that exist today.** This file records that it was checked by computing
them, not asserted, and records the two things the computation showed.

| addendum §E metric | source, today |
| --- | --- |
| tokens per document | `document_enrichments.input_tokens + output_tokens`, grouped by `judgment_id` |
| tokens per accepted object | those, over `sum(verified_count)` |
| accept / reject rate | `verified_count` over `verified_count + rejected_count` |
| span-verification failure | `verification_state` + `rejection_reasons` (jsonb) |
| task × document-class yield | join `judgments.hc_document_class` on `judgment_id` |

The only one not on the table itself is document class, and it is one join away.
`llm_calls` separately carries `cost_usd`, `latency_ms`, `data_class` and
`pseudonymised` for the money and routing view.

## Measured, 17 Aug 2026, live database

Groups with more than 5 runs, worst token efficiency first.

| task | doc class | runs | tokens | accepted | rejected | accept % | tokens/accepted |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `citation_extraction` | `bail_order` | 34 | 37,152 | 0 | 0 | — | — |
| `citation_extraction` | (none) | 6 | 6,565 | 0 | 0 | — | — |
| `authorities` | `decided` | 166 | 915,003 | 483 | 97 | 83.3 | 1,894 |
| `treatment` | (none) | 7,920 | 7,393,435 | 5,711 | 1,028 | 84.7 | 1,295 |
| `arguments` | `decided` | 100 | 616,201 | 503 | 140 | 78.2 | 1,225 |
| `metadata` | `decided` | 963 | 1,461,922 | 1,244 | 17 | 98.7 | 1,175 |
| `holding` | `decided` | 118 | 776,891 | 787 | 165 | 82.7 | 987 |
| `case_structure` | `decided` | 103 | 679,144 | 1,056 | 233 | 81.9 | 643 |
| `metadata` | `bail_order` | 695 | 433,657 | 706 | 4 | 99.4 | 614 |
| `metadata` | (none) | 16,641 | 16,145,082 | 36,411 | 54 | 99.9 | 443 |

### CX1's offline triage matches the live database exactly

`docs/ai/CX1_LEGAL_OBJECT_EFFICIENCY.md` was built from triage JSON with no
database connection. Its `authorities` row reads **483 verified / 97 rejected /
83.3%**. The live query above returns **483 / 97 / 83.3%**. `case_structure`
(1,056 / 233 / 81.9%) matches too.

That is the "verify before trusting" step from the handoff addendum, and it
passed. CX1's offline numbers can be used without re-deriving them.

### `citation_extraction` returns nothing, and that is CORRECT

42 runs, 45,973 tokens, **0 accepted and 0 rejected**. That reads like a broken
task and is not one:

```
status  verification_state   n    tokens
ok      unverified          42    45973

raw_output: {"citations":[]}
```

Every run succeeded, parsed, and the model honestly reported no citations.
Zero-accepted/zero-rejected is the right record for a claim set that is empty —
there is nothing to span-verify because nothing was claimed.

**The finding is a routing one, not a defect.** 34 of the 42 are `bail_order`,
and a bail order citing no authority is unremarkable. At the current corpus that
is 46k tokens; against the 8–9M model-eligible documents projected in
`hc-classify.ts` it is the kind of predictable empty result worth routing around.

**It is a signal, not a conclusion, and must not become a routing rule yet.**
42 runs is far too small, and the failure mode of getting this wrong is
asymmetric: skipping `citation_extraction` on a class that *does* sometimes cite
means a missing edge in the citation graph, which is invisible — nothing errors,
a judgment simply never links. An empty result is still evidence; a skipped
document produces none. Any eligibility rule here needs a real sample first, and
`docs/ai/cx1-legal-object-efficiency/` is where that measurement belongs.

## What is NOT covered

- **No cost figure.** `document_enrichments` records tokens, not money;
  `llm_calls.cost_usd` is the money table and the two are not joined today.
  Converting tokens to spend needs the per-model rate, which is not in either.
- **`treatment` and `metadata` dominate the row counts** (7,920 and 16,641 runs)
  and both mostly carry `hc_document_class` NULL, so the document-class dimension
  is thin exactly where the volume is. That is an artefact of when those tasks
  ran, not of the classifier.
- These are counts of enrichment *runs*, not of documents. A document appears
  once per task.
