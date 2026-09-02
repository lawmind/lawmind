# NEW3 R23 — current-v1 integration seal and R17 release

**Owner:** NEW3 / release coordinator  
**Date:** 2 September 2026  
**Integration base:** `6124b5f02754d2a61db590d1630a7f0287c8fd8f`

This round eliminates branch divergence, independently accepts the combined R17
server/client behavior, releases R17, freezes the final split-database
implementation outcome, and sends LCC R28 and RCC R25 their complete handoffs.
It does not reopen product scope or create R18.

```text
HEAD_START                                      = 6124b5f02754d2a61db590d1630a7f0287c8fd8f
INTEGRATION_BASE                                = 6124b5f02754d2a61db590d1630a7f0287c8fd8f
INTEGRATION_BASE_READY                          = YES
INTEGRATION_CONFLICT                            = NONE

NEW3_F60BFAAA                                   = ANCESTOR_OF_HEAD
LCC_6124B5F0                                    = HEAD
RCC_7CC830A1                                    = ANCESTOR_OF_HEAD
NEW2_F5CE4D44                                   = ANCESTOR_OF_HEAD

R17_AVAILABLE_SAVE                             = PASS
R17_UNAVAILABLE_READ                            = PASS
R17_MISSING_TARGET_WRITE                        = PASS
R17_IDEMPOTENT_UNAVAILABLE                      = PASS
R17_RECOVERY                                    = PASS
REFUSAL_TOTAL                                   = PASS
R17_BACKEND_ACCEPTED                            = YES
R17_CLIENT_ACCEPTED                             = YES
R17_RELEASED                                    = YES
WIRE_PROTOCOL                                   = 1

DB_ROLE_ROUTING_INVARIANT                       = EVERY_CURRENT_V1_QUERY_USES_OWNER_ROLE
CROSS_ROLE_JOIN_ALLOWED                         = NO
CROSS_ROLE_FK_ALLOWED                           = NO
FDW_DBLINK_ALLOWED                              = NO
ROLE_ROUTING_REGRESSION_GUARD_REQUIRED          = YES

EXTERNAL_DELETION_WEB_CONTRACT                  = FROZEN
IDENTITY_ONLY_EXTERNAL_DELETE_REQUIRED          = YES

LOCAL_GATE_S1                                   = PASS
GATE_S1_CONCURRENCY                             = DEGRADES_GRADUALLY
GATE_S1_STAGING                                 = UNPROVEN
ANDROID_LOCAL_ACCEPTANCE                        = PENDING_DEVICE
ANDROID_PRODUCTION_EXPORT                       = PASS

NEW1_COVERAGE                                   = 5,863,970 / 7,654,179 = 76.6114%
HNSW_PRECHECK_DUE                               = YES
HNSW_BUILD_AUTHORIZED                           = NO
CITATION_BULK_APPLY                             = HOLD

LCC_R28_AUTHORIZED                              = YES
RCC_R25_AUTHORIZED                              = YES
LCC_R28_PHYSICAL_DB_SPLIT_ACTIVATION            = PASS
RCC_R25_REAL_SERVER_CONSUMPTION                 = PASS

READY_FOR_REMOTE_SPEND_DECISION                 = NO
PAID_REMOTE_INFRA_AUTHORIZED                    = NO
```

## 1 · One integrated base

Each named completed commit was classified with
`git merge-base --is-ancestor`, not log position or lane report:

| completed wave | full commit                                | result   |
| -------------- | ------------------------------------------ | -------- |
| NEW3 R22       | `f60bfaaaf96d0da90706fd55dcbcb3e92357fbe3` | ancestor |
| LCC R27        | `6124b5f02754d2a61db590d1630a7f0287c8fd8f` | HEAD     |
| RCC R24        | `7cc830a1676a9821802c92ddc73945297111de6d` | ancestor |
| NEW2 R24       | `f5ce4d44acd9ec8f37b765d7eb7224064ccfc7ef` | ancestor |

No merge, cherry-pick, reset, rebase, stash, force operation, or manual patch
recreation was needed. Migration journal indexes `100–103` are consecutive and
name exactly `0100`, `0101`, `0102`, and `0103`; exactly four matching SQL files
exist. All three V7.2 authority-manifest byte counts and SHA-256 values reproduce.

NEW1 was not interrupted. Its `NEW1` and `HEAVY_BOX` leases were live before
acceptance, and durable coverage advanced during the round.

## 2 · R17 combined acceptance

Committed branch claims were not used as release proof. NEW3 ran:

- 16 focused API/split tests across the R17 generation lifecycle, refusal-total
  wire truth, and physical database separation: zero failed, zero skipped;
- 57 focused RCC tests across eight suites: zero failed;
- 10 focused `identity_only` deletion backend tests: zero failed, zero skipped;
- one NEW3 probe that drove the real Hono app against the `lawmind` user
  database and two physically distinct disposable corpus databases, then fed
  the resulting envelopes directly through RCC's `saveAuthorityOutcome()` and
  `mergeSavedAuthorities()`.

### 2.1 · Available save

Generation A contained judgment J. The real POST returned `201`; RCC classified
it as `saved`; exactly one `matter_authorities` row existed; the read returned
one normally hydrated `authorities[]` row and an empty
`unavailableAuthorities[]`.

### 2.2 · Generation loses J

Generation B did not contain J. The same user row persisted and the real GET
returned it in `unavailableAuthorities[]`. The shell's complete key set was:

```text
addedAt · addedBy · authorityId · availability · judgmentId · removedAt
```

No title, court, date, citation, treatment, currentness, verification, or source
field was present. RCC merged it into the matter history as one `unavailable`
row rather than dropping it.

### 2.3 · Save while target is absent

A new absent UUID returned exact HTTP `409` and
`CORPUS_TARGET_UNAVAILABLE`. The message did not claim the judgment does not
exist. No row was written. RCC classified the actual response as
`corpus_unavailable` with derived `retryable: false`; focused pending-save tests
prove no automatic retry or replacement attempt key.

### 2.4 · Idempotent unavailable save

Posting J again while B was active returned `200 { unavailableAuthority }`.
RCC classified it as `already_saved_unavailable`; row count and stored row were
unchanged.

### 2.5 · Generation returns

Reading through A again restored normal hydration with the same `authorityId`
and `addedAt`, one row, no unavailable warning, no resave, and no duplicate.

The probe deleted its fixture rows and dropped both disposable corpus databases.
Evidence is
[`NEW3_R23_R17_ACCEPTANCE.json`](NEW3_R23_R17_ACCEPTANCE.json).

## 3 · Refusal `total`

Both branches were exercised through the real Hono search route. The tests read
the raw response text, so `null` cannot masquerade as omission.

| branch             | `total` | coverage reason    | degraded arm       | confirmed empty |
| ------------------ | ------- | ------------------ | ------------------ | --------------- |
| `sparse_unbounded` | absent  | `sparse_unbounded` | `sparse_unbounded` | no              |
| `sparse_timeout`   | absent  | `timeout`          | `sparse_timeout`   | no              |

Timeout also omits `emptyBecause`. An old consumer that reads only `results`
and `total` receives no false confirmed-zero count.

## 4 · R17 release

All R17 read, write, recovery, idempotency, client-consumption, and refusal-total
requirements passed together on the integrated base.

```text
R17_BACKEND_ACCEPTED = YES
R17_CLIENT_ACCEPTED  = YES
R17_RELEASED         = YES
```

Wire protocol remains `1`; minimum supported contract remains `1`. R18 is not
created. The R17 artifact and contract-change ledger carry the release seal.

## 5 · Final split-database implementation target

One invariant replaces route-by-route adjudication:

> Every current-v1 query must execute through the database role that owns its
> tables.

`services/api/src/ops/db-roles.ts` is the sole table-classification authority.
This document does not duplicate its lists.

A request that needs both domains must:

1. query the owner database;
2. collect stable IDs;
3. perform bounded, batched reads from the other role;
4. merge deterministically in application code.

No SQL cross-database JOIN, cross-database FK, FDW, dblink, N+1 sequence, or
fake distributed transaction is permitted. Every write belongs to one database.

LCC R28 subsequently completed current-v1 route wiring and committed the guard.
NEW3 observed its committed physical-split artifacts: the real Hono route matrix
passed `64/64` with zero wrong-role paths against distinct user/corpus databases
whose opposite-role tables had been removed. The required-zeroes artifact
reports zero cross-role FKs, cross-role SQL joins, FDW, dblink, distributed
transaction layers, and wrong-role fallback. NEW3 also reran the static
role-wiring test and full API TypeScript check; both passed. Physical split
activation is therefore `PASS`.

## 6 · External deletion web contract

The public resource must:

- be reachable by URL and identify LawMind plus the current developer identity;
- make account deletion prominent and initiable without opening or reinstalling
  the app;
- not be an FAQ that sends the user back to the app;
- say “request deletion” unless deletion is synchronous;
- explain approved retention at a high level or link the current privacy policy;
- never allow destructive action from unauthenticated email entry;
- use established web auth, magic link, authenticated verification link, or an
  existing supportable verified request workflow;
- work for profile-backed and `identity_only` authenticated accounts without
  onboarding.

The focused backend and RCC client states for `identity_only` deletion both pass.
The public resource itself remains a store implementation item; no weak endpoint
was created in this round.

## 7 · Current measured state preserved

The committed LCC R27 fixed 36-request local Gate-S1 artifact reports p50
`174 ms`, p95 `2,733 ms`, against the existing `3,000 ms` budget. It is local
and lexical-only because the embedder was absent; staging remains unproven.

Concurrency through C8 degrades gradually: C8 p95 `1,533 ms`, max `1,643 ms`,
zero admission refusals, zero timeouts, and four workers launched per leader.
Worker starvation is not causal. The benchmark was not reopened.

`adb devices -l` returned no device, so physical Android local acceptance remains
`PENDING_DEVICE`. A production-mode Android Expo export passed after explicit
staging environment validation and emitted a 6.6 MB Hermes bundle. This proves
the bundle builds; it does not substitute for physical-device evidence and does
not block server engineering.

The RCC/mobile TypeScript check and focused LCC lint check passed. An intermediate
full API TypeScript check failed at `services/api/src/briefings/route.ts:204:45`
with `TS2304: Cannot find name 'sql'` while active LCC R28 work was present.
NEW3 made no source edit and reported the observation in bus `1760`. After the
LCC R28 commits reached HEAD, NEW3 reran the full API TypeScript check and it
passed; bus `1761` closes the transient report.

LCC's R28 Gate-S1 repetitions were `3,074 / 2,812 / 2,830 ms`. The prior fixed
36-request R27 artifact remains a local pass at `2,733 ms`, but the single R28
over-bound run is retained as variance rather than hidden. Staging remains
unproven and no remote spend is authorized.

The latest durable NEW1 lease observation at `2026-09-02T20:15:51.741Z`
records `5,863,970 / 7,654,179 = 76.6114%`, advanced from the initial R23
observation of `5,795,647`. V7.2 §5.7 therefore makes the read-only HNSW
precheck due. It does not authorize an HNSW build, and none was started.

Citation bulk apply remains `HOLD`; citation-edge apply does not block Gate C.

## 8 · Early handoffs

- LCC R28: bus `1752`, P0, ACK required, blocking
  `PHYSICAL_DB_SPLIT_ACTIVATION`.
- RCC R25: bus `1753`, P0, ACK required, carrying R17 release,
  `identity_only` deletion state, external deletion web contract, and physical
  device requirement.
- LCC verification follow-up: bus `1760`, recording the current R28 API
  typecheck defect without taking source ownership.
- LCC/RCC completion receipts: buses `1756` and `1754`; NEW3 closure/ACK buses
  `1761` and `1762`.

No further NEW3 semantic round is required before those implementation lanes
finish.

## 9 · Remaining blockers

- Physical Android current-v1 evidence: `PENDING_DEVICE`.
- Public external account-deletion resource: store blocker until implemented and
  identity-verified.
- Gate-S1 staging evidence: `UNPROVEN`.
- P2 contract follow-up from LCC bus `1759`: eight R17-adjacent missing-target
  wording surfaces, deferred to the next semantic contract round without
  widening released R17 in R23.

These do not reopen R17. No network access, migration, paid infrastructure,
source edit, citation bulk apply, HNSW build, or background-worker interruption
occurred in this round.
