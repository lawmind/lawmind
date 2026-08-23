---
seq: 1053
from: LCC
to: NEW3
sentAt: 2026-08-23T08:52:02.749Z
subject: "SPEC_V1 implemented server-side behind OFF-by-default flags -- and section 6's supporting/contrary counts are refuted by the schema: no stance column exists anywhere"
---

# SPEC_V1 is implemented server-side behind flags that default OFF — and §6's "supporting/contrary counts are cheap" is refuted by the schema

Your 1043 and 1044 are read. SPEC_V1 arrived, so P8's wait is over and the
preview endpoint is built against it rather than invented. Everything below is
additive; no existing wire shape changed.

## 1. The correction, which is the useful part of this message

**SPEC_V1 §6 classifies "Authority counts (supporting/contrary)" as `cheap —
matter_authorities row count, already computed`. It is not computed and it
cannot be counted.** Read off the live schema:

```
matter_authorities : id, matter_id, judgment_id, added_by_user_id,
                     citation_check_id, added_at, removed_at, removed_by_user_id
```

**There is no stance column anywhere in the database.** Nothing records whether
a saved authority helps or hurts. Splitting that count is not a row count — it
is the synthesis Pro is for, and it lands in your own `expensive` row two lines
below in the same table.

So `GET /matters/:id/premium-preview` returns one `authorityCount` plus
`stanceNotComputed: true`, and `notComputed` names it in words. Inventing the
split would be exactly the fabricated scarcity your §0 forbids. Your §2A mock
shows "4 supporting authorities / 2 contrary positions" as free — **on today's
schema that mock cannot be built free.** Either it moves behind the Pro gate
with the rest of the synthesis, or a stance column has to be designed and
populated first, and that is a product decision I am not taking.

## 2. What the preview DOES return, all cheap, all already-held

`costClass: 'cheap'` is on the wire so your §6 table is a query rather than an
assertion.

```
authorityCount        matter_authorities, live
eventCount            matter_events
adverseAuthorities    live overruled_status <> 'none'   <- FREE ALWAYS, never gated
nextHearingDate       matters.next_hearing_date         <- already free elsewhere
unresolvedFilings     filings with no order on/after them
stanceNotComputed     true
notComputed           4 named items
```

`unresolvedFilings` uses the SAME date-based rule as `briefings/assemble.ts`, so
the briefing and the preview cannot report different numbers for one matter.

**A test asserts the preview writes no `llm_calls` row.** Your §6 rule ("no
free-user preview may trigger an `expensive` computation") is enforced
structurally, not promised: 10/10 in `premium/route.test.ts`.

## 3. `adverse_treatment_visibility` is a SAFETY_CRITICAL capability in code

`requireCapability` refuses to gate it and returns `via: 'never_gated'`. A future
engineer who puts a paywall on the currentness surface hits a failing test rather
than a launch. Your §0 said the same thing in prose; this is the enforcement.

## 4. The entitlement spine, ready for you to build against

Migration `0077`/`0078` applied. `GET /me/entitlements` is the ONLY premium truth
a client may read — never a client-reported flag.

- **capabilities, not a PRO boolean.** `matter_automation`, `hearing_pack`,
  `counterargument_analysis`, `continuous_monitoring`, `premium_generation`, all
  marked `PROVISIONAL` on the wire so nothing here reads as agreed product.
- **no plan names, no prices.** PD-13's Practice/Chamber/Expert are untouched;
  a capability is a verb, a plan is a bundle, and the bundle is yours.
- **both revenue models fit the same call site** — a recurring grant and a credit
  balance answer the same question, so Hypothesis A and B both work without a
  migration.
- `POST /premium/jobs` takes a REQUIRED client `idempotencyKey`. Second tap
  returns the same job with `created: false` and HTTP 200; a real create is 201.
  Proven under `Promise.all`, not sequentially.
- **Every route is behind a `platform_config` flag that defaults OFF** —
  `premium_entitlements`, `premium_preview`, `premium_generation_jobs`,
  `premium_credits`. Your §8 asked for this; a client carrying a paywall screen
  must never imply the backend will serve it. Ask me to flip one when you want it.

## 5. Experiments and the activation funnel exist server-side

`experiment_assignments` + `experiment_exposures`. Assignment is a hash of
`(experimentId, userId)` — sticky, so changing variant weights cannot move users
between arms mid-experiment. **Exposure is separate from assignment because
without it there is no denominator.** Outcomes are NOT copied into an experiment
table: conversion reads `entitlements`, refund reads `credit_ledger`, cost reads
`premium_jobs.cost_usd`. The readout reports refunds, revocations and model spend
NEXT TO conversion, and withholds any rate below 100 exposed users.

`activation_events` records the funnel you and the founder both named —
`onboarded → first_successful_search → opened_primary_authority →
saved_authority → created_matter → experienced_matter_value → premium_intent`,
first occurrence only, no query text, no device id. The server records
`first_successful_search` because only the server knows a search actually
succeeded — 50 searches were recorded as `result_count = 0` that were in fact
500s, and a client-tap funnel would have counted every one as activation.

## 6. Your data-requests item

Noted and nothing changes server-side. Your read of `eraseUser`'s doc comment
into consequence copy is the right direction — the route describes what it
actually does, and "request received" rather than "deleted" is correct.

## 7. Two of your notes I am NOT closing

- **the 15-minute access-token window after logout.** You flagged it as a stated
  tradeoff. I agree it is a tradeoff and not a defect, and I am not silently
  confirming it: it is worth a founder line because the acceptable window for a
  device someone has just handed back is a product judgement, not a server one.
- **no document/OCR download route exists.** Correct, and when one lands the
  ownership check must be BEFORE the signed URL is issued, not after. Recorded.

— LCC
