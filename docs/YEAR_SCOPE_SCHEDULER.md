# THE YEAR-SCOPE SCHEDULER — work is derived from `source - held`, not typed

**Owner: NEW2 (ingestion lane).** Built 17 August 2026, during the pre-cutover
hold. **Nothing was started: 0 fleet processes, `services/ingest/.checkpoints/STOP`
still present, every verification below is a dry run.**

---

## 1. The defect was never the seven missing names

`start-ingest-fleet.ps1` carried a hand-written rescue block written on 14 August:

    # -- year-scoped 2023 catch-up ---
    hc-boot-33_10-y2023  hc-boot-8_9-y2023   hc-boot-9_13-y2023
    hc-boot-3_22-y2023   hc-boot-10_8-y2023  hc-boot-27_1-y2023
    # -- year-scoped 2024, same orphan story, one scope ---
    hc-boot-14_25-y2024

Six courts got a 2023 rescue. **Exactly one got a 2024 one, and it was Manipur** —
18,745 documents — while Allahabad, Bombay and Telangana, the three largest
holdings in the corpus, held **zero** 2024 documents against 264,889 / 277,355 /
38,931 at source. Nothing recomputed the list. The hole was found on 17 August by
a person reading a year histogram, three days after it opened.

Adding the three missing lines would have closed *that* hole. **Every year
rollover re-creates it** for whichever courts the newest-first descent has not
reached, and a typed list cannot roll over. The defect is that a name had to be
typed at all.

## 2. The mechanism, once

`hc-load-cli.ts` sorts its scope newest-year-first — its own header gives the
reason, neutral citations live in 2023+. An unscoped `--from-year 2016` worker on
a 3.5M-document court is therefore still inside the newest year months later, and
every older year inside its range is served by nothing. **Range workers do not fix
this; they reproduce it inside their own range.** Only a worker pinned to one year
guarantees that year is read, which is why its checkpoint is keyed
`<court>-y<year>.json`.

## 3. What replaced it

`scripts/migration/new2-yearscope-plan.mjs` — opens no database connection, reads
three files, writes `docs/ops/migration/new2-yearscope-plan.json`.

| input | file | unit |
| --- | --- | --- |
| source | `docs/HC_METADATA_SURVEY.json` → `perCourtPerYear` | **documents** (exact parquet footers) |
| held | `docs/ops/migration/new2-held-by-court-year.json` | **judgment rows** (exact `count(*)`, never `reltuples`) |
| band ceiling | parsed `-ToYear` from the launcher | — |

**Nothing in it is a literal.** The band ceiling is the highest `--to-year` any
standing launcher band bounds itself with (2022 today), parsed rather than copied,
and the tool **refuses** if it cannot be parsed. `RECENT_FROM = currentYear - 1`
splits what lies above it:

    BACKLOG   ceiling+1 .. currentYear-2    nothing serves these.  Today 2023-2024.
    RECENT    currentYear-1 ..              the descent is inside these. Today 2025+.

Next January, 2025 becomes backlog by itself, with nobody noticing anything.

### Priority, as the founder ordered it

| tier | meaning | scopes | remaining |
| --- | --- | ---: | ---: |
| 0 | backlog year, never ran, **zero held** | 6 | 872,686 |
| 1 | backlog year, never ran | 9 | 637,979 |
| 2 | backlog year, ran before, still short | 4 | 289,103 |
| 3 | 2016-2022 | 17 | 7,026,045 |
| 4 | pre-2016 | 17 | 3,596,053 |
| 5 | recent (2025+) | 12 | 844,514 |

65 candidate scopes. The launcher starts **tiers 0-2 (19 workers)** at boot, up
from the seven typed names, and `-PlanTiers` widens that without editing the file.
Tiers 3-5 are a rung decision, not a boot decision — those courts do have a worker
whose range includes them — so the plan ranks them and `-Only` launches them when
the scale ladder says so.

### Two guards, both heuristics, both stated as such

`source` counts DOCUMENTS and `held` counts JUDGMENT ROWS. **Different units.** A
document that yields no row still counts at source, so `remaining` never reaches
zero on a fully-read court and a scheduler checking only `remaining > 0` would
relaunch finished scopes forever.

- `--min-remaining 1000` — a year-scoped worker is not free.
- `--max-held-pct 0.97` — at or above this the scope is FINISHED. Calibrated
  against the seven courts measured at 97.6-100% with tens of documents
  outstanding, not thousands.

**`remaining` is the size of the FETCH, not the size of the authority gap.**

## 4. The plan can lose work, so every exclusion is listed

This plan now drives the launcher, so a scope missing from it is a worker that
stops being started. Three scopes the old block launched every boot are absent
from the first generated plan:

| scope | remaining | of source | held |
| --- | ---: | ---: | ---: |
| `hc-boot-3_22-y2023` | 158 | 149,388 | 99.9% |
| `hc-boot-10_8-y2023` | 27 | 135,913 | 100.0% |
| `hc-boot-8_9-y2023` | 14 | 119,187 | 100.0% |

All three are genuinely finished. **But "correct" had to be checkable.** A count
told you three vanished; it did not tell you which or why. `excludedFinished` and
`excludedBelowMinRemaining` carry every dropped scope with its numbers, and the
console prints a `DROPPED BUT RAN BEFORE` section.

## 5. What the cross-check found beyond the 16

`new2-rung-plan.mjs` measured 16 year-scoped bands that never ran. Cross-checking
the full plan against the names the launcher can actually start found the problem
is **not confined to year scopes**:

    scopes with measured work and NO launcher line:  47 of 65
    remaining documents behind them:                 5,295,135

The largest slice is the 2016-2022 band — **11 courts, 2,244,160 documents, no
`hc-boot-mid-` line**, against a hand list covering 6 of the 17 courts with work
there. Four of them (`21_11`, `29_3`, `22_18`, `19_16`) hold **0.0%** of that band
while having an unscoped worker whose range includes it, which is the starvation
mechanism measured directly rather than argued. Nine pre-2016 courts are in the
same position, 695,796 documents.

Those are reachable today via `-PlanTiers '3,4'` and remain a rung decision.

## 6. Companion fixes, so two tools cannot disagree in print

- `new2-rung-plan.mjs` now reads the plan when deciding what the launcher can
  start. Without it, nineteen live scopes read as `ORPHANED` — its loudest verdict
  — and it would have been wrong about all nineteen. The tier default is parsed
  from the launcher's `param()` block, not copied.
- Three scopes with large stored offsets (149,388 / 135,913 / 63,646) were being
  reported as data about to be lost. They hold 158, 27 and 14 remaining documents.
  That is **completion, not loss**, and the offset alone cannot tell them apart —
  a finished scope has the largest offset of all. The exclusion reason is now read
  out of the plan. `orphanedCount` went 3 → **0**.
- The absent-scan defers to the scheduler's `maxHeldPct`, so
  `hc-boot-36_29-y2023` (1,075 remaining, 98.4% held) stopped being printed as a
  launcher defect.
- `start-ingest-fleet.ps1` gained a **second** duplicate guard. The existing one
  is a CIM snapshot taken before anything launches, so it cannot see a process
  this run started ninety milliseconds ago — and since two sources can now name
  the same scope in one invocation, two supervisors could have shared one
  checkpoint file, which `saveCheckpoint` rewrites whole.
- `-DryRun` prints every worker's exact argv and starts nothing. It returns
  **before** the log rotation, not after: the first version returned where
  `Start-Process` is and would have renamed logs during a preview.
- `-Only` composed with `-PlanTiers` silently. `-Only "hc-boot-mid-21_11"` alone
  started nothing and reported `started 0` — a 441,673-document scope excluded by
  a parameter the caller never passed. A requested name inside the plan but
  outside the tier filter is now called out by name with the flag that includes it.

## 7. Verification

Every check below is a dry run. **No worker was started.**

    powershell -File scripts\start-ingest-fleet.ps1 -DryRun
      -> 55 workers, 19 of them plan-derived, all argv printed
    powershell -File scripts\start-ingest-fleet.ps1 -DryRun -PlanTiers '3,4' -Only "hc-boot-mid-21_11,hc-boot-hist-24_17"
      -> --from-year 2016 --to-year 2022 / --from-year 1950 --to-year 2015, correct checkpoint keys
    node scripts\migration\new2-yearscope-plan.mjs        -> 65 candidates
    node scripts\migration\new2-rung-plan.mjs --workers 3 -> orphanedCount 0
    node scripts\check-stop-coverage.mjs                  -> PASS

Fleet processes after all of it: **0**. STOP: **present**.

## 8. What is not established

- **`remaining` is a floor.** The source snapshot is 11 Aug and the held snapshot
  is 17 Aug, so every gap is understated.
- **The `0.97` finished threshold is a heuristic**, not a measurement of when a
  court is done. It is calibrated on seven courts and will be wrong for a court
  whose document-to-judgment yield is unusually low.
- **Supreme Court of India cannot be scheduled at all.** 38,342 rows held and no
  source count exists for it, so it appears in `heldWithNoSource` and in no tier.
  It is the court that binds every other one. A target without a denominator is a
  wish, and this tool refuses to invent one.
- **`remaining` counts metadata rows, and some of those PDFs do not exist.**
  Found by running it, 17 Aug: `hc-boot-23_23-y2024` was ranked at **15,890
  remaining** and finished with **15,869 `pdf_missing`** — the metadata is in the
  parquet, the documents are not in the bucket. The genuinely recoverable
  population was about **21**. Every other scope measured is in the single digits
  to low thousands of `pdf_missing` against hundreds of thousands held, so this is
  a per-scope property rather than a corpus-wide correction.

  **`maxHeldPct` does not catch it** — 23_23's held share is 43.6%, nowhere near
  the 0.97 gate — so the next regeneration will rank it at ~15,890 again, the
  launcher will start it again, and it will re-scan and re-404 fifteen thousand
  times. That is the same waste loop `maxHeldPct` exists to prevent, arriving
  through a door it does not watch.

  **The fix is to feed observed `pdf_missing` back into the plan**, so a scope
  whose remaining population is known-unfetchable stops being scheduled. Not built:
  it needs `pdf_missing` persisted somewhere more durable than a log tail, and that
  is a design question rather than a patch. Recorded here rather than left for
  someone to rediscover from a puzzling worker that finishes in minutes.
