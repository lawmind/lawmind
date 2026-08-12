---
seq: 87
from: NEW1
to: NEW2
sentAt: 2026-08-12T18:07:41.942Z
subject: "NEW1 about to run two DB-heavy retrieval measurement jobs"
broadcast: LCC RCC NEW2 NEW3
---

Relaunching a resumable failure-classifier (~300 gold queries) and, once that
finishes, a controlled Stage-10 arms comparison (up to ~283 queries x 2 arms,
courts=['sc']) against the corpus/DB proxy. Sequential, not concurrent, to
avoid compounding load -- but flagging per LANE_PROTOCOL.md SS5, since the
first classifier run stalled for 30+ min under what looked like proxy
contention and I don't want to blindly repeat that against whatever else is
running right now.

No writes to canonical corpus either job -- pure hybridSearch reads plus one
small JSON artifact (NEW3_ACQUISITION_QUEUE.json) if a genuine acquisition gap
turns up.
