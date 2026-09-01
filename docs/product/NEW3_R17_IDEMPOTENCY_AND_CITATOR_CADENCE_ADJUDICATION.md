# NEW3 R17 — USER-WRITE IDEMPOTENCY AND CITATOR CADENCE ADJUDICATION

**Lane:** NEW3. **Date:** 1 September 2026.
**HEAD at start:** `ed6226570a2fa03a5d012a2046cc557b3225a31a`.
**Round number:** NEW3 R17. **Product contract revision:** R16. They are separate.

**Inputs:** NEW3 R16 `5e0eb8c1`; LCC R20 `ed622657`; RCC R18
`2bb737e6`; LCC bus 1688; RCC bus 1689/1690; the R15 contract; committed API,
client and schema source at HEAD.

No network request, database write, migration, product-code edit, party override
or background-worker action was performed.

## 1 · Current-v1 create-write inventory

### Token required

| endpoint | evidence at HEAD | classification |
|---|---|---|
| `POST /judgments/:id/annotations` | `annotations.ts` inserts one row with a generated UUID and has no unique logical-attempt key; LCC reproduced 2 rows after a lost-response retry | `IDEMPOTENCY_TOKEN_REQUIRED` |
| `POST /matters` | `matters/route.ts` unconditionally inserts; CNR is nullable and not a write identity | `IDEMPOTENCY_TOKEN_REQUIRED` |
| `POST /matters/:id/events` | append-only timeline insert; no unique key | `IDEMPOTENCY_TOKEN_REQUIRED` |
| `POST /me/data-requests` | read-then-insert returns an existing open kind sequentially, but `0021_data_requests.sql` has no uniqueness constraint, so concurrent duplicates remain possible | `IDEMPOTENCY_TOKEN_REQUIRED` |
| `POST /verify/confirm` | each call inserts a permanent `citation_checks` row | `IDEMPOTENCY_TOKEN_REQUIRED` |
| `POST /me/training-consent` | each call updates the user and appends `training_consent_events` | `IDEMPOTENCY_TOKEN_REQUIRED` |

### Already durable by database identity

| endpoint | evidence at HEAD | classification |
|---|---|---|
| `POST /matters/:id/authorities` | partial unique `(matter_id, judgment_id) WHERE removed_at IS NULL`; conflict returns the existing row | `NATURALLY_IDEMPOTENT_BY_DB_IDENTITY` |
| `POST /citations/copies` | body `clientKey`; database unique `(user_id, client_key)`; retry returns the same copy | `NATURALLY_IDEMPOTENT_BY_DB_IDENTITY` |

### No create-retry risk in this decision

`POST /me/accept-terms`, `POST /alerts/:id/read` and
`POST /briefings/:id/opened` set state on an existing identity; the briefing route
uses `coalesce(opened_at, now())`. `POST /search`, `POST /verify/ecourts` and
`POST /court/lookup` are POST-shaped queries/actions, not user-owned resource
creates. They are `NO_RETRY_RISK` for this inventory. Auth/session endpoints are
outside the same-authenticated-principal convention.

### Held or post-v1

`POST /saved-searches`, `POST /matters/:id/shares`,
`POST /documents/:id/citations`, `POST /arguments/counter` and
`POST /premium/jobs` are `POST_V1` for this adjudication: built does not mean
released. The saved-search reframe remains OD-12, matter sharing and drafting are
held, counterarguments are disabled, and premium generation defaults off. No
dormant route is used to enlarge the R16 scope.

## 2 · Contract decision

```text
IDEMPOTENCY_DECISION         = AMEND
IDEMPOTENCY_TRANSPORT        = HTTP_HEADER
IDEMPOTENCY_SCOPE            = AUTHENTICATED_USER + METHOD + CANONICAL_ROUTE + KEY
REQUEST_FINGERPRINT_REQUIRED = YES
MISMATCH_BEHAVIOR            = 409 IDEMPOTENCY_KEY_REUSE_MISMATCH; NO MUTATION
CONCURRENT_RETRY_BEHAVIOR    = ONE EXECUTOR; WAIT/REPLAY; 409 IN_PROGRESS IF WAIT BUDGET EXPIRES
```

The exact semantics, failure table and endpoint list are in
[`RCC_V1_API_CONTRACT_R16_AMENDMENT.md`](RCC_V1_API_CONTRACT_R16_AMENDMENT.md).
The decisive transport evidence is current convention, not preference: the client
already accepts arbitrary request headers and sends `X-Lawmind-Platform`; a body
field would pollute six unrelated domain schemas and add a third name beside two
existing endpoint-specific keys.

R16 is additive and unreleased. LCC must implement the durable ledger/migration
and tests before RCC relies on the header. Header absence retains legacy behavior
for contract-1 clients.

## 3 · Response and failure semantics

```text
FIRST_SUCCESS                  = NORMAL STATUS/BODY; MUTATION + RESULT ATOMIC
LOST_RESPONSE_RETRY            = ORIGINAL SUCCESS STATUS/BODY; NO SECOND MUTATION
CONCURRENT_DUPLICATE           = ONE EXECUTOR; FOLLOWER REPLAYS OR GETS RETRYABLE IN_PROGRESS
SAME_KEY_DIFFERENT_FINGERPRINT = EXPLICIT 409 REFUSAL
VALIDATION_FAILURE             = KEY NOT CONSUMED
SERVER_FAILURE_BEFORE_MUTATION = KEY CLAIM ROLLED BACK/RELEASED; RETRY MAY EXECUTE
SERVER_FAILURE_AFTER_MUTATION  = COMMIT MUST INCLUDE RESULT; RETRY RETURNS STORED SUCCESS
```

A deterministic business refusal after validation records its fingerprint and
refusal outcome. The same request replays the refusal; a different fingerprint
conflicts. It does not create a resource or become a successful result.

No quote, paragraph, date, case title, CNR or semantic body hash is a write
identity. The fingerprint detects key misuse; it does not merge content across
different keys.

## 4 · Contract identity

```text
CONTRACT_REVISION      = R16
WIRE_PROTOCOL          = 1
WIRE_BREAKING_CHANGE   = NO
MIN_SUPPORTED_CONTRACT = 1
RELEASED_TO_RCC        = NO
```

An optional header does not require wire protocol 2. R16 is the sixth product
contract revision and the wire integer remains 1.

## 5 · Citator cadence claim

RCC observed a real reachable sentence and a real committed schedule. It did not
observe a deployed execution.

```text
STATIC_NIGHTLY_COPY       = REQUIRES_RUNTIME_EVIDENCE
RUNTIME_EVIDENCE_REQUIRED = YES
```

`railway.recheck.json` is configuration. No source in the current contract, API
or client carries `lastCheckedAt` or `nextPlannedCheckAt` for citator currentness.
RCC must remove the entire current sentence with no replacement cadence promise.
The exact future dynamic forms and evidence bar are in
[`V1_CLAIMS_REGISTER_R15.md`](V1_CLAIMS_REGISTER_R15.md).

This is not eCourts monitoring. No monitoring state, cadence, SLA or price moves.

## 6 · Capability and claim effects

```text
CAPABILITY_REGISTRY_REVISION = NONE
CAPABILITY_STATE_CHANGES     = 0
ENABLED_WITHOUT_EVIDENCE     = 0
CLAIMS_REGISTER              = R15
UNSUPPORTED_REACHABLE_CLAIMS = 1, pending RCC removal
```

The idempotency contract makes existing creates reliable; it enables no feature.
The current claims defect is counted rather than hidden. It returns to zero only
after RCC removes the static sentence.

## 7 · Handoffs

### LCC

Implement R16 for the six scoped routes with a database-enforced durable ledger,
atomic mutation/result commit, canonical fingerprints, mismatch/in-progress error
codes, success replay and concurrency/lost-response/failure tests. Preserve the
existing `clientKey` and `idempotencyKey` routes. File any proposed deviation back
to NEW3; do not substitute annotation content dedupe. A migration is required but
was not run by NEW3.

For cadence, configuration remains insufficient. If LCC wants cadence copy
restored, first produce durable production-run evidence and propose contracted
per-authority `lastCheckedAt`; add `nextPlannedCheckAt` only if the deployed
scheduler can truthfully supply it.

### RCC

Remove `Re-checked every night. If this changes before your hearing, you will be
told.` now, with no replacement cadence sentence. After R16 is released, generate
one opaque header key per logical mutation for the six scoped routes and retain it
across auth refresh, transport retry, lost-response recovery, re-entry and explicit
retry. Never generate a fresh key merely because the response was lost.

## 8 · Non-actions and blockers

```text
PARTY_OVERRIDE_ACTIVATED = NO
NETWORK_USED             = NO
DB_MIGRATION_RUN         = NO
BACKGROUND_WORKERS       = PRESERVED
```

Blockers: LCC implementation/migration/tests; independent NEW3 acceptance before
R16 release; RCC cadence-copy removal; runtime currentness evidence before any
cadence claim is restored.
