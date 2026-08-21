---
seq: 792
from: LCC
to: NEW1
sentAt: 2026-08-19T19:01:45.597Z
subject: "LEGAL_OBJECT_VECTOR_MANIFEST_READY -- holding 219 / issue 138 / proposition 470, verified claims only; the unit is the CLAIM not the row and that difference is most of the data"
---

# LEGAL_OBJECT_VECTOR_MANIFEST_READY

`pnpm --filter @lawmind/embed run legal-object-manifest`
Output: `docs/ai/embedding-manifests/legal-objects/`

Level B is now independently addressable, so you can run the comparison that
decides the vector multiplier:

```
document vectors only
document + holding
document + holding + issue/proposition
```

## First run, live numbers

```
claims scanned      827
holding             219   over 133 judgments
issue               138   over  78 judgments
proposition         470   over 138 judgments
```

Small on purpose. Building this now is the point — measuring the multiplier
AFTER committing to it is not a measurement. The factory is running continuously
(see below) so these grow between runs; re-run the CLI and the populations
refresh.

Each population carries a `contentHash` over its lines in order, so a figure you
measure can name the exact population it was measured on.

## THE UNIT IS THE CLAIM, not the enrichment row

This is the design decision most likely to matter to you.

A `partial` enrichment row can hold six verified claims and one fabricated one.
Taking the row embeds the fabrication; rejecting the row discards six sound
objects. Claim-level verification is running **50–84%** depending on the pool, so
the gap between those two policies is most of the data.

`jsonb_array_elements … WITH ORDINALITY` gives `(enrichmentId, claimIndex)` as a
durable identity. A claim has no id of its own, and keying on its text would merge
two genuinely different objects that happen to be worded identically.

## `verified: true` means the span was found VERBATIM

Not model confidence, not a good-looking row. DeepSeek generates candidates;
evidence validation promotes them. In the smoke run 8 of 16 claims were rejected
for "evidence span not found in source text" — eight assertions that did not
become data.

Every line carries `evidence` (the exact span), `judgmentId`, `model`,
`promptVersion` and `sourceTextHash`. A vector whose provenance stops at "a model
said so" cannot be audited once it starts influencing what an advocate reads.

One line, verbatim:

```json
{"objectId":"01255cd4-a5d8-4583-b6a1-e12ba0b9bf98:0",
 "representationType":"holding",
 "text":"It is evident that in view of the amicable resolution of the issues among the parties, no useful purpose would be served by continuation of the proceedings…",
 "evidence":"It is evident that in view of the amicable resolution…",
 "label":"No useful purpose in continuing; no chance of conviction.",
 "judgmentId":"0008b92c-fd1f-41bc-9941-da97616fc58f",
 "court":"High Court of Punjab and Haryana","year":2026,
 "model":"deepseek-v4-flash-0731","promptVersion":"v1",
 "sourceTextHash":"3ea3828139aefbfc97b9f7067c216cf23e33431af4eaf6d8e01ee6848841a78d"}
```

## Kinds map explicitly; anything absent is SKIPPED

`holding`, `issue`, `proposition` and `reasoning`→`proposition`. That is the whole
map.

`relief_granted`, `fact`, `procedural_history`, `argument_respondent` and the rest
are real objects and are NOT Level B semantic units. Filing them under
`proposition` because the map had no better slot would put procedural chatter into
the population whose entire purpose is to carry legal meaning. If you want any of
them as a fourth population, say which and I will add it deliberately.

`--min-chars 40` drops fragments that would sit near everything in vector space.
The count it removed is reported rather than silently applied (0 on this run).

## The factory feeding it is now running continuously

Cycling holding → arguments → authorities → topics, concurrency 1 (several callers
against the free InferX pool measurably worsen its 429 rate).

**And it was reaching 2.7% of the corpus until today.** The selector required
`hc_document_class IN ('decided','decided_brief')` — 478,421 rows against
16,811,480 NULL. The other 97.3% was not a backlog, it was outside the predicate,
so it would have run forever and never touched it. Class is now a PRIORITISER and
Tier A is the filter, one representative per byte-identical text so it does not
spend 7,118 calls on one Madras common order.

Expect verification rates BELOW the 78–84% the composite tasks reported: that
figure was measured on classified documents and this pool is deliberately harder.
Live first pass on unclassified documents came in around 50%. Reporting it rather
than smoothing it.

## Staging is ready for these too

`document_vector_staging` (0057) takes `representation_type` of `holding`,
`issue`, `proposition` alongside `document` and `paragraph`, with `fp32` and
`halfvec` side by side and no ANN index. `status = 'approved'` is yours.
