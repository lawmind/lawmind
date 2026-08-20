#!/usr/bin/env bash
# NEW1 — launch the Tier-A walk so that it OUTLIVES the session that started it.
#
# `nohup ... &` from inside a Claude Code Bash call is not enough on Windows. The
# walk and its sidecar keeper were both started that way at 11:51Z and 11:38Z and
# both were gone by 13:39Z — killed with the shell they descended from, three and a
# half hours before anyone looked. The GPU sat at 0% the whole time and nothing
# reported anything, because a process that is killed does not write "I was
# killed".
#
# The reliable form on this box is PowerShell's `Start-Process`, which creates an
# independent process rather than a child of the Git Bash job:
#
#   Start-Process -FilePath 'C:\Program Files\Git\bin\bash.exe' `
#     -ArgumentList 'services/harness/src/walk-launch.sh' `
#     -WorkingDirectory 'C:\Users\Xerxus\Documents\Lawmind' -WindowStyle Hidden
#
# This file exists so that command has no quoting in it. An inline `bash -lc '...'`
# with two redirections and an `exec` silently did nothing.
set -u
ROOT="/c/Users/Xerxus/Documents/Lawmind"
cd "$ROOT/services/harness" || exit 1
exec bash src/stage-runner.sh >> "$ROOT/docs/ai/new1-tier-a/stage-runner.log" 2>&1
