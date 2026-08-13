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
set NAME=%~1
set LOG=%TEMP%\lawmind-%NAME%.log
set LOCK=%TEMP%\lawmind-%NAME%.lock
shift

REM Single instance. The task can fire at boot while a manual run is already
REM going, and two writers on the same rows is the collision NEW2 hit on Orissa.
if exist "%LOCK%" (
  echo [%DATE% %TIME%] %NAME% already running ^(lock present^); exiting >> "%LOG%"
  exit /b 0
)
echo %DATE% %TIME% > "%LOCK%"

set REPO=%~dp0..
cd /d "%REPO%"

:loop
echo [%DATE% %TIME%] starting %NAME% >> "%LOG%"
call npx tsx --env-file=.env %1 %2 %3 %4 %5 %6 %7 >> "%LOG%" 2>&1
echo [%DATE% %TIME%] %NAME% exited ^(%ERRORLEVEL%^), restarting in 30s >> "%LOG%"
REM A crash-loop must not spin the CPU or hammer the shared proxy. 30s keeps a
REM persistent failure obvious in the log rather than buried under retry noise.
timeout /t 30 /nobreak > nul
goto loop
