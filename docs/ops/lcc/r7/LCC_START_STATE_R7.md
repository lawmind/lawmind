# LCC — START_STATE (R7 sprint)

**Published:** 2026-08-25, ~14:55 +04 (machine local)
**Lane:** LCC — server/API correctness, auth/security/erasure, process-control plane,
retrieval outcome contract, resolver serving/freshness, migration truth, release-data
pipeline, mixed-load/backpressure, operational paging, backup/recovery.

Published under the R7 §2 global anti-drift contract. Every material line carries one of
`OBSERVED_BY_EXECUTION` / `OBSERVED_BY_LIVE_DB` / `OBSERVED_BY_CODE` /
`OBSERVED_BY_PRIMARY_SOURCE` / `DERIVED` / `HYPOTHESIS` / `NOT_MEASURED` / `BLOCKED`.

---

## 1. Orchestration file

| field | value |
|---|---|
| file | `LAWMIND_FINAL_DATA_INTELLIGENCE_BACKEND_MASTER_PLAN_R7_2026-08-25.md` |
| SHA-256 | `6e868d643d27a6b4f778c0f4e5ec023a94c7d7f85301ad9211d337e3fb046f7d` |
| size | 50,438 bytes / 1,904 lines |
| read | in full, §§0–21 |

`OBSERVED_BY_EXECUTION` — `sha256sum` on the working copy.

The file is **untracked** in git. So are the R4 falsification file, the R4/R5 dossiers, the
V2 convergence plan and the 23 Aug orchestration plan. The orchestration source of truth is
therefore not versioned; the SHA above is the only handle on which revision this lane ran against.

---

## 2. Git

| field | value |
|---|---|
| HEAD | `0762d2818ff45ce399d469b867686b80114fa1d7` |
| HEAD subject | docs(new1): board records the tranche selection as BLOCKED, not in flight |
| HEAD date | 2026-08-25T13:46:17+04:00 |
| branch | `main` |
| dirty entries | 100 |

`OBSERVED_BY_EXECUTION`.

### Dirty paths, grouped by owning lane

**Not LCC's — will not be staged by this lane:**

- `apps/**` — 14 modified plus 2 new (`PremiumPreviewCard.tsx`, `.test.tsx`). RCC / CLIENT_APPS.
- `services/harness/src/tranche-select-cli.mjs`, `docs/ai/new1-tier-a/stage-embed-summary.json` — NEW1.
- `services/embed/src/index.ts` — NEW1.
- `services/ingest/.checkpoints/*` (3), `services/ingest/.dup*.mts`, `.look.mts`, `.mn*.mts`,
  `.n2c-probe.mjs`, `.sp.mts`, `.agents/logs/new2-*.err` — NEW2 scratch and checkpoints.

**Shared bus / ops infrastructure (append-only; no lane stages these casually):**

- `.agents/bus/*.md` — 46 untracked messages, seq 1075–1175
- `.agents/bus/leases/*.json` — 5 lease files
- `.agents/jobs/observations.jsonl`, `.agents/logs/*`, `.agents/ops/`

**LCC-owned and dirty at START_STATE:** none. `.agents/bus/leases/LCC.json` changed only
because this session took the lease over (§3).

Per R7 §3 this lane stages exact owned paths only, never `git add .` / `-A` / `commit -am`,
and prints `git diff --cached --name-only` before every commit.

---

## 3. Lane / domain leases

`OBSERVED_BY_EXECUTION` — `node scripts/lane-lease.mjs status|acquire`.

| lane | holder session | pid | pid live? | state |
|---|---|---|---|---|
| **LCC** | `0f864777-1ade-47ae-9840-dcc028e05c1e` (**this session**) | 28584 | yes | **HELD — acquired this session** |
| NEW1 | `c2792141-074b-4500-b39a-be06760ea644` | null | n/a | HELD |
| NEW2 | `37711162-ef1a-47f6-a1cb-81276d579494` | 26580 | **no** | HELD (stale) |
| RCC | `01a036ea-b1bc-7730-8322-b4b0fd6c7f30` | 28488 (`codex.exe`) | **no** | HELD (stale) |
| CLIENT_APPS | RCC, same session | 28488 | **no** | HELD (stale) |

LCC's prior owner was session `76b6b72f-c322-4563-8d8b-5544a5312a69`, pid 3848, last
heartbeat 2026-08-25T09:40:26Z — reported `DEAD` (pid absent from the process table, 71 min
stale). Takeover was clean; no `--force` was needed. That prior owner's record already
carried a `supersededOwner` block for `fa117007-…` with health `PID_RECYCLED`, so this is
the third LCC session in the chain.

`DB_MIGRATION` lease: **no `leases/DB_MIGRATION.json` exists** — nobody holds it. This lane
acquires it before choosing any migration ordinal or applying shared schema.

---

## 4. Bus

`OBSERVED_BY_EXECUTION` — `node scripts/lane-inbox.mjs`.

- **Latest sequence on the bus: 1175** (`NEW1 → LCC`, 2026-08-25T09:47Z).
- **Latest sequence read by this lane: 1175.** Whole thread consumed at START_STATE.
- Every message renders `[PENDING]`; the tool exposes no per-lane read watermark, so
  "consumed" means read by this session, not acked in the file.

### Inbound to LCC that shapes this sprint's P0 order

| seq | from | substance |
|---|---|---|
| 1161 | NEW2 | live `__drizzle_migrations` stopped 11 Aug at 58 rows; 4 files then unjournalled; release-blocking |
| 1131 | NEW1 | the sidecar keeper has **never once** successfully replaced a STALLED sidecar |
| 1127 | NEW1 | an orphaned `cmd /K` loop ran citations-cli at concurrency 12 — no task, no registry record, dead parent |
| 1156 | NEW1 | two orphaned `cmd /K` loops measured; they, not NEW1's walk, are the real contender for the box |
| 1128 | RCC | client abstention needs a **server response discriminator** — cannot tell "no law" from "could not search" |
| 1141 | NEW3 | judgment reader 500'd after 40 s; `anticipatory bail` returns an empty 200 *by design*; provenance reaches no surface |
| 1118 / 1120 / 1122 / 1138 | RCC | four additive wire seams: caseNumber/caseType/CNR, durable premium event, currentness provenance |
| 1136 / 1140 | NEW2 | 293 real citations stranded in 9 never-walked batches; ARPIL transposition is one live row |
| 1112 / 1159 | NEW2 | resolver freshness regression, plus a **withdrawn** 72-of-76 add-to-matter figure (real number 0) |
| 1175 | NEW1 | tranche selection **BLOCKED** after three attempts; NEW1 resumed the HEAD walk |

1175 is the gating fact for LCC-P1: **there is no accepted G3 candidate retrieval path today.**
Mixed-load/backpressure and the release rehearsal are therefore not startable on NEW1's
evidence, and the rehearsal is separately blocked behind migration truth (R7 §8).

---

## 5. Live processes relevant to this lane

`OBSERVED_BY_EXECUTION` — full `Get-CimInstance Win32_Process` table, 2026-08-25 ~14:53 +04.
Machine last boot: **2026-08-25T12:41:49+04:00**.

### LawMind workloads actually alive

| what | pid chain | created | registry says |
|---|---|---|---|
| Postgres 18.6 | `pg_ctl 4708 → postgres 6480` + 14 children | 12:42:02 (**boot + 13 s**) | not a registry job |
| sidecar keeper | `cmd 21612 → node 18856 sidecar-keeper.mjs` | 12:55:40 | `new1-sidecar-keeper` pid **null**, RUNNING |
| GPU sidecar | `python 4116 services/embed/gpu/server.py --port 8799` (child of 18856) | 12:56:09 | `new1-gpu-sidecar` pid **23660**, RUNNING |
| doc-vector-embed walk | `node 28260 → cmd 18684 → node 9380 → node 11136` | **14:53:02** | `new1-doc-vector-embed` pid **null**, RUNNING |
| `enrich-worker.cmd paragraphs` | `cmd 20124`, ppid 16484 = **dead**, only child is conhost | 12:45:50 | **absent from the registry entirely** |

### Registry ↔ OS disagreement, stated exactly

`.agents/jobs/registry.jsonl`: 39 lines, **1 unparsable**, 19 distinct `job_id` after
last-line-wins. Three carry `status: RUNNING`.

- `new1-gpu-sidecar` records **pid 23660**, which is **not in the process table**. The live
  sidecar is **pid 4116** — a dead registered pid and a live unregistered pid for one job.
- `new1-sidecar-keeper` and `new1-doc-vector-embed` record `pid: null` while both are alive.
  A null pid cannot be reconciled against an OS tree at all.
- `enrich-worker.cmd paragraphs` (cmd 20124) is **live with no registry record**.
- Both remaining `RUNNING` rows carry `last_verified_progress` timestamps from **21 Aug**,
  four days stale.

This is the split-brain LCC-P0 names. Unfixed at START_STATE; it is the first task.

### The paragraphs process is alive and is not working — stated precisely

`OBSERVED_BY_EXECUTION` — `%TEMP%\lawmind-paragraphs.log`, last write **12:45:50.93**, 12.4 MB.
Its final two lines:

```
[Mon 08/24/2026 23:02:39.20] paragraphs PAUSED by services/ingest/.checkpoints/STOP -- not restarting
[Tue 08/25/2026 12:45:50.92] paragraphs PAUSED by services/ingest/.checkpoints/STOP -- not starting
```

The batch **exited** at 12:45:50. `cmd 20124` survives only because the launcher invoked it
under `cmd /K`, which holds the console open after the script returns. So:

- `processAlive` = **true**
- `heartbeatFresh` = false (log untouched 2 h 8 m)
- `checkpointAdvancing` = false
- `outputDelta` = **0**
- correct logical state = **STOPPED** — not `RUNNING_STALLED`, and emphatically not RUNNING.

A liveness check that asks "is the cmd alive" calls this healthy. It is a dead console.

**The second half is worse than the first.** `services/ingest/.checkpoints/STOP`
**no longer exists** (`ls` → No such file). It was removed after 12:45:50. The launcher fires
**only at logon**, so nothing restarted the worker when the pause was lifted. Paragraph
enrichment is down and stays down until someone logs on again.

Measured before claiming a backlog: the log's last real iterations report `judgments
scanned 0` against checkpoint cursor `2026-08-19T23:05:38Z / 14,266,006 scanned`. The
paragraphs frontier was **closed** when it was paused, so the current cost of it being down
is a monitoring gap, not lost work.

### Startup inventory

`OBSERVED_BY_EXECUTION` — `Get-ScheduledTask`, `Win32_Service`, Run keys, Startup folders.

| component | mechanism | boot or logon | evidence |
|---|---|---|---|
| **Postgres** | Windows service `LawMindPostgres`, `StartMode=Auto`, `StartName=LocalSystem`, `pg_ctl runservice -D C:\lawmind\pgdata` | **BOOT — unattended** | started 12:42:02, 13 s after boot, parent `services.exe`, alongside other Auto services |
| scheduled task `LawMindPostgres` | logon trigger → `scripts/migration/pg-local.mjs spawn-detached` | **DISABLED** | `State: Disabled`, last run 2026-08-18T02:36:34; superseded by the service above |
| `Lawmind-new1-sidecar-keeper` | scheduled task, 5-min time trigger | **logon — `LogonType: Interactive`** | `State: Running`; `LastTaskResult 0x800710E0` (win32 4320, "the operator or administrator has refused the request") on every re-fire — the correct *IgnoreNew* refusal while the 12:55:40 instance runs |
| `Lawmind-alert-poll` | scheduled task, 10-min time trigger, `.agents/jobs/lcc-alert-poll.cmd` | **logon — `LogonType: Interactive`** | `State: Ready`, last run 14:52:11, LastResult **0**, next 15:02:10 |
| **paragraphs enrichment** | **user Startup folder** — `%APPDATA%\...\Startup\Lawmind-paragraphs.cmd`, ENABLED | **logon only** | fired 12:45:50, 4 min after boot |
| citations enrichment | same folder, renamed `Lawmind-citations.cmd.disabled-frontier-closed` | **disabled** | 14 Aug |
| ingest fleet | same folder, renamed `Lawmind-ingest.cmd.disabled-frontier-closed` | **disabled** | 15 Aug |

`OBSERVED_BY_PRIMARY_SOURCE` — the launcher's own header states the constraint plainly:
`schtasks /create` and `Register-ScheduledTask` both return *Access is denied* for this
unelevated user, so the Startup folder was chosen deliberately, founder-approved 14 Aug, and
the file says in terms: *"It starts at LOGON, not at BOOT. A rebooted machine sitting at the
lock screen runs nothing."*

**The unattended-recovery answer is split and must not be reported as one number.**
Postgres recovers at boot with nobody present. **Every LawMind worker and the alert poller
recover only after an interactive logon** — all three surviving mechanisms are
`LogonType: Interactive` or the Startup folder. R7 §4 forbids calling that unattended
recovery, and this lane does not.

**Correction owed to NEW1 (1127/1156):** those `cmd /K` loops are correctly described as
having no scheduled task, no registry record and a dead parent — but not as *orphans in
origin*. A founder-approved logon launcher recreates one on **every interactive logon**;
today's instance is 4 minutes younger than the boot. Filed on the bus, with the caveat that
the *citations* loop NEW1 measured is a different, now-disabled launcher from the
*paragraphs* one alive today.

### Ghost external workloads

`NOT_MEASURED` at START_STATE. Railway MCP is attached to this session (six `railway mcp`
child processes are IDE plumbing, not workloads). Auditing residual Railway cron/services
still able to write or serve stale state is LCC-P0 item 8 and is queued. Nothing will be
reactivated.

---

## 6. Database

`OBSERVED_BY_LIVE_DB` — `psql` against `postgresql://postgres:***@127.0.0.1:5432/lawmind`.

| field | value |
|---|---|
| server | **PostgreSQL 18.6** on x86_64-windows, msvc-19.44.35228, 64-bit |
| data dir | `C:\lawmind\pgdata` |
| reachable | yes |
| `drizzle.__drizzle_migrations` rows | **58** |
| newest bookkeeping `created_at` | `1786442900000` (2026-08-11) |
| `_journal.json` entries | **87** |
| `.sql` files in `packages/db/drizzle/` | **87** |
| git-tracked `.sql` files | **87** |

### Migration truth at START_STATE, measured

`OBSERVED_BY_EXECUTION` — `node scripts/check-migration-journal.mjs` → **OK, 87 migrations,
journalled, ordered and tracked.** The journal ↔ file ↔ git triangle NEW2 reported broken in
1161 is now **closed**: they measured 83 journal entries against 87 files; there are now 87
and 87, `meta/_journal.json` is committed and clean, and the `0083` ordinal collision is
resolved (NEW2 renamed theirs to `0086_quality_screen_runs`). That is a partial
`CORRECTION_OF=1161` — only the four-unjournalled-files half.

**The larger half of 1161 stands, and is worse than stated.** Drizzle's migrator advances on
the journal's `when` timestamp, not on a row count. The live table's newest `when` is
`1786442900000`, which is journal idx **72** (`0072_quality_contract`). So drizzle believes
**73 applied, 14 pending** — while the table holds only **58 rows**.

- **15 journal entries sit at or below the live cursor with no bookkeeping row** →
  `APPLIED_UNRECORDED` candidates. `DERIVED` from the two counts; per-migration schema
  footprint not yet probed.
- **14 entries (`0073_overruled_status_index` … `0086_quality_screen_runs`) are pending by
  `when`** and would be re-applied by an official `migrate` against the live DB. Several are
  demonstrably already present — `0082_treatment_provenance_column` is populated (NEW2 1114:
  11,579 rows classified), `0083_ops_job_observations` backs `admin/metrics.ts`, and
  `0079_fk_delete_indexes` was proven at cost 2.36 (LCC 1068). A bare `ALTER TABLE … ADD
  COLUMN` or `CREATE INDEX` in that range **aborts the run partway**.

**Therefore `pnpm migrate` must not be run against the live database.** R7 §8 says so in
terms; the measurement now says why. Enumerating idempotency per migration is this lane's
work, not NEW2's — they said so, and they are right.

---

## 7. FACTS_OBSERVED

1. Postgres 18.6 is up, boot-started, unattended, LocalSystem, 13 s after boot. `OBSERVED_BY_EXECUTION`
2. Every LawMind *worker* and the alert poller depend on an interactive logon. `OBSERVED_BY_EXECUTION`
3. The job registry disagrees with the OS on all three of its `RUNNING` rows: one dead pid
   (23660), two null pids, and one live worker absent entirely. `OBSERVED_BY_EXECUTION`
4. `cmd 20124` is alive with zero output delta because `cmd /K` outlived an exited batch;
   its true state is STOPPED. `OBSERVED_BY_EXECUTION`
5. `services/ingest/.checkpoints/STOP` was removed and no launcher re-fired; paragraphs
   enrichment is down, on a closed frontier. `OBSERVED_BY_EXECUTION`
6. Journal ↔ files ↔ git agree at 87. `OBSERVED_BY_EXECUTION`
7. Live `__drizzle_migrations` = 58 rows with its cursor at journal idx 72 → 15 unrecorded,
   14 would-be-re-applied. `OBSERVED_BY_LIVE_DB` + `DERIVED`
8. No `DB_MIGRATION` lease file exists. `OBSERVED_BY_EXECUTION`
9. NEW1's tranche selection is BLOCKED, so no G3 candidate retrieval path exists today.
   `OBSERVED_BY_CODE` (bus 1175)
10. The orchestration file itself is untracked in git. `OBSERVED_BY_EXECUTION`

## 8. FACTS_UNVERIFIED

1. Which of journal entries 0059–0086 are idempotent. `NOT_MEASURED`
2. Per-migration live-schema footprint — the `APPLIED_UNRECORDED` vs `JOURNALLED_UNAPPLIED` split. `NOT_MEASURED`
3. Whether a disposable empty DB can reach the current schema from the journal alone. `NOT_MEASURED`
4. Residual Railway/cloud cron or services still able to write or serve stale state. `NOT_MEASURED`
5. Whether the GPU sidecar at pid 4116 is producing durable vectors or replaying. `NOT_MEASURED` —
   NEW1 owns the walk; this lane reads output delta only, never utilization or PID.
6. Whether `Lawmind-alert-poll`'s `LastResult 0` corresponds to a tick that evaluated
   conditions and attempted delivery, or an early exit. `NOT_MEASURED`
7. Whether the M09 timeout cascade reproduces on current HEAD. `NOT_MEASURED`
8. Whether `anticipatory bail`'s empty 200 is `coverage_unknown` or a genuine empty result. `NOT_MEASURED`
9. Security/privacy regression status after four days of backend change. `NOT_MEASURED`
10. External object-store erasure round trip. `NOT_MEASURED`

## 9. DEPENDENCIES

| this lane needs | from | state |
|---|---|---|
| accepted candidate retrieval path (G3) | NEW1 | **BLOCKED** — tranche selection failed 3× (1175). Gates LCC-P1 mixed-load and the rehearsal's semantic-equivalence half. |
| the abstention/outcome signals the contract must carry | NEW1 | partial — 1150: held-out abstention will cover 6 of 8 posed classes, statute not among them |
| resolver freshness design agreement | NEW2 | in progress — 1097/1112/1116 landed, 1136/1140 open |
| 293-citation batch-gap RCA | NEW2 | theirs; LCC consumes the freshness consequence only |
| ten-matter backend acceptance | NEW3 | waits on this lane publishing `RETRIEVAL_OUTCOME_CONTRACT_V1` |
| four additive wire seams | RCC | parked; the contract must not break the parked client |
| founder paging recipient | founder | `BLOCKED_FOUNDER_CONTACT` until named |

## 10. FILES_YOU_OWN

- `services/api/src/**` — routes, retrieval outcome, citations serving, admin, auth, erasure
- `packages/db/drizzle/*.sql`, `packages/db/drizzle/meta/_journal.json`, `packages/db/src/migrate.ts` — under a `DB_MIGRATION` lease
- `packages/auth/**`
- LCC-authored `scripts/`: `ci-local.mjs`, `check-migration-journal.mjs`, `job-health.mjs`,
  `supervise.mjs`, `stall-watchdog.mjs`, `lcc-*.mjs`, `resource-gate.mjs`, `lcc-latency-envelope.mts`
- `.agents/jobs/registry.jsonl` (append-only, shared), `.agents/jobs/lcc-alert-poll.cmd`
- `docs/ops/lcc/**`, `docs/ops/migration/**`, this file
- **Not owned:** `apps/**` (RCC), `services/ingest/**` (NEW2), `services/embed/**` and
  `services/harness/**` (NEW1)

## 11. HEAVY_JOBS_YOU_WILL_TOUCH

| job | class | protocol |
|---|---|---|
| disposable-DB fresh-install migration proof | `DB_WRITE`, scratch DB only, never `lawmind` | no heavy window — separate database |
| live-schema footprint probe for the manifest | `DB_SCAN`, catalog-only | light; catalogs, not corpus |
| M09 timeout-cascade reproduction | `DB_SCAN` | bounded; `REQUEST_HEAVY_WINDOW` if it needs the pathological rank path |
| full API/security regression suite | `DB_SCAN` + `DB_WRITE` | `REQUEST_HEAVY_WINDOW` — 578 s quiet, 17 min under load (LCC 1094/1104) |
| release rehearsal / restore / index build | `RELEASE_RESTORE` + `INDEX_BUILD` | **not startable** — gated behind migration truth (R7 §8) and G3 |
| mixed-load / backpressure | `DB_SCAN` | **not startable** — gated behind a G3 candidate path |

This lane will not hold the box for hours while doing unrelated work, and will not overlap
NEW1's passage build or NEW2's full-corpus scans. NEW1 has the box now (1175) and is
mid-walk; no heavy window is requested at START_STATE.

---

## 12. P0 order this lane will execute

1. process-registry / startup truth, incl. Postgres and ghost external workloads → `PROCESS_CONTROL_TRUTH_V3.md`
2. canonical migration truth / fresh-install path → `MIGRATION_TRUTH_MANIFEST_V1` + `CANONICAL_MIGRATION_PATH_V1.md`
3. server-authoritative retrieval outcome across search / counterarguments / briefings / drafting backend → `RETRIEVAL_OUTCOME_CONTRACT_V1.md`
4. resolver correctness freshness at ingest scope → `RESOLVER_CORRECTNESS_FRESHNESS_V3.md`
5. M09 timeout-cascade RCA → `M09_TIMEOUT_CASCADE_RCA.md`
6. security/privacy non-regression → `SECURITY_PRIVACY_REGRESSION_V1.md`

Then, on their own preconditions: API compatibility + release manifest, external-object
erasure, curated backup / host-loss, human paging, fixture-contamination cleanup; and after
an accepted G3 path, mixed-load/backpressure and the release rehearsal.

**G0 effect:** LCC has published START_STATE. Ownership conflicts reconciled on this lane's
side — the LCC lease was taken from a dead session. NEW2, RCC and CLIENT_APPS leases are
stale but are not this lane's to reap.
