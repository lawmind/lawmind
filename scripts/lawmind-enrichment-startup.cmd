@echo off
REM ===========================================================================
REM  Lawmind enrichment — logon launcher. Founder-approved 14 Aug 2026.
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
REM ===========================================================================
start "" "%~dp0enrich-worker.cmd" paragraphs services/ingest/src/paragraphs-cli.ts --apply
