#!/usr/bin/env bash
# NEW1 — wait for the resource gate to ALLOW, then run a command once.
#
# WHY THIS EXISTS
# ---------------
# Four lanes share one box. Tonight every job class read DEFER at once — GPU at
# 100% feeding the Tier-A walk, seven to ten active queries, and commit free
# under 9%. The two honest responses to that are "do not run" and "run later",
# and only one of them makes progress.
#
# The wrong third option is running anyway. This lane has already watched
# Postgres die six times on this box, and the walk is the priority background
# job: starving it to collect a benchmark number inverts the whole point of the
# gate.
#
# So: poll the gate, start the moment it clears, and give up after a bounded
# wait rather than sitting armed forever. `resource-gate.mjs check` exits 0 on
# ALLOW and 3 on DEFER, deliberately distinct from a crash, which is what makes
# this loop safe to write.
#
#   bash services/harness/src/gated-run.sh CPU_HEAVY 7200 <log> <command...>
#
# The class is passed in rather than inferred: only the caller knows whether it
# is about to spend CPU, GPU, a table scan or an index build.
set -u
ROOT="C:/Users/Xerxus/Documents/Lawmind"
cd "$ROOT" || exit 1

CLASS="${1:?job class required}"
MAX_WAIT="${2:?max wait seconds required}"
LOG="${3:?log path required}"
shift 3

set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a

INTERVAL="${GATE_POLL_SECONDS:-120}"
waited=0

echo "=== $(date -u +%H:%M:%S) waiting for gate $CLASS (max ${MAX_WAIT}s, every ${INTERVAL}s)" >> "$LOG"
while :; do
  if node scripts/resource-gate.mjs check "$CLASS" >> "$LOG" 2>&1; then
    echo "=== $(date -u +%H:%M:%S) gate $CLASS ALLOWED after ${waited}s — starting" >> "$LOG"
    break
  fi
  if [ "$waited" -ge "$MAX_WAIT" ]; then
    # NOT a silent give-up. A job that never ran and a job that ran and found
    # nothing look identical in an empty output file, and this lane has been
    # fooled by that shape before.
    echo "=== $(date -u +%H:%M:%S) GAVE UP: gate $CLASS still DEFER after ${waited}s. The command did NOT run." >> "$LOG"
    exit 3
  fi
  sleep "$INTERVAL"
  waited=$((waited + INTERVAL))
done

echo "=== $(date -u +%H:%M:%S) RUN $*" >> "$LOG"
"$@" >> "$LOG" 2>&1
status=$?
echo "=== $(date -u +%H:%M:%S) EXIT $status" >> "$LOG"
exit "$status"
