#!/usr/bin/env bash
# NEW1 — run the production-route benchmark detached, for the same reason
# `walk-launch.sh` exists: an inline command with redirections has silently done
# nothing more than once on this box, and this run takes long enough that it has
# now been killed twice by a session ending underneath it.
set -u
ROOT="/c/Users/Xerxus/Documents/Lawmind"
cd "$ROOT/services/harness" || exit 1
exec npx tsx --env-file="$ROOT/.env" src/production-route-benchmark.ts \
  >> "$ROOT/.scratch/prodroute.log" 2>&1
