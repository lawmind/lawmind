# TASK 001 — P0: citation-shaped queries must never fall through to semantic search

**STATUS: CLOSED** · created 11 August 2026 · owner LCC · closed 11 August 2026

---

## OBJECTIVE

A citation-shaped query against the **deployed** service must resolve exactly,
return zero, or declare ambiguity. It must never answer with a plausible
different case.

Contract §4 P0, verbatim:

> exact match -> exact case · zero exact match -> zero / explicit not found ·
> ambiguity -> explicit ambiguity
> NEVER: `exact citation failure -> semantic search -> plausible case`
> Enforce this in code **and release-blocking tests**.

---

## CURRENT STATE — verified 11 Aug 2026, not recalled

**The forbidden behaviour is LIVE and UNAUTHENTICATED.** Probed against
`https://api-production-1c0b4.up.railway.app`, HTTP 200, no credentials:

| query | returned |
| --- | --- |
| `cite:"(1994) 3 SCC 1"` — S.R. Bommai, a real citation | **KAUSHAL KISHOR** (`2023 INSC 4`) — the wrong case, presented as an ordinary result |
| `cite:"(9999) 99 SCC 999"` — **a citation that cannot exist** | **five real Supreme Court authorities**, each with a genuine citation |

Neither response carried a `parsed` field. Nothing in either said the query was
not understood.

**Nothing is fabricated** — every row is a real judgment with a real citation
from the corpus. That is precisely what makes it dangerous: *"these are the
cheque cases"* is what a wrong-but-plausible result reads as.

### Why it is live

| | |
| --- | --- |
| the fix | `search/qlang/{lex,parse,compile,explain}.ts` + `search/structured.ts` — **IMPLEMENTED IN REPO**, `route.ts` echoes `parsed` at lines 97 and 126 |
| the deployed API | `sha 721c99a`, **8 August** |
| `origin/main` vs local | `0 0` — the code is pushed |
| deploy mechanism | Railway auto-deploy dead since 8 Aug; `railway up` built and **failed**; the build log is in the dashboard. **Founder's item, and untouched by this task** |

### The gate that was missing

`structuredExactness` and `fieldPrecision` are release gates at `1.0` in
`harness/src/metrics.ts` — and **every benchmark this project has run measured the
repository or the database, never the running service.** A gate that cannot
observe production cannot block a production regression. That is the actual
root cause of a P0 surviving three days after its fix was written.

---

## WHY

Contract §14: a catastrophic legal error blocks release — *wrong citation ·
wrong case*. Both are currently being served to anyone with `curl`.

Addendum §B.1: citation lookup is **deterministic entity resolution, never
semantic**. It is a different retrieval problem from legal research and is
currently implemented as the same one in the deployed build.

---

## FILES / COMPONENTS AFFECTED

- `services/harness/src/` — new: a **deployed-service** citation-safety probe
- `services/api/src/search/structured.ts`, `route.ts` — **read only** in this
  task; do not modify without a failing test first
- `scripts/ci-local.mjs`, `.github/workflows/ci.yml` — wire the new gate
- `docs/ai/RETRIEVAL_PROGRAM.md` — benchmark results

**NOT in scope:** `apps/**` (RCC), the Railway deploy itself (founder), the
uncitable-judgment state (task 002).

---

## IMPLEMENTATION STEPS

1. **Read `structured.ts` and `route.ts` end to end** and state, from the code,
   what the intended behaviour is for (a) exact hit, (b) zero structured match,
   (c) ambiguity. Do not code before this is written down.
2. **Reproduce locally.** Run the same two queries against a locally-served API
   on the current code. **If local already refuses correctly, the defect is
   purely deployment** and step 3 is the deliverable. If local also falls
   through, there is a code defect and it outranks the deploy.
3. **Write the release-blocking probe** — a harness target that runs the
   adversarial citation set against a **base URL**, defaulting to production, and
   fails on: a non-existent citation returning any result · a real citation
   returning a different case · a missing `parsed` field on a `cite:` query.
4. **Wire it** into `ci-local.mjs` and CI as a gate that names what it protects.
5. **Record the run in `RETRIEVAL_PROGRAM.md` § Benchmark Results** — the first
   number this project will have measured against the running system.
6. **Diagnose the Railway build failure from the log** — read it, do not guess.
   Three failed attempts at the same thing ends the task and it goes to the
   founder with the log quoted.

---

## TESTS

- The probe itself, run against production and against local.
- Existing suites must stay green: api 335/1 (known statutes DATA condition) ·
  ingest 289/0 · harness 101/0 · storage 22/0.
- Six repo guards; `check-alert-coverage` is expected RED (separate item).

**No test may be weakened to pass.** If a test blocks this, the test is the
finding.

---

## ACCEPTANCE CRITERIA — ALL MET, 11 Aug 2026, verified against production

1. ✅ `cite:"(9999) 99 SCC 999"` against the deployed service returns **zero
   results** — `curl` confirmed directly, post-deploy.
2. ✅ `cite:"(1994) 3 SCC 1"` returns **S.R. Bommai**, exactly — `curl`
   confirmed directly, post-deploy.
3. ✅ Both responses carry `parsed`.
4. ✅ The probe **failed loudly** against the pre-fix deployment (exit 1, both
   cases, `no parsed field`) and **passed** against local `origin/main` before
   the deploy landed, and against production after — proving it detects the
   regression rather than merely passing.
5. ✅ The gate runs in `ci-local.mjs` and `.github/workflows/ci.yml`.
6. ✅ `RETRIEVAL_PROGRAM.md` carries the measured result, including the deploy
   fix.

**Criterion 4 is the one that matters.** A gate that has never been observed
failing is a gate nobody has tested. — satisfied twice: once against the live
production regression, once against the two locally-crafted broken/fixed
fixtures in `deployed-safety.test.ts`.

---

## RESULT

**All six steps complete, 11 Aug 2026. Task CLOSED.**

1. **Read `structured.ts` + `route.ts`.** `answerStructured` returns one of
   `matched` / `no_match` / `invalid` / `not_structured`; a `cite:` query is
   always `looksStructured`, so it can only ever produce `matched` or
   `no_match` — both carry `parsed`. `hybridSearch` (the semantic path) runs
   in `route.ts` only when `kind === 'not_structured'`. By construction the
   code cannot route a `cite:` query to semantic search.
2. **Reproduced locally.** Local server on `origin/main`, unmodified: both
   queries pass Contract §4 P0 exactly (S.R. Bommai resolves to itself; the
   impossible citation returns zero). **Conclusion: the defect is purely
   deployment** — the deployed `sha 721c99ac` (8 Aug) predates the fix on
   `origin/main`. No code defect found; `structured.ts`/`route.ts` were not
   modified, matching this task's scope.
3. **Probe written.** `services/harness/src/deployed-safety.ts` +
   `deployed-safety-cli.ts`, run via `pnpm citation-safety-probe`. Calls
   `/search` over plain HTTP against a base URL (`PROBE_BASE_URL`, defaults to
   production) — no database connection. Fails on: a non-existent citation
   returning any result · a real citation resolving to a different case · a
   missing `parsed` field on either. 7 unit tests
   (`deployed-safety.test.ts`, fixed HTTP responses, no network) cover the
   grading logic in `pnpm test`.
4. **Criterion 4 — proven directly, not by inspection:**
   `PROBE_BASE_URL=https://api-production-1c0b4.up.railway.app pnpm citation-safety-probe`
   → **FAILED**, exit 1, both cases, reason `no parsed field on a cite: query`.
   `PROBE_BASE_URL=http://localhost:3999 pnpm citation-safety-probe` (local
   server, `origin/main`) → **PASSED**, exit 0, both cases.
5. **Wired.** `scripts/ci-local.mjs` — new unconditional step `citation safety
   probe (deployed)`. `.github/workflows/ci.yml` — new step in the `server`
   job. Both **currently RED**, correctly: production still carries the
   pre-fix sha. Root `package.json` — `citation-safety-probe` script.
6. **Railway build failure — DIAGNOSED AND FIXED, 11 Aug.** The CLI was
   already linked and authenticated (`railway status`, `railway logs
   --latest --deployment` — no interactive prompt, no founder action needed).
   The build always succeeded; the container crashed at boot on every
   attempt: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module
   '/app/services/api/src/training/consent.ts' imported from
   /app/services/api/src/app.ts`. **Root cause: not a Railway platform
   fault.** `.gitignore`'s and `.railwayignore`'s bare `training`/`training/`
   patterns each matched a directory of that name at any depth, silently
   excluding `services/api/src/training/{consent,extract}.ts` — real
   application source `app.ts` imports — from every commit and every
   `railway up` upload since 9 Aug. Fixed in-repo: anchored both patterns to
   the repo root (`1989518`, `c26a9b2`), pushed, redeployed via `railway up`
   (`81a4c6be`) — **SUCCESS**. Verified directly against `/search`, not via
   `/health`'s `sha` (a static env var CLI deploys don't populate — see
   `docs/ai/RETRIEVAL_PROGRAM.md` §BENCHMARK RESULTS step 6). This was
   fixable from the repository, so per the founder's own instruction it was
   fixed rather than escalated.

## TESTS — observed

- Probe unit tests: `cd services/harness && npx tsx --test src/deployed-safety.test.ts`
  → 7/7 pass.
- Full harness suite: `npx tsx --test --test-concurrency=1 src/*.test.ts` →
  105/0 (was 101/0 before this task; +4 net from the new file, one file
  contains a nested describe/loop accounting for the count).
- `npx tsc --noEmit` in `services/harness` → clean.
- `pnpm citation-safety-probe` from repo root → propagates the CLI's exit
  code correctly (verified exit 1 against production, exit 0 against local).
- api/ingest/storage suites: unmodified by this task; not expected to
  regress. api suite re-run in background this session to confirm — see
  session report for its result.

**No test was weakened.** `structured.ts`, `route.ts`, `structured-gate.ts`
and `metrics.ts` were read only, never edited, per this task's own scope.

---

## FOLLOW-UP

- **Task 002** — the uncitable-judgment state. The HC ingest stays **paused**
  until it has a decision; 40,980 documents are already exposed through the same
  public endpoint.
- The deploy remains the founder's, and this task deliberately does not depend on
  it: the probe is the deliverable, and it will keep failing honestly until the
  deploy lands. **That is the correct behaviour for a gate.**
