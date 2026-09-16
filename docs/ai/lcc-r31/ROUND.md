# LCC R31 — B2 caller taxonomy, B3 `cite:` plan-cache falsification

Start: `HEAD_START = ab235aab` (= `origin/main` at start). Scope is NEW3 R24's
two bounded server items (bus 1782). Nothing else was touched.

## B2 · `production-callers.test.ts` — PASS

**Before.** Red, one failure: `release/activation.ts` was a fourth "production"
`hybridSearch` caller with no admission slot.

**Root cause.** A classification error in the guard, not an ungated route. The
old guard had two classes (test/CLI/bench vs "everything else"), so the release
activation smoke — `runSearchSmoke`'s one lexical ranker probe — read as a
serving path.

**Call graph (mechanical).** Importers of `release/activation.ts`:
`ops/release-restore-cli.ts`, `release/activation.test.ts`, and the operator
scripts `scripts/lcc-corpus-activation-proof.mjs`, `scripts/lcc-deploy-dry-run.mjs`.
`index.ts` (the `pnpm start` entry) cannot reach it by any relative import. No
HTTP route invokes it. (`activateCorpusGeneration` does not exist; the gate is
`activationDecision`.)

**Fix.** The guard now has three explicit classes:

| class          | decided by                                 | invariant                                                                                          |
| -------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| TEST_BENCH_CLI | file-name pattern (unchanged)              | none                                                                                               |
| USER_REQUEST   | reachable from `index.ts` via import graph | exactly `search/route.ts`, `arguments/counter.ts`, `search/saved.ts`; acquire + release in finally |
| RELEASE_OPS    | registered by name, with a reason          | unreachable from `index.ts`; imported only by tooling; contract below                              |

The source scan still discovers every direct `hybridSearch(` call; an
unclassified caller fails. The `release/activation.ts` contract is pinned:
exactly one ranker call, `queryVector = null`, limit ≤ 10 (it is 5), mode
`'sparse'`; no import of `search/event.ts`, `product/activation.ts`,
`release/capabilities.ts`, `release/enforce.ts`; no write statement; and a
thrown ranker probe (or an empty smoke) makes `activationDecision` REFUSE.

**Negative falsifiers** (synthetic trees through the same function):
A new serving caller without admission → fails (unclassified, and still fails
once registered without a slot) · B unregistered `release/other-smoke.ts` →
fails · B2 a registered release caller that `app.ts` imports → fails twice ·
C acquire without `finally` release → fails · the same function passes a
correct tree.

## B3 · `cite:` plan cache — NOT_REPRODUCED

Harness: `scripts/lcc-r31-cite-plan-cache.mjs`. It calls the real
`answerStructured` (the POST /search structured path) on a `max: 1` pool, so
every statement runs on one backend with postgres.js prepared statements. It
then re-PREPAREs the exact captured statement texts and compares
`force_custom_plan` with `force_generic_plan` (transaction-local only).

A bare `cite:` runs two statements (`plain` plan): `countStructured` (3 params)
and `runStructured` (5 params, `ORDER BY judgment_date DESC, id DESC LIMIT`).

Query set, each re-checked live: A `2022 INSC 690` (1) · B1 `[2018] 3 S.C.R. 65`
(reporter arm, 1) · B2 `(2013) 15 SCC 27` (alias arm, 1) · C `2020 INSC 189`
(ambiguous, 3 — still true today) · D `2099 INSC 99999` (0).

Quiet window (`cite-plan-cache-quiet.json`; no other client backend active
before or after):

- 24 executions per class, interleaved and then back-to-back, on one backend.
  `pg_prepared_statements` reports **generic_plans = 0, custom_plans = 120**
  for both statements. Auto mode never switched.
- Auto timings: p50 3.0–3.2 ms, max 15.7 ms (the first cold execution). 0 timeouts.
- Outcomes: A/B1/B2 `matched` total 1, C `ambiguous` total 3, D `no_match`. The
  same ids on every execution.
- Forced custom: BitmapOr over `judgments_neutral_citation_key`,
  `judgments_reporter_citation_keys_gin` and `judgments_pkey` (alias InitPlan),
  estimated cost ≈1.5k, 1.2–1.4 ms.
- Forced generic: **the same BitmapOr of the same three indexes**, under a
  parallel Gather; estimated rows 25,399, cost ≈117k–122k; 29–150 ms (the
  spread is parallel-worker start-up), ≈320 buffers. No seq scan and no
  backward date-index walk. Ids and counts identical to custom for every class.

Why auto stays custom: PostgreSQL uses the generic plan only when its
estimated cost is not above the average custom cost. Here it is about 80×
higher. The R30 reader failed differently: its generic plan was a cheap-looking
`Limit → Seq Scan`. That is impossible here, because every arm of
`citationMatchFragment` is indexable (the 19 Aug fix).

No production change. No timeout, planner-global or pool setting touched. No
semantic fallback.

`cite-plan-cache-concurrent.json` is an earlier identical run that overlapped
the targeted test run. It is kept for completeness; its conclusions are the
same, and it is not the quiet-window evidence.

## Gates

- `production-callers.test.ts`: 13/13 (was 4/5 with one red).
- Targeted (guard, structured, structured-bound, citation predicate/boundary
  parity, search route, refusal-total, judgments route, reader plan cache, db
  role wiring, release activation): 150 tests, 148 pass, 0 fail, 2 skipped.
- API typecheck (`tsc --noEmit`): clean. ESLint on both changed/new source
  files: clean. Prettier: the harness is clean. `production-callers.test.ts`
  was already failing `prettier --check` at HEAD (CRLF), and this round kept
  its line endings.
- Full API suite, once, with `.env` (DB tests live): 1,323 tests, 1,319 pass,
  **1 fail**, 3 skipped, 575 s. The failure is
  `sparse-bound.test.ts` "admits a globally common term inside a NARROW
  court+date population": 7,575 ms against a 5,000 ms bound. It is
  **unrelated**: `retrieve.ts` and that test are unchanged at HEAD, and the
  test's own header records it as "red under the twelve-suite run on this box
  and green alone". Re-run alone twice at the same HEAD: 5/5 pass, 530 ms and
  152 ms. It is load-dependent timing, not a regression, and the assertion was
  not touched.
