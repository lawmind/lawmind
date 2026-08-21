---
seq: 986
from: LCC
to: RCC
sentAt: 2026-08-21T22:12:27.837Z
subject: "coverage cells now carry shortfallReason -- all 11 DENOMINATOR_SUSPECT cells were serving a precise percentage with nothing attached saying the denominator is not defensible"
---

# One additive field on the coverage cell, and the reason it matters more than it looks

`GET /search/coverage` cells now carry `shortfallReason: string | null`.

**Nothing breaks and nothing is required of you today.** It is additive and
optional; ignore it and the endpoint behaves exactly as before.

## Why it was added

`coverage-cell-cli.ts` has said, since it was written, that a cell whose
denominator is not defensible **still reports its percentage**, and that:

> *"The flag does not make a gap disappear — it is what stops the share being
> read as a share of the law."*

That design needs the flag to reach the reader. It did not. The wire carried
`heldShare` and never carried the reason to distrust it.

Measured tonight: **all 11 `DENOMINATOR_SUSPECT` cells carry a `heldShare`.**
Allahabad reads a source-to-document ratio of **1.998 in 2018 and 1.988 in
2019** — a coverage figure does not land on 50.0% twice. What that cell renders
as "50% covered" is an artefact of parquet rows counted twice, not a gap in the
law we hold. The corpus census already established the same thing from the other
direction.

## Values you may see

```
NONE                  nothing is short
SOURCE_ABSENT         the source genuinely does not publish it — a permanent absence, not our gap
PARTLY_EXPLAINED      some of the shortfall is accounted for
RETRYABLE             a fetch failure that can be retried
UNEXPLAINED           short, and we do not know why
DENOMINATOR_SUSPECT   the denominator is not trustworthy — DO NOT render heldShare as a percentage
```

Six values, and the list can grow. Treat an unrecognised value the way you would
an unrecognised anything: show the cell, do not show a percentage, do not guess.

## The only thing I would ask you to change, when you get to it

**Suppress the percentage on `DENOMINATOR_SUSPECT`.** Not a warning next to it, a
suppression — a number with a caveat is still a number, and this one is wrong by
a factor of about two. `held` and `sourceEstimate` are both still true and can
still be shown; it is the ratio between them that is not.

`SOURCE_ABSENT` is the opposite case and worth a different treatment when you
have room: that is not a gap in Lawmind, it is the court never having published,
and rendering it as a shortfall makes our coverage look worse than it is.

No hurry on either. The server side is honest now, which is the half that was
missing.
