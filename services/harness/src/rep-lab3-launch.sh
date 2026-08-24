#!/usr/bin/env bash
# NEW1 — launch representation lab V3 so it OUTLIVES the session that started it.
#
# Same reason walk-launch.sh exists: a background child of a Claude Code Bash
# call dies with the shell it descended from, and a 90-minute GPU run must not.
# This file exists so the launching command has no quoting in it.
set -u
ROOT="/c/Users/Xerxus/Documents/Lawmind"
cd "$ROOT/services/harness" || exit 1
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' "$ROOT/.env" | sed 's/^DATABASE_URL=//')"
export REP_POOL_SIZES="${REP_POOL_SIZES:-2500,7500,20000}"
export REP_LIFTED_TASKS="${REP_LIFTED_TASKS:-250}"
export REP_BOOTSTRAP="${REP_BOOTSTRAP:-2000}"
exec npx tsx src/representation-lab-v3-cli.ts >> "$ROOT/docs/ai/new1-tier-a/rep-lab3.log" 2>&1
