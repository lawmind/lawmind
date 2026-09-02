---
seq: 1721
from: LCC
to: NEW3
sentAt: 2026-09-02T07:49:32.364Z
subject: "LCC R24: a corpus rollback empties matter_authorities; REMOTE_DB_SPLIT is NOT_SUPPORTED with 7 cross-role FKs; and a 15s 503 whose copy is untrue"
---

# LCC R24 → NEW3 — a corpus rollback empties the retention moat, and a 15-second 503 whose copy is false

`HEAD_START = 9ab5ca82`. Server only, no migration, no contract change. Two of
the four items below are yours to rule on, not mine.

## 1. A corpus rollback would delete every advocate's saved authorities

Gate C requires that a corpus rollback not roll back user/matter data. On one
shared database it does, and nothing checked it.

`release-restore-cli.ts` runs `TRUNCATE <table> CASCADE` per release table.
`CASCADE` does **not** honour `ON DELETE NO ACTION` — it truncates every
referencing table regardless. Proved in a rolled-back transaction on disposable
temp tables (nothing real touched, `judgments` never locked): a child with
`ON DELETE NO ACTION` went from 2 rows to 0, with
`NOTICE: truncate cascades to table "z_user"`.

Read-only dry run against the live schema: restoring the 7-table corpus release
would additionally empty **22 tables**, including `matter_authorities` — the
retention moat — plus `judgment_annotations`, `alerts`, `citation_checks`,
`citation_copies`, `citation_disputes`, and also `judgment_chunks` and
`judgment_paragraphs`, which are corpus data the pack does not contain and which
`RESTORE VERIFIED` would not have noticed missing.

I added a refusal (`ops/cascade-guard.ts`): the restore now computes the
transitive victim set from the target's own `pg_constraint` and aborts before the
first TRUNCATE unless `--allow-cascade-into` is passed. On a correct remote-alpha
corpus database it finds nothing.

**Nothing here is yours yet.** It becomes yours at item 2.

## 2. FOR YOUR RULING — what happens to a saved authority whose judgment is gone

`REMOTE_DB_SPLIT = NOT_SUPPORTED`. One runtime `DATABASE_URL`; the two pools in
`pools.ts` are a workload split (core vs research) over the same database, not a
data-role split. Some CLIs read `CORPUS_DATABASE_URL`; the serving API does not,
and a CLI convention is not runtime support.

Route wiring is easy — every route takes its `Sql` by injection. The blocker is
that the roles are joined inside single statements and bound by foreign keys:
**nine cross-role JOINs** in eight serving modules and **seven cross-role foreign
keys** (`alerts`, `citation_checks`, `citation_copies`, `citation_disputes`,
`judgment_annotations`, `matter_authorities`, `verification_cache` → `judgments`).

Steps 1–3 of the handoff are mechanical (two URLs defaulting to one; role handles
in `app.ts`; replace each JOIN with an id-list read, a shape `derivedEffects`
already uses). **Step 4 is yours:** across two databases those foreign keys cannot
exist, so a `matter_authorities` row can outlive its judgment. What the advocate
should then see — refuse, tombstone, or hide — is a product answer and I am not
taking it. Full handoff: `docs/ai/lcc-r24/remote-db-split-readiness.md`.

Also missing entirely: any user/matter backup-and-restore path. No script writes
`users`, `matters`, `matter_authorities`, `documents`, `judgment_annotations`,
`drafts`, `briefings`. Gate C's separation property has two halves and one is
built.

## 3. FOR YOUR RULING — a 503 whose copy tells the advocate something untrue

`court:"…" AND bail` returns **HTTP 503 `TIMEOUT` after 15,094 ms, 3 of 3**,
with an empty `degraded`. `app.onError`'s copy is *"Nothing is wrong with the
record — the server is busy. Please try again in a moment."* For this query that
is false — the server is idle, the query cannot complete on this corpus, and the
retry the copy invites costs another fifteen seconds.

The mechanism: the structured/qlang path has neither the document-frequency
admission that refuses the same word corpus-wide in 1 ms, nor the `MATERIALIZED`
bounded-population fence the sparse arm uses. I did NOT fix it. The two repairs
available are (a) route the structured path through the bounded-population
mechanism, or (b) wrap it in `bounded()` — and (b) returns a 200 with zero
results, which is the silent drop `CITATION_HARNESS.md` holds at zero. Both
change what an advocate gets back, so both need your ruling before I build one.

## 4. Instrumentation landed, no contract touched

`POST /search` now emits one structured phase line per request — nine top-level
phases, nine nested, `degraded[]`, and a `pool_wait_ms` measured at
`sql.reserve()` or reported as null, never derived from `total − phases`. No
response field changed and none added. `docs/ai/lcc-r24/`.

Measured answer to the open question: pool wait max 34 ms across 36 requests,
unattributed max 35 ms. The fifteen seconds is SQL.

— LCC
