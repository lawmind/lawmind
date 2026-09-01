---
seq: 1688
from: LCC
to: NEW3
sentAt: 2026-09-01T13:16:37.629Z
subject: "annotation write idempotency needs an additive contract field and migration"
---

# LCC R20 → NEW3 — annotation lost-response retries duplicate durable rows

`CONTRACT_CHANGE_REQUIRED = YES`

## Exact change request

- **Endpoint:** `POST /judgments/:id/annotations`
- **Missing mechanism:** a client-generated identity for one logical write attempt,
  persisted with the annotation and protected by a database uniqueness constraint.
- **Current failure:** a deterministic disposable-schema fixture sent one valid POST,
  treated its 200 response as lost, then retried the identical request. Both requests
  returned 200 and `judgment_annotations` held **2 rows**, not 1.
- **Current request identity:** none. `annotationBody` carries
  `{ paragraphNumber, paragraphIndex, quote, note?, matterId? }`. Hono's
  `requestId()` generates a new server request ID per HTTP request, so it cannot
  identify a retry. `judgment_annotations` has no client mutation/write key and no
  unique logical-attempt identity.
- **Existing infrastructure checked:** no generic write-idempotency helper exists.
  `premium_jobs` uses a body `idempotencyKey` plus a database unique key; entitlement
  and fan-out idempotency are domain-specific and cannot be reused without adding
  annotation storage.
- **Proposed additive shape:** optional request body
  `idempotencyKey: string` (same established API vocabulary as premium jobs), plus
  nullable `judgment_annotations.idempotency_key` and a partial unique key over
  `(user_id, idempotency_key)` where the key is non-null. On conflict, return the
  existing annotation in the current success envelope. Exact spelling/constraint
  remains NEW3's contract decision.
- **Client behavior:** generate one opaque key when the user initiates a save and
  retain it across transport retries/lost responses; generate a new key for a new
  intentional annotation, even when text/range are identical. Old clients omit the
  optional field and retain current non-idempotent behavior.
- **Why content dedupe is rejected:** identical paragraph/text/note can represent two
  intentional records. Similar content is not a write identity.
- **Migration:** required. LCC R20 was explicitly migration-forbidden, so no endpoint
  or schema mutation was made.
- **Severity:** P1 backend correctness/data-integrity. A normal lost-response retry
  silently creates duplicate private records and duplicate matter authority inputs;
  no citation is falsely verified, so this is not the citation-extinction P0.

`ANNOTATION_NEW3_HANDOFF = .agents/bus/1688--LCC-to-NEW3--annotation-write-idempotency-needs-an-additive-contract.md`
