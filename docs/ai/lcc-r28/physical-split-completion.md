# LCC R28 — the physical database split, closed across the whole current-v1 graph

`HEAD_START = 6124b5f0`

R25 built the split foundation and proved the PROPERTY: two databases, a
`TRUNCATE` that cannot cross, a backup that restores, generations that switch.
R27 added the activation gate. Both were true, and neither answered the question
this round exists for — **does the product work when the two are apart?**

It did not. Measured before anything was changed, against two physically distinct
databases each stripped of the other role's tables:

```
31/46 pass · 2 fail · 13 wrong-role
missing relations: matters · documents · saved_searches · judgment_annotations
                   citation_checks · users
```

`GET /matters`, `POST /matters`, `/search`, `/documents`, `/saved-searches`,
`/me/alert-settings`, `/me/training-consent`, every annotation route and **every
`/admin/*` route** — the last because `requireAdmin` reads `users`, so the gate
protecting the admin surface failed before any handler ran.

After this round:

```
64/64 pass · 0 fail · 0 wrong-role
```

## Why R25's smoke reported success on the same code

`lcc-split-api-smoke.mjs` drove three requests: `/health`, and `/matters` and
`/alerts` unauthenticated. A user route wired to the corpus handle answers `401`
to an unauthenticated caller **exactly as correctly as a right one does** — the
auth check runs first. Three requests, all green, on a build where thirteen
routes were broken.

Two things follow, and both are now built rather than remembered:

- the matrix authenticates, and asserts on **content** as well as status, because
  a route that swallows its own error and answers `200 []` is the silent version
  of the same defect;
- the two databases have the other role's tables **removed**, so a wrong-role
  query cannot succeed by accident. §8's halfway version — dropping only
  "representative" tables — has a failure mode of its own: the one table left
  behind is the one the wrong query happens to read.

## The architecture, not the thirteen symptoms

`ops/db-roles.ts` already said which database owns which table. What was missing
was any way to know which database a given `sql` handle was connected to, and
that gap is invisible in `single` mode — the configuration every developer runs,
in which every wrong-role query works perfectly.

Three things close it.

**`scripts/lcc-db-role-audit.mjs`** derives the roles each module needs from the
SQL it actually contains: 91 modules touch the database, 37 corpus-only, 37
user-only, 17 genuinely both. That derivation is what the wiring must satisfy.

**`services/api/src/db-role-guard.ts`** is a role-tagged handle. It reads the
tables a statement names, resolves them through the same map, and **throws before
the statement is sent** — on one database, in a test run. It never retries
against the other role, and that is the point: a fallback would make every
wrong-role query work in development, in staging and in CI, and fail only in the
one configuration nobody runs until the cutover.

**`services/api/src/db-role-wiring.test.ts`** is the static half. It fails when a
module names a table nobody classified, when any single statement names both
roles, and when a module joins the cross-role list without anyone deciding how it
gets its second handle. It caught one thing while being written —
`pg_stat_database` in `round-measure-cli.ts` — which is the behaviour asked of it.

## The rule the wiring now follows

A handler gets `userSql` when the tables it owns are user tables, `sql` when they
are corpus tables, and **both — user handle first, corpus handle trailing** — when
it genuinely needs the two. The trailing `corpusSql: Sql = sql` default is the
repository's existing pattern (`alerts/route.ts`, `premium/preview.ts`), so every
single-database caller, test and CLI is unchanged.

Seventeen modules need both. Every one is a place where an advocate's own row is
shown beside a fact about published law, which is what `SOFT_CORPUS_REFERENCE`
means in practice.

Three wirings are worth naming because they were not obvious:

- **better-auth was constructed on the corpus handle.** `auth_user`,
  `auth_session`, `auth_account` and `auth_verification` are all user-owned. A
  split deployment could not have authenticated a single request.
- **`withIdempotency` opened its transaction on the corpus handle.**
  `api_idempotency_records` is user-owned, so the transaction a handler runs
  inside is a USER transaction. The corpus handle now rides *alongside* it rather
  than inside it — there is no cross-database transaction and this round did not
  invent one.
- **`createMatter`'s fifth argument** is the pool its fire-and-forget activation
  write goes to, and it was the corpus pool. The funnel metric is allowed to be
  lost; it is not allowed to throw against a database with no `activation_events`.

## Cross-role reads stay batched

`judgments/hydrate.ts` was already the right shape — ids → one `= ANY` corpus read
→ `Map` → deterministic merge, with a missing id as a first-class outcome rather
than an error. R28 changed no hydration; it passed the corpus handle to the two
callers that had taken one since they were written and had never been given one:
`readDocument` (so `GET /documents/:id` hydrated nothing) and `hearingPackPreview`.

`CURRENT_V1_CROSS_ROLE_SQL_JOINS = 0`, asserted from the source and not from
memory.

## The six zeroes

Measured, not asserted (`required-zeroes.json`):

```
CURRENT_V1_CROSS_ROLE_FKS        0   of 83 foreign keys examined
CURRENT_V1_CROSS_ROLE_SQL_JOINS  0
FDW                              0   no *_fdw extension, no foreign server, no relkind='f'
DBLINK                           0   extensions: pg_trgm, plpgsql, vector
DISTRIBUTED_TRANSACTION_LAYER    0   max_prepared_transactions = 0 — the server cannot
WRONG_ROLE_FALLBACK              0
```

`max_prepared_transactions = 0` is worth stating plainly: two-phase commit is not
merely unused here, it is unavailable.

## Blue/green, with the API actually running

R25's blue/green proof is a hand-written `SELECT` that models what the route does.
It is a faithful model, and this round's entire finding is that a model of the
wiring and the wiring had diverged in thirteen places. So
`lcc-r28-bluegreen-api.mjs` switches the corpus generation **under a live app**,
over HTTP, with a real token:

```
A   save + read      201, hydrated: "SYNTHETIC — Present In Generation A Only"
B   same matter      200, unavailableAuthorities[1], availability=corpus_unavailable
                     same authorityId, same addedAt, no fabricated case title
B   new save         409 CORPUS_TARGET_UNAVAILABLE, and the message does not
                     claim no such judgment exists
A   same matter      200, back in authorities[] with its title, same row
USER_DATA_CHANGED_BY_CORPUS_SWITCH = NO   (ordered md5 over 44 tables, 0 changed)
```

## The backup carries what this round added

`lcc-user-backup.mjs` verifies a restore against the DUMP — row counts, checksums.
That answers "did the restore work" and cannot answer "is every row the current
product writes inside it". So the workload is written **through the API**, backed
up, restored elsewhere, and read back **through the API** against the same corpus:

```
44 user tables, 44 present, 0 absent
same identity · same matter · same case title · same events · same authorityId
same addedAt · authority still hydrates from the untouched corpus
same annotations · same data requests · same training consent
idempotency survived the restore — a used key still replays rather than creating
```

Twelve tables carried real rows. One check is vacuous and is named as such:
`same_documents` compared `0 === 0`, because there is no `POST /documents` to
create one with.

## Search: not reoptimised, and shown not to have moved

Nothing in ranking, parallel-worker settings, timeouts or admission thresholds was
touched. That is checkable rather than assertable, and `lcc-r28-search-closure.mjs`
checks it: the transitive import closure of `search/retrieve.ts` is six files —
`retrieve.ts`, `paragraphs.ts`, `precedential-effect.ts`, `body-text-safety.ts`,
`query-shape.ts`, `timings.ts` — and **none of them is in this round's diff**.
`SEARCH_RANKING_CLOSURE_TOUCHED = NO`.

Gate-S1, three runs, LOCAL and contended (the box carried up to 11 active sessions
during the run):

```
run 1   p95 3074 ms      run 2   p95 2812 ms      run 3   p95 2830 ms
```

**One of the three exceeded the 3,000 ms bound.** Runs 2 and 3 reproduce R26's
2,832 ms almost exactly; run 1's excess is one sample — a `normal research query`
at 4,325 ms on the sparse arm, in a pooled n=36 where p95 is the 34th value and a
single outlier moves it. The bookkeeping phase this round actually changed is
`p95 8 ms`. The honest statement is that the median of three runs is 2,830 ms and
the spread is the box rather than the change; one run cannot certify the bound in
either direction, and the CLI's own header says local numbers certify nothing
about staging either way.

Concurrency-3, after a discarded warm-up: `p95 603 ms`, 0 refusals, 4 workers per
leader — no starvation cliff. The gap between that and the single-request p95 is
expected: Gate-S1's mode deliberately keeps its cold case.

## What is still true and unchanged

- Tier 3 is still a human solving the CAPTCHA and vouching. `citations/verify.ts`
  gained a corpus handle for the judgment read and still holds no HTTP client;
  the test asserting that still passes.
- `overruled_status` is still read live on every surface. The split moved which
  handle reads it, never whether it is cached.
- The R17 §1 write contract is byte-for-byte what NEW3 froze at bus 1745, now
  proved across two physically separate generations rather than two schemas.

## How to re-run any of it

```
DATABASE_URL=... pnpm exec tsx scripts/lcc-r28-split-matrix.mjs        --out docs/ai/lcc-r28
DATABASE_URL=... pnpm exec tsx scripts/lcc-r28-bluegreen-api.mjs       --out docs/ai/lcc-r28
DATABASE_URL=... pnpm exec tsx scripts/lcc-r28-user-backup-restore.mjs --out docs/ai/lcc-r28
DATABASE_URL=... pnpm exec tsx scripts/lcc-r28-zeroes.mjs              --out docs/ai/lcc-r28
                 node scripts/lcc-db-role-audit.mjs
                 node scripts/lcc-cross-role-sql.mjs
                 node scripts/lcc-r28-search-closure.mjs <ref>
```

Every disposable database is dropped on the way out; `--keep` on the matrix keeps
the pair for inspection.
