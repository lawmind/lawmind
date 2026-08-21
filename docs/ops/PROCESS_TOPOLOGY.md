# PROCESS TOPOLOGY — what runs on this workstation, and which windows are real

**Owner:** LCC · **First written:** 18 Aug 2026 · **Measured, not remembered.**

> **RESOLVED the same day.** The founder granted elevation, PostgreSQL was
> registered as a Windows service, and the cutover ran clean. **Every postgres
> process now lives in SessionId 0, which has no interactive desktop — the
> windows are not hidden, they cannot be created.** 37 consoles → 1 (the
> postmaster's, unreachable); 33 taskbar windows → 0; and the cluster now starts
> at BOOT rather than at logon. Section 5 records what changed. The rest of this
> document is the diagnosis that got there, kept because the mechanism is worth
> understanding the next time something opens a window.

Everything here was read off the live machine. Where a number appears it is a
count taken at a stated moment, not a design intention. Re-measure with the
commands in §6 rather than trusting this file's numbers after a restart.

---

## 1. The finding that produced this document

The founder reported dozens of terminal windows across the taskbar, and the
working assumption was that the ingest fleet had spawned them. **It had not.**
Measured 18 Aug 2026, 05:57:

| owner | visible windows |
| --- | --- |
| **PostgreSQL child processes** | **33** |
| LCC enrichment workers (`cmd /K`) | 2 |
| IDE, browser, Task Manager, shell UI | 8 |
| ingest fleet (8 scopes, 48 processes) | **0** |

The ingest fleet is launched correctly: `scripts/start-ingest-fleet.ps1` uses
`Start-Process -WindowStyle Hidden` with both stdio streams redirected to
per-scope log files. It contributes **no** visible windows at any width.

**The taskbar storm was the database.**

---

## 2. Why PostgreSQL opens windows — the mechanism

The postmaster is spawned with `detached: true`
(`scripts/migration/pg-local.mjs`, `spawnPostmaster`), which libuv maps to
`DETACHED_PROCESS`. That was the correct fix for the postmaster and is not in
question. Its consequence is not what the code comment used to claim:

> **A process with NO console that spawns a console-subsystem child does not
> pass a console down. Windows ALLOCATES A NEW ONE for the child.**

So `DETACHED_PROCESS` did not remove consoles from the cluster — it **moved them
down a level**, from one postmaster to every backend, autovacuum worker,
`io_worker`, `wal_writer` and `bgworker`. On Windows 11 the default terminal
application is Windows Terminal, so each of those consoles also surfaces as its
own taskbar window titled with the server binary's path:

```
C:\lawmind\pgsql\pgsql\bin\postgres.exe
```

Window count therefore tracks **connection count**, which is why it grew with
fleet width and looked like a fleet problem.

### 2.1 Measured, with a control that discriminates

A detached parent spawning three ordinary console children, versus the same
parent non-detached:

| launcher flags | child consoles | visible windows | parent survives launcher |
| --- | --- | --- | --- |
| `detached: true` (current) | **3** | **3** | yes |
| `detached: false` | 0 | 0 | **no — died with it** |

Both options are bad. `detached: true` is the less bad one, which is why
**dropping `detached` is not an available fix** and the code now says so.

---

## 3. Why this is a hazard and not an eyesore

Those windows are live console attachments to live database processes. Closing
one delivers a console control event; the attached backend exits `0xC000013A`
(`STATUS_CONTROL_C_EXIT`); and the postmaster treats an abnormal child exit as a
crash and **restarts the entire cluster**, taking every ingest worker with it
(bus 0668).

Every recorded instance killed a **child**, never the postmaster:

| when | what died | code |
| --- | --- | --- |
| 2026-08-17 00:39:43 | client backend | `0xC000013A` |
| 2026-08-17 06:45:48 | autovacuum worker | `0xC000013A` |
| 2026-08-18 04:22:21 | autovacuum worker | `0xC000013A` |

That asymmetry is the signature. It is what the console mechanism predicts and
what a memory-exhaustion explanation does not.

### 3.1 The OOM hypothesis is not supported

NEW2 observed the cluster disappearing around a period of ~5.7% free RAM and
~71 Node processes, and resource exhaustion became the working theory. **The
exit code refutes it as the cause:** `0xC000013A` is a console control exit, not
an allocation failure. PostgreSQL reports memory exhaustion differently, no
Windows event accompanies these kills, and the 04:22 kill happened while the box
was not under that pressure.

The correlation was real but indirect: **more fleet width → more DB connections
→ more backends → more windows → higher chance one gets closed.** Width made the
accident likelier without being its cause. Reducing width therefore helped, and
that is not evidence for OOM.

Memory pressure remains worth watching on its own merits — 19.2% free and 74.7%
of commit at 8 scopes, 18 Aug 06:00 — but it is not this bug.

---

## 4. Current shape of the machine

Measured 18 Aug 2026 ~06:00.

```
postgres.exe (postmaster, pid 16204, launcher gone — orphaned by design)
└── ~35 children      each with its OWN console  ← §2, the storm
                      each a conhost.exe, each a taskbar window until hidden

ingest fleet — launched by scripts/start-ingest-fleet.ps1, launcher already exited
└── node supervise.mjs hc-boot-mid-<court>        × 8   (hidden, logs redirected)
    └── cmd.exe /d /s /c "npx.cmd tsx …"                ← npx shim
        └── node npx-cli.js tsx …
            └── cmd.exe /d /s /c "tsx …"                ← tsx shim
                └── node tsx/dist/cli.mjs
                    └── node --require preflight.cjs    ← the actual worker

LCC enrichment workers — cmd /K, VISIBLE, logs in %TEMP%\lawmind-<name>.log
├── citations-cli.ts   --limit 20000 --batch 25 --concurrency 12
└── paragraphs-cli.ts  --apply --resume

agent/IDE tooling — chrome-devtools-mcp ×2, railway mcp ×4 (cmd+node wrappers)
```

### 4.1 Two structural notes, neither urgent

- **Six processes per ingest worker, four of them wrappers.** `supervise.mjs`
  spawns `npx tsx …`, and `npx` on Windows resolves through two `cmd.exe` shims.
  Spawning the resolved `tsx` binary directly would remove 4 processes × 8 scopes
  = 32 processes with no behaviour change. Not done here: the fleet is mid-run
  and this is NEW2's launcher, not LCC's. Filed as an observation, not a change.
- **The fleet's supervisors are orphaned.** Their launcher (pid 17536) has
  exited. This is by design — `Start-Process` detaches them so they survive the
  agent turn that started them — but it means `ppid` is useless for attribution,
  and the scope name in the command line is the only reliable owner key.

---

## 5. What was done about it

### The fix (18 Aug 2026, elevated - this is the one that matters)

```
pg_ctl register -N LawMindPostgres -D "C:/lawmind/pgdata" -S auto
pg_ctl stop -D "C:/lawmind/pgdata" -m fast    # clean, 18s, no crash recovery
Start-Service LawMindPostgres                  # 3s
```

A Windows service runs in **session 0**, which has no interactive desktop. The
postmaster keeps ONE console and its children **inherit** it instead of each
allocating a new one - the same inheritance rule from section 2, now working for
us instead of against us.

| | before | after |
| --- | --- | --- |
| postgres consoles | **37**, one per child | **1**, the postmaster's |
| of those, reachable by a user | **37** | **0** |
| postgres taskbar windows | **33** | **0** |
| starts after | logon only | **boot** |

**The fleet survived the restart with no worker lost** - all 8 process chains
intact, on the transient-SQLSTATE retry (`services/ingest/src/db-transient.ts`).
**7 of 8 scopes were writing again within seconds. `3_22` was not**, and the
aggregate would have hidden it: it reconnected on the same `57P03` retry but
restarted its pass on a different year partition and took ~18 minutes to write
its first rows, now running 0.9 docs/s against 35.2 before the restart. Whether
it resumed from its checkpoint or re-walked is NEW2's to confirm.
(`services/ingest/src/db-transient.ts`, `57P03`/`57P01`/`57P02`) wired after bus
0668. No worker lost, no checkpoint rewound.

### Three follow-ons, because a fix the next agent can undo is not finished

- **`pg-local.mjs start` and `spawn-detached` now REFUSE when the service
  exists.** Their whole job is to spawn a DETACHED postmaster, which is exactly
  what gives every backend its own console again.
- **`isRunning()` no longer trusts `pg_ctl status`.** Measured minutes after the
  cutover, with the database demonstrably up:

  ```
  pg_ctl -D C:/lawmind/pgdata status  ->  "pg_ctl: no server running", exit 3
  pg_isready                          ->  "accepting connections"
  ```

  An unelevated `pg_ctl` cannot open a LocalSystem process in session 0, so it
  reports the cluster DOWN. `start()` branches on that, so believing it would
  have spawned a second postmaster against a live data directory. The service is
  asked first now, the port is the tie-breaker, `pg_ctl` is the last resort.
- **The `LawMindPostgres` scheduled task is disabled**, not deleted. A service
  starting at boot strictly dominates a task starting at logon.

### Retired

`scripts/pg-hide-consoles.ps1` was the unelevated interim - it hid the windows
with `ShowWindow(SW_HIDE)`, took the desktop from 43 visible windows to 10, and
hid 493 of them over the session as new backends kept opening more. **Its
watcher is stopped and it is no longer needed.** The file stays as documentation
of the mechanism and as a fallback if the service is ever unregistered.

### What was deliberately NOT done

- **Nothing was terminated to tidy the taskbar.** Every window belonged to
  something doing real work.
- **The fleet launcher was not touched.** It was already correct.

## 6. How to re-measure — do this rather than trust §1

```powershell
# the whole picture, including the two checks that used to be missing
node scripts/migration/pg-service-verify.mjs

# how many windows are showing right now (read-only, changes nothing)
powershell -NoProfile -File scripts/pg-hide-consoles.ps1

# hide them / put them back
powershell -NoProfile -File scripts/pg-hide-consoles.ps1 -Apply
powershell -NoProfile -File scripts/pg-hide-consoles.ps1 -Restore

# keep them hidden (self-guarding; a second copy refuses to start)
powershell -NoProfile -File scripts/pg-hide-consoles.ps1 -Apply -Watch
```

`pg-service-verify.mjs` gained two checks this session, because the one it had
was passing while 33 database windows sat on the desktop: it asked about the
**postmaster's** parent and nothing about its children. It now also reports
`child consoles` and `console windows hidden`.

`child consoles` is a **note, not a FAIL**. It is the expected state until
FQ-PGSERVICE lands, and a permanently red check is a check people stop reading.

---

## 7. Two traps this cost, worth not repeating

**A guard that greps the process table can match itself.** The first
single-instance guard for the watcher scanned for any process whose command line
mentioned the script — and the launcher was a `powershell.exe` whose command line
quoted the script path. It matched itself, reported "already running", and
started nothing. It looked entirely convincing in the process table. **The absent
log file is what exposed it.** The guard now lives inside the watcher and is keyed
to a pid file that only a real watcher writes, checked for liveness and identity
rather than existence — the inversion that `enrich-worker.cmd`'s stale lock file
once caused.

**Verify by effect, not by process table.** "A watcher is running" was false while
two plausible PIDs were on screen. The question that settled it was "has the log
file been written", and it took one command.
