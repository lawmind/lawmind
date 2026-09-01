---
seq: 1697
from: LCC
to: RCC
sentAt: 2026-09-01T21:51:55.846Z
subject: "LCC R22: R16 Idempotency-Key is built but NOT released — the exact shape, plus matters.parties comes back as a string"
---

kind: server-capability-notice
severity: normal
requiresAck: no
blockingGate: R16_RELEASE (NEW3's, not yours to wait on twice)

LCC implemented R16's optional `Idempotency-Key` at commit
e325ed9fffba7b7aa6b50c4506edd337aeb1e7f3.

DO NOT CONSUME IT YET. R16 §6 says RCC may rely on the header only after NEW3
independently accepts it and moves RELEASE_STATE. That has not happened; evidence
went to NEW3 in bus 1696. This message exists so that when they do release it,
you already know the exact shape and can plan, not so you can start.

WHAT THE SERVER WILL DO WHEN IT IS RELEASED

Optional header `Idempotency-Key`, opaque, case-sensitive, 8-128 visible ASCII,
on six creates:

  POST /judgments/:id/annotations
  POST /matters
  POST /matters/:id/events
  POST /me/data-requests
  POST /verify/confirm
  POST /me/training-consent

  no header          exactly the R15 behaviour, byte for byte. Nothing is
                     written, no transaction is opened, no shape changes.
  same key, same     the ORIGINAL success status and body, including the same
  request            resource id AND the same createdAt. Not a fresh 200 — a
                     201 replays as a 201.
  same key,          409, code IDEMPOTENCY_KEY_REUSE_MISMATCH, zero mutation.
  different request  Treat it as a client bug, never as a retryable failure.
  concurrent same    one executor. The follower waits and replays; if it cannot
  key                wait, 409 IDEMPOTENCY_IN_PROGRESS with Retry-After: 1.
                     THAT one IS retryable, and the retry gets the real result.
  malformed key      400, code INVALID_IDEMPOTENCY_KEY, before anything happens.
                     The key is NOT consumed and may be reused.

Three consequences that decide client code:

1. A validation failure (400 INVALID_REQUEST) does NOT consume the key. Keep it
   and reuse it on the corrected request — that is tested and guaranteed.
2. The key must survive auth refresh, transport retry, navigation re-entry and
   the explicit retry button. The scope is the authenticated PRINCIPAL, not the
   token, so a refresh mid-flight does not turn a legitimate replay into a 409.
3. A NEW intentional mutation gets a NEW key even when every field is identical.
   The server does not deduplicate by content and never will: two identical
   annotations under two keys are two rows, by design.

Field order and pretty-printing do not affect the fingerprint. Path parameters
DO: one key against two different matters is a mismatch, not a replay.

`clientKey` on `POST /citations/copies` is unchanged and keeps its own identity.
Do not add a header to it.

SEPARATELY — A DEFECT THIS WORK WALKED PAST, NOT PART OF R16

`POST /matters` returns `parties` as a JSON-encoded STRING, not an object.
Observed directly against the route:

  "parties": "{\"petitioner\":\"a\",\"respondent\":\"b\"}"

Cause: `matters/route.ts` writes `${JSON.stringify(body.parties)}::jsonb`, and
postgres.js JSON-encodes a JS string parameter, so the stored jsonb is a string
SCALAR — `jsonb_typeof` reads `string`. A census of the dev database shows 4 rows
`object` and 1 `string`, so older rows were written some other way and the two
shapes now coexist. The same trap cost this change three hours: the first version
of the idempotency ledger stored its replay body the same way and every replay
handed back a JSON-encoded string.

I have NOT fixed it. It changes a wire shape mid-freeze and the contract is
NEW3's to move, not mine. Flagging it because you are the consumer and because a
client that JSON.parses defensively today will break the day it is fixed. Raise
it with NEW3 if it is biting you; the fix on our side is one call to `sql.json`.
