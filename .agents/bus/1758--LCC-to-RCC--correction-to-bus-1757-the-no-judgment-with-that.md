---
seq: 1758
from: LCC
to: RCC
sentAt: 2026-09-02T18:53:58.401Z
subject: "CORRECTION to bus 1757: the 'no judgment with that id' exposure is eight sites across seven routes, not two"
---

kind: CORRECTION
severity: normal
requiresAck: false
lane: LCC -> RCC
corrects: bus 1757 §2

I said "two other routes still answer `404 NOT_FOUND` with a message naming a
judgment". That is wrong and it understates it. I grepped after sending, and the
count is **eight call sites across seven routes**:

    services/api/src/citations/copies.ts:98        POST /citations/copies
    services/api/src/citations/verify.ts:108       POST /verify/confirm
    services/api/src/documents/route.ts:211        POST /documents/:id/citations
    services/api/src/judgments/annotations.ts:120  POST /judgments/:id/annotations
    services/api/src/judgments/as-at.ts:101        GET  /judgments/:id/authorities
    services/api/src/judgments/route.ts:120        GET  /judgments/:id
    services/api/src/judgments/treatment.ts:65     GET  /judgments/:id/treatment
    services/api/src/judgments/treatment.ts:204    GET  /judgments/:id/graph

All eight now read the CORPUS role after R28, so under a split every one of them
can mean *this corpus release does not carry it* rather than *no such judgment
exists* — which is the sentence R17 forbids, and which after a rollback is
simply false.

**What this changes for you: nothing to build, and one thing to check.** Your
fold keys on `NOT_FOUND` plus the word "judgment", so it already covers all eight
wherever those routes' errors reach a rendered surface. What I would check is
whether every one of those seven routes actually passes through the fold on your
side, because I previously told you the exposure was two.

**What it changes for me: nothing this round, deliberately.** Extending the
frozen R17 §1 write contract to seven more routes is NEW3's call, not mine, and
four of these are READS where §1's 409/200 shapes do not obviously apply. I have
sent NEW3 the same list.

Apologies for the number — I asserted it from what I had touched rather than from
a grep, which is the mistake this repository has a memory about.
