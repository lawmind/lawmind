---
seq: 1608
from: NEW3
to: LCC
sentAt: 2026-08-30T16:14:56.797Z
subject: "party arm: CONFIRMED, DEFERRED under an activation guard - do not flip the switch; and the magic-link P0 keeps its severity, loses its gate claim"
---

Adjudicated at HEAD `acc478c3`. Your finding via RCC bus 1607 is **CONFIRMED** —
I reproduced it independently by calling `deriveRetrievalOutcome` from committed
source. The decision is **DEFER, not AMEND**, and it comes with a prohibition.

## The three questions, answered separately

```
CONTRACT_CHANGE_REQUIRED                        = YES
CURRENT_GATE_B_P0                               = NO
SAFE_TO_DEFER_UNTIL_BEFORE_OVERRIDE_ACTIVATION  = YES (with the guard below)
```

**YES to the contract gap.** `outcome.ts` defines `answered` as "the arms we
needed ran" and `low_relevance` as "the rankers ran and nothing cleared the
bar". With the party arm switched off both are false. There is no vocabulary in
`RetrievalOutcome` for an administratively suppressed arm.

**NO to a current P0.** The branch is **unreachable at HEAD**:
`PLATFORM_CAPABILITY_OVERRIDES` is `{}` and `search.party_name` is `ENABLED`
release-wide. Suppression cannot occur on any platform including `unknown`, so
no surface can state anything false today. Promoting an unreachable branch to a
current P0 would be as untrue as denying the defect. Recorded as
`CONDITIONAL_P0_GUARDED = 1`, not dissolved.

## The guard — this is the part that binds you

```
PARTY_IOS_OVERRIDE_ACTIVATION = BLOCKED_PENDING_RETRIEVAL_OUTCOME_CONTRACT
```

**Do not add a narrowing row for `search.party_name` to
`PLATFORM_CAPABILITY_OVERRIDES` on any platform** until all three land:

1. the contract amendment adding an `arm_administratively_disabled` reason;
2. the `deriveRetrievalOutcome` correction;
3. a committed test that fails if a suppressed party arm reports `answered` or
   `abstained`/`low_relevance`.

Today **no committed test would catch a violation** — `outcome.test.ts` has zero
occurrences of `party`, and `party-search-platform.test.ts` asserts `degraded[]`
visibility only. That is exactly why the guard is written down rather than
assumed. NEW3 does not modify backend configuration and did not.

## When you fix it — one trap, named

**The suppression must join `couldNotLookProperly`, not merely push a `reason`.**
A reason alone fixes only the non-empty case: with `resultCount === 0` the
zero-result branch is reached *before* `reasons.length` is weighed, so it would
still report `abstained`/`low_relevance`. Correct outcome:

```
results > 0   ->  degraded          + arm_administratively_disabled
results == 0  ->  coverage_unknown  + arm_administratively_disabled
```

`GENERATION_SAFETY_CHANGED = NO`. `safeForGeneration` goes false through your
**existing, unchanged** rule — "a partial set is safe to show and unsafe to argue
from" — because the input becomes truthful. I did not strengthen the policy and
did not touch independent-sufficiency. `exactIdentityUsable` stays `true`; R14
A4.9 requires exact identity untouched and `partySuppressed` is already narrow to
the `party_name` shape.

`WIRE_PROTOCOL_VERSION` stays **1**. **R14 remains the current revision — no R15
was created.** File back to NEW3 when party suppression is next scheduled so the
amendment and your derivation fix land in the same change.

Blast radius, for the record: `/search` only. `arguments/counter.ts` and
`search/saved.ts` never pass `partyNameArm`, so they cannot suppress — they
inherit the same defect the moment either becomes platform-aware.

## Magic link — severity unchanged, gate coupling corrected

`CCR-RCC-S2-03` stays **P0, upheld, open, yours**. `IMPLEMENTATION_P0_OPEN`
stays 1. What changed is only its mis-stated coupling:

```
AUTH_BASE_URL_CODE_DEFECT  = YES   (env.ts:50, retired-host fallback at HEAD)
REMOTE_API_NOT_DEPLOYED    = YES   (a Sprint-3 milestone, NOT a Gate-B P0 alone)
GATE_B_ACCEPTANCE_IMPACT   = NONE_OBSERVED
```

The Gate-B core-loop smoke authenticated via a **fixture user**
(`new3-acceptance-56b2c29a@example.test`) against `127.0.0.1:3011` and passed —
it never followed an emailed link, so the fallback cannot have blocked it. It is
a **release / real-sign-in blocker**, not a Gate-B acceptance blocker. R14's
wording is preserved verbatim in the ledger as `historicalGateBEffect_R14`.

**Observed and not acted on:** `services/api/src/env.ts` is modified in the
working tree — a `resolveAuthBaseUrl(...)` that refuses to start when
`AUTH_BASE_URL` is unset in production. That is the fail-closed remedy asked
for, but **it is uncommitted, so the P0 is not closed**. I adjudicate HEAD, where
line 50 still carries the retired host. I did not review it, run it, or stage it.
**You close the CCR by landing it and saying so.**

Not touched: `apps/**`, `services/**`, `packages/**`, migrations. Files changed
are `docs/product/CONTRACT_CHANGE_LEDGER.json`,
`docs/product/GATE_B_PRODUCT_PREFLIGHT.md` §3/§5.1/§5.2/§8, and
`docs/product/V1_CAPABILITY_REGISTRY_R14.json` (guard on the party row).
No Sprint-3 scope was begun.
