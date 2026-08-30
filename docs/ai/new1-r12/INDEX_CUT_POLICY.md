# INDEX_CUT_AT — defining the final HNSW population without a temporal hole

**Lane:** NEW1 · **Round:** R12 · **Written:** 30 Aug 2026 · **Status:** definition
frozen, build NOT started and NOT authorised by this document.

---

## The mistake this exists to prevent

The obvious sentence — *"build the index over the 7,654,179 rows from the 27 Aug
snapshot"* — is wrong, and it is wrong in a way that leaves no error message.

The representative snapshot `embedding_content_representative` was materialised
between 13:20 and 15:41 on 27 Aug 2026 and has not moved since. The corpus did
not stop at 15:41. As of this round there are already **4,179 current-generation
vectors whose content hash is not in that snapshot** — legitimate rows the delta
queue produced after the cut. Build the index on the snapshot predicate and those
rows are silently outside the index: present in the table, absent from every
search, and nothing anywhere reports a count that is wrong.

That is a temporal hole. The point of naming `INDEX_CUT_AT` is that the hole
becomes a queue with a policy instead of a silence.

## HNSW_FINAL

**NOT BUILT. Preconditions not met.** The walk is at batch 243 of 766 and
representative coverage is 32.03%. This document defines the gate; it does not
open it.

## The sequence, in order, no step skippable

1. **The coarse worklist reaches complete.** Complete means the runner's own
   completion condition, not a row count that looks close. Record the batch
   index and the manifest hash at that moment.

2. **Capture `INDEX_CUT_AT`** — a single timestamp, read from the database
   (`SELECT now()`), written into the index generation record before anything
   else happens. It is captured *after* the walk completes so that the walk's own
   output is unambiguously inside the cut.

3. **Drain every eligible delta created at or before `INDEX_CUT_AT`.** Not
   "wait for the queue to look idle" — run the queue until the count of eligible
   rows with `created_at <= INDEX_CUT_AT` and no current-generation vector is
   zero, and record that zero.

4. **Prove zero unexplained representative gaps through the cut.** Every eligible
   representative at or before the cut is either covered by a current-generation
   vector or has a named row in `new1_doc_vector_stage_refused`. The number that
   must be zero is *unexplained* gaps — refusals are explained, and a refusal
   that left no ledger row is the failure this check is for.

5. **Freeze the exact predicate and generation.** Write both verbatim into the
   index record: the `snapshot_hash` value, the `content_hash` set definition,
   and the SQL that enumerates the population. A predicate described in prose is
   not frozen.

6. **Verify disk and memory** against the projection below, on the day, not from
   this document.

7. **Only then build.**

## INDEX_GENERATION

The index carries its own generation identifier, distinct from the embedding
generation. Two different questions: *which model produced these vectors* versus
*which population is in this graph*. Today they would be `5b5d02384b46c96c` and a
new index id; conflating them means a re-index cannot be distinguished from a
re-embed.

## Rows arriving after INDEX_CUT_AT — the policy, chosen now

**Indexed automatically into the existing index.** pgvector HNSW supports
inserts, so a row added after the build is searchable without a rebuild.

The alternative — queue them behind a versioned post-build delta path — was
considered and rejected for this corpus: it makes recall silently depend on
whether the reader remembered to search two places, which is the same failure
mode as the temporal hole, moved one step later.

Two conditions attach, and neither is optional:

- The post-cut insert path writes the same `snapshot_hash`, so a row inserted
  after the build is still identifiable as belonging to the embedding generation
  the graph was built from.
- Insert-only growth degrades HNSW recall slowly and invisibly. The rebuild
  trigger must be a **measured** recall drop against the frozen evaluation set
  (§11 of the round directive), not a row-count threshold guessed today.

## Build-time comparison, to be decided on the day

`CREATE INDEX` versus `CREATE INDEX CONCURRENTLY` is not settled here and must
not be assumed. `CONCURRENTLY` takes a weaker lock and permits writes during the
build, but it does two table passes and is slower, and it can leave an INVALID
index that must be dropped and rebuilt.

The question that decides it is **whether the delta queue must keep writing
during the build**. If the walk is complete and the queue can be paused for the
build window, plain `CREATE INDEX` is the better choice and `CONCURRENTLY` buys
nothing. Measure, then choose.

## Resource settings

- `maintenance_work_mem` is set **session-locally**, never globally. pgvector's
  own documentation says an HNSW build is substantially faster when the graph
  fits in `maintenance_work_mem`, and warns against allocating so much that the
  host is exhausted. A global setting would apply to every autovacuum worker on
  a box that is also running Postgres for the walk.
- Track `pg_stat_progress_create_index` throughout. A build with no progress
  reading is a build that cannot be distinguished from a hang.

## Projection, carried forward from R10 measurements

| quantity | value | basis |
| --- | --- | --- |
| projected index size at 7.65M rows | 19.47 GiB | 2,731 bytes/vector, measured across four builds, halfvec(1024) expression, m=16, ef_construction=64 |
| memory for a fully resident build | 19.47 GiB | the graph needs about as much as the finished index |
| box RAM | 31.7 GiB total, 14.4 GiB free with the walk and Postgres running | measured this round |
| spill | **certain** | 19.47 GiB does not fit in what is free |
| build time bracket | 0.67 h fully resident (NOT achievable) to 2.91 h fully spilling | measured endpoints |

Everything between those two endpoints is **interpolated, not measured**, and the
2 GB figure is an extrapolation off the end of the data (10.3% resident, below
the 19.5% of the lowest measured build). Treat the bracket as the honest answer
and the interior numbers as guesses with a stated method.

## The 1M-row probe

`new1_probe_hnsw_1000000` and its HNSW index (2,603 MB) already exist from R10.
The probe remains **secondary** and is not to be re-run while the main walk is
progressing: it competes for the same disk and the same buffer cache. It is the
experiment that would turn the nearest interpolated number into evidence, and it
should be run when the walk is done or when headroom is unambiguous.

## Post-build ANN quality is mandatory before exposure

Creating the index successfully is not evidence that search works. Before any
semantic search is exposed, recall@10/@50/@100 and p50/p95/p99 must be measured
against exact search on a frozen evaluation set at several `ef_search` values,
**including filtered queries** — pgvector applies filters after the index scan,
so filtered recall is a different number and must be measured, not inferred from
the unfiltered one. Production runs `ef_search = 200`; probe numbers taken at 40
do not describe production.
