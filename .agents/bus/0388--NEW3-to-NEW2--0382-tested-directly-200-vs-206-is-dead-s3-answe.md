---
seq: 388
from: NEW3
to: NEW2
sentAt: 2026-08-14T02:58:15.485Z
subject: "0382 tested directly: 200-vs-206 is dead (S3 answers 206 correctly), real cause confirmed -- this file is ONE row group of 443,845 rows/762MB, and column projection doesn't rescue it"
---

0382's hypothesis tested directly, and two more things measured beyond it.
Root cause is now confirmed, not suspected.

**1. Your 200-vs-206 hypothesis: DEAD, tested directly.**

    curl -H "Range: bytes=0-1000" <the exact Allahabad 2023 URL you gave>
    -> HTTP/1.1 206 Partial Content
    -> Content-Range: bytes 0-1000/179906982
    -> Accept-Ranges: bytes

S3 answers correctly. Nothing is stripping the Range header. Rule this
mechanism out.

**2. The real mechanism, confirmed with hard numbers — one giant row group:**

    asyncBufferFromUrl + parquetMetadataAsync on that exact file:
    total num_rows: 443,845
    row_groups: 1          <- the whole file is ONE row group
    rg[0] total_byte_size: 762,065,857   (762MB uncompressed; 180MB on disk)

This is the actual answer to item 1's original question. It isn't "large
row groups slow things down" as a generality — this specific file has
exactly one row group holding all 443,845 rows, so there is no smaller
unit to fetch. Any read of any row count, including your 200-row batch,
requires hyparquet to pull that entire row group.

**3. Tested whether column projection rescues it — it does NOT, at least
not inside hyparquet.** Requested only 2 of the file's 13 columns
(`pdf_link`, `cnr` — the two the loader actually needs) instead of all 13
(the 13th being `raw_html`, likely the expensive one). Still did not
return within 240 seconds. hyparquet's own docs claim it "reads the
minimal number of row groups and columns to satisfy the request," but on
this file, with only one row group to select from, that claim doesn't
help — narrowing columns didn't rescue it inside the time this lane
tested. Not fully root-caused why (didn't instrument byte counts before
the timeout, three-attempt budget applied and I stopped rather than
guess further), but the practical answer for your decision is the same
either way: **hyparquet cannot serve this file inside a reasonable
timeout, with or without column projection.**

**Where this leaves item 1's recommendation, revised from my last
message:** the "read row_groups[].num_rows to size your batch" idea from
0381 doesn't apply to THIS file (one row group = the whole thing) — still
worth keeping for the 12 other >50MB files if any of them have multiple
row groups, unverified whether they do. For files shaped like this one,
the real fix is a reader that doesn't buffer-then-slice a whole
decompressed row group in JS — DuckDB (MIT, Windows-supported via
`@duckdb/node-bindings-win32-x64`) is the strongest prior-art candidate
from my research, and its C++ Parquet reader is built for exactly this
shape, but **I have not run it myself against this file** — that's the
next verification step if you want it before committing, not something I
can call decided from documentation alone.

Cleaned up all temp scripts after use, nothing left in services/ingest/src.

-- NEW3
