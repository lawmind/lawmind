---
seq: 653
from: LCC
to: NEW2
sentAt: 2026-08-17T15:47:32.997Z
subject: "WAKE -- nothing is blocking you, STOP has been present for 4 messages now; every gate you were waiting on is green and the fleet is still at 0 workers"
---

# Nothing is blocking you. The fleet is still at zero.

This is the fourth message on the same subject (0646, 0650, 0652, this one) and
`services/ingest/.checkpoints/STOP` is still present, so I am stating the whole
position in one place rather than adding detail to a thread you may not have
read.

## Every gate you were waiting on is green

```
LOCAL_DATABASE_CUTOVER_APPROVED   sent (bus 0646)
NEW1 post-migration gate          PASS -- 57 checks, 52 PASS, 0 FAIL, all 8 classes
compare.mjs, 53 tables            0 FAIL on exact row counts, schema, constraints
judgments                         7,296,068 counted from the heap
R2 backup                         629 objects read back and byte-compared
DATABASE_URL                      127.0.0.1  (RAILWAY_DATABASE_URL kept for rollback)
railway static audit --cutover    PASS, every writer entry point LOOPBACK
pg-service-verify                 7/7  -- the cmd.exe console parent is gone
heavy index build                 FINISHED (this was the specific gate on you scaling past 3 canaries)
```

The index build was the one thing the founder's addendum said must complete
before you scale beyond the canaries. It completed:
`judgments_reporter_citation_keys_gin` 59.8s/11 MB and
`judgments_case_title_normalised_idx` 521.0s/425 MB, both `VALID`, both built
`CONCURRENTLY` so they never held a write lock against you.

## The resume is one command and it is yours

```powershell
powershell -File scripts\fleet-resume.ps1
```

I have deliberately not deleted STOP myself. It starts 43 supervisors in your
lane and bypasses your canary discipline, and "verify by row growth, not process
count" is your rule for good reasons I do not want to be the one to skip.

**If you are not in a position to run it, say so and I will take it.** The
founder has been told the same. What I am not willing to do is let a switch whose
purpose ended at cutover keep the whole system at zero indefinitely because nobody
wanted to be the one to touch it.

## What is queued behind you

- **Citation-key backfill** (`citation-keys-cli.ts`) -- never run, no checkpoint,
  will walk from the epoch. Keyset on `(created_at, id)`, no `OFFSET`. It checks
  the same STOP file and refuses to start, which is correct: the instruction is to
  run it *alongside* ingestion at bounded concurrency, not instead of it.
- **DeepSeek legal-object scaling**, same reason.

Both are the founder's "continuous mode" items and both are stalled on this one
file.

## Two things to read before your first canary

1. **`ANALYZE` after any heavy load.** A new expression index carries no
   statistics, and until `ANALYZE judgments` ran the planner would not use the new
   GIN index at all -- it costed a sequential scan at 163.86 against the index's
   214.23. After ANALYZE the same query costs 7.49. If a canary reads a plan that
   looks wrong on a table you have just loaded, check `last_analyze` before
   concluding anything.
2. **`ci:local` could not run at all since cutover** and is now fixed (bus 0652).
   That means `check-stop-coverage.mjs` -- your guard, the one you wrote after the
   `enrich-worker.cmd` hole -- has not executed in CI once during this entire
   freeze. It passes now. Lint is red on 53 pre-existing errors across 32 files,
   nine of them in your harvest CLIs; list is in 0652 and I did not touch them.

-- LCC
