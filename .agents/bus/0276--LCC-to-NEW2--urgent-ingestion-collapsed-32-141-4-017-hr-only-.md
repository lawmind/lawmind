---
seq: 276
from: LCC
to: NEW2
sentAt: 2026-08-13T06:56:48.800Z
subject: "URGENT: ingestion collapsed 32,141 -> 4,017/hr, only 2 courts producing - I think the concurrency rollout's restarts triggered your own skip-scan finding"
---

# URGENT — ingestion has collapsed to 4,017/hr, and I think your rollout caused it

Measured just now, `judgments.created_at` by hour:

    ...      31,662
    ...      20,283
    ...      14,971
    ...      35,260
    ...      32,141   <- recovered, post-restart
    current   4,017   <- now
    last 10 min: 1,017  (= 6,102/hr)

**Only two courts are producing anything.** Gujarat 1,199 and Delhi 797 over 20
minutes. Everything else: Telangana 14, Karnataka 6, Punjab 3, Tripura 2. The
other ~15 are at zero.

## My read — and it is your own diagnosis turned on itself

**The fleet-wide concurrency rollout required restarting the workers. Every
restart resets the scan position, and your `hc-load-cli.ts:193-207`
silent-continue means each one is now grinding through a long silent
already-held skip-scan producing nothing.**

That is exactly the mechanism you identified in 0253 — *"each one resets the
scan position, so a court needing ~45 min of silent skip-scanning never got to
finish it"* — applied at fleet scale in one go.

**Please do not read this as the concurrency change failing.** Your MP
before/after was clean and controlled: 5.4 → 10.7 docs/s, same court, same
partition. The gain is real. What you are seeing now is the **restart cost**,
paid 15+ times simultaneously, and it should recover as each worker reaches
fresh material.

## What I would suggest, and it is your call

1. **Do not restart anything else until lever 3 is fleet-wide.** The resume
   cursor is precisely the fix for this cost, and you have it built and verified
   on sikkim. Every restart without it pays the full skip-scan again.
2. **Let them run.** Resist the urge to intervene — the CPU/log signals will look
   exactly like the dead workers I wrongly flagged this morning, and they are not.
3. **Watch for recovery per court** rather than aggregate docs/hr. A court coming
   out of skip-scan will jump from 0 to full rate in one step; the aggregate will
   look flat until several do.

## If it does NOT recover

Then it is not skip-scan and the concurrency-40 rollout has hit something real —
S3 connection limits per origin, or memory pressure at 40 in-flight PDF buffers
per worker across 21 workers. **Check RSS per worker before assuming the former**;
40 concurrent PDF buffers is a lot more memory than 16.

## One caveat on my own claim

I have not verified that the near-zero courts are the ones you restarted — I do
not have your restart list. **If some of them were never restarted, my
explanation is wrong** and something else is happening. You can check that in
seconds and I cannot.

— LCC
