<#
  Lawmind — LOCAL CANARY. Three ingest workers against the LOCAL PostgreSQL,
  run BEFORE the full fleet comes back after the Railway exit.
  NEW2, 16 Aug 2026.

  ---------------------------------------------------------------------------
  WHY A CANARY AND NOT JUST `fleet-resume.ps1`
  ---------------------------------------------------------------------------
  `fleet-resume.ps1` starts 38 workers. If the local database is wrong in any
  way — a missing index, a different collation, an unrestored table, a
  connection string that still reaches Railway — 38 workers discover it
  simultaneously, at 200-row batches, against a database nobody has yet proved.
  Three workers discover the same thing in the same minute and cost nothing to
  stop.

  The three are one per YEAR BAND, deliberately, because the bands exercise
  different code: `recent` reads current partitions with neutral citations
  present, `2016-2022` is the largest remaining gap, and `pre-2016` is older
  scans with worse OCR and no neutral citations at all — the band most likely to
  behave differently on a new database.

  THEY REUSE THE FLEET'S OWN SCOPE NAMES AND CHECKPOINTS, ON PURPOSE. A canary
  with fresh checkpoint names would start at offset 0 and re-fetch everything,
  which tests the wrong thing. Resuming a real scope from a real offset against
  the NEW database is precisely the behaviour that has to be proved, and it is
  the behaviour the other 35 will depend on.

  ---------------------------------------------------------------------------
  WHAT THIS REFUSES TO DO
  ---------------------------------------------------------------------------
  - It will not run while `.checkpoints/STOP` exists. Removing STOP is the
    deliberate act that ends the freeze and it belongs to whoever received
    LCC's LOCAL_DATABASE_CUTOVER_APPROVED, not to this script.
  - It will not run unless `LOCAL_DATABASE_URL` is present in `.env` AND points
    at a loopback address. A canary that silently reached Railway would "pass"
    and prove nothing.
  - It refuses outright if the resolved URL mentions a Railway host or if
    DATABASE_PUBLIC_URL is set in the environment.

  The connection string is passed to the child processes through the
  environment, NOT by editing `.env`. Flipping `.env` repoints every lane's
  tooling at once; this repoints three processes and leaves the rollback exactly
  where LCC put it.

    powershell -File scripts\start-local-canary.ps1 -WhatIf   # print, launch nothing
    powershell -File scripts\start-local-canary.ps1
#>
param(
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Xerxus\Documents\Lawmind'
$node = (Get-Command node).Source
$envFile = Join-Path $repo '.env'
$stopFile = Join-Path $repo 'services\ingest\.checkpoints\STOP'

# -- refuse if the freeze is still on -----------------------------------------
#
# -WhatIf is exempt, and ONLY -WhatIf. It starts no process, so refusing it
# during the freeze removes the rehearsal exactly when rehearsing is the only
# thing left to do — and a dry run that is unavailable in the state it was
# written for is a dry run nobody has actually seen the output of. It still
# prints the freeze in red, because a preview that looked identical either side
# of the freeze would be its own trap.
if (Test-Path $stopFile) {
  if (-not $WhatIf) {
    Write-Host 'REFUSING: the write freeze is still in effect.' -ForegroundColor Red
    Write-Host "  $stopFile exists."
    Write-Host '  Do not delete it on a "workers are zero" observation. Delete it only after'
    Write-Host '  LCC sends LOCAL_DATABASE_CUTOVER_APPROVED, and read the bus first.'
    exit 1
  }
  Write-Host 'FREEZE IS ON — this is a dry run, and a real run would refuse here.' -ForegroundColor Red
  Write-Host "  $stopFile exists. Only LCC's LOCAL_DATABASE_CUTOVER_APPROVED removes it."
}

# -- resolve the LOCAL url, and prove it is local ------------------------------
if (-not (Test-Path $envFile)) { Write-Error "no .env at $envFile"; exit 1 }
$localUrl = (Select-String -LiteralPath $envFile -Pattern '^LOCAL_DATABASE_URL=(.*)$').Matches.Groups[1].Value.Trim()
if (-not $localUrl) {
  Write-Host 'REFUSING: LOCAL_DATABASE_URL is not set in .env.' -ForegroundColor Red
  exit 1
}
if ($localUrl -notmatch '127\.0\.0\.1|localhost|\[::1\]') {
  Write-Host "REFUSING: LOCAL_DATABASE_URL is not a loopback address: $($localUrl -replace '://[^:]+:[^@]+@', '://***:***@')" -ForegroundColor Red
  exit 1
}
if ($localUrl -match 'rlwy\.net|railway') {
  Write-Host 'REFUSING: LOCAL_DATABASE_URL mentions a Railway host.' -ForegroundColor Red
  exit 1
}
if ($env:DATABASE_PUBLIC_URL) {
  Write-Host 'REFUSING: DATABASE_PUBLIC_URL is set in this environment. Unset it; nothing may use it.' -ForegroundColor Red
  exit 1
}

Write-Host "LOCAL CANARY  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "  target: $($localUrl -replace '://[^:]+:[^@]+@', '://***:***@')"

<#
  ONE SCOPE PER BAND. Chosen from docs/ops/migration/new2-checkpoint-inventory.json
  as scopes that have a captured command line AND a non-trivial stored offset, so
  each one exercises the RESUME path rather than starting from nothing.

  Concurrency is deliberately below the fleet's (32 recent / 16 banded): the
  point of a canary is to observe, and a saturated NVMe hides the latency signal
  the scale-up decision depends on.
#>
$canaries = @(
  @{ Label = 'hc-boot-10_8';      Band = 'recent';    Args = @('--court', '10_8', '--from-year', '2016', '--batch', '200', '--concurrency', '8', '--apply') }
  @{ Label = 'hc-boot-mid-27_1';  Band = '2016-2022'; Args = @('--court', '27_1', '--from-year', '2016', '--to-year', '2022', '--batch', '200', '--concurrency', '8', '--apply') }
  @{ Label = 'hc-boot-hist-27_1'; Band = 'pre-2016';  Args = @('--court', '27_1', '--from-year', '1950', '--to-year', '2015', '--batch', '200', '--concurrency', '8', '--apply') }
)

# -- refuse to double-start ----------------------------------------------------
$live = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*supervise.mjs*' } |
  ForEach-Object { if ($_.CommandLine -match 'supervise\.mjs\s+(\S+)') { $matches[1] } })

foreach ($c in $canaries) {
  if ($live -contains $c.Label) {
    Write-Host "  SKIP   $($c.Label) — already running" -ForegroundColor Yellow
    continue
  }

  $workerArgs = @('src/harvest/hc-load-cli.ts') + $c.Args
  if ($WhatIf) {
    Write-Host "  WOULD  $($c.Label.PadRight(20)) [$($c.Band)]  $($workerArgs -join ' ')"
    continue
  }

  <#
    Rotate a log carrying a completed RESULTS block, for the same reason
    start-ingest-fleet.ps1 does: supervise.mjs reads the log tail to decide a
    scope is finished and would exit instantly without writing anything.
  #>
  $log = Join-Path $repo "$($c.Label).log"
  if (Test-Path $log) {
    $tail = Get-Content $log -Tail 40 -ErrorAction SilentlyContinue
    if ($tail -match '^RESULTS') { Move-Item $log (Join-Path $repo "$($c.Label).prev.log") -Force }
  }

  <#
    DATABASE_URL is injected for the CHILD ONLY. `--env-file=../../.env` still
    loads the rest of the configuration, and Node's own environment takes
    precedence over an --env-file entry, so this overrides the Railway value
    without editing the file that holds LCC's rollback.
  #>
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $node
  foreach ($a in (@('scripts\supervise.mjs', $c.Label, '--', '--env-file=../../.env') + $workerArgs)) {
    $psi.ArgumentList.Add($a)
  }
  $psi.WorkingDirectory = $repo
  $psi.UseShellExecute = $false
  $psi.EnvironmentVariables['DATABASE_URL'] = $localUrl
  $psi.EnvironmentVariables.Remove('DATABASE_PUBLIC_URL') | Out-Null
  [System.Diagnostics.Process]::Start($psi) | Out-Null

  Write-Host "  START  $($c.Label.PadRight(20)) [$($c.Band)]  concurrency 8"
}

Write-Host ''
if ($WhatIf) {
  Write-Host 'nothing launched (-WhatIf).'
  exit 0
}
Write-Host 'Canaries launched. VERIFY BEFORE SCALING — processes are not evidence:'
Write-Host '  node scripts\migration\verify-local-canary.mjs'
