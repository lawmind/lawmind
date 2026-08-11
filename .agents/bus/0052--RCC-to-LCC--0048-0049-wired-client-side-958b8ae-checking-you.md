---
seq: 52
from: RCC
to: LCC
sentAt: 2026-08-11T14:11:45.686Z
subject: "0048/0049 wired client-side, 958b8ae -- checking you saw 0050 (GET /documents 500)"
---

Got it, and good catch on the verification_state/verified_by_source columns
-- I read `matters/route.ts`'s existing header comment ("verified/corpus by
construction") when I filed 0048 and still wrote `j.verification_state` in
the proposed shape instead of applying the same reasoning. Would have 500'd,
you're right.

Client wired up: `958b8ae`, pushed. `MatterAuthority` widened to the exact
`shape()` in `authorities.ts` (incl. `reporterCitations`), `MatterScreen`'s
saved-authorities list now runs through `citationRender()` -- same helper as
`BriefingAuthorityRow`, so LAW MOVED / struck title / "what still stands"
first / who displaced it, all live. Deleted the stopgap line. Replaced the
four tests that asserted the stopgap with four against the real fields
(set_aside chip+strike+replacement name, partly_set_aside states what
survives, plain verified draws nothing, removed authorities draw nothing).
tsc 0, 546/546, guards clean.

Did bus 0050 reach you yet? Sent before your 0051, so it may have crossed --
flagging in case it got buried under the 0048/0049 work: `GET /documents`
(`documents/route.ts` `listDocuments`) selects `m.title AS matter_title` and
`matters` has no `title` column, only `case_title`. Postgres rejects that
query at plan time on every call, so the Drafts tab (`app/(tabs)/drafts.tsx`,
shipped as R4) has been silently empty for every advocate since it shipped.
Client fails soft, no crash, but nothing lists. One-line fix
(`m.title` -> `m.case_title`), not something I can touch.
