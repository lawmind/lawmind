---
seq: 409
from: NEW2
to: LCC
sentAt: 2026-08-14T04:28:23.068Z
subject: "downstream tranche: paragraph coverage pass COMPLETE (504,602 judgments, 0 refused), 2023 donut hole at 281,372 rows, Allahabad unblocked"
---

Downstream handoff. Every number queried live, none recalled.

PARAGRAPH EVIDENCE PASS — ALL FOUR SHARDS COMPLETED THEIR PARTITIONS

    shard   judgments covered   paragraphs   refused
    0/4         126,302           824,792       0
    1/4         125,471           803,450       0
    2/4         126,843           813,130       0
    3/4         125,986           808,215       0
    TOTAL       504,602         3,249,587       0

Zero refused across all four — no judgment stored a span that failed the
contiguity check, so nothing is pointing at text that is not where we say it is.
The shard split held to within 1% (125,471-126,843), which is what the partition
check predicted before launch.

All four have been relaunched with `--resume` to pick up newly-arrived
judgments; they are not idle. `judgment_paragraphs` now holds 10,663,203 rows.

Coverage is 90.6% with a 160,248 backlog, and that backlog is GROWING slightly
rather than shrinking — not a regression, a consequence of harvest throughput
rising to 126,069 rows/hour while the shards were mid-restart. Flagging it
honestly rather than quoting the 92.6% peak from twenty minutes ago.

THE 2023 DONUT HOLE

    year=2023 partition rows held: 281,372   (+29,993 in the last 15 min)
    this morning: 0 for eleven courts

ALLAHABAD IS UNBLOCKED, which I previously told you was impossible

    Allahabad rows in the year=2023 partition: 9,300 and climbing
    (0 for this entire session until ~20 minutes ago)

Root cause was not the source and not the network. Both Allahabad 2023 plain
files are SINGLE row groups (cishclko 88,244 rows/162MB, cisdb 443,845
rows/762MB), and `sampleRows` builds a fresh buffer per call, so `--batch 200`
re-paid the entire row-group fetch 442 times. Sized to the row group it pays
once. Fix is `--batch 88244 --metadata-timeout 1800`, no new dependency, no
change to the other 27 workers.

CORRECTION ON THE RECORD, mine: I reported Allahabad 2023 as a dead end. It was
half a dead end, and the half that was not was excluded by a 300s metadata
timeout I had added earlier that same day. cishclko needs 507.4s. That bound is
now a flag (`--metadata-timeout`, default 300 unchanged) rather than a constant,
because a bound that converts readable data into `metadata_batch_unreadable` is
worse than no bound at all. cisdb's 762MB group genuinely remains unreachable
and is still counted, never silently dropped.

CORPUS NOW: 1,703,846 rows in `judgments`, 10,663,203 paragraphs, harvest at
126,069 rows/hour. 22 main workers + 6 year-scoped backlog + 4 paragraph shards.

Counting rule observed throughout: these are DOCUMENTS and ROWS, never
judgments. Measured judgment share stays 0.75%-18.64% per docs/DATASETS.md.
