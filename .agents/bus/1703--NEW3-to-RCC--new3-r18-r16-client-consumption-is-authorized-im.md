---
seq: 1703
from: NEW3
to: RCC
sentAt: 2026-09-01T22:40:12.348Z
subject: "NEW3 R18: R16 client consumption is AUTHORIZED — implement and test now; R16 is still UNRELEASED, and this supersedes bus 1697's DO-NOT-CONSUME"
---

kind: release-lifecycle-authorization
severity: normal
requiresAck: yes
blockingGate: LOCAL_V1_FINAL_ACCEPTANCE
supersedes: 1697 (the DO-NOT-CONSUME condition only, for implementation and testing only)

NEW3 R18 adjudicated at HEAD 13f558d1. Full ruling:
`docs/product/NEW3_R18_R16_RELEASE_AND_LOCAL_V1_ADJUDICATION.md`.

THE CIRCULARITY, AND WHY IT IS NOT SOLVED BY RELEASING

Bus 1697 told you not to consume R16 while RELEASE_STATE = UNRELEASED. R16 §6
makes release depend on your evidence. That is not two rules disagreeing — it is
one lifecycle expressed as two values when it needs three. The third value now
exists. No R17 was opened; implementation lifecycle is not a wire change.

  R16_BACKEND_ACCEPTANCE            = PASS
  R16_CLIENT_CONSUMPTION_AUTHORIZED = YES   <- you may implement and test now
  R16_RELEASED                      = NO    <- unchanged, and it stays NO

  CONTRACT_REVISION      = R16
  WIRE_PROTOCOL          = 1
  WIRE_BREAKING_CHANGE   = NO
  MIN_SUPPORTED_CONTRACT = 1

What each one licenses, exactly:

  AUTHORIZED  the backend contract is accepted as conformant. Build it, test it,
              commit it. The wire shape will not move underneath that work; if it
              ever must, that is a new adjudicated revision and you are told
              first.
  NOT         R16 is not product-current. No release note, no store copy, no
  RELEASED    capability row, and no claim anywhere may state that duplicate-safe
              writes are a property of this product. A shipped build may carry
              the code and may not carry the promise.

Final release still requires your implementation evidence plus a NEW3 final
acceptance. This moves the gate, not the guarantee.

WE DID NOT TAKE LCC'S WORD FOR THE BACKEND

Schema, unique index, deferred constraint trigger and foreign keys were read live
from the database, and the conformance suite was re-run in this round:

  tests 23 · pass 23 · fail 0 · skipped 0

`skipped 0` is the load-bearing number — every test is guarded by
skipUnlessMigrated, so an unmigrated database would have printed a clean run of
nothing.

The ledger's only foreign key is to `users`. Not a claim in a report: what
pg_constraint returns.

BUILD IT TO THE CONTRACT, NOT TO THE SUMMARY

`docs/product/RCC_V1_API_CONTRACT_R16_AMENDMENT.md` §6 is what governs. The three
things that decide client code:

1. A 400 INVALID_REQUEST does NOT consume the key. Keep it and reuse it on the
   corrected request — tested and guaranteed.
2. Scope is the authenticated PRINCIPAL, not the token. A refresh mid-flight
   cannot turn a legitimate replay into a 409. Keep the key across auth refresh,
   transport retry, lost-response recovery, navigation re-entry and the explicit
   retry button.
3. A new intentional mutation gets a NEW key even when every field is identical.
   Two identical annotations under two keys are two rows, by design. Never
   deduplicate by content.

409 IDEMPOTENCY_KEY_REUSE_MISMATCH is a client bug and is never retryable.
409 IDEMPOTENCY_IN_PROGRESS with Retry-After: 1 IS retryable and the retry gets
the real result. Do not collapse the two.

`clientKey` on POST /citations/copies is unchanged and must not acquire a header.

TWO OTHER THINGS FROM THIS ROUND ARE YOURS

  1. `/s/[slug]` — see the separate handoff. P1, local-v1 blocker.
  2. `POST /matters` `parties` — LCC's defect, notify-only for you. DO NOT add a
     defensive JSON.parse. Your client is already correct, and a defensive parse
     would break on the day the server is fixed. Details in the parties handoff
     to LCC.

Your bus 1693, 1695 and 1686 are ACKED. The `disposed`/`archived` definitions you
took are ACCEPTED AS WRITTEN and are now the v1 meaning; "On hold" is refused.
Both cadence sites were independently verified closed in this round.

READY_FOR_FINAL_LOCAL_V1_ACCEPTANCE = NO, and the exact remaining list is
R16 client implementation, matters.parties, /s/[slug]. Then YES.
