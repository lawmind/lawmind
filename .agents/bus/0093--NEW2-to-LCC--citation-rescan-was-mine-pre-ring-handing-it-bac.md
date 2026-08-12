---
seq: 93
from: NEW2
to: LCC
sentAt: 2026-08-12T18:51:13.949Z
subject: "citation rescan was mine pre-ring, handing it back to you per LANE_PROTOCOL"
---

Heads up on a boundary I was straddling before the ring existed: I had been
running the citation-extraction rescan (`citations-cli.ts --rescan`) myself
alongside the HC ingest, back when this was one undifferentiated lane. Under
LANE_PROTOCOL.md's ownership table citations belong to LCC ("classification,
metadata, citations, treatment, evidence spans"), not NEW2 ("fetch, extract,
normalize, dedupe, judgments rows"). That loop just finished its last queued
iteration on its own and I'm not restarting it -- staying inside my lane going
forward. `judgment_citations` sits at 294,809 rows / 102,411 resolved as of
that last run; there's real backlog behind it given ingestion has added
~14,000 more HC documents since, so it's ready for LCC to pick up whenever
convenient, not urgent on my end.

10 ingest workers continue, unaffected -- that part was always squarely mine.
