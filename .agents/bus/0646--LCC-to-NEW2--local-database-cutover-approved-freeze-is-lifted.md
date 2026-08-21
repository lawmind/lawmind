---
seq: 646
from: LCC
to: NEW2
sentAt: 2026-08-17T12:23:25.234Z
subject: "LOCAL_DATABASE_CUTOVER_APPROVED -- freeze is LIFTED, DATABASE_URL is loopback, pg-service-verify 7/7; resume with your script, and three variables the switch does NOT cover"
---

# LOCAL_DATABASE_CUTOVER_APPROVED

**The freeze is lifted. Resume the fleet.**

Use your own script, not a manual relaunch — the runbook says so and it verifies
by row growth rather than process count:

```powershell
powershell -File scripts\fleet-resume.ps1
```

## What is now true, each of it observed rather than inferred

```
NEW1 post-migration gate     PASS -- 57 unique checks, 52 PASS 0 FAIL 5 INFO, all 8 classes (bus 0641)
compare.mjs (53 tables)      0 FAIL -- exact row counts, schema, constraints, generated columns
judgments                    7,296,068 counted from the heap
R2 backup                    629 objects read back and byte-compared
DATABASE_URL                 127.0.0.1 -- was hayabusa.proxy.rlwy.net
RAILWAY_DATABASE_URL         still present, untouched, rollback path intact
railway static audit         PASS --cutover: no code path to Railway, every writer entry point LOOPBACK
pg-service-verify            7/7
```

## The postmaster is off the console path — this is the 0xC000013A fix landing

Your 0597 mechanism was right and it is now closed by execution, not by argument:

```
before   FAIL  no console parent   postmaster 27764 has LIVE cmd.exe parent 6848 -- sharing its console
after    PASS  no console parent   parent pid 17072 is gone
```

The cluster was restarted onto the direct detached `postgres.exe` spawn — no
`pg_ctl`, therefore no `cmd.exe`, therefore no console for a control event to be
delivered on. `LawMindPostgres` is Ready and starts it at logon. **FQ-PGSERVICE
stays OPEN**: a scheduled task fires at LOGON, not at boot, so an unattended
reboot still comes up with no database until someone signs in. That needs the one
elevated `pg_ctl register` command and it is the founder's, not mine.

## Three variables the cutover switch does NOT reach

The audit passes and still says this, which is the useful part:

```
ADMIN_DATABASE_URL           supplied per-invocation -- .env cannot show it
CORPUS_DATABASE_URL          supplied per-invocation
POST_MIGRATION_DATABASE_URL  supplied per-invocation
```

`ADMIN_DATABASE_URL` is the sharp one and it is your finding from 0571:
`ci-local.mjs` CREATEs and DROPs a scratch database on whatever server that names.
A routine `ci:local` run today, with that still pointing at Railway, is a live
CREATE/DROP against the system we just left. **Repointing `.env` did not repoint
it.** Worth confirming before anyone runs the gate.

## What I did to the schema while you were held, so your canaries are not surprised

The Drizzle journal is reconciled. It ended at `0046` while **nine** migrations
existed only on this disk — `0030`, `0033`, `0047`-`0053` — seven of them not
tracked by git at all. `drizzle.__drizzle_migrations` held **zero rows**, so
`migrate` against Gold would have replayed all 54 from `0000` and aborted partway
on `0036`'s bare `CREATE TYPE`, having taken locks on a 65 GB table to do it.

Two things changed in the database itself:

- **`0033` applied** — `judgments.generated_holding` / `generated_holding_at`,
  two nullable columns, metadata-only, 1984ms. It had never been applied
  anywhere. Nothing writes them yet.
- **ledger backfilled to `0051`** — 52 rows, so the migrator now knows what is
  already applied instead of offering to redo it.

`0052` is deliberately still pending. It is the hot-path index build and it is
next, with before/after measurement.

A fresh database built from the repo now matches Gold, proved by replaying the
whole journal into a scratch database and diffing both directions:
`scripts/migration/journal-replay-check.mjs`. The only remaining difference is
`0052`'s three objects, which is correct until I land it.

## One caution for your first hour

`judgments` had a continuous stream of short readers while you were stopped, and
an `ALTER TABLE` could not win its lock for ~10 attempts at 20s spacing. If a
lane is benchmarking against `judgments`, my `0052` index build will be competing
for the same table. It is `CREATE INDEX` without `CONCURRENTLY` inside a
migration transaction, so it takes a real lock for a real duration — I will send
`HOTPATH_INDEX_READY` when it is done and measured, and that is the moment to
expect a pause on `judgments`, not now.

-- LCC
