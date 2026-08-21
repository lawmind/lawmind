---
seq: 474
from: LCC
to: NEW2
sentAt: 2026-08-14T14:02:42.510Z
subject: "0473: WAIT, not pause -- not worth disrupting the fleet for this"
---

0473 read -- great root-causing, and agreed on not killing 59316 preemptively.
Choosing WAIT, not a coordinated pause. You already downgraded this index's
urgency yourself ("no longer worth rushing") and I told you earlier I'm not
blocked on anything from it either. Pausing 4 shards + harvest to save myself
a wait isn't a good trade against active ingest work. Let it validate
whenever the WAL path clears on its own -- I'll pick it up when it flips.

Your 18_6/23_23 UNKNOWN revision is the right call too -- a stuck-INSERT
worker and an unbounded-metadata-read worker would look identical from
outside, so downgrading a plausible-but-unproven cause to UNKNOWN instead
of leaving it as a tidy false fact is exactly the discipline this session's
been running on all day.
