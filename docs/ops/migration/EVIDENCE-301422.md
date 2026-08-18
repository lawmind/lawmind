# The 301,422-row question — settled by evidence, not by argument

**16 August 2026, LCC.** Two lanes reached opposite conclusions about whether the
migration dataset contains the 301,422 judgments written during NEW2's
accidental fleet restart. The founder directive required this resolved to
KNOW level before anything else proceeded.

## THE ANSWER

> **YES. The 301,422 rows ARE in the migration dataset.** Proven by reading one
> of them back out of the dump archive itself, not by reasoning about
> timestamps.
>
> **No recovery is required.** Options A, B and C of the directive's §3 are all
> unnecessary. Nothing is re-fetched from Railway, nothing is re-harvested from
> AWS, and NEW2's checkpoints must NOT be rewound.

## WHY BOTH LANES WERE RIGHT — the contradiction was about two different dumps

This is the whole resolution, and it is worth stating plainly because both
reports were sound:

| | |
| --- | --- |
| **NEW2's claim** | `dumpSnapshotLsn 195/21C52000` predates the writes, so the dump excludes them |
| **NEW2 was right — about the MONOLITHIC dump.** | That LSN belongs to `dump.mjs --full`, which took ONE repeatable-read snapshot at 19:37Z. It would indeed have excluded every one of those rows. |
| **But that dump is DEAD.** | It failed at 42 minutes — `PQgetCopyData() failed: server closed the connection unexpectedly` — and `pg_dump` has no resume, so it was discarded entirely. |
| **The replacement has no single snapshot.** | `dump-chunked.mjs` issues a fresh `COPY` per chunk, each with its own snapshot, starting **20:39:05Z**. NEW2's last write was **20:32:54.788Z**. Every chunk is later. |

**The lesson worth keeping:** an LSN identifies a snapshot, and a snapshot
belongs to a specific dump. Carrying a fact from a discarded artefact onto its
replacement is an easy and invisible error — the number was real, the reasoning
was correct, and the object it described no longer existed.

## THE EVIDENCE — physical, not inferential

A timestamp comparison would have been an INFER. This is a KNOW.

**1. The window and its size, re-measured independently against the frozen source:**

```
rows WHERE created_at > 19:33:00Z AND <= 20:33:00Z   301,422   <- NEW2's figure, to the row
MAX(created_at) across all judgments                 2026-08-15T20:32:54.788Z
```

Both reproduce NEW2's report exactly, from a separate implementation.

**2. A row from inside the window, located in a specific archive file:**

```
id          3886b6c4-ed81-475b-9a06-52c445c605ca
created_at  2026-08-15 19:39:42.442098+00      <- inside NEW2's window
uuid byte 0 0x38 = 56                          -> chunk judgments#056
```

**3. That chunk read back out of the archive:**

```
ledger judgments#056   dumped 2026-08-15T21:30:08.064Z, 101,977,319 bytes
                       (57 minutes AFTER NEW2's last write)

COPY probe_j FROM PROGRAM 'zstd -d -c judgments__056.bin.zst' (FORMAT binary)

SELECT id, created_at FROM probe_j
 WHERE id = '3886b6c4-ed81-475b-9a06-52c445c605ca';
  3886b6c4-ed81-475b-9a06-52c445c605ca | 2026-08-15 19:39:42.442098+00
 (1 row)
```

**4. And the chunk is not a fluke — it carries its whole share of the window:**

```
SELECT count(*) FROM probe_j
 WHERE created_at > '2026-08-15T19:33:00Z' AND created_at <= '2026-08-15T20:33:00Z';
  1178
```

1,178 × 256 chunks ≈ **301,568**, against the measured 301,422. UUIDs from
`gen_random_uuid()` are uniform, so the agreement is what a correct dump looks
like across the whole key space, not just at one point.

The scratch table `probe_j` was dropped afterwards and the real `judgments`
table confirmed still at 0 rows — the probe did not contaminate the restore.

## THE FINAL CHECK THAT SUPERSEDES ALL OF THIS

The evidence above is a sample. **The verification that actually gates cutover is
the exact count**, and it now has a specific value to hit:

> **`SELECT count(*) FROM judgments` on the local database must read `7,296,068`.**
>
> **`6,994,646` would mean NEW2's original analysis was right after all** — that
> the window is missing — and recovery under §3 would be back on. Any other
> number means something else went wrong.

`compare.mjs --exact` performs this against the source automatically and fails a
target that is short *or* long.

## CONSEQUENCES FOR OTHER LANES

- **NEW2 — do not rewind checkpoints, do not re-harvest.** Your checkpoints point
  past documents that WILL be in the local database. Rewinding would re-fetch
  301,422 documents already captured, and the `source_url` unique constraint
  would absorb them as duplicates — days of proxy time for nothing.
- **The freeze must hold until cutover.** Each chunk is its own snapshot, so
  consistency comes from the source not moving, not from the dump. `judgments`
  has read 7,296,068 with zero drift at every check since 20:57Z.
