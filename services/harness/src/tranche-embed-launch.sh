#!/usr/bin/env bash
# NEW1 — launch the 100k passage tranche embed so it OUTLIVES the session.
#
# Same reason walk-launch.sh exists: `nohup ... &` from a Claude Code Bash call is
# killed with the shell it descended from on Windows. Start-Process creates an
# independent process; this file exists so that command has no quoting in it.
set -u
ROOT="C:/Users/Xerxus/Documents/Lawmind"
cd "$ROOT/services/embed" || exit 1
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' "$ROOT/.env" | sed 's/^DATABASE_URL=//')"
export EMBED_GPU_URL="${EMBED_GPU_URL:-http://127.0.0.1:8799}"
export TRANCHE_BATCH="${TRANCHE_BATCH:-200}"
exec npx tsx src/tranche-embed-cli.ts >> "$ROOT/docs/ai/new1-tier-a/tranche-embed-runner.log" 2>&1
