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

<#
  THE RECEIPT — one JSON line per cycle, and the reason it is not the log.

  `job-health.mjs` reconciles a cadence job by counting RECEIPTS, and it refuses
  to register one without a receipts file, for a reason this lane has already
  been bitten by: a scheduled task that fires and does nothing looks exactly like
  a scheduled task that fired and worked, and `completion-is-not-a-success-signal`
  records three jobs that reported COMPLETE while doing 1.1%, nothing, and
  nothing 549 times.

  So the receipt carries what the cycle OBSERVED, read back out of the artifacts
  the steps wrote, never this script's opinion of what it did. `outcome` is the
  only narration in it, and every other field is evidence:

    stopped   — the STOP file was present and the fleet was deliberately paused
    failed    — a step exited non-zero; `failedStep` names it
    ok        — the cycle completed

  It is written at EVERY exit including the paused and failed ones. A cadence
  with a gap in its receipts means the task did not run; a cadence whose receipts
  all say `stopped` is a fleet somebody froze. Those must never read the same,
  and they must never read like a healthy cycle either.
#>
$receiptFile = Join-Path $repo '.agents\ops\n2-daily-delta-receipts.jsonl'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $receiptFile) | Out-Null
$cycleStartedAt = (Get-Date).ToUniversalTime().ToString('o')
$script:receiptWritten = $false

function Receipt([string]$outcome, [hashtable]$extra) {
  if ($script:receiptWritten) { return }
  $script:receiptWritten = $true
  $r = [ordered]@{
    cycle       = $stamp
    startedAt   = $cycleStartedAt
    endedAt     = (Get-Date).ToUniversalTime().ToString('o')
    outcome     = $outcome
    host        = $env:COMPUTERNAME
    pid         = $PID
    invocation  = $(if ($Full) { 'full' } else { 'delta' })
  }
  if ($extra) { foreach ($k in $extra.Keys) { $r[$k] = $extra[$k] } }
  Add-Content -LiteralPath $receiptFile -Value ($r | ConvertTo-Json -Compress -Depth 6) -Encoding utf8
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
  Receipt 'stopped' @{ stopReason = (Get-Content -LiteralPath $stopFile -Raw).Trim() }
  Say "=== cycle $stamp end (paused)"
  exit 0
}

<#
  DATABASE_URL FOR THE CHILDREN, AND WHY THE CYCLE HAS TO SUPPLY IT.

  The `n2-*` scripts each read `.env` themselves through their own
  `databaseUrl()` helper, so they work under a scheduled task that inherits
  nothing. `services/ingest/src/*-cli.ts` does NOT — it reads
  `CORPUS_DATABASE_URL ?? DATABASE_URL` from the environment and refuses
  otherwise, which is the right behaviour for a service and the wrong assumption
  for a launcher.

  Observed on the first cycle that included the statute step:

      sections FAILED exit=2 -- CORPUS_DATABASE_URL is not set.

  It worked by hand because an interactive shell had exported it. A scheduled
  task runs with the task's own environment, so "it worked when I ran it" proves
  nothing about the cycle. Loading it here, once, is what makes the two the same.

  A missing value is NOT defaulted. The cycle says so and carries on, because the
  manifest and ledger steps read `.env` directly and are still worth running.
#>
if (-not $env:DATABASE_URL) {
  $envFile = Join-Path $repo '.env'
  if (Test-Path $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile) {
      if ($line -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
        $env:DATABASE_URL = $Matches[1].Trim('"').Trim("'")
        break
      }
    }
  }
  if (-not $env:DATABASE_URL) { Say "WARNING: DATABASE_URL not found in environment or .env -- database steps will refuse" }
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

if (-not (Run $tsx @('scripts\n2-upstream-manifest.mts') 'manifest')) { Receipt 'failed' @{ failedStep = 'manifest' }; exit 1 }
foreach ($l in (Get-Content (Join-Path $logDir 'n2-daily-manifest.err') | Where-Object { $_ -match 'metadata objects' })) { Say "  $l" }
if (-not (Run $node @('scripts/n2-delta-scopes.mjs') 'scopes')) { Receipt 'failed' @{ failedStep = 'scopes' }; exit 1 }
if (-not (Run $node @('scripts/n2-delta-plan.mjs') 'plan')) { Receipt 'failed' @{ failedStep = 'plan' }; exit 1 }

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
  SOURCE-UNAVAILABLE IS A CURRENT OBSERVATION, NOT A BLACKLIST.

  Revalidation is bounded twice: rows are eligible only when their upstream
  partition changed or their last direct check is at least 90 days old, and a
  cycle handles at most 2,500. Live PDFs re-enter the canonical ingestion path;
  unavailable rows receive a new direct observation and lastCheckedAt.
#>
$revalidateOk = Run $tsx @('scripts\n2-hc-gap-closure.mts', '--mode', 'revalidate', '--apply', '--limit', '2500', '--concurrency', '4') 'source-revalidate'
if (-not $revalidateOk) { Say "  source-unavailable revalidation FAILED -- eligible rows remain recoverable next cycle" }

<#
  SUPREME COURT CURRENT DELTA — EXACTLY THE INDEPENDENTLY AUTHORIZED SCOPE.

  This invokes only sci-live's public, server-rendered homepage Judgments feed
  and the official PDFs linked by that feed. It does not invoke sci_search,
  CAPTCHA solving, archive backfill or any expanded access path.
#>
$sciHomepageOk = Run $tsx @('services\ingest\src\sci-live-cli.ts', '--apply', '--limit=50') 'sci-homepage'
if (-not $sciHomepageOk) { Say "  SCI public homepage judgment delta FAILED -- expanded SCI search remains off" }

<#
  THE RESOLVER RISK REPLAY, AND WHY IT BELONGS HERE RATHER THAN IN A HUMAN'S HEAD.

  LCC found this and handed it to NEW2 (bus 1418). The downstream cycle after
  every ingest is FOUR steps, and the third had no owner:

      ingest committed
        -> citation-key index walked to the new frontier   (Lawmind-citation-keys)
        -> RISK REPLAY re-run against the new cursor       <- was nobody's job
        -> citations / paragraphs consumers

  `readKeyFreshness` compares the replay's `frontier_at` against the live key
  cursor as TEXT, so **every advance of the index invalidates the replay that
  vouches for it.** On a corpus that ingests daily that means the resolver gate is
  STALE by default and CURRENT only in the minutes after somebody runs this by
  hand. LCC ran it twice in one day for exactly that reason.

  It goes AFTER the ingest and BEFORE the ledger, unconditionally — including on
  a cycle that ingested nothing, because the key builder runs on its own schedule
  and can advance the cursor without this cycle writing a row.

  It is ~40 seconds over 406 records and it writes one adjudicated-evidence row.
  A failure here is NOT fatal to the cycle: the ledger refresh below is the
  evidence half and must still run. The receipt records the outcome either way,
  so a replay that quietly stopped working is visible as a field rather than as
  an absence.
#>
$replayOk = Run $tsx @('scripts\n2-resolver-risk-replay.mts', '--write') 'riskreplay'
if (-not $replayOk) { Say "  risk replay FAILED -- the resolver gate will read STALE until it is re-run" }

<#
  STATUTE REFERENCE EXTRACTION OVER THE DELTA.

  LCC measured (bus 1446) that `judgment_statute_refs` had no new row in sixteen
  days and that 0 of the 1,334 judgments from the overnight cycle had reached it,
  while every other consumer sat exactly on the ingest frontier. The arm was not
  stalled — it was never wired, because `sections-cli` only had `--resume`, which
  still walks the 95.7% of the corpus that carries no ref. Nothing that shape can
  live in a daily cycle.

  `--since` bounds it to what we ingested in the window, so this is delta work
  rather than a corpus sweep. The window is generous on purpose: 36 hours, not 24.
  A cycle that is skipped, refused or fails must not leave a permanent hole, and
  re-scanning a judgment we already indexed is an idempotent upsert on
  (judgment_id, act_named, section_number) — the cheap side of the trade.

  Extraction only. Linking a reference to a `statutes` row is a separate,
  HEAVY_BOX-gated apply and is deliberately NOT run here.
#>
$since = (Get-Date).ToUniversalTime().AddHours(-36).ToString('o')
$sectionsOk = Run $tsx @('services\ingest\src\sections-cli.ts', '--apply', '--resume', '--since', $since) 'sections'
if (-not $sectionsOk) { Say "  statute-reference extraction FAILED -- judgment_statute_refs is behind the ingest frontier" }

<#
  THE LEDGER IS REFRESHED LAST AND UNCONDITIONALLY.

  It reads the database, not this script's opinion of what it did, so it is
  the only line here that is evidence rather than narration.
#>
[void](Run $tsx @('scripts\n2-source-ledger.mts') 'ledger')
foreach ($l in (Get-Content (Join-Path $logDir 'n2-daily-ledger.out') | Select-String -Pattern 'honest lag|newest local|^aws_|^ecourts')) {
  Say "  $l"
}

<#
  The receipt reads the two artifacts back off disk rather than reusing the
  in-memory values, so a step that wrote nothing cannot be reported as a step
  that observed nothing.
#>
$observed = [ordered]@{}
try {
  $mf = Get-Content -LiteralPath (Join-Path $repo 'docs\ai\new2-r9\upstream-manifest.json') -Raw | ConvertFrom-Json
  $observed['manifestTakenAt'] = $mf.takenAt
  foreach ($b in $mf.buckets.PSObject.Properties) {
    $observed[$b.Name] = [ordered]@{
      objects            = $b.Value.totalObjects
      new                = $b.Value.counts.NEW
      grown              = $b.Value.counts.GROWN
      shrunk             = $b.Value.counts.SHRUNK
      bytesWaiting       = $b.Value.bytesWaiting
      newestUpstreamWrite = $b.Value.newestUpstreamWrite
    }
  }
} catch { $observed['manifestError'] = $_.Exception.Message }
try {
  $lg = Get-Content -LiteralPath (Join-Path $repo 'docs\ai\new2-r9\source-ledger.json') -Raw | ConvertFrom-Json
  $observed['ledgerTakenAt'] = $lg.takenAt
  $observed['sources'] = @($lg.sources | ForEach-Object {
      [ordered]@{
        source              = $_.source
        heldDocuments       = $_.heldDocuments
        newestLocalDecision = $_.newestLocalDecision
        honestLagDays       = $_.honestLagDays
        lastSuccessfulIngest = $_.lastSuccessfulIngest
      }
    })
} catch { $observed['ledgerError'] = $_.Exception.Message }

try {
  $rr = Get-Content -LiteralPath (Join-Path $repo 'docs\ai\new2-r8\resolver-risk-replay.json') -Raw | ConvertFrom-Json
  $observed['resolverRiskReplay'] = [ordered]@{
    ran              = $replayOk
    generatedAt      = $rr.generated_at
    mode             = $rr.mode
    records          = $rr.totals.records
    falseUniqueRate  = $rr.false_unique_rate
    freshnessState   = $rr.notes.resolver_freshness_state
    frontierAt       = $rr.notes.frontier_at
  }
} catch { $observed['resolverRiskReplayError'] = $_.Exception.Message }

Receipt 'ok' @{
  scopesOwned = $names.Count
  scopes = $names
  sourceUnavailableRevalidation = $revalidateOk
  sciHomepageJudgmentDelta = $sciHomepageOk
  observed = $observed
}
Say "=== cycle $stamp end"
