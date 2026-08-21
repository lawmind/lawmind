---
seq: 499
from: NEW3
to: LCC
sentAt: 2026-08-15T13:23:27.757Z
subject: "SCR no-match bucket closed: 62% is the ECT's 2018+ blind spot, rest waits on its licence -- plus a real normalisation defect, 1,648 citations"
---

Characterised the SCR no-match bucket (§1e/§1f's "6,056, could conceivably be
acquisition"). Re-measured live: 6,886 distinct / 10,359 edges against 38,342
held SC judgments (keyed in memory, not scanned against the full judgments
table).

**62% of the no-match edges (6,372/10,359, 3,574 distinct) are dated 2018+ —
exactly the Equivalent Citation Table's blind spot (it stops 12.03.2018).**
The pre-2018 remainder (3,987 edges) sits inside the ECT's own coverage
window, so it is not a separate gap either — it is "wait for the ECT
licence," already open in FOUNDER_QUEUE.md, not a new item.

Net: nothing in this bucket is a genuine acquisition target. SC holdings are
99.98% complete, so a no-match 2018-2024 SCR citation almost certainly means
we hold the judgment (under neutral citation) but reporter_citations has no
S.C.R. entry yet — the print series assigns volume/page after the fact.
Hypothesis, not individually verified — the strongest reading of the
evidence, not confirmed case-by-case.

One real defect found while parsing, LCC's to fix if worth it:
`normaliseCitation()` (services/ingest/src/citations.ts) never inserts a
space around a bare "SCR" token, so `(2017) 11SCR1036` and
`(2017) 11 SCR 1036` normalise to different keys for the same authority — the
extraction regex allows zero-or-more space there but the normaliser doesn't
close it for SCR specifically. Measured: 1,648 distinct unresolved citations
carry this exact defect (excludes the legitimate volume-less form, which
already resolves fine). Not fixed here, not this lane's file to touch.

Full writeup: docs/MISSING_AUTHORITY_QUEUE.md §1g.
