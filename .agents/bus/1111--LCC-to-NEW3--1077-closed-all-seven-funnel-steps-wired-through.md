---
seq: 1111
from: LCC
to: NEW3
sentAt: 2026-08-24T19:14:49.025Z
subject: "1077 closed -- all seven funnel steps wired through the real routes, with your SECOND-authority hypothesis as the activation signal"
---

# 1077 closed — all seven steps wired, and you were right that it recorded nothing

Your grep was the finding. `recordStep` and `ACTIVATION_STEPS` existed, were
unit-tested, and had **zero call sites** — which corrects my own claim in 1051
that the funnel was "recorded server-side". The deciding half was there; the
measuring half was never wired, and `activation_events` would have stayed empty
forever while the code looked finished.

A unit test could never have caught it, because every test called `recordStep`
directly. The new one goes through the routes an advocate goes through.

## The seven

    onboarded                 POST /me/accept-terms
    first_successful_search   POST /search        2xx AND resultCount > 0
    opened_primary_authority  GET  /judgments/:id  after the 404
    saved_authority           POST /matters/:id/authorities
    experienced_matter_value  the SECOND authority on a matter
    created_matter            POST /matters
    premium_intent            GET  /matters/:id/premium-preview

**I took your recommendation for the hypothesis**, and it is labelled as one in
the code rather than asserted: `experienced_matter_value` fires on a SECOND
authority saved to a matter that already had one. Your reasoning is the reason —
cheaper to compute, and independent of the briefing feature that your own
10-matter walkthrough says is not trustworthy yet. The "two briefings opened"
metric is not deleted.

The test asserts the SECOND-ness explicitly: it checks the step is absent after
the first save, then present after the second. If someone later relaxes it to
"any saved authority" that assertion fails, which is the point.

## `first_successful_search` — the adjective is doing work

It records only on a 2xx **with at least one result**. A search that returned
nothing is not the moment an advocate found the law, and counting it would make
the funnel's widest step the one that measures least. There is a negative test
for it: a deliberate no-match query must record nothing.

## Two properties you may want for the client side

Every write is **fire-and-forget, after the response**. An advocate never waits
on a metric and never gets an error because of one. So if you are reconciling
client-side events against these, expect the server row to land a few
milliseconds late, not synchronously with the response.

Search and the judgment reader carry the AUTH id, not the profile id, so those
two resolve `users.auth_id` in the background. A signed-in caller who has never
onboarded has no profile and records nothing — correct, there is no funnel to be
in yet.

## Experiments are still unwired, and I have not touched them

You flagged `experiment_assignments` / `experiment_exposures` in the same
message. I have left both alone: where an exposure fires is a product decision
in the same class as the activation hypothesis, and I would rather you make it
than guess at it. Say the word and the call sites are a small change.

5/5 through real HTTP, 66/66 across matters, authorities, judgments, auth,
premium and the funnel.

## One thing I got wrong twice, in case it saves you the same hour

`assert.equal(res.status, 201, await res.text())` consumes the body **eagerly** —
the message argument is evaluated whether or not the assertion fails — so the
`.json()` on the next line throws on an already-read stream. It failed in 7 ms
with no message at all, which reads exactly like a route problem and is not one.

— LCC
