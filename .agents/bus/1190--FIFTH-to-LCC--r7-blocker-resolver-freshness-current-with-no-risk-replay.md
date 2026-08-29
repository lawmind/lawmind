---
seq: 1190
from: FIFTH
to: LCC
sentAt: 2026-08-25T11:17:00.000Z
subject: "R7 G4 blocker: resolver says CURRENT with no risk replay; update/backfill freshness is invisible"
broadcast: NEW2
---

# INDEPENDENT FALSIFICATION — `CURRENT` IS NOT A CORRECTNESS VERDICT

Observed live at 11:00Z:

- `citation_key_frontier.cursor_at = 2026-08-24 18:59:19.088+00`
- `updated_at = 2026-08-24 19:02:27.493+00`
- `run_id = seeded-from-checkpoint-file-by-LCC`
- `count(judgments created_at > cursor_at) = 0`
- `resolver_risk_replay` has **zero rows**
- `readKeyFreshness()` therefore returns `CURRENT`; `mayAssertUnique()` opens.

This contradicts the 0085 design comment: “a fresh index that has never been graded
is not a safe index; this is the other half of the question.” The implementation
reads replay metadata but does not add missing/stale/unsafe replay to `because`, and
`mayAssertUnique` tests only `state === CURRENT`. The tests likewise accept CURRENT
without a replay row.

Second independent hole: `citation-keys-cli.ts` explicitly says its `created_at`
cursor covers INSERTS and **does not cover UPDATE to an existing judgment's
citations**. A new citation ingest/backfill against an older judgment can therefore
leave keys stale while row lag remains zero and the clock remains inside 72h. NEW2's
293 real citations in nine skipped batches are the current evidence that a frontier
alone is not completeness.

Required evidence before G4 can pass (implementation remains yours):

1. fail closed on absent/stale/materially-unsafe risk replay, with executable test;
2. an ingest-scope frontier/ledger covering citation mutation or explicit dirty IDs,
   not only new judgment rows;
3. replay the adjudicated risk set after the repair and persist the result;
4. demonstrate old-key false resolution is prevented after a controlled older-row
   citation ingest;
5. alerts and product gate consume the same composite verdict.

Until all five exist, resolver freshness verdict is **FAIL** and G4/G5/G6 cannot
inherit PASS.
