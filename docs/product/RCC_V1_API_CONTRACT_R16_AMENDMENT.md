# RCC v1 API CONTRACT — R16 AMENDMENT

**Status:** `RCC_API_CONTRACT = R16`, **not yet released to RCC** — but client
implementation and testing are authorized as of NEW3 R18, 2 September 2026. See
§8.1; the two are different states and the difference is the point.
**Prior revision:** `R15`,
[`RCC_V1_API_CONTRACT_R15_AMENDMENT.md`](RCC_V1_API_CONTRACT_R15_AMENDMENT.md).
R12–R15 remain on disk and are not edited. **Amended by:** NEW3, 1 September
2026. **Ledger:** [`CONTRACT_CHANGE_LEDGER.json`](CONTRACT_CHANGE_LEDGER.json),
`CCR-2026-09-01-17`.

Measured against committed source at
`ed6226570a2fa03a5d012a2046cc557b3225a31a`. LCC implementation and a database
migration do not exist at this evidence freeze, so this revision is a contract
decision and an implementation handoff, not a claim that the behavior is live.

## 0 · Revision identity

```text
CONTRACT_REVISION      = R16
WIRE_PROTOCOL_VERSION  = 1
WIRE_BREAKING_CHANGE   = NO
MIN_SUPPORTED_CONTRACT = 1
RELEASED_TO_RCC        = NO
CLIENT_CONSUMPTION     = AUTHORIZED FOR IMPLEMENTATION AND TESTING  (NEW3 R18, 2 Sep 2026 — §8.1)
```

R16 adds optional request metadata. It removes, renames, retypes and narrows
nothing. A client that sends no new header keeps the R15 behavior. Therefore the
integer served at `GET /version` remains `1`, and the minimum supported contract
remains `1`.

## 1 · Decision and transport

```text
IDEMPOTENCY_DECISION            = AMEND
IDEMPOTENCY_TRANSPORT           = HTTP_HEADER
HEADER_NAME                     = Idempotency-Key
REQUEST_FINGERPRINT_REQUIRED    = YES
CONTENT_DEDUPLICATION           = FORBIDDEN
```

`Idempotency-Key` is request metadata, not a property of an annotation, matter,
event, consent or privacy request. The current client already supports arbitrary
headers in `RequestOptions` and already sends `X-Lawmind-Platform`; the current
server already reads request headers. A body field would require the same
transport concern to be added separately to every domain schema and would create
a third vocabulary beside `citation_copies.clientKey` and
`premium_jobs.idempotencyKey`.

The two existing body keys are not renamed or removed. They remain the identity
mechanisms for their existing operations. R16 defines the general convention for
current-v1 create operations that lack a durable natural identity.

If present, `Idempotency-Key` is an opaque, case-sensitive value of 8–128 visible
ASCII characters after surrounding whitespace is rejected. Empty, repeated,
comma-joined or over-length values fail `400 INVALID_IDEMPOTENCY_KEY` before any
mutation and do not consume a key. UUIDs are recommended, not required.

## 2 · Exact scope

For R16 the header has contracted effect on exactly these authenticated routes:

| endpoint | current mechanism | R16 class |
|---|---|---|
| `POST /judgments/:id/annotations` | unconditional insert; no logical-attempt identity | `IDEMPOTENCY_TOKEN_REQUIRED` |
| `POST /matters` | unconditional insert; no natural unique identity | `IDEMPOTENCY_TOKEN_REQUIRED` |
| `POST /matters/:id/events` | unconditional append; no logical-attempt identity | `IDEMPOTENCY_TOKEN_REQUIRED` |
| `POST /me/data-requests` | sequential open-kind lookup, but no database uniqueness; concurrent requests can both insert | `IDEMPOTENCY_TOKEN_REQUIRED` |
| `POST /verify/confirm` | appends a permanent `citation_checks` row per request | `IDEMPOTENCY_TOKEN_REQUIRED` |
| `POST /me/training-consent` | updates the user and appends a consent audit event per request | `IDEMPOTENCY_TOKEN_REQUIRED` |

Existing naturally durable identities remain sufficient and do not gain a second
required mechanism:

| endpoint | durable identity | class |
|---|---|---|
| `POST /matters/:id/authorities` | live `(matter_id, judgment_id)` partial unique index; conflict returns the existing authority | `NATURALLY_IDEMPOTENT_BY_DB_IDENTITY` |
| `POST /citations/copies` | required body `clientKey`, unique on `(user_id, client_key)` | `NATURALLY_IDEMPOTENT_BY_DB_IDENTITY` |

State-setting POSTs such as `POST /me/accept-terms`, `POST /alerts/:id/read` and
`POST /briefings/:id/opened` do not create a second user-owned object on replay
and are `NO_RETRY_RISK` for this inventory. POST-shaped queries such as
`POST /search`, `POST /verify/ecourts` and `POST /court/lookup` are also outside
the create-write convention. Authentication/session endpoints are an
unauthenticated or token-rotation protocol and are outside this
authenticated-principal scope.

Built-but-held creates — saved searches, matter shares, document citations,
counterarguments and premium jobs — are `POST_V1` for this decision. R16 does not
use a dormant route to expand current-v1 scope. A later release of any such route
must either name a durable database identity or adopt this convention before it
becomes user-reachable.

## 3 · Scope identity and request fingerprint

One idempotency record is scoped by:

```text
authenticated principal user id
+ uppercase HTTP method
+ canonical route template
+ Idempotency-Key
```

The authenticated user id is the principal, not the access token, refresh token,
device or session. Token refresh therefore remains within the same scope.

The server computes and stores a cryptographic request fingerprint from the
canonical route parameter values plus the fully validated, normalized request
body and any contractually meaningful query values. JSON object order and
transport whitespace do not change the fingerprint. Authentication headers,
`Idempotency-Key`, trace/request ids and other transport metadata are excluded.
Path parameters are included, so reusing one key for events on two different
matters conflicts even though both requests match the same route template.

No implementation may deduplicate by annotation text, quote, paragraph number,
paragraph index, date, event prose, case title, CNR, party names or other semantic
content. Identical content under different keys is two intentional writes unless
an existing domain uniqueness rule independently says otherwise.

## 4 · Required server semantics

For the same authenticated principal, method, canonical route and key:

- Same fingerprint: execute at most one logical durable mutation and return the
  same logical result.
- Different fingerprint: return `409 IDEMPOTENCY_KEY_REUSE_MISMATCH`, perform no
  mutation, and never return the earlier result as though it answered the new
  request.
- Concurrent same fingerprint: one request owns execution. A follower waits for
  the committed result and replays it. If it cannot wait within the request
  budget, it returns `409 IDEMPOTENCY_IN_PROGRESS` with `Retry-After: 1`; it does
  not execute. A later retry returns the committed result.
- Header absent: legacy behavior remains supported for the compatibility window.
  The window has no invented sunset; ending it requires a separately adjudicated
  breaking revision.

The mutation and its completed idempotency result must commit atomically in one
database transaction. A generic durable ledger is permitted; per-domain columns
are not required by the contract. The implementation must enforce uniqueness in
the database, not by a read-then-insert race in application code.

The replayed logical result is the original success HTTP status and success body,
including the original resource id and mutation timestamp. Per-request transport
metadata such as trace ids may differ. No new success-envelope field is required.

## 5 · Exact outcome table

| situation | required behavior |
|---|---|
| **first success** | Commit one domain mutation and its fingerprint/result atomically; return the endpoint's normal success status/body. |
| **lost-response retry** | Do not execute again. Return the original success status/body with the same resource identity and mutation timestamp. |
| **concurrent duplicate** | One executor only. Wait and replay its result; if the wait budget expires, return retryable `409 IDEMPOTENCY_IN_PROGRESS` and create nothing in the follower. |
| **same key, different payload/path** | `409 IDEMPOTENCY_KEY_REUSE_MISMATCH`; no mutation; the original result remains intact. |
| **validation failure before mutation** | Return the existing validation error. Do not reserve or consume the key; a corrected request may use it. |
| **server failure before mutation** | Roll back/release any provisional claim and return the existing server error. A retry may become the executor. No failed result is cached as success. |
| **server failure after durable mutation** | The contract forbids a domain commit without the completed idempotency result. If the transaction committed and only delivery failed, retry returns the stored success. If the transaction did not commit, neither mutation nor result exists and retry may execute. |

A deterministic business refusal after validation records its fingerprint and
refusal outcome: the same request replays that refusal and a different
fingerprint conflicts. It is not a successful result and creates no resource.
This preserves the key-reuse rule without turning the key into a
content-deduplication device.

## 6 · Client requirements after release

RCC may consume R16 only after LCC implementation, migration, concurrency tests
and independent NEW3 acceptance are committed.

For every scoped action, generate one opaque key when the user initiates one
logical mutation; keep it across auth-refresh replay, transport retry,
lost-response recovery, navigation re-entry and the explicit retry UI; discard it
only after a definitive success or explicit cancellation. A new intentional
mutation receives a new key even when every domain field is identical.

## 7 · Citator cadence is not part of this wire amendment

`railway.recheck.json` proves a daily schedule is committed. It does not prove a
production executor is deployed or completing the run. No current route or client
type carries `lastCheckedAt` or `nextPlannedCheckAt` for citator currentness.
Therefore R16 adds no invented cadence field and authorizes no static nightly
claim. The claims disposition is in
[`V1_CLAIMS_REGISTER_R15.md`](V1_CLAIMS_REGISTER_R15.md).

This is citator currentness, not eCourts cause-list monitoring. The two systems,
capabilities and evidence sets remain separate.

## 8 · Release gates and non-actions

```text
LCC_IMPLEMENTATION        = DONE at e325ed9f
DB_MIGRATION              = 0100_api_idempotency_records, APPLIED, NOT_RUN_BY_NEW3
INDEPENDENT_VERIFICATION  = PASS  (NEW3 R18, 2 September 2026)
RCC_CONSUMPTION           = AUTHORIZED FOR IMPLEMENTATION AND TESTING
RELEASE_STATE             = UNRELEASED
PARTY_OVERRIDE_ACTIVATED  = NO
```

### 8.1 · Lifecycle — amended 2 September 2026, NEW3 R18

R16 §6 made release depend on client evidence while bus 1697 made client work
depend on release. That is one lifecycle expressed as two values when it needs
three. The third value is added here; the wire is untouched, and **no R17 was
opened** — implementation lifecycle is not a wire change.

```text
R16_BACKEND_ACCEPTANCE            = PASS
R16_CLIENT_CONSUMPTION_AUTHORIZED = YES
R16_RELEASED                      = NO
```

* **`R16_CLIENT_CONSUMPTION_AUTHORIZED = YES`** — the backend is accepted as
  conformant against this document. RCC may implement and test the
  `Idempotency-Key` header now. The wire shape will not move underneath that
  work; if it ever must, that is a new adjudicated revision and RCC is told
  first. This **supersedes the DO-NOT-CONSUME condition in bus 1697, for
  implementation and testing only.**
* **`R16_RELEASED = NO`** — R16 is not product-current. No release note, no
  store copy, no capability row and no claim anywhere may state that
  duplicate-safe writes are a property of this product. A shipped build may
  carry the code and may not carry the promise.

Final release still requires RCC implementation evidence and a NEW3 final
acceptance. This authorization moves the gate, not the guarantee.

Acceptance evidence, independently measured rather than accepted from LCC's
report: [`../ai/new3-r18/r16-independent-acceptance.json`](../ai/new3-r18/r16-independent-acceptance.json)
and [`NEW3_R18_R16_RELEASE_AND_LOCAL_V1_ADJUDICATION.md`](NEW3_R18_R16_RELEASE_AND_LOCAL_V1_ADJUDICATION.md).

### 8.2 · Retention, still undecided on purpose

```text
IDEMPOTENCY_RETENTION_CLASS = C_SPRINT4_PRIVACY_OPERATIONS_ITEM
```

Not a release blocker. The design stores no `in_progress` row, so nothing breaks
by being kept, and `eraseUser` deletes the table by `user_id`. But the stored
success body carries the advocate's own words, so an unbounded hold is not
acceptable indefinitely either. The semantic requirement is in
`NEW3_R18_R16_RELEASE_AND_LOCAL_V1_ADJUDICATION.md` §4. **No TTL is to be
invented in the meantime**; its absence is a recorded decision.

### 8.3 · Two contract clauses whose tests are structurally unreachable

Recorded here so a future round inherits the obligation rather than the silence.

* §1's "after surrounding whitespace is rejected" cannot be exercised: the
  Headers API strips it before dispatch. The clause is **not withdrawn** — it
  states the intended semantics and the implementation's visible-ASCII class
  enforces them. Interior whitespace is refused and is tested.
* §3's method scoping has no behavioural test because all six scoped routes are
  POST. `method` is a column of the uniqueness boundary. The first non-POST
  scoped route must bring the test with it.

R16 does not activate the party iOS override, release a held capability, change a
capability state, change a claims state other than the citator cadence copy, or
authorize a migration in NEW3's lane.
