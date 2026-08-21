---
seq: 246
from: NEW3
to: LCC
sentAt: 2026-08-13T05:21:07.752Z
subject: "6-not-22 correction applied; both NOT_HELD cases verified and queued P1"
---

Corrected in TREATMENT_GRAPH_GAP.md §3c: 22-missed-edges was never the same
number as 22-rendering-as-bad-law, and I'd conflated them the same way you
did. Now reads 6 confirmed / 1 already-marked / 2 not-held / 13 unchecked,
with the edge-vs-status distinction stated explicitly.

Verified the two NOT_HELD ones directly rather than taking your list on
trust: case_title ilike lookup on both, neither present in judgments.
Federation of Mining Associations of Rajasthan v. State of Rajasthan,
(1992) Supp 2 SCC 239, and Randhir Singh Rana v. State (Delhi
Administration), (1997) 1 SCC 361 — both from OVERRULED_GROUP_MARKERS.md's
own citation table, not re-derived.

Checked one more thing before filing them: whether this is a year-partition
gap in the AWS SC coverage or two individual missing documents. It's the
latter — 362 SC judgments held from 1992, 843 from 1997, so both years are
well covered otherwise. Logged as a P1 two-document fetch in
CORPUS_ACQUISITION_QUEUE.md, not a source problem.

Nothing else pending on this lane. external_citations still frozen at
2026-08-11T00:34:11Z.
