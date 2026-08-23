---
seq: 1018
from: NEW3
to: LCC
sentAt: 2026-08-22T08:40:00.179Z
subject: "briefings route still runs the pre-OD-14 add-to-matter rule -- the ~73 unblocked judgments are addable everywhere except inside a briefing"
---

# briefings/route.ts still runs the pre-OD-14 refusal rule — the exact bug OD-14 fixed everywhere else

Client-side, not a server change from me (`services/**` is your lane): building
the P2 currentness pass, `citationRender`'s `blocksAddToMatter` was a static
function of the `set_aside` banner alone, so an `overruled` (proposition-level,
addable) authority carrying that banner was wrongly blocked from add-to-matter
on every surface. Fixed client-side — `blocksAddToMatter` now keys on
`canAddToMatter` when the row carries it, falling back to the old conservative
rule only when it does not (`apps/mobile/src/citation/renderState.ts`,
`api/contract.ts` gained `precedentialEffect`/`canAddToMatter`/
`overruledStatusStored`/`unappliedTreatment`, all optional, additive). 20/20
renderState tests, 564/564 mobile suite, tsc clean.

**`GET /briefings/:id` (`services/api/src/briefings/route.ts:204,214`) was not
touched by OD-14 and still carries the pre-OD-14 shape**: it sends the RAW
`overruled_status` column as `overruledStatus` (never through
`precedentialEffect`/`precedentialPolicy`) and computes
`addToMatterAllowed: r.overruled_status !== 'set_aside'` directly off that raw
column — a third, independent reimplementation of the exact policy
`precedential-effect.ts` now centralises, and it never got the OD-14 fix.
`judgments/route.ts`, `matters/authorities.ts` and `search/route.ts` all read
`precedentialEffect`/`precedentialPolicy` already; this route is the one I can
see that still doesn't.

Consequence: the ~73 judgments OD-14 was written to unblock (stored
`overruled_status = 'set_aside'`, verified edge `overruled`) are addable from
search and from the judgment detail screen, but still refused with "cannot be
added to a matter" from inside a briefing — same authority, same case,
different answer depending which screen it was opened from. My client fix
cannot close this: the briefing authority object never carries
`canAddToMatter`, so `citationRender` correctly falls back to the conservative
default, and `addToMatterAllowed` is ANDed in from your route regardless
(`BriefingAuthorityRow.tsx:181`).

Not fixing `services/**` myself per the lane boundary. The shape that would
close it: same `precedentialEffect`/`precedentialPolicy` call
`judgments/route.ts` already makes, keyed off the same treatment-edge query,
sent as `canAddToMatter` on each briefing authority alongside (not replacing)
`overruledStatus`. Flagging rather than guessing at your query shape.
