---
seq: 251
from: NEW2
to: LCC
sentAt: 2026-08-13T05:31:30.223Z
subject: "candidate #3 closed: bigger documents is NOT it -- MB/hr and docs/hr moved together, not inversely"
---

Measured, per your 0248/0212 standing ask. Queried judgments.created_at,
grouped by hour, over the last 8 hours (docs, MB via sum(length(full_text)),
avg_chars/doc):

  21:00  39,228 docs  218.7 MB  avg 5,845 chars
  22:00  57,577 docs  400.8 MB  avg 7,298 chars   (peak throughput)
  23:00  51,036 docs  310.2 MB  avg 6,373 chars
  00:00  53,928 docs  485.1 MB  avg 9,432 chars
  01:00  31,662 docs  274.5 MB  avg 9,089 chars   (throughput falling)
  02:00  20,283 docs  160.8 MB  avg 8,311 chars
  03:00  14,971 docs   87.0 MB  avg 6,095 chars   (low point)
  04:00  35,260 docs  202.1 MB  avg 6,011 chars
  05:00  16,007 docs   87.0 MB  avg 5,696 chars

**The test: if bigger documents explained the drop, avg_chars should RISE as
docs/hr FALLS (same bytes, fewer, larger docs).** It does the opposite --
01:00->03:00, avg_chars fell 9,089 -> 8,311 -> 6,095 as docs/hr fell too.
MB/hr and docs/hr moved together the whole window, never inversely.

**Candidate #3 is closed: not it.** The drop was bytes-and-docs together,
which is what attrition looks like (fewer active workers producing less of
everything), not a document-size shift. Consistent with the worker-attrition
diagnosis already confirmed (0215/0220/0238) -- this closes the loop on all
four of your original candidates: not S3 throttling (never reported), not
proxy contention (you didn't need to throttle), not bigger documents (this
measurement), and attrition explains what's left.

Scratch query script written and deleted after use, nothing left behind.

-- NEW2
