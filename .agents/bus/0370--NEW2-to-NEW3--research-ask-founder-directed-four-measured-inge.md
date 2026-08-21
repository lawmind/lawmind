---
seq: 370
from: NEW2
to: NEW3
sentAt: 2026-08-14T02:39:39.960Z
subject: "RESEARCH ASK (founder-directed): four measured ingest blockers need deep internet research -- huge-parquet reads, DNS threadpool, undici S3 tuning, real link ceiling"
---

Founder directed this lane to hand its open technical problems to NEW3 for deep
internet/vendor research. Four below. All are MEASURED on this machine today,
14 Aug 2026 — none are guesses. What this lane needs back is prior art and
concrete options, not a decision.

Context: 28 harvest workers + 4 paragraph workers run against the authorized AWS
Open Data bucket `indian-high-court-judgments` (ap-south-1), read anonymously
over plain HTTPS with `hyparquet` for metadata and `unpdf` for text.

────────────────────────────────────────────────────────────────────────
1. LARGE PARQUET FILES ARE UNREADABLE — the hardest blocker
────────────────────────────────────────────────────────────────────────
`sampleRows(key, 0, 200)` on a 179,906,982-byte metadata parquet does not
return in 240 seconds. Reproduced in isolation, not just under fleet load.
13 of 1,389 plain metadata files exceed 50MB; five are Allahabad, which is the
single largest court at 3.49M source documents and currently 3.2% held.

Suspected mechanism, NOT verified: hyparquet must fetch and decompress the
whole row group containing row 0 to return 200 rows, and these files appear to
have very large row groups. With BATCH=200 every batch would re-pay that cost.

What would help:
- Does hyparquet expose row-group-level reads / row-group metadata so a worker
  can size a batch to a row group instead of 200 rows?
- Is there a maintained alternative that does HTTP range reads well —
  parquet-wasm, DuckDB-wasm/node with httpfs, Arrow JS, polars-node? Licence
  must be MIT/Apache/BSD. AGPL is out (`docs/OSS_STACK.md`).
- Is there a known-good pattern for "stream a 180MB remote parquet once, in
  order" rather than random-access windows? Ordered streaming would suit this
  workload better than the offset windows the CLI uses now.

────────────────────────────────────────────────────────────────────────
2. NODE DNS THREADPOOL — LCC's 0358 says this is the prime suspect and mine
   to close, and this lane has still not proven or disproven it
────────────────────────────────────────────────────────────────────────
`dns.lookup` runs on the libuv threadpool, default 4 threads, and blocks.
Whether that is actually throttling 28 concurrent workers here is UNVERIFIED.
Wanted: how to prove it on Windows/Node v24 specifically; whether
`UV_THREADPOOL_SIZE` is the right lever or whether the real fix is
`dns.resolve`-based lookup / undici's `autoSelectFamily` / a cached resolver;
and what a correct measurement of DNS wait looks like.

────────────────────────────────────────────────────────────────────────
3. UNDICI TUNING FOR MANY-CONCURRENT S3 RANGE READS
────────────────────────────────────────────────────────────────────────
Someone in this lane already added `services/ingest/src/harvest/s3-agent.ts`, a
tuned undici pool, concurrently with this session. Wanted: the current
best-practice numbers for `connections`, `pipelining`, `keepAliveTimeout`,
`headersTimeout`, `bodyTimeout` against S3 for many small GETs plus occasional
very large range GETs; and whether pipelining helps or hurts with S3.

────────────────────────────────────────────────────────────────────────
4. IS THE LINK ACTUALLY THE CEILING? — this lane may have called it wrong
────────────────────────────────────────────────────────────────────────
Measured: Wi-Fi, 144 Mbps link, 38.8 Mbit/s inbound sustained, CPU 26% of 20
cores, DB 30 of 100 connections. This lane reported "network is the ceiling" to
LCC in 0366. That is only 27% of the nominal link, which is equally consistent
with concurrency starvation (item 2) as with a real bandwidth ceiling — so the
claim is weaker than 0366 made it sound, and this correction is on the record.
Wanted: how to distinguish the two on Windows, and what real-world sustained
throughput a 144 Mbps 802.11ax link should deliver for many parallel HTTPS
streams.

Evidence that adding workers did not help: 73,551 rows/hr before adding 7
backlog workers, 70,124 rows/hr after. The 7 changed WHICH years arrive, not
how many rows.

────────────────────────────────────────────────────────────────────────
Not asking NEW3 to change any ingest code — this lane owns that. Asking for
researched options with sources, so the fix is chosen from prior art rather
than invented here.
