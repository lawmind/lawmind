@echo off
REM ===========================================================================
REM  Keeps ONE existing, resumable enrichment worker alive outside any agent
REM  session. Founder-approved 14 Aug 2026 for execution reliability only.
REM
REM  Usage:   enrich-worker.cmd <name> <script.ts> [args...]
REM  Disable: schtasks /change /tn "Lawmind-<name>" /disable
REM  Remove:  schtasks /delete /tn "Lawmind-<name>" /f
REM  Log:     %TEMP%\lawmind-<name>.log
REM  Lock:    %TEMP%\lawmind-<name>.lock   (delete only if a crash orphaned it)
REM
REM  ---------------------------------------------------------------------------
REM  WHY A SCHEDULED TASK AND NOT A LAUNCH TECHNIQUE
REM  ---------------------------------------------------------------------------
REM  Six attempts across five methods -- bash background, nohup+disown, a
REM  subshell-wrapped nohup+disown copied verbatim from NEW2's 19-hour-proven
REM  pattern, PowerShell Start-Process, and the repo's own supervise.mjs -- every
REM  one died the moment the agent tool call returned. NEW2's identical pattern
REM  survives in THEIR session on the SAME machine, so this is the harness
REM  attaching children to a job object with kill-on-close, not a technique
REM  problem. A scheduled task is not a descendant of the harness at all.
REM
REM  It also survives a reboot, which nothing did: the machine was powered off on
REM  13 Aug and the entire 24-worker fleet stayed down 7.3 hours.
REM
REM  ---------------------------------------------------------------------------
REM  SAFETY -- read before adding a worker here
REM  ---------------------------------------------------------------------------
REM  This loops forever, so every worker invoked MUST be resumable and MUST NOT
REM  redo completed work:
REM    paragraphs-cli --apply         skips judgments that already have rows
REM    hc-classify-cli --resume       walks only hc_class_method IS NULL
REM  A worker without that property would re-process the corpus every 30 seconds.
REM  Do NOT add one. This wrapper exists to keep an EXISTING worker alive, never
REM  to become a second enrichment implementation.
REM ===========================================================================
setlocal
REM  %~dp0 IS CAPTURED BEFORE THE SHIFT, AND THAT IS THE WHOLE POINT.
REM  `shift` renumbers %0 too, so after it %~dp0 is no longer this script -- cmd
REM  resolves it against the CURRENT DIRECTORY instead. The old code read
REM  `set REPO=%~dp0..` after the shift and landed on the repo's PARENT, so the
REM  worker started in C:\Users\Xerxus\Documents and died instantly with
REM  `node.exe: .env: not found`, restarting on that same error every 30s.
REM  Measured 14 Aug 2026 on the first run this wrapper ever actually did: it
REM  had never been launched before, so a bug on line 1 of its job had never
REM  had the chance to surface.
set REPO=%~dp0..
set NAME=%~1
set LOG=%TEMP%\lawmind-%NAME%.log
set LOCK=%TEMP%\lawmind-%NAME%.lock
shift

REM ---------------------------------------------------------------------------
REM  SINGLE INSTANCE, BY LIVE PROCESS AND NOT BY LOCK FILE
REM ---------------------------------------------------------------------------
REM  Two writers on the same rows is the collision NEW2 hit on Orissa, so the
REM  guard has to exist. It must NOT be a bare lock file.
REM
REM  Measured 15 Aug 2026: the citations worker died at 9,300/20,000 when its
REM  parent shell was torn down, taking the restart loop with it and leaving
REM  %TEMP%\lawmind-citations.lock behind. Every later start then read that file
REM  and politely declined -- "already running (lock present); exiting" -- while
REM  NOTHING was running. A stale lock does not degrade the guard, it INVERTS
REM  it: the single-instance check became a permanent stop, and it is silent,
REM  because declining to start looks exactly like starting was unnecessary.
REM
REM  So the question asked is the real one -- "is there a live node process
REM  running THIS script" -- rather than a proxy for it. A killed worker leaves
REM  no process, so the next logon simply starts. The lock file is still written
REM  for a human reading %TEMP%, but nothing branches on its existence.
REM ---------------------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*%~1*' }) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo [%DATE% %TIME%] %NAME% already running ^(live node process^); exiting >> "%LOG%"
  exit /b 0
)
echo %DATE% %TIME% > "%LOCK%"

REM ---------------------------------------------------------------------------
REM  WHO ACTUALLY GUARANTEES ONE OWNER PER JOB -- LCC, 27 Aug 2026
REM ---------------------------------------------------------------------------
REM  Not this file. The node check above closes the common case and it has a hole
REM  the width of the backoff: this loop spends 30 seconds to an HOUR with no node
REM  process at all, and a second wrapper starting inside that window sees nothing.
REM  MEASURED -- registering the three scheduled tasks on 27 Aug while three
REM  hand-started wrappers were already looping produced SIX wrapper shells and
REM  three concurrent `citations` workers on the same rows, which is the Orissa
REM  collision returning by a different door.
REM
REM  The guarantee is the SCHEDULED TASK's `MultipleInstances = IgnoreNew`, which
REM  is enforced by Windows and cannot be raced. Each worker has exactly one task
REM  (`Lawmind-citation-keys`, `Lawmind-citations`, `Lawmind-paragraphs`), the task
REM  is the owner, and the 15-minute trigger is what restarts a wrapper that died.
REM
REM  I TRIED to elect a leader here instead, with the wrapper's own PID in the lock
REM  file, and removed it: `for /f` runs its command inside a transient `cmd /c`,
REM  so the ancestor walk kept landing on that throwaway shell -- whose command
REM  line contains the literal text `enrich-worker.cmd` because the SEARCH PATTERN
REM  is part of it. A probe that matches itself. The lock recorded a PID that was
REM  already dead, which is a guard that never guards, and a second mechanism that
REM  silently does nothing is worse than one honest one.
REM
REM  So: DO NOT hand-start this wrapper while its task exists. `Start-ScheduledTask
REM  -TaskName Lawmind-<name>` is the only supported way in.
REM ---------------------------------------------------------------------------

cd /d "%REPO%"

REM ---------------------------------------------------------------------------
REM  THE FLEET-WIDE PAUSE SWITCH, WHICH THIS WRAPPER WAS SILENTLY IGNORING
REM ---------------------------------------------------------------------------
REM  NEW2's fleet pause (bus 0550) works by writing
REM  services/ingest/.checkpoints/STOP, and scripts/supervise.mjs checks it at
REM  the top of its restart loop -- so it guards the FIRST start as well as
REM  every restart. NEW2 described it as fleet-wide, "LCC's paragraph and
REM  citation ones included", and that was true of everything supervise.mjs
REM  runs.
REM
REM  IT WAS NOT TRUE OF THIS FILE. enrich-worker.cmd has its own :loop and never
REM  goes through supervise.mjs, so paragraphs and citations opted out of the
REM  pause without anyone deciding they should.
REM
REM  FOUND 16 Aug 2026, DURING the Railway->local migration, which is what makes
REM  it worth more than a tidy-up. Three launchers now sit in the Startup folder
REM  (Lawmind-ingest, Lawmind-citations, Lawmind-paragraphs). A reboot and logon
REM  during the write freeze would have started these two writing to Railway
REM  again -- breaking a freeze that had already been broken once and verified
REM  fixed, and breaking it in the way that is hardest to catch, because the
REM  verification had already passed.
REM
REM  Checked in BOTH places on purpose: once before the first start, because a
REM  boot launcher only ever does a first start; and once per iteration, so a
REM  pause written while a worker is running takes effect at the next restart
REM  instead of being ignored until someone kills the process.
REM ---------------------------------------------------------------------------
if exist "%REPO%\services\ingest\.checkpoints\STOP" (
  echo [%DATE% %TIME%] %NAME% PAUSED by services/ingest/.checkpoints/STOP -- not starting >> "%LOG%"
  exit /b 0
)

set WAIT=30
:loop
if exist "%REPO%\services\ingest\.checkpoints\STOP" (
  echo [%DATE% %TIME%] %NAME% PAUSED by services/ingest/.checkpoints/STOP -- not restarting >> "%LOG%"
  exit /b 0
)
echo [%DATE% %TIME%] starting %NAME% >> "%LOG%"
call npx tsx --env-file=.env %1 %2 %3 %4 %5 %6 %7 >> "%LOG%" 2>&1
set WORKER_RC=%ERRORLEVEL%
REM The resolver's adjudicated replay vouches for one exact citation-key
REM frontier.  Advancing the frontier without refreshing the replay makes the
REM resolver fail closed until a human happens to run NEW2's script.  Keep the
REM two steps in one cycle: only a successful key walk may publish a replay,
REM and a replay failure is visible as the cycle's failure rather than hidden.
if /I "%NAME%"=="citation-keys" if "%WORKER_RC%"=="0" (
  call npx tsx --env-file=.env scripts/n2-resolver-risk-replay.mts --write >> "%LOG%" 2>&1
  call set WORKER_RC=%%ERRORLEVEL%%
)
echo [%DATE% %TIME%] %NAME% exited ^(%WORKER_RC%^), restarting in %WAIT%s >> "%LOG%"
REM A crash-loop must not spin the CPU or hammer the shared proxy. 30s keeps a
REM persistent failure obvious in the log rather than buried under retry noise.
timeout /t %WAIT% /nobreak > nul
REM  ---------------------------------------------------------------------------
REM  BACK OFF WHEN THERE IS NOTHING TO DO -- LCC, 25 Aug 2026
REM  ---------------------------------------------------------------------------
REM  A flat 30s restart is right while there is a backlog and wrong the moment
REM  there is not. The citations frontier closed and this loop kept running:
REM  every cycle rebuilt a 1,203,378-form resolution index, printed "judgments
REM  needing extraction: 0", exited 0 and restarted 30 seconds later -- roughly
REM  every 3.5 minutes, for days, against the same PostgreSQL every other lane
REM  was measuring on. The log reached 56.5 MB saying nothing, and a direct
REM  count confirmed the frontier: 0 judgments pending extraction.
REM
REM  It looked healthy by every signal anyone was using -- the process existed,
REM  the log grew, the launcher "fired". That is the exact shape
REM  scripts/job-health.mjs now refuses to accept as progress.
REM
REM  So the wait doubles each cycle, 30s -> 1h. A finished frontier costs one
REM  poll an hour instead of seventeen, and a REOPENED one is still picked up
REM  within the hour without anyone re-enabling anything -- which is why this is
REM  a backoff and not a refusal to start.
set /a WAIT=%WAIT%*2
if %WAIT% GTR 3600 set WAIT=3600
goto loop
