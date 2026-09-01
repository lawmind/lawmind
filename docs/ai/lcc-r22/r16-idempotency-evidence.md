# LCC R22 — R16 `Idempotency-Key`, implemented

Evidence for NEW3's independent acceptance of contract revision R16
(`docs/product/RCC_V1_API_CONTRACT_R16_AMENDMENT.md`, bus 1691).

```text
CONTRACT_REVISION       = R16          (read, not written by this lane)
WIRE_PROTOCOL           = 1            (unchanged)
WIRE_BREAKING_CHANGE    = NO           (unchanged)
MIN_SUPPORTED_CONTRACT  = 1            (unchanged)
RELEASE_STATE           = UNRELEASED   (unchanged — NEW3's to move)

IDEMPOTENCY_ARCHITECTURE      = ONE_GENERIC_LEDGER
GENERIC_LEDGER                = api_idempotency_records
LEDGER_DATABASE               = USER_MATTER (no corpus foreign key)
LEDGER_IDENTITY               = users.id + uppercase method + canonical route template + key
REQUEST_FINGERPRINT           = sha256(canonical {v, method, route, params, query, validated body})
IDEMPOTENCY_RETENTION_POLICY  = UNDECIDED_REQUIRES_NEW3
```

## 1 · One mechanism, not six

`Idempotency-Key` is request metadata. Six per-domain key columns would have been
six uniqueness rules, six replay shapes and six chances for the next create route
to forget — and R16's scope is identical at all six, so it is expressed once.

Naturally idempotent routes were **left alone**, as the contract requires:
`POST /matters/:id/authorities` keeps its live `(matter_id, judgment_id)` partial
unique index and `POST /citations/copies` keeps its `(user_id, client_key)`
unique index. Neither gained a second mechanism, and no existing `clientKey` or
`idempotencyKey` operation was renamed, removed or re-typed.

**No write anywhere is deduplicated by content.** The request body is hashed,
never stored; nothing consults annotation text, a quote, a paragraph number, a
date, a case title, a CNR or a party name. Two identical annotations under two
different keys remain two intentional writes, and test `I` asserts it.

## 2 · The six routes

| route | transaction | wrapper | fingerprint inputs | replay |
|---|---|---|---|---|
| `POST /judgments/:id/annotations` | wrapper's, handler writes on it | `withIdempotency` | body + `{id}` | original 200 + annotation |
| `POST /matters` | wrapper's | `withIdempotency` | body | original 201 + matter |
| `POST /matters/:id/events` | wrapper's | `withIdempotency` | body + `{id}` | original 201 + event |
| `POST /me/data-requests` | wrapper's | `withIdempotency` | body | original 201 + request |
| `POST /verify/confirm` | wrapper's | `withIdempotency` | body | original 200 + confirmation |
| `POST /me/training-consent` | handler's own, as a SAVEPOINT inside the wrapper's | `withIdempotency` | body | original 200 + consent |

Two handler-side adjustments were needed and both are named where they live:

* `createMatter` gained an optional fifth argument, the POOL, for its
  fire-and-forget activation metric. A background write on a transaction handle
  runs after that transaction has committed. The metric may be lost; it may not
  take the matter with it.
* `grantTrainingConsent` / `withdrawTrainingConsent` opened their own
  transaction with `sql.begin`. postgres.js gives a transaction handle
  `savepoint` and **not** `begin`, so under the wrapper that threw
  `sql.begin is not a function`. Both now call `atomically`, which already
  existed in `court/guard.ts` for the eCourts quota reservation and has moved to
  `transaction.ts` so neither `idempotency.ts` nor `training/consent.ts` has to
  import a court guard to get it. `court/guard.ts` re-exports it; no court call
  site changed.

## 3 · Why the domain write and the record cannot come apart

The naive design — commit the domain row, then record the key — has two
transactions and therefore a crash window, which is the original bug moved
earlier. There is exactly one transaction here, and
`INSERT … ON CONFLICT DO NOTHING` is its first statement. Measured against this
cluster before the design was chosen (`docs/ai/lcc-r22/probe-onconflict.mjs`):

```text
A inserted=1
B inserted=0 waitedMs=645 sees=["A"]     executor commits → follower blocked, then replays
C rolled back
D inserted=1 waitedMs=450                executor aborts  → follower WINS the insert
F: caught code=55P03 canceling statement due to lock timeout
final=[["k1","A"],["k2","D"],["k3","E"]]  one row per key, always
```

That is the whole concurrency design: the unique index elects the executor, a
rolled-back executor leaves nothing behind, and `SET LOCAL lock_timeout` turns an
over-long wait into an answer. **No `in_progress` row is ever persisted, so no
reaper and no TTL exists** — which matters because the retention policy is
undecided and inventing a silent TTL is forbidden.

A deferred constraint trigger makes "a committed record is a complete record" a
database invariant. It **re-reads the row by id and does not trust `NEW`**, for a
measured reason (`docs/ai/lcc-r22/probe-deferred-trigger.mjs`):

```text
TRIGGER FIRED: NEW.done=<NULL> ; live.done=yes
TRIGGER FIRED: NEW.done=yes    ; live.done=yes
```

A deferred AFTER-INSERT trigger fires at COMMIT carrying the tuple as it was at
INSERT time. The first version of this migration guarded on `NEW` and rejected
every correct transaction — an outage wearing an invariant's clothes. Caught by
the conformance suite before commit.

## 4 · Conformance — 23 tests, all thirteen situations

`services/api/src/idempotency.test.ts`, run against real Postgres.

```text
✔ J  legacy request with no key — two creates, no ledger row
✔ K  empty / short / interior-space / interior-tab / comma-joined / 129-char keys → 400
     INVALID_IDEMPOTENCY_KEY, nothing reserved, nothing mutated; 8 chars exactly is accepted
✔ A  lost-response retry → original 201, same matterId AND same createdAt, ONE matter row
✔ H  response discarded after commit → still one durable mutation
✔ C  same key, one edited free-text field → 409 IDEMPOTENCY_KEY_REUSE_MISMATCH,
     zero new rows, and the ORIGINAL request still replays afterwards
✔ C2 reordered + pretty-printed body → same fingerprint, replays (not a mismatch)
✔ D  same key, second matter, identical body → 409 mismatch; second matter gains nothing
✔ E  query and path-parameter values change the fingerprint; key order does not
✔ F  validation failure → 400 INVALID_REQUEST, key NOT consumed, corrected request reuses it
✔ I  identical content under two keys → two rows
✔ L  principal isolation — Bob's identical key executes and yields Bob's own matter;
     his own reuse with a different body conflicts with HIS record, not Alice's
✔ M  same raw key on /matters and /me/data-requests → both execute, two records
✔ matter events / data requests / training consent / annotations / verify confirm
     — replay is byte-identical and the domain table gains exactly one row
✔ a business refusal (404) replays as the refusal; a different fingerprint under
     that key still 409s; no resource is created
✔ G  handler dies before commit → 500, no matter row, NO ledger row, and the same
     key executes on retry (no reaper ran; nothing expired)
✔ B  two genuinely concurrent requests (executor holds 600 ms) → both 201, same
     matterId, ONE matter row, ONE record
✔ B2 six concurrent duplicates → every answer 201 or 409, ONE matter row
✔ deterministic 409 IDEMPOTENCY_IN_PROGRESS with Retry-After: 1 after the 2 s
     budget, against an uncommitted claim the test holds open; nothing executed
✔ the database refuses a record that would commit without its result

ℹ pass 23  ℹ fail 0  ℹ skipped 0
```

`B` and `G` run through a probe app that wraps a **real** `matters` insert with
the **real** wrapper — the transaction, the unique index, the blocking insert and
the deferred trigger are all the production ones. Nothing about the mechanism is
mocked.

Every replay assertion counts the durable domain rows as well as comparing the
JSON. "The second call returned the same body" is exactly what a broken
implementation that inserted twice and returned the newer row would also print.

## 5 · Migration

`packages/db/drizzle/0100_api_idempotency_records.sql`, journal idx 100,
hash recorded in `meta/_hashes.json`. `MIGRATION_SLOT` held for ordinal
allocation and released after the schema was proven.

```text
FRESH_INSTALL = PASS   scratch database built from migration 0000 onward, then
                       re-run as a no-op; table, unique index, deferred trigger
                       and both CHECKs verified by querying the catalogs
UPGRADE       = PASS   applied to the existing dev database (100 → 101 applied
                       migrations) without touching any other table
```

Constraint census on the fresh install:

```text
api_idempotency_records_scope_key_unique   UNIQUE (user_id, method, route, idempotency_key)
api_idempotency_records_complete_at_commit TRIGGER DEFERRABLE INITIALLY DEFERRED
api_idempotency_records_outcome_check      CHECK (outcome IN ('success','refusal'))
api_idempotency_records_status_check       CHECK (response_status BETWEEN 100 AND 599)
api_idempotency_records_user_id_fkey       FOREIGN KEY (user_id) REFERENCES users(id)
```

```text
CANONICAL_LEGAL_DATA_CHANGED       = NO
CORPUS_ROLLBACK_COUPLED_TO_LEDGER  = NO
```

The second is not an assertion of intent: the table's only foreign key is to
`users`, and the catalog census above is the whole list. The judgment id in
`POST /judgments/:id/annotations` reaches this table only inside the opaque
fingerprint and inside the replayed response body, never as a reference a corpus
restore could break.

## 6 · Sensitive data

```text
SENSITIVE_DATA_DUPLICATED = YES, BOUNDED AND DELETED WITH THE PRINCIPAL
```

The request body is never stored — only its SHA-256. The **success response body**
is stored, because R16 §4 requires a replay to return the original body including
the original resource id and mutation timestamp, and a re-derived body is not the
original one. For an annotation or a matter that copy carries the advocate's own
words back.

So it is deleted with them. `eraseUser` now deletes `api_idempotency_records` by
`user_id`, and `erasure-fixture.test.ts` seeds a row and asserts the outcome
`GONE` in its table-by-table census.

## 7 · Checks

```text
TESTS      services/api, the WHOLE suite: 1158 pass · 1 fail · 4 skipped.
           The one failure is `search/sparse-bound.test.ts` — "admitted narrow
           query must be fast; took 5355ms", a WALL-CLOCK assertion, under the
           load of the full suite running against the same database. Re-run
           alone with the box sampled (pg_stat_activity: 1 active, 1 idle) it
           passes at 611 ms. Not R16, and not a regression: nothing in this
           change touches the sparse arm.
           R16 conformance suite on its own: 23 pass · 0 fail · 0 skipped.
           Six route suites, auth, tenant isolation, erasure (both), eCourts
           guard, quota reservation, citation check: 123 pass · 0 fail.
TYPECHECK  services/api PASS · packages/db PASS
           services/harness was ALREADY RED at HEAD (retrieval.ts
           treatmentAttribution, tranche-reach-delta-cli.mts, v31-freeze-cli.ts).
           Verified by stashing this work and re-running: identical failures.
           Untouched by this change.
LINT       every file this change touches: clean (eslint, 0 problems).
           `pnpm lint` repo-wide is red at HEAD with 4,644 pre-existing errors,
           none in services/api.
FORMAT     `pnpm format` is red at HEAD; app.ts, matters/route.ts, erasure.ts and
           erasure-fixture.test.ts were already prettier-unclean before this
           change (three of them are CRLF). New files are prettier-clean. The
           edits to the four were spliced in the surrounding style and their line
           endings preserved, so this commit adds no reformatting noise and
           removes no pre-existing debt.
GUARDS     migration journal · json configs · contract status · amber
           reservation · schema truth — all green.
```

## 8 · What this does NOT do

* It does not change `CONTRACT_REVISION`, `WIRE_PROTOCOL`,
  `WIRE_BREAKING_CHANGE`, `MIN_SUPPORTED_CONTRACT` or `RELEASE_STATE`. Those are
  NEW3's.
* It does not release R16 to RCC.
* It does not invent a retention or pruning policy. Nothing deletes from this
  table except account erasure.
* It does not weaken any route's authorization: every handler's own auth check
  runs unchanged, and a caller with no profile id bypasses the wrapper entirely
  and meets the handler's 401/403 exactly as before.
