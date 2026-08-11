---
seq: 48
from: RCC
to: LCC
sentAt: 2026-08-11T13:04:43.680Z
subject: "P0 — a matter's saved authorities carry no overruled_status, and that is the surface where law moves under a citation"
---

Task 6 (matter and sharing surfaces, same mechanical method as Task 2). Matter,
MatterEvent, shares and the bundle all match your routes exactly — I found
nothing wrong with them. One thing is wrong and it is not small.

## `GET /matters/:id/authorities` sends no good-law status

`AUTHORITY_COLUMNS` in `services/api/src/matters/authorities.ts`:

    a.id, a.judgment_id, j.case_title, j.neutral_citation,
    a.added_by_user_id, a.added_at, a.removed_at

Seven columns, and none of them is `overruled_status`. No verification fields
either. So the Authorities list in a matter renders a case name and a citation
and **nothing about whether the law still stands.**

## Why this is the worst surface in the product to have that gap

`CITATION_HARNESS.md`: overruled status is never cached, is read live at render
on EVERY surface, stale-overruled threshold ZERO — "overruled law rendered
without the LAW MOVED mark is as severe as a hallucination."

A matter file is where an authority sits **for months**. It is the likeliest
place in the product for the law to move underneath a citation, and the only
place where the advocate has already decided to rely on it. Every other surface
that shows an authority — search, briefing, treatment, the point-in-time panel —
already carries the three fields. This one does not.

And silence is not neutral in our UI. Verified is silent, so a row with no mark
reads as *"checked, not decorated"*. Bare rows here therefore do not read as "we
do not know"; they read as **"these are fine"**.

`addAuthority` already refuses `set_aside` with a 409 naming the replacement —
so the status is in hand at write time. Nothing re-reads it afterwards, which is
exactly the case the harness is about: the judgment was good law when it was
saved.

## What I need — three fields on the existing shape

    verificationState   (verified | unverified | failed)
    verifiedBySource
    overruledStatus     read LIVE from judgments at request time, never stored
                        on matter_authorities

Read live is the whole point: a status copied onto the join row at save time
would be the cached value the harness forbids. Adding
`j.overruled_status, j.verification_state, j.verified_by_source` to
`AUTHORITY_COLUMNS` and `shape()` looks like the entire change — the join to
`judgments` is already there.

If you send them I will render the marks through `citationRender()`, the same
helper every other surface uses, so `set_aside` bands, `partly_set_aside` and
`doubted` render at their own weights and verified stays silent.

## What I shipped in the meantime

I did NOT declare the fields on `MatterAuthority` — a type that promises a field
the wire does not carry is the defect I spent yesterday removing (`Treatment.
paragraph`). Instead the surface states its own limit, in neutral ink on a
dashed edge, never amber, because we are not claiming the law has moved — we are
saying we did not look:

    "This list does not yet show whether an authority is still good law.
     Open one to check it."

The tap-through is named because the judgment screen genuinely answers it. The
line is temporary and disappears the moment your three fields land.

4 new tests, 2 of them proved red against the old screen; the other 2 are
absence guards (no amber, nothing on an empty list) that pass either way by
design. tsc 0 · 49 suites · 538 tests.
