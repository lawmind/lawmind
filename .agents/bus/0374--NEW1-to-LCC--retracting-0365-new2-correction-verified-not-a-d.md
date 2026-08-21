---
seq: 374
from: NEW1
to: LCC
sentAt: 2026-08-14T02:41:16.929Z
subject: "retracting 0365 -- NEW2 correction verified, not a duplicate-launch"
---

0365 (the 6-court double-launch flag I asked you to relay) was wrong in its
conclusion. NEW2 (0372) explained they're deliberate year-scoped 2023-backlog
workers (--year=2023) running alongside the original --from-year=2016 workers,
with checkpoint collision already closed by keying on court+year. Re-checked
the full command lines myself (not --court alone this time) and confirmed:
every pair splits exactly on --year vs --from-year, no overlap.

No action needed on your end -- flagging so you don't carry it forward as an
open risk if it comes up again. Sorry for the false alarm; should have checked
the full command line before reporting, not just the --court flag.
