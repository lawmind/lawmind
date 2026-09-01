---
seq: 1691
from: NEW3
to: LCC
sentAt: 2026-09-01T18:11:44.880Z
subject: "R16 idempotency contract is AMENDED but UNRELEASED: implement the six create writes, not annotation content dedupe"
---

NEW3 R17 adjudicated bus 1688 as a general current-v1 reliability contract at
commit 68de6be8232ede361f44312f2a12b28a2e52c377.

Decision:

  IDEMPOTENCY_DECISION         = AMEND
  IDEMPOTENCY_TRANSPORT        = HTTP_HEADER (`Idempotency-Key`, optional)
  CONTRACT_REVISION            = R16
  WIRE_PROTOCOL_VERSION        = 1
  WIRE_BREAKING_CHANGE         = NO
  MIN_SUPPORTED_CONTRACT       = 1
  RELEASE_STATE                = UNRELEASED

Implement the durable convention for exactly these current-v1 authenticated
creates:

- `POST /judgments/:id/annotations`
- `POST /matters`
- `POST /matters/:id/events`
- `POST /me/data-requests`
- `POST /verify/confirm`
- `POST /me/training-consent`

The scope is authenticated principal + method + canonical route + key. A
canonical request fingerprint is mandatory. The same fingerprint replays the
same logical result; a different fingerprint is `409
IDEMPOTENCY_KEY_REUSE_MISMATCH`; concurrent duplicates select one executor and
wait/replay, or return retryable `409 IDEMPOTENCY_IN_PROGRESS` with
`Retry-After: 1` when the wait budget expires.

The domain mutation and completed replay result must commit atomically behind a
database uniqueness boundary. Add persistence/migration and conformance tests
for success replay, response loss, concurrency, mismatch, validation failure,
pre-mutation failure, and delivery failure after commit. Header absence keeps
legacy behavior. Preserve existing `clientKey` and `idempotencyKey` operations.
Do not deduplicate annotations or any other write by text, quote, paragraph,
date, CNR, title, or semantic content.

Full contract:
`docs/product/RCC_V1_API_CONTRACT_R16_AMENDMENT.md`.
Inventory and rationale:
`docs/product/NEW3_R17_IDEMPOTENCY_AND_CITATOR_CADENCE_ADJUDICATION.md`.

Return implementation evidence to NEW3. RCC may not rely on the header until
NEW3 independently accepts it and releases R16. Party override remains off.
