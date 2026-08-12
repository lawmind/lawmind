#!/usr/bin/env bash
# Wakes the orchestrator when a long pass finishes or a worker dies.
#
# Long passes here run for hours. Polling them by hand wastes a turn each time
# and, worse, a worker that DIES silently looks exactly like one still running --
# which is how four of them went unnoticed today. So this watches for both
# terminal states and exits on the first, which re-invokes the agent.
ROOT="/c/Users/Xerxus/Documents/Lawmind"
LOGS="paragraphs-backfill citations-p2 sections-backlog enrich-meta-rt enrich-treat-k1 reextract-allahabad-v5"
while true; do
  # A pass that printed RESULTS has finished cleanly.
  for l in $LOGS; do
    if [ -f "$ROOT/$l.log" ] && grep -q "^RESULTS" "$ROOT/$l.log" 2>/dev/null; then
      echo "FINISHED: $l"; exit 0
    fi
  done
  # Fewer live workers than logs means one stopped without printing RESULTS.
  alive=$(ps -ef 2>/dev/null | grep -cE "[p]aragraphs-cli|[c]itations-cli|[s]ections-cli|[e]nrich-cli|[r]eextract-cli")
  if [ "$alive" -lt 3 ]; then
    echo "WORKER COUNT DROPPED to $alive — something stopped without finishing"; exit 0
  fi
  sleep 120
done
