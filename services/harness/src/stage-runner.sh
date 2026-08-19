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

run_batch() {
  local file="$1"
  local tag="$2"
  echo "=== $(date -u +%H:%M:%S) START $tag $(basename "$file")"
  BATCH_FILE="$file" \
  SUMMARY_PATH="$ROOT/docs/ai/new1-tier-a/stage-summary-$tag.json" \
    npx tsx src/doc-vector-embed.mjs 2>&1 | tail -3
  echo "=== $(date -u +%H:%M:%S) END $tag"
}

run_batch "$ROOT/docs/ai/new1-tier-a/tier-a-value-batch-00001.jsonl" "value-00001"

for i in $(seq -f "%05g" 0 "${MAX_BATCH:-9}"); do
  f="$ROOT/docs/ai/embedding-manifests/document-vectors/tier-a-batch-$i.jsonl"
  [ -f "$f" ] || continue
  run_batch "$f" "lcc-$i"
done

echo "=== $(date -u +%H:%M:%S) RUNNER COMPLETE"
