<#
  pg-hide-consoles.ps1 — hide the console windows PostgreSQL's child processes
  open, without signalling any of them.

  ---------------------------------------------------------------------------
  WHY THIS EXISTS
  ---------------------------------------------------------------------------
  The postmaster is spawned with DETACHED_PROCESS (scripts/migration/pg-local.mjs,
  `spawnPostmaster`). That was the right fix for the postmaster and it is not in
  question here. But it has a consequence the old comment in that file got
  wrong when it said DETACHED_PROCESS leaves "nothing left to signal":

    a process with NO console that spawns a console-subsystem child does not
    pass a console on -- Windows ALLOCATES A NEW ONE for the child.

  So every backend, autovacuum worker, io_worker, wal_writer and bgworker the
  postmaster forks gets its own private console. On Windows 11 the default
  terminal application is Windows Terminal, so each of those consoles surfaces
  as its own TASKBAR WINDOW titled with the server binary's path:

    C:\lawmind\pgsql\pgsql\bin\postgres.exe

  MEASURED 18 Aug 2026, this session, with a control that discriminates:
  a detached parent spawning three plain children produced three conhosts and
  three visible Windows Terminal windows; the same parent non-detached produced
  none. The postmaster itself has no window -- only its children do, which is
  exactly why the postmaster survives and a CHILD is what dies.

  ---------------------------------------------------------------------------
  WHY IT IS A HAZARD AND NOT AN EYESORE
  ---------------------------------------------------------------------------
  Those windows are live console attachments to live database processes.
  Closing one delivers a console control event, the attached backend exits with
  0xC000013A (STATUS_CONTROL_C_EXIT), and the postmaster treats an abnormal
  child exit as a crash and RESTARTS THE WHOLE CLUSTER -- taking the ingest
  fleet with it (bus 0668).

  That is not hypothetical. Every recorded instance killed a CHILD, never the
  postmaster, and always with that exit code:

    2026-08-17 00:39:43  client backend      0xC000013A
    2026-08-17 06:45:48  autovacuum worker   0xC000013A
    2026-08-18 04:22:21  autovacuum worker   0xC000013A

  A taskbar full of identical junk windows invites exactly the click that does
  this. Hiding them removes the vector; it does not paper over it.

  ---------------------------------------------------------------------------
  WHAT THIS IS NOT
  ---------------------------------------------------------------------------
  This is the UNELEVATED INTERIM. The real fix is to run the cluster where no
  interactive desktop exists, so no window can be created in the first place --
  a Windows service, or a scheduled task with an S4U principal. BOTH REQUIRE
  ELEVATION ONCE; both were attempted from this session and both returned
  "Access is denied". That single elevated command is FQ-PGSERVICE in
  docs/FOUNDER_QUEUE.md.

  This script sends NO signal, posts NO message, and terminates NOTHING. It
  calls ShowWindow(SW_HIDE) and nothing else, so the worst case of a wrong
  match is a window you cannot see, recoverable with -Restore.
#>
[CmdletBinding()]
param(
  # Report only. Default, so an accidental run changes nothing.
  [switch]$Apply,
  # Undo: show everything matched again.
  [switch]$Restore,
  # Poll forever instead of once. New backends open new windows, so a one-shot
  # run only cleans what exists at that instant.
  [switch]$Watch,
  [int]$IntervalSeconds = 10,
  # Matched by EXACT window title. The server binary's full path is what
  # Windows Terminal titles these windows with, and no human-opened shell
  # carries that title.
  [string]$Title = 'C:\lawmind\pgsql\pgsql\bin\postgres.exe'
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# RETIRED 18 Aug 2026 — AND A RETIRED SCRIPT THAT STILL RUNS IS NOT RETIRED
# ---------------------------------------------------------------------------
#
# PostgreSQL runs as the LawMindPostgres service now. Every backend is in
# SessionId 0, which has no interactive desktop: the windows this hides are not
# hidden any more, they CANNOT BE CREATED. This script was the unelevated
# interim and is kept only as documentation of the mechanism
# (docs/FOUNDER_QUEUE.md), which is why it is not deleted.
#
# It was still fully executable, including a `while ($true)` watch loop. Two
# reasons that had to stop:
#
#   1. `scripts/check-stop-coverage.mjs` counts it as a launcher that can run
#      during a write freeze, and it was right to — nothing here crossed the
#      STOP sentinel. The guard went red the moment the script was retired,
#      because retiring it in a document changed nothing about the file.
#   2. A forever loop hiding windows that cannot exist is a process nobody is
#      watching, on a box where an unattended process is how a hang becomes
#      invisible.
#
# Both refusals below are the same shape `scripts/migration/pg-local.mjs`
# already uses for `start`/`spawn-detached`.

$repoRoot = Split-Path -Parent $PSScriptRoot
$stopFile = Join-Path $repoRoot 'services\ingest\.checkpoints\STOP'
if (Test-Path $stopFile) {
  Write-Host 'REFUSING: the write freeze is in effect.' -ForegroundColor Red
  Write-Host "  $stopFile exists."
  Write-Host '  Removing STOP is the deliberate act that ends the freeze, and it is not this script''s.'
  exit 1
}

$pgService = Get-Service -Name 'LawMindPostgres' -ErrorAction SilentlyContinue
if ($pgService) {
  Write-Host 'REFUSING: this script is RETIRED.' -ForegroundColor Yellow
  Write-Host '  LawMindPostgres exists, so every postgres process is in SessionId 0 and'
  Write-Host '  can create no window at all. There is nothing here left to hide.'
  Write-Host '  Kept as documentation of the mechanism — docs/ops/PROCESS_TOPOLOGY.md.'
  exit 0
}

# ---------------------------------------------------------------------------
# SINGLE INSTANCE -- GUARDED HERE, NOT IN THE LAUNCHER, AND NOT BY GREP
# ---------------------------------------------------------------------------
# The obvious guard is for the launcher to scan the process table for anything
# whose command line mentions this script. That guard is WRONG, and it failed
# the first time it ran, 18 Aug 2026: the launcher was itself a powershell.exe
# whose command line quoted the script path, so it MATCHED ITSELF, reported
# "already running", and started nothing. The ABSENT LOG FILE is what exposed
# it -- the process table looked entirely convincing.
#
# So the guard lives in the watcher and is keyed to a pid file that only a real
# watcher writes. A stale pid file cannot INVERT the guard the way
# enrich-worker.cmd's lock file once did, because the pid is checked for
# liveness and identity, not for existence.
$PidFile = Join-Path $PSScriptRoot '..\.pg-hide-consoles.pid'

if (-not ([System.Management.Automation.PSTypeName]'LawMindWin').Type) {
  Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class LawMindWin {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h, StringBuilder s, int max);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  delegate bool EnumWindowsProc(IntPtr h, IntPtr p);

  // Hidden windows are invisible to EnumWindows' visibility test, so -Restore
  // has to enumerate ALL windows and filter on title alone.
  static List<IntPtr> Find(string title, bool visibleOnly) {
    var hits = new List<IntPtr>();
    EnumWindows((h, p) => {
      if (visibleOnly && !IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowTextW(h, sb, 512);
      if (string.Equals(sb.ToString(), title, StringComparison.OrdinalIgnoreCase)) hits.Add(h);
      return true;
    }, IntPtr.Zero);
    return hits;
  }

  public static int Count(string title) { return Find(title, true).Count; }

  // SW_HIDE = 0. Not WM_CLOSE, not EndTask, not GenerateConsoleCtrlEvent --
  // every one of those would kill the attached backend, which is the whole
  // failure this script exists to prevent.
  public static int Hide(string title) {
    var hits = Find(title, true);
    foreach (var h in hits) ShowWindow(h, 0);
    return hits.Count;
  }

  // SW_SHOWNA = 8: show without stealing focus.
  public static int Show(string title) {
    var hits = Find(title, false);
    foreach (var h in hits) ShowWindow(h, 8);
    return hits.Count;
  }
}
"@
}

function Stamp { (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss') }

if ($Restore) {
  $n = [LawMindWin]::Show($Title)
  Write-Output "$(Stamp)  restored $n window(s) matching '$Title'"
  return
}

if (-not $Apply) {
  $n = [LawMindWin]::Count($Title)
  Write-Output "$(Stamp)  DRY RUN: $n visible window(s) match '$Title'"
  Write-Output "         re-run with -Apply to hide them, -Apply -Watch to keep them hidden"
  return
}

if (-not $Watch) {
  $n = [LawMindWin]::Hide($Title)
  Write-Output "$(Stamp)  hid $n window(s) matching '$Title'"
  return
}

$prior = $null
if (Test-Path $PidFile) {
  $candidate = (Get-Content $PidFile -Raw).Trim()
  if ($candidate -match '^\d+$') {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$candidate" -ErrorAction SilentlyContinue
    # Name AND pid-is-not-me, as well as liveness: pids get reused, and adopting
    # an unrelated live process as "the watcher" would silently disable the guard
    # in the one direction that matters -- leaving nothing running.
    if ($proc -and $proc.Name -eq 'powershell.exe' -and $proc.ProcessId -ne $PID) { $prior = $proc.ProcessId }
  }
}
if ($prior) {
  Write-Output "$(Stamp)  watcher already running (pid $prior) -- exiting rather than duplicating"
  return
}
Set-Content -Path $PidFile -Value $PID -Encoding ascii

Write-Output "$(Stamp)  watch mode, pid $PID, every ${IntervalSeconds}s, matching '$Title' (Ctrl-C to stop)"
$total = 0
while ($true) {
  $n = [LawMindWin]::Hide($Title)
  if ($n -gt 0) {
    $total += $n
    Write-Output "$(Stamp)  hid $n new window(s); $total since start"
  }
  Start-Sleep -Seconds $IntervalSeconds
}
