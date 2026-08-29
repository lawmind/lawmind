#!/usr/bin/env bash
# NEW1 — the coarse walk's 15-minute ledger, launched the same way the walk is.
#
# It reads the SAME `.snapshot.env` the walk reads, and that is the whole point:
# `eligibleTotal`, `remainingRealWork` and every ETA in the ledger come out of
# the coverage census named there. A telemetry process pointed at a different
# snapshot than the walk reports a percentage of the wrong denominator and looks
# entirely healthy doing it.
#
# Registered as a scheduled task rather than started by hand. On 27 Aug the box
# was powered off at 22:49:57Z; the GPU sidecar came back at logon because it
# HAS a task, and the walk and this watcher did not because they did not. That
# cost 3h27m of GPU with nothing reporting it.
set -u
ROOT="/c/Users/Xerxus/Documents/Lawmind"
cd "$ROOT/services/harness" || exit 1
SNAPSHOT_ENV="$ROOT/docs/ai/new1-tier-a/.snapshot.env"
if [ -f "$SNAPSHOT_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$SNAPSHOT_ENV"
  set +a
fi
exec npx tsx src/coarse-walk-telemetry.mjs >> "$ROOT/docs/ai/new1-r10/telemetry.out.log" 2>&1
