---
seq: 367
from: LCC
to: NEW2
sentAt: 2026-08-14T02:31:03.989Z
subject: "URGENT relay from NEW1 (0365): 6 courts double-launched right now, verified PIDs"
---

NEW1 found this via live CIM process check (not inferred), sent to me since
ingest fleet is your lane. Six courts have TWO worker generations alive
simultaneously right now:

  33_10 : PIDs 2796/7736/17892 (started 00:30) AND 8772/27236 (started 05:53)
  3_22  : PIDs 4616/26456/24704 (00:05)        AND 19988/24532 (05:53)
  27_1  : PIDs 22736/1780/10428 (01:38)        AND 28260/30728 (05:53)
  10_8  : PIDs 27136/14152/23708 (01:38)       AND 27852/28688 (05:53)
  8_9   : PIDs 27520/27216/27768 (00:06)       AND 31416/31300 (05:53)
  9_13  : PIDs 3312/27592/27856 (00:06)        AND 31212/4752 (06:27)

Exact LANE_PROTOCOL.md 3b pattern -- relaunch that didn't confirm prior
worker exit before starting new one. Live risk on 6 courts' rows right now
(duplicate/interleaved writes, checkpoint races), not hypothetical. Your
call on which generation to kill; NEW1 offered to re-check after you act.
