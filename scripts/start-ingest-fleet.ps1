<#
  Lawmind INGEST FLEET — the fleet definition and the only thing that launches it.
  NEW2, 15 Aug 2026.

  Invoked by scripts\lawmind-ingest-startup.cmd (which the Startup folder runs at
  logon) and safe to run by hand at any time — see the duplicate guard below.

  ---------------------------------------------------------------------------
  WHY THIS IS POWERSHELL AND NOT `start "" /b node` IN THE .cmd
  ---------------------------------------------------------------------------
  Because `start /b` killed the entire fleet 95 seconds after boot, twice
  measured on 15 Aug 2026.

  `start "" /b` runs the child IN THE LAUNCHER'S OWN CONSOLE. All 38 workers
  therefore shared one console — the one belonging to the cmd.exe that the
  Startup folder ran. When that console went away, Windows delivered
  CTRL_CLOSE_EVENT to every process attached to it and they all died together.
  The evidence is unambiguous and worth recording so nobody reintroduces it:

    exit code 3221225786 == 0xC000013A == STATUS_CONTROL_C_EXIT
    every hc-boot-*.log ends with: ^CTerminate batch job (Y/N)?
    all 38 at the same instant, 14:57:47Z, 95s after launch

  That `Terminate batch job (Y/N)?` prompt with nobody to answer it is the
  signature of this failure. It is a DIFFERENT defect from the `%~dp0` one fixed
  earlier the same day, and it was hidden behind it: the launcher had never got
  far enough to start a worker before, so the console problem had never shown.

  `Start-Process` (without -NoNewWindow) gives each worker ITS OWN console,
  hidden. Closing the launcher's console cannot reach them. This is the same
  mechanism LANE_PROTOCOL.md §3b already documents for long jobs, and the same
  one that kept the 17:25 fleet alive across agent turns until the reboot.

  ---------------------------------------------------------------------------
  PARAGRAPH SHARDS ARE NOT HERE, AND THE REASON CHANGED
  ---------------------------------------------------------------------------
  They were held back because paragraphs-cli.ts re-scanned ~4.4M done rows on
  every cold start (bus 505). LCC has since shipped cursor persistence
  (.checkpoints/paragraphs-<shard>_<count>.json) AND their own logon launcher,
  Lawmind-paragraphs.cmd. So the defect is fixed and the worker is running — and
  adding it here now would DUPLICATE LCC's, which is the trap this file's
  duplicate guard exists to prevent. Paragraph evidence is LCC's lane
  (RING_PROGRAM.md §3). Leave it theirs.
  ---------------------------------------------------------------------------
  -Only — LAUNCH A RUNG, NOT THE WHOLE FLEET
  ---------------------------------------------------------------------------
  The local scale-up is 3 canaries -> 8 -> 16 -> 24/32/38, measuring at each
  rung. That is not executable against an all-or-nothing launcher, so -Only
  takes a comma-separated list of scope names and starts ONLY those. Everything
  else — the duplicate guard, the RESULTS rotation, the STOP check inside
  supervise.mjs, the per-worker console — is unchanged, which is the point:
  duplicating this file to get a smaller fleet is how the two copies drift.

  WITHOUT -Only THE BEHAVIOUR IS EXACTLY AS BEFORE, so the Startup path is
  untouched.

    node scripts\migration\new2-rung-plan.mjs --workers 8    # prints the list
    powershell -File scripts\start-ingest-fleet.ps1 -Only "a,b,c"

  38 IS HISTORY, NOT A TARGET. It was reached against Railway's shared TCP
  proxy, where the bottleneck was network round-trips. Locally it is NVMe and
  Postgres. scripts\migration\new2-scale-decision.mjs decides each step.

  ---------------------------------------------------------------------------
  THE YEAR-SCOPED BLOCK IS GENERATED NOW. IT USED TO BE SEVEN TYPED NAMES.
  ---------------------------------------------------------------------------
  Until 17 Aug 2026 this file carried a hand-written rescue list: six courts
  got a `y2023` worker and exactly one got a `y2024` one — Manipur, 18,745
  documents — while Allahabad, Bombay and Telangana, the three largest holdings
  in the corpus, held ZERO 2024 documents against 264,889 / 277,355 / 38,931 at
  source. Nothing recomputed that list. The hole was found by a person reading a
  year histogram three days after it opened.

  The defect was never the seven missing names; it was that a name had to be
  typed. Every year rollover re-creates this hole for whichever courts the
  newest-first descent has not reached, and a typed list cannot roll over.

  So the block below reads `docs\ops\migration\new2-yearscope-plan.json`, which
  derives each scope from `source_count - held_count` per court-year. Regenerate
  it whenever the held snapshot moves:

    node scripts\migration\new2-yearscope-plan.mjs

  ONLY THE BACKLOG TIERS (0,1,2) ARE STARTED AT BOOT, and that bound is
  deliberate. Backlog years are served by NOTHING — no band worker covers them
  and the unscoped descent is still above them. The `mid`/`hist`/`recent` scopes
  the same plan ranks are a SCALE decision, not a boot decision: those courts do
  have a worker whose range includes them, so adding twenty more processes at
  logon would move the rung ladder by accident. The plan prints them; `-Only`
  launches them when a rung says so. `-PlanTiers` widens this without editing
  the file.

  A MISSING PLAN FILE STARTS NOTHING FROM THIS BLOCK AND SAYS SO LOUDLY. It does
  not fall back to a remembered list — a stale hard-coded list is the exact
  failure being removed, and a silent zero here is indistinguishable from
  "nothing to do".
#>
param(
  [string]$Only = '',
  [string]$PlanTiers = '0,1,2',
  <#
    -DryRun prints the exact argv of every worker and starts NOTHING.

    Added the same day the year-scoped block became generated, because until
    then there was no way to see what this file would run without running it —
    and the arg list is now built from a JSON plan rather than typed in place,
    so "what would actually launch" stopped being answerable by reading the
    source. A generated launcher without a dry run is a launcher nobody can
    review. It is also the only way to exercise this file during a freeze.
  #>
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Xerxus\Documents\Lawmind'
$node = (Get-Command node).Source

$onlyList = @()
if ($Only) {
  $onlyList = @($Only -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

if (-not (Test-Path (Join-Path $repo 'scripts\supervise.mjs'))) {
  Write-Error "supervise.mjs not found under $repo — refusing to launch rather than starting nothing silently."
  exit 1
}

<#
  THIS SCRIPT OWNS ITS OWN LOG. THE .cmd MUST NOT REDIRECT INTO ONE.

  Measured 15 Aug 2026, and it is the reason the duplicate guard below had never
  once been exercised in its life.

  The .cmd used to end with `>> "%TEMP%\lawmind-ingest-boot.log" 2>&1`. A cmd.exe
  redirect creates an INHERITABLE file handle — that is precisely how cmd hands
  stdout to the things it launches — so every process in the chain inherits it:
  powershell, and then all 38 workers Start-Process spawns. The workers hold that
  handle for their entire lifetime, which is meant to be weeks.

  So while a fleet is up, the log is exclusively locked BY THE FLEET ITSELF, and
  the next invocation of the launcher dies at the redirect with

    The process cannot access the file because it is being used by another process

  and exit code 1, having launched nothing. Not a line of this script runs. The
  "safe to run by hand at any time" promise in the header was false, the per-scope
  duplicate guard was unreachable, and a scope whose supervisor had exited could
  not be recovered without killing all of node.exe first. Four scopes were sitting
  dead in exactly that state when this was found.

  It does NOT bite at boot, because nothing is holding the file then — which is
  why two reboots' worth of evidence never showed it.

  Add-Content opens, appends and CLOSES per call, so no long-lived handle exists
  for anything to inherit. Logging belongs here rather than in the .cmd for the
  same reason the prose does: this file has no cmd parser hazards.

  Until every worker started by the OLD .cmd has been restarted, the canonical
  log is still locked by those workers. That must never again stop the launcher,
  so a lock falls back to a pid-suffixed file rather than being swallowed: the
  run stays on the record either way, which is the whole point of a boot log.
#>
$script:logPath = Join-Path $env:TEMP 'lawmind-ingest-boot.log'
function Log {
  param([string]$Message = '')
  Write-Host $Message
  try {
    Add-Content -LiteralPath $script:logPath -Value $Message -Encoding utf8
  } catch {
    $script:logPath = Join-Path $env:TEMP "lawmind-ingest-boot-$PID.log"
    try { Add-Content -LiteralPath $script:logPath -Value $Message -Encoding utf8 } catch { }
  }
}
Log ''
Log "=== launcher run $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (boot uptime $([int]((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalMinutes) min) ==="

<#
  THE DUPLICATE GUARD.

  NEW2's own rule in LANE_PROTOCOL.md §3b: never declare a restart finished until
  you have counted the survivors. An Orissa relaunch once ran twice because an
  earlier attempt had not been confirmed dead. This launcher can fire at logon
  while a hand-started fleet is already up, so it checks per scope rather than
  trusting that the fleet is down.

  Matched on the scope NAME, which is the first argument to supervise.mjs and is
  unique per court+window by construction.
#>
$live = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*supervise.mjs*' } |
  ForEach-Object { if ($_.CommandLine -match 'supervise\.mjs\s+(\S+)') { $matches[1] } })

$started = 0
$skipped = 0
$filtered = 0
$startedNames = [System.Collections.Generic.HashSet[string]]::new()
if ($onlyList.Count -gt 0) { Log "RUNG    -Only given: $($onlyList.Count) scope(s) requested" }

function Start-Worker {
  param([string]$Name, [string[]]$WorkerArgs)
  <#
    The rung filter. Checked BEFORE the duplicate guard so a filtered-out scope
    is reported as filtered rather than as already-running — two different facts
    that would otherwise read identically in the boot log.
  #>
  if ($script:onlyList.Count -gt 0 -and $script:onlyList -notcontains $Name) {
    $script:filtered++
    return
  }
  if ($script:live -contains $Name) {
    Log "SKIP    $Name (already running)"
    $script:skipped++
    return
  }
  <#
    THE SECOND DUPLICATE GUARD, AND IT IS NOT THE SAME ONE.

    `$live` is a CIM snapshot taken once, before anything is launched, so it can
    only ever see workers from a PREVIOUS run. Since the year-scoped block became
    generated, two sources can name the same scope in a single invocation — the
    plan and a standing loop — and `$live` is blind to a process this run started
    ninety milliseconds ago. Two supervisors on one scope share
    `<court>-y<year>.json`, and `saveCheckpoint` rewrites the WHOLE file, so each
    would silently erase the other's progress on every write.
  #>
  if ($script:startedNames.Contains($Name)) {
    Log "SKIP    $Name (already started by this run)"
    $script:skipped++
    return
  }

  <#
    -DryRun RETURNS HERE, BEFORE THE ROTATE, NOT AFTER IT.

    The rotate below MOVES a file. A dry run that renamed logs would not be a
    dry run, and the first version of this switch did exactly that — it returned
    after the rotate because that is where Start-Process is. A preview with a
    side effect is worse than no preview.
  #>
  $argv = @('scripts\supervise.mjs', $Name, '--') + $WorkerArgs
  if ($script:DryRun) {
    Log "WOULD   $Name  ::  node $($argv -join ' ')"
    [void]$script:startedNames.Add($Name)
    $script:started++
    return
  }

  <#
    ROTATE A LOG THAT ALREADY CARRIES A `RESULTS` BLOCK.

    supervise.mjs decides a run finished by matching /^RESULTS/m against the
    TAIL OF THE LOG, and it checks that BEFORE the first launch. The log
    persists across runs, so a scope that completed once could never be started
    again — it exited instantly with "worker finished cleanly - not restarting"
    and wrote nothing.

    Caught on hc-boot-mid-9_13 (Allahabad 2016-2022, the largest gap in the
    corpus): it had printed RESULTS after abandoning six unreadable batches, and
    every subsequent launch was a no-op.

    Rotating here is correct rather than a workaround, because "completed" is
    only true for a moment: the AWS bucket updates DAILY, so a court that
    exhausted its window yesterday has new documents today. The supervisor's
    rule is about not looping WITHIN a run; a new boot is a new run. One
    generation is kept, so the completed run's tally is still readable.
  #>
  <#
    READ THE LAST FEW KILOBYTES, NOT THE LAST FORTY LINES.

    This was `Get-Content $log -Tail 40`, and on 18 Aug it silently cost the
    fleet half its width. A `-Only` list of 19 scopes started **9** and then
    stopped: no error, no message, the launcher simply never came back. Two more
    invocations did the same and seven orphaned `powershell.exe` processes were
    left behind holding the same spot.

    It hangs rather than fails. These logs reach 29 MB and carry raw
    PDF-extractor bytes — NUL and other binary, which `grep` reports as "Binary
    file … matches" — and Windows PowerShell 5.1's `Get-Content -Tail` against
    that does not behave like a bounded read. A single scope did not return in
    120 seconds. The scope it stopped on, `hc-boot-19_16-y2023`, simply has the
    largest log in the repo.

    A `FileStream` seek reads a fixed 64 KB from the end regardless of how large
    the file is or what is in it. `RESULTS` is written near the end of a
    completed run, so 64 KB is generous for the question being asked — and the
    question is only ever "did this log end with a RESULTS block".

    Latin-1 decoding on purpose: these bytes are not valid UTF-8 and decoding is
    not the point. `RESULTS` is ASCII, and every byte maps to a character
    without throwing, which UTF-8 decoding of binary does not guarantee.

    VIA `GetEncoding(28591)`, NOT `[Text.Encoding]::Latin1`. The static property
    is .NET 5+; Windows PowerShell 5.1 is .NET Framework, where it does not
    exist. The first version used it, every open threw, and the catch below
    dutifully logged `WARN … unreadable` for ten scopes in a row — harmless only
    because the fallback starts the worker anyway. **This is the third time today
    a .NET Core API has been assumed on a 5.1 host** (`ProcessStartInfo.ArgumentList`
    in `start-local-canary.ps1` was the first, and it was fatal). Codepage 28591
    is ISO-8859-1 and has been there since .NET Framework 1.
  #>
  $log = Join-Path $script:repo "$Name.log"
  if (Test-Path $log) {
    $tail = ''
    try {
      $fs = [System.IO.File]::Open($log, 'Open', 'Read', 'ReadWrite')
      try {
        $want = [Math]::Min(65536, $fs.Length)
        [void]$fs.Seek(-$want, 'End')
        $buf = New-Object byte[] $want
        [void]$fs.Read($buf, 0, $want)
        $tail = [System.Text.Encoding]::GetEncoding(28591).GetString($buf)
      } finally {
        $fs.Dispose()
      }
    } catch {
      <#
        A log we cannot read is not a reason to skip a worker. The rotation is an
        optimisation against supervise.mjs's RESULTS sentinel; failing to rotate
        costs at most one scope that exits early and gets picked up next run.
        Failing to START is what this whole block just cost us.
      #>
      Log "WARN    $Name.log unreadable for the RESULTS check — starting anyway"
    }
    if ($tail -match '(?m)^RESULTS') {
      Move-Item $log (Join-Path $script:repo "$Name.prev.log") -Force
      Log "ROTATE  $Name.log (carried a completed RESULTS block)"
    }
  }
  Start-Process -FilePath $script:node `
    -ArgumentList $argv `
    -WorkingDirectory $script:repo `
    -RedirectStandardOutput (Join-Path $script:repo "$Name.super.log") `
    -RedirectStandardError  (Join-Path $script:repo "$Name.super.err") `
    -WindowStyle Hidden
  Log "START   $Name"
  [void]$script:startedNames.Add($Name)
  $script:started++
}

function HcArgs {
  param([string]$Court, [string]$FromYear, [string]$ToYear, [string]$Year, [string]$Concurrency)
  $a = @('--env-file=../../.env', 'src/harvest/hc-load-cli.ts')
  if ($Court)       { $a += @('--court', $Court) }
  if ($Year)        { $a += @('--year', $Year) }
  if ($FromYear)    { $a += @('--from-year', $FromYear) }
  if ($ToYear)      { $a += @('--to-year', $ToYear) }
  $a += @('--batch', '200', '--concurrency', $Concurrency, '--apply')
  return $a
}

# -- 18 courts still short of their 2016+ window -----------------------------
#    ABSENT ON PURPOSE, at >=99.99% of that window: 1_12 J&K · 11_24 Sikkim ·
#    14_25 Manipur · 16_20 Tripura · 17_21 Meghalaya · 2_5 HP · 5_15 Uttarakhand.
#    A missing worker here means COMPLETED, not forgotten.
foreach ($c in @('9_13','27_1','3_22','10_8','33_10','8_9','36_29','32_4','29_3',
                 '21_11','23_23','22_18','20_7','24_17','19_16','7_26','28_2','18_6')) {
  Start-Worker "hc-boot-$c" (HcArgs -Court $c -FromYear '2016' -Concurrency '32')
}

# -- year-scoped backlog, GENERATED from source_count - held_count -----------
#    See the header. Seven typed names became a plan derived per court-year, so
#    a year rollover cannot open a hole nobody notices. The six hand-started
#    y2023 scopes (bus 0371) that only survived in a shell history are covered
#    by this too: the plan finds them from their stored progress and their
#    remaining count, not from anyone's memory.
$planPath = Join-Path $repo 'docs\ops\migration\new2-yearscope-plan.json'
$planTierList = @($PlanTiers -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' } | ForEach-Object { [int]$_ })
if (-not (Test-Path $planPath)) {
  Log "PLAN    MISSING $planPath — starting NO year-scoped workers."
  Log "PLAN    regenerate with: node scripts\migration\new2-yearscope-plan.mjs"
  Log "PLAN    (there is deliberately no fallback list — a stale typed list is the defect this replaced)"
} else {
  <#
    -Raw matters: without it Get-Content hands ConvertFrom-Json an array of
    lines, which parses but is slower and has bitten this repo before on large
    files. -Depth is not a parameter of ConvertFrom-Json on 5.1, so the plan is
    kept shallow on purpose — workers[] is a flat array of scalars.
  #>
  $plan = Get-Content -LiteralPath $planPath -Raw | ConvertFrom-Json
  $planWorkers = @($plan.workers | Where-Object { $planTierList -contains [int]$_.tier })
  Log "PLAN    $planPath ($($plan.takenAt)) — $($planWorkers.Count) worker(s) in tier(s) $PlanTiers of $($plan.workers.Count) planned"

  <#
    TWO FILTERS COMPOSE HERE, AND ONE OF THEM IS INVISIBLE.

    `-Only` selects by name; `-PlanTiers` selects by tier BEFORE it. So
    `-Only "hc-boot-mid-21_11"` on its own starts NOTHING — that scope is tier 3
    and the default tiers are 0,1,2 — and the run reports `started 0` with no
    hint that a real, ranked, 441,673-document scope was silently excluded by a
    parameter the caller never passed.

    That is precisely the shortfall `new2-rung-plan.mjs` refuses to allow: a rung
    that quietly runs short attributes its throughput to a worker count that
    never existed, and every comparison after it is corrupt. So a requested name
    that IS in the plan but OUTSIDE the tier filter is called out by name, with
    the flag that would include it.
  #>
  if ($onlyList.Count -gt 0) {
    foreach ($w in $plan.workers) {
      if (($onlyList -contains $w.scope) -and ($planTierList -notcontains [int]$w.tier)) {
        Log "PLAN    EXCLUDED $($w.scope) — you asked for it by name but it is tier $($w.tier) and -PlanTiers is '$PlanTiers'. Add it: -PlanTiers '$PlanTiers,$($w.tier)'"
      }
    }
  }
  foreach ($w in $planWorkers) {
    <#
      Args are rebuilt through HcArgs rather than taken as a string from the
      plan. The checkpoint path is a function of --court/--year/--to-year, so a
      plan that could hand this script a raw argv could silently orphan stored
      progress by spelling a flag differently. The plan supplies FACTS; this
      file still owns how a worker is invoked.
    #>
    Start-Worker $w.scope (HcArgs -Court $w.court `
      -Year $(if ($null -ne $w.year) { [string]$w.year } else { '' }) `
      -FromYear $(if ($null -ne $w.fromYear) { [string]$w.fromYear } else { '' }) `
      -ToYear $(if ($null -ne $w.toYear) { [string]$w.toYear } else { '' }) `
      -Concurrency ([string]$w.concurrency))
  }
}

# -- 2016-2022: the largest gap in the corpus, 7.69M documents ---------------
#    Ten courts hold ZERO in this band. Not a reachability defect — these
#    workers ARE in scope for it — but newest-first descent is still inside 2025
#    and has not arrived. docs/COVERAGE_GAP_MATRIX.md §4.
foreach ($c in @('9_13','33_10','3_22','10_8','27_1','8_9')) {
  Start-Worker "hc-boot-mid-$c" (HcArgs -Court $c -FromYear '2016' -ToYear '2022' -Concurrency '16')
}

# -- historical 1950-2015 ----------------------------------------------------
#    Ranked by ACTUAL untapped source, not by how few rows are held. Allahabad
#    is deliberately absent: it holds 6 pre-2016 documents but its ENTIRE
#    pre-2016 source population is 296, so it is ~98% done (NEW3 bus 0504,
#    verified independently against the matrix).
#
#    33_10 (Madras) ADDED 18 Aug 2026, and its absence was the largest single
#    acquisition hole in the corpus. Madras appeared ONLY in the 2016-2022 list
#    above, so no scope has ever been configured for its pre-2016 band. Measured
#    against docs/ops/migration/new2-coverage.json: 186,786 source records for
#    1950-2015 and **1 document acquired** — one row, from 1953. Every year from
#    1995 to 2018 reads zero held, which is 477,667 source records.
#
#    This is worse than a slow scope, and the reason is retrieval, not ingest: a
#    court-year holding zero is indistinguishable at query time from a
#    court-year that never existed. NEW3 confirmed the source partitions are
#    real (bus 0709/0710), so every one of those years is an acquisition gap
#    being silently served as an absence of law.
#
#    Madras 1998 is the one genuine source-zero and needs NO exclusion here.
#    `hc-load-cli` builds its work from `listMetadataKeys()` and then filters by
#    year, so a year with no source partition is never enumerated and cannot be
#    retried. There is nothing to retire from the scheduler; a year list would
#    be the only thing that could get this wrong, and this file does not use one.
#
#    SIX MORE ADDED 18 Aug 2026, and Madras was not a one-off — this list simply
#    omitted half the courts. Measured against the DB and the source counts in
#    docs/ops/migration/new2-coverage.json, pre-2016:
#
#      24_17   131,897 source      497 held   0.4%
#      23_23   104,831 source        0 held   0.0%
#      18_6     90,250 source        3 held   0.0%
#      7_26     76,711 source        2 held   0.0%
#      20_7     66,622 source        8 held   0.0%
#      21_11    34,026 source       39 held   0.1%
#      ────────────────────────────────────────────
#              503,357 source records effectively unheld
#
#    None of these was a slow scope. No scope existed for any of them, exactly as
#    with 33_10 — which went from 1 document to 185,589 (99.4% of source) in a
#    single pass once it was added to this line.
#
#    A court at 0.0% outranks a court at 70% for the same reason the blackout work
#    outranks everything else: retrieval cannot distinguish "we hold none" from
#    "there are none", so an unheld court-year is served to an advocate as an
#    absence of law rather than as a gap in our corpus.
foreach ($c in @('27_1','10_8','3_22','36_29','32_4','22_18','8_9','29_3','33_10','24_17','23_23','18_6','7_26','20_7','21_11')) {
  Start-Worker "hc-boot-hist-$c" (HcArgs -Court $c -FromYear '1950' -ToYear '2015' -Concurrency '16')
}
foreach ($c in @('2_5','5_15')) {
  Start-Worker "hc-boot-hist-$c" (HcArgs -Court $c -FromYear '1950' -ToYear '2015' -Concurrency '32')
}

# -- the general sweep. No --court, so no checkpoint, by design. -------------
Start-Worker 'hc-boot-sweep' (HcArgs -FromYear '2016' -Concurrency '16')

# -- classification backfill. --resume walks only hc_class_method IS NULL. ---
Start-Worker 'hc-classify-boot' @('--env-file=../../.env', 'src/hc-classify-cli.ts', '--resume', '--confirm')

Log ""
Log "started $started · skipped $skipped (already running)$(if ($filtered -gt 0) { " · filtered $filtered (-Only)" })"
