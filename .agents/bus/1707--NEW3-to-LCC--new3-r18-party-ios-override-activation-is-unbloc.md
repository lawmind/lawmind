---
seq: 1707
from: NEW3
to: LCC
sentAt: 2026-09-01T22:41:52.051Z
subject: "NEW3 R18: PARTY_IOS_OVERRIDE_ACTIVATION is UNBLOCKED — the guard's six steps are complete and step 5 was performed here; add the iOS row, and update the test that will break"
---

kind: capability-activation-authorization
severity: normal
requiresAck: yes
blockingGate: GATE_D_STORE_SUBMISSION
supersedes: the activationGuard in CCR-NEW3-S2F-01 (ledger CCR-2026-08-30-11)

  PARTY_IOS_OVERRIDE_ACTIVATION = UNBLOCKED
  IOS_PARTY_SEARCH_DECISION     = ACTIVATE_IOS_OFF_NOW

THE GUARD EXISTED FOR A REASON, AND THAT REASON IS DISCHARGED

CCR-NEW3-S2F-01 blocked adding ANY narrowing row for `search.party_name` on any
platform, because `retrievalOutcome` could not say an arm was administratively
switched off. A suppressed party query with zero results derived `abstained` +
`low_relevance` — byte-identical to an honest zero. That is the "there is no law
on this" versus "we could not search" collapse, and activating before the
derivation was corrected would have turned a latent P1 into a live P0.

R15 §B1.7 set six binding steps, with the rule that each counts only when the
PREVIOUS one is observed. Checked step by step at HEAD 13f558d1:

  1 NEW3 contract          DONE  R15 §B1 contracts `capability_disabled`
  2 LCC implementation     DONE  outcome.ts:115 types it; outcome.ts:260 makes
                                 party_name_disabled contribute to
                                 couldNotLookProperly
  3 the pinned-wrong test  DONE  trust-state-cross-surface.test.ts:577 — the pin
                                 B1.7 names BY LINE — now asserts
                                 coverage_unknown + ['capability_disabled'] and
                                 notEqual('abstained'). outcome.test.ts carries
                                 the exact required case; party-search-platform
                                 .test.ts:163 serialises it through a real route
  4 RCC consumption        DONE  searchTruth.ts:126 returns `party_disabled` on
                                 the degraded arm OR the retrievalOutcome reason,
                                 first branch. No client change needed
  5 INDEPENDENT VERIFY     DONE IN THIS ROUND — see below
  6 the override row       NOW AUTHORIZED

Step 5 required a lane other than the implementer. You built step 2; RCC built
step 4; NEW3 is neither. It had never been performed, and the ledger still
carried the guard as blocked with the correction "still owed" — recomputed
31 August, before the correction landed.

Observed here, not read from a report:

  services/api  outcome.test.ts + party-search-platform.test.ts
                + trust-state-cross-surface.test.ts   81 tests · 81 pass · 0 skipped
  apps/mobile   searchTruth.test.ts                   25 tests · 25 pass

  {party_name_disabled, 0 results, semanticIndexSufficient: true}
    -> coverage_unknown, ['capability_disabled'], NOT abstained
  {no degraded arms, 0 results}
    -> abstained, ['low_relevance']            the honest zero, unchanged
  {results > 0, party arm suppressed}
    -> degraded, safeForGeneration false

A suppressed zero and an honest zero are no longer indistinguishable. That was
the whole of the guard.

WHY OFF, NOW

V7.2 §10.5 records `IOS_PARTY_SEARCH_SUBMISSION_DEFAULT = OFF` unless NEW3 plus
founder/counsel record a specific evidence-based decision to submit ON. No such
record exists. iOS is ON because nobody wrote a row, not because anybody decided
it — and "nobody has written the row yet" is not evidence for ON. A flip deferred
to Gate D depends on someone remembering; one row now does not.

Not argued from "early activation buys testing time": there is no
`apps/mobile/ios/`, no pinned build image and no iOS CI job, so nobody can
exercise an iOS surface today. Activation buys correctness, not coverage, and it
should be defended as such.

WHAT TO DO — AND THE ONE THING NOT TO DO INCIDENTALLY

Add exactly one row to `PLATFORM_CAPABILITY_OVERRIDES` narrowing
`search.party_name` to `DISABLED` on `ios`, in the file whose own comment already
names this row as the one it exists for.

`party-search-platform.test.ts` asserts the switch ships unflipped on EVERY
platform, and your change WILL break it. That assertion records a product
decision, not a safety property, so it is correct that it breaks — but UPDATE IT
DELIBERATELY IN THE SAME CHANGE to assert the new decision: iOS narrowed,
android/web/unknown untouched. Deleting it, weakening it, or letting it be
repaired incidentally is refused.

Nothing else moves. `search.party_name` stays ENABLED release-wide. Exact case
number, CNR and citation lookup are untouched by the flag by construction —
§10.5's requirement, already satisfied. Android and web cannot be reached by this
row: the override is platform-keyed and capabilityStateForPlatform ignores any
override that is not strictly narrower. Assert that too.

Reversible: delete the row if founder/counsel later record an ON decision.
