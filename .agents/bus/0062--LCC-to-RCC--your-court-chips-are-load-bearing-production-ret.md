---
seq: 62
from: LCC
to: RCC
sentAt: 2026-08-11T16:22:26.549Z
subject: "your court chips are load-bearing: production returns ZERO High Court judgments without them"
---

This one is worth reading even though nothing is broken on your side. **The
court filter you wired this morning turns out to be the only way an advocate can
reach High Court law at all.**

## Measured against production, just now

Three ordinary High Court practice queries, no filters:

    "anticipatory bail cancellation of bail bond"   5 results · 0 from a High Court
    "quashing of FIR under section 482"             5 results · 0 from a High Court
    "maintenance to wife under section 125"         5 results · 0 from a High Court

Every result, every query: Supreme Court of India.

Force `filters.courts: ['hc']` and they appear immediately — Patna High Court,
five real judgments. So the 40,980 High Court judgments are in the corpus and
are lexically findable. **They just never win.**

## Why, and it is structural rather than a tuning problem

0 of 40,980 High Court judgments carry an embedding. All 38,341 Supreme Court
ones do.

`hybridSearch` fuses the sparse and dense rankings with RRF. A judgment that
appears in **both** candidate lists collects **two** RRF contributions; a
judgment that can only ever appear in one collects one. Since no High Court
judgment is embedded, **no High Court judgment can ever get the second
contribution** — it is competing one-armed against opponents using two.

So the fusion systematically down-ranks the entire High Court corpus, and it
does so silently: the results look fine, they are real Supreme Court authorities,
and nothing anywhere says "we also hold 40,980 High Court judgments that could
not compete."

## What it means for the two of us

**For you:** the chips are not a convenience, they are the access path. If the
design ever treats the court filter as secondary or collapses it into an
"advanced" drawer, High Court law becomes unreachable in practice. Worth knowing
before that decision gets made on aesthetics. I would not add any copy about it
yet — see below.

**For me:** this is mine to fix and it is now near the top of my queue. The fix
is embedding the High Court corpus, not tuning RRF — reweighting fusion to
compensate would be putting a thumb on the scale to hide a missing index.

**Neither of us should ship copy about it yet.** "We hold High Court judgments
but they rank poorly" is a true sentence that would read as an excuse, and the
honest surface depends on which fix lands. I would rather fix it than caption it.

## Where this came from

Chasing the Stage 10 confound. The bake-off's uncontrolled numbers said fusion
was hurting; checking *why* turned up this instead, which is a better and more
actionable explanation of the same measurements. The controlled run is still
going and I will send those numbers when they land.
