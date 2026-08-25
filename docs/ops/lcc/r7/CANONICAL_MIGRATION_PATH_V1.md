# CANONICAL_MIGRATION_PATH_V1

**Owner:** LCC · **Date:** 25 August 2026 · **Gate:** G1 (with Fifth) · **Lease:** `DB_MIGRATION`, held by LCC
**Companion:** `MIGRATION_TRUTH_MANIFEST_V1.json`, `FRESH_INSTALL_PROOF.json`
**Orchestration:** R7 §8 LCC-P0 "Canonical migration truth".

---

## 0. The verdict, first

**An empty database reaches the live product schema from the journal alone, in 1.9 seconds,
with zero divergence.** `OBSERVED_BY_EXECUTION`.

That was **not** true when this work started, and the gap was two indexes wide.

The live bookkeeping table is now reconciled: **87 journal entries, 87 files, 87 recorded
rows**, and `migrate()` against the live database is a genuine no-op rather than a
fourteen-migration replay that happened to be survivable.

---

## 1. What was actually wrong

`OBSERVED_BY_LIVE_DB`, before any change:

```
_journal.json entries                        87
.sql files in packages/db/drizzle/           87
git-tracked .sql files                       87
drizzle.__drizzle_migrations rows            58
newest recorded created_at        1786442900000  = journal idx 72
```

NEW2 raised this in 1161 and was right to call it release-blocking. Two corrections to their
account, both found by measurement:

**`CORRECTION_OF=1161`, part one — the four-unjournalled-files half is CLOSED.** They measured
83 journal entries against 87 files. It is 87 and 87, `meta/_journal.json` is committed and
clean, and the `0083` ordinal collision is resolved by their own rename to
`0086_quality_screen_runs`. `check-migration-journal.mjs` reports OK.

**`CORRECTION_OF=1161`, part two — the failure they predicted would not have happened, and the
reason matters.** They wrote that running the official migrate path against live *"would
**fail**, and the run would abort partway"*. Measured across all fourteen migrations above the
cursor: **every one is idempotent.** `0082_treatment_provenance_column`, the one that looks
most dangerous, is `ADD COLUMN IF NOT EXISTS` followed by `DROP CONSTRAINT IF EXISTS` /
`ADD CONSTRAINT` — re-runnable by design.

So `migrate()` would have *succeeded*. That is worth stating plainly and then not relying on:
**it was luck, not design.** Nobody had checked; the next hand-applied migration that is not
idempotent turns a noisy no-op into an aborted release, and the abort lands halfway through.
NEW2's instinct — don't point migrate at live until someone has enumerated this — was correct
even though their specific prediction was not.

---

## 2. The manifest

`scripts/migration-truth.mjs` → `MIGRATION_TRUTH_MANIFEST_V1.json`. Per migration it records
filename/ordinal, hash, journal state, live bookkeeping state, **observed live-schema
footprint**, status, idempotency, safe action and a rollback note — R7's list.

The status is decided by the **schema**, not by the bookkeeping table:

| status | meaning |
|---|---|
| `APPLIED_RECORDED` | bookkeeping row exists (matched by sha256, which is what drizzle stores) |
| `APPLIED_UNRECORDED` | no row, but every object it declares is present in the catalogues |
| `JOURNALLED_UNAPPLIED` | no row and none of its objects exist |
| `PARTIALLY_APPLIED` | some objects present, some absent |
| `APPLIED_BUT_INVALID` | an index exists but `indisvalid = false` |
| `UNKNOWN` | the SQL declares nothing this tool can probe |

### Three defects in the tool itself, found by checking rather than by shipping

1. **It counted objects inside SQL comments.** The migrations here document themselves
   heavily — `0079` contains seven commented `CREATE INDEX CONCURRENTLY IF NOT EXISTS` lines
   describing a manual repair. Extracting from raw text turned all seven into "declared
   objects", so `0079` read 2/9 present. A migration-truth tool that invents missing objects
   out of prose manufactures exactly the doubt it exists to remove. Comments are stripped first.

2. **It only examined the first statement of most files.** Idempotency was tested by splitting
   on `--> statement-breakpoint`, which drizzle writes and hand-written migrations do not. Every
   rule is anchored with `^`, so a file with no breakpoints was judged on its opening statement
   alone. `0082` has four statements and one was being read. There is now a real splitter that
   respects `$$` bodies and quoted literals.

3. **It flagged a correct idempotent pattern as a DANGER.** `DROP CONSTRAINT IF EXISTS c` followed
   by `ADD CONSTRAINT c` is re-runnable as a pair; judging the `ADD` alone put a DANGER on the one
   migration whose whole design is re-runnability. A false DANGER is not the safe direction — it
   teaches people to run the tool and argue with it.

### And one real defect it found

**`APPLIED_BUT_INVALID`** exists because `to_regclass` cannot see it. `0079` documents its own
case: a `CREATE INDEX CONCURRENTLY` killed mid-build by a client-side timeout leaves an index
that is present in `pg_class`, named exactly as intended, and **useless to the planner**. Only
`pg_index.indisvalid` knows. The manifest and the fresh-install proof both check it. Currently
zero on both databases.

---

## 3. The fresh-install proof

`scripts/migration-fresh-install-proof.mjs`. `ci:local` has run `migrate` twice against a
scratch database for weeks and both steps pass — but neither asks whether the schema they build
**is the schema production runs on**. It cannot be: 29 migrations were applied here by executing
SQL directly.

The proof creates a disposable database, runs the **official** migrate entrypoint against it —
the same one a restore would use, not a hand-rolled apply loop — fingerprints both schemas from
the catalogues (columns with types and defaults and generation expressions, indexes with their
`indexdef`, constraints with `pg_get_constraintdef`, enums with their label order, views with
`pg_get_viewdef`, functions with their identity arguments, extensions, invalid indexes), diffs
them by name, and drops the scratch database. It refuses to drop any database whose name it did
not itself generate.

Indexes are compared by **definition**, not by name: two databases can both have a
`judgments_court_idx` over different columns, and a name-only comparison would call that
equivalent.

### The first run

`OBSERVED_BY_EXECUTION`:

```
  columns      live 943  fresh 874   <-- 69 only live, 0 only fresh
  tables       live  93  fresh  85   <--  8 only live, 0 only fresh
  indexes      live 264  fresh 257   <--  9 only live, 2 only fresh
  constraints  live 860  fresh 837   <-- 23 only live, 0 only fresh
  VERDICT: DIVERGENT — 111 differences
```

**`only_in_live` was all lane scratch** — `new1_doc_vector_stage`, `new1_probe_fp32_250k`,
`new2_neutral_dupe_groups` and six others, with their columns and indexes. Experiment surface,
never migrations, and correctly absent from a fresh install. The proof now classifies those
separately rather than counting them as divergence; a check that can never pass is a check
nobody runs. They are still *reported*, because "absent from a restore" is right for a scratch
table and catastrophic for the corpus, and a rehearsal needs to know which it is looking at.

**`only_in_fresh` was two indexes, and that direction is the dangerous one:**

```
+ alerts_judgment_idx               ON alerts USING btree (judgment_id) WHERE judgment_id IS NOT NULL
+ judgment_annotations_judgment_idx ON judgment_annotations USING btree (judgment_id)
```

The journal builds them. **Live did not have them.** Both are from LCC's own
`0079_fk_delete_indexes` — the migration behind bus 1068, *"deleting ONE judgment sequentially
scanned 151 GB — 22 FKs, three with no index; fixed and proven at cost 2.36"*. Two of those
three indexes were never created on this box. The migration's own comment block says so at
lines 108–109 (`judgment_annotations_judgment_idx INVALID`, `alerts_judgment_idx not created`)
and the manual repair it describes was never completed.

Two independent methods — catalogue footprint and fresh-install diff — found the same gap.

### How big the gap actually was, stated honestly

`OBSERVED_BY_LIVE_DB`:

```
judgment_annotations   2 rows    96 kB
alerts                 1 row    112 kB
EXPLAIN on judgment_annotations WHERE judgment_id = ...   Seq Scan  cost=0.00..1.01
EXPLAIN on alerts               WHERE judgment_id = ...   Seq Scan  cost=0.00..2.01
```

**The cost today is zero.** These are user-data tables holding three rows between them, and the
planner would ignore an index on them anyway. This is a *latent* defect, not a live one: it
becomes real as advocates save annotations and set alerts, and the 151 GB scan bus 1068 measured
was on the `judgments` side, not here. Saying otherwise would be inflating a finding, and the
finding does not need it — a restore producing a different schema from production is
release-blocking whatever the row counts are today.

### Closed

Both indexes created on live from `0079`'s own statements, verbatim, inside one transaction with
`lock_timeout = '3s'`. `OBSERVED_BY_LIVE_DB` afterwards — all three valid and ready:

```
alerts_judgment_idx                | t | t
judgment_annotations_judgment_idx  | t | t
judgments_overruled_by_idx         | t | t
```

### The second run

```
  columns      0 only live, 0 only fresh (+69 lane scratch, expected)
  tables       0 only live, 0 only fresh (+8  lane scratch, expected)
  indexes      0 only live, 0 only fresh (+9  lane scratch, expected)
  constraints  0 only live, 0 only fresh (+23 lane scratch, expected)
  enums / views / functions / extensions / invalid_indexes — identical

  VERDICT: EQUIVALENT
```

Fresh migrate: **1.9 s**, 87 bookkeeping rows, `pg_extension: pg_trgm, plpgsql, vector`. Re-run
is a no-op.

---

## 4. Reconciling the bookkeeping

Two repairs were available and the choice matters more than the result.

**Rejected: run the official migrate path against live and let it write its own rows.** It
re-executes 29 migrations against a database holding 18.7 M judgments in order to fix a
bookkeeping table. Every one is a chance to do real harm in service of a cosmetic fix, and R7
§8 says in terms not to run migrate blindly on the live DB.

**Chosen: record the rows that are missing.** It touches no schema, no data, no index. The only
thing that can go wrong is recording a migration that is *not* applied — which would make it
skipped forever — so that is the one thing `scripts/migration-reconcile-bookkeeping.mjs`
refuses to do, and it refuses on evidence:

- a row is written **only** for a migration whose status is `APPLIED_UNRECORDED` in a manifest
  **regenerated by this script in the same run**. Reading a saved manifest would repeat the exact
  failure that cost NEW1 65 GPU-minutes — a generated file faithfully re-read and never
  re-measured — with a worse consequence.
- `created_at` is the journal's `when`, **never** `now()`. It is the cursor drizzle compares
  against; stamping it with the current time would put every recorded migration ahead of every
  future one and make the next real migration invisible to the migrator.
- one transaction. A half-written bookkeeping table is worse than an unwritten one: it moves the
  cursor partway and makes the next `migrate()` skip migrations that were never applied.
- dry-run by default; `--apply` is explicit.

`OBSERVED_BY_EXECUTION` — the dry run listed 29 recordable, **0 refused**, each with its object
count (`0077_entitlement_spine 19/19`, `0061_ecourts_observations 12/12`, …). Applied:

```
bookkeeping rows now 87, newest created_at 1786444300000
migrate() against this database is now a NO-OP: 0 journal entries above the cursor.
```

Manifest re-run afterwards: `journal 87 · files 87 · bookkeeping rows 87` ·
`COUNTS: {"APPLIED_RECORDED":87}` · **0 dangers, 0 partial, 0 unknown.**

Rollback, if it is ever wanted: the 29 rows are ids 59–87 in `drizzle.__drizzle_migrations` and
deleting them restores the previous state exactly. Nothing else was touched.

---

## 5. CI guards

R7 asks for four. Three were already in `check-migration-journal.mjs` (duplicate ordinal, SQL
missing journal, journal missing SQL — plus numeric gaps, array order, `when` monotonicity, `idx`
contiguity and git-tracking). The fourth was missing and is now added:

**Historical hash change without explicit supersession.** The other seven checks all ask whether
a migration *exists* in the right places. None notices when an existing one is quietly edited,
and that is the most expensive edit in the repository: a database that has already run `0042`
will never run it again, so changing its SQL leaves every existing database on the old schema
and every new one on the new, permanently and silently. The first symptom is a restore that
behaves differently from production.

`packages/db/drizzle/meta/_hashes.json` records the sha256 of all 87 files. The guard fails on a
mismatch, on a journalled migration with no recorded hash, and on a recorded hash whose file has
vanished. A deliberate change updates the lockfile in the **same commit** with a
`supersededReason` — which makes the act visible in review, which is all this asks. The hash is
duplicated out of the live database on purpose: this guard must run in CI with no database, and a
check that needs production to tell you production has drifted is not much of a check.

**Falsified before being trusted.** `OBSERVED_BY_EXECUTION` — a comment appended to
`0086_quality_screen_runs.sql`:

```
migration journal: 1 problem(s)
  applied migration was edited: 0086_quality_screen_runs.sql content changed:
  recorded e0c13ac5efc76108…, now c82108ad7e917435…. Every database that already ran this
  migration will NEVER run it again and now differs from a fresh install.
exit 1
```

Restored → `OK — 87 migrations, journalled, ordered, tracked and unedited since they were recorded`.

Also wired into `ci:local`: `job-health.test.mjs` (the process-identity regression) and
`check-screened-not-clean.mjs` — the latter NEW2's catch in 1177, proven non-vacuous and wired
nowhere. It is LCC's file and LCC's omission. It passes: *"checked 1025 shipping files … nothing
equates SCREENED_NO_DAMAGE_FOUND with clean."*

**Not yet added to `ci:local`: `migration-fresh-install-proof.mjs`.** It creates and drops a
database and takes tens of seconds, so it belongs in the release gate rather than the
every-change gate. Recorded here so the omission is a decision rather than an oversight.

---

## 6. Baseline / squash — not needed

R7 offers: *"If a baseline/squash is safer, prove it in disposable DB first."*

It is not safer here, and the evidence is the 1.9-second fresh install. A squash trades 87
auditable files for one opaque one and buys nothing measurable. The two reasons anyone squashes —
migrate is slow, or the chain no longer applies cleanly — are both empirically absent. Revisit if
fresh-install time becomes material; it is currently 1.9 s.

---

## 7. Gate effect

**G1 — factory / migration truth.** With `PROCESS_CONTROL_TRUTH_V3` this completes LCC's half:

| R7 requirement | state |
|---|---|
| registry ↔ OS process reconciliation | `PROCESS_CONTROL_TRUTH_V3` §2 |
| embedding/GPU progress vs replay vs stall | `PROCESS_CONTROL_TRUTH_V3` §3 |
| startup inventory | `PROCESS_CONTROL_TRUTH_V3` §5 |
| **canonical migration truth strategy** | **this document** |
| resource-window protocol active | exercised on the bus, not merely described |

Fifth is the reviewer; nothing here asks anyone to take it on trust — the manifest and the proof
are both re-runnable in a couple of minutes against the live database.

**The release rehearsal is now unblocked on migration grounds.** R7 §8 says
*"Only after canonical migration truth"*, and that condition is met. It remains blocked on the
other gate: there is no accepted G3 candidate retrieval path (NEW1 bus 1175, tranche selection
BLOCKED after three attempts), so the rehearsal's semantic-equivalence half has nothing to
compare against.

---

## 8. Re-running any of this

```bash
node scripts/migration-truth.mjs                              # human table
node scripts/migration-truth.mjs --out <path>                 # machine manifest
node scripts/migration-fresh-install-proof.mjs --out <path>   # creates and drops a scratch DB
node scripts/migration-reconcile-bookkeeping.mjs              # dry run
node scripts/migration-reconcile-bookkeeping.mjs --apply      # writes bookkeeping rows only
node scripts/check-migration-journal.mjs                      # static, no database
```

All read-only except the last two, and the reconciler writes nothing but bookkeeping rows it can
prove are owed.
