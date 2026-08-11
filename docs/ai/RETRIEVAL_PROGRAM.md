# LAWMIND RETRIEVAL PROGRAM

**Owner: LCC.** Created 11 August 2026 under the LCC Execution Contract and its
Retrieval Program Addendum. Detailed research lives in separate documents; this
file is the recoverable state.

**Everything below is classified `IMPLEMENTED / PARTIAL / EXPERIMENTAL / PLANNED
/ UNKNOWN` against the code as it is, not against any plan.** Where a claim was
not verified this session it says `UNKNOWN`.

---

## CURRENT OBJECTIVE

**Task 001 CLOSED, 11 Aug 2026 — verified against production, not inferred.**
`cite:"(9999) 99 SCC 999"` now returns zero, `cite:"(1994) 3 SCC 1"` now
returns exactly S.R. Bommai, both carry `parsed`. Root cause was two
independently broken ignore files (`.gitignore`, `.railwayignore`) silently
excluding `services/api/src/training/*.ts` from every deploy since 9 Aug —
§BENCHMARK RESULTS step 6. **Current objective: task 002, the
uncitable-judgment state** — founder-authorised 11 Aug to proceed past the
"founder's decision" gate that had held it; severity decided (warn, not
block — see §DECISIONS).

---

## CURRENT ARCHITECTURE

| stage | component | state | note |
| --- | --- | --- | --- |
| primary corpus | `judgments` — 79,321 rows | **PARTIAL** | 38,341 Supreme Court · **40,980 High Court**, ingested 11 Aug |
| canonical entities | `judgment_citation_aliases` (4,097) | **PARTIAL** | SCC 3,877 · AIR 220. Hand-built |
| exact citation retrieval | `search/qlang/` + `structured.ts` | **IMPLEMENTED AND DEPLOYED** | was the P0 defect until 11 Aug — see §BENCHMARK RESULTS |
| lexical retrieval | `full_text_tsv` generated column + GIN, `ts_rank` | **IMPLEMENTED** | **`ts_rank` is NOT BM25 — no IDF.** P2 |
| learned sparse | — | **PLANNED** | P4 |
| dense retrieval | `judgment_chunks`, 616,197 × 1024-dim, HNSW 4.7 GB | **IMPLEMENTED (SC only)** | 0 High Court chunks |
| graph retrieval | `search/graph-expand.ts`, `judgment_citations` 227,478 edges / 97,876 resolved | **PARTIAL** | not a ranking signal yet |
| fusion | `search/retrieve.ts` | **PARTIAL** | UNKNOWN whether RRF or ad-hoc; not inspected this session |
| reranking | `rerank-passages.ts` | **PARTIAL** | UNKNOWN quality; unmeasured against alternatives |
| proposition / evidence | — | **PLANNED** | P7 |
| currentness / treatment | `overruled_status`, `judgments/as-at.ts`, `propagate-treatment.ts` | **IMPLEMENTED** | read live at render, never cached |
| independent verifier | `citations/verify.ts` (Tier 3, human) · `check.ts` | **PARTIAL** | existence only, **not proposition support** |
| counter-authority | `arguments/` | **UNKNOWN** | not inspected this session |
| deterministic citation renderer | `citation/renderState.ts` (client) | **PARTIAL** | Fourth branch (uncitable) **specced** 11 Aug — `CITATION_HARNESS.md` §The fourth concern — **not yet implemented client-side**, briefed to RCC |

---

## CURRENT BENCHMARK

| | |
| --- | --- |
| harness | `services/harness/` — 101 tests, adversarial suite, `metrics.ts` |
| release gates | `structuredExactness = 1` · `fieldPrecision = 1` |
| ungraded diagnostic | `successAt5` — the 0.70 floor was removed 9 Aug; nothing gates on it |
| **golden Indian evaluation set** | **PARTIAL** — 283 queries; reranker settling needs ~577 |
| **run against the DEPLOYED service** | `pnpm citation-safety-probe` — 2 fixed adversarial cases, wired into `ci-local.mjs` and CI, **PASSING against production as of 11 Aug.** Was NONE; that gap is what let P0 live for three days. |

Addendum §O metrics not yet tracked: NDCG · citation-support accuracy ·
counter-authority recall · unsupported-claim rate · abstention accuracy ·
catastrophic error rate.

---

## ACTIVE TASK

**`docs/ai/tasks/001-p0-citation-query-safety.md`** — CLOSED, 11 Aug.
**`docs/ai/tasks/002-uncitable-judgment-state.md`** — spec + server side
CLOSED, 11 Aug; client implementation open, RCC's. Next: §003, corpus
inventory (below), per the P0→P1 priority ladder now that both P0 items are
resolved.

---

## RECORDED CONTRACT REQUESTS — not built, not scheduled

**`POST /search` · `whyRelevant` · requested by RCC 11 Aug (bus 0021) · P2.**
Additive, per result row:

```
whyRelevant?: { signal: 'same_statute' | 'same_section' | 'same_court'
                      | 'cited_by_later' | 'lexical' | 'semantic';
                detail?: string }[]
```

RCC's client contract requires a result to explain **why it was retrieved, from
real signals only**. Verified by them and consistent with what I know of the
code: **no relevance signal crosses the wire today.** RRF scores exist inside
`search/retrieve.ts` and are not returned; there are no matched terms and no
snippet offsets. The client cannot render this honestly without server work.

**Founder said record, do not build.** It also sits behind task 001: a signal
that explains a wrong result is worse than no signal.

## NEXT 5 TASKS

1. ~~**002 — the uncitable-judgment state.**~~ **SPEC LANDED + server side
   complete, 11 Aug.** Severity decided directly by the founder (warn, not
   block). `docs/ai/tasks/002-uncitable-judgment-state.md`. **Remaining:
   client implementation — RCC's, briefed via lane bus.**
2. **003 — corpus inventory (§C).** Classify judgment vs order, native vs
   scanned, duplicate, thin, per court/year/language/provenance. **Document
   counts are not authority counts.**
3. **004 — `ts_rank` vs real BM25 (P2).** Measure before replacing anything.
   Railway offers only `pg_trgm` and `vector`; no BM25 extension is installable.
4. **005 — citation graph as a ranking signal (P6/§H).** 97,876 edges. **Not
   citation count alone** — §H.
5. **006 — proposition/evidence verification skeleton (P7/§I).**

---

## COMPLETED (this session, 11 Aug)

- Citation extractor blind spot closed: SCC accepted only round parentheses while
  SCR accepted either, and neither accepted the year-first form. **+37,875 edges,
  +20,276 resolved, 77,600 → 97,876.**
- Sentinel rows correctly reclassified; resolution denominator corrected
  **40.4% → 43.5%** (now 45.3%).
- High Court loader built (`hc-load.ts`, 22 tests) and **40,980 documents
  ingested**, then **PAUSED** — see BLOCKED.
- `agent-browser` installed and verified against live eCourts over CDP.
- Two unwired repo guards wired into `ci-local.mjs` and CI.
- **Task 003 (started).** `judgments` gains `content_hash`, `text_quality`,
  `source_document_type` (migration `0031`), computed inside the shared
  `upsertJudgments` write path. Found and fixed a stale drizzle migration
  journal that had been silently no-op'ing `pnpm db:migrate` past `0029`.
  Backfill CLI for the 79,321 existing rows not yet built —
  `docs/ai/tasks/003-corpus-inventory.md`.
- **inferx.net wired as the preferred provider for DeepSeek V4 Flash** — a
  free token grant given to the founder 11 Aug 2026, OpenAI-compatible,
  response shape verified by a live call before any code trusted it.
  `services/api/src/llm/call.ts` and `services/harness/src/generate.ts` both
  prefer it over OpenRouter when `INFERX_API_KEY` is set, for exactly
  `deepseek/deepseek-v4-flash` and no other model; OpenRouter stays the
  fallback. Verified end-to-end through `callModel` against the real API, not
  just mocked — real "pong" response, `costUsd: 0`, tokens recorded. **One
  live 429 observed on rapid back-to-back calls** — transient, a retry
  succeeded immediately, but worth knowing the free tier rate-limits under
  burst traffic. 6 new tests across both call sites, all suites green (api
  llm 24/0, harness 110/0) with the real key loaded, not just mocked.

---

## BLOCKED

| | |
| --- | --- |
| **Production deploy — RESOLVED 11 Aug** | Was not a Railway platform fault: `.gitignore` + `.railwayignore` both silently excluded `services/api/src/training/*.ts` (real source `app.ts` imports), so every deploy crashed at container boot. Fixed in-repo (`1989518`, `c26a9b2`), redeployed via `railway up` (already-linked CLI, no founder action needed), **succeeded**. Verified against `/search` directly — see §BENCHMARK RESULTS step 6. |
| **HC ingest — PAUSED BY LCC, 11 Aug** | Not a founder block. Paused because it was adding ~17 uncitable documents/second to a database a **public, unauthenticated** production endpoint serves. Resumable at zero cost on `source_url`. **Task 002's severity decision is now made (warn, not block — §DECISIONS); resuming the ingest itself is a separate action, not yet taken — flagged for the founder rather than assumed.** |
| **The uncitable-judgment state — RESOLVED 11 Aug** | Severity: warn (unmissable mark), not block — founder chose this directly over the alternative (disable add-to-matter, like `set_aside`). `CITATION_HARNESS.md` spec addition landed; server side complete and tested. Remaining: client implementation, RCC's — `docs/ai/tasks/002-uncitable-judgment-state.md`. |
| Pseudonymiser / drafting | `FOUNDER_QUEUE.md` FQ-D1 |
| OD-12 saved-search feed | founder's |

---

## DECISIONS

| decision | verdict | evidence |
| --- | --- | --- |
| Embed the whole High Court corpus | **REJECT** | ~41M vectors ≈ 490 GB wanting RAM against an 11 GB database; pgvector documented to degrade past 5–10M. Our own HNSW is 4.7 GB for 616k vectors |
| Ingest High Court text without embeddings | **RETAIN** (founder-approved 11 Aug) | observed 4,286 bytes/doc → 70–141 GB, $11–35/month |
| Vespa / Qdrant / Milvus | **EXPERIMENT FURTHER** | Qdrant excluded by `CLAUDE.md`; Milvus vector-first and we build no vectors; **Vespa is the only one that can express citation-count-weighted ranking** — but §S requires it beat the baseline on the Indian benchmark first, and no such benchmark run exists |
| Restart the HC citation pass | **REJECT** | it re-downloads the same PDFs the loader keeps; citations come from stored text for free |
| Task 002 severity: warn vs block add-to-matter | **WARN** (founder-decided 11 Aug, asked directly rather than inferred) | Analogous to `unverified`, not `set_aside`: an unmissable mark, add-to-matter and `PrecedentPanel` stay enabled. The alternative (block, matching `set_aside`) was the recommendation offered; the founder chose warn |

---

## BENCHMARK RESULTS

**First number this project has measured against the running service — 11 Aug
2026, task 001.** `services/harness/src/deployed-safety.ts` +
`deployed-safety-cli.ts` (`pnpm citation-safety-probe`), calling `/search` over
plain HTTP with no database connection at all.

### Step 1 — read `structured.ts` and `route.ts`, intended behaviour stated before any run

`answerStructured` (`search/structured.ts`) returns exactly one of four kinds
for a `cite:` query — `matched`, `no_match`, `invalid`, or `not_structured`.
`looksStructured` always treats a `cite:"…"` query as structured (field-name
regex), so `not_structured` cannot occur for these two probe queries. `matched`
and `no_match` both carry `parsed`; `hybridSearch` — the semantic path — is
called in `route.ts` **only** when `structured.kind === 'not_structured'`. By
construction, a `cite:` query can therefore never reach the semantic path
through this code: exact hit → `matched`, only the resolved case, `parsed`
present; zero structured match → `no_match`, zero results, `parsed` present.
There is no third (`ambiguous`) outcome in the current type — not exercised by
either probe query and out of scope for task 001.

### Step 2 — reproduced locally, both queries, current `HEAD`

Local server (`services/api`, `origin/main` checked out, no code changes),
against the same corpus database production uses:

| query | local result |
| --- | --- |
| `cite:"(1994) 3 SCC 1"` | **S.R. BOMMAI versus UNION OF INDIA AND ORS.** — exactly the one case, `parsed: "Judgments reported as “(1994) 3 SCC 1”."`, `total: 1` |
| `cite:"(9999) 99 SCC 999"` | zero results, `parsed: "Judgments reported as “(9999) 99 SCC 999”."`, `total: 0` |

**Conclusion: the defect is purely deployment.** Local code on `origin/main`
already satisfies Contract §4 P0 for both reproduction queries. Re-probed
production in the same minute, same two queries, `sha 721c99ac`: both still
return `ok:true` with **no `parsed` field**, and the second (a citation that
cannot exist) still returns five real Supreme Court authorities. The gap
between local and production is exactly the undeployed commits on
`origin/main`, not a code defect.

### Steps 3–4 — the probe, and criterion 4 satisfied directly

`pnpm citation-safety-probe` (`PROBE_BASE_URL` env var overrides the default,
which is production):

| target | result | exit code |
| --- | --- | --- |
| `https://api-production-1c0b4.up.railway.app` (`sha 721c99ac`, 8 Aug) | **FAILED** — both cases: `no parsed field on a cite: query — this is the forbidden signature` | 1 |
| `http://localhost:3999` (local, `origin/main`, current) | **PASSED** — both cases | 0 |

The probe therefore detects the exact live regression and clears the exact
fix, satisfying acceptance criterion 4 (*"the one that matters"*) directly
rather than by inspection. `services/harness/src/deployed-safety.test.ts`
carries the same two shapes as fixed unit tests (no network) so the grading
logic itself is covered by `pnpm test`.

### Step 5 — wired

`scripts/ci-local.mjs` — new step `citation safety probe (deployed)`,
unconditional (no database dependency), added knowing it goes red until the
Railway deploy lands. `.github/workflows/ci.yml` — new step in the `server`
job, `pnpm citation-safety-probe`, same reasoning. Root `package.json` —
`citation-safety-probe` script alias.

**Both gates are currently RED, correctly** — the deployed service still
carries `sha 721c99ac`. This is not a defect in the gate; it is the gate
doing its job. It turns green the moment the Railway deploy carries a commit
at or after the structured-search fix.

### Step 6 — the Railway build failure, diagnosed and fixed

`railway logs --latest --deployment` (Railway CLI, already linked and
authenticated — no founder action needed for the diagnosis itself) showed the
build always succeeded; the container crashed at boot on every attempt:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/app/services/api/src/training/consent.ts' imported from
/app/services/api/src/app.ts
```

**Root cause: two independently broken ignore files, not a Railway platform
fault.** `.gitignore`'s bare `training/` pattern and `.railwayignore`'s bare
`training` pattern each match a directory of that name at **any depth** —
including `services/api/src/training/`, real application source
(`consent.ts`, `extract.ts`, added 9 Aug for the training-consent feature),
not the intended repo-root JSONL pairs directory `docs/TRAINING_STRATEGY.md`
§4 describes (which does not yet exist). `app.ts` has imported
`./training/consent.ts` since commit `1ba172f`; the file was never committed,
so every deploy since has crash-looped on `/health` regardless of deploy
mechanism (auto-deploy or `railway up`).

Fixed by anchoring both patterns to the repo root (`/training/` /
`/training`) — `1989518` (gitignore) and `c26a9b2` (railwayignore), pushed to
`origin/main`. Redeployed via `railway up` (project already linked, CLI
already authenticated): first attempt (`bd333b0f`) still failed identically,
because `railway up` reads `.railwayignore`, not `.gitignore` — this is why
the first fix alone did not resolve it. Second attempt (`81a4c6be`)
**SUCCEEDED**. Confirmed by observation, not by `/health`'s `sha` field —
that field is a static `RAILWAY_GIT_COMMIT_SHA` env var that CLI-triggered
deploys never populate, so it kept reporting the pre-fix sha even once the
new code was serving; `build-info.ts` falls back to `git rev-parse HEAD` only
when that var is absent, and `.git` is itself in `.railwayignore`. **Do not
trust `/health`'s `sha` after a `railway up` deploy** — confirmed against the
actual `/search` behavior instead:

```
curl -s -X POST "$API/search" -d '{"query":"cite:\"(1994) 3 SCC 1\"","language":"en"}'
→ S.R. BOMMAI, exactly, parsed present, total:1
curl -s -X POST "$API/search" -d '{"query":"cite:\"(9999) 99 SCC 999\"","language":"en"}'
→ zero results, parsed present, total:0
```

`pnpm citation-safety-probe` against production: **PASSED**, exit 0, both
cases. **All six acceptance criteria of task 001 are now met, verified by
observation.** The P0 is closed.

### What this does not cover

The probe tests exactly the two reproduction queries from task 001 — a
citation that cannot exist, and one known-good citation (S.R. Bommai). It does
not test ambiguity (no `ambiguous` outcome exists in `StructuredOutcome` today,
and none of the two reproduction queries exercise one), and it is not a general
adversarial citation sweep. Extending the fixed case set is future work, not
this task — `Do not broaden the task` (founder, 11 Aug).

---

## KNOWN FAILURES

1. **P0 · citation-shaped query falls through to semantic search — CLOSED 11
   Aug 2026.** Re-verified against production after the deploy fix:
   `cite:"(1994) 3 SCC 1"` → S.R. Bommai, exactly; `cite:"(9999) 99 SCC 999"`
   → zero results; both carry `parsed`. `pnpm citation-safety-probe` PASSES
   against production. Kept below as the historical record — it was
   observed, unauthenticated, HTTP 200:
   - `cite:"(1994) 3 SCC 1"` (S.R. Bommai) → **KAUSHAL KISHOR**, wrong case
   - `cite:"(9999) 99 SCC 999"`, **a citation that cannot exist** → **five real
     Supreme Court authorities**, no `parsed` field, nothing saying the query was
     not understood
   This is the exact forbidden chain: *exact citation failure → semantic search →
   plausible case.*
   **Root cause confirmed 11 Aug, task 001 step 2: purely deployment.** Both
   queries reproduced against local `origin/main` return the contract-correct
   answer — see §BENCHMARK RESULTS. The deployed `sha 721c99ac` (8 Aug) simply
   predates the fix. `services/api/src/search/structured.ts` and `route.ts` are
   unmodified by this task, per its own scope.
2. **Uncitable judgments render as "safe to file" — LIVE in data.** 40,980 High
   Court rows, **100% with no citation of any kind**. RCC's audit (bus 0019,
   independently reproduced by probe, not by reading JSX): `citationRender`
   never consults `neutralCitation`, so the row renders **totally unmarked** —
   and in this product unmarked *means* verified-and-fine. Add-to-matter is
   gated only on `set_aside`, so it is allowed. `PrecedentPanel` offers it as a
   draft suggestion. **The clipboard emits the literal string `null`.**
3. **My own citability claim was wrong.** I told the founder that from 2023 High
   Courts print a neutral citation in the text, so those years are citable.
   **Of 39,296 documents held from 2023+, exactly 5 contain a colon-form
   citation anywhere.** The extractor is fine — Patna, which the ingest happened
   to start with, does not print them. The claim was true of Delhi/Kerala/Madras/
   Karnataka and I stated it of "the courts".
4. **`ts_rank` is not BM25** — no IDF, so a rare term does not outrank a common
   one. No BM25 extension is installable on Railway.
5. **131 High Court rows have under 500 characters of text.**
6. `check-alert-coverage.mjs` RED — PD-5/PD-6 promise four alert kinds,
   `alert_kind` holds two.

---

## FUTURE RESEARCH

Recorded, not started, per §12 — hypothesis / benefit / cost / risk / experiment
required before any of these becomes a task.

- Vespa as the search layer, with citation-weighted ranking expressions (§S gate)
- Learned sparse (SPLADE) and late interaction (ColBERT) — P4, needs a baseline
- Selective embedding of frequently-cited judgments only — 15,218 of 38,341
  Supreme Court judgments are cited by anything at all
- Structure-aware retrieval: facts / issues / reasoning / holding / obiter (§F)
- Licensed teacher distillation (§K/P) — Bharat.Law pool is configured and
  authorised for **benchmarking only**, `extractionPermitted: false`
- Failure database (§M) and the adversarial set (§N)
