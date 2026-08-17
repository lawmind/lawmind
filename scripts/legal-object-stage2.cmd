@echo off
REM ===========================================================================
REM  Legal-object Stage 2 -- the four tasks the safety gate CLEARED, at 1,000.
REM
REM  RUN:  scripts\legal-object-stage2.cmd
REM  LOG:  %TEMP%\lawmind-legalobject.log   (shared with stage 1, appended)
REM
REM  ---------------------------------------------------------------------------
REM  WHICH TASKS, AND WHY case_structure IS NOT HERE
REM  ---------------------------------------------------------------------------
REM  Measured 15 Aug 2026, 100 documents each, all against the same verifier --
REM  docs/ai/ENRICHMENT_REJECTION_TRIAGE.md section 7:
REM
REM    topics          83.9%   fabrication 0.48%
REM    authorities     83.3%   fabrication 0.00%
REM    holding         81.5%   fabrication 0.13%
REM    arguments       78.4%   fabrication 0.00%
REM    case_structure  81.9%   fabrication 2.33%   <-- HELD AT 100
REM
REM  Verification rate is flat at 78-84% across all five and says almost nothing.
REM  FABRICATION varies by a factor of eighteen, and 30 of the programme's 35
REM  fabrications are in case_structure alone -- concentrated in `fact`, its most
REM  narrative field. Narrative reconstruction invites invention; locating a
REM  proposition the court already stated does not.
REM
REM  case_structure is held pending a narrower `fact` prompt and a re-measure at
REM  100. That is a TOKEN decision, not a safety one: all 35 fabrications were
REM  caught and dropped by the span check and none reached any table as fact.
REM
REM  ---------------------------------------------------------------------------
REM  SEQUENTIAL, AND THAT IS MEASURED NOT TIDINESS
REM  ---------------------------------------------------------------------------
REM  docs/ai/DEEPSEEK_DATA_MOAT.md section 1: three concurrent callers against the
REM  free InferX pool made the 429 rate measurably worse. One caller, always.
REM  At ~16 s/document and one grant this is roughly 18 hours for 4,000 documents;
REM  the lever is grants, not threads (FOUNDER_QUEUE FQ-IX2).
REM
REM  ---------------------------------------------------------------------------
REM  RESUMABLE, AND IT DOES NOT REDO STAGE 1
REM  ---------------------------------------------------------------------------
REM  enrich-cli caches on (judgment_id, task, prompt_version, input_hash) and its
REM  cohort query excludes documents already carrying status='ok' for the same
REM  task and prompt version -- so the 100 already done per task are skipped and
REM  --limit 1000 buys 1,000 NEW documents. A crash costs only what is left.
REM  Does NOT loop: the next gate is at 1,000 and a looping worker would walk
REM  through it unmeasured.
REM ===========================================================================
setlocal
set REPO=C:\Users\Xerxus\Documents\Lawmind
set LOG=%TEMP%\lawmind-legalobject.log
cd /d "%REPO%" || (echo CD-FAILED & exit /b 1)

REM Single instance by LIVE PROCESS, never by lock file -- a stale lock inverts
REM the guard into a permanent silent stop. enrich-worker.cmd's header, 15 Aug.
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*enrich-cli*' }) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo [%DATE% %TIME%] an enrich-cli worker is already live; exiting >> "%LOG%"
  exit /b 0
)

echo [%DATE% %TIME%] legal-object STAGE 2 starting -- 4 cleared tasks at 1,000 >> "%LOG%"
call npx tsx --env-file=.env services/ingest/src/enrich-cli.ts --task holding --limit 1000 >> "%LOG%" 2>&1
call npx tsx --env-file=.env services/ingest/src/enrich-cli.ts --task arguments --limit 1000 >> "%LOG%" 2>&1
call npx tsx --env-file=.env services/ingest/src/enrich-cli.ts --task authorities --limit 1000 >> "%LOG%" 2>&1
call npx tsx --env-file=.env services/ingest/src/enrich-cli.ts --task topics --limit 1000 >> "%LOG%" 2>&1
echo [%DATE% %TIME%] LEGAL-OBJECT-STAGE2 DONE >> "%LOG%"
