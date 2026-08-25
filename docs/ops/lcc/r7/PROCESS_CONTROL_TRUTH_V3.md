# PROCESS_CONTROL_TRUTH_V3

**Owner:** LCC · **Date:** 25 August 2026 · **Gate:** G1 (with Fifth)
**Supersedes:** the process sections of `docs/ops/PROCESS_TOPOLOGY.md` where they differ.
**Orchestration:** R7 §4 and §8 LCC-P0, plan SHA-256 `6e868d64…f7d`.

Every claim is labelled. Nothing here is inferred from a PID, a GPU reading, an exit code
or a checkpoint that moved.

---

## 0. The one-paragraph answer

The registry and the OS disagreed about **every** job either of them called RUNNING, and the
disagreement was not noise — the tool that reads them **adopted a stranger's process as
NEW1's GPU sidecar and reported it healthy**. That is fixed, with a falsifiable regression
test. Separately: **Postgres is the only thing on this box that survives a reboot
unattended**; every worker and the alert poller wait for a human to log in, and one of them
cannot be made unattended without an elevated prompt. And one **ghost is still live in the
cloud** — a Railway Postgres holding 120.67 GB, eight days after the migration gate it was
kept for reported `fail: 0`.

---

## 1. The defect that was found by being committed

`OBSERVED_BY_EXECUTION` — `.agents/jobs/observations.jsonl`, line written 2026-08-25T11:04:09.169Z:

```json
{"job_id":"new1-gpu-sidecar","observed_at":"2026-08-25T11:04:09.169Z","state":"STARTING",
 "declared_status":"RUNNING","pid":23660,"pid_alive":true,
 "pid_created_at":"2026-08-25T15:04:09.1427650+04:00","why":"alive 0s, no progress reading yet"}
```

Read it against what the registry declared for the same job: `pid 23660`, `started_at
2026-08-21T15:58:34+04:00`.

The process the tool found was born **four days after** the job started, and **25
milliseconds before the sweep that read it**. It was a transient shell that Windows had
recycled pid 23660 into. `job-health.mjs` called it NEW1's GPU sidecar, `STARTING`, and
moved on. Two runs either side of it — 11:02:43 and 11:05:31 — correctly said `FAILED`.

**The cause was one expression:**

```js
sameProcess: osProc ? !job.pid_created_at || job.pid_created_at === osProc.Created : false
```

A registry line with no recorded creation time — which was **most** of them, since the schema
never required one — short-circuited to `true`. *The absence of the check was scored as the
check passing.* This is the same inversion as the stale lock file that made "already running"
mean "nothing is running", and it is worse here, because the file's stated purpose is to
refuse to infer.

It is worth being blunt about what this cost: `stalledCriticalJobs` pages were being sent on
this data. The 10:53:03.435Z receipt in `.agents/ops/alerts.jsonl` paged that
`new1-doc-vector-embed`, `new1-gpu-sidecar` **and** `new1-sidecar-keeper` were all `FAILED:
declared RUNNING but no such process`. Two of those three were **alive the whole time**, at
pids 4116 and 18856. The control plane was paging about its own blindness.

---

## 2. Identity — what replaced it

`OBSERVED_BY_CODE` — `scripts/job-health.mjs`, `identify()`.

R7 §4 requires identity by **PID + creation time + command signature + instance id**. All
four are now carried, and the verdict is reported rather than collapsed into a boolean:

| verdict | meaning |
|---|---|
| `CONFIRMED_BY_CREATION` | pid alive **and** its creation time equals the recorded one. A recycled pid has a later birth and cannot forge this. |
| `CONFIRMED_BY_SIGNATURE` | pid alive, no creation time on record, but the live command line names the same script. Weaker, honest, useful. |
| `PID_RECYCLED` | pid alive and demonstrably somebody else. **Refused.** |
| `REDISCOVERED` | the recorded pid is gone but a live process runs this job's command. The job moved; it did not die. |
| `ABSENT` | nothing matches by pid or by signature. |
| `UNVERIFIABLE` | the sweep itself failed. Never death. |

**Instance id** is `pid@creationTime` — e.g. `4116@20260825T125609`. A pid is a name another
process can inherit; a pid plus a birth instant cannot be.

### What rediscovery bought immediately

`OBSERVED_BY_EXECUTION` — same box, before and after:

| job | before | after |
|---|---|---|
| `new1-gpu-sidecar` | `pid 23660` · FAILED, and once STARTING on a stranger | **`4116@20260825T125609`** · alive, attributed |
| `new1-sidecar-keeper` | `pid null` · FAILED | **`18856@20260825T125541`** · alive, attributed |
| keeper wrapper `cmd 21612` | `(unregistered)` orphan | attributed as the keeper's own launcher |
| GPU server `python 4116` | `(unregistered)` orphan | attributed to `new1-gpu-sidecar` |

Four "unregistered orphans" and two "FAILED" rows were one healthy keeper chain, misread
because identity was a pid.

---

## 3. Producing versus replaying

R7 §4: *"Progress = new durable vector/passages + consistent checkpoint/log movement."* Both
halves. The tool previously scored the second half alone.

NEW1's 1181 is the case that proves why (`OBSERVED_BY_LIVE_DB`, theirs, independently
consistent with this lane's reading):

```
new1_doc_vector_stage @ 05:03:57Z   2,026,872
new1_doc_vector_stage @ 10:52:18Z   2,026,872      outputDelta = 0
```

65 minutes. GPU resident, keeper healthy, checkpoint advancing, log growing, batches
00131–00141 each reporting `inserted: 0`. Every signal anyone was watching said healthy.

A new state, `RUNNING_REPLAYING`, now names it: **alive, advancing, and producing nothing.**
A bounded replay is legitimate — a resumed walk re-reads its skip prefix — so it is a window
(30 min) and not a threshold; past it the state must be declared, not inferred.

Durable output is declared per job as an `output_probe` and is **never** guessed:

```
{ "kind": "sql",   "label": "staged_vectors", "query": "select count(*) from new1_doc_vector_stage" }
{ "kind": "lines", "label": "receipts",       "path":  ".agents/ops/alerts.jsonl" }
```

`OBSERVED_BY_EXECUTION` — the SQL probe run once under `--with-output` returned
**`2,026,872`**, byte-identical to the figure in NEW1's own pause file. The measurement path
is real, not a schema.

Two deliberate refusals:

- **SQL probes are off unless `--with-output` is passed.** A health check that silently
  counts against a 22 GB heap becomes a `DB_SCAN` and competes with the work it monitors.
  Without the flag the column reads `?` — `NOT_MEASURED`, never `0`. Unmeasured and zero are
  opposite facts.
- **No probe declared reads `n/m`, not "fine".** A job with no output probe can only ever be
  reported as "checkpoint moved", and the state's reason string says so in those words.

### A bound that was not a bound

`OBSERVED_BY_EXECUTION`. The first version of the SQL probe issued
`set local statement_timeout = '20s'; select count(*) …`. It ran past **120 seconds** and was
still going. `SET LOCAL` outside an explicit transaction applies to nothing — `pg_stat_activity`
showed the statement carrying that text with no timeout in force. The bound is now set on the
connection. *A timeout that does not apply is worse than none, because it is a bound everyone
believes in.*

---

## 4. The process that is alive and finished

`OBSERVED_BY_EXECUTION` — `cmd 20124`, alive since 12:45:50; `%TEMP%\lawmind-paragraphs.log`
last written 12:45:50.93, final line:

```
[Tue 08/25/2026 12:45:50.92] paragraphs PAUSED by services/ingest/.checkpoints/STOP -- not starting
```

The batch **exited**. `cmd /K` held the console open. So `processAlive=true`,
`heartbeatFresh=false`, `checkpointAdvancing=false`, `outputDelta=0` — and the correct state
is **STOPPED**, not `RUNNING_STALLED`.

The tool now tests this mechanically and job-agnostically: a `cmd`/`powershell` process whose
only child is its own `conhost` has no worker under it. It reports *"console shell with no
worker child — its batch exited and `cmd /K` held the window open. Alive, and finished."*

**`CORRECTION_OF=1127,1156` (NEW1).** Their three facts — no scheduled task, no registry
record, dead parent (ppid 16484, confirmed absent) — are all correct. The word *orphan* is
what needs amending: a founder-approved logon launcher recreates one on **every interactive
logon**, and today's instance is four minutes younger than the boot. Killing it does not
remove it. NEW1's own `CORRECTION_OF 1175` (one loop, not two) is confirmed independently.

**And the half nobody had:** `services/ingest/.checkpoints/STOP` **no longer exists**. It was
removed after 12:45:50, and nothing restarted, because the launcher fires only at logon.
Whoever lifted that pause should know it did not take effect.

Measured before calling it a backlog: the log's last real iterations report `judgments
scanned 0` at cursor `2026-08-19T23:05:38Z / 14,266,006 scanned`. The paragraphs frontier was
**closed** when it was paused. The cost is a monitoring gap, not lost work.

---

## 5. Startup truth — and the honest answer is split

`OBSERVED_BY_EXECUTION` — `Win32_Service`, `Get-ScheduledTask` (with `Principal.LogonType`),
Run keys, Startup folders. Boot was `2026-08-25T12:41:49+04:00`.

| component | mechanism | boot or logon | evidence |
|---|---|---|---|
| **Postgres 18.6** | Windows **service** `LawMindPostgres`, `StartMode=Auto`, `LocalSystem`, `pg_ctl runservice -D C:\lawmind\pgdata` | **BOOT** | up 12:42:02 — **13 s after boot**, parent `services.exe`, alongside other Auto services. No logon involved. |
| task `LawMindPostgres` | logon trigger → `scripts/migration/pg-local.mjs spawn-detached` | **DISABLED** | fossil; last run 2026-08-18T02:36:34. Superseded by the service. |
| `Lawmind-alert-poll` | scheduled task, `PT10M` | **LOGON** | `<LogonType>InteractiveToken</LogonType>` |
| `Lawmind-new1-sidecar-keeper` | scheduled task, 5-min | **LOGON** | `LogonType: Interactive`; `LastTaskResult 0x800710E0` (win32 4320) on every re-fire — the correct `IgnoreNew` refusal while the 12:55:40 instance runs, not a fault |
| paragraphs enrichment | user **Startup folder**, `Lawmind-paragraphs.cmd`, ENABLED | **LOGON** | fired 12:45:50 |
| citations / ingest launchers | same folder, renamed `.disabled-frontier-closed` | disabled | 14–15 Aug |

**The control plane could not see the one thing that works.** Until today this inventory
listed exactly one Postgres entry — the *disabled* scheduled task. Read literally, it said the
database has no working startup mechanism. The opposite is true. Windows services are now
inventoried, and the report ends with one line that answers the question directly:

```
UNATTENDED RECOVERY: 1 mechanism(s) start at BOOT, 3 need an interactive LOGON.
A rebooted machine sitting at the lock screen runs only the first group.
```

R7 §4 says *"Do not claim unattended recovery if it still depends on somebody logging in."*
This lane does not. **Postgres recovers unattended. Nothing else does.**

### The pager cannot be made unattended from here — `BLOCKED`

`.agents/jobs/lcc-alert-poll.cmd` records that a scheduled task was chosen over the Startup
folder precisely so a locked machine would still page. That reasoning is right and the
implementation does not achieve it: the task's principal is `InteractiveToken`, so it fires
only while someone is logged on.

`OBSERVED_BY_EXECUTION` — converting it to `S4U` (run whether logged on or not, no stored
password) was attempted and returned **`Access is denied`**. S4U needs `SeTcbPrivilege`; the
shell is not elevated. The alternative, "run whether user is logged on or not" with a stored
password, needs the account password, which this lane does not have and will not ask for.

So the file's claim that `schtasks` access "is no longer true" is **half right**: creating an
*Interactive* task now works; creating an unattended one still does not. Queued for the
founder, and it belongs to R7 §17's first genuine founder decision (on-call expectation)
rather than being an engineering blocker anyone here can clear.

---

## 6. Ghost external workloads

`OBSERVED_BY_EXECUTION` — Railway metrics API, project `lawmind`
(`9cb948ba-fc2d-4e70-bd98-d920f19e6337`), 24-hour window, 1,441 sample points per series.
**Read-only. Nothing was started, stopped, scaled or deleted.**

| service | CPU avg (vCPU) | Memory | Disk | Network TX | verdict |
|---|---|---|---|---|---|
| **Postgres** `8704f4e6` | **0.9905** | 0.62 GB | **120.67 GB** | **0.00** | **LIVE** |
| Postgres-fKqF `b9237532` | 0 | 0 | 0 | 0 | dormant |
| Postgres-NQ5a `e445197a` | 0 | — | 0 | 0 | dormant |
| cron `c545ffb7` | 0 | 0 | — | 0 | dormant (last deploy SUCCESS 2026-08-16T17:31:39Z, **not** REMOVED) |
| api `e733da87` | 0 | 0 | — | 0 | dormant |
| recheck `e71f8f7a` | 0 | 0 | — | 0 | dormant |

**One ghost, and it is the expensive kind.** The Railway Postgres is running, holds
**120.67 GB** — the corpus — and has transmitted **0.00 GB in 24 hours**. Nothing has read a
byte out of it. So it is *not* serving stale state today; it remains *capable* of it, and it
is billing.

The thing that makes this a finding rather than a note:

`OBSERVED_BY_EXECUTION` — `docs/ops/migration/compare-final.json`:

```
"counts": { "fail": 0, "warn": 2, "info": 1 },   "comparedAt": "2026-08-17T01:59:41.871Z"
53 tables compared on exact counts, 0 skipped
```

`RAILWAY_SHUTDOWN.md` §0 calls that comparison *"the whole decision"*, and it passed
**eight days ago**. Its §1 puts *"Stop Railway services (do not delete)"* at step 2 and says
**"Step 2 is where the money stops."** Step 2 has not happened for the Postgres.

Priced from the current metrics against Railway's published rates ($10/GB/mo RAM,
$20/vCPU/mo, $0.15/GB/mo volume): `0.54 GB × 10 + 0.99 vCPU × 20 + 120.67 GB × 0.15` ≈
**$43/month**, ~$0.06/hr. `DERIVED` — a computed estimate from measured metrics, not a bill,
and the CPU figure is worth a second look: a sustained 0.99 vCPU on a database with zero
egress is more than an idle postmaster should need.

**Not this lane's call, and deliberately not taken.** R7 §8 says *"Do not reactivate anything"*
and this lane went further and changed nothing at all. `RAILWAY_SHUTDOWN.md`'s ONE RULE keeps
Railway up until the local copy **and the R2 backup** are *independently* verified — the
`compare.mjs` half is proven, the R2 half is not yet re-verified by this lane and is LCC-P1
work. Stopping the documented rollback path for a 20-million-judgment corpus on a partially
satisfied gate is exactly the irreversible-and-unsure case. Filed for the founder.

---

## 7. The dashboard

`OBSERVED_BY_EXECUTION` — `node scripts/job-health.mjs`. Columns are R7 §8's, in its order:

```
JOB | OWNER | INSTANCE | PID | STATE | HEARTBEAT | LAST OUTPUT | OUTPUT DELTA
    | CHECKPOINT | STARTUP | RESTARTS | RESOURCE
```

`OUTPUT DELTA` sits next to `STATE` on purpose: `RUNNING_*` beside a delta of `0` is the shape
that cost NEW1 65 GPU-minutes, and it should be readable at a glance rather than derived.

Tracked separately, never merged, per R7 §4: `processAlive` · `heartbeatFresh` ·
`checkpointAdvancing` · `outputDelta` · `humanAlertDelivered`.

### The alert condition R7 asks for

`pageable()` is deliberately separate from the state machine, because it answers a different
question — *is this worth waking someone* rather than *what is it doing*:

| condition | severity |
|---|---|
| critical job declared RUNNING and absent | `PAGE` |
| critical job alive and nothing moved | `PAGE` |
| critical job alive, `outputDelta === 0`, **holding GPU/vector resources** | `PAGE` |
| critical job alive, `outputDelta === 0`, light resources | `WARN` |
| critical job RUNNING with output `NOT_MEASURED` | `WARN` — "it fired" is not "it worked" |

---

## 8. The write side, and why it is a command

`OBSERVED_BY_CODE` — `scripts/job-register.mjs`, new.

Every defect in §1 came from a hand-appended registry line: a dead pid declared RUNNING, two
`RUNNING` rows with `pid: null`, one line truncated mid-append and unparsable to this day, and
LCC's own alert poller with no line at all.

R7 §8 LCC-P0 item 2 requires that a keeper *"atomically retire old keeper instance and register
new"*. The obvious implementation is two appends, and both orderings are wrong:

- **retire-then-register** leaves a gap in which the registry says STOPPED. `job-health --strict`
  runs from CI and from the ten-minute alert tick; a keeper on a five-minute trigger would
  eventually land a tick inside that gap and page a human about a job that is fine.
- **register-then-retire** leaves two RUNNING rows for one `job_id`, and last-line-wins silently
  discards the older — including `restart_count`, the number that says a job is crash-looping.

So it is **one line** carrying both facts, with a `supersedes` block recording the retired
instance, the reason and the timestamp. `restart_count` carries forward and increments across
the handover, so a restart storm stays visible.

`claim` refuses to register a pid that is not alive. `OBSERVED_BY_EXECUTION`:

```
$ node scripts/job-register.mjs claim new1-gpu-sidecar --pid 23660
job-register: pid 23660 is not in the process table. Refusing to register a dead pid as
RUNNING — that is the exact shape that made new1-gpu-sidecar claim 23660 for four days.
If the job has finished, use `retire`.
```

### Cadence jobs

A tick job is not supposed to have a pid. The alert poller runs every ten minutes and exits;
registering its pid would read `FAILED` nine minutes out of ten, and leaving it unregistered
made the control plane report LCC's own pager as an unregistered orphan every time it fired —
which it did.

`job-register.mjs cadence` registers liveness as the **scheduler's** last-run time and progress
as a **receipts file**. Classification keeps three facts apart: *did it fire* (LastRunTime
within cadence × tolerance) · *did it succeed* (LastTaskResult) · *did it do anything*
(receipts delta). The middle one is the trap — a task can return `rc=0` having exited early,
and *"Task Scheduler fired"* is on this file's own list of sentences that are not proof of work.

`OBSERVED_BY_EXECUTION` — `lcc-alert-poll` now reads
`RUNNING_PROGRESSING · LASTOUT 10 · tick 3m ago, rc=0`, and its receipts confirm real
evaluation: the 10:53:03.435Z entry evaluated `ALERT_RULES`, raised two `page` conditions and
recorded `"delivered": []` with both `suppressedByCooldown`. Evaluated, not delivered — and the
two are recorded separately, as R7 §8 LCC-P1 requires.

---

## 9. The regression test, and proof it can fail

`OBSERVED_BY_EXECUTION` — `node scripts/job-health.test.mjs`:

```
job-health identity regression — stranger pid 6480 born 2026-08-25T12:42:03.0939350+04:00
  ok    a live pid with NO recorded creation time and a mismatched command is REFUSED
  ok    the refusal says WHY, naming the process that actually holds the pid
  ok    a live pid with a DISAGREEING creation time is REFUSED
  ok    a live pid with the CORRECT creation time is accepted as the same process
  ok    an accepted job is never reported FAILED
  ok    a cadence job whose scheduled task does not exist is FAILED, not idle
  ok    every job carries an instance id, so a pid alone is never the identity
```

The 23660 failure cannot be reproduced on demand — it needs a pid that is alive *and* is not
the job, and nobody can ask Windows to recycle a number to order. So the fixture builds the
condition deliberately, pointing a fake registry line at a process certainly alive and
certainly not a LawMind worker: the Postgres postmaster.

**Falsified, because a guard that cannot fail is what green looks like.** The old
short-circuit was temporarily reinstated and the suite was re-run:

```
  FAIL  a live pid with NO recorded creation time and a mismatched command is REFUSED
        got state=UNKNOWN identity=CONFIRMED_BY_SIGNATURE — this is the 23660 defect
  FAIL  the refusal says WHY, naming the process that actually holds the pid
job-health identity regression: 2 FAILED     (exit 1)
```

Restored, and green again. The guard has an actual failing case behind it.

---

## 10. What is still open

| item | state | owner |
|---|---|---|
| `registry.jsonl` line 3 is unparsable (`"C:\Python314\python.exe"` — an invalid JSON escape) | reported, **not repaired** — it is NEW1's declaration and a later valid line already supersedes it | NEW1 |
| `new1-sidecar-keeper` reads `RUNNING_STALLED` | **a false stall.** The keeper is fine; its subject is deliberately PAUSED. The honest fix is NEW1 declaring the keeper `PAUSED` while the walk is — a lane's declaration, not LCC's to make | NEW1 |
| NEW1's 1131: "the keeper has never once successfully replaced a STALLED sidecar" | not independently reproduced by this lane | NEW1 |
| Railway Postgres still live, 120.67 GB, gate passed 8 days ago | founder decision; nothing touched | founder |
| Alert paging is logon-gated; S4U needs elevation | `BLOCKED` — elevated prompt | founder |
| SQL output probes verified once each | to be re-run for a real delta after NEW2 releases the box | LCC |

---

## 11. Gate effect

**G1 — factory / migration truth.** This document discharges the process half:
registry ↔ OS reconciliation (§2), embedding/GPU state distinguishing progress from replay
from stall (§3), and the startup inventory (§5). The migration half is
`MIGRATION_TRUTH_MANIFEST_V1` / `CANONICAL_MIGRATION_PATH_V1`, and G1 does not pass on this
document alone.

The resource-window protocol is active and was exercised rather than described: NEW2's
`DB_SCAN` window was granted on the bus, this lane published what it would run concurrently
so contention could be attributed, and its own earlier quiet-window request was **withdrawn**
rather than held while doing unrelated work.
