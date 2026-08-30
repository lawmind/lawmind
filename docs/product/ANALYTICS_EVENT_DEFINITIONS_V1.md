# PRIVACY-SAFE ANALYTICS — EVENT DEFINITIONS v1

**NEW3, 30 August 2026. R13.** Builds on `ACTIVATION_FUNNEL_V2.md`, which
established that the seven activation steps are wired with real call sites. This
file defines the **metrics** those events roll up into, and the payload rules.

---

## 0. THE TWO PAYLOAD RULES — no exceptions

> **No judgment text in an analytics payload. No matter content in an analytics
> payload.**

Not truncated, not hashed, not "just the first line", not in a debug field, not in
an error breadcrumb. **The tempting violation is the useful one** — sending the
query string to find out what advocates search for. A query string in this product
routinely contains a client's name, a case number that identifies a living person,
and the subject of a criminal matter. It is matter content.

**What may be sent about a search:** its *shape*. Query length bucket, token count
bucket, whether filters were used, which filter kinds, the outcome state, the
degraded array, latency, result count. **Never the query.**

`search_events` is already keyed by `subject_hash`, not `user_id`, and that is the
right shape — it carries no identity to delete because it never held one.

---

## 1. EVERY METRIC NAMES ITS DENOMINATOR

A metric without a denominator is refused. This is not style — it is the rule that
has already caught wrong numbers in this repo more than once.

| metric | numerator | **denominator** |
|---|---|---|
| **activation rate** | users reaching `experienced_matter_value` | users reaching `onboarded` in the same cohort week |
| **first-search success** | users whose first search fired `first_successful_search` | users who issued **at least one** search |
| **searches / user** | search requests | **active** users in the window (not registered) |
| **saves / search** | `saved_authority` events | searches that **returned ≥1 result** |
| **matters / user** | matters created | users who completed onboarding |
| **D7** | users active on day 7 after onboarding | users who onboarded on day 0, **that cohort only** |
| **D30** | users active on day 30 | same cohort, day 0 |
| **degraded rate** | responses with non-empty `degraded[]` | all search responses |
| **refusal rate** | responses with `emptyBecause` set | all search responses |

**Three definitions that are easy to get wrong and are fixed here:**

- **"Active"** = performed a search, opened a judgment, or touched a matter. Opening
  the app is not activity; a session that renders a home screen tells us nothing.
- **`first_successful_search` requires a result.** A search returning nothing is not
  the moment an advocate found the law. This means step-2 drop-off is a **live read
  on the retrieval problem**, not a vanity number — which is why it stays that way
  even though it makes the funnel look worse.
- **Cohorts are day-0 fixed.** D7 is measured against the people who onboarded that
  day, never against everyone active that week. A moving denominator makes retention
  improve when growth stalls.

---

## 2. THE FUNNEL — seven steps, unchanged

`onboarded` → `first_successful_search` → `opened_primary_authority` →
`saved_authority` → `created_matter` → `experienced_matter_value` → `premium_intent`

**`experienced_matter_value` = the second authority saved to a matter.** It is
recorded as a **hypothesis**, not as an established activation moment, and the
competing hypothesis (two briefings opened) is not deleted. **The shadow beta in
Sprint 3 is what tests it.**

**`premium_intent` fires on reaching a premium surface**, which under **Shape B
means it fires on a surface that sells nothing.** It stays instrumented — knowing
how many advocates go looking for the paid thing is the most valuable single number
we can collect during a free beta — but it must **not** be reported as demand for
monitoring specifically. Reaching a page is not intent to buy the thing on it.

---

## 3. MONITORING METRICS — exist only where the capability exists

> **No monitoring or alert metric is defined, dashboarded, or reported while
> `monitoring.user_product` is `DISABLED_NOT_READY`.**

Not as zero, and not as "no data". A dashboard tile reading `monitored matters: 0`
is a tile that will one day read `47` and be believed, and in between it trains
everyone who sees it to think the pipeline works and is merely quiet.

Under **Shape A**, and only after Gate C, these are defined — each with the
denominator its roadmap condition demands:

| metric | denominator |
|---|---|
| observations / day | monitored source keys polled that day |
| request success rate | requests **attempted** |
| parser failure rate | responses **parsed** |
| budget utilisation | the encoded daily cap (**1,000**) |
| retention coverage | source keys with a **classified** retention state |
| alert precision | alerts sent that a user confirmed as correct / alerts sent |

**`LISTED_OBSERVED` is never counted as `HEARING_OCCURRED`** in any metric, any
rollup, or any investor slide.

---

## 4. WHAT WE DO NOT MEASURE, ON PURPOSE

- **Time-in-app as a success metric.** A research tool that finds the authority in
  40 seconds beats one that holds attention for 12 minutes. Optimising engagement
  here optimises for a worse product.
- **Corrections accepted per week.** Rewards lowering the bar. See
  `CORRECTION_WORKFLOW_V1.md`.
- **Anything derived from `retrievalOutcome.rarestDf`.** It is corpus-wide and
  invariant under filters (`CCR-2026-08-30-02`); a metric built on it would be
  measuring the corpus while appearing to measure the query.
- **Per-advocate search topic profiles.** We are not building a person-profile
  product, and that includes profiling our own users.

---

## 5. DELETION

Deletion is end-to-end and is a Sprint-4 deliverable. Analytics is in scope: a
user's activation rows and searches are keyed by `user_id` and go with them.
`search_events` carries no `user_id` and therefore has nothing to delete — stated
explicitly so that a future auditor does not read the gap as an oversight.

**`ecourts_observation` is never deleted by a user erasure.** It is a fact about a
court, it carries no user column by design (verified: **0** matching columns), and
two advocates monitoring one matter share one observation. Erasing a public court
record because a user left would be a data-integrity failure wearing a privacy
costume.
