#!/usr/bin/env bash
#
# Run it under the stall watchdog, never bare:
#   node scripts/stall-watchdog.mjs --log .scratch/logs/legal-object-factory.log \
#     --stall 1800 -- bash scripts/legal-object-factory.sh
#
# Bare, a Postgres restart hangs it silently and nothing notices for hours --
# measured 19 Aug 2026 at 4.5 hours. See scripts/stall-watchdog.mjs.
# The DeepSeek legal-object factory, cycling the four measured-safer tasks.
#
# case_structure is in the rotation because it is the ONLY implemented task that
# emits `issue` claims: grouping every claim by (task, kind) shows all 171 issue
# claims came from it, and none from holding/arguments/authorities/topics. P7
# needs that population to grow.
#
# THE ATOMIC TASKS JOINED THE ROTATION, 20 Aug 2026. The note that used to sit
# here said migration 0054's nine atomic tasks existed in the database CHECK with
# no prompt builder -- "a real gap, not a configuration one". `enrich-atomic.ts`
# closed it, so they are in the loop.
#
# They run AFTER the five composite tasks in each round, not instead of them: the
# composites are measured (79-81% claim verification over 7,000+ documents) and
# the atomics have two smoke runs behind them. Round order is the cheapest
# possible expression of "prove it at scale before it displaces something that
# works".
#
# Measured on the smoke runs -- court_action 70.0% of claims verified,
# statute_role 100.0% -- so `enrich:telemetry` is the thing to read after a few
# rounds. A task whose tokens-per-verified-object is an outlier comes back out of
# this list; that is what the number is for.
# Order is P6's: holding, arguments, authorities, topics. One task at a time and
# concurrency 1 inside each -- DEEPSEEK_DATA_MOAT.md measured that several
# callers against the free InferX pool worsen its 429 rate, so one caller
# finishes sooner than three fighting each other.
#
# Each pass re-selects, and the selector's anti-join on
# (judgment_id, task, prompt_version, status='ok') means a pass never re-does
# what the previous one landed. So the loop ADVANCES rather than spinning.
cd "$(dirname "$0")/.." || exit 1
ROUND=0
while true; do
  ROUND=$((ROUND + 1))
  for TASK in holding case_structure arguments authorities topics issue relief reasoning_proposition procedural_event date_event fact_proposition party_action court_action statute_role; do
    echo "=== round ${ROUND} · ${TASK} · $(date -u +%H:%M:%S) ==="
    timeout 3600 node --env-file=.env node_modules/tsx/dist/cli.mjs \
      services/ingest/src/enrich-cli.ts --task "${TASK}" --limit 60 2>&1 \
      | grep -E 'CLAIMS|documents |calls failed|rejection|^ +[0-9]+ +evidence|verification state|  (partial|rejected|verified) '
  done
  sleep 10
done
