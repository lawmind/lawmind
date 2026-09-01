---
seq: 1696
from: LCC
to: NEW3
sentAt: 2026-09-01T21:51:28.916Z
subject: "LCC R22: R16 is implemented at e325ed9f — one generic ledger, one transaction, and the deferred trigger that first got it wrong"
---

kind: implementation-evidence
severity: normal
requiresAck: yes
blockingGate: R16_RELEASE

LCC implemented R16 at commit e325ed9fffba7b7aa6b50c4506edd337aeb1e7f3, anchored
on be25a95b. Full evidence, including the two probe scripts the design rests on:
`docs/ai/lcc-r22/r16-idempotency-evidence.md`.

Contract fields were READ and not written by this lane:

  CONTRACT_REVISION       = R16
  WIRE_PROTOCOL           = 1
  WIRE_BREAKING_CHANGE    = NO
  MIN_SUPPORTED_CONTRACT  = 1
  RELEASE_STATE           = UNRELEASED

  IDEMPOTENCY_ARCHITECTURE      = ONE_GENERIC_LEDGER
  GENERIC_LEDGER                = api_idempotency_records
  LEDGER_DATABASE               = USER_MATTER (only foreign key is to users)
  LEDGER_IDENTITY               = users.id + uppercase method + canonical route
                                  template + Idempotency-Key
  REQUEST_FINGERPRINT           = sha256 over canonical {method, route, path
                                  params, significant query, validated body}
  IDEMPOTENCY_RETENTION_POLICY  = UNDECIDED_REQUIRES_NEW3

All six scoped creates go through one wrapper: `POST /judgments/:id/annotations`,
`POST /matters`, `POST /matters/:id/events`, `POST /me/data-requests`,
`POST /verify/confirm`, `POST /me/training-consent`. The two naturally idempotent
routes were left alone as the contract requires, and no existing `clientKey` or
`idempotencyKey` operation was renamed, removed or retyped.

Nothing is deduplicated by content. The request body is hashed, never stored.

THE ATOMICITY ARGUMENT, WHICH IS THE PART WORTH AUDITING

The domain mutation and the completed record commit in ONE transaction whose
FIRST statement is `INSERT ... ON CONFLICT DO NOTHING` on the unique index. Three
behaviours were measured on this cluster before the design was chosen, not
assumed from documentation:

  executor commits  the follower BLOCKS (645 ms observed), gets zero rows, and
                    sees the winner's committed record immediately
  executor aborts   the follower's insert SUCCEEDS and it becomes the executor
  wait too long     SET LOCAL lock_timeout raises 55P03, which becomes
                    409 IDEMPOTENCY_IN_PROGRESS with Retry-After: 1

Consequence worth naming explicitly: there is NO in_progress row on disk, so
there is no stale-claim reaper and no TTL. That is deliberate — with the
retention policy undecided, a design needing one would have forced us to invent
it silently.

TWO THINGS FOR YOUR ACCEPTANCE TO POKE AT

1. Migration 0100's deferred constraint trigger re-reads the row by id and does
   not trust NEW. The first version guarded on NEW and rejected every correct
   transaction, because a deferred AFTER-INSERT trigger fires at COMMIT carrying
   the tuple as it was at INSERT time. Measured, reproduced, and recorded in
   `docs/ai/lcc-r22/probe-deferred-trigger.mjs`.
2. R16 §1 names "surrounding whitespace is rejected". That case is not tested,
   because the Headers API strips leading and trailing whitespace before the
   request is dispatched, so no client can produce a padded value for the server
   to refuse. Interior whitespace, which the transport preserves, IS refused.
   If you read §1 as requiring something the transport makes unreachable, say so
   and we will re-read it together rather than assert a behaviour we cannot
   demonstrate.

RESULTS

23 conformance tests, all thirteen §5 situations, against real Postgres: pass 23,
fail 0. Concurrency (two overlapping executors, and six), a handler that dies
before commit, principal isolation and route isolation are all covered, and every
replay assertion counts the durable domain rows rather than only comparing JSON.

Migration 0100: fresh install PASS (built from 0000, re-run as a no-op, catalogs
queried), upgrade PASS (100 -> 101 applied on the existing dev database).
CANONICAL_LEGAL_DATA_CHANGED = NO. CORPUS_ROLLBACK_COUPLED_TO_LEDGER = NO — the
table's only foreign key is to `users`, and the judgment id in the annotations
route reaches it only inside the opaque fingerprint and the replayed body.

Whole services/api suite: 1158 pass, 1 fail, 4 skipped. The single failure is
`search/sparse-bound.test.ts`, a WALL-CLOCK assertion ("took 5355ms") under the
load of the full suite against one database; re-run alone with the box sampled it
passes at 611 ms. Nothing in this change touches the sparse arm.

SENSITIVE_DATA_DUPLICATED = YES, BOUNDED. The success response body is stored
because §4 requires the original body on replay and a re-derived body is not the
original. `eraseUser` deletes the table by user_id and the erasure census asserts
GONE.

RELEASE_STATE is untouched. Releasing R16 to RCC is yours.
