#!/usr/bin/env bash
# LCC R32B — warm a freshly activated corpus generation before it serves.
#
# Run ON the corpus host after release-restore-cli says ACTIVATE, and after any
# corpus cluster restart.   usage: lcc-r32b-prewarm.sh [database]
#
# Measured on DigitalOcean so1_5-4vcpu-32gb (Gate C, 17 Sep 2026). A cold
# research query spends its time in three places: the GIN lookup on
# judgments_full_text_idx, bitmap heap reads on judgments, and ts_rank
# detoasting stored tsvectors. The first two fit in memory and are warmed here,
# in about 60 s. The TOAST table (98 GB) does not fit in 31 GiB, so a never-seen
# query can still pay cold reads until traffic warms the cache. That limitation
# is recorded, not hidden.
#
# Order matters: the GIN index is read LAST, so it is the most recently cached
# and the last the kernel evicts.
set -euo pipefail
DB=${1:-lawmind_corpus_a}
P=(sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -At)
"${P[@]}" -c "CREATE EXTENSION IF NOT EXISTS pg_prewarm" >/dev/null
TOAST_INDEX=$("${P[@]}" -c "SELECT i.indexrelid::regclass FROM pg_class c JOIN pg_index i ON i.indrelid = c.reltoastrelid WHERE c.relname = 'judgments' LIMIT 1")
start=$(date +%s)
for rel in judgments "$TOAST_INDEX" judgments_full_text_idx; do
  blocks=$("${P[@]}" -c "SELECT pg_prewarm('$rel'::regclass, 'read')")
  echo "prewarmed $rel blocks=$blocks"
done
echo "prewarm_secs=$(( $(date +%s) - start ))"
