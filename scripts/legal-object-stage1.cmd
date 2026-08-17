@echo off
REM ===========================================================================
REM  Legal-object Stage 1 -- finish the two tasks that have never been measured.
REM
REM  RUN:  scripts\legal-object-stage1.cmd
REM  LOG:  %TEMP%\lawmind-legalobject.log
REM
REM  ---------------------------------------------------------------------------
REM  WHY THIS DOES NOT LOOP, UNLIKE enrich-worker.cmd
REM  ---------------------------------------------------------------------------
REM  enrich-worker.cmd restarts its worker forever, which is right for a pass
REM  that should keep consuming a population. It is WRONG here. `authorities` and
REM  `topics` have never been triaged, and the founder's directive is explicit:
REM  scale 100 -> 1,000 -> 10,000 only after a task passes a safety gate. A
REM  looping worker would walk past that gate at ~225 documents/hour while nobody
REM  was measuring. So this runs each task ONCE at 100 documents and exits.
REM
REM  ---------------------------------------------------------------------------
REM  ONE CALLER AT A TIME, AND THAT IS MEASURED NOT ASSUMED
REM  ---------------------------------------------------------------------------
REM  docs/ai/DEEPSEEK_DATA_MOAT.md section 1: three simultaneous callers against
REM  the free InferX pool made the 429 rate measurably worse. The tasks below run
REM  SEQUENTIALLY for that reason, not for tidiness.
REM
REM  ---------------------------------------------------------------------------
REM  RESUMABLE BY CONSTRUCTION -- nothing here redoes finished work
REM  ---------------------------------------------------------------------------
REM  enrich-cli caches on (judgment_id, task, prompt_version, input_hash) and its
REM  cohort query excludes any document already carrying status='ok' for the same
REM  task and prompt version. A re-run after a crash costs only what is left.
REM  `authorities` stopped at 66/100 when its parent session exited on 15 Aug;
REM  those 66 are in the database and this pass picks up from there.
REM ===========================================================================
setlocal
set REPO=C:\Users\Xerxus\Documents\Lawmind
set LOG=%TEMP%\lawmind-legalobject.log
cd /d "%REPO%" || (echo CD-FAILED & exit /b 1)

REM Single instance by LIVE PROCESS, never by lock file -- a stale lock inverts
REM the guard into a permanent stop, silently. enrich-worker.cmd's header, 15 Aug.
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*enrich-cli*' }) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo [%DATE% %TIME%] an enrich-cli worker is already live; exiting >> "%LOG%"
  exit /b 0
)

echo [%DATE% %TIME%] legal-object stage 1 starting >> "%LOG%"
call npx tsx --env-file=.env services/ingest/src/enrich-cli.ts --task authorities --limit 100 >> "%LOG%" 2>&1
call npx tsx --env-file=.env services/ingest/src/enrich-cli.ts --task topics --limit 100 >> "%LOG%" 2>&1
echo [%DATE% %TIME%] LEGAL-OBJECT-STAGE1 DONE >> "%LOG%"
