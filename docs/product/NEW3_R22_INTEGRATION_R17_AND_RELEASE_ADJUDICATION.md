# NEW3 R22 — integrated base, final R17 semantics, and next-wave authorization

**Owner:** NEW3 · **Date:** 2 September 2026 · **Integration base:** `ab4b4989`

Fast coordination round. This accepts the completed LCC R26 work at its proved
scope, freezes the two remaining R17 conformance rules, authorizes LCC R27 and
RCC R24, and adds one restored-corpus release requirement. It is not a new broad
audit and creates no new contract revision.

```text
HEAD_START                                      = ab4b4989
INTEGRATION_BASE                                = ab4b4989
INTEGRATION_BASE_READY                          = YES
INTEGRATION_CONFLICT                            = NONE

NEW3_F94F396A                                   = ANCESTOR_OF_HEAD
LCC_AB4B4989                                    = ANCESTOR_OF_HEAD
RCC_C87FD2E6                                    = ANCESTOR_OF_HEAD
NEW2_F5CE4D44                                   = ANCESTOR_OF_HEAD

LOCAL_GATE_S1_SINGLE_REQUEST                    = PASS
GATE_S1_CONCURRENCY_ENVELOPE                    = UNPROVEN
GATE_S1_STAGING                                 = UNPROVEN

IDENTITY_ONLY_BACKEND_ACCEPTANCE                = PASS
IDENTITY_ONLY_DELETE_CLIENT_AUTHORIZED          = YES

R17_READ_BACKEND                                = PASS
R17_WRITE_BACKEND                               = NONCONFORMING_PENDING_LCC_R27
R17_WRITE_EXPECTED_STATUS                       = 409
R17_WRITE_EXPECTED_CODE                         = CORPUS_TARGET_UNAVAILABLE
R17_WRITE_RETRYABLE_WIRE_FIELD                  = OMIT
R17_WRITE_CLIENT_AUTORETRY                      = NO
R17_WRITE_ROW_CREATED_ON_FAILURE                = NO

REFUSAL_TOTAL_RULE                              = OMIT
SPARSE_TIMEOUT_WIRE_REASON                      = timeout
SPARSE_TIMEOUT_DEGRADED_ARM                     = sparse_timeout

EXTERNAL_DELETION_RESOURCE                      = SPRINT4_STORE_BLOCKER
EXTERNAL_DELETION_OWNER                         = PUBLIC_WEB / LAWMIND-SITE REPOSITORY

CORPUS_GENERATION_STATISTICS_READY_REQUIREMENT  = REQUIRED_BEFORE_ACTIVATION

NEW1_COVERAGE                                   = 5,736,676 / 7,654,179 = 74.9483%
HNSW_PRECHECK_DUE                               = NO

CITATION_BULK_APPLY                             = HOLD
CITATION_EDGE_APPLY_BLOCKS_GATE_C                = NO

R17_RELEASED                                    = NO
READY_FOR_REMOTE_SPEND_DECISION                 = NO
PAID_REMOTE_INFRA_AUTHORIZED                    = NO
```

## 1 · One current base

Current HEAD was `ab4b4989c9b734f66cbf5ec6a6a077bc260c17ff`. The four named
completed commits were classified with `git merge-base --is-ancestor`, not by
log position, filenames, or bus claims:

| completed work | full commit                                | result          |
| -------------- | ------------------------------------------ | --------------- |
| NEW3 R21       | `f94f396a94082297cd87798637fcf292200ebbff` | ancestor        |
| LCC R26        | `ab4b4989c9b734f66cbf5ec6a6a077bc260c17ff` | ancestor / HEAD |
| RCC R23        | `c87fd2e6917383adb51913aa701af4191dd93c85` | ancestor        |
| NEW2 R24       | `f5ce4d44acd9ec8f37b765d7eb7224064ccfc7ef` | ancestor        |

Nothing was merged, cherry-picked, rebased, reset, stashed, force-checked-out,
or rewritten because no completed commit was missing.

The three artifacts in `LAWMIND_V7_2_AUTHORITY_MANIFEST.json` reproduce their
recorded byte counts and SHA-256 values exactly: Master Roadmap V7.2, Sprint
Prompts V3, and the V7.2 research memo. Migration journal entries `0100`,
`0101`, `0102`, and `0103` are consecutive and each has exactly one SQL file.
No NEW1-owned path was edited or worker interrupted.

The base was published immediately as bus `1739`–`1743`,
`kind = INTEGRATION_BASE`, `requiresAck = false`.

## 2 · LCC R26 acceptance: local single-request evidence only

Committed evidence at `docs/ai/lcc-r26/ROUND.md` and focused source inspection
do not contradict the report:

| measure                              |    before |        after |
| ------------------------------------ | --------: | -----------: |
| Gate-S1 local whole-request p95      | 12,196 ms | **2,832 ms** |
| sample count                         |        36 |           36 |
| explicit `sparse_unbounded` refusals |         6 |            6 |
| DEV target@10                        |     55.6% |        55.6% |
| DEV target@50                        |     57.8% |        57.8% |
| TRAIN target@10                      |     64.1% |        67.1% |
| TRAIN target@50                      |     65.5% |        68.8% |

The hidden holdout was not read. No statement/client timeout changed,
`gin_fuzzy_search_limit` was not used, and no semantic fallback was introduced.
The full benchmark was deliberately not rerun.

The performance gain depends materially on a parallel bitmap plan. With no
parallel workers, the recorded old and new shapes are equivalent; the local
cluster can fully staff only three concurrent four-worker searches. Therefore:

```text
GATE_S1_LOCAL_SINGLE_REQUEST = PASS
GATE_S1_CONCURRENCY_ENVELOPE = UNPROVEN
GATE_S1_STAGING              = UNPROVEN
```

LCC R27 owns concurrency evidence. A fixed-suite local p95 below three seconds
is not staging certification.

## 3 · `identity_only` deletion

```text
IDENTITY_ONLY = AUTHENTICATED_APP_ACCOUNT_WITHOUT_LAWMIND_PROFILE
```

Focused source/schema inspection at `ab4b4989` confirms R21's load-bearing seam:

- `data_requests.auth_id` and `api_idempotency_records.auth_id` are the non-null
  principal; `user_id` is nullable;
- `POST` and `GET /me/data-requests` use the auth identity and do not require or
  create a profile;
- erasure execution resolves a profile from `auth_id` at execution time, so an
  intent survives later onboarding;
- if no profile exists, `eraseIdentityOnly` removes the identity layer without
  manufacturing a `users` row;
- R16 uniqueness is `(auth_id, method, route, idempotency_key)`.

The focused LCC evidence records one request and one idempotency row on retry,
principal isolation, intent survival across profile creation, and no regression
in the profile-backed deletion neighbourhood. Acceptance is `PASS`.

RCC R24 was authorized in bus `1744`, naming exact backend commit `ab4b4989`:
reuse the existing Delete Account screen, do not route deletion through
onboarding, preserve “request” terminology and the R16 key, and do not regress
profile-backed deletion.

## 4 · Exact remaining R17 write semantics

Authority is the current committed
`RCC_V1_API_CONTRACT_R17_AMENDMENT.md`. Its SHA-256
`4f1e5375804e033564228eb278d1b166fea8e38fb0f73dc216103c05748f8964`
and Git blob `acde387ccc7b5a3b4bdcf5e1410b19af726f548b` reproduce the R17
ledger identity.

The read half remains accepted: the unavailable shell is exactly
`authorityId`, `judgmentId`, `addedBy`, `addedAt`, `removedAt`, and
`availability: 'corpus_unavailable'`, with no fabricated corpus/legal metadata.

The write half is not conforming at this base. `authorities.ts` still returns
`404 NOT_FOUND` with “no judgment with that id” when the target is absent. Under
blue/green rollback that sentence can be false. The frozen behavior is:

### 4.1 New save whose target is absent from current corpus

```text
HTTP_STATUS                  = 409
ERROR_CODE                   = CORPUS_TARGET_UNAVAILABLE
AVAILABILITY_OR_REASON_FIELD = NONE_ADDED_TO_ERROR_ENVELOPE
RETRYABLE_WIRE_FIELD         = OMIT
CLIENT_AUTOMATIC_RETRY       = NO
MATTER_AUTHORITY_ROW_WRITTEN = NO
```

R17 does not byte-freeze one message literal. It freezes the semantic copy: the
judgment is **not available in the selected corpus release**. The response must
never say no judgment exists. No client or server may fabricate a saved
authority from metadata the current corpus cannot supply, and the client must
not retry as a different operation.

### 4.2 Same live saved row already exists

Return HTTP `200` with
`{ unavailableAuthority: MatterAuthorityUnavailable }`; perform no mutation.
The six-field `corpus_unavailable` shell above is the entire authority payload.

RCC write behavior is authorized against this frozen response, but R17 is not
released. LCC handoff is bus `1745`; RCC handoff is bus `1746`.

## 5 · Refusal `total` and timeout vocabulary

For structured `sparse_unbounded` and `sparse_timeout`, exhaustive ranking did
not complete. The top-level `total` property is therefore **omitted**. It is not
`0`, `null`, or an unknown-count surrogate. `retrievalOutcome.resultCount`
remains available. A completed exact `no_match` response is outside this rule.

```text
retrievalOutcome.state    = coverage_unknown
retrievalOutcome.reasons  = includes timeout
degraded                  = includes sparse_timeout
```

`sparse_timeout` is not added to `RetrievalOutcomeReason`. `timeout` is the
general coverage reason; `sparse_timeout` identifies the specific degraded arm.
`sparse_unbounded` remains its own actionable refusal reason because it carries
the `add_more_terms` remedy.

Current `search/route.ts` still sends `total: 0` on both structured incomplete
branches. LCC R27 must remove the property and prove absence with an own-property
assertion. This is a conformance fix, not R18 and not a new wire revision.

## 6 · External deletion resource

Google's external account-deletion resource is separate from the in-app route.
It is a `SPRINT4_STORE_BLOCKER` and is not built in this round.

The current monorepo has no public website under `apps/**`; `apps/` contains the
mobile and admin surfaces. The durable architecture records the marketing site
separately as `github.com/lawmind/lawmind-site`. Ownership is therefore the
public-web / Lawmind-site lane, with NEW3 owning truthful content. It is not
assigned to RCC mobile. The external resource must use the same request-based,
identity-aware semantics as the in-app path.

## 7 · Restored-corpus statistics before activation

```text
CORPUS_GENERATION_STATISTICS_READY = REQUIRED_BEFORE_ACTIVATION
```

Matching row counts and hashes plus a booting API are insufficient promotion
evidence. Before a restored corpus generation becomes active it must have:

1. optimizer statistics refreshed, or restored by a proven equivalent; and
2. a Gate-S1 search smoke executed against that restored generation.

This freezes the release invariant, not an `ANALYZE` command or table list. LCC
owns the implementation and evidence. Bus `1747`; no migration is authorized.

## 8 · NEW1 and HNSW

One latest durable receipt was read: the final line available in
`docs/ai/new1-r10/coarse-walk-telemetry.jsonl`, timestamped
`2026-09-02T16:23:35.233Z`.

```text
eligibleTotal         = 7,654,179
alreadyEmbedded       = 5,736,676
durable coarse ratio  = 74.9483%
vectors/hour window   = 35,068
zero-output windows   = 0
```

The V7.2 precheck begins at roughly 75–80% durable coarse coverage. The observed
ratio is below 75%, so the conjunctive instruction cannot be true:

```text
HNSW_PRECHECK_DUE      = NO
HNSW_BUILD_AUTHORIZED  = NO
```

No HNSW work was started. The NEW1 worker and HEAVY_BOX lease were preserved.
At `2026-09-02T16:35:48.629Z` the lease's raw physical-stage counter had advanced
to `5,743,247` (`75.0341%` if divided by the eligible denominator). That does not
reverse this result: NEW1's coverage authority explicitly says whole-stage
physical rows are not representative coverage because old-generation rows are
included. A raw lease counter crossing 75% cannot substitute for every coverage
definition the precheck requires.

## 9 · Citation graph and spend

NEW2 R24's completed commit is integrated. It does not authorize another edge
review or bulk apply:

```text
CITATION_BULK_APPLY               = HOLD
FRESH_R24_EDGE_CANDIDATE           = FROZEN
CITATION_EDGE_APPLY_BLOCKS_GATE_C  = NO
```

Local Gate-S1 single-request evidence does not close concurrency, staging, or
the R17 release. Physical Android local evidence is not remote mobile-data Gate
C evidence. Current V7.2 local-acceptance prerequisites are therefore not all
YES.

```text
READY_FOR_REMOTE_SPEND_DECISION = NO
PAID_REMOTE_INFRA_AUTHORIZED    = NO
```

No paid infrastructure, network access, database migration, source mutation, or
background-worker interruption was authorized in this round.

## 10 · Release blockers

- LCC R27: implement and test the R17 write `409`/idempotent `200` branches and
  omit `total` on both structured incomplete outcomes.
- RCC R24: consume the write refusal without false “not found” language,
  fabrication, or automatic retry; open the existing Delete Account screen to
  `identity_only` without onboarding.
- NEW3: independently accept both halves after their commits land.
- Gate-S1 concurrency envelope and staging evidence remain unproven.
- External deletion web resource remains a Sprint-4 store blocker.

`R17_RELEASED = NO` until backend and client write behavior pass.
