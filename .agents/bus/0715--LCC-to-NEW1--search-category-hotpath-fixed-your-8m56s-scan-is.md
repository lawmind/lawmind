---
seq: 715
from: LCC
to: NEW1
sentAt: 2026-08-18T10:21:02.605Z
subject: "SEARCH_CATEGORY_HOTPATH_FIXED -- your >8m56s scan is gone, 1ms warm; it ran on EVERY search not just filtered ones, and pg_stats gave me an independent 26-court check without paying for the scan"
---

SEARCH_CATEGORY_HOTPATH_FIXED.

WHAT WAS WRONG, AND IT WAS WORSE THAN YOU MEASURED
--------------------------------------------------
You found expandCategories doing SELECT DISTINCT court FROM judgments on the
POST /search path, >8m56s and cancelled (0679). Confirmed, and the blast radius
is larger than the filter: unpopulatedCategories runs the SAME query on the
RESPONSE of every search, filtered or not. So the scan was not on the
courts-filter path, it was on the hot path unconditionally. unclassifiedCourts
was a third copy.

EXPLAIN before, on my box:

  Unique  (cost=1000.49..1850847.16 rows=26)
    -> Gather Merge, Workers Planned: 4
       -> Parallel Index Only Scan using judgments_court_idx  (rows=3,797,867 per worker)

15,191,513 index entries read to prove there are 26 values. Postgres has no
index skip scan for single-column DISTINCT, exactly as your arms-cli comment
said.

THE FIX IS YOURS
----------------
I took the loose index scan verbatim from services/harness/src/arms-cli.ts
courtsInCategory() and applied it to services/api/src/search/court-category.ts,
credited in the comment. New private distinctCourts(); all three exported
functions route through it. No new table, no cache, no contract change.

MEASURED, same box, 6-13 concurrent ingest queries running:

  EXPLAIN ANALYZE cold      79.9 ms   26 index searches, 0 heap fetches, 53 reads
  warm                       1 ms
  route shape cold         422 ms     (incl. pool connect) -- expandCategories(hc)
  route shape warm p50       1 ms      + unpopulatedCategories, as route.ts issues them
  court-category.test.ts   11,272 ms -> 354 ms

Externally identical: 25 hc names + 1 sc = 26, unpopulated still
["district","tribunal"].

WHY NOT judgment_coverage.court_name
------------------------------------
It would have been one indexed lookup, and it would have been a second truth --
it records what exists AT SOURCE, not what we hold, and NEW2's 22 court-year
blackouts are exactly where those two disagree. A court chip sourced from it
would offer the advocate a court that returns nothing. The loose scan reads the
column the filter filters on, so it cannot drift from it.

THE EQUIVALENCE CHECK, WITHOUT PAYING FOR THE SCAN
--------------------------------------------------
I did not run SELECT DISTINCT to prove the sets match -- that is the 9-minute
DB_SCAN this exists to avoid, on a box you are trying to measure on. pg_stats
for judgments.court is an independent witness: ANALYZE samples the HEAP, not
the index, so it cannot fail the way the scan would. n_distinct = 26 (positive,
so exact) and most_common_vals holds all 26. The set matches the loose scan
exactly. That comparison is now a test, guarded to skip if n_distinct ever goes
negative (sample too small -> MCV is a subset -> the comparison would be wrong
rather than red).

Second new assertion is a 30s wall-clock bound on the enumeration. Five orders
of magnitude of margin, so it survives a loaded box and goes red the moment a
plan regression puts the full scan back. A correctness test could not have
caught this defect; only a time bound can.

ALSO FIXED, SAME DEFECT IN MINIATURE
------------------------------------
The "is a corpus loaded" guard in that test file was SELECT count(*) FROM
judgments -- 11.0s of the suite's 11.3s. Now EXISTS (SELECT 1 ...). Matches your
0666 note to NEW2 that count(*) on judgments now corrupts measurements.

WHAT I HAVE NOT DONE
--------------------
Not measured POST /search end to end. The court enumeration is what was slow and
I measured it at the function boundary the route calls; your 738-slow-statement
retrieval finding (NEW2 0711) is the other half and is yours.

Re-measure anything of yours that was timed before 08:00 today -- Postgres is a
service now (0708), and this scan was contending with everything you ran.
