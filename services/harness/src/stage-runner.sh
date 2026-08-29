#!/usr/bin/env bash
# NEW1 — keep the GPU fed. Walks batch manifests in order, one at a time.
#
# Each batch is a separate `doc-vector-embed.mjs` invocation on purpose: the stage
# is idempotent per document (`ON CONFLICT DO NOTHING`), so a batch that dies is
# re-runnable without re-embedding what already landed, and a crash costs one
# batch rather than the run.
#
# Order is deliberate. The value-ordered remainder goes first — those documents
# have inbound citations and are the population the expansion benchmark can score.
# LCC's id-ordered manifests follow, because a document nothing cites is still
# worth a vector, just not worth it FIRST.
set -u
ROOT="C:/Users/Xerxus/Documents/Lawmind"
cd "$ROOT/services/harness" || exit 1
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' "$ROOT/.env" | sed 's/^DATABASE_URL=//')"

# THE SNAPSHOT THE WALK IS WALKING, 28 Aug 2026.
#
# The manifest directory and the coverage file are one decision, not two. The v1
# generation `document-vectors/` was built under eligibility definition
# e76879ab6bbcd452; `document-vectors-v2/` under the deployed 5b5d02384b46c96c,
# which is the hash `doc-vector-embed.mjs` reconciles against. Walking one while
# censusing the other is a silent population mix, so they move together and the
# runner PRINTS the pair on every start. Defaults are v1, unchanged.
MANIFEST_DIR="${MANIFEST_DIR:-document-vectors}"
BATCH_DIR="$ROOT/docs/ai/embedding-manifests/$MANIFEST_DIR"
COVERAGE="$ROOT/docs/ai/new1-tier-a/${COVERAGE_FILE:-stage-coverage.json}"
WORKLIST="$ROOT/docs/ai/new1-tier-a/${WORKLIST_FILE:-.worklist.txt}"
if [ ! -d "$BATCH_DIR" ]; then
  echo "manifest directory does not exist: $BATCH_DIR — refusing to walk nothing" >&2
  exit 1
fi
echo "=== $(date -u +%H:%M:%S) SNAPSHOT $MANIFEST_DIR  coverage=$(basename "$COVERAGE")"

# A failed batch must NOT advance the walk.
#
# The GPU sidecar died mid-run and every batch after it failed instantly with
# "fetch failed". The walk kept going and consumed 67 batches in about sixty
# seconds, printing START and END for each one, embedding nothing. The stage
# already exits 1 on failure; the status was simply lost, because `| tail -3`
# makes `$?` the exit code of tail. Hence PIPESTATUS.
#
# Retry before aborting, because the sidecar coming back is the common case and
# an 11-day run should survive a restart. Abort after that, because marching on
# turns a recoverable outage into a manifest that claims to be done.
STAGE_RETRIES="${STAGE_RETRIES:-3}"
STAGE_RETRY_SLEEP="${STAGE_RETRY_SLEEP:-30}"

run_batch() {
  local file="$1"
  local tag="$2"
  local attempt=1
  local status
  while :; do
    echo "=== $(date -u +%H:%M:%S) START $tag $(basename "$file") (attempt $attempt)"
    # tail -20, not tail -3.
    #
    # On 28 Aug batch lcc-00010 died three times and the log recorded only
    # `routine: 'transformCreateStmt'` and a closing brace. That is the TAIL of
    # a postgres.js NOTICE dump — `CREATE TABLE IF NOT EXISTS` on a table that
    # exists is a NOTICE, this file installs no `onnotice`, and postgres.js
    # prints the whole object. Three lines of window is less than one notice, so
    # the actual message ("fetch failed", the GPU sidecar) was pushed out of it.
    # A truncation that can hide the only diagnostic is worse than a long log.
    BATCH_FILE="$file" SUMMARY_PATH="$ROOT/docs/ai/new1-tier-a/stage-summary-$tag.json"       npx tsx src/doc-vector-embed.mjs 2>&1 | tail -20
    status="${PIPESTATUS[0]}"
    if [ "$status" -eq 0 ]; then
      echo "=== $(date -u +%H:%M:%S) END $tag"
      return 0
    fi
    if [ "$attempt" -ge "$STAGE_RETRIES" ]; then
      echo "=== $(date -u +%H:%M:%S) ABORT $tag - exit $status after $attempt attempts." >&2
      echo "=== the walk STOPS here rather than marking later batches done." >&2
      return "$status"
    fi
    echo "=== $(date -u +%H:%M:%S) RETRY $tag - exit $status, sleeping ${STAGE_RETRY_SLEEP}s" >&2
    sleep "$STAGE_RETRY_SLEEP"
    attempt=$((attempt + 1))
  done
}

# The last batch defaults to the WHOLE manifest, read from the manifest itself.
#
# It used to default to 9. The run was launched without MAX_BATCH set, embedded
# batches 0-9, printed RUNNER COMPLETE and stopped at 110,469 vectors with 876
# batches never started — and "complete" is exactly what it said, so nothing
# looked wrong. A default that silently means 1.1% of the job is a default that
# will do this again.
if [ -z "${MAX_BATCH:-}" ]; then
  MANIFEST="$BATCH_DIR/manifest-tier-a.json"
  BATCHES="$(grep -o '"batches"[[:space:]]*:[[:space:]]*[0-9]*' "$MANIFEST" | grep -o '[0-9]*$')"
  if [ -z "$BATCHES" ]; then
    echo "cannot read batch count from $MANIFEST — refusing to guess" >&2
    exit 1
  fi
  MAX_BATCH=$((BATCHES - 1))
fi
# Re-walking a finished batch is cheap and safe: the stage skips already-staged
# documents BEFORE the GPU sees them, so resume needs no bookkeeping of its own.
START_BATCH="${START_BATCH:-0}"
echo "=== $(date -u +%H:%M:%S) RUNNER START batches $START_BATCH..$MAX_BATCH"

# The value batch belongs to the v1 generation. Walking it under a v2 snapshot
# would embed ids that the v2 manifest does not name, so it is skipped there
# rather than quietly widening the population the snapshot claims to cover.
if [ "${WALK_VALUE_BATCH:-auto}" = "1" ] || { [ "${WALK_VALUE_BATCH:-auto}" = "auto" ] && [ "$MANIFEST_DIR" = "document-vectors" ]; }; then
  run_batch "$ROOT/docs/ai/new1-tier-a/tier-a-value-batch-00001.jsonl" "value-00001" || exit 1
else
  echo "=== $(date -u +%H:%M:%S) SKIP value-00001 — not part of snapshot $MANIFEST_DIR"
fi

# COVERAGE, NOT RANGE.
#
# The range walk reached batch 88 while batches 10..76 held zero vectors — the 67
# a dead sidecar consumed in sixty seconds, each printing START and END. The
# exit-status bug is fixed, but a range never goes back, so the hole would have
# survived the entire eleven-day run and shown up only as a corpus that is
# mysteriously thin in a third of its ids.
#
# `stage-coverage-census.mjs` asks the database, per batch file, how many of the
# ids that file names are staged. Its `worklist` is every file that is not yet
# covered, in manifest order. Walking THAT closes 10..76 on the way past and
# needs nobody to remember which numbers were lost.
# A RESTART MUST NOT RE-WALK WHAT IS ALREADY DONE — 28/29 Aug 2026.
#
# The scheduled task restarts this runner on exit, which is the whole point of
# it. But the worklist is derived from a coverage census FILE, and the runner
# re-reads that file without asking how old it is. Batch lcc-00010 aborted on a
# sidecar "fetch failed" at 03:03, the task restarted the runner at 03:06, and
# it began again at batch 00000 — fifty-five batches that were already complete,
# each costing 60-85 s of pure already-staged scanning to insert nothing.
#
# That is COARSE_RESTART_R9.md §3's failure exactly, one layer further out: the
# stale-worklist defect was fixed for the FIRST start and reappeared on every
# restart after it. Measured: ~64 minutes of guaranteed zero output per restart
# at batch 55, and it grows with every batch completed.
#
# The census costs ~7 minutes and reads the database rather than a file, so it
# is cheaper than the thing it prevents from the moment the walk is ~7 batches
# in. It is skipped when the file is fresh so a fast crash-loop cannot turn into
# a census loop.
COVERAGE_MAX_AGE_MIN="${COVERAGE_MAX_AGE_MIN:-45}"
if [ "${USE_COVERAGE:-1}" = "1" ] && [ "${RECENSUS_ON_START:-1}" = "1" ]; then
  age_min=99999
  if [ -f "$COVERAGE" ]; then
    age_min=$(( ( $(date +%s) - $(stat -c %Y "$COVERAGE") ) / 60 ))
  fi
  if [ "$age_min" -ge "$COVERAGE_MAX_AGE_MIN" ]; then
    echo "=== $(date -u +%H:%M:%S) coverage is ${age_min}m old (>= ${COVERAGE_MAX_AGE_MIN}m) — re-censusing before walking"
    if MANIFEST_DIR="$MANIFEST_DIR" COVERAGE_OUT="$(basename "$COVERAGE")"        INCLUDE_VALUE_BATCHES=0 COMPLETE_TOLERANCE="${COMPLETE_TOLERANCE:-25}"        npx tsx src/stage-coverage-census.mjs; then
      echo "=== $(date -u +%H:%M:%S) re-census done"
    else
      # A census failure must not stop the walk: a stale worklist is slow, and
      # no worklist at all is stopped. Slow beats stopped, and it says so.
      echo "=== $(date -u +%H:%M:%S) re-census FAILED — walking the existing ${age_min}m-old coverage" >&2
    fi
  else
    echo "=== $(date -u +%H:%M:%S) coverage is ${age_min}m old — fresh enough, not re-censusing"
  fi
fi

if [ "${USE_COVERAGE:-1}" = "1" ] && [ -f "$COVERAGE" ]; then
  echo "=== $(date -u +%H:%M:%S) walking the COVERAGE worklist from $COVERAGE"
  # Re-read per run, never cached: the census is re-run between runs and a stale
  # worklist would re-walk batches that have since been filled.
  node -e '
    const c = require(process.argv[1]);
    for (const f of c.worklist) if (/^tier-a-batch-/.test(f)) console.log(f);
  ' "$COVERAGE" > "$WORKLIST" || exit 1
  total="$(wc -l < "$WORKLIST")"
  echo "=== $(date -u +%H:%M:%S) $total batch files to walk"
  n=0
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    n=$((n + 1))
    f="$BATCH_DIR/$name"
    [ -f "$f" ] || continue
    tag="lcc-$(echo "$name" | grep -o '[0-9]\{5\}')"
    echo "=== $(date -u +%H:%M:%S) worklist $n/$total"
    run_batch "$f" "$tag" || {
      echo "=== $(date -u +%H:%M:%S) RUNNER ABORTED at $name" >&2
      exit 1
    }
  done < "$WORKLIST"
else
  for i in $(seq -f "%05g" "$START_BATCH" "$MAX_BATCH"); do
    f="$BATCH_DIR/tier-a-batch-$i.jsonl"
    [ -f "$f" ] || continue
    run_batch "$f" "lcc-$i" || {
      echo "=== $(date -u +%H:%M:%S) RUNNER ABORTED at batch $i" >&2
      exit 1
    }
  done
fi

echo "=== $(date -u +%H:%M:%S) RUNNER COMPLETE"
