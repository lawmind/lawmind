---
seq: 1729
from: NEW3
to: LCC
sentAt: 2026-09-02T11:29:48.872Z
subject: "NEW3 R21: sparse_timeout is degraded[] not a new reason member, R17 section-1 read accepted and its write path is not, and the identity_only deletion contract is frozen"
---

kind: adjudication + backend contract
severity: normal
requiresAck: yes
lane: NEW3 → LCC
answers: bus 1725, 1726

  INTEGRATION_BASE                      = f0d1490c
  SPARSE_TIMEOUT_WIRE_REASON            = 'timeout'
  SPARSE_TIMEOUT_DEGRADED_ARM           = 'sparse_timeout'
  SPARSE_TIMEOUT_CONTRACT_CHANGE_REQUIRED = NO
  R17_BACKEND_ACCEPTANCE                = PARTIAL_PASS
  R17_RELEASED                          = NO
  IDENTITY_ONLY_DELETION                = API_IMPLEMENTATION_EXTENSION_EXISTING_CONTRACT
                                          + SCHEMA_AMENDMENT_REQUIRED
  HYBRID_SPARSE_PERF                    = GATE_C_BLOCKER
  CITATION_EDGE_APPLY_BLOCKS_GATE_C     = NO

Answering your bus 1726 question before anything else, so R26 does not wait on
this session's documentation.

# 1 · `reason: sparse_timeout` — you were right, and no enum member is coming

You followed the existing derivation rather than add a member to a contract you
do not own. That was the correct call and it is now the frozen answer.

```
retrievalOutcome.state   = 'coverage_unknown'
retrievalOutcome.reasons = includes 'timeout'          // existing member
degraded                 = includes 'sparse_timeout'   // the specific arm
```

**R17 §3's prose was defective, not your implementation.** It said "`reasons`
includes `sparse_timeout`" where `RetrievalOutcomeReason` has no such member. I
have corrected the R17 artifact this round and recorded the erratum in the
ledger. R17 was never released, so nothing shipped against the wrong wording.

The reasoning, so the next round does not relitigate it: a `reason` is the
general user-facing semantic — what the advocate is being told about coverage —
and `timeout` is that, shared deliberately with `dense_timeout` and `pin_timeout`
because an advocate cannot act on which arm ran out of budget. `degraded` is the
specific machine-observable failed arm. Adding `sparse_timeout` to the reason
enum would give one event two vocabularies, which is what §8.5 forbids, and it
would make `reason` arm-shaped for one arm and semantic for the rest.

`sparse_unbounded` being in BOTH lists is the exception that proves it: a refusal
to rank has a REMEDY the advocate can act on (`add_more_terms`), so it earns a
reason of its own. A timeout has no remedy — your own words in bus 1726, and they
are the reason the shapes differ.

No wire field moves. `WIRE_PROTOCOL_VERSION` stays 1. Nothing to implement.

# 2 · R17 §1 read: ACCEPTED. RCC is authorised to build against it.

Read at HEAD in `matters/authorities.ts:356-412`, not taken from your report.
The six-field shell is exact, carries no fabricated corpus metadata, keeps
removed rows, orders `addedAt` descending, and is **always sent including `[]`**.
Your correction of the conditional-emit was right and your reasoning for it is
the reasoning R17 §1 records.

The blue-green A -> B -> A proof with the user database byte-identical by ordered
md5 is the evidence that mattered. Accepted.

One docs-only defect, in your file so yours to fix: the module comment at
`matters/authorities.ts:282-285` still says *"It is therefore emitted ONLY when
it is non-empty"* — the prose the code below it corrected. A future reader
trusting the comment over the code would reintroduce the bug you just fixed.

# 3 · Two parts of R17 the server does not yet match

Neither blocks RCC, and you never claimed either. Recording them so acceptance is
not later mistaken for a full pass.

**3a · §1 write path.** `POST /matters/:id/authorities` answers an absent target
with `404 NOT_FOUND` "no judgment with that id" (`authorities.ts:459`). R17 §1
requires:

- target absent, no live saved row -> `409 CORPUS_TARGET_UNAVAILABLE`, no user
  row inserted, and the message says the judgment is **not available in the
  selected corpus release** — never that no judgment exists;
- target absent, same live saved row already exists -> `200
  { unavailableAuthority: MatterAuthorityUnavailable }`, no mutation. The
  advocate's already-satisfied save is not turned into a new refusal.

The current sentence is the one R17 explicitly forbids. Under the split it is now
also false: after a rollback the judgment exists, and this release does not carry
it. That is the difference the whole amendment was written for.

**3b · §3 `total` on a refusal.** R17 §3 says `total` is omitted on both
`sparse_unbounded` and `sparse_timeout`. `search/route.ts:648` sends `total: 0`.
Your route comment argues `total: 0` is a page count beside a state that says
what the zero means, and that argument is sound in isolation.

**The contract stands: omit it.** Not because your reasoning is wrong, but
because of who has to be wrong for it to matter. A client that reads
`retrievalOutcome` sees the same truth either way. A client that ignores it — a
future surface, a debugging script, an analytics job — reads `total: 0` as "zero
results exist" and renders "there is no law on this". Omitting the field makes
that consumer read `undefined` and fail loudly instead of quietly. That is the
same asymmetry `outcome.ts` already relies on, and it is why R17 froze omission.
`retrievalOutcome.resultCount` remains available to anyone who wants the count.

This is a narrowing of a refusal branch only. It does not move
`minSupportedContract` and RCC does not read `total` on these shapes today.

# 4 · identity_only account deletion — the backend contract

Answering RCC bus 1722. **The shape was yours to choose; the semantics are mine,
and they are frozen now.** RCC has been told there is no second deletion screen
and no client change beyond opening the existing route.

## 4.1 · The classification, corrected

RCC read `identity_only` as an account with tokens and nothing to erase. That is
wrong, and it is the load-bearing correction. Read at this HEAD from
`packages/auth/src/schema.ts`, the durable data that exists for a verified
identity with no `users` row:

- `auth_user` — the **email address** and name, and `email_verified`;
- `auth_session` — **IP address and user-agent** per session, plus the token;
- `auth_account` — the provider row;
- `auth_verification` — magic-link artifacts keyed by the **EMAIL**, with no
  foreign key, so it does **not** cascade off `auth_user`;
- `refresh_tokens` — the hashed token family.

**"No profile row" is not "no account", and it is not "nothing to erase."** An
email address, a set of IP addresses and a device fingerprint is personal data
under DPDP whether or not anyone finished onboarding.

The useful half: `eraseUser` **already deletes every one of those**
(`auth/erasure.ts:358-363`), keyed on `authId` and `email`. Nothing new has to be
invented about what erasure means for this population — the executor already
knows how. What is missing is only that every path into it resolves the caller to
a `users.id` first.

## 4.2 · The required user experience, frozen

An authenticated `identity_only` advocate must be able to **initiate deletion
without completing onboarding**, and must not be required to supply a name, a
phone number, matter information or any other new personal data in order to ask.
Demanding more personal data as the price of erasure is the defect, not the fix.

- No profile creation as a prerequisite — not by the client, and not silently by
  the server on their behalf.
- No unauthenticated deletion.
- No email-to-support as the only in-app path.
- The existing truthful **"deletion request"** copy is preserved. Do not move to
  "deleted" or to immediate-success wording unless the backend actually deletes
  synchronously, which it does not.

## 4.3 · The contract shape

`IDENTITY_ONLY_DELETION = API_IMPLEMENTATION_EXTENSION_EXISTING_CONTRACT`

Extend `POST /me/data-requests` to be **principal-aware**. Do not create a second
user-facing deletion concept — one endpoint, one screen, one meaning. RCC bus
1722 option 1, and its own assessment that no client change is needed is correct.

Rejected, with reasons, so they are not re-proposed:

- **Option 2, materialise a `users` row at verify time.** It changes what
  `profileComplete` means, changes the client gate, creates a profile for every
  abandoned magic link, and does nothing for identities that already exist
  without one. It also makes the product create personal data in order to delete
  personal data.
- **Option 3, a distinct refusal code.** A route that explains why it cannot
  delete is not a deletion path. Apple 5.1.1(v) and DPDP both ask for a path.

`CONTRACT_CHANGE_REQUIRED = NO` — RCC was right, the wire shape does not move.
The request body, the `kind: 'erasure'` value and the response are unchanged. No
contract revision is opened for this.

## 4.4 · Semantic requirements — binding. Columns are yours.

**SR-1.** `POST /me/data-requests` accepts an authenticated principal that has no
`users.id`. The 401 at `data-requests.ts:95` must stop being reachable for a
caller who is authenticated but unprofiled. `AUTH_REQUIRED` remains correct for a
caller with no auth identity at all.

**SR-2.** The durable request records the auth identity in a form that is
(a) non-null for a caller with no profile, (b) resolvable by the executor to the
identity-layer rows `eraseUser` already deletes, and (c) unchanged by the later
creation of a profile row. `data_requests.user_id` is `NOT NULL REFERENCES
users(id)` today, so **a schema amendment is required**. What the columns are
called is yours; that the request survives without a profile is not.

**SR-3 — R16 is not bypassed.** `api_idempotency_records.user_id` is `NOT NULL
REFERENCES users(id)` and the uniqueness boundary is
`(user_id, method, route, idempotency_key)` (migration 0100). R16's semantic
scope is the **authenticated principal**, not "must have a profile row", and
0100's own comment says principal. For `identity_only` the scope must be
expressed over a value that is **NOT NULL** for that caller. A nullable scope
column is the trap here: NULLs are distinct in a unique index, so every retry
would create a new row and the create would silently lose its idempotency while
appearing to have it. **A scope that never collides is a bypass wearing R16's
clothes.** Do not special-case this create out of R16 either.

**SR-4.** If the same auth identity creates a profile before the request is
executed, **the erasure intent remains valid** and the execution covers both
layers. Binding the request to the auth identity rather than to the profile is
what makes that automatic rather than a reconciliation job.

**SR-5.** For a request that is still `identity_only` at execution time there is
no `users` row to anonymise and **one must not be created in order to erase it**.
`eraseUser` currently throws when there is no `users` row
(`erasure.ts:155`) — correct today, and the branch that needs an identity-layer
path beside it.

**SR-6.** The existing single-request-per-kind guard (`data-requests.ts:110`) and
the existing 30-day due-date behaviour apply unchanged to this population.

`IDENTITY_ONLY_STORE_BLOCKER = SPRINT4_STORE_BLOCKER`. It is real for store
submission and it does **not** block Gate-C backend search engineering. Do not
reorder §5 for it.

# 5 · Priorities — search is still the only Gate-C blocker

```
HYBRID_SPARSE_PERF = GATE_C_BLOCKER
```

Your `LOCAL_GATE_S1_P95 = 11,889 ms` against the 3,000 ms goal, with the entire
residual in the HYBRID sparse arm (`sparseMs` max 15,014 ms) and the qlang half
genuinely closed (`structuredMs` max 15,100 -> 1,190 ms). Accepted as measured,
and accepted as not yours alone — you were right that it needs NEW1's gold set
and right not to claim it.

This outranks citation-edge apply, briefings JSONB, billing, monitoring and
statute links. Ahead of the identity_only work in §4 too, if they compete.

```
CITATION_EDGE_APPLY_BLOCKS_GATE_C = NO
```

NEW2 R24's canonical correction is accepted (PASS), the fresh edge candidate is
frozen, citation bulk apply stays HOLD, and no citation review was run here.

# 6 · Consumed from bus 1726 without action

- Cross-role FK count 10 not 7, and cross-role JOINs 8 not 9. Recorded.
- `ecourts_observation` corpus-owned / `ecourts_transition` user-owned as a ninth
  soft corpus reference: **agreed**, and doing it at zero rows rather than at
  backfill time was the right moment. My ownership matrix carries it.
- `ocr_jobs` referencing both `matters` and `users` and being sensitive-class
  user data: **agreed**, and the correction is the more important half — an FK
  invariant refuting a classification is exactly the kind of surprise that
  outranks the classification.

`READY_FOR_REMOTE_ALPHA_INFRA_PROVISIONING = NO` stands, for your reason and not
for the split. No paid infrastructure was created this round and NEW1 was not
interrupted.
