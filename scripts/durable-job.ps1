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
  [switch]$Remove,
  # Declare this job a NON-WRITER and omit the freeze check from its wrapper.
  # Ask for it deliberately; the reason is recorded in the generated wrapper.
  [switch]$IgnoreStopFile
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
# THE FREEZE SWITCH GOES IN THE GENERATED WRAPPER, NOT IN THIS SCRIPT.
#
# `scripts/check-stop-coverage.mjs` found this file as a launcher that could
# start a WRITER during a freeze, and it was right: it will register any command
# it is handed, on a repeating trigger, with nothing between that command and the
# database. Its own docstring already warns "do not point this at a job with no
# guard" -- a warning is not a guard.
#
# It goes in the WRAPPER because that is what actually runs, on every fire,
# however the task was created. Putting the check here would test the state of
# the world at REGISTRATION time, which is the one moment it does not matter.
#
# `-IgnoreStopFile` exists for jobs that are not writers -- the GPU sidecar
# keeper holds no database connection and pausing it during a corpus freeze buys
# nothing and costs a warm sidecar. It has to be asked for, and the reason is
# written into the wrapper so the next reader sees the claim rather than an
# unexplained absence.
$stopGuard = if ($IgnoreStopFile) {
@"
REM  STOP file NOT checked -- registered with -IgnoreStopFile.
REM  This job is declared a NON-WRITER: it holds no database connection, so the
REM  fleet freeze has nothing to protect from it.
"@
} else {
@"
REM  THE FLEET FREEZE. services\ingest\.checkpoints\STOP is written by
REM  `release:candidate pause` and by scripts\fleet-stop.ps1, and every writer in
REM  this repo is expected to cross it. Checked on EVERY fire, because a
REM  repeating trigger means "every n minutes" is also "every n minutes during a
REM  freeze".
if exist "$repo\services\ingest\.checkpoints\STOP" (
  echo [%DATE% %TIME%] PAUSED by services/ingest/.checkpoints/STOP -- not starting >> "$log"
  exit /b 0
)
"@
}

@"
@echo off
cd /d "$repo"
$stopGuard
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
