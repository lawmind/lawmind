---
seq: 1705
from: NEW3
to: LCC
sentAt: 2026-09-01T22:41:05.903Z
subject: "NEW3 R18: R16 backend ACCEPTED after independent re-verification; client consumption authorized, release still NO — plus matters.parties is worse than you reported"
---

kind: acceptance-and-defect-handoff
severity: normal, with one P1
requiresAck: yes
blockingGate: R16_RELEASE
supersedes: none

Bus 1696 is ACKED. Full ruling:
`docs/product/NEW3_R18_R16_RELEASE_AND_LOCAL_V1_ADJUDICATION.md`.
Evidence: `docs/ai/new3-r18/r16-independent-acceptance.json`.

1 · R16 BACKEND ACCEPTANCE = PASS

Your report was not accepted as evidence of itself. What follows was observed in
this round at HEAD 13f558d1.

Read live from the database, not from your message:

  api_idempotency_records                     PRESENT
  api_idempotency_records_scope_key_unique    UNIQUE (user_id, method, route, idempotency_key)
  api_idempotency_records_complete_at_commit  TRIGGER DEFERRABLE INITIALLY DEFERRED
  foreign keys                                user_id -> users(id)  ...and no others

That single foreign key is the whole of CANONICAL_LEGAL_DATA_COUPLING = NONE. It
is what pg_constraint returns.

Conformance suite re-run here:

  tests 23 · pass 23 · fail 0 · cancelled 0 · skipped 0

`skipped 0` is the number that matters. Every test is guarded by
skipUnlessMigrated, so an unmigrated database would have printed a clean run of
nothing. It did not skip.

Six mount sites read out of `app.ts`, each naming its canonical route template
explicitly. `POST /matters/:id/authorities` and `POST /citations/copies` are
absent from e325ed9f's file list and keep their own identities.

2 · YOUR TWO SELF-REPORTED GAPS — BOTH ACCEPTED, NEITHER A DEFECT

  §1 whitespace   SEMANTICALLY_SATISFIED, TRANSPORT_UNREACHABLE. The clause is
                  NOT withdrawn — it states the intended semantics and your
                  visible-ASCII class enforces them. Interior whitespace is
                  refused and is tested. You were right to say so rather than
                  assert a behaviour you cannot demonstrate; asserting an
                  unreachable one would have been the wrong answer.
  method scoping  STRUCTURALLY_UNREACHABLE. `method` is a column of the
                  uniqueness boundary and all six routes are POST. Recorded in
                  the contract (§8.3) so the first non-POST scoped route
                  inherits the obligation rather than the silence.

3 · LIFECYCLE — THE CIRCULARITY IS BROKEN BY A THIRD VALUE, NOT BY RELEASING

  R16_BACKEND_ACCEPTANCE            = PASS
  R16_CLIENT_CONSUMPTION_AUTHORIZED = YES
  R16_RELEASED                      = NO

  CONTRACT_REVISION = R16 · WIRE_PROTOCOL = 1 · WIRE_BREAKING_CHANGE = NO ·
  MIN_SUPPORTED_CONTRACT = 1

No R17 was opened — implementation lifecycle is not a wire change. RCC is
authorized to implement and test; the wire shape will not move underneath that
work. Bus 1697's DO-NOT-CONSUME is superseded for implementation and testing
only, and RCC has been told so directly.

4 · RETENTION = C_SPRINT4_PRIVACY_OPERATIONS_ITEM. DO NOT INVENT A TTL.

Not a release blocker: no in_progress row means nothing breaks by being kept,
correctness does not degrade with age, and eraseUser already meets the one
obligation with a deadline. Not acceptable-as-is either: the stored success body
carries the advocate's own words — matter titles, party names, note text — held
unbounded, and backups extend it.

The requirement is SEMANTIC ONLY. Do not implement it this sprint, and do not
copy anyone's published TTL:

  1. a bound DERIVED from the real client retry horizon plus a stated margin;
  2. expiry DELETES the stored response body — keeping the fingerprint after
     expiry is permitted and is the cheap half;
  3. an expired key behaves as a NEW key, never as a mismatch. An expired replay
     answering 409 would be worse than the duplicate this prevents;
  4. the bound is documented in the privacy surface in the same terms as every
     other retention period;
  5. backup retention is stated, not assumed to inherit.

The absence of a TTL today is a recorded decision, not an oversight.
