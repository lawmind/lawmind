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
REM  ---------------------------------------------------------------------------
REM  THIS TICK ALSO PUBLISHES THE CONTROL PLANE -- ADDED 5 Sep 2026
REM  ---------------------------------------------------------------------------
REM  `admin/metrics.ts` pages out of `ops_job_current`, a view over the rows
REM  `scripts/job-health.mjs --publish` writes. Until today NOTHING owned that
REM  cadence: the table was written only when an agent happened to type the
REM  command. MEASURED 5 Sep 2026 -- the newest published row was 274 HOURS old
REM  (25 Aug 09:40:26Z), and every one of these ten-minute ticks re-asserted an
REM  eleven-day-old reading in the present tense: `new1-doc-vector-embed FAILED`
REM  about a job producing 34,000 vectors an hour on a GPU pinned at 99%.
REM
REM  It lives HERE rather than in a task of its own for one mechanical reason:
REM  registering a new `LogonType=S4U` task requires elevation, and an
REM  `Interactive` one is the exact defect that left the whole fleet dead for
REM  2h55m on 30 Aug -- it does not run until somebody logs in. This task is
REM  ALREADY S4U and already fires at the right cadence, and one honest
REM  mechanism beats a second one that silently does nothing.
REM
REM  PUBLISH RUNS AFTER THE POLL, NOT BEFORE, AND THE ORDER IS THE POINT.
REM  Before would be tempting -- the pager would evaluate a plane seconds old --
REM  but it would put a database scan inside the pager's PT9M window, so one slow
REM  publish could starve the alert evaluation entirely. That trades a rare stale
REM  reading for a rare MISSING PAGE, which is the wrong direction. After, the
REM  worst case is that the pager reads a plane one tick (10 min) old, well
REM  inside the 2h `jobObservationAgeHours` watch bound.
REM
REM  `--with-output` is NOT optional here. Without it the SQL probes do not run,
REM  and a job whose process cannot be identified reads STALE_REGISTRATION
REM  instead of RUNNING_BY_PROGRESS. On this box that is the common case, not the
REM  edge: S4U tasks run in session 0 and Win32_Process returns an EMPTY
REM  CommandLine for them, so identity-by-signature can never fire for the fleet
REM  that matters most. The durable output count is the only evidence available.
REM  Measured cost: 5 seconds a tick.
REM
REM  Its exit code is recorded and deliberately NOT acted on. `job-health` is
REM  read-only with respect to every job, and a control plane that cannot publish
REM  must never take the pager down with it.
REM
REM  TO DISABLE:  Unregister-ScheduledTask -TaskName Lawmind-alert-poll -Confirm:$false
REM  LOG:         .agents/logs/lcc-alert-poll.log  (appended, one tick per run)
REM  RECEIPTS:    .agents/ops/alerts.jsonl        (one JSON line per delivery)
REM  PLANE:       .agents/logs/lcc-job-health.log + ops_job_observations
REM ===========================================================================
set REPO=C:\Users\Xerxus\Documents\Lawmind
cd /d "%REPO%"
echo [%DATE% %TIME%] tick >> "%REPO%\.agents\logs\lcc-alert-poll.log"
call npx tsx --env-file=.env services\api\src\ops\alert-poller-cli.ts >> "%REPO%\.agents\logs\lcc-alert-poll.log" 2>&1
echo [%DATE% %TIME%] exit %ERRORLEVEL% >> "%REPO%\.agents\logs\lcc-alert-poll.log"

echo [%DATE% %TIME%] plane >> "%REPO%\.agents\logs\lcc-job-health.log"
REM  Absolute node path, not `node`: an S4U task runs in session 0 with a PATH
REM  that is not this user's, and a wrapper that resolves its interpreter from
REM  PATH is a wrapper that works when you test it and not when it matters.
"C:\Program Files\nodejs\node.exe" scripts\job-health.mjs --quiet --with-output --publish >> "%REPO%\.agents\logs\lcc-job-health.log" 2>&1
echo [%DATE% %TIME%] plane exit %ERRORLEVEL% >> "%REPO%\.agents\logs\lcc-job-health.log"
