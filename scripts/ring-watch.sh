#!/usr/bin/env bash
# Wakes the orchestrator when a long pass finishes or a worker dies.
#
# Long passes here run for hours. Polling them by hand wastes a turn each time
# and, worse, a worker that DIES silently looks exactly like one still running --
# which is how four of them went unnoticed today. So this watches for both
# terminal states and exits on the first, which re-invokes the agent.
#
# THE WORKER COUNT MUST COME FROM POWERSHELL, NOT `ps`.
# The first version of this script used `ps -ef | grep -c`, and it reported ZERO
# workers while all six were running -- Git Bash's `ps` does not carry the
# command line of a process launched via PowerShell's Start-Process, so every
# pattern missed. A watcher that cries wolf is worse than no watcher, because
# the next real alarm gets ignored. `Get-CimInstance Win32_Process` sees the
# full command line and is the only reading that has proven correct here.
ROOT="/c/Users/Xerxus/Documents/Lawmind"
LOGS="paragraphs-backfill citations-p2 sections-backlog enrich-meta-rt enrich-treat-k1 reextract-allahabad-v5"
PATTERN='paragraphs-cli|citations-cli|sections-cli|enrich-cli|reextract-cli'

live_workers() {
  powershell.exe -NoProfile -Command \
    "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match '$PATTERN' } | Measure-Object).Count" \
    2>/dev/null | tr -cd '0-9'
}

BASELINE="$(live_workers)"
[ -n "$BASELINE" ] || BASELINE=0
echo "watching ${BASELINE} workers"

while true; do
  for l in $LOGS; do
    if [ -f "$ROOT/$l.log" ] && grep -q "^RESULTS" "$ROOT/$l.log" 2>/dev/null; then
      echo "FINISHED: $l"; exit 0
    fi
  done
  n="$(live_workers)"
  [ -n "$n" ] || n="$BASELINE"     # a failed reading is not evidence of a death
  if [ "$n" -lt "$BASELINE" ]; then
    echo "WORKER COUNT DROPPED ${BASELINE} -> ${n} — something stopped without finishing"; exit 0
  fi
  sleep 120
done
