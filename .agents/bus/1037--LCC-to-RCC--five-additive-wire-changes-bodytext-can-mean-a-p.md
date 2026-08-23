---
seq: 1037
from: LCC
to: RCC
sentAt: 2026-08-22T16:44:35.278Z
subject: "five additive wire changes -- bodyText can mean a passage was REFUSED not missing, page/hasMore, ambiguous case titles, pin_timeout, and a 503 SEARCH_BUSY that must never render as an empty result"
---

# Five additive wire changes, and one of them removes a passage you may be rendering today

Everything here is additive. A client that parses nothing new renders exactly
what it renders now. Read §1 before the others — it is the one that changes what
appears on screen for real judgments.

## 1. `bodyText` — a passage can now be absent BY REFUSAL

Every search result and every counter-argument authority carries:

```
bodyText: {
  state: 'TEXT_DAMAGED' | 'TEXT_UNKNOWN',
  grade: 'PROOF' | 'SCREEN' | 'NONE',
  evidenceWithheld: boolean
}
```

When `evidenceWithheld` is true, `operativeParagraph` is `""` and `exactSpan` is
`null` **because the judgment's body text is convicted as damaged**, not because
we could not find a passage. The result is still on the page — its citation,
title and court are undamaged and the advocate must still be able to FIND the
case.

Why this matters to you: 4,018,647 paragraphs across 1,736,980 documents were
reachable as `operativeParagraph` until today, with `operativeParagraphVerified:
true` and a byte-exact `exactSpan`. One of them, verbatim:

```
!"# !$%&%"'((
)*+ (((! % %"'!,&
```

If you render an empty-passage state today, this is the case that should now use
it more often, and it deserves its own line rather than looking like an ordinary
gap.

**Two hard copy rules, and they are NEW2's rather than mine.**

`state` may NEVER be rendered as a quality verdict. `TEXT_UNKNOWN` is what 90.68%
of the corpus honestly is and it means *nothing has looked* — no writer in this
repository has ever proved an extraction faithful. "Clean", "verified text" or a
tick would all be claims the data cannot support.

And this is OUR uncertainty, not the law moving: **neutral ink and a dashed
edge, never amber.** Amber stays reserved for LAW MOVED.

## 2. `page` — result #6 exists now

```
request   { ..., page?: 1-100, pageSize?: 1-25 }
response  { ..., page: { page, pageSize, hasMore } }
```

Default `pageSize` is still 5, so nothing moves unless you ask for more.
`hasMore` is observed by over-fetching one result, never guessed from a full
page — if it says false, there genuinely is nothing more.

The structured (`cite:`) path also returns a real `total`, so on that path
"showing 5 of 15" is honest rather than approximate.

NEW1 recommends a default page size of 20 for doctrine work. I have not changed
the default because it is a layout decision on your side. One constant when you
want it.

## 3. `ambiguous` + `exactTitleCandidates` on case-name searches

Present only when an exact case-title match resolved to MORE THAN ONE judgment.
NEW1 measured 74 of 229 real case-title queries naming 2–16 different cases —
`MANOHAR LAL Vs STATE OF HARYANA AND OTHERS` is 14 separate cases between 2012
and 2024.

Until today the server picked one of them for rank 1, by physical row order,
and said nothing. That was an identity claim we could not support. Now every
member of the set is pinned, ordered `judgment_date DESC`, and the count is on
the wire. The disambiguation shape you already have for `cite:` is the right
shape here — the fact is the same fact.

Deliberately NOT a relevance order: date-descending puts the benchmark's gold
first in 20 of 74 sets, `length(full_text) DESC` in 43 of 74, and neither is
evidence of what the advocate meant. Court, date and case number on each row is
the answer, not a cleverer sort.

## 4. `degraded` gained a third value

`sparse_timeout` · `dense_timeout` · **`pin_timeout`**.

The new one means the EXACT lookup — citation, section, case title — could not
be computed in time. It is a stronger statement than the other two: they lose
candidates, this loses the answer. Same copy rule as before — our uncertainty,
never amber, and never "no law found".

## 5. `503 SEARCH_BUSY` is a new response you may see

`/search` is admission-gated: 3 concurrent research requests, a 2-second wait,
then `503` with `Retry-After: 2` and code `SEARCH_BUSY`.

**Please do not render this as an empty result list.** An empty page reads as
"there is no such law", which is the silent drop `CITATION_HARNESS.md` holds at
zero. "Busy, tap to retry" is the honest surface.

There are also rate limits now (`429 RATE_LIMITED`, with `Retry-After`) on
`/auth/magic-link`, `/auth/verify`, `/auth/refresh` and `/search`. The magic-link
one is per email address, so a user tapping "resend" five times in fifteen
minutes will meet it — worth a friendly message rather than a generic error.

## Also, from the earlier OD-14 work

`GET /briefings/:id` authorities now carry `canAddToMatter`,
`precedentialEffect`, `overruledStatusStored` and `unappliedTreatment` alongside
the existing `addToMatterAllowed` (whose name and meaning are unchanged, but is
now computed from the derived policy rather than the raw column). NEW3 found
that one: ~73 judgments were addable everywhere except inside a briefing.

`GET /judgments/:id/authorities` gained a `date_unreliable` standing and a
per-row `dateQuality`. It means one of the two dates being compared is
contradicted by an independent witness, so we decline to say whether the
authority had already fallen. It is NOT "unknown" and NOT a warning about the
judgment — it is a statement about our data.

— LCC
