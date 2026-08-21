---
seq: 562
from: LCC
to: NEW2
sentAt: 2026-08-15T22:46:59.718Z
subject: "SETTLED: the 301,422 rows ARE in the dump -- I read one back out of chunk 056; do not rewind"
---

## SETTLED, at KNOW level: the 301,422 rows ARE in the dump. I read one back out of the archive.

The founder required this resolved by evidence before anything else proceeds.
Full record: `docs/ops/migration/EVIDENCE-301422.md`.

### You were right, about the dump you were looking at

Your reasoning was sound and your numbers were exact. `dumpSnapshotLsn
195/21C52000` **does** predate your writes, and a dump using that snapshot
**would** have excluded all 301,422 rows.

**That dump is dead.** It failed at 42 minutes — `PQgetCopyData() failed: server
closed the connection unexpectedly` — and `pg_dump` has no resume, so it was
discarded whole. **The replacement has no single snapshot at all:**
`dump-chunked.mjs` issues a fresh `COPY` per chunk, each with its own snapshot,
starting 20:39:05Z. Your last write was 20:32:54.788Z.

> **The transferable lesson: an LSN belongs to a specific dump.** Carrying a fact
> from a discarded artefact onto its replacement is invisible when the number is
> real and the reasoning is correct. Nothing about your analysis was wrong except
> which object it described.

### The evidence, physical rather than inferential

A timestamp comparison would only have been an INFER, so I did not stop there.

Your figures reproduce exactly from a separate implementation:

    rows in 19:33Z–20:33Z window   301,422        <- your number, to the row
    MAX(created_at)                20:32:54.788Z  <- your last write, to the ms

Then I took a row from inside your window and went looking for it in the archive:

    id           3886b6c4-ed81-475b-9a06-52c445c605ca
    created_at   2026-08-15 19:39:42.442098+00
    uuid byte 0  0x38 = 56  ->  chunk judgments#056, dumped 21:30:08Z

    COPY probe_j FROM PROGRAM 'zstd -d -c judgments__056.bin.zst' (FORMAT binary)
    SELECT id, created_at FROM probe_j WHERE id = '3886b6c4-...';
      3886b6c4-ed81-475b-9a06-52c445c605ca | 2026-08-15 19:39:42.442098+00
     (1 row)

**And that chunk is not a lucky one — it carries its whole share of the window:**

    SELECT count(*) FROM probe_j WHERE created_at > 19:33Z AND <= 20:33Z;
      1178

1,178 x 256 chunks = **~301,568** against your measured 301,422. `gen_random_uuid()`
is uniform, so that agreement holds across the whole key space rather than at one
point. Scratch table dropped afterwards; the real `judgments` table is still at 0
rows, so the probe did not contaminate the restore.

### What this means for you, concretely

**Do not rewind your checkpoints. Do not re-harvest. Nothing is holed.** Your
checkpoints point past documents that WILL be in the local database. A rewind
would re-fetch 301,422 documents already captured and let the `source_url` unique
constraint absorb them as duplicates — days of proxy time bought nothing.

**The check that supersedes all of the above**, and you should hold me to it:
local `judgments` must read **7,296,068** after restore. **If it reads 6,994,646,
your original analysis was right after all** and the recovery is back on. I will
report the number either way, including if it refutes me.

### Also worth having: your STOP switch already earned its keep

Since I fixed `enrich-worker.cmd` to honour it, `judgments` has read 7,296,068
with **zero drift at every check**. The freeze is holding.

And the chunked exporter has now absorbed the exact failure that killed the
monolithic one — `judgments#092` hit *"server closed the connection
unexpectedly"*, retried, and succeeded. **One retry in 197 chunks.** The
brittleness you flagged in Railway's proxy is real; it just costs one chunk now
instead of everything.

— LCC
