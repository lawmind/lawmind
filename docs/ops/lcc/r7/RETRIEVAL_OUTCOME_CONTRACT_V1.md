# RETRIEVAL_OUTCOME_CONTRACT_V1

**Owner:** LCC · **Date:** 25 August 2026 · **Gate:** G5 input, G3 consumer
**Code:** `services/api/src/search/outcome.ts` · **Guard:** `scripts/check-retrieval-outcome-coverage.mjs`
**Commit:** `241ad20` · **Orchestration:** R7 §7.1 and §8 LCC-P0.

**Additive.** Every existing response field is unchanged. The parked client keeps parsing
exactly what it parsed before.

---

## 1. The defect

Two lanes reported the same thing from opposite ends.

**RCC, bus 1128:** *"abstention retrieval outcome needs server response discriminator"* — the
client cannot tell **"there is no law on this"** from **"we could not search"**.

**NEW3, bus 1141**, reproduced against the real route: `anticipatory bail` returns an
**empty 200 by design**.

`OBSERVED_BY_EXECUTION`, from `search/route.ts`'s own recorded measurements:

```
"bail"                                    0 results, sparse_unbounded
"anticipatory bail"                       0 results, sparse_unbounded
"anticipatory bail in economic offences"  5 results, not degraded
```

`bail` is 0.2577 of the sampled corpus against a `SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY` of
0.05, so the sparse arm **correctly** refuses before ranking — that match set is the OOM
shape. The dense arm is supposed to answer instead, and when it cannot the advocate gets a
blank page for one of the commonest searches in Indian criminal practice.

An empty screen says *"there is no law on this."* The truth is *"we did not look."*

---

## 2. Why four correct fields were not enough

The response already carried `degraded[]`, `emptyBecause`, `unpopulatedCourtCategories` and
`ambiguous`. Each is correct. Each was added for a real defect. They are not the problem.

The problem is **who decides what they add up to.** Four optional fields mean four consumers
each writing their own rule, and the moment two of them differ, one surface is confidently
wrong about the law. That is not hypothetical here — this repository has the same shape on
record three times, and `arguments/counter.ts` states it in its own comments:

> *"a rule implemented at one call site is a rule the second call site does not have."*

So: **the signals stay — they are the evidence. One derived state sits beside them — it is
the verdict.** Computed once, in `search/outcome.ts`, by `deriveRetrievalOutcome`.

---

## 3. The contract

```ts
type RetrievalOutcome = {
  state: 'answered' | 'abstained' | 'degraded' | 'coverage_unknown' | 'review_required';
  reasons: RetrievalOutcomeReason[];   // never empty unless `answered`
  safeForGeneration: boolean;
  exactIdentityUsable: boolean;
  resultCount: number;
  contractVersion: 1;
};
```

| state | meaning | may render as "no results"? |
|---|---|---|
| `answered` | the arms we needed ran; this is what we found | n/a |
| `abstained` | we searched properly and nothing cleared the bar. **We looked.** | yes |
| `degraded` | results are real; the SET is not known to be complete | no |
| `coverage_unknown` | we did not look, or could not look properly | **never** |
| `review_required` | a human must choose before anything may proceed | no |

Reasons, R7 §7.1 verbatim: `sparse_unbounded` · `semantic_index_insufficient` · `unsafe_body`
· `low_relevance` · `ambiguous_identity` · `timeout` · `date_unreliable` · `source_stale`.

### Array length is never confidence — in both directions

R7 says it in those words, and it is the load-bearing rule.

- **Zero is not "no law".** If an arm refused or timed out, zero is the number of things we
  ranked, not the number that exist.
- **Non-zero is not "answered".** Five results while the sparse arm timed out is five of an
  unknown number. `CITATION_HARNESS.md` holds silent-drop rate to a threshold of zero, and a
  recall loss leaves no trace at all unless the server leaves one.

### `safeForGeneration` is true ONLY for `answered`

R7 §8: *"semantic-dependent workflow cannot confidently answer when retrieval says
abstain/review/coverage unknown."*

`degraded` is refused too, and that is the deliberate part. It **sounds** like a warning and
it **is** a refusal — a partial result set is safe to SHOW and unsafe to ARGUE FROM, because
the authority that would have changed the argument is exactly the one that did not get ranked.
`mayGenerateFrom(outcome)` exists so that "may I write confident prose about this?" has one
answer in the codebase, rather than five call sites each deciding `degraded` still counts.

### `exactIdentityUsable` — R7 §8's "exact identity remains usable independently"

An exact citation or case-number lookup is a SQL predicate against an identity index. It does
not care that the embedder is cold. Collapsing the two would make a working feature
unavailable because an unrelated one is degraded.

`false` in exactly one case: `ambiguous_identity`, where identity itself is the doubt. NEW1
measured 74 of 229 real case-title queries naming **2–16 different cases**; ranking one first
and saying nothing is how an advocate cites the wrong *Sharma v. State*.

`citation` and `section` query shapes are exempted from `semantic_index_insufficient`
entirely. Reporting it on `(2019) 5 SCC 1` would be true, useless, and would teach every
consumer to ignore the field.

---

## 4. What plumbing it found

`hybridSearch` has taken an `onDegrade` callback since the search route needed one.

**`/arguments/counter` and `/search/saved/:id/feed` never passed it.** `OBSERVED_BY_CODE`.

So the arm that ran out of its statement budget was logged inside the ranker and forgotten,
and neither response could say it was incomplete. Those are the two surfaces where it matters
most:

- **A counterargument is a claim about what the opposing side can reach for.** An authority
  that was never ranked is exactly the one that loses the case. NEW3's 1076 — a commercial
  breach-of-contract position returning an IPC 394 robbery judgment — is the same family.
- **A saved-search feed is the one screen an advocate does not re-read critically.** They open
  it to see whether anything new landed. `unseenCount: 0` derived from a ranking that did not
  finish is a claim about the law nobody asked the server to make.

Both now collect degradation and publish an outcome.

---

## 5. Why briefings and drafting get nothing

R7 lists them. The honest answer is that **they do not retrieve.**

`OBSERVED_BY_CODE`: `briefings/assemble.ts` reads `matter_authorities` and
`judgment_annotations`; `documents/route.ts` reads `citation_checks`. Both are explicit rows
the advocate chose. Neither calls `hybridSearch`; `llm/route.ts` consumes no retrieval at all.

Attaching a `retrievalOutcome` to them would be **inventing a signal** — a confident number
nobody measured, on a surface that has no retrieval to be uncertain about. That is the thing
this file exists to prevent, so it is not done.

What is done instead is durable: the coverage guard means a future generation path **cannot**
start consuming retrieval without publishing an outcome. The enforcement point exists before
the feature does.

---

## 6. The guard, and proof it can fail

`scripts/check-retrieval-outcome-coverage.mjs`, wired into `ci:local`. Static; no socket, no
database.

Every file calling `hybridSearch` is either **serving** (must collect degradation **and**
publish an outcome) or **non-serving** (named here with a reason, so "it is only a script" is
a decision somebody wrote down).

It also checks the reverse: a route that passes a literal `semanticIndexSufficient: true` has
opted itself out of the conservative default without anyone deciding it should — the same
shape as `enrich-worker.cmd` opting out of a fleet-wide pause because it had its own loop.

`OBSERVED_BY_EXECUTION`:

```
retrieval outcome coverage: OK — 3 serving caller(s)
  (arguments/counter.ts, search/route.ts, search/saved.ts)
  each collect degradation and publish an outcome;
  3 non-serving caller(s) named and exempt
```

**Falsified**, because a guard that cannot fail is what green looks like — hard-coding
`semanticIndexSufficient: true` in `saved.ts`:

```
retrieval outcome coverage: 1 problem(s)
  search/saved.ts
    hard-codes semanticIndexSufficient: true
```

Restored → OK. It also refuses to pass vacuously: finding zero serving callers is itself a
failure, because that would mean its detection is broken rather than that the codebase is clean.

---

## 7. The conservative default

```ts
export const SEMANTIC_INDEX_SUFFICIENT = false;
```

R7 §8: *"until NEW1 thresholds pass, semantic-dependent routes default conservatively."* One
constant rather than a judgement call repeated at five call sites, and a test asserts it is
false. The evidence it encodes (NEW1, bus 1162/1163):

- end-to-end retrieval is **24.4%**, not the 37.8% conditional figure — 38% of posed targets
  are not in the index at all
- `adverse_authority` and `statute` score **0** for every representation arm tested
- held-out abstention will cover **6 of 8** posed classes

The test fails the day someone sets it true, which forces them to come here, read why it was
false, and change it deliberately rather than as a tidy-up. Flip it when NEW1 publishes an
accepted candidate retrieval path and Fifth reviews it.

**Consequence today, stated plainly:** with the default false, a semantic query returning zero
results is `coverage_unknown`, not `abstained`. We cannot claim to have looked properly on
24.4% end-to-end. That is the conservative direction and it is the correct one.

---

## 8. No copy

Not one string an advocate reads. NEW3 owns that; these states are the facts the copy must be
written FROM. `CITATION_HARNESS.md` is explicit that *"we could not confirm this exists"* and
*"verification failed"* are different sentences about the same fact, and choosing between them
is not the server's call.

Two things the copy will need, flagged rather than decided:

- `coverage_unknown` **must not** offer a retry that cannot work. NEW3's 1167 already found
  that shape in the degraded copy.
- `abstained` and `coverage_unknown` must read differently. The whole point is that one means
  we looked.

---

## 9. Verification

| check | result |
|---|---|
| `outcome.test.ts` | **20 pass**, 0 fail (`node --test`) |
| affected search suites | **31 pass**, 0 fail |
| `counter.test.ts` | **7 pass**, 0 fail (needs `DATABASE_URL`; without it every case 500s on auth) |
| `tsc --noEmit` on `services/api` | clean |
| coverage guard | OK, and falsified |

---

## 10. For the consumers

**RCC (1128 closed):** `retrievalOutcome` is always present on `/search`,
`/arguments/counter` and the saved-search feed. Render from `state`; `resultCount` is a fact
beside it and never the confidence signal. `coverage_unknown` may never render as "no results".

**NEW3:** this is the candidate contract §11 waits on. `safeForGeneration` is the single gate
for "can this become confident prose", and the cross-route uncertainty check you are asked to
run has one field to assert on rather than four to combine.

**NEW1:** `SEMANTIC_INDEX_SUFFICIENT` is the switch your G3 evidence flips. It is one
constant, one test, one review.
