@echo off
REM ---------------------------------------------------------------------------
REM  Runs one resumable enrichment worker, forever, outside any agent session.
REM
REM  WHY THIS EXISTS
REM  ---------------------------------------------------------------------------
REM  Every long job LCC launched today died without an error and without an exit
REM  code: a concordance harvest at its first query, a classifier dry run at
REM  322,000 documents, a classifier write at 10,000, a paragraph pass at 18,219.
REM  Backgrounded from bash, started via PowerShell Start-Process, wrapped in
REM  nohup + disown -- all the same. The agent harness tears down the process
REM  tree of each tool invocation, so anything descended from one is killed when
REM  that call returns.
REM
REM  A scheduled task is not descended from the harness at all. It also survives
REM  a reboot, which nothing did: the machine was powered off on 13 Aug and the
REM  entire 24-worker ingest fleet stayed down for 7.3 hours because nothing
REM  restarts itself.
REM
REM  SAFETY
REM  ---------------------------------------------------------------------------
REM  Every worker invoked here must be RESUMABLE and IDEMPOTENT, because this
REM  loops forever and will re-run a pass the moment it finishes. `paragraphs`
REM  skips judgments that already have rows; `classify --resume` walks only
REM  `hc_class_method IS NULL`. Do not add a worker that is not safe to re-run.
REM
REM  Usage:  enrich-worker.cmd <name> <script.ts> [args...]
REM  Remove: schtasks /delete /tn "Lawmind-<name>" /f
REM ---------------------------------------------------------------------------
setlocal
set NAME=%~1
shift
set REPO=%~dp0..
cd /d "%REPO%"

:loop
echo [%DATE% %TIME%] starting %NAME% >> "%TEMP%\lawmind-%NAME%.log"
call npx tsx --env-file=.env %1 %2 %3 %4 %5 %6 %7 >> "%TEMP%\lawmind-%NAME%.log" 2>&1
echo [%DATE% %TIME%] %NAME% exited with %ERRORLEVEL%, restarting in 30s >> "%TEMP%\lawmind-%NAME%.log"
REM A crash-loop must not spin the CPU or hammer the proxy. 30s is long enough
REM that a persistent failure is obvious in the log rather than buried in noise.
timeout /t 30 /nobreak > nul
goto loop
