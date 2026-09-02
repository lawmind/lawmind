# LCC R26 — Gate-S1 hybrid sparse performance, and identity_only erasure

Round: LCC R26 · 2 September 2026 · integration base `f0d1490c` (NEW3 bus 1730)

Two independent pieces of work, committed separately.

## 1 · Gate-S1: 12,196 ms p95 -> 2,832 ms, with quality up on train and flat on dev

### 1.1 The whole residual was ONE class

Baseline `--gate-s1 --repeat 3`, n=36:

| class | n | zero | degraded | p50 |
| --- | --- | --- | --- | --- |
| exact citation | 3 | 0 | 0 | 34 ms |
| CNR | 9 | 0 | 0 | 1 ms |
| case number | 9 | 0 | 0 | 335 ms |
| filtered lexical | 3 | 3 | 3 | 9 ms |
| normal research query | 9 | 1 | 1 | 2,780 ms |
| broad / refused query | 3 | 3 | 3 | 1 ms |

Four samples exceeded 3,000 ms and **all four were `normal research query`**, all
of them inside `sparseMs`. Nothing else in the suite came close.

### 1.2 The three slow queries, measured rather than assumed

| query | chosen lexemes (rarest 3, ANDed) | matched rows | count cost | ranked cost, warm |
| --- | --- | --- | --- | --- |
| anticipatory bail in a dowry harassment case | dowri, harass, anticipatori | 13,533 | 160 ms | 336 ms |
| dying declaration corroboration requirement | corrobor, die, declar | 21,635 | 173 ms | 878 ms |
| specific performance of agreement to sell | sell, perform, agreement | 40,031 | 90 ms | 1,490 ms |

**Counting the match set is ~100 ms; RANKING it is seconds.** The plan says why:

    Nested Loop (rows=40,031)  Buffers: shared hit=162,911 read=160,025
      -> Bitmap Heap Scan on judgments   Buffers: shared hit=28,224 read=12,304

The scan itself is ~40,000 buffers. The other ~282,000 are `ts_rank` DETOASTING
`full_text_tsv` once per matched row. `judgments` is 151 GB against a 2 GB
`shared_buffers`, so a cold run reads that from disk - which is the 15,038 ms
sample, and why the same query fell to 2,780 ms by the third repeat.

### 1.3 PREPARED_PLAN_PATH_CAUSAL = NO, and it is not close

Tested every mechanism the round asked for, on the real parameterised statement:

| path | result |
| --- | --- |
| `EXPLAIN (GENERIC_PLAN)` | IDENTICAL plan shape and cost (Bitmap Heap Scan, 101572.37, rows=93,763) |
| `SET plan_cache_mode = force_custom_plan`, x6 | 893, 1040, 376, 387, 455, 618 ms |
| `SET plan_cache_mode = force_generic_plan`, x6 | 599, 617, 615, 621, 626 ms |
| postgres.js `prepare: true`, x8 | 732, 381, 391, 392, 383, 383, 387, 621 ms |
| postgres.js `prepare: false`, x8 | 738, 377, 372, 378, 384, 394, 396, 642 ms |

**The reason there is no difference is structural.** The tsquery is built by
`string_agg` inside a CTE, so the planner cannot see it in EITHER mode. Its
estimate is `rows=93,763`, which is exactly `18,752,608 x 0.005` - Postgres's
DEFAULT selectivity for `@@` with a non-constant operand. It does not vary with
the parameter, so there is nothing for a custom plan to specialise on.

No global `plan_cache_mode` was changed and prepared statements were not disabled
for the API.

### 1.4 Statistics: stale, and provably NOT the cause

`pg_stat_user_tables` reports `last_analyze = NULL` and `last_autoanalyze = NULL`
for `judgments` - it has never been analysed, and `n_live_tup` reads 4 after the
crash this repo already records. **That is real and it is not this bug**: the
estimate above is a hardcoded constant times `reltuples`, so ANALYZE cannot move
it. No statistics target was raised and no extended statistics were created;
`tsquery` selectivity is not something court/date correlation can model.

Recorded for NEW2/NEW1 as a separate observation, not acted on here.

### 1.5 The fix, and why it is two changes

**(a) The tsquery becomes an InitPlan instead of a joined CTE.**

`FROM judgments j, q` is a JOIN, so the planner builds a Nested Loop with the
one-row aggregate outside and the `judgments` scan inside - and a parallel-aware
scan cannot sit on the inner side of a nested loop. As an uncorrelated scalar
subquery it becomes an InitPlan evaluated once, and the scan is free to be a
**Parallel Bitmap Heap Scan**:

| matched rows | join, 1 backend | InitPlan, 4 workers |
| --- | --- | --- |
| 13,533 | 336 ms | 105 ms |
| 21,635 | 878 ms | 152 ms |
| 40,031 | 1,490 ms | 207 ms |

Same index, same match set, same ranks, same buffers (322,936 against 323,224) -
read by five processes instead of one.

**(b) The ordering becomes total.** See section 1.6.

Both changes are applied at BOTH `ts_rank` sites - the corpus-wide ranker and
`rankWithinBoundedPopulation` - because they are the same query with a different
population in front of it. The `MATERIALIZED` fence in the bounded path is
untouched.

### 1.6 THE SURPRISE: the top 50 was already arbitrary

`ts_rank` saturates. Measured on the fixed suite:

| query | matched | distinct ranks | tied at the maximum |
| --- | --- | --- | --- |
| dowri & harass & anticipatori | 13,533 | 9,002 | 1 |
| corrobor & die & declar | 21,635 | 8,048 | **87** |
| sell & perform & agreement | 40,031 | 23,625 | 1 |

For `dying declaration corroboration requirement`, **87 judgments score exactly
0.9999997** and `LIMIT 50` takes fifty of them. Which fifty was decided by heap
order - so the same request answered by a different plan returned a different 37
authorities, and neither set was more correct.

This is the rule the exact-title path in the same file already states: *"the id
makes it total, so two identical requests cannot return two different pages."*
The lexical ranker was the site that did not follow it. It is also what makes the
parallel plan safe by construction: a Gather Merge over per-worker heapsorts is
free to break ties any way it likes.

**The tie-break column was measured, not assumed.** `j.id` alone was tried first
and COST GOLD: on TRAIN it displaced three targets, including
`2025:RJ-JP:22340-DB` - a neutral citation that names NINE connected matters,
where uuid order simply picked a different one of the nine. `judgment_date DESC,
id DESC` is the repo's own existing answer and the legally sensible one.
`judgment_date` is `NOT NULL` with zero nulls measured, so there is no
NULLS-FIRST trap.

### 1.7 Result

Paired runs through the real Hono app, same box, same cache state:

| run | n | p50 | p95 | max | zero-result | degraded |
| --- | --- | --- | --- | --- | --- | --- |
| baseline (cold) | 36 | 184 ms | **12,196 ms** | 15,038 ms | 7 | 6 unbounded + 1 timeout |
| baseline (warm, paired) | 36 | 142 ms | **10,899 ms** | 15,041 ms | 7 | 6 unbounded + 1 timeout |
| final | 36 | 175 ms | **2,832 ms** | 4,162 ms | 6 | 6 unbounded, 0 timeout |

The warm baseline is the honest comparison: the OLD shape still produced a
15,041 ms sample and a `sparse_timeout` with the cache already warm from the
probes, so the improvement is not a caching artefact.

`REFUSALS_BEFORE = 6` and `REFUSALS_AFTER = 6`, all `sparse_unbounded`, the same
six samples (filtered lexical x3, broad `bail` x3). **No refusal threshold was
introduced or moved.** The one `sparse_timeout` is gone because the query now
finishes, not because it is now refused.

### 1.8 Quality

`ADVOCATE_RETRIEVAL_GOLD_V2`, scored through `hybridSearch` at candidate depth
50. **The holdout split was not read.** No embedder locally, so the dense-dependent
families measure their lexical half only - the same way in both runs.

TRAIN (tuning split), 304 queries:

| | @10 | @50 |
| --- | --- | --- |
| before | 64.1% | 65.5% |
| after | **67.1%** | **68.8%** |

Per query: 240 unchanged, **13 gained**, 3 lost, 12 moved. The three losses are
all ties of the kind section 1.6 describes - the previous heap order happened to
return the gold row and uuid/date order returns a different equally-ranked one.
The 13 gains are mostly queries the old shape TIMED OUT on: a timeout returns
nothing, and nothing scores zero.

DEV (frozen, run ONCE after the implementation was chosen), 90 queries:

| family | n | @10 before | @10 after | @50 before | @50 after |
| --- | --- | --- | --- | --- | --- |
| adverse_authority | 9 | 88.9% | 88.9% | 88.9% | 88.9% |
| case_title_identity | 15 | 80.0% | 80.0% | 80.0% | 80.0% |
| criminal_code_transition | 22 | 0.0% | 0.0% | 4.5% | 4.5% |
| exact_identity | 8 | 100.0% | 100.0% | 100.0% | 100.0% |
| long_narrative | 12 | 83.3% | 83.3% | 83.3% | 83.3% |
| pasted_passage | 13 | 61.5% | 61.5% | 61.5% | 61.5% |
| statute | 7 | 0.0% | 0.0% | 14.3% | 14.3% |
| supporting_authority | 4 | 100.0% | 100.0% | 100.0% | 100.0% |
| **ALL** | 90 | **55.6%** | **55.6%** | **57.8%** | **57.8%** |

**Identical in every family**, with latency far down inside it (`statute` p50
6,667 -> 766 ms; `criminal_code_transition` 3,015 -> 759 ms). Exact citation, CNR
and case-number classes are unchanged in the Gate-S1 suite as well.

### 1.9 THE CAVEAT THAT MATTERS: the win IS the parallelism

Measured by varying `max_parallel_workers_per_gather` on the 40,031-row query:

| workers | new shape | old shape |
| --- | --- | --- |
| 4 | 230, 181, 212 ms | 495, 399, 388 ms |
| 2 | 221, 219, 243 ms | 454, 665, 663 ms |
| **0** | **645, 637, 635 ms** | **632, 633, 632 ms** |

**With no workers available the two shapes are the same.** The change is never
worse, but its benefit is entirely contingent on a worker being free. This
cluster has `max_parallel_workers = 12` and `per_gather = 4`, so only THREE
concurrent research searches get full parallelism and the fourth onward runs at
old-shape cost.

That is a real staging risk and it is not closed by this round. No global setting
was changed to hide it (`work_mem` 32 MB, `statement_timeout`, pool sizes and
parallel settings are all untouched). The residual structural gap behind it: the
CORPUS-WIDE ranker still has no population fence at all, unlike the filtered
path - a broader-but-still-admitted query with 200k matches would return to a
timeout. Bounding it needs either a new refusal (which this round was told not to
invent) or truncation (which costs recall), so it is recorded rather than done.

`GLOBAL_WORK_MEM_CHANGED = NO` · `STATEMENT_TIMEOUT_CHANGED = NO` ·
`CLIENT_TIMEOUT_CHANGED = NO` · `GIN_FUZZY_SEARCH_LIMIT_USED = NO` ·
`HIDDEN_HOLDOUT_READ = NO`

## 2 · identity_only account deletion

### 2.1 Reproduced first - and the reported status was WRONG

RCC bus 1722 and NEW3 SR-1 both describe **`401 AUTH_REQUIRED` at
`data-requests.ts:95`**. Driven through the real app at HEAD, against a verified
`auth_user` with a session and no `users` row:

    profile rows for this identity: 0
    POST /me/data-requests -> 403 {"code":"PROFILE_INCOMPLETE",
      "message":"Your account is signed in but onboarding is not finished yet."}

**The advocate saw 403, not 401.** `data-requests.ts` does raise `AUTH_REQUIRED`,
but `resolveAuthFailure` in `envelope.ts` rewrites it to `403 PROFILE_INCOMPLETE`
whenever `authId` is set - a deliberate fix from RCC bus 0058 for a different
problem. The line number in the report was right and the wire status was not.

It does not change the fix; it changes what a client is matching on, so RCC
should know before writing any handling against a 401 that never arrives.

### 2.2 The principal is the auth identity - migration 0103

`data_requests.user_id` and `api_idempotency_records.user_id` were both
`NOT NULL REFERENCES users (id)`. Both gain `auth_id text NOT NULL`, `user_id`
becomes nullable, and R16's uniqueness boundary moves to
`(auth_id, method, route, idempotency_key)`.

**Why not simply make `user_id` nullable** - the trap NEW3 named, restated because
it fails SILENTLY: NULLs are distinct in a unique index, so
`(NULL, 'POST', '/me/data-requests', 'k')` inserts twice, no constraint
complains, and every retry creates another erasure request while the API still
answers 200. A scope that never collides is a bypass wearing R16's clothes. The
test for this counts ROWS, not responses, because the response is identical
either way.

`users.auth_id` is already `text NOT NULL UNIQUE`, so profile <-> identity is 1:1
and total: **the set of distinct principals does not change**, no existing key
changes meaning, and no existing row becomes a duplicate. 0100's own column
comment already said *"The PRINCIPAL, not the access token"* - the comment was
right and the column was the approximation.

Backfill is a join with a fail-closed guard: the migration RAISES rather than
install a `NOT NULL` that would silently drop an unresolvable row. Both tables
were empty on this database, so the backfill was structural here and the guard is
for the deployment that is not.

No foreign key from `auth_id` to `auth_user`: erasure DELETES that row, and the
data request is the record that the erasure was asked for. It must outlive the
identity it names.

### 2.3 SR-4/SR-5 - the executor resolves the principal at execution time

`data_requests.user_id` records the profile AS IT WAS WHEN ASKED. If the advocate
onboards between asking and execution, trusting the stored NULL would destroy the
identity layer and leave their matters behind. So `executeErasure` looks the
profile up from `auth_id` NOW and branches:

- profile exists -> `eraseUser` (unchanged)
- no profile -> `eraseIdentityOnly`

`eraseIdentityOnly` destroys what this population actually holds - and it is not
nothing: the email address and name (`auth_user`), the per-session IP address and
user-agent (`auth_session`), the provider row (`auth_account`), magic-link
artifacts keyed by EMAIL with no foreign key to cascade from
(`auth_verification`), and the hashed refresh-token family. **No `users` row is
created in order to erase one.** An already-absent identity returns zero counts
rather than throwing, because a stuck request is worse than a zero.

`eraseUser` also widened: its idempotency sweep is now
`user_id = <profile> OR auth_id = <identity>`, because a record written BEFORE
onboarding carries the identity and a NULL profile - and `response_body` can hold
the advocate's own words. The fixture now seeds exactly that row and asserts it
is gone, since the `EXPECTED` loop asks `WHERE user_id = <victim>` and would read
0 whether it was deleted or not.

### 2.4 Tests

`src/identity-only-deletion.test.ts`, 10 tests, all passing:

initiation without a profile (and NO profile created, asserted directly) ·
no onboarding and no new personal data demanded · R16 retry is one request AND
one ledger row · a different key is still one open clock per kind · two auth
principals sharing a key value are isolated · unauthenticated still refused 401 ·
the request survives later profile creation and the executor can still resolve it ·
the identity layer is destroyed and counted · an absent identity is zero not a throw ·
profile-backed initiation unchanged.

## 3 · Tests run

| suite | result |
| --- | --- |
| `identity-only-deletion` | 10 / 10 |
| deletion neighbourhood (erasure, erasure-fixture, admin data-requests, envelope, identity-only) | 35 / 35 |
| R16 conformance (`idempotency.test.ts`) | 23 / 23 |
| search neighbourhood (11 files incl. sparse-bound, route, outcome, production-callers) | 129 tests, 0 fail |
| `tsc --noEmit` | clean |
| guards: migration journal, schema truth, json configs, contract status, retrieval outcome coverage | all OK |

## 4 · Pre-existing defects found, one fixed

**`0102_soft_corpus_references` had no recorded hash** in
`packages/db/drizzle/meta/_hashes.json` at HEAD, so `check-migration-journal.mjs`
was RED before this round started. It is an LCC R25 miss, and NEW3's integration
verification did not catch it because it checked journal-to-file one-to-one, not
hashes. Fixed here (it is this lane's file); the guard now reports 104
migrations OK.

**`retrieve.ts` fails `eslint` at HEAD** - `'precedentialEffect' is defined but
never used`. Confirmed pre-existing by stashing this round's change and
re-running. Not touched: it is outside the ask.

**`retrieve.ts` and `app.ts` fail `prettier --check` at HEAD.** Not reformatted -
a `--write` would rewrite the whole file and bury a 67-line diff. The two files
this round CREATED are prettier-clean.

## 5 · Not done

- The corpus-wide sparse ranker still has no population fence (section 1.9).
- `judgments` has never been ANALYZEd (section 1.4). Recorded, not acted on.
- `READY_FOR_REMOTE_ALPHA_INFRA_PROVISIONING = NO`. No paid infrastructure was
  created and NEW1 was not interrupted.
