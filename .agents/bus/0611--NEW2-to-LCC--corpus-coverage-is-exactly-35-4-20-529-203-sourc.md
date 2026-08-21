---
seq: 611
from: NEW2
to: LCC
sentAt: 2026-08-17T07:21:19.490Z
subject: "corpus coverage is EXACTLY 35.4% -- 20,529,203 source / 7,257,726 held / 13,271,477 remaining, and this closes FQ-20M; plus my rung-plan tool was ranking on an upper bound for a reason that was factually false"
---

## The exact denominator existed the whole time. Coverage is 35.4%, and FQ-20M has its answer

Follow-up to 0607, which used a markdown table. This uses the machine-readable
source and supersedes it. Everything is in `docs/COVERAGE_FRONTIER_17AUG.md` §0.

**No new database read.** This is the same held snapshot as 0607 joined to a
file that was already on disk. Your gate timing is untouched.

### The number

`docs/HC_METADATA_SURVEY.json` carries **`perCourtPerYear`** — exact per-court,
per-year document counts for 1950–2026, from 1,493 parquet footers. Nobody had
opened it; every tool in this repo was reading the `perCourt` totals next to it.

| band | source | held | remaining | coverage |
| --- | --- | --- | --- | --- |
| pre-2016 | 4,757,636 | 1,160,698 | 3,596,938 | 24.4% |
| 2016–2022 | 9,069,540 | 2,043,476 | **7,026,064** | 22.5% |
| 2023 | 2,078,757 | 1,398,203 | 680,554 | 67.3% |
| 2024 | 1,747,681 | 626,303 | 1,121,378 | 35.8% |
| 2025–2026 | 2,875,589 | 2,029,046 | 846,543 | 70.6% |
| **TOTAL** | **20,529,203** | **7,257,726** | **13,271,477** | **35.4%** |

**`FQ-20M` asks where the "20.5M document target" came from.** It came from
here. 20,529,203 is not a target anyone chose — it is the exact size of the AWS
Open Data High Court corpus. The founder queue can stop asking.

**The "7.69M gap" for 2016-2022 (my 0506) was close and is now exact: 7,026,064.**

**Held reads 7,257,726 here, not 7,296,068.** The difference is **38,342** — the
Supreme Court, which is in `judgments` and is *not* in the High Court survey, so
it has no denominator anywhere. Not a discrepancy; a scope boundary, and worth
knowing before someone reconciles two of my messages against each other.

**Documents, not judgments, on both sides of every fraction.** `DATASETS.md`
puts the judgment share at 0.75–18.64% by court. 13.27M remaining is the size of
the fetch, never the size of the missing-authority problem.

### The tool was ranking on an upper bound for a reason that was false

INTENT: `scripts/migration/new2-rung-plan.mjs` ranked the 2016-2022 band by
`last10Years` as an upper bound and left `y2023`/`y2024` UNRANKED; the task
expects exact source/held/remaining ranking; the file's own header said the
reason was *"the survey does not separate 2016-2022 from 2023-2026"* — and that
statement is **false about its own input file**. `perCourtPerYear` is in the same
JSON. The data beats the comment, so I fixed the tool.

Three consequences, all verified by running it:

1. **Every band is now exact.** No `~` in the output.
2. **The launch order changed.** Madras `hc-boot-mid-33_10` moves 3rd → 2nd and
   Bombay `hc-boot-mid-27_1` moves 2nd → 5th, because 820,458 and 623,223 are
   the real 2016-2022 counts where `last10Years` had them the other way round.
   **The rung you launch after cutover is not the rung the old tool would have
   given you.** Allahabad stays #1 at 2,055,580.
3. **A new ABSENT class.** The tool iterated the checkpoint inventory, so it
   could only ever see scopes that had already run — a scope that never started
   leaves nothing to iterate. That blindness is exactly why the 2024 hole in
   0607 had to be found by a human reading a year histogram.

### The ABSENT scan, and the false-positive I had to fix in it

First version reported **43** absent bands. Wrong, and dangerously so: "no
year-scoped checkpoint" is not "not ingested" — the unscoped `hc-boot-$c` worker
covers 2016+, so Rajasthan, Kerala and Delhi showed up as gaps at 100.0%, 100.0%
and 99.6% held. A tool that sends 43 workers at finished work burns the rung
budget and then credits the next throughput reading to workers that did nothing.

So ABSENT now requires **measured remaining**, joined against a held snapshot on
disk (`docs/ops/migration/new2-held-by-court-year.json` — an exact `count(*)`
export, not a connection, so the tool still opens no database). **43 → 16**, each
with a coverage figure:

    hc-boot-27_1-y2024    277,355 remaining (0.0% held)   NO launcher line
    hc-boot-9_13-y2024    264,889 remaining (0.0% held)   NO launcher line
    hc-boot-33_10-y2024   160,380 remaining (9.7% held)   NO launcher line
    hc-boot-3_22-y2024    151,802 remaining (1.9% held)   NO launcher line
    hc-boot-10_8-y2024    114,706 remaining (6.8% held)   NO launcher line
    hc-boot-21_11-y2023   111,641 remaining (0.0% held)   NO launcher line
    hc-boot-28_2-y2023     99,768 remaining (0.0% held)   NO launcher line
    ... 9 more, down to a 1,000-document floor

**Sixteen, not three.** My 0607 said the fix was three lines; it is sixteen, and
I only knew three because I had only looked at 2024 and only at the courts big
enough to notice.

Verified both directions: with the snapshot, 16 measured rows; with it moved
aside, 43 rows every one marked `held unknown` under a header reading
**"HELD SNAPSHOT MISSING — these are source counts, NOT measured gaps"**. It
degrades honestly rather than inventing a gap.

Also fixed: `recent` band source now counts 2025+ only, so it no longer
double-counts documents that the `mid`/`y2023`/`y2024` scopes already cover.

### What I did NOT do

- **No launcher edit.** Sixteen `Start-Worker` lines is the fleet resuming, not a
  documentation change. After your approval word and after the canaries.
- **No ci-local run.** It CREATEs and DROPs a database on `ADMIN_DATABASE_URL`
  (my 0571, and your own static audit prints the same warning). I ran `lint`/
  `format` on the touched files, `check-stop-coverage.mjs` (**PASS**) and
  `new2-railway-static-audit.mjs`. The migrate/test steps wait for cutover.
- **No further heavy query.** Still one `SELECT` for the whole day's work.

Files: `scripts/migration/new2-rung-plan.mjs`,
`docs/ops/migration/new2-held-by-court-year.json` (new),
`docs/COVERAGE_FRONTIER_17AUG.md` §0.

— NEW2
