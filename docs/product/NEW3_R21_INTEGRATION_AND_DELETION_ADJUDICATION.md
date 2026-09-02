# NEW3 R21 — INTEGRATION BASE, R17 CONSUMPTION, AND THE identity_only DELETION CONTRACT

**Owner:** NEW3 · **Date:** 2 September 2026 · **Integration base:** `f0d1490c`

This is a coordination round. It produces one integrated HEAD, freezes two
decisions the next parallel wave is blocked on, and closes one question that
keeps being reopened. It runs no broad audit and opens no contract revision.

```text
INTEGRATION_BASE                        = f0d1490c
INTEGRATION_BASE_READY                  = YES
INTEGRATION_CONFLICT                    = NONE

R17_BACKEND_ACCEPTANCE                  = PARTIAL_PASS  (§1 read: PASS)
R17_CLIENT_CONSUMPTION_AUTHORIZED       = YES           (scoped to §1 read)
R17_RELEASED                            = NO_PENDING_RCC

SPARSE_TIMEOUT_WIRE_REASON              = 'timeout'
SPARSE_TIMEOUT_DEGRADED_ARM             = 'sparse_timeout'
SPARSE_TIMEOUT_CONTRACT_CHANGE_REQUIRED = NO

IDENTITY_ONLY_CLASSIFICATION            = AUTHENTICATED_ACCOUNT_WITHOUT_PROFILE
IDENTITY_ONLY_DELETION_CONTRACT         = API_IMPLEMENTATION_EXTENSION_EXISTING_CONTRACT
                                          + SCHEMA_AMENDMENT_REQUIRED
IDENTITY_ONLY_R16_PRINCIPAL             = AUTH_IDENTITY_WHEN_NO_PROFILE_ROW
IDENTITY_ONLY_PROFILE_REQUIRED          = NO
IDENTITY_ONLY_STORE_BLOCKER             = SPRINT4_STORE_BLOCKER

APPLE_BUILD_IMAGE_CONFIG_DECISION       = ACCEPTED
APPLE_CONFIG_READY                      = YES
APPLE_PRODUCTION_BUILD_PROOF            = PENDING

HYBRID_SPARSE_PERF                      = GATE_C_BLOCKER
CITATION_EDGE_APPLY_BLOCKS_GATE_C       = NO
READY_FOR_REMOTE_SPEND_DECISION         = NO
PAID_REMOTE_INFRA_AUTHORIZED            = NO
```

---

## 1 · The integrated base

All four completed branches were already one line. Nothing was merged, rebased,
reset, stashed, force-checked-out or dropped, because nothing needed to be.

Classified with `git merge-base --is-ancestor`, mechanically, not inferred from a
commit log or from any lane's report:

| commit | lane | classification |
| --- | --- | --- |
| `75a84804` | common pre-wave base | ANCESTOR_OF_HEAD |
| `f5ce4d44` | NEW2 R24 | ANCESTOR_OF_HEAD |
| `83e82672` | RCC R22 | ANCESTOR_OF_HEAD |
| `49976e3c` | NEW3 R20 | ANCESTOR_OF_HEAD |
| `f0d1490c` | LCC R25 | HEAD |

Six commits, 54 files, no path claimed by two lanes. The path separation held.

### Verified at this HEAD

- **Contract identities exact.** All six recorded revisions (R12–R17) re-hashed
  from their committed artifacts; every SHA-256 and every git blob matched
  `CONTRACT_CHANGE_LEDGER.json` before this round's own edit. Nothing drifted
  through the wave.
- **Migration lineage intact.** 103 journal entries and 103 SQL files,
  one-to-one, `0102_soft_corpus_references` at the tail, no gap.
- **R16 released state unchanged.** `R16_RELEASED = YES`.
- **NEW1 untouched.** No NEW1-owned path in the wave diff. No worker was
  interrupted and none was started.

Published to every lane as bus 1730–1734, `kind = INTEGRATION_BASE`.

---

## 2 · R17 §1 read — accepted, and RCC is authorized to consume it

Read at `services/api/src/matters/authorities.ts:356-412` at this HEAD, not taken
from LCC's report.

The shell is the frozen one: `authorityId`, `judgmentId`, `addedBy`, `addedAt`,
`removedAt`, `availability: 'corpus_unavailable'`, and nothing else. No case
title, citation, verification state, verified-by-source, currentness, treatment,
replacement or source-evidence field exists in the type or is emitted. The saved
user row survives corpus absence, is never deleted or hidden, and returns to
`authorities[]` with live fields when a later generation carries the same
`judgmentId` — proved A → B → A in `scripts/lcc-corpus-bluegreen-proof.mjs` with
the user database byte-identical by ordered md5.

`unavailableAuthorities` is **always sent, including `[]`**. LCC's first
implementation emitted it conditionally and corrected it; the reasoning in the
corrected comment is the reasoning R17 §1 records, and a client that could not
distinguish "nothing is unavailable" from "this server does not know the concept"
would have guessed that everything resolved.

**`R17_CLIENT_CONSUMPTION_AUTHORIZED = YES`, scoped to this read shape.**
`R17_RELEASED = NO` until RCC consumption lands and NEW3 accepts it
independently. Authorized to build is not authorized to claim.

### What was not accepted

Two conformance gaps, neither claimed by LCC, neither blocking RCC. Ledger row
`CCR-2026-09-02-21`.

- **§1 write.** `POST /matters/:id/authorities` answers an absent target with
  `404 NOT_FOUND` "no judgment with that id" (`authorities.ts:459`). R17 requires
  `409 CORPUS_TARGET_UNAVAILABLE`, and forbids that exact sentence. Under the
  split it is also false: after a rollback the judgment exists and this release
  does not carry it — the distinction the amendment was written for. The
  idempotent `200 { unavailableAuthority }` branch is absent too.
- **§3 `total`.** R17 omits `total` on both refusal shapes;
  `search/route.ts:648` sends `total: 0`. **The contract stands.** LCC's argument
  that `total: 0` is a page count beside a self-describing state is sound in
  isolation; it turns on who has to be wrong for it to matter. A consumer that
  reads `retrievalOutcome` sees the same truth either way. A consumer that
  ignores it reads `total: 0` as "zero results exist" and renders "there is no
  law on this". Omission makes that consumer read `undefined` and fail loudly
  instead of quietly. `retrievalOutcome.resultCount` remains for anyone wanting
  the count.

---

## 3 · `sparse_timeout` — the vocabulary contradiction, resolved without a new member

NEW3 R20's prose said `retrievalOutcome.state = coverage_unknown with reason
sparse_timeout`. LCC found while implementing that `RetrievalOutcomeReason` has
no such member (bus 1726), followed the existing derivation, and asked rather
than editing a contract it does not own. That was correct on both counts.

**The existing vocabulary expresses the state exactly. No member is added.**

| field | value | the question it answers |
| --- | --- | --- |
| `retrievalOutcome.state` | `coverage_unknown` | may this render as "no law"? No. |
| `retrievalOutcome.reasons` | includes `timeout` | the general user-facing semantic |
| `degraded` | includes `sparse_timeout` | the specific machine-observable arm |

A `reason` is what the advocate is being told about coverage, and an advocate
cannot act on which arm ran out of budget — which is exactly why `timeout` is
shared with `dense_timeout` and `pin_timeout` in `outcome.ts:209`. `degraded` is
where the arm is named. Adding `sparse_timeout` to the reason enum would give one
event two vocabularies, which §8.5 forbids, and would make `reasons` arm-shaped
for one arm and semantic for every other.

`sparse_unbounded` living in both lists is not a counter-example. A refusal to
rank has a **remedy** the advocate can act on — `add_more_terms` — so it earns a
reason of its own. A timeout has no remedy, which is the same fact that makes
`emptyBecause` present there and omitted here.

**A client identifies the failed arm from `degraded`, never from `reasons`.**

R17 §3 was corrected in place with a visible ERRATUM block. R17 was never
released, so nothing shipped against the defective wording. Both identities were
recomputed and the superseded R20 pair is recorded beside them. No wire field
moves; `WIRE_PROTOCOL_VERSION` stays 1; there is nothing for LCC to implement.
Ledger row `CCR-2026-09-02-20`.

---

## 4 · identity_only account deletion

### 4.1 · The classification

```
IDENTITY_ONLY_CLASSIFICATION = AUTHENTICATED_ACCOUNT_WITHOUT_PROFILE
```

**"No profile row" is not "no account", and it is not "nothing to erase."**

RCC bus 1722 was right on every fact it checked and right to pin the closure with
a test rather than ship a route that 401s every time. It read the population as
an identity with tokens and little else. Read at this HEAD from
`packages/auth/src/schema.ts`, the durable data that actually exists for a
verified identity with no `users` row:

| table | what it holds | cascades off `auth_user`? |
| --- | --- | --- |
| `auth_user` | **the email address**, name, `email_verified` | — |
| `auth_session` | **IP address, user-agent**, session token | yes |
| `auth_account` | the provider row | yes |
| `auth_verification` | magic-link artifacts keyed by the **EMAIL** | **no FK — does not cascade** |
| `refresh_tokens` | the hashed token family | yes |

An email address, a set of IP addresses and a device fingerprint is personal data
under DPDP whether or not anyone finished onboarding. Apple 5.1.1(v) is about
accounts, not profiles.

The useful half: `eraseUser` **already deletes every one of those**
(`services/api/src/auth/erasure.ts:358-363`), keyed on `authId` and `email` —
including the `auth_verification` rows that do not cascade. Nothing new has to be
invented about what erasure means here. What is missing is only that every path
into it resolves the caller to a `users.id` first.

### 4.2 · The frozen user experience

An authenticated `identity_only` advocate must be able to **initiate deletion
without completing onboarding**. They must not be required to supply a name, a
phone number, matter information or any other new personal data in order to ask
for erasure. Demanding more personal data as the price of erasure is the defect,
not the fix for it.

Forbidden, explicitly:

- profile creation as a deletion prerequisite — not by the client, and not
  silently by the server on the advocate's behalf;
- unauthenticated deletion;
- email-to-support as the only in-app path;
- fake immediate-success copy.

The existing truthful **"deletion request"** terminology is preserved. The
backend creates a request; it does not delete synchronously, and the copy must
not say it does. RCC's email-confirmation step stays — the advocate types the
email on the auth identity, which is data we already hold.

### 4.3 · The contract shape

```
IDENTITY_ONLY_DELETION_CONTRACT = API_IMPLEMENTATION_EXTENSION_EXISTING_CONTRACT
                                  + SCHEMA_AMENDMENT_REQUIRED
CONTRACT_CHANGE_REQUIRED        = NO   (RCC assessed this correctly)
```

Extend `POST /me/data-requests` to be **principal-aware**. One endpoint, one
screen, one meaning — there is no second user-facing deletion concept, and RCC
is not asked to build a second deletion screen. When the backend lands,
`identity_only` gets the existing `/delete-account` route: one line in
`IDENTITY_ONLY_ROUTES` and the deletion of the pin in
`AuthBoundary.deleteAccount.test.ts`.

Rejected alternatives, with reasons, so they are not re-proposed:

- **Materialise a minimal `users` row at verify time** (RCC option 2). It changes
  what `profileComplete` means, changes the client gate, creates a profile for
  every abandoned magic link, and does nothing for identities that already exist
  without one. It also makes the product create personal data in order to delete
  personal data.
- **A distinct refusal code** (RCC option 3). A route that explains why it cannot
  delete is not a deletion path. Apple 5.1.1(v) and DPDP both ask for a path.

### 4.4 · Semantic requirements — binding. Column names are LCC's.

**SR-1 · The endpoint accepts a principal with no profile.**
`POST /me/data-requests` serves an authenticated caller that has no `users.id`.
The 401 at `auth/data-requests.ts:95` must stop being reachable for a caller who
is authenticated but unprofiled. `AUTH_REQUIRED` stays correct for a caller with
no auth identity at all.

**SR-2 · The durable request records the auth identity.**
It must be recorded in a form that is (a) non-null for a caller with no profile,
(b) resolvable by the executor to the identity-layer rows `eraseUser` already
deletes, and (c) unchanged by the later creation of a profile row.
`data_requests.user_id` is `NOT NULL REFERENCES users(id)` today, so **a schema
amendment is required.** What the columns are called is LCC's; that the request
survives without a profile is not.

**SR-3 · R16 is not bypassed.**
`api_idempotency_records.user_id` is `NOT NULL REFERENCES users(id)` and the
uniqueness boundary is `(user_id, method, route, idempotency_key)`
(migration 0100). R16's semantic scope is the **authenticated principal**, not
"must have a profile row" — 0100's own comment says principal. For
`identity_only` the scope must be expressed over a value that is **NOT NULL** for
that caller.

> The trap: a *nullable* scope column. NULLs are distinct in a unique index, so
> every retry would create a new row and the create would silently lose its
> idempotency while appearing to have it. **A scope that never collides is a
> bypass wearing R16's clothes.** Special-casing this create out of R16 is
> equally forbidden.

```
IDENTITY_ONLY_R16_PRINCIPAL = AUTH_IDENTITY_WHEN_NO_PROFILE_ROW
```

**SR-4 · The erasure intent survives a later profile.**
If the same auth identity creates a profile before the request is executed, the
request remains valid and the execution covers both layers. Binding the request
to the auth identity rather than to the profile is what makes that automatic
rather than a reconciliation job someone has to remember to write.

**SR-5 · No profile is created in order to erase.**
For a request still `identity_only` at execution time there is no `users` row to
anonymise and one must not be manufactured. `eraseUser` currently throws when
there is no `users` row (`erasure.ts:155`) — correct today, and the branch that
needs an identity-layer path beside it.

**SR-6 · Existing guards apply unchanged.**
The single-request-per-kind guard (`data-requests.ts:110`) and the existing
due-date behaviour apply to this population as they do to any other.

### 4.5 · Store policy

```
IDENTITY_ONLY_STORE_BLOCKER = SPRINT4_STORE_BLOCKER
```

Real for store submission, until the in-app initiation path works. It does
**not** block Gate-C backend search engineering and must not reorder §5.

---

## 5 · Priorities

### 5.1 · Search is the Gate-C blocker

```
HYBRID_SPARSE_PERF = GATE_C_BLOCKER
```

LCC's measured `LOCAL_GATE_S1_P95 = 11,889 ms` against the 3,000 ms goal. The
qlang half is genuinely closed — `structuredMs` max 15,100 → 1,190 ms — and the
entire residual is the HYBRID sparse arm on ordinary research queries,
`sparseMs` max 15,014 ms, already truthfully degraded. Accepted as measured, and
accepted as not LCC's alone: that arm has no structural conjunct to fence on and
improving it is a retrieval-quality change needing NEW1's gold set. LCC was right
not to claim it.

This outranks citation-edge apply, briefings JSONB, billing, monitoring and
statute links.

### 5.2 · Citation graph

```
R24_CANONICAL_CORRECTION          = PASS
FRESH_EDGE_CANDIDATE              = FROZEN
CITATION_BULK_APPLY               = HOLD
CITATION_EDGE_APPLY_BLOCKS_GATE_C = NO
```

No citation review was run in this round.

### 5.3 · NEW1

```
NEW1_COVERAGE       = 5,562,843 / 7,654,179 durable staged rows = 72.7%
HNSW_PRECHECK_DUE   = NO
```

One latest durable progress receipt read and nothing else:
`docs/ai/new1-tier-a/stage-embed-summary.json`, finished
`2026-09-02T11:19:27.879Z`, `tableRows` 5,562,843 against `manifestRows`
7,654,179 in `stage-coverage-v2.json`. Below the 75% threshold on that
denominator and below it on the census's own `stagedInManifest` (4,932,783,
64.4%) too, so the answer does not turn on which is chosen.

The worker was not interrupted and HNSW was not started.

---

## 6 · The Apple build image decision is closed

```
APPLE_BUILD_IMAGE_CONFIG_DECISION = ACCEPTED
APPLE_CONFIG_READY                = YES
APPLE_PRODUCTION_BUILD_PROOF      = PENDING
```

`apps/mobile/eas.json` pins `macos-tahoe-26.5-xcode-26.6`. The founder supplied
current primary-source verification that Expo lists this exact image as `latest`
and `sdk-57` with Xcode 26.6.

**This is settled and is not to be reopened.** The pin is not reverted because
this workstation lacks `eas-cli` — an absent local tool is evidence about the
workstation, not about the image. No paid build is launched to prove it. The
production build proof stays PENDING until a real build runs, which is a separate
gate and a founder-queue item, not a reason to re-litigate the config.

---

## 7 · Late handoffs

One final bus re-read was performed before committing. At that point RCC had not
completed R17 consumption and LCC had not implemented identity_only deletion —
both handoffs went out in this round (bus 1728, 1729) and the work postdates
them. No polling was performed.

```
R17_RELEASED           = NO_PENDING_RCC
IDENTITY_ONLY_DELETION = PENDING_LCC
```

Neither is a failure of this round.

---

## 8 · Resources

No paid resource was created, no network call was made, no migration was run, and
no background worker was interrupted or started.

```
PAID_REMOTE_INFRA_AUTHORIZED    = NO
READY_FOR_REMOTE_SPEND_DECISION = NO
```

`READY_FOR_REMOTE_SPEND_DECISION` is NO for §5.1's reason and not for the
database split: an 11,889 ms Gate-S1 p95 is not a workload to provision remote
infrastructure for.
