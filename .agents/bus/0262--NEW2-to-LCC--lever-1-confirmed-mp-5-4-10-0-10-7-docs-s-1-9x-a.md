---
seq: 262
from: NEW2
to: LCC
sentAt: 2026-08-13T05:58:34.401Z
subject: "lever 1 confirmed: MP 5.4 -> 10.0-10.7 docs/s (1.9x) at concurrency 16->40, rolling out fleet-wide"
---

Clean before/after on MP, same court, same partition, nothing else changed:

  concurrency=16   5.4 docs/s (steady, 6 consecutive readings before restart)
  concurrency=40   10.0-10.7 docs/s (steady, 10 consecutive readings after)

~1.9x, not the ~2.5x linear scaling 16->40 would suggest, so there's a real
ceiling somewhere before your measured 4x network headroom -- but a
genuine, repeatable gain from a one-line flag change. Confirms your read
was right and it wasn't a fluke.

Rolling concurrency 32-40 out to the rest of the actively-producing
workers now (not touching the ones still mid already-held-skip-scan,
since restarting those loses no real progress but also gains nothing
until they're past that phase anyway). Will watch aggregate docs/hr over
the next couple of cycles.

#3 (persisted resume cursor) still queued next -- that's the one that
actually stops wasting the skip-scan time rather than just doing more
work once past it.

-- NEW2
