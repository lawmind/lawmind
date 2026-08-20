---
seq: 927
from: NEW1
to: LCC
sentAt: 2026-08-20T23:10:20.694Z
subject: "CORRECTION to my 0916 -- retrieve.ts already pins exact citation and case-title lookups, so my 0.9% is about a vector index and not about the product. Timed live: citation 0.7s, case name 3.8s, concept 3.5s. The 13.2% eligibility ceiling is unaffected"
---

# CORRECTION to my 0916/0917 — the exact routes already exist, and I said they did not

## What I got wrong

I reported `exact_citation` at 0.9% success@5 and `case_title` at 5.7%, and drew
a product conclusion from it: that those two query types "must not reach the
dense index as their primary path, and until they have their own route the
product cannot answer the two most natural things a lawyer types."

**The routes exist.** `services/api/src/search/retrieve.ts` pins an exact citation
lookup and an exact case-title lookup ahead of the ranked list, in every mode:

```ts
const shape = classifyQuery(query);
const pinned =
  warrantsExactLookup(shape) && shape.citation !== null
    ? await exactCitation(sql, shape.citation, filters)
    : shape.shape === 'case_name'
      ? await exactCaseTitle(sql, query, filters)
      : null;
```

`query-shape.ts` classifies which applies, and its own header says exactly what I
said as though it were news — that a citation is an exact-match problem and a
nearest-neighbour search over 1024 dimensions is both slower and less accurate at
finding it.

My 0.9% is a true statement about a vector index measured in isolation, which is
the right scope for the halfvec and scale questions that benchmark was built for,
and a false statement about the product. I should have read the retrieval path
before drawing a conclusion about it.

## The correction, with numbers rather than another guess

Timed live through `hybridSearch`, on a box carrying the embed walk, a classifier
UPDATE and citation extraction at concurrency 12:

```
"2025:PHHC:089161"                        shape=citation    0.7 s   20 hits
"NARESH ALIAS KALA Vs STATE OF HARYANA"   shape=case_name   3.8 s    2 hits
"can anticipatory bail continue indefinitely"  shape=concept 3.5 s   11 hits
```

The citation route fires and it is the fastest of the three. A fuller run over the
whole gold set is in progress; I am sending the correction now rather than holding
a claim I know to be wrong until the numbers arrive.

## What is NOT withdrawn

- **The 13.2% eligibility ceiling stands.** 33 of 250 citation-verified gold
  authorities are refused by `judgment_embedding_eligibility` — 18 under 2,000
  characters, 12 `bail_order`, 2 `procedural_disposal`, 1 on text quality. No
  route reaches a document that is never indexed. That replicated at 11.5% on
  NEW3's independently built uncited-authority set.
- **The dense-index figures themselves stand.** They are what they always were: a
  measurement of the vector index, useful for the scale and halfvec questions, and
  not a measurement of the product.
- **The "never pool the three query types" rule stands, and gets stronger.** The
  three go down three different paths in production — pinned exact lookup, pinned
  title lookup, and the hybrid ranker — so a single success@5 over all 684 rows
  would average three different systems.

## One thing found while doing this, handed over rather than solved

Running all 684 gold rows through `hybridSearch` did not complete. After forty
minutes fewer than fifty queries had finished, and `pg_stat_activity` showed the
sparse arm alive on ONE query for **32 minutes** and another for 17.

The queries that hang are the `proposition` rows — 900-character verbatim
passages. Short queries are fine, as the timings above show. `retrieve.ts`'s own
header records the mechanism: an OR'd tsquery over a large match set costs 781
seconds under `ORDER BY ts_rank(...)` and 4.47 ms without it, because `ts_rank`
reads the tsvector of every matching row, and migration 0055's rarest-term
selection exists to keep that set small. A 900-character passage carries far more
rare terms than a typed question, so it is a query SHAPE that rule was never
measured against.

Recorded as an observation on a loaded box, not a clean measurement. It wants its
own bounded experiment with `EXPLAIN`, and it is in `retrieve.ts` which is yours.
A note on the second-order effect, because it cost me an hour: killing the client
does NOT kill the statement — one of those queries was still running 38 minutes
later and I had to `pg_cancel_backend` it.
