<#
  Lawmind — GRACEFUL FLEET PAUSE, and the proof that it was graceful.
  NEW2, 15 Aug 2026. Written for the Railway -> local PostgreSQL cutover.

  ---------------------------------------------------------------------------
  WHY THIS EXISTS AND WHY `taskkill /f /im node.exe` IS NOT IT
  ---------------------------------------------------------------------------
  Windows has no SIGTERM. Every stop this fleet has ever taken was a
  TerminateProcess landing wherever the worker happened to be — possibly with an
  INSERT in flight, and (before 15 Aug) possibly mid-rewrite of a checkpoint
  file, which truncates it and silently resets that court to offset 0.

  That was survivable while the database was staying put. It is the wrong thing
  to rely on while the database underneath is being REPLACED, which is what the
  cutover does. So the pause is cooperative:

    1. this script writes  services/ingest/.checkpoints/STOP
    2. each worker sees it at its next BATCH BOUNDARY, where nothing is in
       flight and the checkpoint on disk is exactly current, and exits 0
       (hc-load-cli.ts, `stopIfRequested`)
    3. each supervisor sees it before it would restart, and exits too
       (supervise.mjs) — without this half the pause looks like a crash loop
    4. this script waits for both, then RE-READS every checkpoint and proves no
       scope lost position

  Nothing is killed unless -Force is passed and the wait has already timed out.

  ---------------------------------------------------------------------------
  IT STOPS LCC's WORKERS TOO
  ---------------------------------------------------------------------------
  supervise.mjs runs LCC's paragraph and citation workers as well as NEW2's
  ingest fleet, so the switch quiesces those as well. That is the intent — a
  database cutover has to quiesce every writer — and it was sent to LCC on the
  bus rather than slipped in. Only the ingest workers get the batch-boundary
  exit; LCC's are stopped at their supervisor, which is still strictly better
  than a kill.

  ---------------------------------------------------------------------------
  USAGE
  ---------------------------------------------------------------------------
    pwsh scripts\fleet-stop.ps1                  # pause and verify
    pwsh scripts\fleet-stop.ps1 -TimeoutSeconds 600
    pwsh scripts\fleet-stop.ps1 -Force           # kill stragglers after timeout

  To resume:  scripts\fleet-resume.ps1  (deletes STOP, re-runs the launcher)
#>
param(
  [int]$TimeoutSeconds = 300,
  [switch]$Force,
  [switch]$IncludeAllLanes
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Xerxus\Documents\Lawmind'
$ckptDir = Join-Path $repo 'services\ingest\.checkpoints'
$stopFile = Join-Path $ckptDir 'STOP'
$manifest = Join-Path $ckptDir '.fleet-stop-manifest.json'

<#
  WHAT COUNTS AS "THE FLEET" HERE — and why the default is narrower than the
  STOP file's reach.

  The STOP file is honoured by every supervisor, LCC's included, because a
  database cutover has to quiesce every writer. But WAITING on and, worst case,
  KILLING another lane's workers is a different act from letting them stand
  themselves down, and it is not NEW2's to do outside the declared window.

  So the default matches only NEW2's ingest scopes — supervisors launched with a
  `hc-` scope name, plus the harvest and classify workers themselves. Pass
  -IncludeAllLanes during the actual cutover, once LCC has declared it and knows.
#>
function Get-LiveWorkers {
  $pattern = if ($IncludeAllLanes) {
    'supervise\.mjs|hc-load-cli|hc-classify-cli'
  } else {
    'supervise\.mjs\s+hc-|hc-load-cli|hc-classify-cli'
  }
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match $pattern }
}

function Read-Checkpoints {
  <#
    Returns scope -> (fileKey -> offset). A file that will not parse is recorded
    as $null rather than skipped, because "this checkpoint is unreadable" is the
    single most important thing this script can detect and must not be silently
    absent from the comparison.
  #>
  $out = @{}
  foreach ($f in Get-ChildItem $ckptDir -Filter '*.json' -File) {
    if ($f.Name -eq '.fleet-stop-manifest.json') { continue }
    try {
      $j = Get-Content $f.FullName -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
      $m = @{}
      foreach ($p in $j.PSObject.Properties) { $m[$p.Name] = [int64]$p.Value.offset }
      $out[$f.Name] = $m
    } catch {
      $out[$f.Name] = $null
    }
  }
  return $out
}

# -- 1. snapshot BEFORE anything stops ---------------------------------------
$before = Read-Checkpoints
$liveBefore = @(Get-LiveWorkers)
$scopes = @($liveBefore | ForEach-Object {
    if ($_.CommandLine -match 'supervise\.mjs\s+(\S+)') { $matches[1] }
  } | Where-Object { $_ })

Write-Host "PAUSE  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "  checkpoints snapshotted : $($before.Count)"
Write-Host "  node worker processes   : $($liveBefore.Count)"
Write-Host "  supervised scopes       : $($scopes.Count)"

$unreadableBefore = @($before.GetEnumerator() | Where-Object { $null -eq $_.Value } | ForEach-Object { $_.Key })
if ($unreadableBefore.Count -gt 0) {
  Write-Host "  ALREADY UNREADABLE      : $($unreadableBefore -join ', ')" -ForegroundColor Yellow
}

@{
  stoppedAt   = (Get-Date).ToString('o')
  scopes      = $scopes
  checkpoints = $before
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifest -Encoding utf8

# -- 2. ask, do not kill ------------------------------------------------------
New-Item -ItemType File -Path $stopFile -Force | Out-Null
Write-Host "  STOP written            : $stopFile"

# -- 3. wait for the fleet to put itself down --------------------------------
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$remaining = @(Get-LiveWorkers)
while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 5
  $remaining = @(Get-LiveWorkers)
  Write-Host "  waiting... $($remaining.Count) still running"
}

if ($remaining.Count -gt 0) {
  Write-Host "  TIMED OUT with $($remaining.Count) still running" -ForegroundColor Yellow
  if ($Force) {
    <#
      /T because a supervisor's worker hangs off npx.cmd -> node, and killing the
      supervisor alone would orphan the tree rather than stop it.

      NO `2>&1` ON THIS LINE, and it is not a style preference. In Windows
      PowerShell 5.1, redirecting a native executable's stderr wraps each line in
      a NativeCommandError ErrorRecord; with $ErrorActionPreference = 'Stop' that
      is TERMINATING. The first run of this script died exactly there, on
      `ERROR: The process "27660" not found` — which is not an error at all but
      the expected outcome of /T having already killed that pid as part of an
      earlier supervisor's tree. The script aborted before it could verify a
      single checkpoint, which is the one thing it exists to do.

      So: no redirect, and each kill is independently guarded. A pid that is
      already gone is a success.
    #>
    foreach ($p in $remaining) {
      try { taskkill /f /t /pid $p.ProcessId | Out-Null } catch { }
    }
    Write-Host "  force-killed $($remaining.Count) — these did NOT stop at a batch boundary" -ForegroundColor Red
    $remaining = @(Get-LiveWorkers)
  } else {
    Write-Host "  NOT killing. Re-run with -Force, or raise -TimeoutSeconds." -ForegroundColor Yellow
  }
}

# -- 4. prove no scope lost its place ----------------------------------------
$after = Read-Checkpoints
$regressed = @()
$broken = @()
$advanced = 0
foreach ($scope in $before.Keys) {
  $a = $after[$scope]
  if ($null -eq $a) { $broken += $scope; continue }
  $b = $before[$scope]
  if ($null -eq $b) { continue }
  foreach ($k in $b.Keys) {
    if (-not $a.ContainsKey($k)) { $regressed += "$scope :: $k (key vanished)"; continue }
    if ($a[$k] -lt $b[$k]) { $regressed += "$scope :: $k ($($b[$k]) -> $($a[$k]))" }
    elseif ($a[$k] -gt $b[$k]) { $advanced++ }
  }
}

Write-Host ''
Write-Host "VERIFY"
Write-Host "  checkpoints re-read     : $($after.Count)"
Write-Host "  offsets advanced        : $advanced  (work done between snapshot and stop)"
Write-Host "  offsets REGRESSED       : $($regressed.Count)"
Write-Host "  checkpoints UNREADABLE  : $($broken.Count)"
foreach ($r in $regressed) { Write-Host "    REGRESSED $r" -ForegroundColor Red }
foreach ($b in $broken) { Write-Host "    UNREADABLE $b" -ForegroundColor Red }

<#
  THE DATABASE-SIDE PROOF, which the checkpoint check above cannot give.

  Everything before this line is evidence about PROCESSES and FILES. None of it
  can tell you whether a backend is still connected with an open transaction —
  and that is the thing that actually breaks a migration, because a table taking
  inserts during the final sync is the one that fails its row-count check
  (LCC, bus 0542).

  `scripts/migration/activity.mjs --require-quiet` is LCC's gate and the
  authority for that question. It is run here rather than reimplemented, and its
  output is printed in full.

  IT DOES NOT DECIDE THIS SCRIPT'S EXIT CODE, deliberately. It answers "is the
  DATABASE quiet", which includes other lanes — at the time this was wired in it
  reported NOT QUIET because of LCC's own orphaned backend pid 62315, stuck 20.9
  hours and nothing to do with the ingest fleet. Failing NEW2's pause on another
  lane's stuck transaction would be a false alarm on every run. So: report it,
  name it, and leave the dump decision where it belongs.
#>
Write-Host ''
Write-Host 'DATABASE QUIET CHECK (LCC bus 0542 — scripts/migration/activity.mjs)'
$activity = Join-Path $repo 'scripts\migration\activity.mjs'
if (Test-Path $activity) {
  & node $activity --require-quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host '  QUIET — no writer connected. Safe to take the final dump.' -ForegroundColor Green
  } else {
    Write-Host '  NOT QUIET. Read the pids above: any that are NOT ingest workers' -ForegroundColor Yellow
    Write-Host '  belong to another lane and are not resolved by this script.' -ForegroundColor Yellow
  }
} else {
  Write-Host "  skipped — $activity not found"
}

Write-Host ''
if ($regressed.Count -eq 0 -and $broken.Count -eq 0 -and $remaining.Count -eq 0) {
  Write-Host "PAUSED CLEANLY — every scope can resume from where it stopped." -ForegroundColor Green
  Write-Host "  resume with: powershell -File scripts\fleet-resume.ps1"
  exit 0
}
Write-Host "PAUSE INCOMPLETE — do not start the migration on this." -ForegroundColor Red
Write-Host "  still running: $($remaining.Count) · regressed: $($regressed.Count) · unreadable: $($broken.Count)"
exit 1
