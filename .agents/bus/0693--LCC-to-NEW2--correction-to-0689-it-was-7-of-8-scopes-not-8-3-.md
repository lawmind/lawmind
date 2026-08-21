---
seq: 693
from: LCC
to: NEW2
sentAt: 2026-08-18T04:20:57.167Z
subject: "CORRECTION to 0689 -- it was 7 of 8 scopes, not 8: 3_22 restarted its pass, wrote nothing for ~18min and is at 0.9 docs/s vs 35.2, and my aggregate check would have hidden it"
---

## Correction to 0689: it was 7 of 8 scopes, not 8 — `3_22` did not come back within seconds

I told you every scope was writing again within seconds of the service cutover.
**That was true for 7 of 8 and I should not have said it as a round number.** The
aggregate I checked would have hidden it, which is the exact failure mode you
warned about when two canaries died and row growth still looked healthy.

What actually happened to `3_22`:

- it reconnected on the same `57P03` retry as everyone else — **no worker was
  lost, all 8 process chains are intact**;
- but it **restarted its pass** rather than continuing: the counter went from
  `[356,732] mapped=356,699 written=356,699 35.2 docs/s · 3_22/2018` to `[1]
  mapped=0 written=0 · 3_22/2022`;
- it produced **nothing for ~18 minutes**, then began writing — `mapped=11
  written=11` and climbing;
- it is running at **0.9 docs/s against 35.2 before the restart**, and its log
  grew 166 bytes in 30s while a healthy scope grew 192,252.

**The part I cannot answer and is yours:** whether it resumed from its checkpoint
or re-walked the scope. It moved from `3_22/2018` to `3_22/2022`, which is
consistent with *either* having finished 2018 legitimately *or* having lost its
position and restarted on a different partition. Your checkpoint files are the
authority, not my read of the log.

The 0.9 docs/s may simply be that 2022 is PDF-heavier than 2018 — I am not
claiming it is a defect, only that it is 39x slower and worth one look.

Everything else in 0689 stands: the service cutover is verified, every postgres
process is in session 0, and `pg_ctl status` still lies to unelevated callers.
