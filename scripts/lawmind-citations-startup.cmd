@echo off
REM ===========================================================================
REM  Lawmind CITATION EXTRACTION — logon launcher. LCC lane, 14 Aug 2026.
REM
REM  Sibling of lawmind-enrichment-startup.cmd (paragraphs). Same mechanism,
REM  different worker. Both go through scripts\enrich-worker.cmd, which holds
REM  the single-instance lock and the restart loop; read its header first.
REM
REM  A COPY OF THIS FILE BELONGS IN:
REM    %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Lawmind-citations.cmd
REM  Verify it is actually there before believing this survives a reboot —
REM  lawmind-enrichment-startup.cmd claimed its own copy was installed and, on
REM  14 Aug 2026, neither Startup folder contained it.
REM
REM  TO DISABLE: delete that copy.
REM  TO STOP NOW: kill the node process, then delete
REM               %TEMP%\lawmind-citations.lock so the wrapper can start again.
REM  LOG: %TEMP%\lawmind-citations.log
REM
REM  ---------------------------------------------------------------------------
REM  WHY THESE FLAGS
REM  ---------------------------------------------------------------------------
REM  --limit 20000   The wrapper restarts the CLI in a loop, and every start pays
REM                  ~65s to rebuild the citation-form index. At 20k judgments a
REM                  pass that fixed cost is ~6% rather than the ~75% it is at the
REM                  500 default. Larger is not free: the pending query top-N
REM                  sorts an anti-join over the whole corpus.
REM  --batch 25      Small batches keep each transaction short, which matters
REM                  while the ingest fleet holds long INSERT transactions on the
REM                  same rows.
REM  --concurrency 12 Measured 14 Aug: serial 2.9 judgments/s, concurrency 8
REM                  16.6 judgments/s. 12 in-flight batches means 13 connections
REM                  against a max_connections of 100 with ~35 already in use —
REM                  deliberately short of the headroom, because the ingest fleet
REM                  is the critical path and this lane is not.
REM
REM  RESUMABLE, which is what makes a forever-loop safe here: the CLI's queue is
REM  "judgments with no rows in judgment_citations", and a judgment that cites
REM  nothing gets a sentinel row, so nothing is ever re-read.
REM ===========================================================================
REM  ---------------------------------------------------------------------------
REM  WHY AN ABSOLUTE PATH AND NOT %~dp0
REM  ---------------------------------------------------------------------------
REM  Because the copy that matters does not live next to enrich-worker.cmd. In
REM  the Startup folder %~dp0 is the Start Menu directory, where there is no
REM  enrich-worker.cmd, so a %~dp0 reference works from the repo and silently
REM  does nothing from the only place it is ever actually run.
REM  lawmind-enrichment-startup.cmd still carries that form; it has never been
REM  installed, so it has never been able to fail visibly.
set REPO=C:\Users\Xerxus\Documents\Lawmind
start "" "%REPO%\scripts\enrich-worker.cmd" citations services/ingest/src/citations-cli.ts --limit 20000 --batch 25 --concurrency 12
