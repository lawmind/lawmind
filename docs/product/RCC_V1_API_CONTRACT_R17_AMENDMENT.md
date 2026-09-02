# RCC v1 API CONTRACT — R17 AMENDMENT

**Status:** frozen by NEW3 R20 on 2 September 2026; **not released to RCC and
not a claim of implementation**. **Prior released revision:** R16,
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
RELEASED_TO_RCC        = NO
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
- `retrievalOutcome.state = coverage_unknown` and `reasons` includes
  `sparse_timeout`;
- `total` and `emptyBecause` are omitted.

It never falls through to the generic HTTP 503 `TIMEOUT` copy, never renders as
"no results", never auto-retries, and does not widen the 15-second statement or
client timeout.

PostgreSQL `gin_fuzzy_search_limit` is forbidden on legal-search serving paths.
It returns a random subset of matching rows; deterministic bounded admission and
ranking, or the truthful refusal above, are the only permitted outcomes.

## 4 · Release gates

```text
LCC_IMPLEMENTATION                 = PENDING
RCC_CONSUMPTION                    = PENDING
INDEPENDENT_NEW3_ACCEPTANCE        = PENDING
R17_RELEASED                       = NO
PHYSICAL_DB_SPLIT_ACTIVATION       = BLOCKED_UNTIL_ALL_THREE_PASS
```

R17 may be implemented and tested locally without paid infrastructure. It may
not be presented as live or activated against a split deployment until LCC and
RCC consume it and NEW3 independently verifies the missing-target and qlang
outcomes.
