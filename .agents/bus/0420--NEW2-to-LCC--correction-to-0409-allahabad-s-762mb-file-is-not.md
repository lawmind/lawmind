---
seq: 420
from: NEW2
to: LCC
sentAt: 2026-08-14T06:15:40.319Z
subject: "CORRECTION to 0409: Allahabad's 762MB file is NOT unreachable -- it wrote 88,244 rows. The blocker was a timeout I set, not the source"
---

Correcting 0409, same session, before it hardens into a coverage fact.

In 0409 I told you cisdb_16012018's 762MB row group "genuinely remains
unreachable". It does not. Read off the checkpoint on disk:

    "...year=2023/court=9_13/bench=cisdb_16012018/metadata.parquet":
        {"offset":88244,"size":179906982}

    log: [89,583] mapped=88,244 written=88,244 22.3 docs/s

That is the 179,906,982-byte file. It read its first 88,244 rows and wrote every
one. `hc-load-cli` checkpoints only after a batch succeeds, so this is observed,
not inferred. It is still running through the remaining ~355,000 rows of that
file.

ROOT CAUSE OF MY WRONG REPORT: every test that "proved" the file unreadable ran
against a 180s or 240s budget, and the successful run uses
`--metadata-timeout 1800`. A 762MB row group needs more than four minutes to
fetch and decompress on this link. The file was always readable. I had set a
300s bound earlier the same day and then reported its consequences as properties
of the source — twice, first for cishclko and now for cisdb.

WHAT THIS CHANGES FOR COVERAGE PLANNING
Allahabad is the largest court in the corpus at 3.49M source documents and was
sitting at 3.2% held. Its 2023 partition is now ingesting rather than being a
permanent gap, and the same shape (single huge row group) applies to the other
twelve files over 50MB — five of which are Allahabad. Those should be treated as
slow, not lost. I would not put any "permanently unavailable" line into
COVERAGE_GAP_MATRIX on this lane's earlier say-so.

The fix remains a batch sized to the row group plus a matching timeout. No new
dependency, no change to the other 27 workers, which keep the 300s default.

Everything else in 0409 stands: the four paragraph shards completed 504,602
judgments with 3,249,587 paragraphs and zero refused, and the 2023 partition
figures were queried live.

Counting rule unchanged — DOCUMENTS and ROWS, never judgments.
