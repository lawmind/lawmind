<#
  Lawmind — RESUME THE FLEET after a graceful pause.
  NEW2, 15 Aug 2026. The other half of scripts\fleet-stop.ps1.

  Deliberately thin, because the hard part is already solved elsewhere: the
  launcher is idempotent per scope (its duplicate guard skips anything already
  running) and every worker resumes from its own checkpoint. So a resume is
  "remove the switch, run the launcher, then prove rows are landing again".

  THE LAST STEP IS THE POINT. A fleet is not resumed because processes exist —
  that is the trap LANE_PROTOCOL.md §3b names and this repo has fallen into more
  than once: 38 processes alive, writing nothing, for thirteen hours. Row growth
  is the only evidence that counts, so this script waits and counts.

    pwsh scripts\fleet-resume.ps1
    pwsh scripts\fleet-resume.ps1 -SkipRowCheck    # DB intentionally unavailable
#>
param(
  [int]$RowCheckSeconds = 90,
  [switch]$SkipRowCheck
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Xerxus\Documents\Lawmind'
$stopFile = Join-Path $repo 'services\ingest\.checkpoints\STOP'

if (Test-Path $stopFile) {
  Remove-Item $stopFile -Force
  Write-Host "removed $stopFile"
} else {
  Write-Host "no STOP file present — fleet was not paused by fleet-stop.ps1"
}

Write-Host ''
& (Join-Path $repo 'scripts\lawmind-ingest-startup.cmd')

if ($SkipRowCheck) {
  Write-Host ''
  Write-Host 'row check skipped by request — resume is NOT verified.' -ForegroundColor Yellow
  exit 0
}

Write-Host ''
Write-Host "counting rows for ${RowCheckSeconds}s — processes are not evidence..."
$probe = Join-Path $repo 'scripts\fleet-rowcount.mjs'
$first = & node $probe
Start-Sleep -Seconds $RowCheckSeconds
$second = & node $probe

$delta = [int64]$second - [int64]$first
Write-Host "  judgments: $first -> $second  (+$delta in ${RowCheckSeconds}s)"
if ($delta -gt 0) {
  Write-Host 'RESUMED — verified by row growth.' -ForegroundColor Green
  exit 0
}
Write-Host 'NOT RESUMED — processes are up but no rows landed. Check a worker log.' -ForegroundColor Red
exit 1
