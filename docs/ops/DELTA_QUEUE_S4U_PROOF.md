# The GPU delta queue's principal — the exact proof, prepared and not performed

```text
OWNER   SHIP
DATE    19 September 2026 (SHIP S4-R0X, Stage A)
STATUS  PREPARED. Step 1 needs ONE elevated consent click and has NOT been run.
        docs/FOUNDER_QUEUE.md FQ-SHIP-R0X-1.
```

**Nothing in this document has been executed against the production task.** No
scheduled task was created, changed, enabled, disabled or deleted by SHIP.
`ONE_GPU_WRITER` is preserved by construction.

---

## 1 · What is actually wrong, measured

`Get-ScheduledTask`, this workstation, 19 September 2026:

| task | LogonType | recovers at boot? |
|---|---|---|
| **`Lawmind-new1-delta-queue`** | **Interactive** | **no — first interactive logon** |
| `new2-daily-delta` | S4U | yes |
| `Lawmind-alert-poll` | S4U | yes |
| `Lawmind-citations` | S4U | yes |
| `Lawmind-citation-keys` | S4U | yes |
| `Lawmind-paragraphs` | S4U | yes |

It is the **only** Lawmind task still on an Interactive principal. Its
`RegistrationInfo/Date` is `2026-08-29T09:44:31` — one day before the 30 August
sweep that moved every other task to S4U, which is why the sweep did not reach it.

The cost of exactly this shape is already on the record: a Windows Update reboot on
**30 Aug 2026 at 02:33 UTC** left the workers dead until **05:28 UTC**, 2 h 55 m,
producing **0 rows** in `new1_doc_vector_stage` across two whole UTC hours — roughly
**83,000 vectors** at the prevailing ~28,600/h. Postgres was up 14 seconds after
boot the entire time. Only the tasks were missing.

### The full current definition, for comparison against the fix

```xml
<Principal id="Author">
  <UserId>S-1-5-21-3159215633-513622556-1928348121-1001</UserId>
  <LogonType>InteractiveToken</LogonType>       <!-- the defect -->
</Principal>
<Settings>
  <DisallowStartIfOnBatteries>true</DisallowStartIfOnBatteries>   <!-- siblings: false -->
  <StopIfGoingOnBatteries>true</StopIfGoingOnBatteries>           <!-- siblings: false -->
  <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>    <!-- the ONE_GPU_WRITER guarantee -->
  <StartWhenAvailable>true</StartWhenAvailable>
</Settings>
<Triggers>
  <TimeTrigger><StartBoundary>2026-08-29T09:44:00</StartBoundary>
    <Repetition><Interval>PT15M</Interval></Repetition></TimeTrigger>
</Triggers>
<Actions Context="Author">
  <Exec><Command>…\.agents\jobs\new1-delta-queue.cmd</Command></Exec>
</Actions>
```

---

## 2 · Why this was NOT simply flipped, which is the substantive part

`docs/ops/JOB_TABLE.md` §"Startup, honestly" states the Interactive principal is
**deliberate**:

> CPU/database workers run as `S4U`; the GPU delta queue runs in the signed-in
> user's session **so CUDA is available**. … Running it before any user signs in
> would require a different GPU-capable service account/host; the current Windows
> task does not claim that guarantee.

**That text is uncommitted working-tree content**, and HEAD's copy of that file
predates the entire S4U fix, so its provenance could not be established from git
this session. It carries a date (14 Sep 2026) but no measurement.

It may be correct. And if it is correct, moving this task to S4U produces a job
that **fires on schedule, finds no CUDA, and embeds nothing** — which is strictly
worse than the current honest hole, because a task that runs and does nothing looks
alive. That is the failure class this repo has been bitten by repeatedly:
completion is not a success signal.

So the CUDA question is answered by measurement **before** the production task is
touched. `services/embed/gpu/server.py` already refuses to run on CPU when
`require_gpu` is set:

```text
services/embed/gpu/server.py:114   if require_gpu and "CUDAExecutionProvider" not in placed:
services/embed/gpu/server.py:116       "CUDAExecutionProvider did not take the graph — refusing to run on CPU."
```

— which is what makes a wrong answer here loud rather than silent, and it is also
why the probe below is enough: if the provider is absent in session 0, the sidecar
would refuse, not degrade.

One thing already points the right way and is not proof on its own:
`.agents/jobs/new1-delta-queue.cmd` already pins

```bat
set "SIDECAR_PYTHON=C:\Python314\python.exe"
```

with the comment that the bare `python` launcher "resolved to an environment that
never reached sidecar health after the 14 Sep reboot. Pin the CUDA-capable
installation whose onnxruntime exposes CUDAExecutionProvider on this host." So the
PATH class of failure — the one a non-interactive principal is most likely to hit —
is already handled. That raises the odds step 1 passes; it does not establish it.

---

## 3 · Why this session could not run step 1

```text
Register-ScheduledTask -LogonType S4U   →  "Access is denied."   (measured)
```

Registering an S4U principal requires elevation. `Xerxus` is a local Administrator
whose token is UAC-filtered, so this is a **consent click and never a credential** —
`JOB_TABLE.md`'s own FQ-LCC-R9-1 closure reached the same conclusion on 30 Aug. This
session cannot produce that click, and the `schtasks` path was unavailable to it as
well. It is therefore a founder action, it is one click, and it is the only thing
standing between here and an answer.

---

## 4 · Step 1 — the probe. Creates a throwaway task, touches nothing else

`scripts/ops/s4u-cuda-probe.cmd` is committed and is the thing to run. It records
`whoami`, the session list, onnxruntime's available providers and `nvidia-smi`. It
loads no model, starts no sidecar, opens no database connection and writes nothing
outside its own result file.

```powershell
# ELEVATED PowerShell, repo root.
$probe  = Join-Path (Get-Location) 'scripts\ops\s4u-cuda-probe.cmd'
$a      = New-ScheduledTaskAction -Execute $probe
$t      = New-ScheduledTaskTrigger -Once -At (Get-Date).AddYears(1)   # never fires on its own
$pr     = New-ScheduledTaskPrincipal -UserId "XC\Xerxus" -LogonType S4U -RunLevel Limited
Register-ScheduledTask -TaskName 'ZZ-ship-s4u-cuda-probe' -Action $a -Trigger $t -Principal $pr -Force
Start-ScheduledTask    -TaskName 'ZZ-ship-s4u-cuda-probe'
Start-Sleep -Seconds 25
Get-Content "$env:TEMP\lawmind-s4u-cuda-probe.txt"
Unregister-ScheduledTask -TaskName 'ZZ-ship-s4u-cuda-probe' -Confirm:$false
```

The trigger is a year out **on purpose**: the task only ever runs because
`Start-ScheduledTask` says so, so a forgotten probe cannot fire later.

### How to read the result

```text
providers CONTAINS 'CUDAExecutionProvider'   → step 2. The JOB_TABLE claim is
                                               refuted and the principal is simply
                                               stale. Correct JOB_TABLE.md too.
providers LACKS   'CUDAExecutionProvider'    → STOP. The JOB_TABLE claim is
                                               CONFIRMED. Leave the task
                                               Interactive. The fix is then a
                                               GPU-capable service account or host,
                                               which is a different and larger
                                               piece of work — record it, do not
                                               improvise it.
probe did not run at all                     → the task itself is the problem, not
                                               CUDA. Check the result file's
                                               absence against LastTaskResult.
```

Either answer closes a real question. **A guess closes nothing** and risks a queue
that looks healthy while producing zero vectors.

---

## 5 · Step 2 — only if step 1 passed. The principal, and nothing else

```powershell
# ELEVATED PowerShell.
$task = Get-ScheduledTask -TaskName 'Lawmind-new1-delta-queue'
$pr   = New-ScheduledTaskPrincipal -UserId "XC\Xerxus" -LogonType S4U -RunLevel Limited
Set-ScheduledTask -TaskName 'Lawmind-new1-delta-queue' -Principal $pr

# Match the five working siblings. This box is a desktop; both flags are false on
# every task that recovers correctly, and a UPS reporting as a battery would
# otherwise refuse the start.
$s = $task.Settings
$s.DisallowStartIfOnBatteries = $false
$s.StopIfGoingOnBatteries     = $false
Set-ScheduledTask -TaskName 'Lawmind-new1-delta-queue' -Settings $s
```

### What must NOT change, and why each one matters

```text
MultipleInstancesPolicy = IgnoreNew   LEAVE IT. This is the ONE_GPU_WRITER
                                      guarantee. Windows enforces it and it cannot
                                      be raced; a process-table probe can.
the single PT15M TimeTrigger          LEAVE IT. A repeating trigger fires without a
                                      session once the principal allows it, so S4U
                                      alone closes the gap.
no AtStartup trigger                  DO NOT ADD. It buys at most 15 minutes and
                                      risks mangling the repetition every writer
                                      depends on. JOB_TABLE.md's 30 Aug note left
                                      triggers alone for exactly this reason.
no logon launcher, no Startup shortcut DO NOT ADD. A logon launcher restarts the
                                      whole fleet and silently resets tuned
                                      parameters to their defaults.
no second task, no second writer       DO NOT ADD. Two writers on one GPU is the
                                      failure this section exists to prevent.
```

---

## 6 · Step 3 — the proof, which is not the same as the change

A principal that *should* work is not a principal that *did*.

```text
1. Check it fires at all, signed in:
     Start-ScheduledTask -TaskName 'Lawmind-new1-delta-queue'
     Get-ScheduledTaskInfo -TaskName 'Lawmind-new1-delta-queue'   # LastTaskResult 0
     tail .agents/logs/new1-delta-queue.task.log

2. RUNS WHILE SIGNED OUT — sign OUT fully, not lock. Wait for two PT15M fires
   (~35 min). Sign back in and confirm from the log timestamps and from a durable
   receipt that a pass ran while no session existed. A locked session is NOT this
   test: Interactive already survives a lock, which is why the defect hid.

3. SURVIVES A REBOOT — reboot, wait past one trigger, and confirm a fire BEFORE
   any interactive logon. Compare against Postgres's own start time, which is
   ~14 s after boot, so the window is unambiguous.

4. NO DUPLICATE WRITER — during step 2, confirm exactly one delta-queue node
   process and one sidecar. Note that an INTERACTIVE shell cannot read an S4U
   process's CommandLine (Win32_Process returns NULL for session-0 processes), so
   this check must be run ELEVATED or read from the artifacts. A process that
   "vanished" from an unelevated probe has not vanished.

5. DURABLE RECEIPT — the pass must leave evidence outside the log: row growth in
   the vector stage for the pass's window, not merely a log line saying it ran.
```

**Step 3 was not performed and is not partially performed.** Rebooting this
workstation would have killed the running fleet and the session's own long work,
and the reboot proof is meaningless until step 1 answers the CUDA question.

```text
DELTA_SCHEDULER_S4U        = NOT_DONE — needs one elevated consent click
CUDA_IN_SESSION_0          = UNKNOWN — untested, and it decides which fix is right
REBOOT_WITHOUT_LOGIN_PROOF = NOT_PERFORMED — deliberately, see above
ONE_GPU_WRITER             = PRESERVED — SHIP changed nothing
SECOND_WRITER_CREATED      = NO
DUPLICATE_TRIGGER_CREATED  = NO
```

---

## 7 · What is already visible without any of this

The gap is **not silent in the tooling**, which is worth knowing before anyone
treats it as an unmonitored risk. `scripts/job-health.mjs` derives recovery from
the live principal rather than from documentation:

```text
scripts/job-health.mjs:1544   boots: !/interactive/i.test(logonType || '')
scripts/job-health.mjs:1546   'LogonType Interactive — fires only after a human
                               logs in, NOT at boot'
scripts/job-health.mjs:1358   '— and its principal is Interactive, so a locked
                               machine fires it never'
scripts/job-health.mjs:2099   'UNATTENDED RECOVERY: N mechanism(s) start at BOOT,
                               M need an interactive LOGON.'
```

So `pnpm job:health` already names this task as LOGON-only every run, and it
self-corrects the moment the principal changes. **No new alarm was added here**, and
adding one would have duplicated a working guard. `job-health.mjs` also carries
another lane's uncommitted edits at the time of writing and was deliberately not
touched.

One trap when checking by hand: **enumerate by task path, not by name prefix.**
Nine tasks sit at `\` named `Lawmind-*`; `new2-daily-delta` sits at `\Lawmind\` and
is not. A `Get-ScheduledTask -TaskName "Lawmind*"` sweep misses it.
