# INGEST_STOP_DIAGNOSIS_R8_3 — the cause behind §11 N2-2's answer

**Lane:** NEW2 · **26 August 2026**
**The fleet stopped at 19 Aug 19:56 +04, nothing is holding it back, and 18.6 MB of upstream parquet has landed since — 40 of 53 tracked 2026 files have grown.**

**Depends on** `SOURCE_FRESHNESS_DECOMPOSITION_R8_3.md`, which established that
upstream is current and we are not. This says why we are not.

---

## 1. The fleet is not running, and nothing is stopping it

```
node processes matching the ingest fleet          0
services/ingest/.checkpoints/STOP                 ABSENT
.fleet-stop-manifest.json                         stoppedAt 2026-08-16T00:36+04, scopes []
newest fleet checkpoint write                     2026-08-20 03:05
last row written to judgments                     2026-08-19
```

Rows written per day, from `judgments.created_at`:

```
2026-08-17   1,107,452
2026-08-18   9,423,960
2026-08-19     871,488
2026-08-20           0     <- and every day since
```

**This is not a freeze.** The Railway-exit `STOP` file is gone, the stop manifest
is from 16 August with an empty scope list, and no lane has announced a fleet
hold on the bus. The walk stopped and nobody restarted it.

That is the honest answer and it is worth stating plainly, because
`ingest-fleet-operational-traps` and `railway-exit-hold-new2` both warn that a
fleet at zero has two explanations and one of them is on the bus. **I checked the
bus first.** This one is not there.

---

## 2. The 2026 scopes WERE in the plan — the walk reached them and then stopped

A reasonable competing theory was that the year-scope plan never named 2026, in
the shape of `the-fleet-court-list-omits-courts`. It did name it:

```
distinct 2026 parquet keys in the checkpoints    53
2026 scope entries across all checkpoint files   64
sum of 2026 offsets already walked          919,951 rows
last touched                    2026-08-19 19:02–19:56 +04
```

Local 2026 holdings are 797,812 documents, which is consistent with 919,951
parquet rows walked once dedup and failures are taken out. **So the plan is
right, the walk worked, and it simply is not running.**

---

## 3. How much is waiting, measured rather than estimated

Every 2026 parquet file the checkpoints track, HEADed against the bucket today
and compared with the size recorded at our last read:

```
checked          53
GROWN            40
unchanged        13
missing           0
bytes added  18,626,352
```

Top of the list, with the publisher's own `Last-Modified`:

| scope | recorded at our last walk | now | added | upstream wrote |
| --- | ---: | ---: | ---: | --- |
| `court=27_1` | 77,215 | 1,908,178 | 1,830,963 | 26 Aug 08:37 |
| `court=27_1` (2nd bench) | 1,238,500 | 2,954,149 | 1,715,649 | 26 Aug 08:37 |
| `court=29_3` | 15,078,366 | 16,436,103 | 1,357,737 | 26 Aug 09:04 |
| `court=19_16` | 13,761,059 | 15,061,102 | 1,300,043 | 26 Aug 12:11 |
| `court=22_18` | 14,065,426 | 15,307,200 | 1,241,774 | 25 Aug 14:11 |
| `court=7_26` | 12,361,427 | 13,587,668 | 1,226,241 | 25 Aug 14:52 |
| `court=3_22` | 33,127,959 | 34,149,418 | 1,021,459 | 26 Aug 11:28 |

**Every top grower was written by the publisher yesterday or today.** The
checkpoint offsets are the frontier — `the-cursor-is-the-frontier` — and the
frontier has not moved in seven days while the source kept writing.

---

## 4. Why the per-court stop dates looked ragged, and what that was really

`SOURCE_FRESHNESS_DECOMPOSITION_R8_3.md` §5 reported that Allahabad and Bombay
fell off in JULY while Madras and Punjab & Haryana held into AUGUST, and read
that as a walk running out per scope.

**With the stop date known, the simpler reading is better.** All scopes stopped
at the same wall-clock moment on 19 August. What differs is how far each scope
had got through its own 2026 partition when the music stopped — a court whose
walk was near the end of its file holds August; one that was mid-file does not.
The raggedness is about position in the walk, not about different stop events.

I am recording the correction against my own §5 rather than leaving the earlier
reading to stand.

---

## 5. What a restart would need, and why this lane is not doing it now

**Not doing it is a scope decision, not a blocker.** §11 N2-10 puts broad ingest
after the limited freeze, and restarting the High Court fleet is exactly that
shape of work: it is the single largest consumer of the shared box, and LCC's
release proof has first call on it under §4 Phase B.

What a restart needs, so that whoever authorises it is not starting from zero:

1. **Regenerate the year-scope plan; never hand-add a scope.**
   `fleet-work-is-derived-not-typed` — a typed line silently omits courts.
2. **Do not rewind checkpoints.** The offsets are correct and 919,951 rows of
   2026 are already walked. The file sizes moved, not the offsets' meaning.
3. **Scale by measured docs/hour, not to 38 workers.** Six `0xC000013A` deaths in
   this programme were console signals, not memory pressure
   (`postgres-deaths-are-console-signals-not-oom`), and the width cut that
   followed was built on the wrong theory.
4. **Restart on silence, not on exit** — `stall-watchdog-restarts-on-silence`. A
   postgres.js promise that never settles looks perfect forever.
5. **Verify by offset delta per scope**, never by process count or log growth.
   `a-loud-hang-beats-a-silent-one`: the commonest hang makes the log grow faster.

---

## 6. State

| item | state |
| --- | --- |
| fleet at zero workers since 2026-08-19 | **`PROVEN`** — process table, checkpoints and row counts agree |
| nothing is holding it (no STOP, nothing on the bus) | **`PROVEN`** |
| 2026 was in the scope plan and was being walked | **`PROVEN`** — 53 keys, 919,951 rows |
| 40 of 53 upstream files grown, 18,626,352 bytes waiting | **`PROVEN`** — HEAD against the bucket today |
| ragged per-court stop dates = position in the walk | **`CORRECTED`** from my own earlier reading |
| why the fleet exited on 19 Aug | **`NOT_MEASURED`** — no crash artifact examined; the box also rebooted at 01:32Z on 26 Aug, which is a different event |
| restart | **`NOT_DONE`** — post-freeze scope per §11 N2-10, and the box is LCC's first |
