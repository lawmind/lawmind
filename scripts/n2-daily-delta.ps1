<#
  NEW2 — THE DAILY DELTA CYCLE. One pass: measure upstream, ingest what moved,
  refresh the source ledger.

  ---------------------------------------------------------------------------
  WHY THIS EXISTS, AND WHAT IT REPLACES
  ---------------------------------------------------------------------------
  The High Court bucket WRITES DAILY. The fleet stopped on 19 August 2026 and
  nothing restarted it for eight days; by 27 August, 46 upstream objects had
  grown and one partition was new.

  The logon launcher would have covered a reboot, and it had been switched off:

      Startup\Lawmind-ingest.cmd.disabled-frontier-closed

  "Frontier closed" is the same reasoning that put six courts in the launcher's
  ABSENT ON PURPOSE list — true on the day it was written, and false the next
  time the publisher wrote. **Against a daily source, COMPLETED is a statement
  with an expiry date.**

  A logon launcher also only fires at logon. A box that stays up for a week
  ingests nothing for a week, which is exactly what happened.

  ---------------------------------------------------------------------------
  WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT
  ---------------------------------------------------------------------------
    1. build a fresh upstream object manifest from both Open Data buckets
    2. map every GROWN / NEW object to the scope whose cursor owns it
    3. derive the delta plan for scopes the launcher has no standing line for
    4. start ONLY those scopes, through the existing launcher and its guards
    5. refresh the source ledger

  It does NOT start the whole fleet. The standing hist/mid/sweep scopes have all
  walked their files to the end; starting 51 workers to consume 20 MB is how a
  measurement becomes a cost. `-Full` overrides that for a deliberate sweep.

  It does NOT rewind a checkpoint. The offsets are the frontier and they are
  correct; the file sizes moved, not the offsets' meaning.

  It does NOT decide anything is finished. Step 5 writes the ledger whether or
  not step 4 wrote a row, because "we checked and nothing had moved" and "we did
  not check" must never read the same.

  Usage:
    powershell -NoProfile -File scripts\n2-daily-delta.ps1
    powershell -NoProfile -File scripts\n2-daily-delta.ps1 -Full
#>
param(
  [switch]$Full
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$node = (Get-Command node).Source
$tsx = Join-Path $repo 'services\ingest\node_modules\.bin\tsx.cmd'
$logDir = Join-Path $repo '.agents\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$cycleLog = Join-Path $logDir 'n2-daily-delta.log'

function Say([string]$m) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m"
  Write-Host $line
  Add-Content -LiteralPath $cycleLog -Value $line -Encoding utf8
}

Say "=== cycle $stamp start"

<#
  THE STOP FILE IS HONOURED HERE TOO, AND SAID OUT LOUD.

  Every launcher checks it, so step 4 would refuse anyway — but it would refuse
  silently, per scope, in 26 separate logs. A freeze is a deliberate act and the
  daily cycle should report that it saw one, not just quietly do nothing.
#>
$stopFile = Join-Path $repo 'services\ingest\.checkpoints\STOP'
if (Test-Path $stopFile) {
  Say "STOP file present -- fleet is deliberately paused, ingesting nothing this cycle."
  Say ((Get-Content -LiteralPath $stopFile -Raw).Trim())
  Say "=== cycle $stamp end (paused)"
  exit 0
}

function Run([string]$exe, [string[]]$argv, [string]$name) {
  $out = Join-Path $logDir "n2-daily-$name.out"
  $err = Join-Path $logDir "n2-daily-$name.err"
  $p = Start-Process -FilePath $exe -ArgumentList $argv -WorkingDirectory $repo `
    -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden -PassThru -Wait
  if ($p.ExitCode -ne 0) {
    Say "$name FAILED exit=$($p.ExitCode) -- see $err"
    return $false
  }
  return $true
}

if (-not (Run $tsx @('scripts\n2-upstream-manifest.mts') 'manifest')) { exit 1 }
foreach ($l in (Get-Content (Join-Path $logDir 'n2-daily-manifest.err') | Where-Object { $_ -match 'metadata objects' })) { Say "  $l" }
if (-not (Run $node @('scripts/n2-delta-scopes.mjs') 'scopes')) { exit 1 }
if (-not (Run $node @('scripts/n2-delta-plan.mjs') 'plan')) { exit 1 }

$delta = Get-Content -LiteralPath (Join-Path $repo 'docs\ai\new2-r9\delta-scopes.json') -Raw | ConvertFrom-Json
$names = @($delta.scopes | ForEach-Object { $_.scope })
Say "delta owns $($names.Count) scope(s)"

if ($names.Count -eq 0 -and -not $Full) {
  Say "nothing upstream has moved -- starting no workers"
} else {
  # NOT $args -- that is an automatic variable in PowerShell and assigning to it
  # inside a script is legal, silently shadowing, and impossible to read later.
  $launchArgs = @('-NoProfile', '-File', 'scripts\start-ingest-fleet.ps1')
  if (-not $Full) { $launchArgs += @('-Only', ($names -join ',')) }
  $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $launchArgs -WorkingDirectory $repo `
    -RedirectStandardOutput (Join-Path $logDir 'n2-daily-launch.out') `
    -RedirectStandardError (Join-Path $logDir 'n2-daily-launch.err') -WindowStyle Hidden -PassThru -Wait
  foreach ($l in (Get-Content (Join-Path $logDir 'n2-daily-launch.out') | Select-String -Pattern '^started ' | Select-Object -Last 1)) { Say "  $l" }
}

<#
  THE LEDGER IS REFRESHED LAST AND UNCONDITIONALLY.

  It reads the database, not this script's opinion of what it did, so it is
  the only line here that is evidence rather than narration.
#>
[void](Run $tsx @('scripts\n2-source-ledger.mts') 'ledger')
foreach ($l in (Get-Content (Join-Path $logDir 'n2-daily-ledger.out') | Select-String -Pattern 'honest lag|newest local|^aws_|^ecourts')) {
  Say "  $l"
}
Say "=== cycle $stamp end"
