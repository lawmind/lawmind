# RCC v1 API CONTRACT — R17 AMENDMENT

**Status:** frozen by NEW3 R20 and **released by NEW3 R23 on 2 September
2026**. **Prior released revision:** R16,
[`RCC_V1_API_CONTRACT_R16_AMENDMENT.md`](RCC_V1_API_CONTRACT_R16_AMENDMENT.md).
**Ledger:** `CCR-2026-09-02-19`.

R17 freezes the smallest additive wire shape required for a saved authority to
outlive the selected corpus release, and freezes the existing search-outcome
vocabulary for bounded qlang lexical work. It removes, renames, or narrows no
R16 field.

```text
CONTRACT_REVISION      = R17
WIRE_PROTOCOL_VERSION  = 1
WIRE_BREAKING_CHANGE   = NO
MIN_SUPPORTED_CONTRACT = 1
RELEASED_TO_RCC        = YES
```

## 1 · Saved authority whose corpus target is unavailable

The existing `MatterAuthority` object is unchanged. A resolved authority still
has every R16 field, including live verification, treatment, and currentness.

`GET /matters/:id/authorities` gains one optional top-level array:

```ts
type MatterAuthorityUnavailable = {
  authorityId: string;
  judgmentId: string;
  addedBy: string;
  addedAt: string;
  removedAt: string | null;
  availability: 'corpus_unavailable';
};

type MatterAuthoritiesResponse = {
  authorities: MatterAuthority[];
  unavailableAuthorities?: MatterAuthorityUnavailable[];
  asOf: string;
};
```

An R17 server always sends `unavailableAuthorities`, including `[]`. It remains
optional in the contract so an R17 client can talk truthfully to an older R16
server, where the single-database foreign key guaranteed every returned target
was present.

`authorities` contains only rows whose immutable `judgmentId` resolves in the
request-pinned active corpus generation. `unavailableAuthorities` contains every
saved row whose target does not. Both arrays retain removed rows and are ordered
by `addedAt` descending within the array. RCC merges them by `addedAt` for the
matter view; it may not omit the unavailable array from the rendered history.

The unavailable shell deliberately carries no `caseTitle`, citation,
`verificationState`, `verifiedBySource`, currentness, treatment, replacement,
or source-evidence field. None can be read from the selected corpus generation,
and caching any of them on the saved row would make legal state stale. The UI
may say only that the authority was saved and is unavailable in the selected
corpus release. It may not say the judgment does not exist, was removed from the
law, is unverified, or is still good law.

The existing trust-state term `SOURCE_UNAVAILABLE` is not reused. It means an
upstream source could not be observed. `corpus_unavailable` means a different,
narrower fact: the selected corpus generation does not contain this immutable
target. The distinction is load-bearing because neither fact is a legal
conclusion about the judgment.

### Write behavior

`POST /matters/:id/authorities` validates the target against the request-pinned
active corpus generation before inserting into the user database.

- Target present: existing R16 `201`/`200` behavior and `MatterAuthority` shape.
- Target absent and no live saved row: `409 CORPUS_TARGET_UNAVAILABLE`; no user
  row is inserted. The message says the judgment is not available in the
  selected corpus release, never that no judgment exists.
- Target absent but the same live saved row already exists: `200` with
  `{ unavailableAuthority: MatterAuthorityUnavailable }`; no mutation. The
  advocate's already-satisfied save is not turned into a new refusal.

`DELETE /matters/:id/authorities/:authorityId` is user-database-only. It remains
available while the target is unavailable and keeps the existing timestamped
removal behavior.

When a later active corpus generation contains the same `judgmentId`, the same
saved row moves from `unavailableAuthorities` to `authorities` on the next read.
Its identity, `addedAt`, and `removedAt` do not change; no resave, reconciliation
write, or user-data mutation occurs.

## 2 · Physical reference model

Across the physical split, a user-domain `judgmentId` is an opaque immutable
UUID and never a cross-database foreign key. Application validation protects new
writes. Reconciliation measures missing targets and raises an operational
signal; it never deletes, rewrites, removes, or changes legal state on a user
row.

The request pins one active corpus generation for every corpus read it performs.
No distributed transaction is required. A generation activation may make a
just-saved authority unavailable on the next request; the shell above is the
truthful state for that race.

## 3 · Qlang lexical admission and timeout

A qlang expression that contains lexical terms uses the same sparse
document-frequency admission and deterministic materialized bounded-population
ranker as ordinary sparse retrieval. Structured constraints may narrow the
eligible population before the shared bound. A court category is never assumed
to be a sufficient bound.

If the eligible population remains too large:

```json
{
  "results": [],
  "degraded": ["sparse_unbounded"],
  "emptyBecause": {
    "reason": "query_too_broad_to_rank",
    "remedy": "add_more_terms"
  },
  "retrievalOutcome": {
    "state": "coverage_unknown",
    "reasons": ["sparse_unbounded"]
  }
}
```

The response is HTTP 200. `parsed` may still echo the interpretation. `total`
is omitted: `total: 0` would claim the query ran to completion when it was
refused before ranking. Existing `RetrievalOutcome` fields not abbreviated above
remain present with their existing meanings.

If an admitted bounded qlang lexical operation reaches its statement budget:

- HTTP 200;
- `results: []` for the aborted structured operation;
- `degraded` includes `sparse_timeout`;
- `retrievalOutcome.state = coverage_unknown` and `reasons` includes the
  existing `timeout` member;
- `total` and `emptyBecause` are omitted.

**ERRATUM, NEW3 R21, 2 September 2026.** The two bullets above previously read
`reasons` includes `sparse_timeout`. `RetrievalOutcomeReason` has no such member
and is not gaining one; LCC found this while implementing (bus 1726) and
correctly declined to add a member to a contract it does not own. The wire was
never wrong — only this description of it was, and R17 was never released, so
nothing shipped against the defective wording. Ledger row `CCR-2026-09-02-20`.

The split is deliberate and is the rule for every timeout arm:

| field                      | value                     | what it answers                     |
| -------------------------- | ------------------------- | ----------------------------------- |
| `retrievalOutcome.state`   | `coverage_unknown`        | may this render as "no law"? No.    |
| `retrievalOutcome.reasons` | includes `timeout`        | the general user-facing semantic    |
| `degraded`                 | includes `sparse_timeout` | the specific machine-observable arm |

A `reason` is what the advocate is being told about coverage, and an advocate
cannot act on which arm ran out of budget — which is why `timeout` is shared with
`dense_timeout` and `pin_timeout`. `degraded` is where the arm is named. Putting
the arm name in both lists would give one event two vocabularies, which §8.5
forbids, and would make `reasons` arm-shaped for one arm and semantic for every
other.

`sparse_unbounded` appearing in both lists is not a counter-example. A refusal to
rank has a REMEDY the advocate can act on — `add_more_terms` — so it earns a
reason of its own. A timeout has no remedy, which is exactly why `emptyBecause`
is omitted here and present there.

A client identifies the failed arm from `degraded`, never from `reasons`.

It never falls through to the generic HTTP 503 `TIMEOUT` copy, never renders as
"no results", never auto-retries, and does not widen the 15-second statement or
client timeout.

PostgreSQL `gin_fuzzy_search_limit` is forbidden on legal-search serving paths.
It returns a random subset of matching rows; deterministic bounded admission and
ranking, or the truthful refusal above, are the only permitted outcomes.

## 4 · Release gates

```text
LCC_IMPLEMENTATION                 = DONE at 5d84e870
RCC_CONSUMPTION                    = DONE at 677e6972
INDEPENDENT_NEW3_ACCEPTANCE        = PASS at 6124b5f0
R17_RELEASED                       = YES
PHYSICAL_DB_SPLIT_ACTIVATION       = BLOCKED_ON_LCC_R28_ROLE_ROUTING
```

### 4.1 · Release seal — NEW3 R23, 2 September 2026

LCC R27 implemented both remaining conformance gaps. RCC R24 consumed the read
and write outcomes. NEW3 then exercised the real Hono app against one user
database and two physically distinct corpus generations while passing each real
response through RCC's `saveAuthorityOutcome()` and `mergeSavedAuthorities()`.

Observed together:

- present target: `201`, one user row, normally hydrated;
- generation A to B: the same row became the exact six-field unavailable shell;
- absent new target: `409 CORPUS_TARGET_UNAVAILABLE`, zero writes, no false
  non-existence copy, client outcome non-retryable;
- absent already-saved target: `200 { unavailableAuthority }`, zero mutation;
- generation B to A: same `authorityId` and `addedAt`, one row, normal hydration;
- `sparse_unbounded` and `sparse_timeout`: raw JSON omitted `total`; timeout kept
  `reasons: ['timeout']` semantics and `degraded: ['sparse_timeout']`.

R17 is released with wire protocol `1` and minimum supported contract `1`
unchanged. R17 release did not itself activate the full physical database split.
LCC R28 subsequently completed correct role routing, the executable regression
guard, and a `64/64` physical split route matrix at `6947f72d`; NEW3 reran its
static role-wiring test and full API TypeScript check successfully. Physical
Android current-v1 acceptance remains `PENDING_DEVICE` and is a separate product
gate.

Evidence: [`NEW3_R23_R17_ACCEPTANCE.json`](NEW3_R23_R17_ACCEPTANCE.json) and
[`NEW3_R23_CURRENT_V1_INTEGRATION_AND_R17_RELEASE.md`](NEW3_R23_CURRENT_V1_INTEGRATION_AND_R17_RELEASE.md).
