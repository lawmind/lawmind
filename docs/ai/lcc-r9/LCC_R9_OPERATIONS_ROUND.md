# LCC — R9 operational round, 27 August 2026

**Mission:** operational plumbing and concrete blockers. No new release
architecture, no second control plane, no release candidate sealed.

Evidence for every number here is a command that was run, and the failing case is
recorded next to the passing one wherever a claim could otherwise be read as
lucky.

---

## 1 — THE RESTORE NEVER HUNG

Two rounds of "the restore hangs", three hypotheses falsified, one hard stop at
the three-attempt bound. The cause was in the **PostgreSQL server log** the whole
time and no client-side reasoning was ever going to reach it.

```
ERROR:  insert or update on table "judgment_statute_refs" violates foreign key
        constraint "judgment_statute_refs_statute_id_fkey"
DETAIL: Key (statute_id)=(0019baad-090a-4777-a62a-f2a12339664e) is not present
        in table "statutes".
STATEMENT: COPY judgment_statute_refs (...) FROM STDIN
```

### Two defects, and neither alone explains it

**The load order.** `SERVING_TABLES` puts `judgment_statute_refs` fourth and
`statutes` fifth, and `judgment_statute_refs.statute_id` references `statutes.id`.
Every row of the fourth COPY violated an FK against an empty parent.

**The client could not be told.** postgres.js resolves a COPY query at
`CopyInResponse` and completes the writable only from `CommandComplete`
(`connection.js:603`). An `ErrorResponse` therefore lands on a query that is
already settled: the stream's `final` is never called, `pipeline` waits for a
`finish` that cannot come, and the process sits there for ever. Server `idle` in
`Client:ClientRead`, client blocked, **no error anywhere**. Not a stall — a
failure with no reporter.

The comment claiming the load disabled triggers would have masked the first
defect. No code disabled anything (FIFTH bus 1386 C). That absence is what turned
a wrong load order into an unreportable hang.

### The falsification matrix — all cells run on the 500-judgment pack

| load order | triggers | result |
| --- | --- | --- |
| topological (fixed) | **ON** | RESTORE VERIFIED, 10.3s |
| topological (fixed) | OFF | RESTORE VERIFIED, 10.3s |
| manifest (HEAD) | **ON** | `copy_failed` at the deadline, non-zero exit, table and byte position named |
| manifest (HEAD) | OFF | RESTORE VERIFIED, 10.4s |
| **HEAD code, no deadline** | ON | **HANGS INDEFINITELY** — reproduced twice, `idle`/`ClientRead` both times |

Row one is the load-bearing one: triggers fully enabled, ordering alone fixed, it
verifies. **The ordering was the defect.** The trigger disable is now real as
well, because the fallback path (`ALTER TABLE ... DISABLE TRIGGER USER`, for a
target whose role is not superuser) does not touch FK triggers — a restore relying
on the disable alone would hang again on the first non-superuser target.

### What changed in `services/api/src/ops/release-restore-cli.ts`

- Topological load order from the TARGET's own `pg_constraint`. Self-references
  ignored (no order satisfies `judgments.overruled_by_judgment_id`; only the
  disable does). A genuine cycle is a finding, not an invented order.
- Triggers actually disabled — `session_replication_role = 'replica'`, read back
  and verified, restored to `origin` and verified again. The mechanism that ran is
  in the trace, so nobody assumes the stronger one.
- Referential validation after the load: 7 constraints, **0 dangling**. Turning FK
  enforcement off proves nothing about rows that arrived while it was off.
- A COPY deadline, `--copy-deadline <seconds>`, default 10 minutes. The one
  failure postgres.js cannot report now ends the process instead of outliving it.
- A per-phase trace to `RESTORE_TRACE.jsonl`, appended and flushed per event, plus
  a stall probe on a SECOND connection reading `pg_stat_activity` without
  cancelling anything.
- `--keep-triggers` and `--manifest-order`, which exist only to falsify the fix.

**Two mistakes of my own, both caught by the instrument disagreeing with itself.**
The first watchdog awaited a `setTimeout` and then checked a flag, charging every
phase a flat 15,000 ms — seven TRUNCATEs at exactly 15.000s is a measurement of
the instrument, not the restore. And the tracer spread `...detail` last, so a
detail key named `ms` overwrote the elapsed clock and ANALYZE reported itself at
894 ms of a run that was 9,516 ms in.

### The bounded rehearsal, end to end

```
export        500 judgments · 7 tables · 59 MB · manifest + checksums
target        created, migrated 90/90 from empty
restore       7/7 tables, rows and checksums MATCH, 10.2s
FK            7 constraints, 0 dangling
indexes       259, 0 invalid
exact search  the rebuilt GENERATED tsvector finds the source row; exact
              substring agrees
joins         559 citation edges over 497 citing judgments · 36 statute refs,
              35 linked to 10 Acts · 36,663 sections across 827 Acts
source        untouched: statutes 849, sections 36,663, judgments 18,698,984
rollback      DROP + CREATE + migrate 90/90 -> re-restore -> VERIFIED again
```

Rollback is stated as what this architecture actually offers. A release restore
TRUNCATEs its target, so there is no undo of the COPY; what there is, and what was
demonstrated, is that the target returns to a known state and the cycle re-runs
from nothing.

### NOT proven

Host loss at real scale. 500 judgments and 59 MB against 18.7M rows and 151 GB
differ in the ways that matter — a Linux target cannot offer
`English_United States.1252`, and `judgments` at full size is hours, not seconds.
The bounded pack proves the MECHANISM; it does not price the event.

### Line endings, incidentally

`release-export-cli.ts` and `release-restore-cli.ts` were the only two files in
the repository committed with `\r\r\n` — 450 and 302 occurrences. Normalised to
CRLF, which is why those two diffs are whole-file. Nothing else in the tree has
it.

---

## 2 — THE RESOLVER GATE WAS PERMANENTLY CLOSED, AND THAT IS THE MOST SEVERE FINDING OF THE ROUND

Catching the citation-key index up to NEW2's 50,994-row delta made the resolver
**worse**, and the reason generalises.

`readKeyFreshness` compares the risk replay's `frontier_at` with the live cursor
**as TEXT**, deliberately, because two cursors 78 microseconds apart are different
indexes. `scripts/n2-resolver-risk-replay.mts` wrote that field as
`${freshness.frontierAt}::timestamptz` — so postgres.js routed it through a JS
`Date` and truncated it to milliseconds:

```
replay frontier_at   2026-08-27 09:55:10.499+00
live cursor_at       2026-08-27 09:55:10.499107+00
```

**No cursor carrying microseconds could ever match it again.** State STALE for
ever, `mayAssertUnique` false for ever, every citation in production answering
`UNIQUE_UNCONFIRMED_STALE_INDEX`. The 24 Aug row matched only because the frontier
was itself truncated then — two wrongs agreeing.

Fixed with `(x::text)::timestamptz` on both binds, the rule
`citation-keys-cli.ts` states in its own header. A second bind at line ~208 had
the same defect in the safe direction, inflating `judgments past cursor`: it read
`1 -> INDEX_BEHIND_INGEST` before and `0 -> CLEAN` after, on an unchanged corpus.

```
state                     STALE -> CURRENT
lagRows                   0
lastRiskReplayFrontierAt  2026-08-27 09:55:10.499107+00   exact match
because                   []
false_unique 0 · materially_unsafe 0 · records 406
```

Three FIFTH-1313/1354 falsifier tests that had been failing on
`UNIQUE_UNCONFIRMED_STALE_INDEX` pass again. Their precondition was a CURRENT
index; they were reporting a real defect, not a flaky environment.

**The lifecycle consequence.** The downstream cycle after every ingest handoff is
four steps, not three, and the third was wired nowhere:

```
ingest committed
  -> citation-key index walked to the new frontier
  -> RISK REPLAY re-run against the new cursor      <- nobody had this
  -> citations / paragraphs consumers
```

---

## 3 — THE DATA FACTORY, RESTARTED AND RECONCILED

### The downstream backlog, closed

Measured on NEW2's delta id set, not on a `created_at` selector:

| | before | after |
| --- | ---: | ---: |
| judgments with no `judgment_citations` | 50,994 | **0** |
| judgments with no `judgment_paragraphs` | 50,994 | **121** |
| judgments newer than the citation-key cursor | 50,994 | **0** |
| judgments with no `judgment_citation_keys` | 35,355 | 35,355 — expected, a judgment with no citation of its own gets no key row |

The 121 are documents the paragraph extractor produced nothing for. Not
characterised, and not claimed to be fine.

### The registry, reconciled

| job | was declared | was true | now |
| --- | --- | --- | --- |
| `new1-doc-vector-embed` | RUNNING, `pid: null` | nothing running, 5 days | retired FAILED — then **re-claimed RUNNING at 11:29Z** when NEW1's stage-runner relaunched it. Observation beat both declarations. |
| `new1-gpu-sidecar` | RUNNING pid 23660 | pid 23660 dead for days; live sidecar is 16168 | re-claimed with the real pid; `/health` answers, CUDA resident, **consumer idle** |
| `new1-sidecar-keeper` | RUNNING, `pid: null` | alive as 1460 | re-claimed. Its log has not moved in 33h because it logs **only anomalies** — silence is its healthy state, verified against the sidecar's `/health` instead |
| `new2-paragraphs-apply` | IDLE_CAUGHT_UP pid 10680 | 10680 is a bare `cmd /K` shell whose loop exited at the freeze | retired STOPPED; shell killed |
| `lcc-citation-keys-catchup` | FINISHED | superseded by a continuous worker | retired; replaced by `lcc-citation-keys` |

**A live pid with the right command line and no worker under it is the exact
fake-RUNNING shape the registry exists to refuse**, and `new2-paragraphs-apply`
was wearing it.

### One owner per logical job — and the collision that proved it was not free

Registering the three scheduled tasks while three hand-started wrappers were
already looping produced **six wrapper shells and three concurrent `citations`
workers on the same rows**. That is the Orissa collision arriving by a different
door.

`enrich-worker.cmd`'s live-node check has a hole the width of its own backoff: the
loop spends 30 s to an hour with no node process, and a second wrapper starting
inside that window sees nothing. **I tried to elect a leader in the wrapper with
its own PID and removed it**: `for /f` runs its command in a transient `cmd /c`,
so the ancestor walk kept landing on that throwaway shell — whose command line
contains the literal text `enrich-worker.cmd` because the *search pattern* is part
of it. A probe that matches itself. The lock recorded a PID that was already dead;
a guard that never guards is worse than no second guard at all.

The guarantee is the scheduled task's `MultipleInstances = IgnoreNew`, which
Windows enforces and nothing can race. Observed: firing all three tasks twice
leaves exactly three wrapper shells, with `0x800710E0` (request refused) on the
duplicates.

### `job-health.mjs`: a retired job no longer adopts its successor

Rediscovery exists for a job that MOVED. It is the wrong answer for a job whose
lane has declared it finished, because the process matching its signature is
almost always its successor under a new `job_id`. Measured: `new2-paragraphs-apply`,
retired that morning, adopted `lcc-paragraphs-apply`'s wrapper and both rows
reported the same live instance — one logical job, two owners, the retired one
wearing RUNNING.

### `job-register.mjs`: PAUSED can now be written

`job-health.classify()` has always READ `PAUSED`. Nothing could ever write it. A
state the reader understands and the writer cannot produce does not exist — and it
was missing for exactly the case it is needed in: a continuous job stopped
deliberately, for a freeze or a quiet window, reads as FAILED. The difference
between "it died" and "I stopped it" is the difference between a page and a note.

### Startup behaviour, made truthful

```
BOOT   1 mechanism   LawMindPostgres (Windows service, LocalSystem)
LOGON  5 mechanisms  alert-poll · new1-sidecar-keeper · citation-keys ·
                     citations · paragraphs
MANUAL               the ingest fleet — start-ingest-fleet.ps1, deliberately not
                     a logon launcher (a static width plan that ignores the
                     derived delta is how six courts held ~0)
```

The Startup-folder `Lawmind-paragraphs.cmd` is renamed
`.disabled-superseded-by-scheduled-task`, so each job has one launcher.

**Boot recovery is refused by the OS, not skipped.** Probed:

```
New-ScheduledTaskTrigger -AtStartup + -LogonType S4U  ->  "Access is denied."
```

Elevation is required and no lane has it. `FQ-LCC-R9-1`.

---

## 4 — FRESH INSTALL: EQUIVALENT

`n1_lab_passage_role` was the entire 14-difference divergence — 1 table, 5
columns, 2 indexes, 6 constraints. NEW1 confirms it is lab surface; grep confirms
its only readers are `services/harness/src/n1-role-materialise-cli.mjs` (writer)
and `n1-evidence-safe-cli.mjs` (reader), with **zero** in `services/api`,
`packages/db` or `apps`.

The obvious fix — widening `LANE_SCRATCH` to `n[123]_` — is the wrong one. It is a
regex over strings like `some_table.n1_column`, so it would silently exempt any
future product column whose name began that way, and an exemption nobody can
enumerate is how a real table goes missing from a restore. What landed instead is
a **named, dated list with a stated reason**, anchored so
`judgments.n1_lab_passage_role_id` would NOT be exempt.

```
VERDICT: EQUIVALENT — an empty database reaches the live PRODUCT schema from the
journal alone. 131 lane-scratch object(s) exist only on the live box.
drizzle bookkeeping rows: live 90, fresh 90
```

**Proven non-vacuous.** A probe table `zz_lcc_divergence_probe`, carrying a column
deliberately named `n1_lab_passage_role_id`, was created on the live database: the
gate returned `DIVERGENT — 6 difference(s)` and the column was **not** exempted.
Dropped; `EQUIVALENT` again.

FIFTH 1363 / 1364 and blocker D of 1386 are closed.

---

## 5 — THE TWO RED API TESTS

### (a) Allahabad coverage — the premise moved, and the survey was not wrong

```
Allahabad coverage is now 65.143% (2,276,087 of 3,493,991)
```

The test asserted `heldShare < 0.001` and its message said
`docs/HC_CORPUS_SURVEY.md` would need rewriting first. **It does not.** The survey
counts the SOURCE — 20,529,202 documents from parquet footers — and that has not
moved. What moved is what we HOLD. The old assertion read a snapshot of our
holdings as a property of the source, and those are the two sides of the very
ratio the endpoint exists to publish; pinning either pins the wrong half.

What replaces it is the claim that cannot go stale and is the one that would
actually hurt an advocate: **the number is derived live from `judgments`, and it
is the same number a direct count gives** (bounded to 5,000 rows of drift, because
an ingest can commit between the two reads). A cached or optimistic `held` is the
only way this endpoint can lie, and `coverage.ts` says so in its own comment.

### (b) The timestamp guard — it over-matched AND under-matched, and the second half mattered

The rule in the block's own name is about the **client**. The sweep matched
`_at::text` anywhere in the service. Those are not the same claim, and the
consequences pointed in opposite directions.

**Over-matched:** `citations/key-freshness.ts` casts for an IDENTITY comparison at
microsecond resolution; `admin/timestamp-precision.test.ts` casts to prove the
truncation exists at all. `isoColumn()` would break both. The suite carried a
permanent red no correct change could clear — and a permanent red is a guard
nobody reads.

**Under-matched, and this is the half that mattered:** `_at::text` does not match
`max(created_at)::text`. Five parenthesised casts were invisible to it — including
`corpus/coverage.ts`, whose `enumeratedAt` **was reaching the client as Postgres
text**, guarded only by an assertion that `Date.parse` was not NaN. That passes on
Node against the exact string that rendered "Invalid Date" on a Galaxy S24.

And the exemption argument turned out to be true of the CASTS and false of the
RESPONSE: `readKeyFreshness()` was spread whole into `/admin/metrics`, so **four**
of those "internal" strings reached an admin client.

The sweep now does three things instead of one: it matches the parenthesised form;
it accepts a per-line `iso-time-exempt: <reason>` marker whose reason is required
and whose FILES are pinned; and it is backed by an assertion on the **actual
payload**, because a marker is a human's claim and the payload is the observation.
A cast may be exempt. A response may not.

**Both halves proven non-vacuous** by reverting the fix: the sweep named the
planted cast, and the payload assertion named all four leaked timestamps.

Two smaller defects fell out. The file walker split on `\n`, so a trailing `\r`
— **a line terminator to JavaScript's `.`** — meant `(\S.*)$` never reached the
end of a CRLF line and every exemption in a CRLF file read as unmarked. And a
line that is itself a comment is prose, not a cast: `corpus/coverage.test.ts` hit
that within the hour, describing the very defect it had just fixed.

---

## 6 — `/corpus/freshness`

An ADDITION to the frozen contract, on the standing `/corpus/coverage` was given.

**Currency is a completeness ratio against a trailing baseline. It is never a
maximum.** Both readings are returned, the naive one labelled and losing, because
`max(judgment_date)` is what anybody computes for themselves.

```
naive.lagDays                 2     ("newest judgment is 2026-08-25")
legalCurrency.dataAsOf        2026-07-31
legalCurrency.lagDays         27
baselineDocumentsPerMonth     134,810  (7 months, EXCLUDING the 3 under test)
2026-06  71,905  ratio 0.5334  PARTIAL
2026-07  96,073  ratio 0.7127  CURRENT
2026-08  37,294  ratio 0.2766  PARTIAL
```

August was 480 documents and `EFFECTIVELY_ABSENT` on 25 Aug; NEW2's delta walk
moved it to 37,294. The honest lag is 27 days, not NEW2's 56 and not the naive 2.

**A confident wrong number caught before it shipped.** The first version asked
`hc_ingest_ledger` for `count(*) FILTER (WHERE outcome = 'ok')` and would have
published `ingestSucceeded: 0`. That ledger is the **failure side** — all 231,946
rows are `pdf_absent`, `no_text`, `pdf_failed` or `no_title`, and there is no `ok`
outcome in it. Failures and last activity now come from the ledger; last SUCCESS
comes from `judgments.created_at`, which is the only place a success is recorded.

`newestItemAtSource` is `NOT_MEASURED` for every adapter and says so — it needs a
listing fetch per adapter and nothing here performs one.

---

## 7 — ECOURTS: NOTHING TO BUILD

The persistence the round asks for already exists and is correctly split:

```
ecourts_observation   0 rows   raw observation + payload + payload_sha256,
                               observed_at AND source_asserted_at, cnr /
                               case_number / case_year / case_type /
                               listing_date / next_listing_date, endpoint,
                               grant_data_type, conditions_version, fetch_ledger_id
ecourts_transition    0 rows   DERIVED state, separately, with from/to
                               observation ids and occurred_at vs derived_at
```

A listing is never evidence that a hearing occurred, and the schema already says
so by keeping the two in different tables. The canary has not begun — NEW2's
`FQ-N2-R9-1` (the grant's attribution string is env-only and absent) gates it. The
freshness endpoint reports `observations: 0, state: NO_OBSERVATIONS` rather than a
null date, because "never observed" and "observed long ago" are different facts.

---

## 8 — MIGRATION 0089

`document_vector_staging_source_object_type_check` widened to admit
`statute_section`, `official_order` and `ecourts_observation` (NEW1 bus 1397).
Applied through the real `migrate()` path — `drizzle.__drizzle_migrations` is at
**90 rows** and there is no hand-inserted ledger row, which is the R8.3 caveat on
0087/0088 not repeated.

Proven both directions on the live table, one rolled-back transaction per value:
all five accepted, `not_a_real_type` refused, 0 rows left behind. A widened CHECK
that admits everything is not a check.

Filing statute sections as `legal_object` was considered and refused: that value
means a model's reading of a judgment at SPAN_VERIFIED trust, and an enacted
section is the legislature's own words. The reasoning is in the migration header
because it is the part a future reader will be tempted to undo.

---

## 9 — OPEN, AND HONESTLY

1. **Full API suite is not green and is not being called green.** Four tests
   assert properties of a corpus that is not moving, and another lane wrote 339
   judgments and 16 `JUDGMENT_DELETED` marks mid-run. A write-quiet window has been
   requested on the bus.
2. **Host-loss rehearsal at real scale** — not run. Scheduled after the current
   acquisition jobs reach a safe checkpoint.
3. **`new1_doc_vector_stage` and `new1_tranche_passages` are not migrations.**
   NEW1's argument is accepted: a restore that drops them loses no capability today
   and loses ~66 GPU-hours the day broad semantic is enabled. Deliberately not
   journalled while a walk with 211 hours left is still writing them.
4. **The risk-replay step is not automated** and should be in NEW2's daily cycle.
   Not automated unilaterally: it writes an adjudicated-evidence row.
5. **Boot recovery needs elevation.** `FQ-LCC-R9-1`.
6. **`/corpus/freshness` costs ~12 s** and `/corpus/coverage` ~22 s. Both are
   index-backed and bounded; neither is a hot path today, and the numbers are in
   the response (`computeMs`) rather than in a comment.
