# RELEASE PIPELINE — REHEARSAL V1

**Lane:** LCC · **Task:** LCC-7 (P1 PRE-STAGING) · **Date:** 24 Aug 2026
**Status:** export → migrate → restore → verify **PROVEN** on a Linux target.
Four cross-platform defects found, all of which would have shipped. Two
acceptance items NOT executed and named in §7.

**No production was deployed. No cloud was provisioned. Nothing was purchased.
The 291 GB factory was not cloned** — the rehearsal ran on 500 judgments.

---

## 1. The target

WSL2 Ubuntu 26.04 on the founder's own workstation, **PostgreSQL 18.6** —
byte-identical major/minor to the source (`18.6`) — with `pgvector` and
`pg_trgm` from Ubuntu's own repository. It is disposable, local, and free.

WSL runs in mirrored networking here, so the Linux server is reachable from
Windows on `127.0.0.1:5433` and the whole rehearsal drives from the Windows side
with the same tooling a deployment uses.

---

## 2. The schema arrives by migration, not by dump

`pnpm --filter @lawmind/db migrate` against an **empty** Linux database:

```
migrations applied · pg_extension: pg_trgm, plpgsql, vector
```

**All 81 migrations applied clean.** `pgvector` verified from `pg_extension`
rather than assumed. **37 enum types present** on the target.

That last number is the point. A `pg_dump -t`-based release does **not** emit
the `CREATE TYPE` its own columns depend on, so it fails on exactly the
enum-bearing tables and succeeds on the rest — a half-restored schema that reads
as a partial success. Building the schema the way production builds it removes
the failure mode instead of testing it.

---

## 3. The export carries the law and nothing else

`services/api/src/ops/release-export-cli.ts`. The approved serving set is
**enumerated, never derived** — a rule like "everything that is not user data"
silently includes the next table somebody adds:

```
judgments · judgment_citations · judgment_judges · judgment_statute_refs
statutes · statute_sections · lexeme_document_frequency
```

What was **considered and refused** is named in the file beside it: identity
tables, matters and client detail, uploaded documents, an advocate's own work,
platform records, telemetry — and `judgment_chunks` / `new1_doc_vector_stage`,
because the retrieval representation is NEW1's decision and this round forbids
promoting the staged vectors.

The manifest records, per table, the row count and a content checksum, plus the
schema version, the extensions the source actually had, and **the source
collation**.

```
release 2026-08-24.mt7hjgc6

  judgments                          500 rows   4,138,219 bytes
  judgment_citations                 559 rows      71,711
  judgment_judges                      0 rows           0
  judgment_statute_refs               36 rows       6,242
  statutes                           846 rows     300,529
  statute_sections                35,395 rows  75,852,632
  lexeme_document_frequency      128,243 rows   5,988,480
```

The slice is referentially closed: only citation edges whose **both** ends are
inside it are exported, and the id set is resolved **once** and bound as a
literal array so two tables cannot disagree about which 500 judgments they mean.

---

## 4. The restore verified

```
target 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)  collation C.UTF-8  encoding UTF8
extensions: pg_trgm@1.6, plpgsql@1.0, vector@0.8.1
enum types: 37

  judgments                    rows      500/500      ok   checksum ok
  judgment_citations           rows      559/559      ok   checksum ok
  judgment_judges              rows        0/0        ok   checksum ok
  judgment_statute_refs        rows       36/36       ok   checksum ok
  statutes                     rows      846/846      ok   checksum ok
  statute_sections             rows    35395/35395    ok   checksum ok
  lexeme_document_frequency    rows   128243/128243   ok   checksum ok

ANALYZE...  375 ms

RESTORE VERIFIED
```

`ANALYZE` is part of the pipeline, not an afterthought: without it the target's
statistics say every table is empty and the first real query gets a plan built
for no rows — the same class of failure as the sparse arm's constant estimate,
arriving on day one of a new deployment.

---

## 5. Four defects the rehearsal found, every one of which would have shipped

### 5.1 COLLATION — the source's cannot exist on Linux

```
source  English_United States.1252
target  C.UTF-8
```

**No Linux PostgreSQL can offer the source's collation.** Text ordering is not
identical between them, which reaches `ORDER BY case_title`, **every btree index
on a text column**, and therefore keyset pagination.

This is reported as a FINDING and not a failure, deliberately: there is no Linux
collation that would satisfy the check, so refusing the restore would mean
nothing could ever ship. What it establishes is the rule — **a cross-platform
physical data-directory copy is refused outright, and a logical restore must
REBUILD its indexes rather than receive them.**

### 5.2 GENERATED COLUMNS — `SELECT *` includes them, `COPY FROM` excludes them

```
22P04  extra data after last expected column
COPY judgments, line 1: "00000057-499a-...
```

`judgments.full_text_tsv` is `GENERATED ALWAYS AS ... STORED`. The export's
`SELECT *` emitted it; `COPY judgments FROM STDIN` refuses to be told a
generated column's value. Erroring is the **good** outcome — the same mismatch
in a table where the extra column happened to land inside another column's type
would load silently and wrongly.

Both sides now enumerate columns from `pg_attribute` where `attgenerated = ''`,
and the list is written into the manifest so neither side infers it.

### 5.3 COLUMN ORDER HAS DRIFTED FROM THE MIGRATIONS

`judgments` has the **same 38 columns** on both sides — nothing missing, nothing
extra — but **eight sit at different ordinals** on the live database than in one
built by running the migrations from empty:

```
cnr · native_text · petitioner · respondent
parties_extraction_method · disposal_nature · source_bench_code · hc_document_class
```

The mild consequence is that `row::text` renders differently, which made a
correct restore look corrupt. **The serious one is that a positional `COPY table
FROM STDIN` — the spelling without a column list — would load each value into
whatever column now sits at that ordinal. That does not error. It writes `cnr`
into `native_text`.**

The explicit column list already prevents it. The drift itself is real and is
recorded here rather than repaired: reconciling the live schema's ordinals with
the migration history is its own piece of work.

### 5.4 THE VERIFICATION ITSELF WAS PLATFORM-DEPENDENT, three ways

Each found by a restore reporting corruption on a load where **every row had
arrived**:

1. **`TimeZone`.** `row::text` renders `timestamptz` in the session's zone —
   `…09:31:01.666724+00` on one side, `…13:31:01.666724+04` on the other. Same
   instant, different string.
2. **`LC_CTYPE`.** `ROW(...)::text` quotes a field when it "needs" quoting, and
   that test calls `isspace()`, which is locale-dependent. On one real row,
   byte-identical data, both sessions pinned to UTC:
   ```
   source (Windows-1252 ctype)  (…,3,"aiàiáªàåzéã",40537)
   target (C.UTF-8 ctype)       (…,3,aiàiáªàåzéã,40537)
   ```
3. **Collation in the sort key.** Aggregating a digest `ORDER BY lexeme` orders
   the rows differently on each platform.

Fixed: both sessions pinned to `UTC` / `ISO, YMD`; the digest taken over
`concat_ws` of **name-sorted** columns cast individually (so no composite
quoting is involved) with a `chr(31)` separator and `chr(30)` for NULL; and
`COLLATE "C"` on every text sort key, because byte order is the one ordering the
two platforms agree on.

**A verification that reports corruption on a correct restore is worse than no
verification, because the next real corruption is the one nobody believes.**

---

## 6. Two implementation traps worth recording

- **`pipeline()` never resolves on postgres.js's COPY readable.** The first
  table hung forever and it looked like a slow query against
  `judgment_citations` — which it was not: the same predicate measured 23 ms on
  its own. Waiting on the readable's own `end` completes it; waiting on the
  destination's `finish` is what makes a zero-row table still leave a file.
- **A COPY leaves its connection in copy mode** and postgres.js does not always
  return it to the pool cleanly. Sharing the pool wedged the next statement in
  `Client/ClientRead` for 224 seconds — server finished, client never read. One
  connection per COPY, opened and closed, costs seven handshakes and cannot
  wedge anything.

---

## 7. NOT DONE — named, not implied

- **The simulated partial transfer did not execute.** `--truncate-table` is
  implemented and the reasoning is in the file, but the run wedged on the
  restore side's shared COPY connection (§6) and repeated attempts to apply the
  same per-connection fix corrupted the file's line endings twice. It was
  reverted to its committed, working state and **stopped** rather than attempted
  a fourth time. The property it would demonstrate — that `COPY FROM` accepts a
  truncated file and returns success, so only the checksum can catch it — is
  therefore **asserted in the code comments and not yet observed.**
- **No bad-release / rollback drill was run.** Rolling a legal snapshot back
  without rolling back user DB state needs a versioned-release story that does
  not exist yet; there is no second release to roll back to.
- **No exact-search equivalence battery.** The target holds 500 judgments and no
  indexes were rebuilt on it, so a search comparison would measure the slice
  rather than the pipeline. It needs a larger rehearsal in a quiet window.
- **No index build was timed.** The target inherited whatever the migrations
  create; nothing was measured about HNSW or GIN build cost on Linux.
- **`pgvector` versions differ** — source `0.8.5`, target `0.8.1` (Ubuntu's
  packaged version). It did not matter here because no vector data was exported,
  and it will matter the moment any is. Recorded, not resolved.
- **The `0070` migration file is ten columns behind the deployed view.** Found
  while fixing NEW1's 1079. Anyone reading it to understand eligibility is
  reading a snapshot, not the contract.
- **This proves a 500-judgment slice.** Timings here say nothing about a
  full-corpus release, and the export of `judgments` alone was 4 MB for 500 rows
  — the full table is 151 GB.
