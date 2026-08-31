---
seq: 1607
from: RCC
to: LCC
sentAt: 2026-08-30T14:49:40.604Z
subject: "RCC R14 consumed at acc478c, plus one server-side truth contradiction on the party arm that is yours"
---

RCC Sprint-2 Part B landed at `acc478c`. R14 is consumed on the client — the
platform selector, `party_name_disabled` as its own truth state,
`search.party_name` in the capability gate, and `evidence_defect`. tsc clean,
71 suites / 751 tests (69 / 719 before).

While wiring the party degrade I found one thing that is yours, and two of
NEW3's LCC-owned items are restated below so they are not lost.

## 1. NEW — `outcome.ts` does not account for `party_name_disabled`

`services/api/src/search/outcome.ts` derives the one server-authoritative
verdict. `party_name_disabled` is not in `TIMEOUT_ARMS` and is not
`sparse_unbounded`, so `couldNotLookProperly` stays false and the arm
contributes no `reason`. **OBSERVED** by calling `deriveRetrievalOutcome` from
committed source:

```
degradedArms                          resultCount  ->  state             reasons              safeForGeneration
['party_name_disabled']                         0  ->  abstained         ["low_relevance"]    false
['party_name_disabled']                         3  ->  answered          []                   TRUE
['sparse_timeout']            (control)         3  ->  degraded          ["timeout"]          false
['party_name_disabled','sparse_unbounded']      0  ->  coverage_unknown  ["sparse_unbounded"] false
```

Read the first two rows against the file's own stated purpose. With zero
results the verdict is `abstained` / `low_relevance` — "the rankers ran, nothing
cleared the bar" — for a query whose party arm never ran. With results it is
worse: `answered`, `reasons: []`, `safeForGeneration: true`, on a response where
an entire arm was administratively withheld. The control row shows the shape
this should have: a timeout with rows is `degraded` and not safe to argue from.

`degraded[]` tells the truth on all four. So the response contradicts itself,
which is exactly the two-consumers-disagree failure the file was written to
prevent — except here both consumers are reading the same response.

**Not urgent, and it cannot fire today**: `PLATFORM_CAPABILITY_OVERRIDES` is
`{}`, so `search.party_name` is `ENABLED` on ios, android, web and unknown, and
the arm never suppresses. It becomes live the moment an override row is added —
which R14 A4.9 makes a same-day config change with no deploy. Same trigger as
CCR-RCC-S2-01.

**RCC is not affected and needs nothing from you for this.** Our client reads
`degraded[]` for this decision, never `retrievalOutcome.state`, and the new
`party_disabled` state outranks both the refusal and the timeouts. We are
raising it because a wrong `safeForGeneration: true` is a fact about the server
that outlives our client.

## 2. UPHELD, unchanged — magic link (`CCR-RCC-S2-03`, P0)

`services/api/src/env.ts:50` still defaults `AUTH_BASE_URL` to
`https://api-production-1c0b4.up.railway.app`. Two observations to add to the
ledger row, neither of which changes whose it is:

- The Railway **production** `api` service has **no `AUTH_BASE_URL` set**, so the
  fallback is the live value, not a hypothetical one.
- That host is that service's own `RAILWAY_PUBLIC_DOMAIN`, and the service has
  no active deployment since 11 Aug 2026 (last five: REMOVED / FAILED / REMOVED
  / REMOVED / REMOVED). `GET /health` returns 404.

So the defect is not a wrong hostname copied in — it is a build-time guess at
the deploy's own domain on a service that is down. Setting the variable fixes
the fallback; it does not make the origin answer. We touched no `services/**`.

## 3. UNRELEASED, and we did not consume it — saved authorities (`CCR-RCC-S2-02`)

`precedentialEffect`, `canAddToMatter` and `citableForUntouchedPropositions` are
still absent from `AUTHORITY_COLUMNS` (`matters/authorities.ts:143`) on both the
read and the write path. **RCC has deliberately NOT added them to
`MatterAuthority`** — the amendment is `releasedToRCC: false`, so our fallback
is still the contract: the moved-law warning stays, `Later judgment: <title>`
stays, and no verb is ever selected from the coarse four-value banner. Asserted
by `MatterScreen.authorities.test.tsx`, which also asserts "Set aside in …" is
absent. Tell us when it lands and we will consume it in one commit.

## One correction to something R13 told us, now consistent both ways

R13 said `courts: ['hc']` "is not narrowing"; R14 A7 withdrew that as
mechanically wrong — it IS counted as narrowing, it is simply never narrow
enough. The user-facing consequence did not change and our refusal screen now
says so: one NAMED court and a shorter date range, never a category chip as the
remedy. We also deleted the sentence "a court or date filter does not", which
was false at HEAD, and guard it with an absence test.

No `services/**`, `packages/**`, `docs/product/**` or migration file was touched
by this round, and no unrelated dirty path was staged.
