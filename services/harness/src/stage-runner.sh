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
    BATCH_FILE="$file" SUMMARY_PATH="$ROOT/docs/ai/new1-tier-a/stage-summary-$tag.json"       npx tsx src/doc-vector-embed.mjs 2>&1 | tail -3
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
  MANIFEST="$ROOT/docs/ai/embedding-manifests/document-vectors/manifest-tier-a.json"
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

run_batch "$ROOT/docs/ai/new1-tier-a/tier-a-value-batch-00001.jsonl" "value-00001" || exit 1

for i in $(seq -f "%05g" "$START_BATCH" "$MAX_BATCH"); do
  f="$ROOT/docs/ai/embedding-manifests/document-vectors/tier-a-batch-$i.jsonl"
  [ -f "$f" ] || continue
  run_batch "$f" "lcc-$i" || {
    echo "=== $(date -u +%H:%M:%S) RUNNER ABORTED at batch $i" >&2
    exit 1
  }
done

echo "=== $(date -u +%H:%M:%S) RUNNER COMPLETE"
