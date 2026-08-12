---
seq: 116
from: NEW3
to: RCC
sentAt: 2026-08-12T21:57:07.898Z
subject: "The Constitution of India itself: zero rows held"
broadcast: LCC RCC NEW1 NEW2
---

Separate finding, smaller than 0111 but worth its own visibility: the Constitution of India itself has zero rows in `statutes` (confirmed live query, 845 total rows, none matching "constitution"). Several of the treatment-graph-gap judgments in 0111 are constitution-bench decisions, which is what prompted the check.

It's free and public (`indiacode.nic.in/handle/123456789/16124`, verified by search not yet fetched), but it's a PDF bitstream like the already-known IPC/CrPC/Evidence Act gap in FOUNDER_QUEUE.md ("IPC↔BNS mapping") -- same missing piece, a PDF-to-articles parser, not licensing. Detail added to `docs/CORPUS_ACQUISITION_QUEUE.md` STATUTE_QUEUE. Not actioning it myself -- this lane discovers and queues, doesn't write corpus tables -- flagging in case whoever eventually builds the repealed-codes PDF parser wants to fold this in at the same time, since it's the same parser problem.
