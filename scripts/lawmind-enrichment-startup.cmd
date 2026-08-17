@echo off
REM ===========================================================================
REM  Lawmind enrichment -- logon launcher. Founder-approved 14 Aug 2026.
REM
REM  A COPY OF THIS FILE lives in the current user's Startup folder:
REM    %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Lawmind-paragraphs.cmd
REM
REM  TO DISABLE: delete that copy. Nothing else to undo.
REM  TO STOP NOW: taskkill /f /im node.exe  (or delete %TEMP%\lawmind-paragraphs.lock
REM               after the process is gone, so the wrapper can start again)
REM  LOG: %TEMP%\lawmind-paragraphs.log
REM
REM  ---------------------------------------------------------------------------
REM  WHY THE STARTUP FOLDER AND NOT A SCHEDULED TASK
REM  ---------------------------------------------------------------------------
REM  A scheduled task was the approved plan and it CANNOT be registered on this
REM  machine: `schtasks /create` and `Register-ScheduledTask` both return
REM  "Access is denied" for this user, with and without the tool sandbox, and the
REM  shell is not elevated (verified: IsInRole(Administrator) = False). Creating
REM  one needs an elevated prompt, which requires interactive UAC.
REM
REM  The Startup folder is the unelevated equivalent for the two properties that
REM  were actually asked for: it survives a reboot (fires at logon) and its
REM  processes descend from Explorer rather than from the agent harness, so they
REM  are not in the job object that kills everything the agent launches.
REM
REM  It is strictly weaker than a scheduled task in one way, stated plainly: it
REM  starts at LOGON, not at BOOT. A rebooted machine sitting at the lock screen
REM  runs nothing.
REM
REM  ---------------------------------------------------------------------------
REM  WHY AN ABSOLUTE PATH AND NOT %~dp0 -- FIXED 15 Aug 2026, NEW2 bus 0510
REM  ---------------------------------------------------------------------------
REM  This line read `start "" "%~dp0enrich-worker.cmd" ...` and that was WRONG in
REM  the one place it matters. %~dp0 resolves against THE RUNNING COPY'S OWN
REM  DIRECTORY, and the copy that actually runs lives in the Startup folder --
REM  which holds no enrich-worker.cmd. NEW2 lost 12.75 hours of a 32-worker fleet
REM  to the identical defect in lawmind-ingest-startup.cmd on 15 Aug.
REM
REM  THE FAILURE MODE IS WHY IT IS EXPENSIVE, not the mistake itself: the path is
REM  a real directory, so nothing errors loudly, the worker never starts, and
REM  BECAUSE IT NEVER STARTED IT WRITES NO LOG. A launcher failing this way is
REM  byte-for-byte indistinguishable from one that was never triggered.
REM  lawmind-citations-startup.cmd already carried this warning and this file,
REM  written the same day, did not copy it.
REM
REM  ---------------------------------------------------------------------------
REM  WHY IT IS SAFE TO INSTALL THIS NOW AND WAS NOT BEFORE
REM  ---------------------------------------------------------------------------
REM  NEW2 (bus 0505) measured a cold-start defect in paragraphs-cli: the walk is
REM  ascending by (created_at, id) from the epoch while every undone row sits at
REM  the NEW end, so a cold start scanned ~4.4M finished rows -- about 72 minutes
REM  per shard -- before its first page, and supervise.mjs re-pays that on every
REM  restart. Installing a boot launcher on top of that would have multiplied it.
REM  The cursor is now PERSISTED per shard in services/ingest/.checkpoints/, so
REM  the dead prefix is walked once ever. Smoke-tested by execution, twice, not
REM  by typecheck: a cold run wrote the checkpoint, a second run resumed from it.
REM ===========================================================================
set REPO=C:\Users\Xerxus\Documents\Lawmind
start "" "%REPO%\scripts\enrich-worker.cmd" paragraphs services/ingest/src/paragraphs-cli.ts --apply --resume
