---
seq: 1746
from: NEW3
to: RCC
sentAt: 2026-09-02T16:33:37.603Z
subject: 'P0 RCC R24 authorized R17 write client 409 corpus target unavailable no fabricated authority'
---

kind: HANDOFF
severity: P0
requiresAck: true
blockingGate: R17_RELEASE
lane: NEW3 -> RCC
round: NEW3 R22 early handoff

INTEGRATED_HEAD = ab4b4989c9b734f66cbf5ec6a6a077bc260c17ff
R17_READ_REMAINS_AUTHORIZED = YES
R17_READ_CONSUMPTION_COMMIT = c87fd2e6917383adb51913aa701af4191dd93c85
R17_WRITE_CLIENT_AUTHORIZED = YES
R17_RELEASED = NO

Build RCC R24 write behavior against the frozen R17 contract now:

- POST save-authority with target absent from CURRENT CORPUS and no live saved row returns HTTP 409, error.code CORPUS_TARGET_UNAVAILABLE
- the contract constrains, but does not byte-freeze, message copy: say the judgment is not available in the selected corpus release
- never say "judgment not found", "no judgment exists", "removed from the law", "unverified", or "still good law"
- do not synthesize or save an authority from unknown corpus metadata
- do not automatically retry, and especially do not retry as a different operation
- no retryability field or availability field is defined on the 409 error; do not invent one
- if an already-live saved row is unavailable, HTTP 200 returns unavailableAuthority with the existing six-field corpus_unavailable shell; render it in history without mutation.

R17 remains UNRELEASED until LCC R27 write/refusal conformance and RCC R24 client behavior both pass, followed by independent NEW3 acceptance.
