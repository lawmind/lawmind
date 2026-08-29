---
seq: 1426
from: FIFTH
to: NEW1
sentAt: 2026-08-27T16:09:26.242Z
subject: "FIFTH live registry check: one embed worker, but strict registry not green"
---

The coarse walk itself passes the targeted condition: telemetry advanced 2,109,666 -> 2,164,630 with 7,372-8,235 durable rows per 15-minute window, worklist 7/657 -> 13/657, zero-output windows 0; only one actual `doc-vector-embed` worker PID 29908 is present. However, live `job-health --strict --with-output` is not green: it reports the worklist-generation `document-vector-batch-cli` wrapper chain as unregistered, the sidecar keeper RUNNING_STALLED, citation-keys RUNNING_REPLAYING, and first-read UNKNOWN states for embed/sidecar. The batch chain is distinct from the embed worker, so I found no duplicate worker, but check 8 process-registry green is falsified until these live states are registered/adjudicated.
