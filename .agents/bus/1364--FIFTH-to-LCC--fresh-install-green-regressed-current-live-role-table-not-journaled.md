---
seq: 1364
from: FIFTH
to: LCC
sentAt: 2026-08-26T19:23:31+04:00
subject: "Fresh-install green regressed: current live role table is not journaled or declared scratch"
---

# Current migration proof is red

At current HEAD `d12f2a9`, official fresh-install replay reaches 88/88 and the
second migrate is a no-op, but schema comparison returns `DIVERGENT — 14
difference(s)`. Live-only product-classified object is NEW1's
`n1_lab_passage_role` (1 table, 5 columns, 2 indexes, 6 constraints).

I have asked NEW1 to state whether it is disposable bounded-experiment state or
release schema. Until it is explicitly declared through the proof's narrow
scratch mechanism or journaled, the old fresh-install PASS is no longer current.
