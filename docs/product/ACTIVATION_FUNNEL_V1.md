# The activation funnel — what exists, and the gap that makes it record nothing today

**23 Aug 2026, NEW3.** This is the required NEW3-2 deliverable. It is short
because the interesting finding is not a design question — the design is
already settled and good — it is that **the funnel currently records zero
events in any environment**, and that was not obvious from reading the schema
or LCC's own status message alone; it took a repo-wide grep to see.

## The design, as LCC built it (bus 1051, 1053) — sound, not touched here

`activation_events (user_id, step)`, `ON CONFLICT DO NOTHING` — first
occurrence per user per step, server-recorded because only the server knows a
search actually **succeeded** (`search_events` already found 50 requests
recorded as `result_count = 0` that were in fact 500s; a client-tap funnel
would have counted every one as activation). No query text, no device id, no
session — a funnel, not a session recording.

```
onboarded -> first_successful_search -> opened_primary_authority
-> saved_authority -> created_matter -> experienced_matter_value -> premium_intent
```

`services/api/src/product/activation.ts` also computes two denominators per
step — `ofOnboarded` (the headline) and `ofPrevious` (where the floor
actually gives way) — and a `worstDropOff()` helper that returns `null`
rather than naming a step on an empty dataset. This is the right shape: a
funnel that only ever reports one ratio hides exactly the step worth fixing.

## The gap — `recordStep` is called nowhere

Grepped the whole repository for `recordStep` and `ACTIVATION_STEPS`: both
appear **only inside `activation.ts` itself** — the function that writes a
row is never imported, never called, by any route handler, cron job, or
test. `funnel()` and `worstDropOff()` are in the same position: no
`/admin/*` route reads them back. Confirmed by direct grep, not inferred from
absence of a route in a list — `grep -rn recordStep services/api/src` and a
repo-wide `**/*.ts` search both return one hit, the definition.

Practically: today, in every environment including this local one, **the
`activation_events` table has zero rows and will keep having zero rows** no
matter how many advocates onboard, search, save, or open a premium preview,
because nothing on the request path ever calls `recordStep`. The funnel's
query and drop-off math are correct and ready; there is nothing yet for them
to compute over.

This is the same shape of gap as `experiments.ts` — `experiment_assignments`
/`experiment_exposures` are defined with no assignment or exposure call site
either. Reported together to LCC, whose files these are; not fixed here —
wiring `recordStep` calls into `search.ts`, `judgments` routes, `matters`
routes and `premium/route.ts` is server logic outside this lane's file
ownership, and the call sites need product judgement on exactly *where*
"experienced matter value" fires (the one step in the list that is not a
single obvious API call — see below).

## The one design question this lane owns: what is `experienced_matter_value`?

Every other step maps to one obvious server event. This one does not, and
guessing wrong here would make the funnel's most product-relevant step
report noise. Two candidates, not decided:

1. **`AUTHORITY_SAVED_TO_MATTER`** — a second authority saved to an existing
   matter (the first save is already `saved_authority`; a second is a
   returning, deliberate act rather than a first-time action taken once).
2. **Two briefings opened** — the pre-existing competing hypothesis this
   round's kickoff explicitly named as not yet decided against the newer one.

Per the plan's own instruction, `AUTHORITY_SAVED_TO_MATTER` (read as: a
*second* authority added to a matter that already has one) is recorded here
as the **first hypothesis**, not settled truth. It is a cheaper signal to
compute than "two briefings opened" (briefings do not reliably generate for
a matter within the observation window — see
`PREMIUM_10_MATTER_WALKTHROUGH_V1.md`'s finding #1 on why a briefing's own
content cannot yet be trusted, independent of whether one was opened at
all), and it does not depend on a feature (24-hour briefings) this round's
own evidence says is not ready to market. Once real usage data exists for
both, the actual answer is whichever one predicts day-7 return — which
requires the funnel to be wired up and running before it can be answered at
all.

## What NEW3 did NOT build here

No client-side event firing, and deliberately: LCC's own reasoning (a client
tap is not proof of success) is correct, and duplicating it into
`apps/mobile/src/analytics/events.ts` (the client analytics contract shipped
this round, uninvolved in this funnel, `track.ts` explicitly does not call
any network endpoint yet — see `docs/CURRENT_PLAN.md` "## NEW3 · 23 Aug
2026") would create exactly the second, disagreeing number LCC's design was
built to avoid. The funnel stays server-only, per the original design; it
just needs its four missing call sites.

## Reported to LCC

Bus message this session: `recordStep`/`ACTIVATION_STEPS` and the
`experiments.ts` assignment/exposure functions are both unwired, with the
grep evidence above, and the `experienced_matter_value` hypothesis
(`AUTHORITY_SAVED_TO_MATTER`, second save on an existing matter) for when
call sites are added.
