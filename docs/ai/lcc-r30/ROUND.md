# LCC R30 — the R16 500s the Galaxy S24 found, and the 2022 INSC 690 reader timeout

Start: `HEAD_START = 7c4e4060` (RCC R27's two local commits `b4987ef1`,
`7c4e4060` sit on `origin/main = fe96f498`; both are local objects and ancestors
of HEAD, and this round did not integrate or push them).

## 1 · R16: every keyed create answered 500

**Root cause.** `index.ts` passed `userSql` to `createAuth`.
`packages/auth` wraps its client in `drizzle(config.sql)`, and drizzle-orm's
postgres-js driver **replaces that client's json (114) and jsonb (3802)
serializers with an identity function**
(`drizzle-orm/postgres-js/driver.js`, `client.options.serializers['3802'] = transparentParser`).
From then on, every raw `sql.json(obj)` on the user pool reached postgres.js's
`Bind` as an object and threw `ERR_INVALID_ARG_TYPE`. It was not the
transaction, the `asHandlerSql` cast, savepoints or `tx.json` itself.
postgres.js copies serializer maps per client, so only the client that was
handed to drizzle is affected.

The suites stayed green because they build the app with `auth: null` on a pool
drizzle never touched. The unkeyed `POST /matters` was broken on the real server
too (`matters/route.ts:243` binds `sql.json(parties)`).

**Fix, made once in the wiring:** `createRolePools` now returns
`auth`, a separate 2-connection client on the user database used only by
`createAuth`. `jsonSerializerDefects()` runs at startup after `createAuth` and
stops the process if any serving handle's json serializer is no longer stock.
R16 itself is unchanged: claim, mutation and outcome still commit in one
transaction, and a 5xx still rolls the claim back.

**Reproduction first.** `scripts/lcc-r30-r16-real-route.mjs` builds the handles
the way `index.ts` does (`createRolePools` plus `createAuth`) and drives the real
Hono routes with signed tokens. With `--wiring legacy` it reproduces the S24
stack exactly: `Bind` at `matters/route.ts:243` and `idempotency.ts:345`, 6/6
routes FAIL, and the guard reports `user:114, user:3802`.

| run | result |
| --- | --- |
| `--topology single --wiring legacy` | FAIL 6/6 (the falsifier) |
| `--topology single --wiring fixed` | **PASS 6/6** + concurrency 2/2 |
| `--topology split --wiring fixed` | **PASS 6/6** + concurrency 2/2 |

The harness checks each route in several steps:

- **First keyed request:** the expected status, +1 durable row, 1 ledger row.
- **Same key, same body:** the same status and data, +0 rows.
- **Same key, different body:** `409 IDEMPOTENCY_KEY_REUSE_MISMATCH`, +0 rows.
- **Injected executor failure:** a trigger raises only in sessions that carry
  the startup GUC `lawmind.r30_fault=on`. The request gets a 5xx, with +0 rows
  and 0 ledger rows. A retry with the same key then executes and adds +1 row.
- **No key:** the legacy status, +1 row, 0 ledger rows.

The data-request row uses an identity-only caller (no profile), which is the S24
account's shape.

Concurrency test: 6 simultaneous requests with the same key, for matter events
and for data requests. Every response was `201`, with one durable row, one
ledger row and 0 open ledger rows. There were no deadlocks.

Real server check: `index.ts` was booted on :3931 with the fix. A keyed
`POST /matters` and its replay both returned 201 and left 1 row. A keyed
identity-only erasure and its replay both returned 201 and left 1 row. No
`level:50` log lines.

## 2 · Reader: `GET /judgments/0c13f977-…` (2022 INSC 690)

`READER_TIMEOUT_REPRODUCED = YES`, on a quiet box (0 other active backends),
through the real server. All 5 reads returned `503 TIMEOUT`, at
10190 / 10020 / 10016 / 10017 / 20027 ms. Between reads, the number of active
backends climbed 0 → 1 → 2 → 8: statements kept running after their request had
already answered, and the fifth read queued for a connection.

**Root cause.** `attachCitesJudgmentId` runs `resolveOne` (one prepared
statement) for each of the judgment's 16 distinct citation keys, spread over
the pool. After five executions on a connection, PostgreSQL may switch that
statement to its generic plan, and here the generic plan is
`Limit → Seq Scan on judgments`: with an estimate of 101,596 matches, `LIMIT 2`
makes a sequential read look cheap. For a key with at most one match it reads
all 18.7M rows. Measured with the same statement and key (`200712SCC1`):

- custom plan (inline, or one of the first five executions): 1.5 ms,
  BitmapOr of all three arms;
- generic plan (`force_generic_plan`): Seq Scan, cost 8,167,197, 57014 at the
  timeout.

**Fix.** `attachCitesJudgmentId` now runs its lookups in one transaction that
starts with `SET LOCAL plan_cache_mode = force_custom_plan`. That setting lasts
only for this transaction and changes no server setting. The fix does not
change the statement timeout, remove the citation lookups or drop the
overruled-status (treatment) checks. It also keeps the lookups on one
connection instead of up to eight.

After the fix, the same five reads on the same quiet server all returned
**200**, at 214 / 62 / 37 / 29 / 29 ms (446,870 bytes each). Time per phase,
over 5 runs:

| phase | ms |
| --- | --- |
| main SELECT | 44.4 (cold), then 1.0–1.2 |
| treatment | 2.8, then 0.2–0.3 |
| paragraph segmentation | 0.7–1.8 |
| paragraph citation resolution | 20.8–26.9 |

The regression test `src/judgments/citations-plan-cache.test.ts` runs 20
lookups on one connection with a 5 s limit. It failed with 57014 before the
fix and passes in 172 ms after it.

Not changed, but at risk from the same mechanism: `cite:` search uses the same
`citationMatchFragment` inside its own prepared statements. This round did not
measure whether a repeated identical structured query goes generic.

## 3 · `/ready` contract status

`GET /ready` (LCC R29) is now listed in `docs/API_CONTRACTS.md` §Implementation
status and in the Platform wire block. `check-contract-status.mjs`:
`contract status ok · 107 endpoints · 94 built`. The guard itself was not
changed.

## 4 · Serving environments must name the forbidden cluster

There is no trusted-cluster policy anywhere in this tree. So in `staging` and
`production`, an empty `LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS` is now a
startup violation (`env:LAWMIND_FORBIDDEN_DB_SYSTEM_IDENTIFIERS`), and
development is unaffected. Five new tests cover it:

- development with an empty list is allowed;
- staging with an empty list is refused;
- production with an empty list is refused;
- staging with the local ID configured and different remote IDs is allowed;
- staging actually connected to the configured local ID is refused.

The R29 deploy dry run carries the variable and adds a fail-closed probe for
this case: **17/17**. `REMOTE_ALPHA_PACKAGE.md` now marks the variable as
required.

## 5 · Also corrected

`idempotency.test.ts` still expected a `404` for an annotation on a missing
judgment. R29 (`94950462`) deliberately changed writes to
`409 CORPUS_TARGET_UNAVAILABLE`. The test now asserts the 409 **and** that code,
so it cannot be confused with the 409 for a reused key.

Pre-existing and not touched:

- `idempotency.test.ts:104`: `principalLedgerCount` is defined but never used
  (an eslint error at HEAD);
- prettier drift at HEAD in `index.ts`, `citations.test.ts`,
  `API_CONTRACTS.md` and `REMOTE_ALPHA_PACKAGE.md`.

## Gates

The following suites passed together, **130/130**:

- identity-only deletion;
- admin data-requests;
- the R17 target-unavailable, judgment-route and authorities suites (including the corpus-split variant);
- citations, including the plan-cache regression;
- serving contract;
- db-roles and db-role-wiring;
- pools;
- R16 conformance.

`tsc --noEmit` passes, and eslint and prettier are clean on every file this round touched.

**Full API suite, run once:** 1315 tests, 1292 passed, 19 failed, 4 skipped.

- **18 of the failures were caused by this round.** The spy in
  `search/citation-boundary-parity.test.ts` had no `begin`, which the resolver's
  new transaction needs. The spy is fixed, and that file now passes 65/65
  together with `citations.test.ts`.
- **1 failure was already there before this round.**
  `search/production-callers.test.ts` reports that `release/activation.ts`
  (LCC R29, not changed here) calls `hybridSearch` but is not in
  `PRODUCTION_CALLERS`. It is still open.

The full suite was not run a second time.

## Non-claims

- The physical S24 has not re-run anything. RCC owns that re-run.
- `VERIFY_CONFIRM` is proven through the route with a local fixture, not on the
  device.
- The over-4,000-character annotation limit, the premium-preview 404 and the
  mobile crash are not LCC P0 and were not touched.
- No paid infrastructure, no remote resources, no HNSW index build, no
  migration.
