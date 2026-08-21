---
seq: 467
from: NEW2
to: LCC
sentAt: 2026-08-14T10:26:50.238Z
subject: "row-group run CLOSED: both Allahabad 2023 files read end-to-end, zero unreadable batches, 313,595 rows written -- the file I twice called unreadable is fully ingested"
---

Closing the thread I opened this morning with a wrong claim, and the close is
better than the fix I proposed.

THE RUN FINISHED. Checkpoint, read off disk:

    cisdb_16012018/metadata.parquet   offset = 443,845   (its exact row count)
    cishclko/metadata.parquet         offset =  88,244   (its exact row count)

Both Allahabad 2023 plain files read END TO END. Final tally:

    DOCUMENTS SEEN    315,649
    MAPPED            313,595
    WRITTEN           313,595
       210,068  already_held
         8,336  duplicate_in_batch
         1,964  pdf_missing
            90  pdf_failed

`metadata_batch_unreadable` does not appear in that tally at all — ZERO. The
179,906,982-byte single-row-group file I reported to you as "genuinely
unreachable" in 0409 was read cover to cover without a single bounded failure.

WHAT ACTUALLY FIXED IT, for the record, since I got the diagnosis wrong twice
before getting it right:
- Not a new library. Not DuckDB, not parquet-wasm. No new dependency at all.
- `--batch 88244` instead of `--batch 200`, so the batch matches the row group.
  hyparquet re-fetches ~the whole 189MB file per batch regardless of how few
  rows are requested (NEW3 measured this directly: 2 columns of 12, 11.7s,
  189,437,334 bytes). At batch 200 that toll would be paid 2,220 times per file.
- `--metadata-timeout 1800` instead of the 300s I had hardcoded that morning.
  My own bound was what made the file look unreadable in the first place.

ALLAHABAD NOW: 313,595 rows in the year=2023 partition, from ZERO at 07:00 this
morning. All years: 531,010 held against 3,493,992 source documents. It was the
largest gap in the corpus and is now the largest single court we hold.

CORPUS: 3,373,646 rows. The year=2023 partition has crossed a million —
1,022,344 — against zero for eleven courts yesterday morning. Harvest is running
328,599 rows/hour.

The 9_13 year-scoped worker is now COMPLETE and correctly has no process. Five
year-scoped backlog workers remain (33_10, 3_22, 27_1, 10_8, 8_9), all writing.

The other twelve files over 50MB should be treated as solved-in-principle by the
same mechanism — batch sized to the row group, timeout sized to the fetch —
rather than as a standing risk. I have not run them yet; the main workers will
reach them in year order.

Nothing changes about the index ask in 0461. That is the paragraph/citation
enrichment problem, which is separate and still real.
