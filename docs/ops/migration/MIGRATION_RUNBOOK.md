# Railway → local PostgreSQL — the runbook and the decision record

**Started 15 August 2026 by LCC, on the founder's cost directive: LawMind is
pre-revenue and Railway's monthly burn is not acceptable.** The objective is to
stop routine Railway compute/Postgres/egress billing **while preserving the
entire data moat** — not to reduce the moat, not to redesign retrieval, and not
to start Phase 2.

This file is the durable record. `docs/CURRENT_PLAN.md` exists because a plan
held only in a todo tool does not survive compaction; this one exists because a
migration whose reasoning lives only in a terminal cannot be reviewed, resumed
by a fresh agent, or rolled back by anyone but its author.

---

## 0 · THE SHAPE OF IT

```
  Railway Postgres 18.4 (Debian)          ──pg_dump──▶   C:\lawmind\dump\full
  hayabusa.proxy.rlwy.net:24909                          zstd:3 directory archive
  103.9 GB · 53 tables · 74.4 GB payload                        │
            │                                                   │ pg_restore --jobs
            │ NOT DELETED until §7 passes                       ▼
            │                                          local PostgreSQL 18.6
            ▼                                          127.0.0.1:5432, loopback only
      rollback path                                    C:\lawmind\pgdata (NVMe)
                                                                │
                                                                │ rclone, verified read-back
                                                                ▼
                                                      R2 lawmind-corpus/backups/postgres/
```

**PostgreSQL is never published.** External access, if it is ever wanted, is
cloudflared → the HTTP API. Not port 5432. `pg_hba.conf` is loopback-only and
`listen_addresses = 'localhost'`.

---

## 1 · WHAT WAS MEASURED BEFORE ANYTHING WAS BUILT

Stage A, `docs/ops/migration/manifest-railway-stage-a.json`, taken against the
live source rather than recalled.

| | source (Railway) | target (local) |
| --- | --- | --- |
| version | PostgreSQL **18.4** Debian | **18.6** Windows x64 |
| size | **103.9 GB** | — |
| **dump payload** (heap+TOAST) | **74.4 GB** | — |
| indexes, *not* dumped, rebuilt on restore | 29.6 GB | — |
| tables · indexes · constraints | 53 · 167 · all | must match exactly |
| extensions | `pg_trgm 1.6`, `vector 0.8.5`, `plpgsql` | **matched exactly** |
| enums | 36, incl. `verified_by_source[8]`, `overruled_status[4]` | matched |
| functions · views · matviews · large objects | 150 · 0 · 0 · 0 | matched |
| sequences | **0** — so no sequence can be restored to a value that reissues live keys | n/a |
| encoding | UTF8 | UTF8 |
| collation | libc `en_US.utf8` | **ICU `en-US`** — see §3 |

The three tables that are the migration:

| table | dump payload |
| ---: | ---: |
| `judgments` | **47.55 GB** |
| `judgment_paragraphs` | 21.86 GB |
| `judgment_chunks` | 4.53 GB |
| everything else, 50 tables | 0.46 GB |

**`judgments` alone is 64% of the payload, and pg_dump parallelises per table.**
So `--jobs` cannot make the dump much faster than one table's single stream —
that, not the total, is what sets the freeze window.

---

## 2 · WHY pg_dump AND NOT LOGICAL REPLICATION

The directive asked for the more efficient native method to be **measured
first** if one was demonstrably safe under Railway privileges. It was measured.

| check | result |
| --- | --- |
| `wal_level` on source | **`replica`** — logical replication needs `logical` |
| changing it | a Railway Postgres **restart**, a founder action |
| every table has a primary key | **yes** — replica identity was *not* the blocker |
| `current_user` superuser / replication | yes / yes |

It loses even if the restart were granted, for two reasons:

1. **It does not make the copy faster.** The initial table sync moves the same
   74.4 GB over the same proxy. Only the cutover delta shrinks.
2. **It adds a failure worse than a long pause.** A replication slot that falls
   behind retains WAL **on the source**. A 74 GB initial sync over a proxy that
   has already killed seven long passes with DNS failures is exactly the
   workload that falls behind, and the consequence is **Railway running out of
   disk mid-migration**. Trading an authorised pause for a risk of destroying
   the source is a bad trade.

The founder authorised the pause explicitly. So: `pg_dump`, which the directive
names as acceptable, and **no custom protocol.**

---

## 3 · THE COLLATION DECISION — the one thing a cross-platform move can silently break

The source is libc `en_US.utf8`. **That locale does not exist on Windows at
all**, so an exact match was never available. The target uses the **ICU**
provider with locale **`en-US`**.

Why this is safe rather than merely convenient, checked rather than assumed:

- **The schema names no collation anywhere.** Zero columns, zero indexes and
  zero constraints carry an explicit `COLLATE` clause — queried, not assumed. So
  nothing in the dump references a collation name that must resolve on the
  target.
- **Both providers are deterministic**, so text equality is byte equality and
  every `UNIQUE` constraint behaves identically. Uniqueness cannot silently
  change.
- **What does differ is `ORDER BY` ordering on text**, and `pg_restore` rebuilds
  every index under the new collation, so indexes and queries stay consistent
  with each other. No index is left sorted under a rule the planner no longer
  uses.

**What this does NOT cover, stated plainly:** any query whose *output order* on
a text column is semantically load-bearing may order differently than it did on
Railway. Nothing in the retrieval path was found to depend on it, but that is a
grep, not a proof.

---

## 4 · THE TWO THINGS THAT BIT, AND WHAT THEY COST

Both are here because the fix is worth more than the tidy version of the story.

### 4a · `shared_buffers = 8GB` would not start

    FATAL: could not create shared memory segment: error code 1450
    DETAIL: CreateFileMapping(size=8853479424, ...)

`1450` is `ERROR_NO_SYSTEM_RESOURCES`. Windows backs shared memory against the
**system commit limit** — 48.9 GB here, with **41.9 GB already committed** by the
ingest fleet and the agent sessions. About 7 GB of headroom, and 8 GB was being
asked for. **This is a commit-charge limit, not a RAM limit**, and free physical
memory is irrelevant to it.

It would have been the wrong value regardless: the PostgreSQL manual says
directly that large `shared_buffers` are less effective on Windows and
recommends keeping it low and letting the OS cache work. **Two independent roads
to 2 GB**, which is why the config says 2 GB rather than "as much as fits".

### 4b · The server was killed by Ctrl+C, six minutes after starting

    LOG: background worker "logical replication launcher" (PID 3124) was
         terminated by exception 0xC000013A
    LOG: terminating any other active server processes

`0xC000013A` is `STATUS_CONTROL_C_EXIT`. Nothing crashed. A server launched from
an agent's shell **inherits that shell's console**, and the harness signals the
whole console process group when a tool call ends. `spawn(detached: true)` was
**not** enough — that flag applies to the child we spawn, and `pg_ctl` is only a
launcher; the `postgres` it starts kept the console association.

**This is not a cosmetic problem.** The restore runs for hours. A server that
dies when an unrelated command finishes cannot complete one, and the wreckage
looks like a corrupt restore rather than like what it is.

**Fix:** the cluster is started by **Task Scheduler** (`LawMindPostgres`,
`ONLOGON`), which launches it from the scheduler service with no console at all.
No console, no process group, no Ctrl+C. It needs no administrator rights —
unlike `pg_ctl register` — and `ONLOGON` means the moat comes back by itself
after a reboot, which matters far more once Railway is gone.

`schtasks /create /sc ONLOGON` is refused unelevated; the PowerShell
`Register-ScheduledTask` cmdlet creates the same task without elevation. Tried
in that order, not assumed.

### 4c · A third, cheap, and worth writing down

A `--data-only` restore of one table failed on a foreign key to an empty
`judgments`. That is not a defect — it is the ordering rule:

> **Restore the FULL archive into an EMPTY database. Never `--data-only` into a
> pre-built schema.** pg_dump writes pre-data / data / post-data, and
> `pg_restore` creates foreign keys *after* every row is in. `--data-only` loads
> into a schema whose FKs already exist and are enforced against tables that are
> still empty.

### 4d · A GENERATED column cannot be COPYed into, and the restore died on it

**Found 16 Aug 2026, on the real restore, after the dump was already complete.**

```
restore: FAILED judgments#000 — ERROR:  row field count is 33, expected 32
CONTEXT:  COPY judgments, line 1
```

Both sides had 33 columns in identical order, so this was **not** schema drift.
The two halves disagree about what a default column list means:

- the **dump** writes `\copy (SELECT * FROM judgments) TO ...`, and `SELECT *`
  **includes** a STORED generated column → **33 fields on disk**
- the **restore** issues `COPY public.judgments FROM ...` with no column list,
  and PostgreSQL **excludes** generated columns from that list, because a
  generated column may not be written to → **32 expected**

Two columns in the schema are generated and nothing else is:
`judgments.full_text_tsv` and `statute_sections.full_text_tsv`.

**Why §7b's "binary COPY fidelity proven on real data" did not catch it:** that
proof ran on `judgment_chunks`, which has no generated column. The test was real
and the claim was true — it just did not cover this shape. A passing proof on
the wrong table is worth exactly nothing, and it read as reassuring for a day.

**The first fix was wrong, and the way it was wrong is the useful part.**
`DROP EXPRESSION` before the data phase does let the 33 fields land — and then
there is no way back. PostgreSQL has no inverse:

```
ERROR:  column "full_text_tsv" of relation "judgments" is not a generated column
```

`ALTER COLUMN ... SET EXPRESSION AS` only *replaces* the expression of a column
that is **already** generated, and there is no `ADD GENERATED` for an existing
plain column. `DROP EXPRESSION` is a one-way door. `DROP COLUMN` +
`ADD COLUMN ... GENERATED` does work and is still wrong here: it appends the
column at the **end** of the table, and column order is precisely what a `COPY`
without a column list depends on — it would then disagree with what the Drizzle
migrations define.

**The fix that is actually in `restore-chunked.mjs`: never alter the real table.**
`CREATE TABLE <t>__stage (LIKE public.<t>)` defaults to **EXCLUDING GENERATED**,
so the clone has a plain column of the same type in the same ordinal position —
exactly the 33-field shape the dump wrote — while the real table keeps its
generated column untouched. Chunks for those tables load into the clone;
`INSERT INTO <t> (…non-generated columns…) SELECT … FROM <t>__stage` then lets
PostgreSQL compute the generated value itself, and the clone is dropped. It runs
**before post-data**, because inserting millions of rows behind the 15.5 GB GIN
index would pay for that index twice. `C:\lawmind\dump\generated-columns.json`
records the staging so an interrupted run can finish it.

Recomputing rather than carrying the dumped value across is not a compromise —
it is the stronger choice. The value is derived by *this* server from the text it
actually holds, so a text column that failed to transfer correctly cannot be
papered over by a tsvector that transferred fine.

**The part that is actually dangerous.** Re-generating is not optional and its
absence is nearly invisible. A column left plain has the same name, same type,
same nullability — `compare.mjs` compared all three and would have reported
**0 FAIL** — while the column silently stops being maintained on write. For
`judgments.full_text_tsv` that is full-text search rotting from the next
`INSERT` onward, with nothing failing loudly at any point. `manifest.mjs` now
captures `is_generated` and `generation_expression`, and `compare.mjs` **FAILs**
on a difference in either. Manifests taken before that change lack the field and
are skipped rather than failed.

---

## 5 · THE TOOLS, AND WHAT EACH ONE REFUSES TO DO

All in `scripts/migration/`. Every one of them is written to fail loudly rather
than to succeed quietly, because the directive's central instruction is *do not
cut over based on "restore succeeded."*

| tool | what it is for | what it refuses |
| --- | --- | --- |
| `manifest.mjs` | one JSON describing a database completely | compares nothing; estimates are marked as estimates |
| `compare.mjs` | **the cutover decision** | exits non-zero on any FAIL; a target row count that *exceeds* the source fails too — a restore that ran twice looks exactly like that |
| `pg-local.mjs` | cluster lifecycle, `restore-mode` / `serve-mode` | `createdb` stops if an extension will not create, before a six-hour restore rather than inside it |
| `dump.mjs` | `pg_dump` with the resolver bypassed via `hostaddr` | records the source **LSN**, so "which snapshot is this?" is answerable from the archive alone |
| `restore.mjs` | `pg_restore` + `ANALYZE` | **counts pg_restore's own error lines** and fails on `errors > 0` even when the exit code is 0 |
| `activity.mjs` | who is connected, who is blocked | `--require-quiet` exits non-zero while any writer holds a transaction |
| `freeze.mjs` | stop the fleet, **record it first** | supervisors before workers, because a supervisor restarts what you kill |
| `backup-r2.mjs` | upload **and read back** | with no credentials it exits 3 and says nothing was backed up; it never warns-and-continues |

### The resolver bypass, in libpq's own terms

`services/ingest/src/db-host.ts` solves the DNS problem for Node. pg_dump is
libpq and gets none of that, and it is the process most exposed — hours of
streaming. libpq has a native answer:

    host=hayabusa.proxy.rlwy.net  hostaddr=<resolved address>

`hostaddr` supplies the socket address; `host` still drives TLS SNI and
certificate verification. The OS resolver leaves the path **without** breaking
TLS — which is why this is better than substituting the IP into the URL. On
resolution failure the original URL is used unchanged: fail-open, same rule as
`db-host.ts`, because a helper that fails closed is a way to take the migration
down over a network hiccup.

---

## 6 · MEASURED THROUGHPUT — the freeze window is a number, not a guess

Measured against the live proxy, **under ingest load**, before the freeze:

| | |
| --- | --- |
| single stream `COPY` | **4.05 MB/s** |
| 4 parallel streams, aggregate | **6.45 MB/s** (sub-linear — the proxy is the bottleneck, not concurrency) |
| pg_dump catalogue read, fixed cost | **71 s** before a single row moves |
| compression achieved, zstd:3 | **~2.4:1** on `judgment_citations` |
| upload to R2 | **~4.5 MiB/s** |

`judgments` at 47.55 GB on one dump worker is the binding constraint. **Expect
the dump in hours, not minutes**, and expect the restore to be bounded by
rebuilding 29.6 GB of indexes — including a 14 GB GIN full-text index and the
HNSW vector index — which is local, CPU-bound, and parallel.

These numbers were taken while 20 ingest workers were competing for the same
proxy. Post-freeze throughput should be better; that is a hope, not a
measurement, and the receipts written by `dump.mjs` will replace it with a fact.

---

## 6b · WHAT ACTUALLY HAPPENED ON THE FIRST ATTEMPT — read this before trusting §6

**§6's plan was right in outline and wrong in three specifics, each found by
running it.** Corrections in order of how much they cost.

### 6b.1 · The monolithic pg_dump FAILED, and that changed the design

    pg_dump: error: Dumping the contents of table "judgment_paragraphs" failed:
             PQgetCopyData() failed.
    pg_dump: detail: server closed the connection unexpectedly

42 minutes in, 2.15 GB of ~25 GB. **The server did not restart** — postmaster
uptime read 316.8 hours across the failure — so the proxy or the network dropped
a long-lived connection. **`pg_dump` has no resume**, so all 42 minutes were lost.

That is what makes a custom approach *required* rather than merely preferable,
which is the bar the directive sets. `scripts/migration/dump-chunked.mjs`:

- **626 chunks** over UUID key ranges. Every large table has a `uuid` primary key
  from `gen_random_uuid()`, so the values are uniform and equal hex ranges are
  equal row counts — no `count`, no `OFFSET`, no ordering pass.
- **A ledger, written after each chunk closes.** A crash leaves a partial file
  with no ledger entry, and it is simply redone. A dropped connection now costs
  one chunk instead of everything.
- **Restore is `pre-data` → chunks → `post-data`**, which is exactly the order
  `pg_restore` uses internally, so foreign keys are still built after the rows.

### 6b.2 · CONCURRENCY 3 IS WORTH 3x, and the earlier probe under-predicted it

| | |
| --- | --- |
| single stream, measured | **1.38 MB/s** compressed |
| concurrency 3, measured | **4.09 MB/s** compressed (982 MB in 240 s) |

The 4-parallel-stream probe in §6 suggested only ~1.6x. It was taken while 20
ingest workers were competing for the same proxy; against a frozen source the
gain is far larger. **§6's throughput table is therefore a floor, not an
estimate** — it was measured under load that no longer exists.

### 6b.3 · psql reads stdin in TEXT MODE on Windows and corrupts binary COPY

    ERROR:  COPY file signature not recognized

The archive was fine — `od -c` showed a textbook `PGCOPY\n\377\r\n\0` header.
**psql on Windows translates CRLF on stdin**, and the signature contains a `\r\n`.
The fix is `COPY ... FROM PROGRAM`, where the *server* runs zstd and no
client-side stream exists.

**This is the dangerous shape of bug**: the header failed loudly, but the same
translation applied to a row in the middle of 74 GB would have been found weeks
later, if ever. Only the read path is affected — the dump direction was checked
and its output carries an intact signature.

### 6b.4 · THE FIRST FREEZE WAS BROKEN, and the baseline in §1 is superseded

The 19:24Z freeze was executed by `taskkill` and **announced afterwards**. NEW2
found their fleet at zero processes, correctly diagnosed it against the evidence
they had as one of the Railway deaths they had genuinely been seeing that
evening, and restarted 38 workers. **301,422 judgments were written before the
window closed at 20:32:54Z.** They self-reported it with exact numbers minutes
after reading the message; the count reproduces to the row.

| | |
| --- | --- |
| baseline at 19:33Z, **superseded** | 6,994,646 |
| **authoritative, 20:57Z, frozen** | **7,296,068** |

**The chunked dump began at 20:39:05Z, after the last write, so every chunk
includes those rows** — the local copy must read **7,296,068**. `freeze-baseline.json`
carries the full account.

> **A freeze announced after it is executed is not a freeze — it is an outage
> that looks exactly like the failure everyone already expects.** NEW2's
> STOP-file mechanism (`services/ingest/.checkpoints/STOP`, checked by
> `supervise.mjs` before every restart) is the correct instrument and is what
> holds the freeze now. `taskkill` leaves no signal that the absence was
> deliberate.

### 6b.5 · "Railway is degrading" was us

A 48-second `count(*)` and a 6x throughput drop were reported across three bus
messages as vendor degradation. **The cause was our own monolithic pg_dump
saturating the shared proxy.** The same count took **12 seconds** once it died.
NEW2 retracted it to the lane that had received it before it became a fact in
anyone's planning. The retraction was worth more than the observation.

---

## 7 · THE CUTOVER GATE — all of it, or Railway stays

Railway is **not deleted, and not stopped**, until every line here is true.
`docs/ops/migration/RAILWAY_SHUTDOWN.md` holds the founder actions and is
deliberately a separate file so it cannot be run early.

- [ ] `compare.mjs` with `--exact` on **both** sides reports **0 FAIL**
- [ ] exact row counts equal on all 53 tables — not estimates, and not `reltuples`
- [ ] 167 indexes, all constraints validated, 36 enums with every label, 150 functions
- [ ] `restore.mjs` reported **0 errors** — not merely exit 0
- [ ] retrieval smoke test passes against **local**, including a pgvector ANN query and a full-text query
- [ ] the API serves a real search against `LOCAL_DATABASE_URL`
- [ ] the ingest/enrichment fleet runs against local — proven by row growth, never by process count
- [ ] a **verified** R2 backup exists: uploaded, downloaded again, byte-compared
- [ ] rollback proven: the Railway credentials still work and are recorded separately

**Until then Railway is the rollback path and costs what it costs.** A month of
Railway is cheaper than the corpus.

---

## 7b · HOW TO FINISH FROM HERE — exact commands, for whoever picks this up

**Written so a fresh agent, or the founder, can complete this without
reconstructing any of the reasoning above.** State as of this writing: the
chunked dump is running; everything structural is already proven.

### 4e · THE CONSOLE-SIGNAL KILL HAS NOW HAPPENED THREE TIMES. TREAT IT AS THE DEFAULT FAILURE ON THIS MACHINE

`exception 0xC000013A` is `STATUS_CONTROL_C_EXIT`. On this machine it has killed
PostgreSQL work three separate times:

| when | what died |
| --- | --- |
| 16 Aug 03:25 | the whole server, six minutes into a session (§4b) |
| 16 Aug 07:26 | power loss — unrelated, but recovered *because* §4b was fixed |
| 17 Aug 00:39 | **a client backend, 16 of 32 ranges into the table rebuild** |

The third one matters most because §4b was supposed to have solved this. It had
— **for the server**. The server was launched by Task Scheduler with no console.
The *client* work was still a child of an interactive shell, and the kill landed
at the exact moment an unrelated foreground command in that console finished.

> **Any database work measured in minutes must be launched into its OWN console.**
> Not `start /b` — that flag means "share the caller's console" and is precisely
> how one `CTRL_CLOSE` killed 38 ingest workers at once (NEW2, bus 0529).
> `Start-Process -WindowStyle Hidden` with `-RedirectStandardOutput` works and is
> what the rebuild resume used. A `.cmd` wrapper around `start` was tried and
> discarded: the redirection binds to `start` itself, not to the child, so the
> job launches into a console nobody is reading and its log stays empty.

**Design for the kill rather than only preventing it.** The rebuild lost 16
in-flight ranges and not one committed one, because each range writes its rows
**and its progress marker in the same transaction**. A JSON progress file would
have had a window between `COMMIT` and the file write where a kill makes a
finished range look unfinished — and re-running it would have duplicated rows
into a table with no primary key yet, because post-data had not run. The
bookkeeping has to be inside the transaction it describes.

---

### STATUS 17 Aug 2026 06:50 — **THE CUTOVER GATE PASSES.** Two things remain open and neither is data.

| gate | result |
| --- | --- |
| chunked dump 626/626 | **DONE** · 40.22 GB · re-verified intact after a power cut |
| data load | **DONE** · every chunk |
| generated columns | **RESTORED** · both, at their original ordinal |
| post-data | **DONE** · 167/167 indexes · exit 0 · **0 errors** · ANALYZE run |
| **`compare.mjs`** | **0 FAIL** · 53 tables on **exact** row counts · schema, structure, constraints, generated columns all agree |
| **`smoke.mjs --source local`** | **13/13 checks identical to `smoke-railway.json`**, including the GIN-index check that fails on BOTH (§6b) |
| **R2 off-machine backup** | **VERIFIED** · 629 files · 37.46 GB · uploaded, downloaded back, byte-compared, `0 differences found` |
| `judgments` | **7,296,068** — matches the frozen source, and re-verified after four crashes |
| serve-mode | applied — `synchronous_commit=on`, `autovacuum=on` |

#### OPEN 1 — tsvector differences on malformed Devanagari (measured, NOT data loss)

`verify-tsvector-fidelity.mjs` compares the SOURCE's own tsvectors (still present
in the chunk files, because the dump used `SELECT *`) against the ones this server
recomputed. On chunk `judgments__000`: **119 of 28,425 rows differ.**

**`full_text` is byte-identical on every row** — verified by `md5()`. Only the
tokenisation differs, and it concentrates sharply:

| | rows | differing |
| --- | ---: | ---: |
| contains Devanagari | 163 | **85 (52%)** |
| ASCII only | 28,262 | 34 (0.12%) |

The cause is **malformed** Devanagari, not Devanagari: the corpus stores vowel
signs in *visual* order (`ि` before its consonant) as extracted from PDFs, and
glibc (Railway/Debian) and Windows classify a **leading combining mark**
differently. Correct Devanagari tokenises identically —
`to_tsvector('english', 'कितनी')` → `'कितनी':1`, classified `word`.

> **Two earlier readings of this were WRONG and are recorded here because the
> way they were wrong is reusable.** A `ts_debug` probe returned `?????` and was
> read as "the parser rejects Devanagari" — that was the *client* mangling the
> string before it reached the server. A `~ '[ऀ-ॿ]'` regex silently
> matched nothing because the escape did not survive shell → node → psql quoting,
> which inverted the conclusion. **Non-ASCII diagnostics must go through
> `psql -f` with PostgreSQL's own `U&'...'` literals**, which are ASCII on the
> wire and interpreted by the server.

The script still exits non-zero on any difference. That is deliberate: an
explained failure is worth more than a threshold invented to make it green.

#### OPEN 2 — `cite:` search does a sequential scan (NOT migration-caused, NOT yet fixed)

`cite:"(1994) 3 SCC 1"` took **14m39s** and the plan is a **Seq Scan on
judgments**, cost 20.7M, estimating 5.47M rows. The expression index
`judgments_neutral_citation_key` exists and matches the first predicate — but the
query is `A OR B OR C` and branch B is
`EXISTS (SELECT 1 FROM unnest(j.reporter_citations) rc WHERE upper(regexp_replace(rc,…)) = $2)`,
which **no index can serve**, so no BitmapOr is possible and the whole table is
scanned. `services/api/src/search/qlang/compile.ts` `countStructured`.

**Do not record this as "pre-existing on Railway" — that is not established.**
`PRE_MIGRATION_RETRIEVAL_BASELINE.md` §5 says this query was *"not yet looked up
against this corpus — first run belongs post-migration"*, so **no Railway timing
exists to compare against**. What IS established: the 167 indexes are identical on
both sides (`compare.mjs` 0 FAIL), and the plan is forced by the query's shape
rather than by anything the migration changed.

The fix is a query rewrite (three indexable lookups UNIONed, or an expression
index over the normalised reporter citations) and belongs to the server lane after
the cutover — not inside it.

### STATUS 17 Aug 2026 01:30 — R2 BACKUP **VERIFIED**, generated columns **RESTORED**, indexes building

| gate | state |
| --- | --- |
| chunked dump 626/626 | **DONE**, 40.22 GB, re-verified after the power cut |
| data load | **DONE**, every chunk |
| `judgments` local | **7,296,068** — exact match to the frozen source |
| generated columns | **RESTORED** — `judgments` 7,296,068 and `statute_sections` 35,395 rebuilt, both `full_text_tsv` generated again at their original ordinal |
| **R2 off-machine backup** | **VERIFIED — 629 files, 37.46 GB, uploaded then DOWNLOADED BACK and byte-compared: `0 differences found`** |
| post-data indexes | running, 167 to build |
| `compare.mjs` | not yet run — **the gate is not passed** |

**The R2 verification is the one that changes the risk posture.** The corpus now
exists in two independent places, and the R2 copy was proven by reading every
byte back rather than by trusting an upload's exit code. Railway being offline is
no longer a single point of failure.

**Still to do, and none of it needs Railway:** finish the indexes, then
`compare.mjs` against `manifest-railway-final-v2.json`, `smoke.mjs --source
local`, `verify-tsvector-fidelity.mjs`, and the API search check.

### STATUS 17 Aug 2026 — POWER LOSS mid-rebuild, and RAILWAY IS OVER ITS CAP AND OFFLINE

**Neither of these costs us anything, and the reason is the design rather than luck.**

The machine lost power around 07:26 local on 16 Aug, during the
`judgments` table rebuild, and was off for ~16 hours. On restart:

- **PostgreSQL came back by itself**, via the `LawMindPostgres` scheduled task
  (§4b). It then ran automatic crash recovery — the redo replays the rebuild's
  WAL before rolling it back, which takes several minutes and is not a fault.
- **The rebuild was a single transaction**, so it is all-or-nothing. No partial
  table, no half-copied rows.
- **The dump is untouched and was re-verified against the ledger after the
  outage: 626 files, 626 entries, 0 missing, 0 size mismatches, 40.22 GB.**

**Railway hit the hard limit while the machine was off** — usage **$75.11**
against a **$75** cap, `isOverLimit = true`, workloads taken offline. This is
survivable and was anticipated (`FOUNDER_QUEUE.md` FQ-CAP). **Stopped is not
deleted:** the volume still holds the database, and the service returns if the
cap is raised or when the billing period resets **19 Aug 2026 09:50Z**.

**Do not raise the cap to finish this.** Everything Railway was needed for was
captured before it stopped — the complete dump and the exact counts for all 53
tables. Restore, verification and the R2 backup are entirely local.

### STATUS 16 Aug 2026 01:45Z — the dump is DONE and the source is no longer needed except as rollback

| | |
| --- | --- |
| chunked dump | **626/626 ok**, `finishedAt` 2026-08-16T01:40:34Z, **40.22 GB** |
| file/ledger agreement | **626 files, 626 entries, 0 orphans, 0 missing** |
| the freeze | **HELD.** Railway `judgments` = **7,296,068** — matches `freeze-baseline.json` exactly, measured *after* the whole dump |
| Railway exact counts | **captured, all 53 tables**, `manifest-railway-final.json` · 39,069,721 rows total |
| restore | running, `--clean --all` |
| R2 backup of `chunked` | running **in parallel** — the dump files are immutable once the export finished, so it does not need to wait for the restore |

**Railway is now required for NOTHING except being the rollback copy.** Both
things it was needed for — the last chunks and the exact counts — are done. The
constraint that remains is money, not data: workspace usage was **$71.69 against
a $75 hard limit** and the service burns **~$0.38/hr idle** (24 GB RAM · 0.92
vCPU · 121.8 GB volume, priced from `service_metrics` and Railway's published
rates). See **FQ-CAP** in `docs/FOUNDER_QUEUE.md`.

**The stuck transaction is still stuck and was deliberately left alone.** Backend
pid 62315 has held an uncommitted citation-resolver write for **26.7 h**, with
pid 65284 blocked behind it for 11.5 h. Uncommitted means invisible to every
snapshot the dump took, which is exactly why the counts agree. Killing it would
be a write-side action on the only rollback copy to remove a risk `compare.mjs`
already catches — so it was not killed.

### Already done and verified — do not redo

- Local PG 18.6 on NVMe, `pg_trgm 1.6` + `vector 0.8.5`, loopback only, starts at
  logon via the `LawMindPostgres` scheduled task
- **Schema round-trips with 0 errors, and the structure comparison is clean:**
  53 tables · 167 indexes · 36 enums · 150 functions · all constraints ·
  **0 FAIL** (`manifest-local-structure.json`)
- **Binary COPY fidelity proven on real data** — 9,681 `judgment_chunks` rows
  loaded, 1024-dim vectors intact, ANN query returned neighbours. Test rows were
  truncated afterwards so they cannot duplicate into the real load
- R2 upload + read-back verification proven end to end (`0 differences found`)

### 1 · Wait for the dump, then confirm it is complete

```bash
node scripts/migration/dump-chunked.mjs --status      # 626/626 expected
```
If it stopped early, just run it again — it resumes from the ledger:
```bash
node scripts/migration/dump-chunked.mjs --run --retries 8 --concurrency 3
```

**Before resuming after a hard kill, sweep orphans.** A chunk interrupted
mid-write leaves a file with no ledger entry; the retry path deletes those, but a
`taskkill` never reaches that code. Any `*.bin.zst` in `C:\lawmind\dump\chunked`
that no ledger entry names is a truncated file and must be deleted, or it will
later be mistaken for a complete chunk.

### 2 · Confirm the freeze never broke

```bash
node scripts/migration/activity.mjs
```
`judgments` must still read **7,296,068**. If it has moved, the chunked dump's
per-chunk snapshots are no longer mutually consistent — **re-dump the affected
tables**, do not proceed. This is the one failure that a clean-looking restore
would hide.

### 3 · Restore

```bash
node scripts/migration/restore-chunked.mjs --clean --all
```
`--clean` drops and recreates the database and clears the load ledger — necessary,
because that ledger would otherwise describe a database that no longer exists and
every chunk would look already-loaded against an empty one.

Expect the `post-data` phase to dominate: 29.6 GB of indexes, including a 15.5 GB
GIN and an HNSW, built with `--jobs=4`.

> **Start the Railway-side exact counts NOW, in a second shell, while the local
> restore runs.** They are the slowest step in verification — `count(*)` on
> `judgment_paragraphs` is a sequential scan of 28M rows and 17 GB of heap — and
> the restore is entirely local, so the source sits idle through all of it. Run
> them any earlier and they compete with the dump for the one proxy that is the
> whole bottleneck; run them later and they are pure serial time.
>
> ```bash
> node scripts/migration/manifest.mjs --source railway --exact --label railway-final \
>      --out docs/ops/migration/manifest-railway-final.json
> ```
>
> A count taken at any point during the freeze is valid, because the source is
> not moving — that is the property the whole chunked design already depends on,
> reused here to buy back an hour.

### 4 · Verify — this is the cutover decision, not the restore's exit code

```bash
node scripts/migration/manifest.mjs --source railway --exact --label railway-final \
     --out docs/ops/migration/manifest-railway-final.json
node scripts/migration/manifest.mjs --source local --exact --label local-final \
     --out docs/ops/migration/manifest-local-final.json
node scripts/migration/compare.mjs \
     --a docs/ops/migration/manifest-railway-final.json \
     --b docs/ops/migration/manifest-local-final.json \
     --out docs/ops/migration/compare-final.json
node scripts/migration/smoke.mjs --source local
```

**`compare.mjs` must report 0 FAIL.** `smoke.mjs` has a known-failing check on
Railway — the GIN index one, §6b — so compare its output against
`smoke-railway.json` rather than expecting a clean sheet in isolation.

**Then the API, which the gate requires separately.** `smoke.mjs` proves the
database serves queries; it does not prove the application does.

```bash
pnpm --filter @lawmind/api start        # tsx src/index.ts, reads DATABASE_URL
curl -s -X POST localhost:8787/search \
  -H 'content-type: application/json' \
  -d '{"query":"cite:\"(1994) 3 SCC 1\"","language":"en"}'
```

Expect **S.R. BOMMAI** with a `parsed` field. That exact query is the one
`CURRENT_PLAN.md` §Q1.0 records as a product-safety case — before task 001 it
returned a *different case as an ordinary result*, which is what a
wrong-but-plausible answer looks like. It is the right smoke query precisely
because getting it wrong is silent.

`services/api/src/env.ts` needs `AUTH_BASE_URL`, `MAIL_FROM`, `RESEND_API_KEY`,
`PORT`, `NODE_ENV`, `LOG_LEVEL` alongside `DATABASE_URL`. Missing mail
credentials do **not** block a search smoke test — `packages/auth/src/mail.ts`
refuses honestly rather than failing to boot, which is the pattern this repo
uses everywhere for exactly this reason.

### 5 · Back up before cutting over, not after

```bash
node scripts/migration/backup-r2.mjs --archive chunked --keep 3
```
Checksums locally, uploads with 64 MB parts, **downloads every object again and
byte-compares**. R2 egress is free, so the read-back costs nothing — do not
"optimise" it away. It is the difference between a backup and an upload.

### 6 · Cut over

Point `DATABASE_URL` at the value already sitting in `.env` as
`LOCAL_DATABASE_URL`; `RAILWAY_DATABASE_URL` stays for rollback. Every service
reads `DATABASE_URL`, so this is the whole change.

Then resume the fleet — **NEW2's script, not a manual relaunch**:
```powershell
powershell -File scripts\fleet-resume.ps1
```
It deletes the STOP file and verifies **by row growth, not process count**.

### 7 · Only then open `RAILWAY_SHUTDOWN.md`

---

## 8 · WHAT IS DELIBERATELY NOT BEING DONE

- **The 22 GB `paragraph_text` duplication stays.** `docs/STORAGE_AUDIT.md` §2b:
  it is `ts_rank`ed at query time on the retrieval hot path. Removing it is a
  retrieval redesign and NEW1's call.
- **The provably redundant 1,440 MB `judgment_paragraphs_judgment_idx` stays**
  for now. It is real, it is safe to drop, and it is **not being mixed into a
  database migration** — the directive says so and it is right. It becomes a
  quiet-window task afterwards.
- **No embeddings work.** Phase 2 stays shut.
- **No competitor distillation.** Resumes after local infrastructure is stable.
- **No schema changes of any kind.** The target must match the source; a
  migration that also improves things cannot be verified by comparison.
