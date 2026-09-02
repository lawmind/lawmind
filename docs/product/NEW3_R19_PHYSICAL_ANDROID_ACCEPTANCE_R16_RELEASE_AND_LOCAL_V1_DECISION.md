# NEW3 R19 — R16 released; final local-v1 acceptance waits on an attached Android device

**NEW3, 2 September 2026.** This is the single focused R19 adjudication requested
after R18. It does not repeat the broad audit. Ordinary implementation claims use
the committed LCC/RCC receipts; only the load-bearing R16, capability, route,
schema and device boundaries were re-run or directly inspected.

## Decision

R16 is released. Its backend and client focused acceptance both pass, with the
wire still at version 1. The three implementation blockers named by R18 are in
HEAD: R16 client consumption, the `matters.parties` object repair, and the
production guard on `/s/[slug]`.

Final local-v1 functional acceptance is not issued because `adb devices -l`
returned no authorized device twice in this round. The physical mutation matrix,
deep-link resume, and current-round crash/ANR/OOM observation therefore remain
`PENDING_DEVICE`. No stale wireless address was scanned and no older device run
is relabelled as current-round evidence.

```text
CONTRACT_REVISION      = R16
WIRE_PROTOCOL          = 1
WIRE_BREAKING_CHANGE   = NO
MIN_SUPPORTED_CONTRACT = 1

R16_BACKEND_ACCEPTED = YES
R16_CLIENT_ACCEPTED  = YES
R16_RELEASED         = YES

ANDROID_LOCAL_ACCEPTANCE = PENDING_DEVICE
PAID_REMOTE_INFRA_AUTHORIZED = NO
```

## Embedded integration seal

At the start, every required dependency was an ancestor of `9ab5ca82`; after
concurrent LCC/NEW2 commits advanced HEAD to `b0ac15d1`, every dependency was
checked again and remained an ancestor.

| Required dependency                               |   Result |
| ------------------------------------------------- | -------: |
| `f4439d58` NEW3 R18                               | ancestor |
| `b2de9e2c` LCC R23                                | ancestor |
| `9ab5ca82` RCC R21                                | ancestor |
| `13f558d1` R16 backend receipt                    | ancestor |
| `d641fc6c` NEW2 R23                               | ancestor |
| migration `0100_api_idempotency_records.sql`      |  present |
| migration `0101_matters_parties_jsonb_object.sql` |  present |
| iOS party override                                |  present |
| `/s/[slug]` production guard                      |  present |

## Focused R16 acceptance

The mobile slice passed **7 suites / 125 tests**. It covers all six create
writes, retry-key reuse, a new key for a new intent, `IN_PROGRESS` retry with the
same key, bounded `Retry-After`, terminal `MISMATCH`, authenticated verification,
success-gated verification UI, double-tap latches, and negative assertions for
search/lookups/naturally-idempotent writes.

The loopback API slice passed **72 tests with 0 failed, 0 cancelled and 0
skipped**. Migration `0101` passed its **13-test** suite. The initial API test
invocation had no `DATABASE_URL` and failed before exercising the suites with
PostgreSQL `28P01`; the corrected run explicitly bound the repository's
loopback-only `LOCAL_DATABASE_URL` and is the acceptance result.

The normal API then booted against `127.0.0.1/lawmind`, passed startup preflight,
returned `/health` 200 with the database reachable in 35 ms, and logged the
health plus three capability requests. It was stopped after the probe. Device to
server communication cannot be inferred from host reachability and remains
pending.

Evidence: [`../ai/new3-r19/r19-focused-acceptance.json`](../ai/new3-r19/r19-focused-acceptance.json).

## `matters.parties` and `/s/[slug]`

Committed source now writes `parties` through the driver's JSON binding, and
`0101` fail-closed backfills only valid string scalars to objects. Focused route
tests assert an object on create, detail read, list read and stored
`jsonb_typeof`; the migration test executes the shipped SQL. RCC carries no
defensive `JSON.parse` workaround.

That closes the implementation defect. The R19 acceptance instruction also
requires a physical matter creation, so the product blocker is not finally
closed until the phone result exists.

`/s/[slug]` is closed. The route carries the production `__DEV__` guard and the
focused route sweep passed. The acceptance question is mountability: a production
build cannot mount the internal manifest screen. Inert manifest strings remaining
inside a Metro/Hermes binary do not reopen it.

```text
MATTERS_PARTIES_IMPLEMENTATION = PASS
MATTERS_PARTIES_BLOCKER_CLOSED = PENDING_DEVICE
SLUG_BLOCKER_CLOSED            = YES
```

## iOS party search and capability evidence

Observed through the normal API, not inferred from the version string:

| Platform | `search.party_name` | overrides           |
| -------- | ------------------- | ------------------- |
| iOS      | `DISABLED`          | `search.party_name` |
| Android  | `ENABLED`           | none                |
| Web      | `ENABLED`           | none                |

The live iOS search test produces `coverage_unknown` with reason
`capability_disabled`; it never emits `abstained` and never borrows
`low_relevance`. Exact citation, CNR, case number and full cause title are
separate capabilities and remain unchanged.

`RELEASE_CAPABILITIES_VERSION = RELEASE_CAPABILITIES_R8_3.5`. The new
[`V1_CAPABILITY_REGISTRY_R16.json`](V1_CAPABILITY_REGISTRY_R16.json) records this
current platform view while preserving R12–R15 unchanged.

The known digest gap is a monitoring blind spot, not runtime authorization.
`candidate.ts` hashes the release-wide `capabilityRegistry()` without a platform,
while runtime routing directly evaluates `isUserReachableOnPlatform` and the
override map. R8_3.5's explicit version bump names the platform change. No digest
architecture is added in this round.

```text
IOS_PARTY_OVERRIDE_CLOSED    = YES
RELEASE_CAPABILITIES_VERSION = RELEASE_CAPABILITIES_R8_3.5
CAPABILITY_DOC_CURRENT       = YES
CAPABILITY_DIGEST_CLASS      = MONITORING_ONLY_BLIND_SPOT_NOT_RUNTIME_AUTHORIZATION
```

## `briefings.content`

The JSONB writer has the same double-encoding form already diagnosed for
`matters.parties`, but it is not current-v1 user-reachable. The product registry
keeps `briefing.daily_loop = DISABLED_NOT_READY` on every platform;
`V1_SURFACE.briefing` closes first; and `CapabilityBoundary` redirects before
mounting the child or firing its API effect. The server route being mounted does
not override that product gate.

```text
BRIEFINGS_JSONB_CLASS = POST_V1_BACKLOG
```

No implementation or migration is pulled into R19.

## Physical Android matrix

```text
DEVICE             = NONE ATTACHED
ANDROID_VERSION    = UNAVAILABLE
ADB_MODE           = NO AUTHORIZED TRANSPORT
SERVER_REACHABILITY= HOST_LOCAL_API_PASS; DEVICE_TO_SERVER_PENDING_DEVICE

MATTER_CREATE          = PENDING_DEVICE
MATTER_PARTIES_OBJECT  = BACKEND_AND_MIGRATION_PASS; PHYSICAL_PENDING
EVENT_DOUBLE_TAP       = PENDING_DEVICE
EVENT_DURABLE_ROWS     = PENDING_DEVICE
ADJOURNMENT_DATE       = PENDING_DEVICE
ADJOURNMENT_PURPOSE    = PENDING_DEVICE
ADJOURNMENT_DUPLICATES = PENDING_DEVICE
ANNOTATION             = PENDING_DEVICE
TRAINING_CONSENT       = PENDING_DEVICE
DATA_REQUEST           = NOT_RUN_NO_DEVICE
VERIFY_CONFIRM_AUTH    = PASS_FOCUSED_TEST; PHYSICAL_PENDING
VERIFY_CONFIRM_DB_ROW  = PASS_FOCUSED_TEST; PHYSICAL_PENDING
VERIFY_CONFIRM_UI_TRUTH= PASS_FOCUSED_TEST; PHYSICAL_PENDING
AUTH_DEEP_LINK_RESUME  = PENDING_DEVICE
CRASHES                = PENDING_DEVICE
ANRS                   = PENDING_DEVICE
OOM                    = PENDING_DEVICE
```

## One final local-v1 evaluation

The five states are evaluated once here. Surface, design and gating completeness
are decided from the now-landed R18 blockers. Functional completeness is not
promoted from code/tests to physical-device fact.

```text
LOCAL_CORE_LOOP_COMPLETE              = YES
CURRENT_V1_REQUIRED_SURFACE_COMPLETE  = YES
CURRENT_V1_FUNCTIONALLY_COMPLETE      = PENDING_DEVICE
CURRENT_V1_DESIGN_COMPLETE            = YES
CURRENT_CAPABILITY_GATING_COMPLETE    = YES

LOCAL_V1_BLOCKERS = PHYSICAL_ANDROID_R16_MUTATION_MATRIX · CURRENT_ROUND_AUTH_DEEP_LINK · DEVICE_HEALTH
SPRINT4_BLOCKERS   = APPLE_XCODE_IOS26_BUILD_PROOF · IN_APP_ACCOUNT_DELETION · BILLING_FREE_LAUNCH · PRIVACY_LEGAL_COMMERCIAL_COPY
POST_V1_ITEMS      = STATUTE_LINKED · MONITORING · DESKTOP_WORKSPACE · BRIEFINGS_JSONB_WRITER_REPAIR

READY_FOR_REMOTE_SPEND_DECISION = NO
PAID_REMOTE_INFRA_AUTHORIZED     = NO
```

R16 release and local-v1 product acceptance are deliberately separate. R16's
focused backend/client contract evidence is complete; the physical Android fact
is not. The founder receives no remote-spend authorization from this document.
