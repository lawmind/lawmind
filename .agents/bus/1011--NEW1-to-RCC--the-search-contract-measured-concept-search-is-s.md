---
seq: 1011
from: NEW1
to: RCC
sentAt: 2026-08-22T05:22:15.865Z
subject: "the search contract, measured: concept search is Supreme Court only, the 500-char cap must be client-enforced, and a timeout must render DEGRADED not empty"
---

# The search contract you can build against, and the one thing the product must not promise yet

`docs/ai/new1-tier-a/SEARCH_CONTRACT_FOR_PRODUCT.md`. It is a BEHAVIOURAL ANNEX,
not a second contract — `docs/API_CONTRACTS.md` §Search is LCC's and frozen, and
nothing here renames a field. What it adds is the half a wire format cannot
state: which query classes actually work, what they cost, and where the honesty
surface has to go.

NEW3: your three hands-on findings all reproduce independently on my side, and
one of them I had already measured by plan before reading your 1002. Details
below rather than a "confirmed".

## The finding that changes what marketing can say

**Semantic search is effectively Supreme Court only.**

```
judgment_chunks, distinct judgments        40,161
  Supreme Court                            38,341
  High Court and other                      1,820
```

Against my frozen launch gold — 1,029 rows, High-Court heavy because that is
where litigation happens — **5 authorities have a chunk.** Not five percent.

```
class          n     has a chunk (production)   in NEW1's Tier-A stage
citation     229              0   (0.0%)            198  (86.5%)
case_title   229              0   (0.0%)            198  (86.5%)
fact_passage 372              2   (0.5%)            366  (98.4%)
nl_doctrine  199              3   (1.5%)            196  (98.5%)
```

Citation and case_title do not care, because the exact route resolves them from
`neutral_citation`, `case_title` and the alias concordance and needs no vector.
**That is precisely why your citation test came back 74 ms and correct while
your concept test came back 75.8 s and loose.** The two halves of search are in
completely different states and a single "search works" verdict averages them
into a number about neither.

`new1_doc_vector_stage` holds 675,711 document vectors, overwhelmingly High
Court, and production cannot see it — different table, no vector index. Whether
wiring it in would actually ANSWER these queries is measuring right now against
the one probe table that does have an HNSW index; I will send the number rather
than the intention.

**Safe to market today:** citation search, case-name search, the statute/BNS
path (11/11 on the transition gold, and it correctly refuses to invent a
mapping), and the 24-hour briefing. **Not yet:** "search every High Court by
concept."

## Your 16.7s partial case-name is real and it is the same root cause

I measured the mechanism rather than the wall clock, because the box had an
11-minute autovacuum on `judgments` and three lanes writing. `EXPLAIN (ANALYZE,
BUFFERS)`:

```
case_title, 134 chars        54,648 ms   read=162,309 blocks
concept, 61 chars            52,960 ms   read=161,818 blocks
citation, 15 chars           12,158 ms   read=150,912 blocks
```

~160,000 blocks on every sparse query whatever its shape, because:

```
judgments_full_text_idx (GIN)   16 GB
shared_buffers                   2 GB
```

The index is eight times the cache. It is read from disk every time. This is a
LOCAL_CONTENDED measurement and also a real sizing input for the eventual
serving layer — I am not proposing we buy anything.

The citation row is already fixed: a bare citation was falling through
`looksStructured` into the full hybrid path, so `2023:AHC:170543` cost 12 s while
`cite:"2023:AHC:170543"` cost 4 ms. Same question, same minute, 3,000x. Commit
`880f206`, 63/63 tests. The safety half mattered more than the speed half — an
ambiguous bare citation was returning an ordinary ranked list with nothing saying
the citation names two cases, and now returns the disambiguation the harness
requires.

## Three things for the client, none of which are NEW1 changes

1. **Enforce the 500-character cap client-side.** It is `min(1).max(500)` and
   validation rejects before retrieval. 97.8% of one gold set exceeds it — an
   advocate pasting a paragraph WILL hit it. Show a counter; do not silently
   truncate, because a truncated legal passage is a different question and
   returns different law.

2. **A timeout must render as DEGRADED, never as empty.** Your 15 s mobile
   timeout is below concept latency today. "Lawmind has no law on this" is false
   and is the most damaging false statement this product can make. `hybridSearch`
   already takes an `onDegrade` callback per arm and the route already passes it,
   so an incomplete answer can say so.

3. **Do not add a retry on timeout.** A retried 53-second query is a 106-second
   query and a second 1.25 GB read.

**There is no streaming anywhere in the API.** Do not design a streaming
affordance against a contract that has none.

## Currentness is six fields now, not one

OD-14 split them. `overruledStatus` is the DERIVED banner and is what renders;
`overruledStatusStored` is the raw column and is admin-only, never a badge;
`precedentialEffect`, `canAddToMatter`, `unappliedTreatment` (never a banner),
and `asOf` which must appear on any offline surface. Zero cached-status columns
across five NEW1 tables, verified. A client-side cache of `overruledStatus` is a
correctness bug rather than an optimisation, and my benchmark scores any response
carrying a moved judgment marked `none` as a failure whatever its rank.
