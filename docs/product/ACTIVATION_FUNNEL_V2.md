# THE ACTIVATION FUNNEL — V2, now that it records something

**NEW3, 25 August 2026.** Sprint plan V2 §10 NEW3-2. Supersedes
`ACTIVATION_FUNNEL_V1.md`, whose finding — *the funnel is fully unwired and
records zero events in every environment* — was correct on 23 August and is
**closed** as of LCC bus 1111.

---

## 1 · The write side is wired, verified by reading the call sites

V1 grepped for `recordStep` and found one hit, its own definition. That grep now
finds nothing, because the exported function was renamed. The real names are
`recordStepInBackground` and `recordStepForAuthIdInBackground`, and **all seven
steps have real call sites in production route files**:

| Step | Fires in | Condition |
| --- | --- | --- |
| `onboarded` | `auth/account.ts:192` | terms accepted |
| `first_successful_search` | `search/route.ts:337` | **2xx AND `resultCount > 0`** |
| `opened_primary_authority` | `judgments/route.ts:148` | a judgment is read |
| `saved_authority` | `matters/authorities.ts:305` | first save |
| `created_matter` | `matters/route.ts:220` | matter created |
| `experienced_matter_value` | `matters/authorities.ts:320` | **`count >= 2` after the insert** |
| `premium_intent` | `premium/route.ts:94` | premium surface reached |

Two of those conditions are the interesting ones and both are right.

**`first_successful_search` requires a result.** A search that returned nothing
is not the moment an advocate found the law, and a search that 500'd certainly is
not. Given this round's own P0 — `"anticipatory bail"` returns an empty 200 —
this matters more than it looks: **the funnel will correctly report those
advocates as not activated**, which is exactly what we want, and it means step 2's
drop-off is a live read on the retrieval problem rather than a vanity number.

**`experienced_matter_value` is the second authority saved to a matter**, counted
after the insert, idempotent per user per step. That is the `AUTHORITY_SAVED_TO_MATTER`
hypothesis this lane recommended in V1, and LCC implemented it **labelled as a
hypothesis in their own comment**, with the competing metric ("two briefings
opened") not deleted. That is the correct handling.

LCC also added `activation-wiring.test.ts`, which goes through the real HTTP
routes rather than calling `recordStep` directly — the specific reason being that
a unit test on `recordStep` is what let the whole thing sit unwired while looking
implemented.

## 2 · `AUTHORITY_SAVED_TO_MATTER` is still a hypothesis, and this is the sentence that keeps it one

**It remains unproven and must not be described as activation in any founder
brief, deck, or dashboard label.** Nothing has validated it. The only thing that
can is whether it predicts day-7 return, and that needs real advocates using a
shipped product for a week.

What it has going for it is cheapness and independence: it costs one `COUNT(*)`
on a table already being written, and it does not depend on the 24-hour briefing,
which this round's evidence still says is not ready to market (`[C3]`).

What would falsify it: a cohort where second-save and day-7 return are
uncorrelated, or where a different step separates returners better. Both are
answerable, neither is answerable yet.

## 3 · The gap that replaces V1's gap: nothing reads the funnel back

`funnel()` and `worstDropOff()` are implemented, correct, and have **zero
non-test consumers**. Grepped repo-wide: the only hits outside `activation.ts`
and its tests are three unrelated comments using the word "funnel".

So the events now accrue where **no human can see them**. There is no
`/admin/activation` route, nothing on the admin surface, no export. The
difference from V1's gap is real — the data is being collected, and a read route
added in a month can look backwards over it — but the practical position today is
that the funnel answers no question anybody can ask.

**This is a small LCC item and it is the last thing standing between the funnel
and being useful.** `worstDropOff()` already returns `null` rather than naming a
step on an empty dataset, so the route is safe to add before there is data.

`activation.ts` computes **two** denominators per step — `ofOnboarded` (the
headline) and `ofPrevious` (where the floor actually gives way). A read surface
must show both. A funnel that reports one ratio hides exactly the step worth
fixing.

## 4 · Experiments are entirely unwired, and that is currently correct

`experiments.ts` exports `variantFor`, `assign`, `recordExposure`, `readout`,
`MIN_EXPOSED_FOR_RATE = 100`. **None has a call site outside its own file and
tests.** `experiment_assignments` and `experiment_exposures` have never been
written to.

The plan says: *do not begin sophisticated paywall A/B testing before the event
pipeline is reliable.* So this is the correct state, not a defect — but it is
stated here rather than left as an unnoticed absence, because "we have an
experiments framework" and "we have run zero experiments" are different facts and
only the second one is true.

**Precondition on the first experiment**, and it is not a date: one cohort of
real advocates through the funnel with `activation_events` growing and a read
surface to see it on. Until then an A/B test would be measuring a pipeline, not
a product.

## 5 · The funnel as a product definition

```
onboarded
  → first_successful_search        (2xx AND at least one result)
    → opened_primary_authority
      → saved_authority
        → created_matter
          → experienced_matter_value    (second save — HYPOTHESIS)
            → premium_intent
              → [ purchase ]            not instrumented; no billing provider
                → [ day-7 return ]      not instrumented; the real question
```

The last two are **deliberately absent from the server today**. `purchase` has no
billing provider to fire from, and `day-7 return` is a retention measure, not an
activation step — putting it in `activation_events` would mix a one-time
first-occurrence table with a recurring one. Both belong in the commercial
package's instrumentation list, not here.

**No client-side firing, and deliberately.** LCC's reasoning is right: only the
server knows a search actually succeeded (`search_events` already held 50
requests recorded as `result_count = 0` that were in fact 500s; a client-tap
funnel would have counted every one as activation). Duplicating this into
`apps/mobile/src/analytics/` would create the second, disagreeing number the
server-only design exists to avoid.

## 6 · Open, ranked

1. **A read surface** — LCC, small, unblocked. Both denominators.
2. **Validate or replace `experienced_matter_value`** — needs a real cohort.
3. **Purchase and retention instrumentation** — needs a commercial model decision first.
4. **First experiment** — blocked on 1 and a cohort, correctly.
