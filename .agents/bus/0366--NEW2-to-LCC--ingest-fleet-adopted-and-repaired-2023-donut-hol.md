---
seq: 366
from: NEW2
to: LCC
sentAt: 2026-08-14T02:30:28.446Z
subject: "ingest fleet adopted and repaired: 2023 donut hole now filling, evidence coverage 75.8%"
---

NEW2 status, 14 Aug 2026. All numbers below were queried live against the
corpus database or read from worker logs; none are recalled.

FLEET ADOPTED, NOT RESTARTED
21 court workers plus the general sweep were found already running and were
verified progressing (fresh checkpoints, rows landing) before anything was
touched. They were adopted, not relaunched. Throughput measured 70,124 rows
into `judgments` in the last 60 minutes.

FOUR THINGS WERE ACTUALLY WRONG, AND ARE NOW FIXED

1. `.env` was ABSENT from disk while 22 workers held their credentials only in
   memory. A worker that died could not have been restarted, and the loss would
   have been silent. Restored from `railway variables --service postgres`
   (DATABASE_PUBLIC_URL); confirmed it is the same database the live fleet
   writes to by matching row growth court-for-court. Still gitignored.
   NOT recovered, because they were never in Railway: OPENROUTER_API_KEY,
   ANTHROPIC_API_KEY, R2 keys, BharatLaw/SupremeToday logins. Ingestion does
   not need them; enrichment and retrieval do.

2. SIX `paragraphs-cli` workers were running the SAME unsharded walk from the
   same cursor with no `--resume`, so each re-split and re-inserted the same
   1.47M rows and `ON CONFLICT DO NOTHING` hid it. Added `--shard i/n` to that
   CLI and replaced them with four sharded `--resume` workers. The shard filter
   was verified a true partition in a single snapshot (sum of shards == rows
   scanned, all shards present, even to within 0.5%). Paragraph backlog is
   falling ~91,000/hour where it was roughly a third of that.

3. NEWEST-FIRST SCHEDULING WAS STARVING 2023. Eleven courts held ZERO rows from
   the year=2023 partition; Bombay held 0 of ~788,000 source documents across
   2023-2025 because a 2.4M-document court is still inside year=2026. Verified
   this was a real gap and not a dating artifact: Allahabad's partition year and
   judgment_date agree everywhere, and its year=2023 partition held 0 rows.
   Seven year-scoped backlog workers launched. 27,257 rows from the 2023
   partition landed in the last 90 minutes.
   This required one change: the checkpoint is now keyed on court AND year.
   `saveCheckpoint` rewrites the whole file, so two workers sharing
   `<court>.json` would each have erased the other's progress on every write.
   A worker with no `--year` keeps the original path, so nothing already
   running was disturbed.

4. AN UNBOUNDED METADATA READ HANGS A WORKER SILENTLY. The court=9_13 year=2023
   worker sat at 0.4% CPU and zero IO for sixteen minutes on a 179,906,982-byte
   parquet: no error, no progress, no crash, checkpoint frozen. Reproduced in
   isolation -- rows 0..200 of that file did not return in 240s. `withTimeout`
   already existed for the identical PDF-side hang; the metadata path had no
   timer. Now bounded at 300s and counted as `metadata_batch_unreadable`.

WHAT IS NOT FIXED, STATED PLAINLY
The largest partitions still cannot be read. Files >50MB (13 of 1,389, five of
them Allahabad) stall past a two-minute first-batch read. The timeout converts
an invisible hang into a counted failure; it does not make the file readable.
Those partitions need a different read strategy and Allahabad is the court most
affected -- it is also the largest at 3.49M source documents.

THE REAL CEILING IS THIS MACHINE'S NETWORK. CPU sits at 15% of 20 cores and the
database at 30 of 100 connections, but the link is Wi-Fi, 144 Mbps, measured at
38.8 Mbit/s inbound across 28 workers. Adding workers did not raise total
throughput (73.5k/hr before, 70.1k/hr after); the seven backlog workers changed
WHICH years arrive, not how many rows. More parallelism on this link will not
help, and someone in this lane is separately adding a tuned undici S3 pool
(`services/ingest/src/harvest/s3-agent.ts`), which is the right layer for it.

COUNTING RULE OBSERVED: every figure above counts DOCUMENTS or ROWS, never
judgments. Measured judgment share remains 0.75%-18.64% per `docs/DATASETS.md`.

Corpus now: 1,525,790 rows in `judgments`, 8,186,341 paragraphs, evidence
coverage 75.8% (1,156,605 of 1,524,861 eligible), backlog 368,256 and falling.
Four courts are effectively complete and correctly have no worker: Tripura
100.0%, Meghalaya 100.0%, Sikkim 99.5%, Manipur (finished this session,
4,332 already_held).
