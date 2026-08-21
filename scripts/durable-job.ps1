<#
.SYNOPSIS
  Register a long-running job as a Windows scheduled task so it outlives the
  agent session that started it.

.DESCRIPTION
  NEW1 has lost more than 18 GPU-hours to one failure mode: a keeper and a walk
  launched with `nohup ... &` from inside a session shell, both killed when the
  session ended, neither able to write "I was killed". The sidecar keeper's own
  module comment records it happening twice.

  The fix is not another supervisor. It is a different PARENT. A process started
  by Task Scheduler is a child of the service, not of the shell, so closing the
  agent session cannot reach it.

  MEASURED 21 Aug 2026, and it is the whole reason this file exists:

      ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
        ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)   ->  False

      schtasks /Create /TN LawmindProbeNonElevated ... /F
        ->  SUCCESS: The scheduled task "LawmindProbeNonElevated" has successfully been created.

  **Registering a task for the CURRENT USER needs no elevation.** Only `/RU
  SYSTEM` and `/RL HIGHEST` do, and neither is wanted here — the job should run
  as the user who owns the files and the GPU session. This was queued as an
  admin-blocked item; it is not one.

  WHY `/SC MINUTE` AND NOT `/SC ONLOGON`
  --------------------------------------
  A logon-only trigger recovers a reboot and nothing else: a job that dies at
  11:00 stays dead until the next logon. `/SC MINUTE /MO <n>` fires repeatedly,
  so a crash costs at most n minutes.

  That is only safe because the JOB guards itself. `sidecar-keeper.mjs` holds
  `.agents/logs/new1-sidecar-keeper.8799.lock`, so a second start is a no-op.
  **Do not point this at a job with no such guard** — a fleet launcher on a
  repeating trigger is how the ingest fleet silently went back to 42 workers.

.PARAMETER Name
  Task name. Prefixed `Lawmind-` so every task this repo creates is greppable.

.PARAMETER Command
  The command line to run, executed via cmd.exe from the repo root.

.PARAMETER EveryMinutes
  Repeat interval. Default 5.

.PARAMETER Remove
  Delete the task instead of creating it.

.EXAMPLE
  # NEW1's keeper, durable. Run from the repo root.
  ./scripts/durable-job.ps1 -Name new1-sidecar-keeper `
    -Command 'node services\harness\src\sidecar-keeper.mjs'

.EXAMPLE
  ./scripts/durable-job.ps1 -Name new1-sidecar-keeper -Remove
#>
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Command = '',
  [int]$EveryMinutes = 5,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$taskName = "Lawmind-$Name"
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ($Remove) {
  schtasks /Delete /TN $taskName /F
  exit $LASTEXITCODE
}

if ([string]::IsNullOrWhiteSpace($Command)) {
  Write-Error '-Command is required unless -Remove is given'
  exit 2
}

# `cd /d` first: Task Scheduler starts in system32, and every relative path in
# this repo -- checkpoints, .env, logs -- is written from the repo root.
$logDir = Join-Path $repo '.agents\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir "$Name.task.log"

# THE COMMAND GOES IN A FILE, AND `/TR` GETS A PATH.
#
# Passing the command inline failed on the first attempt with
# `ERROR: Invalid argument/option - '-Seconds'` -- PowerShell 5.1 rewrites the
# quoting of a string handed to a native exe, so `/TR` saw a command split at
# every space. A path has no spaces to lose, and the wrapper is also the thing
# you read when you want to know exactly what the task runs.
$jobDir = Join-Path $repo '.agents\jobs'
if (-not (Test-Path $jobDir)) { New-Item -ItemType Directory -Path $jobDir | Out-Null }
$wrapper = Join-Path $jobDir "$Name.cmd"

# stderr is folded into the same file deliberately. Two files means two things to
# check, and the failures worth catching here announce themselves on stderr.
@"
@echo off
cd /d "$repo"
$Command >> "$log" 2>&1
"@ | Set-Content -Path $wrapper -Encoding ascii

schtasks /Create /TN $taskName /TR $wrapper /SC MINUTE /MO $EveryMinutes /F
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Start it now rather than waiting up to EveryMinutes for the first fire.
schtasks /Run /TN $taskName | Out-Null

Write-Output "registered $taskName"
Write-Output "  runs      $Command"
Write-Output "  from      $repo"
Write-Output "  every     $EveryMinutes minute(s)"
Write-Output "  wrapper   $wrapper"
Write-Output "  log       $log"
Write-Output ''
Write-Output 'VERIFY IT IS REALLY DURABLE -- process liveness is not the check:'
Write-Output "  schtasks /Query /TN $taskName /FO LIST"
Write-Output "  Get-CimInstance Win32_Process -Filter \"ProcessId=<pid>\" | Select ParentProcessId"
Write-Output '  the parent must NOT be the agent shell. If it is, the task did not start it.'
