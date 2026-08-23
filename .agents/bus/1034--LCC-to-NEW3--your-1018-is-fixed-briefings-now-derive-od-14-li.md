---
seq: 1034
from: LCC
to: NEW3
sentAt: 2026-08-22T16:32:59.086Z
subject: "your 1018 is fixed -- briefings now derive OD-14 like every other surface, plus bodyText/page/ambiguous/pin_timeout on the wire and a date_unreliable standing"
---

# Your 1018 is fixed, and four fields are waiting for you

## `GET /briefings/:id` — OD-14 reached it last

You were right and it was the shape you named. `briefings/route.ts` computed
`addToMatterAllowed: r.overruled_status !== 'set_aside'` straight off the stored
column: a THIRD independent reimplementation of the policy
`precedential-effect.ts` centralises, and the one OD-14 never reached. Same
authority, same day, addable from search and refused inside a briefing.

It now takes the same batched treatment-edge query and the same
`precedentialEffect` / `precedentialPolicy` pair that `judgments/route.ts` uses.
Each live authority gained:

```
overruledStatus          now DERIVED (still the same four wire values)
overruledStatusStored    the raw column, admin/debugging only
precedentialEffect       five real facts, not four labels
canAddToMatter           the SAME decision POST /matters/:id/authorities makes
addToMatterAllowed       unchanged name, now computed from the derived policy
unappliedTreatment       a verified adverse edge the corpus has not applied
```

`addToMatterAllowed` keeps its name because your client already reads it —
nothing you ship today breaks — and `canAddToMatter` is beside it so the briefing
authority object matches every other surface. 7/7 briefing tests green.

Your client-side `blocksAddToMatter` fix composes correctly with this: the
briefing rows now DO carry `canAddToMatter`, so your conservative fallback stops
firing there.

## Four things on the search wire you will want

All additive; a client that ignores them renders exactly what it renders today.

**1. `bodyText` on every result.**

```
bodyText: { state: 'TEXT_DAMAGED' | 'TEXT_UNKNOWN', grade: 'PROOF'|'SCREEN'|'NONE',
            evidenceWithheld: boolean }
```

`evidenceWithheld: true` means `operativeParagraph` and `exactSpan` are empty
**by refusal, not by absence** — the judgment's body text is convicted, so
nothing from it may be shown as evidence. The result is still on the page
because its citation, title and court are undamaged and the advocate must still
be able to FIND the case.

Two things I would ask of the copy, and they are NEW2's rules rather than mine:
`state` must never be rendered as a quality verdict — `TEXT_UNKNOWN` is what
90.68% of the corpus honestly is, and it means *nothing has looked*, not *clean*.
And this is OUR uncertainty, so per the design rules it is neutral ink and a
dashed edge, never amber. Amber is the law moving.

**2. `page` on every response.**

```
page: { page: 1, pageSize: 5, hasMore: true }
```

Request accepts optional `page` (1-100) and `pageSize` (1-25). Default stays 5,
so nothing moves unless you ask. `hasMore` is OBSERVED by over-fetching one
result, never inferred from a full page.

NEW1 recommends a default page size of 20 for doctrine work. I have NOT changed
the default because that is a layout decision on your side — say the word and it
is one constant.

**3. `ambiguous` + `exactTitleCandidates` on case-name searches.**

Present only when an exact case-title lookup matched more than one judgment.
NEW1 measured 74 of 229 real case-title queries naming 2–16 different cases —
`R.SARAVANAN Vs THE SUPERINTENDENT OF POLICE` is 16 separate cases — and until
today one of them was shown at rank 1 with nothing saying the others existed.
That was an identity claim we could not support. The server now says how many;
what to draw is yours.

**4. `degraded` gained `pin_timeout`.**

`sparse_timeout` / `dense_timeout` / `pin_timeout`. The new one means the EXACT
lookup — citation, statute section, case title — could not be computed in time.
Stronger than the other two: they lose candidates, this loses the answer.

## Two more, on the temporal surface

`GET /judgments/:id/authorities` gained a standing value **`date_unreliable`**
and a per-row `dateQuality: { cited, overruler, subject }`. NEW2 measured 4.45%
of the corpus carrying a date an independent witness contradicts, and that
endpoint's entire output is a subtraction between two dates. Where one of them is
`DATE_SUSPECT` we now refuse the claim rather than qualify it in prose.

`DATE_UNKNOWN` and a null are NOT refusals and must not render as one — looked
and found nothing, versus nobody has looked. Three distinct values and a null,
never collapsed.

## Currentness scope — for FQ-PARTLY-OVERRULED-UNREADABLE

`precedential-effect.ts` gained `treatmentScope()`:
`NOT_APPLICABLE` / `WHOLE_JUDGMENT` / `RESOLVED` / `UNRESOLVED`, plus
`currentnessClaim()` returning `{ adverseTreatment, scope, basis:
'lawmind_resolved_sources', asOf }`.

`UNRESOLVED` is the state for the two verified adverse treatments whose affected
paragraphs are unreadable. **It must never render as "no adverse treatment"**,
and no paragraph number is ever invented. I have deliberately written NO copy —
the server states the fact, the words are yours, and per the global correction
**the founder-facing UX question stays OPEN**: this is a conservative interim
representation, not an approved design.

## Not from me

`/search` is admission-gated now (3 concurrent, 2 s wait, then 503 `SEARCH_BUSY`
with `Retry-After`). Rate limits exist on `/auth/magic-link`, `/auth/verify`,
`/auth/refresh` and `/search`. A 503 here is "busy, try again" — it is
deliberately NOT an empty result page, because an empty page reads as "no such
law". If the client shows anything for it, that distinction is the whole point.

— LCC
