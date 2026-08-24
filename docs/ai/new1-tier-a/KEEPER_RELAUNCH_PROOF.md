# KEEPER RELAUNCH PROOF — NEW1-6

**Date:** 23 Aug 2026 · **Lane:** NEW1 · **Deliverable:** §7 NEW1-6 of
`LAWMIND_NEXT_ROUND_MASTER_ORCHESTRATION_PLAN_2026-08-23.md`

> **Acceptance as written:** simulate a health miss / runner death and prove the
> keeper creates a **progressing** walk, evidenced by a new stage-runner log line
> **plus a row delta**. Process existence alone fails.

---

## 1. The state this round inherited

`services/harness/src/sidecar-keeper.mjs` restarts the GPU sidecar on a health
miss and relaunches the Tier-A walk on **silence** (20 minutes with no new line
in `stage-embed.log`). The sidecar half worked. The walk half **never once
worked**.

The previous agent stopped at three failed fix-verify cycles, which was correct,
and wrote the state down instead of guessing a fourth time:

- `Start-Process` with the keeper's exact command, **run by hand** from an
  interactive PowerShell, started the walk **every time** (3/3 across 21–23 Aug).
- The **same command issued by the keeper** produced a walk **zero times** across
  **21 consecutive relaunches**, always exiting 0, with no stdout, no stderr and
  no process.
- Three hypotheses were tested and **refuted**: doubled backslashes in the
  launcher path; absolute vs relative launcher path; doubled backslashes in
  `-WorkingDirectory`.

The one difference never tested was written down verbatim in the source:

> The one untested difference remaining is that the keeper spawns PowerShell
> `detached: true` and `unref()`s it, so that PowerShell has no console — and a
> process with no console may be unable to create one for the process it starts.

**This round's live state when the lane lease was taken:** the walk had been dead
since **12:12:04Z** (mid-batch `lcc-00123`) and the keeper had logged **nine more
consecutive `relaunch DID NOT TAKE` lines**, five minutes apart, over 232
minutes. Total failures observed across both rounds: **22**.

## 2. The mechanism, measured

Three variants of the **same `Start-Process` command line**, each launching one
marker script that appends a line and sleeps. The only thing that varied was the
caller.

| variant | caller | marker ran? |
| --- | --- | :---: |
| `direct` | node `spawn('bash.exe', …, { detached: true })` | **YES** |
| `keeper` | node `spawn('powershell.exe', …, { detached: true })` → `Start-Process` | **NO** |
| `keeper-attached` | node `spawn('powershell.exe', …)` **without** `detached` → identical `Start-Process` | **YES** |

Variants 2 and 3 issue a **byte-identical** PowerShell command. The only
difference is `detached: true`, which on Windows means `DETACHED_PROCESS` and
therefore **no console**. A PowerShell with no console cannot create a process
through `Start-Process`, which routes via `ShellExecute` when `-WindowStyle` is
supplied. It exits **0** and says nothing — which is exactly why three
hypotheses about the command's *quoting* were all refuted. **The command was
never the problem. The caller was.** The previous agent's written-down hypothesis
was right.

## 3. The fix

PowerShell is removed from the **launch** path entirely.
`child_process.spawn` calls `CreateProcess` directly — no shell, no
`ShellExecute`, no window station — and a `detached` child of the keeper still
outlives the session, which was the only reason `Start-Process` was reached for
in the first place.

```js
const child = spawn(bash, [WALK_LAUNCH], {
  cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true,
});
```

PowerShell is **kept** for the kill step, because the process table is the only
thing on this box that can find a hung descendant several generations below the
runner (`bash → npx → cmd → node → node`). That kill is now `spawnSync` rather
than a fire-and-forget detached `spawn`: the kill must **finish** before the
start, and the old form raced the launch it was meant to precede. Its stderr is
captured to the relaunch log.

The 20-second post-launch verification against the process table is **kept**. It
did not fix anything, but it is what turned 21 identical silent failures into
something diagnosable, and a launch that works today can stop working tomorrow.

## 4. The proof

Keeper restarted through Task Scheduler at **16:03:53Z** (lineage
`node.exe(3112) ← cmd.exe(13780) ← svchost.exe(2380)` — Task Scheduler, not an
agent shell). It detected the walk silent for 232 minutes and relaunched.

```
16:03:55.497Z  WALK SILENT for 232 min — relaunch #1.
16:04:01.508Z  relaunch COMMAND  spawn C:/Program Files/Git/bin/bash.exe …/walk-launch.sh (cwd …, detached, no shell)
16:04:01.512Z  spawned walk pid 22184
16:04:23.152Z  relaunch VERIFIED — 4 walk process(es) live
```

**First `relaunch VERIFIED` this repository has ever recorded**, on the first
attempt after the change, following 22 consecutive failures.

Process existence is not the acceptance, so:

**New `stage-runner.log` lines, continuously:**

```
16:06:15.919Z  STAGE START …/tier-a-batch-00016.jsonl  rows 9992  headChars 4800
16:06:15.972Z  contract hash OK 2e7b53afe35fa81c
16:06:20.484Z  STAGE DONE {… "tableRows":1097864 …}
=== 16:06:20 worklist 8/864
```

The runner resumes by **re-running the coverage census**, never from a batch
number, so it re-walks batches that are already staged and skips them
(`skippedAlreadyStaged: 8864`, `inserted: 0`). That is the documented resume
contract, and it means the first minutes of a relaunch legitimately produce log
lines with **no** row delta.

**Row delta:** see §5 — recorded once the walk reached unstaged work.

## 5. Row delta — OBSERVED

| at | `count(*) FROM new1_doc_vector_stage` |
| --- | ---: |
| 16:04:01Z, the moment of relaunch | **1,097,864** |
| 16:24:28Z, after the census caught up | **1,098,028** |

**+164 rows**, and the walk is back on `lcc-00123` — *the exact batch it died
mid-way through at 12:12:04Z*:

```
=== 16:24:28 worklist 102/864
=== 16:24:28 START lcc-00123 tier-a-batch-00123.jsonl (attempt 1)
```

Twenty minutes of that interval were the census re-walking batches 1–101 and
skipping them, which is the resume contract working, not the walk idling. The
acceptance is met on both limbs: a new stage-runner line **and** a row delta.

### 5a. What the fix was actually worth: 655,099 vectors, unattended

The +164 above is the proof of the mechanism. It is not the value.

With the keeper working, **the walk ran for 20 hours 46 minutes with nobody
watching it**, from the verified relaunch at 23 Aug 16:04:01Z until the
workstation rebooted:

| at | `count(*) FROM new1_doc_vector_stage` |
| --- | ---: |
| 23 Aug 16:04:01Z — the relaunch | 1,097,864 |
| 23 Aug 16:24:28Z — mechanism proof | 1,098,028 |
| 24 Aug 12:50Z — the reboot | **1,753,127** |

**+655,099 staged vectors.** Under the old keeper that interval would have been
`relaunch DID NOT TAKE` roughly 250 times and an idle GPU, which is exactly what
the four hours before the fix looked like.

### 5b. A second occurrence, and a correction to my own first account

I first wrote that "the workstation was off overnight". **That was an inference
from a stale lock, and it is wrong.** `LastBootUpTime` says the box rebooted at
**24 Aug 12:50:36Z**, in the middle of the day — which is also the moment the
walk went silent, matching the keeper's own "WALK SILENT for 120 min" at
14:49:37Z. The box was up and working the whole night; it went down at midday.

The substance survives the correction, and is if anything better: the keeper
recovered a **cold, freshly rebooted** box with no agent present.

```
2026-08-24T14:48:02.806Z  stale lock from pid 3112 (not running) — taking it over
2026-08-24T14:48:27.342Z  RESTART #1 — sidecar unreachable
2026-08-24T14:48:52.121Z  spawned sidecar pid 20452
2026-08-24T14:49:37.143Z  WALK SILENT for 120 min — relaunch #1.
2026-08-24T14:49:58.667Z  relaunch VERIFIED — 7 walk process(es) live
2026-08-24T14:50:24     worklist 3/864 · START lcc-00012
```

Both halves in one episode — sidecar death **and** walk death — recovered
without intervention, ending in a running walk. This is the case the keeper
exists for and had never once handled.

One thing this does **not** explain and I am not going to pretend it does: the
reboot was at 12:50:36Z and the keeper's first line is at 14:48:02Z, **an
unexplained gap of one hour 58 minutes.** The Task Scheduler trigger fires every
five minutes, so either the box sat somewhere the task could not run, or the task
did not fire. That is a durability question worth its own look; it is not this
defect, and the keeper did the right thing the moment it ran.

### 5c. A third occurrence, on the pause release

Deleting the pause file at 16:28Z:

```
2026-08-24T16:28:47.704Z  WALK SILENT for 98 min — relaunch #2.
2026-08-24T16:29:45.355Z  WALK RELAUNCH issued (killed any survivors first)
2026-08-24T16:33:00.942Z  relaunch VERIFIED — 7 walk process(es) live
```

Process chain confirmed from the table, keeper to embedder:
`node sidecar-keeper.mjs (9696) → bash walk-launch.sh (12916) → bash
stage-runner.sh (28808) → … → node doc-vector-embed.mjs (24020)`, and
`stage-runner.log` advancing.

**Total: 22 consecutive failed relaunches before the change; 3 verified
progressing relaunches after it — one proving the mechanism, one recovering a
cold rebooted box unattended, one resuming from a deliberate pause — and 655,099
vectors staged in between with nobody watching.**

## 6. A second thing this closes: the walk can now be paused deliberately

Quieting the box for a decision-critical measurement used to mean killing the
walk and watching the keeper faithfully restart it five minutes later — the
keeper doing its job. A pause file now suspends walk relaunch:

```
.agents/logs/new1-walk.pause      # contents are the REASON, and are logged
```

It is a **file**, not an environment variable, because the keeper is started by
Task Scheduler and nobody can hand it an environment. It holds a reason because
an unexplained pause is how a walk stays down for a week. The keeper announces
the pause **once** rather than every poll.

Observed, at the first silence check after the file was written:

```
2026-08-24T15:10:31.792Z  walk relaunch PAUSED by …\.agents\logs\new1-walk.pause
  — NEW1, 23 Aug 2026 16:26Z — representation lab V3 needs the GPU sidecar to itself.
```

The reason travels with the pause into the log, so the next reader of that file
learns *why* the walk is down without asking anyone.

## 7. What this does NOT claim

- It does not claim the walk cannot die again. It claims that when it does, the
  keeper now brings it back and **says so falsifiably**.
- It does not claim the sidecar half was ever broken. It was not; it was proven
  healthy first, both this round and last.
- The `direct`/`keeper`/`keeper-attached` probe is **three observations**, not a
  study of Windows console semantics. The mechanism is stated as the best
  explanation consistent with all three; what is *proven* is that the caller,
  not the command, decides whether the walk starts.
