@echo off
REM ===========================================================================
REM  LAWMIND OPERATIONAL ALERT TICK -- LCC, 25 Aug 2026.
REM
REM  Registered as the scheduled task `Lawmind-alert-poll`, every 10 minutes.
REM
REM  WHY A SCHEDULED TASK AND NOT THE STARTUP FOLDER
REM  ---------------------------------------------------------------------------
REM  The repo records that `schtasks /create` and `Register-ScheduledTask` both
REM  returned "Access is denied" for this user, and the Startup folder was adopted
REM  as the unelevated substitute. THAT IS NO LONGER TRUE -- retested 25 Aug 2026
REM  by registering and immediately removing a probe task, which succeeded. The
REM  sidecar keeper is already a scheduled task registered by this same user.
REM
REM  It matters here specifically: the Startup folder fires at LOGON, so a rebooted
REM  machine sitting at the lock screen would run no alert poller at all -- and the
REM  one time you most want a pager is the time nobody has logged in.
REM
REM  WHAT IT DOES
REM  ---------------------------------------------------------------------------
REM  One tick: collect metrics, evaluate ALERT_RULES, deliver anything at `page`
REM  severity that is not inside its cooldown, and record the delivery. The
REM  transport is chosen by `notifierFrom`: Resend when RESEND_API_KEY and
REM  OPS_ALERT_EMAIL are both set, otherwise the durable file sink, which is
REM  honest about not being a human.
REM
REM  TO DISABLE:  Unregister-ScheduledTask -TaskName Lawmind-alert-poll -Confirm:$false
REM  LOG:         .agents/logs/lcc-alert-poll.log  (appended, one tick per run)
REM  RECEIPTS:    .agents/ops/alerts.jsonl        (one JSON line per delivery)
REM ===========================================================================
set REPO=C:\Users\Xerxus\Documents\Lawmind
cd /d "%REPO%"
echo [%DATE% %TIME%] tick >> "%REPO%\.agents\logs\lcc-alert-poll.log"
call npx tsx --env-file=.env services\api\src\ops\alert-poller-cli.ts >> "%REPO%\.agents\logs\lcc-alert-poll.log" 2>&1
echo [%DATE% %TIME%] exit %ERRORLEVEL% >> "%REPO%\.agents\logs\lcc-alert-poll.log"
