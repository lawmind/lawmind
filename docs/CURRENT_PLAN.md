# CURRENT PLAN — the single ordered queue

**Read this file at session start, after the mandatory set in `CLAUDE.md` §0.**
It exists because a plan held only in a todo tool does not survive compaction, a
new session, or a fresh agent. **This file does.**

Last updated **9 August 2026**, annotated through **11 August 2026**. **Read
§A first — it supersedes §2's ordering.** Owner: **LCC (server lane)**. RCC's
plan is `docs/RCC_MASTER_PLAN.md` and is not duplicated here.

**11 Aug 2026 — the two P0s that outranked this whole queue are closed.**
Task 001 (citation-shaped queries falling through to semantic search) and
task 002 (the uncitable-judgment state) are both resolved — server side
complete for both, client-side implementation for 002 briefed to RCC. Current,
live state lives in `docs/ai/RETRIEVAL_PROGRAM.md`, not here; this file's Q1.0
and Q1.4 entries below are kept as the historical record with corrections
layered on top, per this file's own convention, rather than rewritten.

> **The ordering rule, and it is not negotiable.** `docs/GTM_INDIA.md` §9: Gate S2
> passes **before** the ground campaign. A field campaign against 2 million
> advocates is a one-shot instrument — an advocate who finds a citation they
> cannot rely on and says so in the bar room has cost us that bar room
> permanently. **The ground game amplifies whatever is actually there.**

---

# Q · THE VERIFIED QUEUE — every open item, checked against the running system

**Rebuilt 10 August 2026. Read this before §0 and before §A.** It exists because
the previous drift began with a plan written from memory: a target nobody had
checked was achievable, and claims that had quietly stopped being true.

**Every line below was verified the day it was written** — table counts by query
against production, module existence by `ls`, behaviour by running the tests.
Nothing here is recalled. Where a claim could not be verified it says so.

## Q0 · SEVEN CLAIMS IN THIS REPO THAT WERE FALSE OR STALE

Found by checking, not by reading. **This is the reason to distrust an unticked
box and go look.**

| claim, as written | what is actually true |
| --- | --- |
| §0: *"Gate S2 FAILING, success@5 17.3% against a 0.70 floor"* | **The floor was removed on 9 Aug.** `successAt5` is an ungraded diagnostic; the gates are `structuredExactness` and `fieldPrecision` at 1.0. **The most dangerous sentence in this file, now corrected** |
| §2: *"GATE S2 — everything else is downstream of this"* | Downstream of an **ungraded diagnostic**. The recall levers, HyDE measurement and reranker-settling under it are chasing a number that gates nothing |
| A2.4–A2.8 unticked | **All landed.** `qlang/compile.ts`, `qlang/explain.ts`, `structured.ts` exist; `route.ts` echoes `parsed` at lines 97 and 126; `structuredExactness`/`fieldPrecision` are in `metrics.ts` |
| A3c.1–5 and A3d.1–6 unticked | **All landed.** Verified in production: **4,097** rows in `judgment_citation_aliases` (SCC 3,877 · AIR 220), **81** flagged judgments, **13,389** treatment-carrying edges |
| `CONTINUATION_PROMPT.md` §6.6: *"Facets — contract slot documented, not built"* | **There is no contract slot.** Zero occurrences of "facet" in `docs/API_CONTRACTS.md` and zero in `services/**`. Not documented AND not built |
| §2: *"Three metrics stay NOT MEASURED until an LLM key exists — founder-queued"* | **`OPENROUTER_API_KEY` is set** (73 chars) and `ANTHROPIC_API_KEY` is set. `FOUNDER_QUEUE.md` §1 and §5 (the $65 GPU) are both stale — §5 was struck on 9 Aug when re-embedding was measured at 36.6 ms/chunk on local CPU |
| A3b.1 unticked | **Landed.** `refusingStore` and `objectStoreFromEnv` exist in `packages/storage/src/r2.ts`, and production with no credentials refuses to start |
| **This table's own wording: *"landed and applied to production"*** | **CORRECTED 11 Aug — it conflated three different things.** The **database** is production and was queried directly, so the row counts above are real. The **code** is not: `origin/main` is **43 commits behind** and the deployed API serves none of it. **Repo + DB ≠ deployed.** §Q1.0 |

## Q1 · THE QUEUE, in the order I would take it

Each item carries the two artefacts `CLAUDE.md` demands, so nobody has to invent
them later. **An item with no nameable VERIFY does not go in this list.**

### Q1.0 · THE DEPLOY GAP — 43 commits unpushed · RESOLVED 11 Aug 2026, task 001

**CLOSED. Kept below as the historical record — the reasoning is what keeps
the next incident consistent, and this one taught a real lesson.** The push
this section held back on was made this session (`origin/main` had reached
`0 0` with local before task 001 even began — that gap closed itself over the
course of the day). What actually kept P0 live past that point was a second,
separate defect: `.gitignore` and `.railwayignore` both silently excluded
`services/api/src/training/*.ts`, real source `app.ts` imports, from every
commit and every deploy upload since 9 Aug — so the deploy failed identically
whether pushed or not. Diagnosed from `railway logs`, fixed in two commits,
redeployed, verified against `/search` directly. Full account:
`docs/ai/tasks/001-p0-citation-query-safety.md` §RESULT,
`docs/ai/RETRIEVAL_PROGRAM.md` §BENCHMARK RESULTS step 6.

**Found by RCC on 11 Aug and independently verified by LCC the same day. RCC was
right on every point.**

`DONE:` `origin/main` carries this work and the deployed API serves it.
`VERIFY:` `git rev-list --left-right --count origin/main...main` reads `0 0`;
`POST /search {"query":"cite:\"(1994) 3 SCC 1\"","language":"en"}` returns
**S.R. BOMMAI** with a `parsed` field.

**Verified state, measured against the live API, not inferred:**

| check | result |
| --- | --- |
| `git rev-list --left-right --count origin/main...main` | **`0 43`** — origin is at `7bbde78`, 9 Aug 12:24 |
| `POST /search` `cite:"(1994) 3 SCC 1"` in production | returns **KAUSHAL KISHOR**, not S.R. Bommai |
| same response | **no `parsed`, no `total`** — structured search is not deployed |
| `GET /me/training-consent` | **404** |
| `GET /me/alert-settings` | **401** — route exists, auth rejects |

**The 404-vs-401 split is the proof**, not the 404 alone: both were called
unauthenticated, so a 401 means the route is deployed and a 404 means it is not.

**THE PART THAT IS A PRODUCT-SAFETY ISSUE, not merely a stale deploy.** In
production today an advocate typing `cite:"(1994) 3 SCC 1"` gets **a different
case returned as an ordinary result**, with nothing saying the query was not
understood. **This is precisely the failure A2.7 was written to prevent** —
*"structure decides, semantics fills, NEVER blended; zero structured matches
returns zero"* — and A2.7 is written, tested and **not deployed**. Nothing is
fabricated: every row is a real judgment with real citations from the corpus.
But *"these are the cheque cases"* is what a wrong-but-plausible result reads
as, and that is the whole reason the rule exists.

**Deploy safety was checked before recommending anything, and it is the safe
direction:** all three unpushed migrations (`0026`, `0027`, `0028`) are **already
applied to production**, along with the `ecourts_bulk` enum value and the
training-consent columns. **The database is AHEAD of the code, never behind**, so
a deploy finds the schema it expects. `@lawmind/storage` is a dependency of
nothing, so its refuse-to-start-without-credentials guard **cannot** break the
API boot.

**Why LCC has not pushed.** A push is outward-facing and shared, and it deploys
to the product an advocate uses. That is the founder's call, not an agent's.
**Everything needed to make it is above.** The deploy *mechanism* is
unverified — no Railway service is linked in this workspace and no doc records
whether a push auto-deploys.

**LCC's own correction, owed plainly.** This lane has been writing *"landed and
applied to production"*. For **migration `0028` that is exact** — the schema was
queried directly. For the **code** it was not: A2, A3c and A3d were verified
against the **repository and the database**, and the database is production, but
**the API serving requests is 43 commits old**. Repo + DB ≠ deployed, and §Q0's
own table repeats the conflation it was written to catch.

### Q1.0b · RE-RUN THE CITATION RESOLVER — ✅ APPLIED 11 Aug 2026 · 23.3% → 40.4%

**Found 11 Aug 2026 while answering the founder's question about the AWS corpus.
`docs/CITATION_STRATEGY.md` §0.** It is the largest available win in the product's
core promise and it needs **no new data, no purchase, no GPU and no ingest.**

`DONE:` `judgment_citations` resolution rises from 23.3% toward 49.1%, applying
the exactly-one-candidate rule.
`VERIFY:` `SELECT count(*) FROM judgment_citations WHERE cited_judgment_id IS NOT
NULL` moves from **44,785** toward **94,390**; the **11 ambiguous** keys resolve
to nothing.

**APPLIED. 32,815 edges resolved. 44,785 → 77,600, i.e. 23.3% → 40.4%.**

**A CORRECTION TO THIS LANE'S OWN FIRST NUMBER, recorded because the method
matters more than the result.** The first measurement said **49,605 resolvable
and 49.1%**. It was wrong, and **the database caught it**: the first `--apply`
died on `judgment_citations_no_self_citation`.

**16,790 of those 49,605 were SELF-CITATIONS** — an Indian judgment prints its
own citation in its header and headnote, the extractor sees it, and the key
matches the judgment's own row. The constraint refused every one. **No number
from that first pass should be quoted.**

| | |
| --- | --- |
| unresolved edges before | 147,412 |
| key matches something we already hold | 49,616 |
| **REFUSED: self-citation** | **16,790** |
| REFUSED: two or more targets | 11 |
| **RESOLVED** | **32,815** |
| resolution before → after | **23.3% → 40.4%** |

**Three guards, each of which refuses rather than guesses:** exactly one target
(`A3d.4`), the **year guard** (`A3d.2`), and **never overwrite** an existing
resolution. A fourth — self-citation — was added *because the database found it*,
which is the constraint doing the job constraints exist for.

**A second defect found and fixed in the same file:** the year pattern used
`\d`, which **does not survive a JS tagged template through the driver into
Postgres** — it matched nothing at all, silently, as an empty match set rather
than an error. `[1950] 1 S.C.R. 806` yielded no year. Replaced with `[0-9]`,
which contains no backslash and cannot be re-escaped, and verified directly:
38,431 corpus years extracted. **A guard built on a silently-empty regex looks
exactly like a guard that never needed to fire.**

**Two ordinary causes, not one exotic one.** The edges were resolved **before the
concordance existed** — all 4,097 aliases landed 9–10 Aug, and **16,848 edges
contain `AIR` and every one is unresolved**. And PDF-artefact normalisation:
`"(2014)14 SCC\n664"`, `"(1991) 1SCC598"`, `"[2023] 12 S.C.R.806"` collapse to a
key that matches; a stricter comparison does not.

**Worked example rather than an aggregate:** `[2010] 7 S.C.R. 79` is unresolved,
and *ADALAT PANDIT & ANR. versus STATE OF BIHAR* is in the corpus carrying it.

**The 11 are the safety story.** `A3d.4` already governs: **exactly one
candidate, or nothing** — a wrong alias is worse than a missing one. Resolving
49,605 and refusing 11 is the correct outcome, not 49,616.

**Also found: 13,834 unresolved edges carry an EMPTY `citation_text`** — 9.4% of
all unresolved, which can never resolve by construction. A separate extraction
defect, queued behind this.

> **CORRECTED 11 Aug 2026 — that sentence was wrong twice, and chasing it found
> something much larger. See Q1.0c.**
>
> They are **not a defect**. They are **sentinels**: `citations-cli.ts` writes one
> row with an empty `citation_text` to mark a judgment that cites nothing, so the
> resumable pass does not re-scan it on every run. The code says so at the line
> that writes them. Verified against production rather than read: **13,834 rows
> over 13,834 distinct judgments**, every one with `normalised_citation = ''`,
> `char_offset = 0`, unresolved — and **zero judgments carrying a sentinel beside
> a real edge**.
>
> **And they were never in "all unresolved" to begin with.** Counting them there
> understated citation resolution: **40.4% of all rows, 43.5% of real citation
> edges (77,600 / 178,363).** Both are arithmetically true; only the second
> answers *"of the citations we extracted, how many point at a judgment we
> hold"*. `resolve-cli` now prints the denominator every time it prints the
> percentage, so the figure cannot be lifted without the thing it is a
> percentage of.

### Q1.0c · THE EXTRACTOR WAS BLIND TO TWO CITATION FORMATS — 11 Aug 2026

**Found by pulling on the 13,834 sentinels above.** The question that opened it
was not *"is this a defect"* but *"is it plausible that 36.1% of Supreme Court
judgments cite nothing at all"*. It was not.

`DONE:` the extractor finds the citation forms the corpus actually contains.
`VERIFY:` `citations.test.ts` covers each form with a string taken verbatim from
a corpus judgment; `--rescan` reports the new edges before writing any.

**The defect was one asymmetry, in `services/ingest/src/citations.ts`.** The SCR
pattern accepted either bracket — `[[(](\d{4})[\])]` — and the SCC pattern
accepted **only round parentheses**. So `[2000] 5 SCC 573` matched nothing.
Neither pattern accepted the reports' own house style, **year first**:
`1976 (1) SCR 906`, `1996 (4) SCC 362`.

**The decade table is what made it undeniable**, and it also refuted the first
theory. These are not simply old OCR'd pages:

| decade | judgments citing NOTHING | share |
| --- | --- | --- |
| 1950 | 645 | 64.2% |
| 1960 | 1,886 | 59.5% |
| 1970 | 1,557 | 53.2% |
| 1980 | 1,300 | 48.1% |
| **1990** | **4,368** | **67.3%** |
| 2000 | 3,886 | 42.8% |
| 2010 | 192 | **2.4%** |
| 2020 | 0 | **0.0%** |

**The 1990s are worse than the 1950s and 2020 is perfect.** Age does not produce
that shape; a text source that changed does. Modern judgments print
`(2019) 4 SCC 221` and were never affected.

**Two false trails, both killed by reading the data instead of the aggregate.**

1. **92.7% of the zero-citation judgments contain a reporter abbreviation** —
   which looked like a 92.7% recall hole and was nothing of the kind. 12,725 of
   them contain `S.C.R.` because the **printed page header** reads
   `S.C.R. SUPREME COURT REPORTS 807`. A running header is not a citation. There
   is now a test asserting the extractor does not read one as such.
2. **Widening to the pre-independence reporters would not have paid.** The
   samples are full of `I.L.R. 25 Mad. 658`, `50 I.A. 227`, `5 A.C. 214` — Privy
   Council, colonial High Court and House of Lords. **We hold none of them and
   never will**, so those edges would resolve to nothing while inflating the
   denominator. Measured before building, per §1.

**The opportunity was measured before the fix was written**, on judgments that
already carried edges: **+23.9% more citations found (1,301 on 800 judgments),
48.5% of them resolving** to a judgment we hold. On the zero-citation population
the recovery is smaller and the resolve rate lower — 689 citations from 1,200
judgments, 16.4% resolving — because a judgment that cites nothing our corpus
holds stays unresolved no matter how well it is read.

**APPLIED 11 Aug 2026. The write matched the dry run exactly — 37,875 new edges,
2,594 sentinels cleared, to the row.** That equality is the point of §1's rule:
the dry run went through the same write path with the same guards, so there was
nothing left for the constraints to catch.

| | before | after |
| --- | --- | --- |
| rows in `judgment_citations` | 192,197 | **227,478** |
| sentinels | 13,834 | **11,240** |
| real citation edges | 178,363 | **216,238** |
| **resolved** | **77,600** | **97,876** |
| resolution, over citation edges | 43.5% | **45.3%** |

**+20,276 resolved edges, a 26.1% increase.** 13,880 resolved at extraction
against the in-memory index; the resolver then took another 6,396 using the alias
concordance, refusing 16,790 self-citations and 11 ambiguous keys — the same
guards, refusing the same way.

**The percentage is the least interesting number here and would have been the
easiest to oversell.** It moved 43.5% → 45.3% while the resolved count rose 26%,
because widening the extractor grows the denominator too. A pass that found only
resolvable citations would have looked better and been worse.

**Where the recovery landed, which is where the defect predicted:**

| decade | citing nothing, before | after |
| --- | --- | --- |
| 1990 | 67.3% | **54.4%** |
| 2000 | 42.8% | **25.3%** |
| 1980 | 48.1% | 44.6% |
| 1950 | 64.2% | 64.1% |

**The 1950s barely moved, and that is correct.** Their citations are `I.L.R. 25
Mad. 658`, `50 I.A. 227`, `5 A.C. 214` — Privy Council and colonial High Court,
which we do not hold. Widening to reach them would have manufactured
unresolvable edges.

**Precision was read, not counted.** Twelve resolved edges sampled at random from
the 37,875 inserted, each printed with 180 characters of surrounding text: **12
of 12 correct** — the citation appears verbatim in a Case Law Cited block and the
target judgment's case title matches the name printed beside it, including the
OCR-mangled `[1972) 4 SCC 600`. Twelve is a spot check and a lower bound, not a
precision rate.

**A pinned test caught the change, and it had been waiting for it.**
`services/harness/src/build-queries.test.ts` carried a test literally named
*"SQUARE-BRACKET CITATIONS ARE INVISIBLE TO THE EXTRACTOR — a known gap"*,
pinned on 9 Aug as a failing expectation with the instruction *"the gap closed —
update this test and the note it carries."* **Somebody found this blind spot two
days earlier, recorded it precisely, and it stayed open.** The test is now an
assertion of correct behaviour.

**And half that note was wrong.** It recorded that `[2019] 4 SCC 221` *and*
`(2019) 4 S.C.C. 221` both extracted to nothing. Re-run against the pre-11-Aug
pattern set: the square bracket found **0**, the dotted form found **1**. The
dotted form always worked. **A note that overstates a defect sends the next
reader looking in the wrong place**, which is the same class of harm as
understating one.

**`ANALYZE judgment_citations` run after the write**, per the standing rule in
`SCHEMA_TRUTH.md` §Access paths — 35,281 net new rows change the planner's
selectivity estimates for every citation path.

**One assumption was checked rather than assumed**, because it was load-bearing:
the year-first rewrite added to `normaliseCitation` could have changed stored
`normalised_citation` values, and `ON CONFLICT DO NOTHING` would then have
double-inserted every citation in the corpus. `SELECT count(*) … WHERE
normalised_citation ~ '^[0-9]{4} \([0-9]{1,3}\) '` returns **0 of 192,197**.

**`--rescan` exists because `--reset` was the wrong tool.** Re-running the
ordinary pass reaches nothing (every judgment already has rows, so the resume
query skips it) and `--reset` would delete all 192,197 edges along with the
77,600 resolutions three passes of the resolver produced. `--rescan` re-reads
every judgment and inserts only what is new, and it is **dry by default**.

### Q1.1 · Publish coverage per court and per year — A3.6 · ✅ LANDED 11 Aug 2026

**Migration `0029` applied to production and verified. `GET /corpus/coverage`
built, 7 tests green against the real database.** `dcda5b9`.

**889 court-year rows across 25 courts, 20,529,202 documents**, loaded from the
survey and matching its totals exactly. **Re-running writes 889 again, not
1,778** — idempotency observed, not assumed. The gap is now queryable: **0 of
3,493,695 at Allahabad**, 0 of 1,528,665 at Bombay, 0 of 1,510,131 at Madras.

**A new table, not `corpus_coverage`.** That one is keyed `source PRIMARY KEY`
and answers *"has this source been fully enumerated"*; it cannot express
*"Allahabad, 2024"* without encoding two dimensions into one text key, which
would make counting by court and by year both unanswerable. A different **grain**,
not a replacement.

**The word this feature refuses to say is "judgments".** The column is
`source_documents`; the response carries `judgmentShareUnknown: true` and the
measured range `[0.0075, 0.1864]`. **A test asserts no field is ever named
`sourceJudgments`** — the negative control, because an endpoint checked only for
HTTP 200 would pass over a response claiming we hold every judgment in India.

`held` is **derived live**, never stored — a cached coverage count drifts the
moment an ingest writes a row, and a figure stale in the *reassuring* direction
is worse than none. `supremeCourt.sourceDocuments` is **null, not 0**: unknown is
a state, and 0 would say the source is empty.

**RCC needs the surface** — contract in `API_CONTRACTS.md` §Corpus coverage,
briefed in `RCC_CONTINUATION_PROMPT.md` §R3.

### Q1.1-OLD · the original entry, kept for provenance

`DONE:` `corpus_coverage` holds a row per court per year for the AWS High Court
buckets, and the judgments surface returns a `coverage` object beside results.
`VERIFY:` `SELECT source, source_total FROM corpus_coverage` returns 25 courts;
a search response carries `coverage`; contract updated in `API_CONTRACTS.md`.

**Verified state:** `corpus_coverage` exists (migration `0012`, used by
`statutes/route.ts`) and holds **exactly one row** — `indiacode_central_acts`,
845 acts. Its columns are `source · source_total · enumerated_at · complete ·
failed_ids · updated_at`, so it is keyed **per source, not per court per year**;
this item either adds rows per court or needs a shape change, and that is the
first decision inside it.

**Why first.** `SELECT court, count(*) FROM judgments` returns **one row —
Supreme Court of India, 38,341.** We hold **0 of 15,771,566** High Court
judgments and the product says nothing. `CLAUDE.md`: *silence about a gap does
the same damage as a fabricated citation.* The per-court numbers now exist
(`docs/HC_METADATA_SURVEY.json`), it costs nothing, and it needs no decision
from the founder. `/statutes` already returns
`coverage: { held, sourceTotal, complete, failedCount, enumeratedAt }` — an
established additive shape to copy rather than invent.

### Q1.2 · Fix two red tests that are red for different reasons

`DONE:` both green, or documented as a data finding.
`VERIFY:` `npx tsx --test src/*.test.ts` in each package.

- **✅ FIXED 11 Aug — `services/harness/src/generate.test.ts`.** It passed
  `apiKey: undefined` expecting the env to be empty, but that means *"fall back
  to the environment"* — the correct production behaviour — so with a real key
  configured it sailed past the refusal into the stubbed fetch and died on
  `SyntaxError: Unexpected end of JSON input`. **It passed only on a machine with
  no key.**

  **INTENT: the code was right and the test's way of simulating "no key" was
  wrong**, so the test now removes the variable and restores it. **Verified
  passing BOTH with a real key in the environment and under `env -u`** — one run
  each, because a fix asserted in only one environment is the same defect wearing
  a different hat. `services/harness` is now **101/101**.
- **`services/api/src/statutes/route.test.ts` — a DATA condition, not a code
  defect.** 22 of 845 acts have zero sections. See §4; **do not loosen the
  assertion to go green.**

### Q1.3 · Finish the R2 tiering path — A3b.3, A3b.4, A3.4, A3.5

`DONE:` a judgment's text round-trips to R2 as brotli through the metered store,
`storage_key` is written, and a vector blob supports a ranged read.
`VERIFY:` round-trip test against real R2; `SELECT count(*) FROM judgments WHERE
storage_key IS NOT NULL` is non-zero; a ranged GET returns 206.

**Verified state:** `getRange` exists and treats a 200 as an error. **Brotli
exists only inside `packages/storage/src/roundtrip.ts`, a live smoke-test
script** — there is no reusable codec module. **No `bit(` column exists anywhere**,
so A3.4's Tier-2 `bit(1024)` vector is not started. R2 credentials **are set**
(endpoint, bucket, access key), so this is testable today.

**Deliberately after Q1.1.** This is infrastructure for an ingest nobody has
decided to run, and storage was never the blocker — measured twice at under
$8/month.

### Q1.4 · Ingest High Courts — A3.2 · SUPERSEDED BY EVENTS, see below

**This section is historical.** The ingest this item planned already ran:
40,980 High Court rows landed in `judgments` (S1, 11 Aug), then were paused by
LCC — not by this decision, but because the corpus had no citation state for
what it was ingesting. That gap is task 002, now resolved (severity: warn,
`CITATION_HARNESS.md` §The fourth concern). **Resuming the ingest itself is
still separately blocked** — the autonomous-execution charter's §10 sets a
higher bar (provenance, content hash, dedup status, extraction confidence per
document) the current loader does not track. Current state:
`docs/ai/RETRIEVAL_PROGRAM.md` §BLOCKED.

<details><summary>Original planning entry, kept for provenance</summary>

### Q1.4 (original) · Ingest High Courts — A3.2 · BLOCKED ON A FOUNDER DECISION, see Q2

`DONE:` reasoned High Court judgments from the last 10 years in `judgments`,
resumable and content-hashed.
`VERIFY:` `SELECT court, count(*) FROM judgments GROUP BY court` returns more
than one row; `corpus_coverage` moves.

**Everything measurable about it is now measured** (`HC_CORPUS_SURVEY.md`,
`HC_EXTRACTION_COST.md`): 15,771,566 documents, extraction 4.2 days on eight
workers, OCR burden 0.2%, judgment share 0.75%–18.64%, PDF availability broken by
whole bench-years. **What remains is not measurable — it is the two questions in
Q2.**

</details>

### Q1.5 · Facets on `POST /search` — A2.6 remainder

`DONE:` a search response carries facet counts; the contract documents the shape.
`VERIFY:` a `judge:` query returns counts by court and year that match a direct
`GROUP BY`.

**Verified state: NOT documented and NOT built** — zero "facet" hits in
`API_CONTRACTS.md` and in `services/**`. The handover doc's *"contract slot
documented"* is wrong. Contract work is part of this item, not a precondition.

### Q1.6 · `EXPLAIN ANALYZE` every new access path — ✅ LANDED 11 Aug 2026

**All five paths planned against the real corpus. `SCHEMA_TRUTH.md` §Access
paths.**

**THE FINDING: STATISTICS WERE A WEEK AND THREE MIGRATIONS STALE.**
`judgments.last_analyze` was **NULL** and `last_autoanalyze` was **4 Aug** —
before `0026`, `0027` and `0028` all landed. The planner had **no statistics at
all for `storage_key`** and was choosing plans from week-old data.

One `ANALYZE` per table changed the **plans**, not just the timings:

| path | before | after | |
| --- | --- | --- | --- |
| `storage_key IS NOT NULL` | **23.504 ms · Seq Scan** | **0.019 ms · Index Scan** | **1,237×** |
| `section:` + `act:` | 1.606 ms | **0.040 ms** | 40× |
| `cite:` alias lookup | 0.976 ms | **0.038 ms** | 26× |
| `judge:` name filter | 15.343 ms | **2.127 ms** | 7× |
| `/corpus/coverage` | 0.534 ms | **0.339 ms** | 1.6× |

**The partial index was never the problem** — `judgments_storage_key_idx`
existed and was correct. **An index nobody has analysed is an index the planner
will not use.** New standing rule recorded in `SCHEMA_TRUTH.md`: **run `ANALYZE`
on every table a migration touches, as part of applying it.** Autoanalyze fires
on write volume, and a migration that adds a column or an index changes the plan
space without changing a row.

**Why nobody would have seen it:** the Railway proxy costs **~770 ms per
request** and every number above is under 24 ms. The whole range is invisible
from the client — the same proxy-vs-server separation §2 insisted on before
quoting a reranker latency.

**Left as-is deliberately:** the `judge:` filter still sequentially scans.
`judgment_judges_name_trgm` exists, but `ILIKE '%name%'` over 44,360 rows costs
less as a full scan, and at **2.127 ms** the planner is right. **Re-plan when
High Court judges land** — forcing the index now would be optimising against a
measurement that says not to.

**Also fixed while the file was open:** `corpus_coverage` (migration `0012`) had
**never been documented in `SCHEMA_TRUTH.md`**, breaking that file's own opening
rule. Documented now, along with `judgment_coverage`.

### Q1.7 · The verification record — §3 moat

`DONE:` an advocate can see why a citation is trusted.
`VERIFY:` an endpoint returns the record for a judgment; a client can render it.

**Verified state: `citation_checks` holds 1,951 rows** and is referenced only
under `services/api/src/admin/**`. **Nothing advocate-facing renders it**, which
is exactly what this file already claims — confirmed rather than assumed.

### Q1.8 · Delete the Railway TCP proxy

`DONE:` proxy removed. `VERIFY:` the host stops resolving.

**Currently LIVE** — `hayabusa.proxy.rlwy.net:24909`, used on 10 Aug to apply
migration `0028`. Owed under `CLAUDE.md`, but **Q1.1, Q1.2, Q1.3 and Q1.6 all
need it**, so it is last on purpose.

### Q1.9 · DRAFTING HAS NO CREATION PATH — core feature #3 · found 11 Aug 2026

**Found while answering RCC's question "can I test `GET /documents/:id` against a
real row".** They could not, and neither can anyone: **`SELECT count(*) FROM
documents` returns 0**, and it will stay 0.

`DONE:` an advocate can produce a draft.
`VERIFY:` `POST /documents` returns a `documentId`; `SELECT count(*) FROM
documents` is non-zero; the citations on it are rows in `citation_checks`.

**There is no `POST /documents` in the API.** The routes that exist are
`GET /documents/types`, `GET /documents`, `GET /documents/:id`,
`PATCH /documents/:id`, `POST /documents/:id/citations` and
`DELETE /documents/:id/citations/:checkId`. Confirmed from the other direction
too: `generated_content` is written in **three files and all three are tests**.
Nothing in production code creates a draft, and `PATCH` exists to edit a document
that cannot be brought into existence.

**The contract is not the blocker.** `API_CONTRACTS.md` line 892 already specs
the shape and marks it `SPECCED`:

```
POST /documents { documentType, matterId?, language, inputParams }
               → { documentId, content, citations, unverifiedReferences }
```

**THE CHAIN, in the order it actually binds — and the top of it is not the DPA.**

1. `POST /documents` must call a model. Drafting is **sensitive-class** (party
   names, facts, the matter), so `CLAUDE.md` §5 requires pseudonymisation first.
2. **`callModel` refuses every sensitive call today**, deliberately and with the
   reason written into the code: *"This call requires pseudonymisation and no
   pseudonymiser exists yet. Refusing rather than sending raw sensitive text and
   recording `pseudonymised = true`, which would put a false claim in the audit
   ledger."* That refusal is correct and must not be routed around.
3. **So the gate is the pseudonymiser, and it is code, not a credential.**
   `PRIVACY_PII.md` §Pseudonymisation specs it: Presidio as the detection base,
   stable per-document tokens, an encrypted `pii_entities` map that is never
   transmitted, re-identification client-side.
4. **And the pseudonymiser's own first step is a MEASUREMENT we cannot take
   yet.** The spec is explicit: *"Evaluate Presidio on real Indian court
   documents before trusting it — a published F1 measured on English news text is
   not evidence about a Hindi bail order naming four transliterated surnames."*
   We hold no such documents. The judgments corpus is public-class and carries no
   client PII, so it cannot serve as the evaluation set.
5. **The countersigned DPA (OD-6) is a SEPARATE gate**, owed by the founder, and
   it binds *after* 2–4, not before. Fixing the DPA alone changes nothing here.

**What is buildable today without touching any of that:** the half of
`POST /documents` that needs no model — validating `inputParams` against
`documents/types.ts` `requiredFields` and refusing when a field is missing. That
module already states why it matters: *"a bail application drafted without the
section charged is not a weaker draft — it is a wrong one, and the advocate
cannot see what is missing because fluent prose fills the gap."* Shipping the
refusal without the generation would be an endpoint whose only production
behaviour is an error, so it is recorded here rather than built on its own.

**RCC has been told to stop adding to drafts.** `DraftsListScreen` and
`DraftDetailScreen` are built, tested and correct; they are waiting on this, not
on themselves. Bus message 0007.

### Q1.10 · TWO SETTLED ALERTS CANNOT FIRE — `scripts/check-alert-coverage.mjs` is RED

**Not found by reading. Found by running the repo's own guard scripts, which
nobody had run.** `check-alert-coverage.mjs` fails, and it is right to.

`DONE:` every alert PD-5 and PD-6 promise can actually be produced.
`VERIFY:` `node scripts/check-alert-coverage.mjs` exits 0.

`alert_kind` holds **exactly two values** — `saved_authority_moved` and
`filed_citation_moved` (`packages/db/src/schema.ts:226`). PD-5 and PD-6 require
two more and neither exists:

| promised | needs `alert_kind` | state |
| --- | --- | --- |
| a judgment lands in the advocate's own matter | `own_matter_judgment` | **does not exist** |
| a matter is listed on a date they did not know about | `unknown_listing` | **does not exist** |

**The switches are already in the product.** `users.alert_own_matter_judgment`
and `users.alert_unknown_listing` are real columns and `PATCH /me/alerts`
persists them, so **the app offers a toggle for a notification the system cannot
send.** PD-6's immediate exception — *"a newly discovered listing for
TOMORROW"* — is the one alert that exists to stop a missed hearing, and it
cannot fire at all.

**This is not a deferred feature; it is a settled decision the product silently
does not implement**, and the advocate finds out by missing a hearing. The
guard's own wording, and it is the right framing.

**Why it is queued rather than started:** the enum values are a migration, but
the producers are not. `own_matter_judgment` needs new judgments matched against
matters; `unknown_listing` needs cause-list data, which is the eCourts harvest.
Adding the enum values alone would make the guard green while changing nothing —
**exactly the kind of fix §Q0 exists to catch**.

### Q1.11 · Two more repo guards, one of which is RCC's

Run all four before believing a green session — none of them is in the test
suites, and three of four were failing:

| guard | state |
| --- | --- |
| `check-design-rules.mjs` | ✅ |
| `check-contract-status.mjs` | ✅ **FIXED 11 Aug** — the status cell must be exactly `BUILT` or `SPECCED`, and two rows read `BUILT — added 11 Aug 2026`. The annotation made the parser skip the row entirely, so both endpoints reported as *absent from the status table* rather than as badly formatted |
| `check-alert-coverage.mjs` | ❌ Q1.10 |
| `check-amber-reservation.mjs` | ❌ **RCC's lane** — `EnrolmentBand.tsx` and `ProfileScreen.tsx` draw `state.caution` / `cautionWash` / `cautionText`. Amber means THE LAW HAS MOVED and nothing else; an enrolment band is about *our* confidence, which renders as neutral ink with a dashed edge. Told to RCC on the bus |

**The two red ones ran NOWHERE.** `check-contract-status` and
`check-design-rules` are both in `scripts/ci-local.mjs` and in
`.github/workflows/ci.yml`; **`check-alert-coverage` and
`check-amber-reservation` were in neither, nor in any test suite.** The two
guards that ran nowhere are exactly the two that were red — which is the whole
argument, and it cost nothing to find because both were already written.

**Both are now wired**, to `ci-local.mjs` and to the matching CI job (alerts to
the server lane, amber to the client-lane job that needs no install).
**`pnpm ci:local` is therefore RED until Q1.10 and the amber fix land**, and that
is deliberate: a green gate that has stopped looking at two of the things it was
written to look at is worse than a red one that has not.

**A false alarm, recorded because the next agent will have it too.** GitHub
Actions has not run since **7 August** despite `origin/main` being current at
`6a437fa` (11 Aug, `0 0` against local). **That is not a broken CI.** `ci.yml`
says so in its own header: `on: [pull_request, workflow_dispatch]` only, because
the repo is on the free tier's 2,000 Actions minutes and the founder's decision
is not to buy more. `pnpm ci:local` is the replacement and is meant to run before
every push. **What it does mean is that `ci:local` was not being run** — the
contract-status guard is in it and was red.

### Q1.12 · RESEARCH, 11 Aug — five things that change the queue

Full write-up with sources: **`docs/RESEARCH_2026-08-11.md`**. The five that
change what we do next:

1. **The GPU should not embed the corpus.** On legal passage retrieval **BM25 and
   dense embeddings differ by 0.3 pp** (37.1% vs 36.8%), and dense retrieval's
   effectiveness on legal case retrieval is published as *"limited"*. ~3,956
   GPU-hours would buy the smaller half of a hybrid whose lexical half exists.
   **Its real job is the pseudonymiser** — NER inference, the one blocker on core
   feature #3, and nothing else can do it.
2. **Citability is solved for 2023 onward, in the text.** High Courts print
   neutral citations (`2023:DHC:2720`, `2023:KHC-D:1`) inside the judgment, so no
   metadata column is needed. **This narrows §Q2's first question; it does not
   resolve it** — the older years are still the founder's scope decision.
   **The extractor had no pattern for the form and now does** — added before the
   HC pass reaches 2023, because it records every document it reads and never
   re-reads them, so the gap would have been permanent and silent.
3. **Lexis+ AI hallucinates at 17% and Westlaw at 33%** (Stanford RegLab, *J.
   Empirical Legal Studies*); multi-layer validation reaches **<1%**. The harness
   is the product, and the target is reachable.
4. **Our harness checks existence, not characterisation.** The same study counts
   *real citations with mischaracterised holdings* and *right quote, wrong
   procedural posture* as errors. **We do not look for either.** A genuine gap in
   our own design, not previously on any list.
5. **eSCR (`digiscr.sci.gov.in`) is an official citation→judgment lookup**, free,
   back to 1950, searchable by citation — strictly better than our 4,097
   hand-built aliases. `judgments.ecourts.gov.in` is a free full-text SC+HC
   search. **`eCourtsIndia.com` stays refused** (`CLAUDE.md` §6) and **ILDC is
   non-commercial**, so neither is usable.

### Q1.13 · The Bharat.Law account was provisioned and unread — FIXED 11 Aug

`BHARATLAW_EMAIL` and `BHARATLAW_PASSWORD` were set in the environment and
**nothing in the repository read either name.** `accountsFromEnv` read only
`BHARATLAW_ACCOUNTS`, the `label:username:password` pool form, and refused
identically whether credentials were absent or merely named differently — so a
real account sat dormant and looked exactly like an unprovisioned one.

Single-pair fallback added, `BHARATLAW_ACCOUNTS` still authoritative so a real
pool is never silently reduced to one. **Observed: `pool.configured = true`,
`pool.authorised = true`.** `AUTHORISATION` was already filled in (granted 9 Aug,
expires 2027-08-09, `benchmarkPermitted: true`, **`extractionPermitted: false`**).

**No gate was weakened.** Reading a credential is not permission to use it: the
consent email in **FQ-BL1** is still owed before anything automated, and
**FQ-BL3's first step costs ₹0 and needs no account at all** — run *Kharak Singh*
and *Danamma* through their free tier and see whether their counter-authority is
specific or vague. That single answer decides whether their treatment data is
curated and worth respecting, or computed and reproducible by us.

### Q1.14 · V2/REB reconciliation — deploy integrity, then fail-closed citation safety · 11 Aug

`docs/ai/V2_RECONCILIATION.md` audited the pasted Master Plan v2 against the
repo; the founder then sent a REB directive refining the same priority ladder.
Executed in order, each verified against production, not just local tests:

1. **Citation ambiguity** — `cite:"2020 INSC 189"` matched three real Supreme
   Court judgments and was silently returned as an ordinary result list.
   `StructuredOutcome` gained an `ambiguous` kind; verified live.
2. **`GIT_SHA` staleness** — every CLI (`railway up`) deploy since 8 Aug had
   been reporting a hand-set variable from 8 Aug on `/health`, not the actual
   deployed commit. `scripts/deploy-api.mjs` now sets `GIT_SHA`/`DEPLOYED_AT`
   atomically as part of the deploy action itself; `GET /version` added.
   Verified: `/version` in production now returns the exact HEAD sha.
3. **Fail-closed startup preflight** — `services/api/src/preflight.ts`.
   Every other degradation path in this API is deliberately fail-*open* (the
   embedder falls back to lexical-only); citation correctness is the one
   thing that must not survive silently broken. Boots refuse if the qlang
   parser, required tables/columns/index, or the JS/SQL citation-key
   normalisation pair have drifted. Verified against live production schema
   before shipping — the first draft guessed two column names wrong and
   would have hard-failed every future boot; caught before it shipped.
4. **Judgment-detail live probes** — `services/harness/src/deployed-judgment-
   safety.ts`, extending the existing `/search` probe pattern to
   `GET /judgments/:id`: citationless judgments never fabricate a citation,
   overruled judgments never report a stale status. Both PASS against
   production today.

Deferred, recorded, not forgotten: `generated_holding` (DeepSeek, migration
0033 exists, unwired), `citesJudgmentId` (RCC bus 0028/0032, P2),
statute point-in-time/concordance-quality (RCC bus 0032, P3, needs a source
before an API). Branch protection, worktree separation, and a hidden
adversarial benchmark are `docs/FOUNDER_QUEUE.md` items — none block P0.

## Q2 · WHAT IS ACTUALLY BLOCKED, and it is two questions, not a shortage of work

Neither is a credential. **Both are scope decisions only the founder can make**,
and Q1.4 cannot start until they are answered.

1. **Citability.** Neither AWS metadata variant has a citation column. A High
   Court judgment ingested from that bucket is **searchable and not citable** —
   it cannot enter a draft or a matter as an authority. Ship them behind honest
   coverage, or hold until a citation source exists?
2. **Embedding cost.** `DATASETS.md` costs 10 years at **~3,956 GPU-hours**.
   Extraction is 4.2 days; embedding is the real bill. The alternative is a
   filtered subset — `order_type` labels judgments for the four courts that
   publish it, length and structure for the other twenty-one.

> **BOTH REFRAMED 11 Aug 2026. Read `docs/CORPUS_GAP_PLAN.md` before acting on
> either — the second one was costed wrong by everyone, including this lane.**
>
> **(1) has narrowed.** From 2023 the High Courts print a **neutral citation
> inside the judgment text** (`2023:DHC:2720`, `2023:KHC-D:1`), so those years
> need no metadata column to be citable. The extractor now has a pattern for the
> form. Pre-2023 remains searchable-not-citable. The question is now *"ingest
> 2023+ where citability is solved, or the whole decade behind honest
> coverage"* — still the founder's, but a smaller question.
>
> **(2) was the wrong number.** GPU-hours are the cost of *creating* embeddings.
> **The binding constraint is that they would not fit.** Measured on our own
> database: `judgment_chunks_embedding_hnsw` is **4.7 GB for 616,197 vectors**;
> `judgment_chunks` is **9.3 GB against 1.5 GB of judgments**, so **embeddings
> are 7.2× the size of their text**. High Courts scale to **~41M vectors,
> ~490 GB, wanting RAM**, against an **11 GB** database — and pgvector is
> documented to stop scaling around **5–10M** vectors, four times below that.
>
> **And the gain is 0.3 points.** BM25 **37.1%** vs dense **36.8%** on legal
> passage retrieval. **The plan is text first, no embeddings, lexical search —
> then embed only what the citation pass proves is cited.** Only **15,218 of our
> 38,341** judgments are cited by anything at all. `FOUNDER_QUEUE.md`
> **FQ-CORPUS** carries the one yes/no this needs.
>
> **The third reason we hold 38,341, which was nobody's decision:** the loader
> does not exist. `upsertJudgments` is generic and resumable and **only the
> Supreme Court CLI calls it.** `hc-extract.ts` measures; it does not load.

**Related and already in the queue file:** `FOUNDER_QUEUE.md` **FQ-EL1**
(eLegalix, Allahabad High Court — *"works, but needs your call first"*). Allahabad
is **3,493,695 documents, 22% of the decade** and the largest single court, so
that decision and Q1.4 are the same decision.

## Q3 · PARKED, with the reason — do not resume without stating a new one

Everything under §2 is **downstream of an ungraded diagnostic** and stays parked:
reranker settling (needs ~577 queries, set is 283) · HyDE measurement (built,
14 tests, and blocked on the DPA regardless because a user query is
sensitive-class) · corpus re-embed · eval-set growth · citation-extractor
widening (**measured at zero present impact** — every judgment is Supreme Court
and the corpus holds 0 I.T.R. and 0 Cri.L.J. citations).

**Genuinely not started, and honestly so:** OCR replacement (no `services/ocr`
exists) · offline-first retrieval (no `sqlite-vec` or `op-sqlite` in any
`package.json`) · IPC↔BNS mapping (**`statute_mappings` is 0 rows by design** —
India Code's IPC handle serves an incomplete Act missing ss. 121–510, so **the
next move is a source, not a parser**; `FOUNDER_QUEUE.md` FQ-C1).

---

## 0 · STATE OF PLAY, in five numbers

| | |
| --- | --- |
| **Gate S2** | **RE-SPECIFIED 9 Aug — the 0.70 floor is GONE and this row used to say otherwise.** The gates are now `structuredExactness` and `fieldPrecision`, both deterministic, threshold 1.0 (`services/harness/src/structured-gate.ts`, `metrics.ts`). **`successAt5` is an UNGRADED DIAGNOSTIC** — still measured and printed so a regression stays visible, but it gates nothing. Its last values were 17.3% control · 22.3% graph+reranker. **Anyone reading "Gate S2 is failing at 17.3% against 0.70" is reading a stale sentence and is about to repeat the drift that cost weeks.** |
| Corpus | **Re-counted against production 10 Aug:** 38,341 judgments · 616,197 chunks · 192,197 citation edges (44,785 resolved, 23.3%) · 4,097 citation aliases · 44,360 judge rows · 97,806 statute refs · 0 statute_mappings · 0 rows with `storage_key` |
| Citator | **81 judgments flagged of 38,341** — `set_aside` 57 · `doubted` 16 · `partly_set_aside` 8. **13,389 edges now carry a treatment**, not the 95 this file was written against: `followed` 11,723 · `distinguished` 1,517 · `overruled` 108 · `doubted` 21 · `overruled_in_part` 20. All counted live 10 Aug |
| Harness | 25 queries of 30. **All three previously unmeasurable metrics now produce numbers** — a generation path exists (`generate.ts`) and an adversarial runner exists (`adversarial.ts`). Until 9 Aug there was NO model call in the package, and `run-cli.ts` reported 0 (a PASS) the moment `OPENROUTER_API_KEY` merely existed |
| Reranker | **With the graph: 17.3% → 22.3%, delta +4.9%, interval 0.4 to 9.5, McNemar p = 0.049 — the rig says SHIPS**, marginally, on 283 queries. And it had **never once been measured on real passages**: 37.6% of candidates were being scored against an empty string until 9 Aug |
| Latency | **STILL THE BINDING CONSTRAINT, but 1.38× over rather than 3.8×.** Reranking is **4,136 ms mean · p95 4,263 ms** against Gate S1's 3 s for the whole request. Truncating to 256 tokens fits and was **measured and rejected** — it costs more accuracy than the reranker adds. The free lever (padding) is **dead at a 1.1% ceiling**. What remains: **12 candidates instead of 20**, cut from both ends so the graph slots survive |

**Where the three metrics actually stand, 9 Aug:**

| metric | value | note |
| --- | --- | --- |
| hallucinationRate | **0 of 31 refs** | below the observation floor → reported NOT MEASURED |
| silentDropRate | **0** | same |
| **adversarialPassRate** | **20.0%** | worst-case over 25 calls. **Threshold 1.0 — FAILS** |
| successAt5 | **24.0%** | the bottleneck everything else waits on |
| staleOverruledRate · overruledLeakage | 0 · 0 | PASS |

**Why the generation metrics are hard to measure at all:** at success@5 = 24%
the retrieved evidence genuinely does not answer most questions, so the model
abstains — correctly — and there are too few citations to compute a rate from.
**Retrieval is upstream of everything.**

**The fp32 reranker never OOMed.** It failed on a missing `onnx/model.onnx_data`
— the fp32 build uses ONNX **external-data format**, so `model.onnx` is only the
657 KB graph and the 2.27 GB weights live in a companion file that was never
downloaded. The error surfaces from `InferenceSession::Initialize` as
*"file_size: The system cannot find the file specified"*, which is easy to read
as an allocation failure and is not one.

**The file is now fetched** and sits beside the 571 MB q8 build. **fp32 is
untested, not broken** — so the "q8 is the only usable build" constraint that
shaped the reranker work may simply not exist. Test it once the running A/B is
clear; loading 2.27 GB alongside a live experiment risks killing it.

**Also measured 9 Aug:** q8 on DirectML is **230 ms/passage — 11.5 s per query**.
Int8 kernels are poorly accelerated on DML, so the quantisation that lets this
model run on CPU is what stops the GPU helping it. **Embeddings on GPU,
reranking on CPU** is the split that works.

**Changed 9 August 2026 — keys and database are now LIVE:**

| | |
| --- | --- |
| OpenRouter | **WORKING.** Verified call, cost **$0.0000029**. DeepSeek V4 Flash **$0.098/$0.196** per M tok. **It emits reasoning tokens — a small `max_tokens` returns EMPTY content** |
| Claude API | **WORKING** (Haiku 4.5 verified) |
| Database | **OPEN** via Railway TCP proxy `altaria.proxy.rlwy.net:40754`, proxy id `dc1959e1-…`. **DELETE IT WHEN DONE** |
| Migration 0025 | **APPLIED** to production — it had never been run |
| Training extraction | **6/6 live tests pass** against the real corpus. The SQL had never once executed before today |
| Citation fast path | **VERIFIED on the real corpus**: 279 near-miss citations → **0** resolved to their source; 25/25 real and 20/20 reporter citations resolve |
| Re-embed cost | **$65 line STRUCK.** Measured **36.6 ms/chunk on this machine's CPU** → 616,197 chunks ≈ **6.3 h** (12–19 h realistically). An overnight run, not a purchase |
| Indian Kanoon | **NOT A BLOCKER — SETTLED.** No API: it is metered and the budget goes to Supreme Today instead. Website accounts only. The metered client stays built and refusing, permanently |

---

# A · THE PLAN FROM 9 AUGUST 2026 — structured search, then coverage

**This section supersedes §2's ordering.** Founder-directed after the retrieval
work was judged to be over-engineering that produced nothing usable. That
judgement was correct and the research says why.

## A0 · Why the number never moved

Our eval set uses the **CLERC** method (arXiv 2406.17186). **CLERC's own
published ceiling is 48.3% recall@1000** zero-shot, 41–43% for dense retrievers
including BGE — which is what we run — and 68.5% recall@1K for a *fine-tuned*
LegalBERT DPR. The paper states existing models *"struggle significantly"*.

We measure **48.1% recall@20** on a 38,341-judgment corpus. Smaller haystack, so
not like-for-like — but the conclusion stands: **`success@5 ≥ 0.70` is a number
nobody in the published literature reaches on this task, at any k.** Gate S2 was
mis-specified, and the lane spent weeks failing a test the field cannot pass.

## A1 · The strategic error, which is larger

Manupatra and SCC Online sell **Boolean, field, citation and faceted search** —
party, judge, act, section, court, period, with nesting. That is what advocates
are trained on and what they type. We built semantic search and four filters.
**We were competing at the one thing the incumbents do not do, while missing the
thing they do.**

Meanwhile the market violently validated the original thesis: the public
AI-hallucination sanctions tracker records **1,598 court cases** involving
fabricated citations by June 2026, up from ~200 a year earlier — **~8 per day**,
penalties to **$110,204**, multi-year suspensions.

## A2 · STRUCTURED SEARCH — LANDED 9–10 Aug 2026

**All of A2 is done and applied to production.** Working end to end against the
live corpus:

```
cite:"(1994) 3 SCC 1"                    → S.R. BOMMAI versus UNION OF INDIA
cite:"AIR 1965 SC 845"                   → SAJJAN SINGH versus STATE OF RAJASTHAN
section:138 act:"NI Act"                 → 359 judgments
section:482 act:"CrPC"                   → 1,237 judgments
judge:"CHANDRACHUD" AND type:criminal    → 214 judgments
judge:"GAJENDRAGADKAR" AND date:[1960 TO 1962]  → 262
"basic structure" NEAR/6 "constitution"  → 20
cite:"(2099) 9 SCC 9999"                 → 0, and nothing invented
```

| what | before | after |
| --- | --- | --- |
| Citation formats searchable | S.C.R. and INSC only — **AIR 0, SCC 0** | **+4,097 AIR/SCC aliases** |
| Judgments flagged in the citator | **22** | **81** |
| Citation edges carrying a treatment | 95 | **5,318** |
| Provision references | **none — the table did not exist** | **97,806** across 25,466 judgments (66.4%) |
| Judges searchable | a comma-delimited string | **44,360 rows, 277 distinct judges** |
| Gate S2 | an unreachable 0.70 floor | **two deterministic gates, both measuring 1.0000** |

Commits: `ccbebc8` `56e25ad` `c493518` `220825b` `ae6ad9d` `fe9ab13` `74c8ace`
`c2e94c4` `1deb80a` `4b04328`.

## A2-OLD · the original checklist, kept for provenance

- [x] **A2.1** Query language: tokenizer, recursive-descent parser, typed AST.
      Fields · Boolean · `NEAR/n` · wildcards · ranges. **37 tests**, including a
      3,000-case fuzz. `ccbebc8`
- [x] **A2.2** `explain.ts` — renders the AST back to a sentence, echoed in the
      response. **A correctness feature**: a misparse produces *results*, not
      errors, so the only defence is stating the interpretation and letting the
      advocate check it.
- [x] **A2.3** Migration `0026` — `pg_trgm`, trigram indexes on title/case
      number, normalised citation index matching `citationLookupKey` exactly,
      `judgment_judges`, `judgment_statute_refs`. `56e25ad`
- [x] **A2.4 VERIFIED LANDED 10 Aug** — `compile.ts` — AST → parameterised SQL. Every value bound.
- [x] **A2.5 VERIFIED LANDED 10 Aug** (97,806 refs) — `judgment_statute_refs` extractor — **requires act context**; a
      bare "section 5" is not recorded. BNS↔IPC expansion at query time.
- [x] **A2.6 PARTLY LANDED** — `parsed` echoes at route.ts:97,126. **Facets are NOT built and NOT in the contract** → Q1.5. Original text: Route + contract: `parsed` echo, facets, 400 with offset on parse
      failure, all three citation fields preserved.
- [x] **A2.7 VERIFIED LANDED 10 Aug** (structured.ts) — **THE SAFETY RULE** — structure decides, semantics fills, never
      blended. Zero structured matches returns **zero**, with semantic
      suggestions in a *separate* field. An advocate who asked for
      `judge:Chandrachud` must never receive another judge's judgment.
- [x] **A2.8 VERIFIED LANDED 10 Aug** (metrics.ts) — Gate S2 re-spec: `structuredExactness` and `fieldPrecision` at
      1.0; `successAt5`/`recallAt20` demoted to ungraded diagnostics; CLERC
      evidence recorded in `sprints/SPRINT_2.md`. **Each new metric needs a
      negative control proving it can fail.**

## A3 · TODO — coverage. The AWS Open Data corpus

**Storage is not the obstacle and never was.** See `docs/CORPUS_TIERING.md` §6,
measured: **~42 GB in Postgres** and **~115 GB on R2** for the whole corpus,
under **$8/month**. Railway bills **used** space, not provisioned, so raising the
volume ceiling costs nothing until data fills it.

- [x] **A3.1 COUNTED 10 Aug 2026 — `docs/HC_CORPUS_SURVEY.md`.** 1,493 parquet
      footers in 85 s, a few MB moved. `pnpm --filter @lawmind/ingest hc:count`.

      **20,529,202 documents all years · 15,771,566 in the last 10 years**, so
      the "15.9M" headline was fair. **The finding is what the total is made of.**

      **The bucket publishes TWO metadata files per partition and they share
      ZERO CNRs.** `metadata.parquet` (19,237,683 rows) and
      `metadata-mobile.parquet` (1,291,519). Measured on one partition: 1,841
      vs 53,753 rows, **0 CNRs in common**. The first pass skipped the mobile
      files as unparseable keys. They carry **eighteen extra columns** —
      `order_type`, `is_final`, `petitioner`, `respondent`, `pet_advocate`,
      `case_type`, `bench_name` — and a **differently shaped `pdf_link`**, so
      the variant decides how a PDF key is derived. Four of 25 courts publish it.

      **Reconciles EXACTLY with `DATASETS.md`'s independent count** on 2023,
      2024 and 2025 — to the digit. And that identity is the evidence the
      earlier count silently included the mobile files without distinguishing
      them.

      **Document count is not judgment count, and the share is a RANGE:
      0.75% – 18.64%.** A first pass matched `/judgment|judgement/` and reported
      **18.64%; that was wrong** — `View Judgement/Order` (231,067 rows, 17.89%)
      says *judgment OR order* and is almost the whole of it. Unambiguous
      judgments are **9,678 = 0.75%**. Narrowing the range needs PDF text, which
      is A3.3. **Caveat that governs the number: mobile variant only — 8% of the
      corpus, disjoint from the other 92%. Never quote it as corpus-wide.**

      **Ingest order falls out of it:** top five courts are **54%** of the last
      decade (Allahabad 3.49M, Bombay 1.53M, Madras 1.51M, Punjab & Haryana
      1.26M, Patna 1.07M); bottom five are 0.4%. **Delhi is 16th by document
      count while being among the most cited** — document count is not
      authority count and must not drive the order alone.

      **Unchanged and still disqualifying:** neither variant has a citation
      column. A judgment ingested from this bucket is **searchable and not
      citable**. This survey does not soften that.
- [ ] **A3.2** **High Courts, last 10 years first** — OD-4's stated order.
- [x] **A3.3 MEASURED 10 Aug 2026 — `docs/HC_EXTRACTION_COST.md`.** 1,000 PDFs,
      40 from each of 25 courts, random offset into rotating parquet files, 2016+.
      Same `unpdf` path the SC loader uses. `pnpm --filter @lawmind/ingest hc:extract`.

      **EXTRACTION IS NOT THE BOTTLENECK.** 99.4% extracted · 0.2% need OCR ·
      0.4% corrupt. **154 ms download + 32 ms extract = 186 ms per PDF**, so
      15,771,566 documents is **4.2 days on eight workers** (33.9 on one).
      **Download dominates extraction 5:1** — the lever is concurrency, not a
      faster PDF library, and the bucket's tolerated rate is NOT measured.

      **Text volume corroborates `CORPUS_TIERING.md`.** Mean 5,823 chars →
      **96.4 GB raw** for the decade; the 37 GB brotli budget implies 2.9×
      compression, entirely ordinary. **Two independent estimates agree and the
      storage plan stands.**

      **OCR burden 0.2% ≈ 31,700 documents** — a rounding error, not the feared
      disaster. Not costed: paddleocr/tesseract are at the Devanagari floor.

      **THE AGGREGATE HID THE IMPORTANT NUMBER, and this is the finding.** The
      stratified sample reported `missing 0.0%`. Chasing the four Bombay failures
      showed **Bombay 2023–2026 at 29.5% missing and 10% failed**, and HEAD-checks
      per bench show it is **whole bench-years**: 2026 `newas` 0/12, 2026 `newos`
      0/12, 2025 `newas` 1/12, 2023 `newos_spl` 0/12, while every 2024 bench is
      12/12. **Metadata does not imply a PDF.** So: treat 404 as an expected
      per-bench-year outcome, probe twelve HEADs before queueing thousands of
      rows, and never trust a corpus-wide average for this — it averaged 0% over
      a court sitting at 29.5%.

      **Two exclusions fall out.** `bench=testcase` is a test fixture publishing
      ~16,000 rows a year at Bombay. And **Bombay 2016–2017 is 16.0% `Invalid
      PDF structure`** against a corpus-wide 0.4% — court-and-era specific.

      **Per-court text length spreads 11× (Delhi 17,424 → Uttarakhand 1,519),
      which retires a generalisation:** `DATASETS.md`'s *"2,223 chars for Punjab
      & Haryana"* was a true number about two bottom-of-distribution courts read
      as a corpus constant. 18% under 1,000 chars still stands.

      **NOT settled and unchanged:** embedding still costs ~3,956 GPU-hours
      (`DATASETS.md`), and **neither variant has a citation column — an ingested
      HC judgment is searchable and not citable.** That remains the disqualifier.
- [ ] **A3.4** Tier 2 rows for every judgment: metadata + one `bit(1024)` vector.
- [ ] **A3.5** R2: brotli text + flat fp32 vectors. **PDFs are never copied** —
      the AWS bucket is public, permanent and CC-BY-4.0; we store a key.
- [ ] **A3.6** **Publish coverage per court and per year in the product.**
      `corpus_coverage` exists. Silence about a gap does the same damage as a
      fabricated citation — both let an advocate rely on something absent.

## A3b · TODO — Cloudflare R2, the storage lane

**Was missing from this plan and should not have been.** R2 is already the
approved vendor (`OD-4`, `CORPUS_TIERING.md` §3) and nothing works at 15.9M
without it. The founder is supplying an account and API token.

- [x] **A3b.1 VERIFIED LANDED 10 Aug** (refusingStore/objectStoreFromEnv) — `packages/storage` behind an interface that **refuses honestly
      without credentials**, exactly as `packages/auth/src/mail.ts` does. The
      whole path builds and tests with no token; only the upload is outstanding.
- [x] **A3b.2 LANDED 10 Aug 2026 — migration `0028`, APPLIED to production and
      verified against the live database.** `judgments.storage_key` text null,
      partial index `WHERE storage_key IS NOT NULL`. A **key, not a URL**, so the
      bucket, account and endpoint can change without rewriting 15.9M rows.
      **Never the PDF** — `source_url` already points at the public CC-BY-4.0 AWS
      bucket. **NULL means "not tiered out"**, a real and permanent state for the
      38,341 hot Supreme Court rows, not a value to backfill.
- [ ] **A3b.3** Brotli text objects — measured at **2.0 KB per High Court
      judgment**, 37 GB for the whole corpus.
- [ ] **A3b.4** fp32 vector blobs with **ranged reads** — 500 candidates × 4 KB is
      one 2 MB ranged GET. Zero egress is the property that makes the tiered
      design viable on a read path.
- [x] **A3b.5 LANDED 10 Aug 2026 — `packages/storage/src/spend.ts` +
      `metered.ts`, 22 tests.** Prices verified against Cloudflare's own pricing
      page the same day: **Class A $4.50/M · Class B $0.36/M · storage
      $0.015/GB-month · egress free · `DeleteObject` FREE.**

      **The number that justifies it:** one PUT per judgment across 15.77M is
      **$71**. One PUT per *chunk* is not — the SC corpus already runs 616,197
      chunks over 38,341 judgments, a **16:1 ratio**, which over the HC corpus is
      ~253M objects and **$1,138 in PUTs** for data whose storage costs under
      $2/month. **The failure mode is a per-chunk write pattern, not volume of
      bytes**, and it looks harmless in review.

      Charged **before** the operation and a refused write **never reaches the
      network** (asserted by counting calls on a spy store, not by inspecting a
      flag). Default ceiling **$25 — low enough that a wrong write pattern hits
      it during the first test run**, not at the end of a 15M-object job. An
      unparseable `R2_OP_BUDGET_USD` falls back to the default rather than NaN,
      because `NaN > ceiling` is false and a NaN ceiling silently permits
      everything — the single most dangerous way this could fail, so it has a test.

      **A test caught a real defect:** a free `delete` was being refused once
      accumulated spend passed the ceiling, which would lock an operator out of
      deleting the objects that caused the overspend. Free operations are now
      never refused on cost.
- [x] **A3b.6 LANDED 10 Aug 2026 — migration `0028`, applied and verified.**
      `r2_operation_ledger`, plus a halt switch reusing `platform_config` rather
      than inventing a second mechanism.

      **The ledger is AGGREGATED per run per window, and that is the design, not
      a shortcut.** `ecourts_fetch_ledger` is per request because the grant is
      *counted in requests* — 1,000/day — and answers *"did we stay inside the
      grant"*. **R2's constraint is spend, not permission**: a per-operation
      ledger would be tens of millions of rows auditing a two-figure dollar
      number, and **the ledger would itself become the per-object write pattern
      it exists to catch.** Written into the migration so nobody "fixes" it.

      **The halt switch defaults to NOT halted, and that is not a weakening.**
      eCourts' switch defaults OFF because the danger there is permission. Here
      the danger is spend, the primary gate is the budget ceiling, and a storage
      layer that refused until someone remembered a config row would be an ingest
      that silently stores nothing — which `r2.ts` names as the worst outcome
      available. **Reads are never halted**: taking the product down cannot save
      $0.36 per million. Deletes *are*, because a halt exists to stop the corpus
      changing.

      **Verified against the live database, not asserted:** all three CHECK
      constraints reject (window ordering, negative counts, negative cost) **and
      a valid row is accepted** — the positive control matters, or a table that
      rejected everything would have passed. Zero probe rows left behind.

## A3c · TODO — THE CITATOR. Measured 9 Aug, and the gap is 161×

**The founder's judgement that this is the real gap is confirmed by the data.**

| | |
| --- | --- |
| Citation edges | **192,197**, of which **44,785 resolved (23.3%)** |
| Classified `cites` — the generic bucket | **180,432 — 94% of all edges** |
| `followed` · `distinguished` | 10,437 · 1,233 |
| **`overruled` · `overruled_in_part` · `doubted`** | **69 · 19 · 7 — 95 edges in total** |
| Judgments flagged `overruled_status != none` | **22 of 38,341** |
| **Judgments whose text USES overruling language** | **3,549** |

**Two separate bottlenecks, and they need different fixes:**

**1 · Relationship extraction is nearly blind.** 94% of edges are the generic
`cites`. Against 22 flagged judgments, **3,549 contain overruling language** —
`stands overruled` 97 · `does not lay down the correct law` 283 · `per incuriam`
339 · `impliedly overruled` 50 · `hereby overruled` 86, and 3,156 containing the
stemmed word `overrule` at all. **Not all of those overrule anything** — many
discuss an overruling made elsewhere, or reject the argument that something was
overruled — so 3,549 is a ceiling on candidates, not a count. Even at a 10% true
rate it is **~350 against 22**.

**2 · Resolution is 23.3%.** Three-quarters of what the Supreme Court cites is
not in our corpus — High Courts, Privy Council, and the specialist reporters the
extractor cannot read. **Coverage (§A3) fixes this half directly**, and this is
the sharpest available argument for the AWS ingest.

- [x] **A3c.1 VERIFIED LANDED — 13,389 treatment edges live, counted 10 Aug** — Classify treatment from the text **around each citation offset** —
      `judgment_citations.char_offset` already exists on every edge, so the
      evidence is already joined to the citation. No new data, no purchase, no
      OCR.
- [x] **A3c.2 VERIFIED LANDED** (patterns, no model) — **High-precision patterns first, never a model.** Reading the
      court's own words is a primary source; a model's opinion about whether a
      case was overruled is exactly the commentary `DATASETS.md` forbids.
- [x] **A3c.3 VERIFIED LANDED** (81 flagged, dry-by-default CLIs) — **PRECISION ABSOLUTELY OVER RECALL, and this is not a preference.**
      `overruled_status` drives the LAW MOVED mark, and `set_aside` disables
      add-to-matter. A false positive tells an advocate a good authority is dead
      — the stale-overruled threshold is **0** for the same reason. Anything
      uncertain goes to a **review queue, never to the column.**
- [x] **A3c.4 VERIFIED LANDED** (negation per phrase, tested) — Distinguish *"we overrule X"* from *"X was overruled in Y"* and
      from *"the contention that X is overruled is rejected"*. **The third reads
      identically to a keyword matcher and means the opposite.** This is the
      whole difficulty, and it is why the patterns must be tested against real
      passages before anything is written.
- [x] **A3c.5 VERIFIED LANDED** (citator-report.ts) — Report the candidate list with its evidence span for human
      review. **A citator that flags 350 judgments nobody checked is worse than
      one that flags 22 that were.**

## A3d · THE CONCORDANCE GAP — found 9 Aug by running the demo, and it is the one

**This is why Supreme Today pinpoints a citation and we do not.** It is not a
retrieval problem, a ranking problem or a model problem. It is a naming problem.

**Every judgment in our corpus carries exactly one reporter citation, and it is
always `S.C.R.`** — `[1973] SUPP. 1 S.C.R. 1` for *Kesavananda*. Measured across
all 38,341 rows: **AIR 0 · SCC 0.** The resolved citation graph says the same:
of 44,785 resolved edges, **AIR 0 · SCC 0 · SCR 43,858 · INSC 886**.

**So an advocate typing the citation they actually use gets nothing.**
`AIR 1973 SC 1461` and `(1973) 4 SCC 225` are how *Kesavananda* is cited in
practice; we know it only as `1973 INSC 91`. A zero result reads as *"no such
case"*, which is the worst possible failure for a product whose promise is that
a citation is real.

**It also retrospectively qualifies a test I trusted.** The live hard-negative
suite reports 25/25 real citations resolving — but those citations were drawn
*from our own corpus*, so every one was S.C.R. The test was non-vacuous for what
it tested and **never touched the two formats advocates use.**

### The prize, measured

| unresolved edges | count | distinct strings |
| --- | --- | --- |
| total unresolved | **147,412** | |
| **SCC** | **76,387** | **31,943** |
| S.C.R. | 30,365 | |
| **AIR** | **16,848** | **9,067** |
| INSC · SCALE | 2,331 · 1,044 | |

**41,010 distinct AIR and SCC strings sit in our own judgment text and resolve to
nothing** — and many point at judgments we hold. `AIR 1952 SC 343` is cited **59
times**; it is a 1952 Supreme Court judgment and **we have every Supreme Court
judgment from 1950.** We own the case and do not know its name.

### The fix — derive the concordance from the courts' own words

- [x] **A3d.1 VERIFIED LANDED — 4,097 aliases live, counted 10 Aug** — For each unresolved AIR/SCC citation, take the text window around
      its `char_offset` — **the offset is already stored on every edge** — and
      extract the case name printed beside it. Courts write *"State of West
      Bengal v. Anwar Ali Sarkar, AIR 1952 SC 343"*; the name is right there.
- [x] **A3d.2 VERIFIED LANDED** (trigram + year guard) — Match that name against `judgments.case_title`, now
      trigram-indexed, constrained by the **year in the citation** and the court.
- [x] **A3d.3 VERIFIED LANDED** (corroborations >= 2, DB CHECK) — **Corroboration, not a single sighting.** `AIR 1952 SC 343`
      appears 59 times, each beside a case name. Agreement across many citing
      judgments is strong evidence; one occurrence is not. Record the count.
- [x] **A3d.4 VERIFIED LANDED** (UNIQUE on alias_key) — **EXACTLY ONE candidate, or nothing.** Two matches record
      nothing — the same rule `exactCitation` already applies. **A wrong alias is
      worse than a missing one**: an advocate searching `AIR 1952 SC 343` and
      receiving the wrong judgment may cite it, which is the failure this entire
      product exists to prevent.
- [x] **A3d.5 VERIFIED LANDED** (judgment_citation_aliases + evidence) — Store in a **separate table with its evidence**, not merged into
      `reporter_citations`. `cite:` searches both. Provenance must stay
      answerable: *"who says this judgment is AIR 1952 SC 343"* has to have an
      answer, and it is "fifty-nine Supreme Court judgments say so".
- [x] **A3d.6 VERIFIED LANDED** (primary-source derivation) — This is **primary-source derivation, not a model's opinion** —
      permitted where `DATASETS.md` forbids commentary. It also **removes a
      reason to buy**: the concordance is part of what a licence sells.

## A4 · What each account and licence is actually for

**They are four different things and only one of them is a bulk corpus.**

| Source | What it is for | What it is NOT |
| --- | --- | --- |
| **AWS Open Data** | **The bulk corpus.** ~17.8M judgments, CC-BY-4.0, free, no account, permanent | Not live data — it is a back catalogue |
| **eCourts grant** (7 Aug 2026 → 1 Jan 2029) | **The daily loop.** Cause lists, case status, court orders, caveat search — *tomorrow's listings*, which is the wedge feature | **NOT a bulk corpus.** Capped at **1,000 requests/day**; the entire grant period yields ~876,000 requests. Harvesting 15.9M judgments this way would take **43 years** |
| **Supreme Today** ₹50,000/mo | **Editorial layer we cannot get free**: High Court + tribunal **headnotes** and **Authority Check treatment** (which case overruled which). Also question→citation pairs | **Not raw judgments** — those are free at 17.8M scale. Not Supreme Court headnotes either: e-SCR gives ~34,000 official ones free |
| **Bharat.Law** ₹1,499 one month | **Competitive research.** Does their treatment data actually resolve the seven `overruled_in_part` cases our extractor could not? Curated or computed? | **Extract nothing.** Their AUP forbids benchmarking in writing, and the data is either free elsewhere or a machine's opinion we may not train on |

**The through-line: our citator is the gap.** 22 flagged judgments of 38,341,
because a Supreme-Court-only corpus can only show the Supreme Court overruling
itself. AWS gives coverage; Supreme Today gives treatment; eCourts gives today.
Only the middle one costs real money, and `SUPREME_TODAY_LICENCE.md` says buy one
month and measure it.

## 1 · TIME-CRITICAL — the Supreme Today account arrives tomorrow

The founder buys **one account** to test. `docs/HARVEST_ENGINE.md` §13: **day one
is measurement, not harvest.** Everything below must exist before then so day one
is not spent building scaffolding.

- [x] **Pacing engine** — `services/ingest/src/harvest/pace.ts`, AIMD, 15 tests
- [x] **Supreme Today client** — session + circuit breaker, 12 tests
- [x] **Indian Kanoon client** — metered, budget-guarded, 11 tests
- [x] **Raw archive + fetch ledger** — migration `0023`, `harvest_fetches`.
      Content-hashed, immutable, records refusals. Three constraints close the
      ways a ledger could lie
- [x] **Resumable, de-duplicated work queue** — `harvest_queue`, UNIQUE
      (source, item_key). 9 store tests observed against real Postgres
- [x] **The licensed `verified_by_source` value** — migration `0024`.
      `ecourts > public_x2 > ecourts_bulk > licensed > corpus`
- [x] **A display gate** — `licensedDisplayPermitted()`, **default false**, opens
      only on an exact `LICENSED_DISPLAY_PERMITTED=true`. A withheld headnote is
      **null, never a truncated version of theirs**
- [x] **Day-one probe** — `pnpm --filter @lawmind/ingest harvest:probe`. Refuses
      honestly without credentials and prints a completion date and total cost

**§1 IS COMPLETE.** The account can be used the day it exists.

**Day-one script, in order:** what does the account actually see · what is the
real sustained rate · how big is the overlap between our 38,341 citations and
their resolvable set · archive **one** page and build the parser against it
**offline**. Never iterate a parser against the live service — that is paying for
our own bugs.

---

## 1b · BHARAT.LAW — 2–3 accounts, founder decision 9 August 2026

The founder has decided to buy **two or three accounts**. The client is built.
**It refuses today, on purpose**, and the reason is not caution — it is that the
permission is a different shape from Supreme Today's.

- [x] **Account pool** — `services/ingest/src/harvest/bharatlaw.ts`, **30 tests**
- [x] **The consent gate** — `AUTHORISATION` is **null**, exactly like
      `court/authorisation.ts`. Every automated call refuses while it is null.
      **`CLAUDE.md` §6's rule applied to a second vendor: if the authorisation's
      terms are not in the repo, the switch stays off.**
- [x] **Benchmark and extraction are separate permissions**, never one flag.
      `extractionPermitted` is expected to stay **false permanently** —
      `BHARAT_LAW_OFFER.md` §5
- [x] **A 401/403 on ONE account halts the WHOLE POOL.** Tested by counting
      network calls, not by inspecting a flag. **This is the rule that keeps
      2–3 accounts from being ban-evasion** — answering a refusal with the next
      credential is circumventing an access control, which their AUP names
- [x] **Two ceilings, not one.** Each account carries its own credit
      entitlement (Pro = **10,000/month**, their published meter) *and* the pool
      carries a lower global daily ceiling, so **adding an account does not
      silently multiply our traffic**
- [x] **Consent overrides more accounts than it covers** → the pool refuses
      rather than quietly using the covered subset

**WHY IT IS OFF.** Supreme Today gave a **written licence**. Bharat.Law gave a
**verbal yes** — and their Evaluation Terms permit benchmarking only *"without
our prior written consent"*, which is a **consent requirement, not a ban**. One
email converts it. `FOUNDER_QUEUE.md` **FQ-BL1** holds the exact wording to send.

**ORDER OF OPERATIONS, and the first step costs nothing:**

1. **Free tier first, ₹0, no signup.** Run *Kharak Singh* and *Danamma* through
   it. **That settles curated-vs-computed before any money moves.**
2. **Send FQ-BL1.** If they will not put it in writing, that is also an answer.
3. **Then buy — monthly, never annual.** Transcribe the email into
   `AUTHORISATION` and the pool opens by itself.

**Nothing here is on the Gate S2 critical path.** §2 still outranks it.

---

## 2 · GATE S2 — everything else is downstream of this

- [ ] **Recall levers** — **REGROUPED 9 Aug 2026, because "blocked on $65" was
      wrong for half of them.** `docs/RETRIEVAL_ARCHITECTURE.md` §0.

      **Blocked on nothing but a live Postgres** (same thing the reranker run
      needs — not money, not a key):
      **citation-graph expansion**, which is *already built*
      (`services/api/src/search/graph-expand.ts`, IDF-damped, harness-wired
      behind `HARNESS_GRAPH`) and has simply **never been measured**. Measure it
      **with the reranker and without** — that file's own note says graph and
      reranker are one combination, since expansion enters at rank 16 and cannot
      move success@5 alone.

      **Blocked on the LLM key only** — these are *query-side*, so they need
      **no re-chunking, no re-embedding, no reindexing**:
      HyDE · multi-query / RAG-Fusion · query decomposition.

      **~~Blocked on ~62 GPU-hours ≈ $65~~ — STRUCK 9 Aug 2026, MEASURED.**
      `Xenova/bge-m3` fp32 on this workstation's CPU runs at **36.6 ms/chunk**,
      so all 616,197 chunks is **≈ 6.3 hours** (12–19 h realistically) — **an
      overnight run on hardware we already own.** The $65 assumed a rented GPU
      because Railway has none and nobody re-checked once a 4060 Ti existed.
      `docs/RETRIEVAL_ARCHITECTURE.md` §6c. So: late chunking ·
      summary-augmented chunking (**DRM is 95.2%**) are **blocked on nothing but
      a night** — but still run the free query-side and graph levers first.

      **AND THE FREE LEVER IS NOT DONE: HyDE is built and unmeasured**, so this
      section's own sequencing rule says measure it before spending the night.

      **The schema question, recorded before the six hours rather than after.**
      Late chunking and SAC change the CHUNKS, not the model — so they are new
      rows, not a new column, and `judgment_chunks` has
      `UNIQUE (judgment_id, chunk_index)`. Two chunkings cannot coexist in it
      without putting a strategy into that key, and doing so would also put both
      strategies inside **one HNSW index**, so every ANN search would have to
      over-fetch and filter — the exact cost `dense()` already pays for PD-10
      filters.

      **Recommendation: a separate table with its own HNSW index.** It leaves the
      live index untouched, needs no filter on the hot path, and is deletable in
      one statement if the new chunking loses. If it wins, it becomes the table.
      **The reversible choice, for an experiment that may well be rejected** —
      256-token truncation was.
- [x] **GRAPH EXPANSION MEASURED at n=283, 9 Aug 2026 — the first time ever.**

      | | before | after |
      | --- | --- | --- |
      | success@5 | 19.1% | **19.1%** |
      | **recall@20** | 40.6% | **48.8%** |
      | MRR | 0.140 | 0.144 |

      **0 gained · 0 lost · 283 unchanged. McNemar: no discordant pairs at all.**
      By the A/B rig's own rule: **DOES NOT SHIP** on success@5.

      **But this is a success, not a null result, and `graph-expand.ts`
      predicted it in writing months ago:** *"Entering at rank 16 cannot move
      success@5 on its own. **Graph and reranker are one combination, not two
      features**."*

      **recall@20 moved +8.2 points.** The graph IS finding authorities that
      text similarity never retrieved — which is exactly the 56% that
      `BLOCKER_REGISTER` says no reranker can reach. They arrive below rank 5,
      so success@5 cannot move. **Recall is the thing the graph was supposed to
      fix, and it fixed it.**

      **The combination is now the experiment**, not either half.

- [x] **`ab both` MEASURED at n=283, 9 Aug 2026 — the combination DOES move the
      number, and then latency overrode the whole question.**

      | | before | after |
      | --- | --- | --- |
      | success@5 | 19.1% | **23.7%** |
      | recall@20 | 40.6% | **48.8%** |
      | MRR | 0.140 | 0.162 |

      **29 gained · 16 lost · 238 unchanged. McNemar p = 0.072 — NOT SETTLED**,
      95% interval −0.0% to 9.2%. **~577 queries would settle it; this run was
      283.** So: promising, trending the right way, **not proven.**

      **The graph+reranker hypothesis held.** Graph alone moved success@5 by
      **zero** with 0 discordant pairs. Together they moved it **+4.6** with 45
      discordant pairs. The graph supplies authorities text similarity never
      found; the cross-encoder is what lifts them into the top five. Neither
      half does it alone, exactly as `graph-expand.ts` predicted.

      **BUT THE RUN BREACHED THE LATENCY BUDGET AND THE HARNESS SAID SO:**
      rerank **mean 11,424 ms · p95 55,074 ms**, against Gate S1's **3 s for the
      entire search request**. *"Accuracy is moot until this fits."*

- [ ] **~~AND THE LATENCY IS FIXED — 55×~~ — WRONG. RETRACTED SAME DAY.**

      **The 209 ms benchmark used ~50-character synthetic strings. Real
      judgment passages are 2,169–2,641 characters (median 2,519) — roughly
      **50× longer** — and cross-encoder attention cost grows with the SQUARE of
      sequence length.

      **Measured on real passages from the corpus:**

      | reranker | 20 REAL candidates | 20 synthetic |
      | --- | --- | --- |
      | q8 on CPU | **11,424 ms** (A/B mean) | — |
      | **fp32 on DirectML** | **30,539 ms** · 1,527 ms each | **126 ms** |

      **fp32 on GPU is nearly 3× WORSE than q8 on CPU for the real workload**,
      and it sits at **7.9 GB of 8.1 GB** — which is why the fp32 A/B crashed at
      query ~210 with exit 13. The card cannot hold attention tensors for twenty
      2,500-character passages.

      **The latency breach is UNSOLVED.** Gate S1 allows 3 s for the whole
      request; the best measured reranker is 11.4 s.

      **That hypothesis was WRONG and is closed.** `rerank.ts` already sets
      `truncation: true, max_length: 512`, and already documents the quadratic
      cost. Nothing was untruncated.

      **But it led to the real lever. Measured on a realistic 2,530-character
      passage, q8/CPU, 20 candidates:**

      | `max_length` | 20 candidates | verdict |
      | --- | --- | --- |
      | **512** (current) | **3,613 ms** · 181 ms each | over the 3 s budget |
      | **256** | **1,647 ms** · 82 ms each | **inside** |
      | **128** | **786 ms** · 39 ms each | comfortably inside |

      **Sequence length dominates everything else.** It also explains the whole
      fp32 confusion: the 126 ms synthetic benchmark tokenised to ~15 tokens
      while real passages pad to the full 512, and cost is quadratic.

      **`RERANK_MAX_LENGTH` is now configurable, default UNCHANGED at 512**,
      because **the accuracy cost of truncating is unmeasured**. A cross-encoder
      that sees half a paragraph may rank it worse, and reranking exists to be
      accurate. **The decisive experiment is `ab both` at 256 against the 512
      baseline of success@5 = 23.7%** — it needs the corpus proxy reopened.

      **One discrepancy I cannot yet explain and will not paper over:** this
      bench measured **3,613 ms** at 512 tokens, while the `ab both` run
      reported a **mean of 11,424 ms**. Candidate causes are per-call overhead,
      varied real passage lengths, and CPU contention with the embedder. **Until
      that is reconciled, treat 3,613 ms as a floor rather than the number.**

      **What stands from the earlier entry:** the fp32 weights really were
      missing (`model.onnx_data`, 2.27 GB) and fp32 really does load now. Only
      the speed claim was wrong.

- [ ] **~~The 55× fix~~ — see above.** Retained for the record:

      | reranker | 20 candidates | verdict |
      | --- | --- | --- |
      | q8 on CPU | **11,424 ms** | 4× over the whole request budget |
      | q8 on DirectML | ~4,600 ms | int8 is poorly accelerated on DML |
      | **fp32 on DirectML** | **209 ms** (10.4 ms each) | **fits, with room** |

      **"q8 is the only usable build" was never true** — the fp32 weights were
      simply never downloaded (`model.onnx_data`, 2.27 GB, external-data format).
      fp32 is also **unquantised**, so its accuracy should be at least q8's.

      **The caveat that decides whether this ships: Railway has no GPU.** This
      makes the reranker viable *if* it is served on a GPU endpoint, and lets us
      measure true unquantised accuracy locally today. Re-running `ab both` at
      fp32/DML now.

- [x] **TRUNCATION TO 256 TOKENS: MEASURED AND REJECTED — 9 Aug 2026.**

      **It fits the budget and makes retrieval measurably worse.**

      | | 512 tokens | 256 tokens |
      | --- | --- | --- |
      | success@5 | **23.7%** | **13.8%** |
      | recall@20 | 48.8% | 48.8% |
      | MRR | 0.162 | 0.118 |
      | rerank latency | 11,424 ms (pre-clip) | **2,104 ms · p95 2,255 ms** |

      **paired delta −5.3%, 95% interval −10.0% to −0.6% — it does NOT span
      zero. McNemar p = 0.040.** 16 gained, 31 lost across 47 discordant pairs.

      **This is a real degradation, not noise**, and it is worse than doing
      nothing: 13.8% is below the 19.1% control. **Half a paragraph is not
      enough context for a cross-encoder to rank Indian judgments**, and the
      cheap latency win costs more accuracy than the reranker was adding.

      **So the trade-off is settled and the answer is no.** The rig's own
      verdict: *"DOES NOT SHIP: it makes retrieval measurably worse."*

      `RERANK_MAX_LENGTH` stays at **512**. It exists now as a measured knob
      with a known cost, not an untried idea.

- [x] **512 tokens WITH the clip — MEASURED 9 Aug 2026.** **mean 4,136 ms ·
      p95 4,263 ms**, against 11,424 / 55,074 before. success@5 reproduced
      **exactly** at 23.7%, so the clip is score-neutral end to end and not only
      in the unit test.

      **It also closes the discrepancy §2 refused to paper over.** The bench said
      4,205 ms and the live run says 4,136 — **within 1.7%**. The old 3× gap was
      tokenising text the model then discarded; nothing else.

      **1.38× over budget, not 3.8×.** The p95 collapsed by **12.9×**, and the
      distribution is now tight (mean 4,136 vs p95 4,263) — that tightness is
      itself evidence the clip removed the variance source.

- [x] **The free latency lever is DEAD, measured not assumed.** `padding: true`
      pads every pair to the longest in the batch, and padding is masked — so
      length-bucketed batching would be **score-identical**, exactly like the
      clip. Sampled 400 real operative paragraphs: **93.5% already hit the 512
      cap**, min 351. There is almost no variance to exploit and the ceiling on
      bucketing is **1.1%**. Five minutes of measurement instead of a day of
      building.

      **So the remaining 1,136 ms has no free fix.** Retrieval is p95 488 ms
      (`CORPUS_TIERING.md` §4), leaving 2,512 ms for reranking → **12 candidates,
      down from 20.** And that cut **must keep the 5 graph slots**: graph
      suggestions enter at ranks 16–20, so a naive "rerank the top 12" would
      never see them and the entire +4.6 combination would evaporate.

- [x] **THE PIN DEFECT — 9 Aug 2026. It contaminated both arms of every A/B this
      project has run.** `services/api/src/search/query-shape.ts`, fixed in
      `c1bb164`.

      `classifyQuery` returned `shape: 'citation'` whenever **any**
      citation-shaped substring appeared *anywhere* in the text. Every eval query
      is a 200–900-character passage of judicial reasoning, and redaction removes
      only the *cited* judgment's own citations — up to three others are allowed
      to survive. So:

      | | |
      | --- | --- |
      | classified as `citation` | **140 of 283** |
      | resolved to exactly one judgment → **pinned at rank 1** | **46** |
      | **the pinned judgment was the WRONG case** | **37 = 13.1% of the set** |

      **Pinning inserts a judgment at rank 1 and shifts everything below it down
      one place**, so a gold answer sitting at rank 5 was pushed out of the top
      five by a case the passage merely mentioned in passing.

      **`warrantsExactLookup` had already written down the rule it was
      violating:** *"a missed citation is a slower correct answer, while a
      wrongly-claimed citation would pin the wrong judgment at rank 1."* The
      classifier was simply not strict enough to honour it. **A citation must be
      what the query is ABOUT, not merely present in it** — tested as the length
      of what remains once the citation is removed.

      **Verified on the real corpus rather than asserted:** wrong pins **37 → 0**,
      while the live hard-negative suite still returns **25/25 real and 20/20
      reporter citations resolving** and **279 near-misses resolving to nothing**.

      **EVERY NUMBER ABOVE WAS MEASURED THROUGH THIS AND IS VOID** — 19.1%
      control, 23.7% graph+reranker, 13.8% at 256 tokens.

      **RE-MEASURED at n=283, and the verdict changed.**

      | | through the wrong pins | **corrected** |
      | --- | --- | --- |
      | success@5, control | 19.1% | **17.3%** |
      | success@5, graph+reranker | 23.7% | **22.3%** |
      | recall@20 | 40.6% → 48.8% | 38.9% → **48.1%** |
      | MRR | 0.140 → 0.162 | 0.119 → **0.153** |
      | paired delta | +4.6%, interval **−0.0 to 9.2** | +4.9%, interval **0.4 to 9.5** |
      | McNemar | p = 0.072 — *not settled* | **p = 0.049 — SHIPS** |

      **THE BASELINE FELL, AND THAT IS THE FIX WORKING RATHER THAN FAILING.**
      Of the 46 pins, **9 were the gold judgment** — which can only mean the
      passage still contained a citation resolving to its own answer, i.e.
      **redaction had missed it**. The pin was converting that residual leakage
      into a *guaranteed rank-1 hit*. Removing the pin removes the guarantee, and
      about nine free hits with it. **So 19.1% was inflated by leakage on ~3.2%
      of queries, and 17.3% is the honest number.**

      Note what removing the pin does **not** do: the missed citation is still in
      the query text, so BM25 can still match on it. **The leakage is reduced,
      not eliminated** — see the redaction item below.

      **And the combination now crosses the line: p = 0.049.** Stated plainly
      rather than celebrated — that is *marginally* under 0.05 on the same 283
      queries with one confound removed, not a replication. **Growing the set is
      what would settle it.**

      **The latency line from this run is contaminated and should be ignored:**
      mean 4,320 ms · p95 5,169 ms, measured while typechecks and test suites
      ran on the same CPU. The clean figure is the **4,136 ms · p95 4,263 ms**
      from the uncontended run above.

- [ ] **THE CITATION EXTRACTOR COVERS FIVE FORMS, ALL SUPREME-COURT-CENTRIC** —
      found 9 Aug 2026 while building the leak check. **Not fixed: the blast
      radius reaches ingest, the citation graph and every caller of
      `classifyQuery`, and it must not be changed mid-experiment.**

      `@lawmind/ingest`'s `extractCitations` holds patterns for `INSC`, `SCC`
      (either spelling, round brackets only), `AIR … SC`, `SCR` (**either**
      bracket) and `SCALE`. **A specialist or High Court reporter is invisible to
      it** — read directly off the corpus: `[1953] 24 I.T.R. 70`, `[1946] 14
      I.T.R. 673`.

      There is also a smaller inconsistency: `citationLookupKey`'s own docstring
      promises `[2019] 4 SCC 221` collapses to the same key as the round-bracket
      form, and `build-queries.ts` carries a square-bracket citation *shape* —
      but the extractor never produces one for SCC, so the normalisation handles
      a form nothing can find. Pinned as a failing expectation in
      `build-queries.test.ts` rather than silently fixed.

      **A CORRECTION TO MY OWN FIRST NUMBER, recorded because the method matters
      more than the result.** The first measurement counted every square-bracket
      span the extractor did not return and would have reported **1,561 missed
      against 1,788 extracted — a 47% miss rate.** That was wrong twice: the SCR
      pattern already takes either bracket, so most were never missed; and the
      residual count is dominated by **`[2003] SUPP. 4`, a running page header
      repeated dozens of times per judgment**, which is not a citation at all.
      **No percentage should be quoted from this until the header artefact is
      excluded.** What stands is the qualitative finding: **specialist reporters
      are not extracted, at all.**

      **MEASURED, AND IT COSTS NOTHING TODAY.** An I.T.R. authority is only a
      lost graph edge if that judgment is in our corpus — so the number to check
      is *resolvable* misses, not raw ones. Checked against all 38,341 rows:

      | | |
      | --- | --- |
      | judgments in the corpus | 38,341 |
      | **court = Supreme Court** | **38,341 — 100%** |
      | carrying an I.T.R. reporter citation | **0** |
      | carrying a Cri.L.J. reporter citation | **0** |

      **A missed specialist-reporter citation cannot resolve to anything we
      hold.** It would be an unresolved edge whether we extracted it or not, so
      the gap has **zero present impact** and fixing it now would move no number.

      **It becomes real the moment High Court data lands** — which is precisely
      what the Supreme Today licence would buy and what eCourts harvesting would
      add. **So this is a prerequisite of that ingest, not a defect of this one**,
      and it belongs in the same piece of work rather than ahead of it.

- [ ] **REDACTION MISSES CITATIONS THAT RESOLVE TO THE GOLD JUDGMENT** — found
      9 Aug 2026 by the pin audit, not yet fixed.

      `build-queries.ts` strips `citation_text`, the gold judgment's
      `neutral_citation`, its `reporter_citations` and its distinctive title
      words. **That is not the same as stripping every citation that resolves to
      the gold judgment** — a format the corpus row does not carry survives, and
      the query then contains its own answer.

      The fix is mechanical: after redaction, resolve every remaining citation
      through `citationLookupKey` and **reject any query still pointing at its
      own gold**. Rejecting rather than redacting, because a one-sentence hole is
      cheaper than a query nobody would type.

      **It will DROP queries, so the superset guard will refuse it** — correctly,
      and that is the guard doing its job rather than an obstacle. Doing it means
      re-baselining deliberately with `--rebuild`, and every number above is
      re-measured against the new set. **A decision to take between runs, never
      in the middle of one.**

- [x] **THE RERANKER WAS SCORING 37.6% OF CANDIDATES AGAINST AN EMPTY STRING —
      9 Aug 2026. This is larger than the pin defect.** `c6b7114`.

      `operativeParagraph` is filled from the **dense** arm's `bestChunk` map, so
      a judgment BM25 found that the dense top-50 did not has no chunk and the
      field is `''`. `retrieval.ts` handed that same field to the cross-encoder.

      **Measured over 500 candidates from 25 real queries: 188 of them — 37.6% —
      were empty.** A cross-encoder scoring a query against `""` returns a low
      score necessarily and every time, so **the reranker was systematically
      deleting two candidates in five from the top five** — and doing it to
      exactly the lexical matches that carry section numbers and citations.

      **This plausibly explains the reranker's whole disappointing record**:
      +6.0 at p = 0.210 alone, and **16 queries LOST** when it was applied.

      **`API_CONTRACTS.md` is not wrong** — it says an empty `operativeParagraph`
      is legitimate because *"a result matched by the lexical ranker alone has no
      dense chunk behind it and therefore no paragraph **to show**"*. That is a
      correct decision about **display**. It was never a decision about
      **ranking**, and the two uses of one field had quietly diverged.

      Graph suggestions had a quieter version: `chunk_index 0`, which in an
      Indian judgment is the cause title, the coram and counsel's names. **The
      cross-encoder is the only thing that can lift a rank-16 graph suggestion
      into the top five, and it was being asked to judge them on their
      letterhead.**

      Fixed by `passagesForRerank()` — the chunk nearest the query vector, one
      batched `DISTINCT ON`. **Verified: empty passages 37.6% → 0.0%, all 188
      filled.** `operativeParagraph` untouched; conflating display and ranking
      again is how this returns.

      **AND THE LATENCY NUMBERS WERE FLATTERED BY IT TOO.** An empty string
      tokenises to almost nothing, so **37.6% of the reranker's candidates were
      nearly free**. Filling them means the cross-encoder now does work it was
      silently skipping. The re-run's observed rate bears this out immediately:
      **27 s/query against 15 s/query before.**

      **Prediction, written before the run reports so it can be checked rather
      than rationalised:** if cost is linear in non-empty candidates, the mean
      goes from 4,136 ms to roughly **4,136 / (1 − 0.376) ≈ 6,600 ms**, plus one
      `passagesForRerank` round trip per query. That would put reranking at
      **~2.2× over the whole-request budget rather than 1.38×**, and it makes the
      12-candidate cut necessary rather than optional. **Part of the observed
      slowdown is the round trip over the Railway proxy, which production does
      not pay — that share must be separated before the number is quoted.**

- [x] **A VALIDITY CAVEAT ON THE WHOLE GATE, measured 9 Aug 2026.** The eval set
      exercises a **different retrieval path from the one advocates will use**.

      `plainto_tsquery` ANDs every lexeme. Over the first 30 eval queries — each
      a 200–900 character citing passage — the AND pass returned a **median of 1
      candidate out of 38,341**, never more than 2, and fell below the relax
      floor on **30 of 30**. The OR fallback therefore fires **100% of the
      time**.

      **Real advocate queries are short**, so production will mostly run the AND
      path. **We are tuning a configuration our users will not hit.** This is
      inherent to the CLERC method — a citing passage is long by construction —
      and it is the price of ground truth with provenance.

      **And the other fixture does not cover the gap.** `queries.hand.json` is
      **five queries, all Hindi, 225–268 characters** — genuine research
      questions rather than extracted passages, which is better, but still long
      enough to take the same OR path. So:

      > **No query anywhere in this harness is short, and none is a short
      > English one. The query shape most advocates will actually type has zero
      > coverage.**

      That is not an argument against the derived set, which is the only thing
      giving us ground truth with provenance. It is a gap that needs its own
      fixture — short English queries, with provenance, held separately and
      **never averaged into the same number**, because a metric mixing two query
      populations reports on neither.

      **The query half is now built** — `services/harness/src/issue-statements.ts`,
      15 tests. Indian judgments state their question formulaically, and that
      sentence is short, question-shaped and the court's own. **Measured on 300
      real judgments: 18.0% yield one, 88 statements, median 134 characters.**

      **The GOLD half is an open problem and is deliberately unsolved.** CLERC
      works because the citation sits *at* the passage, so the link is the
      judge's own. An issue statement carries no such link — the authorities
      answering it are cited pages later, interleaved with those for every other
      issue the judgment decides. The tempting rule, *"gold = every judgment this
      one relied on"*, is available today and **weaker than it looks**: a
      judgment deciding four issues would score a query about issue one correct
      for retrieving an authority that answers issue three, inflating success@5
      by an unknown amount in an unknown direction. **That is worse than not
      measuring**, so the fixture is not built on it.

      The immediate consequence was a free latency win: the AND pass is skipped
      above 200 characters, since its match set is a strict subset of the OR
      pass's and the code already keeps whichever returned more. **Latency only —
      it cannot change a result.** `7dacc7a`.

- [ ] **HyDE — built, wired as an A/B lever, not yet measured.**
      `services/api/src/search/hyde.ts`, 14 tests.

      It generates prose about law, which `CLAUDE.md` otherwise forbids, and is
      acceptable only because of **where that prose is allowed to go**: it reaches
      the embedder and nothing else, **citation-shaped spans and bare case names
      are stripped before embedding** — the model has no retrieval, so every
      citation it writes is invented, and an invented citation is *noise pointing
      somewhere specific*, which is worse than noise — and **only the dense arm
      uses it**, so BM25 keeps the advocate's literal words.

      **Generation costs 2,519–4,916 ms against a 3,000 ms whole-request
      budget**, so it fires only on `concept` queries, where the register gap it
      exists to close actually is. **`dataClass` is required with no default**:
      a user-typed query is ambiguous, ambiguity resolves to sensitive, and
      sensitive is refused under OD-6 — so **HyDE over real user queries does not
      ship until the DPA lands**, whatever it measures.

- [ ] **Settle the reranker properly** — p = 0.072 needs ~577 queries. The
      query set is 283; the eval set would have to grow before this is decided.
- [~] **C1 · IPC↔BNS mapping** — unblocks the five BNS queries and closes the last
      S1 criterion. Handles verified: **IPC `123456789/11091` · Evidence `4218` ·
      CrPC `4221`**.

      **Splitter built and STOPPED at an honest limit.** Measured on the real IPC
      PDF: **36 sections of roughly 511**, range 1–120, 84 gaps. What it finds is
      correct — s. 1 and s. 2 are the real ones — but the PDF text layer puts
      most headings mid-line, and the heading rule is line-anchored. **The anchor
      is what stops it firing on ordinary numbered prose, so relaxing it trades
      an incomplete corpus for a wrong one.**

      **RE-DIAGNOSED 9 Aug 2026, and the earlier diagnosis was wrong twice.**

      **The layout hypothesis is dead.** Read the PDF's own text items: every
      item sits at **x = 72.0**, one font, one size. There is no indentation, so
      position carries no signal and "headings by POSITION" cannot work. The
      line anchor was never the problem either.

      **Both real misses were vocabulary, and both are now fixed:**
      a defining section's heading opens with a **quotation mark**
      (`19. "Judge".--`) which `[A-Z]` rejected — that is most of the
      definitions chapter — and an amended section carries its **footnote marker
      before the number** (`4*[18. "India".--`) so the line does not start with
      the digit. **36 → 70 sections**, both prefixes narrow, and the
      ordinary-numbered-prose guard still passes.

      **And the denominator was wrong.** "36 of ~511" measured against a number
      that is not in the file. India Code handle `123456789/11091` serves an
      **INCOMPLETE IPC**: 58 pages running ss. 1–120B, then ss. 168–171H, then
      s. 511. **Sections 121–510 are simply absent** — page 57 is s. 120B and
      page 58 is s. 511. Every page has a text layer, so this is not an
      extraction failure; the source itself is partial. **86 distinct sections
      carry a body marker, and we now parse 70 of them.**

      **So the next move is a SOURCE, not a parser.** No regex can recover
      sections that are not in the file, and s. 302 — the one everybody checks —
      is one of them.
- [x] **STALE — CORRECTED 10 Aug.** `OPENROUTER_API_KEY` is SET (73 chars) and `ANTHROPIC_API_KEY` is SET. The three metrics are **no longer key-blocked**; they are blocked on nothing but a run, and they sit under an ungraded diagnostic (Q3). `FOUNDER_QUEUE.md` §1 and §5 are stale with it — §5 (the $65 GPU) was struck 9 Aug when re-embedding measured 36.6 ms/chunk on local CPU

---

## 3 · THE MOAT, ranked by how long a funded competitor needs to copy it

`docs/TECHNICAL_MOAT.md` §5.

- [~] **Paragraph extraction for `overruled_in_part`** — extractor built, 20
      tests, wired into the propagation. **It does NOT unblock the seven, and the
      reason is a finding rather than a gap.**

      It first found paragraphs for all seven and every one was wrong.
      `[Para 129]` is the SCR headnote's own pinpoint into the **citing**
      judgment; the overruling itself appears in a *Case Law Cited* list with
      **no paragraph attribution at all**. We were one `--apply` from recording
      *Vineeta Sharma*'s paragraph 129 as the dead paragraphs of *Danamma*.

      Two refusals now catch that, and the corpus correctly returns **7 skipped**.
      **The paragraphs are not in that region of the text.** They are either in
      the body of the citing judgment where the overruling is actually reasoned —
      which needs a different locator, not a wider window — or nowhere.

      **Their Authority Check may supply them directly, which makes this a reason
      to buy the licence rather than a reason to keep parsing.**
- [ ] **The verification record** — 12+ months for anyone to copy, because it
      cannot be retrofitted onto logs that were never kept. Every field is already
      in `citation_checks` and **nothing renders it**
- [ ] **OCR** — replace `paddleocr | tesseract`, both at the benchmark floor
      (EasyOCR 93.6 → **58.3** on real Devanagari scans). **Qwen3-VL-8B,
      Apache-2.0, 75.2, one 24 GB GPU.** Self-hosted means *the file never leaves*
- [ ] **Offline-first retrieval** — `sqlite-vec` + `op-sqlite`. Own matters, saved
      authorities, opened judgments only. **Overruled status must render "last
      checked 08:14", never silently as good law**, or offline does not ship
- [ ] **Ingest speed** — measure whether High Court uploads actually land inside
      the May 2026 24-hour direction. Unproven until measured from our own ingest

---

## 4 · STANDING CORRECTIONS OWED

- [x] `docs/COMPETITIVE.md`'s **"nobody sells a workflow"** — corrected 8 Aug.
      Most of the paragraph survives: the *incumbents* still sell databases; what
      changed is that a new entrant arrived with the workflow already in it
- [x] `docs/OCR_PIPELINE.md` — correction recorded. Its premise is wrong and
      nobody should build on it until the stack moves
- [ ] **E1.2 alert drill is NOT done and must not be ticked.** `check-alert-
      coverage.mjs` is red at **2 of 4 PD-5 triggers** and deliberately unwired
      from `ci:local` until the violations are fixed
- [x] **`alerts/route.test.ts` was red and is now green — 10 Aug 2026.** Commit
      `20a929d` added `settings.unavailable` to the response and did not update
      its own test, so the lane carried a red test for a deliberate change.

      **INTENT: code returns `settings` including
      `unavailable: ["ownMatterJudgment","unknownListing"]`; the failing test
      expected exactly three boolean keys; `docs/API_CONTRACTS.md` §1084
      specifies the key is ALWAYS present with that value.** Spec outranks
      tests, so the test was stale, not the code. It now **asserts** the field
      rather than tolerating it, so it guards the contract instead of surviving
      it.
- [ ] **`statutes/route.test.ts` is RED, and it is a DATA condition, not a code
      defect — found 10 Aug 2026, deliberately NOT "fixed".** The test asserts
      every act has sections. Measured against the live corpus: **22 of 845 acts
      have zero sections** — *The Bengal Indigo Contracts Act, 1836*, *The
      Bombay Rent-free Estates Act, 1851*, *The Deo Estate Act* and 19 more,
      all obscure colonial-era acts.

      **Two candidate fixes and they are not equivalent**, which is why this is
      recorded rather than decided alone: either the ingest should backfill
      those acts' section text (if indiacode publishes any), or the test should
      accept that some acts legitimately have none. **Loosening the assertion
      without checking indiacode would be weakening a test to make a suite
      green**, which is the failure mode the judge pass exists to catch.
      Nothing here was touched.

---

## 5 · WAITING ON THE FOUNDER — see `docs/FOUNDER_QUEUE.md`

Nothing below blocks the lane. Each has a built path that refuses honestly.

**Credentials and money:** Supreme Today account · Indian Kanoon
`INDIANKANOON_API_TOKEN` (₹500 credit) · `OPENROUTER_API_KEY` · a GPU for
self-hosted OCR · one Supreme Today seat for lawful manual benchmarking.

**Ask Supreme Today before the harvest starts:** the **per-account request
ceiling** (daily, monthly, burst) — it moves total cost by **30×** and
`SUPREMETODAY_MAX_REQUESTS_PER_DAY` is a *placeholder* until the contract sets
it · **may we DISPLAY their headnotes or only hold them**, and what attribution.

**Counsel, one instruction, three questions:** SCR official headnotes on e-SCR
(free, ~34,000 judgments — s. 52(1)(q)(iv) vs *EBC v. Modak*, and an official
headnote is a **government work**) · the lay-facing explainer · OD-2's written
residency view.

**Decisions:** the free citation check (the strongest idea found — asks nobody to
switch) · the ₹5,000/yr price point that reaches our exact user · which
distribution channel first · an advocate to review 20 outputs.

---

## 6 · HOW TO PICK THE NEXT TASK

1. **Anything in §1**, while the account is imminent.
2. **Then §2.** Gate S2 gates the ground campaign, the marketing claim, *and* the
   evaluation of the Supreme Today licence itself.
3. **Then §3**, in the order written — it is already ranked by defensibility.
4. **§4 whenever a related file is open.**
5. **Never §5.** Queue it and keep going.

**And the standing rule that decides ships:** `DATA_ADVANTAGE.md` §1d — *if it
does not move the number on our own corpus, it does not ship.* Applied on 8 Aug to
reject a **free** Apache-2.0 reranker at +6.0 points and p = 0.210. A paid
dependency gets the same test, not a softer one.
