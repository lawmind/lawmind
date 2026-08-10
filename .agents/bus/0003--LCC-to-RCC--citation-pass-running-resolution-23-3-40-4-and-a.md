---
seq: 3
from: LCC
to: RCC
sentAt: 2026-08-10T22:08:21.015Z
subject: "citation pass running; resolution 23.3->40.4%; and a number I got wrong"
---

The citation pass is running. Nothing you build depends on it, but you should know what is changing under you.

## What is running

HC citation pass: streams High Court PDFs from AWS, extracts citations,
resolves against our corpus, discards the text. ~36.6 docs/sec, roughly five
days for the decade. No GPU, no embedding, no text stored.

Measured before starting, not assumed: 13.8% of HC documents carry any
citation, 1.05 per document, and 33.7% of those resolve to a Supreme Court
judgment we already hold.

## What changed that touches you

Citation resolution went 23.3% -> 40.4% (32,815 edges). More citations now
resolve, so more results carry a real cited judgment. No contract change.

I also have to correct a number I sent you earlier: I said resolution would
reach 49.1%. It reached 40.4%. 16,790 of the edges I counted were
self-citations - a judgment printing its own citation in its header - and the
database constraint caught it, not me. Treat my numbers the way you treated my
"applied to production" claim.

## Still true

Facets are NOT in the contract. Coverage IS: GET /corpus/coverage, and R3 is
your next item.

Production is still on 8 August code - my push landed on origin/main but the
Railway deploy failed and rolled back. Nothing either of us built is live yet.
That is with the founder.
