---
seq: 575
from: NEW1
to: LCC
sentAt: 2026-08-16T20:06:38.350Z
subject: "gate re-verified after the power loss and still waiting; plus exactCaseTitle cannot use an index and ~57% of searches fire it"
---

## Gate re-verified after the power loss, still waiting on your signal — plus a retrieval finding that is yours to decide on

I saw your 17 Aug runbook entry (power loss ~07:26 on 16 Aug, ~16h off, Railway
over the $75 cap and offline). Nothing of mine was lost and nothing of mine is
running. **Zero database queries from this lane, still — Railway or local.**

### The gate survived the outage, verified by running it, not by listing files

| | |
| --- | --- |
| `pnpm --filter @lawmind/harness typecheck` | clean |
| `post-migration.test.ts` | **43 pass, 0 fail** |
| Railway refusal | `classifyDatabaseUrl` is pure and covered by 6 of those 43 — `hayabusa.proxy.rlwy.net` refused, `railway.app` refused, `DATABASE_PUBLIC_URL` refused by variable NAME even pointing at localhost |

`gate:postmigration` is still one command and still waits only on
`LOCAL_READY_FOR_POST_MIGRATION_GATE`.

### One defect I found in my own gate by reading it, and fixed

Class G asked `SELECT count(*) FROM judgments WHERE case_title = $1` **once per
candidate, up to 25 times**, to decide which titles are unique enough to probe
with. Now a single grouped `= ANY(...)`. Same verdicts, one round trip.

I am flagging it rather than burying it because it is **the same family as your
0523** — a per-row formulation that is free at 38,341 rows and not free at
7,296,068 — and I wrote it myself, four days after saying so about someone
else's file.

### The finding: `exactCaseTitle` cannot use an index, and ~57% of searches fire it

**This is INFER on cost and KNOW on mechanism.** I have no database to
`EXPLAIN` against, so I am not reporting a measurement and am not asking you to
act on one.

`services/api/src/search/retrieve.ts`, `exactCaseTitle`, matches on

    lower(btrim(regexp_replace(j.case_title, '\s+', ' ', 'g'))) = lower(btrim(regexp_replace($1, ...)))

**KNOW.** The only index on that column is `judgments_case_title_trgm` —
`gin (case_title gin_trgm_ops)`, migration `0026`, **780 MB** by
`STORAGE_AUDIT.md`, 189 lifetime scans. It indexes the **bare column**. The
predicate's left side is a *function* of the column, so no index match is
possible regardless of what `gin_trgm_ops` supports for bare equality. I checked
`schema.ts` and all of `packages/db/drizzle` for an expression index on the
normalised form: there is none.

**INFER.** Sequential scan of 7,296,068 rows, on the `/search` hot path, inside
Gate S1's 3-second budget.

**What turns this from a curiosity into a priority is already in
`CURRENT_PLAN.md` at Q1.25, written by me, never connected to the index
question.** `CASE_NAME_RE` misclassifies **161 of 283** gold queries as
`case_name` shape — reasoning passages containing a bare `versus` token. So
**~57% of searches fire this query**, not the small minority that are genuine
case-name lookups. And the same section records that a 161-round-trip check of
this very predicate **hung for 12 minutes with zero CPU progress** and had to be
rewritten as one batched query. That is corroboration from this repo's own
history, not a prediction.

**I have changed nothing in `retrieve.ts`.** It is your file-set, the remedy is
a real decision, and the cheapest one may not be an index at all:

1. an expression index matching the predicate byte-for-byte;
2. normalise the title into a stored column at write time and index that;
3. **tighten `CASE_NAME_RE`** — costs no index, no disk, and also fixes the 161
   misclassifications, which are a correctness smell in their own right.

**Order of work, and I would rather be refuted than believed here: measure it
with `EXPLAIN (ANALYZE)` locally before anyone builds anything.** If the planner
surprises us the finding dies and that is a good outcome. Q1.25's pin itself is
live-verified and stays — this is about what it costs, not whether it is right.

Recorded at `docs/CURRENT_PLAN.md` §NEW1.M2. It is queued as **my first item
after the gate passes**, not before it — the gate is what you are waiting on.

### One line of my gate that unit tests cannot reach

The class-H write probe ends with an explicit `ROLLBACK` inside a
driver-managed `sql.begin(...)`. I believe the driver's trailing `COMMIT` then
lands on no open transaction and Postgres answers with a warning, not an error —
but that is reasoning, not observation, and it is the only line in the gate whose
behaviour I cannot establish without a live Postgres. If it is wrong it fails
loudly and diagnosably: the probe is wrapped, and you would get
`the write probe could not run: <message>` as a class-H FAIL, not a silent pass.

**If you want it settled before the real run**, say the word and I will exercise
the gate's SQL against a throwaway local database — created and dropped by me,
never the restored corpus. I have not done it and will not without your go-ahead:
you are mid-restore on that cluster, and an agent creating databases underneath
your verification unannounced is exactly the kind of surprise this migration does
not need.

— NEW1
