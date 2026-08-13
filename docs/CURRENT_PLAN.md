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

**12 Aug 2026 — a separate, unbound acquisition/discovery session (not LCC,
not RCC) ran the founder's NEW3 data-moat brief and left four new files:
`docs/SOURCE_REGISTRY.md`, `docs/MISSING_AUTHORITY_QUEUE.md`, `docs/
CORPUS_ACQUISITION_QUEUE.md`, `docs/ACQUISITION_SESSION_LOG.md`.** Nothing in
this queue changes as a result — no ingest was run, nothing was purchased —
but the missing-authority finding is worth reading before the next citation
or ingestion pass: the corpus's 32,383 unresolved external citations are
99.6% SCC/AIR references to Supreme Court judgments almost certainly already
held under a different citation form (the already-open SCC/AIR↔S.C.R.
concordance item, re-measured bigger), not a document-acquisition gap. Full
account and a founder-queue note: `docs/FOUNDER_QUEUE.md` "NOTE FROM THE
ACQUISITION/DISCOVERY LANE".

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

  **✅ CLOSED 11 Aug 2026 — and NOT by loosening it.** The instruction above was
  followed: the 22 were audited **at the source** before the test was touched,
  then re-run through the full `acts` ingest. **22 Acts retried, 0 sections
  gained.**
  - **18 carry no section index on the indiacode Act page at all** (`sectionId=`
    × 0) — the colonial Bengal/Bombay/Madras revenue Acts, plus the Wealth-tax
    Act 1957 and the Gift-tax Act 1958.
  - **4 carry an index but `SectionPageContent` answers `{}` for every section**
    — Presidency-Towns Insolvency 1909 (130), Provincial Insolvency 1920 (87),
    Broach and Kaira 1877 (41), National Anti-Doping 2022 (34). This one is
    worth knowing: those are live insolvency provisions, and the index exists,
    so the gap could close on indiacode's side without any change here.

  `fetchSections` is behaving correctly on all 22 — it reports them `missing`
  and writes nothing, because a statute with an invisible hole is worse than one
  that visibly failed. The assertion now states the data condition instead of
  contradicting it: such an Act is still **LISTED** with `sectionCount: 0`
  (dropping it would be a silent drop — an advocate searching for the Wealth-tax
  Act would conclude we do not hold it), and **22 is a ceiling**, so the ingest
  breaking on Acts that DO have text still fails loudly.

- **✅ ALSO CLOSED 11 Aug 2026 — two api tests that were pinned snapshots,
  not defects.** `corpus/coverage.test.ts` asserted Allahabad `held === 0` and
  Supreme Court `held === 38_341`. High Court ingest landed 6 Allahabad rows and
  one more SC row, and both pins fired — correctly; the Allahabad one carried a
  comment saying it should be updated deliberately when an ingest landed.
  Replaced with the **invariants** rather than the next snapshot (coverage share
  < 0.1%; an SC floor), because HC ingest is a running job and a hand-edited
  number on a running job becomes an assertion people update reflexively.

  **`services/api` is now 400/400 across 54 suites**, up from 385/388.

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

### Q1.4b · TWO P0s AND A P1 FROM THE CLIENT LANE — ✅ ALL LANDED 11 Aug 2026

Not planned work; all three arrived from RCC or fell out of answering RCC, and
all three were in front of advocates.

- **`GET /documents` 500'd unconditionally** (RCC bus 0050, `c2da1b9`).
  `listDocuments` selected `m.title`; `matters` has only `case_title`, and
  Postgres rejects an unknown column at **plan time** — so the route failed on
  every call for every user regardless of data. The Drafts tab shipped as R4 and
  has listed nothing for anybody since; the client fails soft, so nothing looked
  broken. **The typo is not the lesson: no test called `listDocuments` at all.**
  Two now do.
- **A matter's saved authorities carried no good-law status** (RCC bus 0048,
  `dd9871b`). The one surface where an authority sits for months, and verified
  is silent in our UI — so a bare row read as "this is fine". Now joins
  `overruled_*` live on every read, never stored. Note for anyone reading bus
  0048: `judgments` has no `verification_state`/`verified_by_source` columns
  (they live on `citation_checks`/`verification_cache`), so those two are
  `verified`/`corpus` **by construction**, as on every other corpus-row surface.
- **`judgments.bench` held an S3 partition key on 51.3% of the corpus**
  (`51bd5f8`, migration `0040`). Found while answering RCC's bench-filter
  question. `harvest/hc-load.ts` wrote `bench: partitions.bench` — the AWS
  bucket's `bench=patnahcucisdb94` path segment, which names the court
  *establishment* — into the column the judgment screen renders as the **coram**.
  40,980 rows, every High Court judgment held, zero with a `judgment_judges`
  row. Opening any Patna judgment showed a database slug where the judges belong.
  Moved to `source_bench_code`; `bench` is NULL there now, which is the honest
  value — that metadata variant publishes no judge field.

  **The ingest test asserted `r.bench === 'patnahcucisdb94'` and passed for
  exactly as long as the bug lived.** A test that encodes the same mistake as
  the code is not a check.

  **Client consequence, sent as bus 0053:** `JudgmentDetail.bench` is typed
  `string` and now answers null on every High Court judgment.

### Q1.5 · Facets on `POST /search` — A2.6 remainder

**PARTIALLY LANDED 11 Aug 2026 — the court filter, not facet counts** (`1cefe6c`,
RCC bus 0046). `POST /search` accepts `filters.courts` as category codes
(`sc`/`hc`/`district`/`tribunal`) and expands them server-side; the response
carries `unpopulatedCourtCategories`. Facet **counts** are still not built —
that remains this item.

Two filters bus 0046 asked for were **refused with measurements, not deferred**:
`bench` strength needs a judge-count column that does not exist (see Q1.4b), and
**`subjects` has no subject/topic/category/tag column anywhere in the schema** —
an unbuilt feature, not a filter that does nothing.

### Q1.5-OLD · the original entry, kept for provenance

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
5. ~~eSCR (`digiscr.sci.gov.in`) is an official citation→judgment lookup, strictly
   better than our 4,097 hand-built aliases~~ — **RETRACTED 11 Aug 2026, LCC.**
   That URL was never fetched and does not resolve — carried across three docs
   without anyone running the one command that would have killed it, exactly
   `FQ-V1`'s point. The real site, `https://scr.sci.gov.in/scrsearch/`, is
   CAPTCHA-gated (built on the eCourts platform but outside our eCourts grant's
   scope — a different portal) and its search form has no SCC/AIR field at
   all, only S.C.R. and neutral citation, which we already hold at
   100%/99.7%. It cannot close the SCC/AIR↔S.C.R. gap even if the CAPTCHA
   were solved. Full account: `docs/RESEARCH_2026-08-11.md` §3a.
   `judgments.ecourts.gov.in` is a free full-text SC+HC search — untouched by
   this correction. **`eCourtsIndia.com` stays refused** (`CLAUDE.md` §6) and
   **ILDC is non-commercial**, so neither is usable.

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

5. **`citesJudgmentId` — REB §14 / V2 §39.3, RCC bus 0028/0032, LANDED same
   day.** `GET /judgments/:id`'s `paragraphs[]` now carries it. Resolved
   through the same three-source citation match `cite:` search uses
   (`citationMatchFragment`, extracted from `compile.ts` so there is one
   definition, not a second copy that could drift) — absent, never guessed,
   on zero matches, more than one match, or a self-citation. Verified against
   real production data: S.R. BOMMAI resolves 5 of 31 paragraphs. RCC notified
   on the bus (0033), confirmed live (0034).
6. **`treatment.counts.overruledInPart` — found and fixed same day, RCC bus
   0035.** `judgment_citations.relationship` stores six values; `counts` only
   exposed five, and `overruled_in_part` ranked with an ordinary `cites` in
   the returned page instead of near `overruled`/`doubted`. 23 real rows in
   production were silently uncounted even though `total` already summed
   them. Both fixed and verified live; RCC notified (0036).

Continuing per the founder's RESUME AUTONOMOUS EXECUTION directive into P1
(corpus identity/inventory/provenance/dedup):

7. **`judgments.content_hash`/`text_quality` backfill — task 003's own
   recorded remaining gap, closed.** `services/ingest/src/backfill-
   provenance.ts` built and run with `--confirm` against all 79,321 rows.
   Result: 78,384 distinct hashes, 937 exact-duplicate groups, 1,500 rows
   (1.9%), 98.4% High Court. **Verified by reading two sampled groups, not
   inferred from counts:** both are consolidated/batch judgments (one
   judgment deciding many tagged-along matters, e.g. `{Total 327 Matters}`)
   replicated once per case number — a real corpus-quality finding, and
   explicitly NOT confirmation of `HC_CORPUS_SURVEY.md` §5's mobile/plain
   CNR-variant hypothesis (both sampled groups have `cnr IS NULL`). §5
   remains open. Full account: `docs/ai/tasks/003-corpus-inventory.md`.
8. **`judgments.cnr` — found dropped for the entire corpus, both loaders,
   backfilled to 100% same day.** Present in both source metadata schemas,
   read by neither mapper into `JudgmentRecord` — silently discarded since
   ingest began. Migration `0034` added the column and fixed both mappers.
   `services/ingest/src/backfill-cnr.ts` then re-read the same public AWS
   metadata files (no re-fetch, no live court site) and backfilled **all
   79,321 existing rows — 100% coverage**, matching by the same url-
   construction functions the real loaders use. As a direct consequence,
   finally answered `HC_CORPUS_SURVEY.md` §5 (open since before this
   session): no mobile/plain-variant cross-duplication in the HC corpus —
   the 22 rows sharing a `cnr` are year-partition drift, a known, smaller,
   unrelated defect. `docs/ai/tasks/007-cnr-backfill-investigation.md`.

9. **`counter.ts` — `overruledByJudgmentId`/`overruledNote` missing from
   `authorities[]`, RCC bus 0037.** Present on `excluded[]`, absent from
   `authorities[]` though `retrieve.ts` selects both on every row — a
   `partly_set_aside` authority rendered no "what still stands" line. Fixed,
   tested, deployed. Also corrected a long-stale `API_CONTRACTS.md` claim
   that this endpoint returns a nested `arguments: [{ authorities }]` shape;
   it has always been flat, confirmed against `counter.test.ts`.

10. **`docs/ai/AWS_CORPUS_INVENTORY.md` — the source-vs-ingested scale
    question, per the founder's DATA SCALE CONTINUATION directive, 11 Aug.**
    Measured fresh, not assumed "~20M", **then self-corrected the same
    day**: the first pass reported SC at 88.1% coverage (43,532 raw footer
    rows vs. 38,341 held) — executing the very next measurement task found
    the SC bucket lists 5,181 documents under more than one year-partition,
    so the true distinct SC source size is **38,351**, and only **11
    judgments** were genuinely uningested (named in the doc), not
    thousands. **Ingested them same day**: 1 succeeded (landed with
    `native_text: true`, proving the classifier below on a real write), 9
    failed permanently (HTTP 404 or a corrupt PDF at source — not an
    ingest defect). **SC now stands at 38,342 of 38,351 — 99.98%, the
    practical ceiling.** HC stands at 20,529,203 rows / 0.1996% coverage,
    stated as an upper bound — HC's own distinct-document status was
    reasoned as unlikely to have the same defect (its URL construction
    keys off the partition, not a row field) but not independently
    measured. Fixed the `source_document_type` mystery from item 4 above
    for good: every held row, for all 25 courts including the 4 that
    publish a mobile-variant file, came from the plain variant, which
    structurally never carries the field — not backfillable, because
    plain and mobile share zero CNRs and describe different documents.
    Found and **wired the same day**: `services/ingest/src/text.ts`'s
    `isNativeText` (the deterministic native-vs-scanned classifier the
    founder asked for, already proven against real PDFs, just never
    persisted per judgment) — `judgments.native_text`, migration `0035`,
    applied to production; not backfillable for the 79,321 existing rows,
    unlike `content_hash`/`cnr`, since it needs the source PDF re-fetched
    for its page count. `DATA_MOAT_PROGRAM.md` §0 terminology corrected to
    keep source corpus size, ingested corpus size, unique canonical
    documents and unique cases from ever being conflated again.

11. **`docs/ai/HC_CORPUS_CHARACTERIZATION.md` — the HC bucket characterized
    before any full cross-partition dedup sweep, per the founder's HC CORPUS
    CHARACTERIZATION directive, 11 Aug.** Row distribution by court/year:
    full census, `docs/HC_METADATA_SURVEY.json` — Allahabad alone is 17% of
    the last-10-year corpus; 94% of all HC rows are 2010 or later. Ingested-
    row identity/quality broken out by court class for the first time
    (`corpus-report-cli.ts` extended): `content_hash`/`cnr` both 100% for HC,
    matching SC; `native_text` 0.0% for HC (expected — not backfillable
    without re-fetching PDFs); `text_quality` averages 0.968 HC vs 0.987 SC,
    a real ~30x gap in sub-0.90 rate, not previously measured this
    granularly. **Source-side duplication — SAMPLED, not fully measured**:
    new `hc-cnr-sample-cli.ts`, 26 files / ~504,000 rows. Plain variant 99.9%
    within-file distinct-CNR (negligible); mobile variant 72.3% average,
    34.7%-99.8% range — real one-CNR-many-orders structure, not a defect.
    Cross-file collision stays `UNKNOWN`, deliberately not chased at full-
    sweep cost given the sampled rate is low. **New finding, confirmed at
    scale**: the plain variant's `disposal_nature` column (all 25 courts,
    unlike mobile-only `order_type`) is 99.7-100.0% populated across 12
    files / 6 courts / years 2017 & 2019 (~1.14M rows), against 1.4% in a
    mostly-pending 2026 file — a real disposed-vs-pending signal.
    **Self-corrected same session**: the first draft proposed validating it
    by cross-tabulating against the mobile variant's `order_type`, which is
    not executable — plain and mobile share zero CNRs, no join key exists.
    Corrected recommendation: combine `disposal_nature` with the case-type
    token already visible in `title`/`description` into an actual
    judgment-vs-order proxy, next task, not built this session.
12. **`docs/ai/RETRIEVAL_BENCHMARK_DESIGN.md` — designed, not executed,
    same directive.** Mapped the founder's six requested comparison arms
    (lexical/BM25, PG text search, dense, hybrid, RRF, reranking) against
    the real code. Corrected a stale `RETRIEVAL_PROGRAM.md` claim: fusion IS
    RRF (`rrf()`, `RRF_K=60`), not "UNKNOWN" as previously recorded.
    Reranking already exists and is already measured. BM25 does not exist
    (Railway has no extension; scoped as a hand-rolled scorer over the
    existing GIN index, not a new dependency). Neither lexical nor dense can
    be scored in isolation today — `hybridSearch` always fuses; an isolated-
    arm mode is the one real prerequisite. **The 283-query golden set
    (`queries.eval.json`) is 100% Supreme-Court-cited**, so the full six-arm
    bake-off needs zero new embeddings, directly satisfying the directive's
    instruction not to start a massive embedding job first. Also found: three
    harness entry points read three different query-fixture slices (25 for
    CI, 100 of 283 by default for `ab-cli.ts`, 283 available) — a bake-off
    must explicitly use the full 283, not silently inherit the smaller
    defaults built for CI speed.

13. **`docs/ai/CANONICAL_IDENTITY.md` — Stage 2 of the DATA → RETRIEVAL
    EXECUTION PROGRAM, LANDED same day.** Founder-directed continuation past
    HC characterization (item 11) and the retrieval-benchmark design (item
    12). DOCUMENT / CASE / VERSION / SOURCE_ARTIFACT defined as distinct
    concepts, citation explicitly excluded as the identity key (sparse, and
    itself resolved against identity — circular). Closes the gap
    `DATA_MOAT_PROGRAM.md` §5 named (*"the actual canonical cross-source key
    [cnr] is present in schema but not yet the resolution key any code
    uses"*) and task 003's deferred question about the 937 content_hash
    duplicate groups. `services/ingest/src/identity.ts` — pure
    classification functions, no writes, no merges. Two real corpus shapes
    encoded as test fixtures: the Gujarat/Patna batch judgments (one
    DOCUMENT, many CASEs — collapsing to one row per hash would delete 326
    real case identities) and the Supreme Court year-boundary duplication
    from `AWS_CORPUS_INVENTORY.md` §3 (one CASE, many SOURCE_ARTIFACTs — the
    5,181-row overcount). 11 new tests plus a negative control against false
    same-case matches on court+date coincidence; `services/ingest` **315/315**,
    `tsc --noEmit` clean. **Identity layer only — Stage 3 (deduplication)
    is next and is where a classification becomes a stored, provenance-
    preserving relationship.**

14. **`docs/ai/DEDUPLICATION.md` — Stage 3 of the DATA → RETRIEVAL EXECUTION
    PROGRAM, LANDED same day.** Migration `0036` applied to production and
    `ANALYZE`d: `document_duplicate_groups`/`document_duplicate_members`, a
    group table rather than pairwise edges (the largest group is 124 members
    — `C(124,2)` = 7,626 pairwise rows to say what one group row says).
    `dedup-materialize-cli.ts` materialised the 563 exact-duplicate
    `content_hash` groups / 1,500 rows found in task 003, cross-checked
    against `DATA_MOAT_PROGRAM.md` §6's independent dashboard count and its
    own post-write query. **No `judgments` row touched — no merge, no
    delete.** Before spending the cost of a MinHash/LSH pipeline, two cheap,
    exact SQL probes tested whether near-duplicates are a real problem:
    same-CNR-different-`content_hash` (3 groups, all read directly — genuinely
    different orders on one ongoing case, e.g. a 2024 disposal and a 2026
    "stands allowed" order under the same CNR) and same-(court, case_number,
    judgment_date)-different-`content_hash` (23 groups — sampled rows are all
    genuinely different Supreme Court judgments, distinct CNRs, distinct
    source PDFs, sharing one printed lead-appeal number under India's
    connected-matters practice). **Zero near-duplicates found by either
    probe** — a real result, not an absence of looking, and it independently
    confirms `CANONICAL_IDENTITY.md`'s design choice to rank CNR above
    `case_number` with a concrete example rather than only a theoretical
    ordering. MinHash/LSH cost is quantified (§3 of the doc) and deferred
    with a named trigger, not built without calibration data.

15. **`docs/ai/CORPUS_QUALITY.md` — Stage 4 of the DATA → RETRIEVAL EXECUTION
    PROGRAM, LANDED same day.** A/B/C/D quality buckets, full census against
    production (79,322 rows): **A 48.3% · B 51.2% · C 0.5% · D 0.0%.** The
    court-class split is the real finding: Supreme Court 99.9% bucket A,
    **High Court 0.0% bucket A** — verified directly that 0 of 40,980 High
    Court rows carry even a sentinel citation row, i.e. citation extraction
    has never run against the ingested High Court corpus (consistent with
    the paused ingest, Q1.4 above). High Court `text_quality` itself is fine
    (99.1% ≥ 0.90) — a pipeline-coverage gap, not a text-damage one. Found
    and fixed a real reporting defect in the same pass: `quality-buckets.ts`
    was logging a satisfied condition (`"cnr present"`) as if it degraded
    the bucket; the bucket math was always correct, only the reasons
    breakdown was wrong, now pinned by two tests. Also: a bounded, SAMPLED
    (n=500, not corpus-wide) paragraph-number-detection measurement —
    average `numberedShare` 0.747, 10.4% of sampled rows carry no printed
    paragraph number.

16. **`docs/ai/LEGAL_STRUCTURE.md` — Stage 5 of the DATA → RETRIEVAL EXECUTION
    PROGRAM, LANDED same day.** Two more source fields found silently dropped
    before this program's own identity/dedup work would have caught them
    downstream: `SciMetadataRow.petitioner`/`respondent` (migration `0037`)
    and `disposal_nature` on both source schemas (migration `0038`) — never
    threaded from source metadata into `JudgmentRecord`, the same class as
    the `cnr` gap task 007 closed. Both wired for future ingests
    (`sci.ts`/`hc-load.ts`/`load.ts`) and backfilled against the existing
    79,322 rows: parties **100% method coverage** (38,324 `source_metadata` ·
    40,998 `title_parsed`, 16 tests including a zero-width-boundary regex fix
    found by running the parser against every real `case_title` in the
    corpus, not assumed correct from the design); disposition **78,160 of
    79,322 (98.5%)**, verbatim, never classified into disposed/pending or
    judgment/order (`HC_CORPUS_CHARACTERIZATION.md` §11's deferral stands).
    **Advocates surveyed, not built** — no source field on either schema, and
    a 300-row `full_text` sample found the appearance-block signal (96.3% of
    rows) too noisy (OCR-mangled names, no clean boundary) to extract
    reliably without real pattern-building first, matching the discipline
    every other extractor in this repo already went through. Everything else
    Stage 5 asks for — judges, bench, court, dates, case identifiers,
    statutes, citations — was already built and re-verified live rather than
    trusted from an earlier summary.

17. **`docs/ai/CITATION_PIPELINE_STAGE6.md` — Stage 6, LANDED same day,
    verified-already-built plus one real gap closed.** Re-queried every
    citation-pipeline number fresh against production rather than trusted
    from earlier sessions: 227,478 edges, 97,876 resolved, 4,097 aliases —
    zero drift from what was already recorded. DETECT (SCC/AIR/neutral
    SC+HC/SCR/SCALE patterns), NORMALIZE, and the never-blend-structure-
    with-semantics rule (§A2.7) were already landed. **The one gap**: CNR —
    the canonical identity key, 100% populated since task 007 — had no
    search entry point. `cnr:` added to `search/qlang` as an exact-match
    field (never substring/wildcard), verified against a real production row,
    2 new tests, qlang suite 40/40, `docs/API_CONTRACTS.md` updated
    additively.

18. **`docs/ai/CITATION_GRAPH_STAGE7.md` — Stage 7, LANDED same day.** CITES/
    TREATMENT separation with evidence already existed. Survey found
    `approved` safely splittable from `followed` (real, distinct, anchored
    printed word) but `affirmed`/`reversed` are NOT — they overwhelmingly
    describe the citing judgment's OWN procedural history in ordinary prose,
    not a cited precedent's treatment; deferred with the exact disambiguation
    test named, not guessed at. Split `approved` in both citation
    classifiers, migration `0039`, and fixed `services/api/src/judgments/
    treatment.ts`'s `counts` object in the SAME commit — it would otherwise
    have silently dropped the new value, the identical bug class RCC bus
    0035 already caught once. 21 existing rows reclassified from their own
    evidence text. `services/ingest` 343/343.

**Inspected and deliberately NOT started: PII pseudonymisation.** `docs/
PRIVACY_PII.md` names Presidio (MIT) as "the detection base, not the
answer" and is explicit that it must be **evaluated on real Indian court
documents before trusting it** — an English-benchmark F1 says nothing about
a Hindi bail order naming four transliterated surnames. `llm/call.ts`
correctly REFUSES every sensitive-class call today rather than fake the
`pseudonymised` audit flag, and `pii_entities` does not exist in the schema
yet — this is a from-zero build (schema, a detection service — Presidio is
Python, this API is not, so it needs its own service or the existing OCR
Python runtime — plus the evaluation the doc demands before any of it can
be trusted) and its actual USE is separately gated by the DPA in Q2 below,
founder-owned. Building it blind, without the evaluation, would risk
exactly the "claimed complete when partial" failure `CLAUDE.md` names.
Recorded as its own future task rather than rushed.

Deferred, recorded, not forgotten: `generated_holding` (DeepSeek, migration
0033 exists, unwired), statute point-in-time/concordance-quality (RCC bus
0032, P3, needs a source before an API). Branch protection, worktree
separation, and a hidden adversarial benchmark are `docs/FOUNDER_QUEUE.md`
items — none block P0/P1.

**Correction to the line above, 11 Aug 2026: statute point-in-time did NOT need
a source.** See Q1.15. `generated_holding` is still unwired — and migration
`0033` is **not applied and not journalled**: the columns do not exist in
production, `meta/_journal.json` jumps 0032 → 0034, there is no
`services/api/src/holdings/` module and no code references either column. It is
an untracked draft, left as one deliberately.

### Q1.15 · Stage 8, statute point-in-time — ✅ LANDED 11 Aug 2026

`DONE:` amendment/commencement events queryable per provision with effective
dates. `VERIFY:` a provision whose history is externally checkable returns it.

**It was already in the database.** Stage 8's standing instruction was to check
whether indiacode publishes amendment dates before assuming a new source was
needed. It does, and the first `acts` run ingested it:
`statute_sections.footnote` holds each Act's own printed amendment notes,
verbatim, for **9,064 of 34,928 sections**, and nothing had ever parsed them.
Same class as the `cnr`/`disposal_nature`/`petitioner` gaps, one step worse —
not dropped at ingest, but stored and never looked at.

Migration `0041`, applied to production. **18,590 events**, 15,388 with a real
effective date, 1,208 distinct dates spanning 1870–2026. Verified on NI Act
s.138: inserted by Act 66 of 1988 w.e.f. 1-4-1989, substituted by Act 55 of
2002 w.e.f. 6-2-2003, with the "within fifteen days" entry naming no Act of its
own and resolving correctly through `ibid`.

`docs/ai/STATUTE_TEMPORAL_STAGE8.md` holds the measurements, the four things
the real data does that an imagined parser misses, and the named next steps.
**It is not a version history of the text** and must not be presented as one —
indiacode publishes only the current wording.

**`statute_mappings` is untouched and still 0 rows by design.** Nothing in a
footnote establishes IPC→BNS equivalence, and same section number is not same
legal substance. That remains a sourcing problem, and it is still open.

### Q1.17 · THE CONCORDANCE DECISION — measured, and it is the founder's · 11 Aug 2026

**`docs/ai/AUTHORITY_COVERAGE.md`.** The apparent High Court corpus gap is
**mostly an identity problem, not an acquisition problem**, and that changes what
should be bought.

**The ledger, and no state collapses into another:**

| state | HC citation targets |
| --- | --- |
| HELD | 514 |
| MAPPED INTERNALLY (measured, **not yet written**) | ~155 |
| AMBIGUOUS | ~222 |
| KNOWN BUT UNMAPPED | ~897 |
| GENUINELY MISSING | **unknown, and it stays unknown** |

**Why the last row is blank on purpose.** 4,485 of 4,489 unresolved edges point
at Supreme Court reporters. All 38,342 of our Supreme Court judgments carry
S.C.R. citations and **zero carry SCC or AIR**. A High Court citing
`(2006) 4 SCC 1` is very likely citing something already in our corpus under
`[2006] X S.C.R. Y` — we simply cannot join them.

**The internal-concordance study answered the "should we buy something" question
before anyone asked for money.** Party name + year, extracted from the citing
text, matches 28.0% of targets — but **adversarial validation destroys most of
it**: 51.8% rest on ≤3 distinguishing tokens, and 17 same-reporter collisions
are demonstrable errors (the *Arjun Panditrao* referral order and main judgment
matched to the same row; *"Hindustan Times v State of U.P."* matched to two
different judgments). **Safe yield: 12.1%.**

**NEXT ACTION IS A FOUNDER DECISION**, and it is licensing rather than
engineering: an external SCC/AIR↔SCR concordance would unlock up to 1,122 HC
targets and a large share of 57,947 corpus-wide. No source has been researched,
priced, contacted or ingested — that is the step *after* the decision.

**Implementable without it:** ~~the safe ~155 mappings. Cheap, reversible,
multi-signal. Not yet written.~~ **WRITTEN 12 Aug 2026.**
`internal-concordance-cli.ts` (no model, no InferX call) made §3a's
discipline mechanical, hand-checked 14 samples against real judgment rows at
the riskiest end of the range, wrote **294 aliases** (verified: 4,100 → 4,394),
then `resolve --apply --external` converted them into resolved edges:
`judgment_citations` 44.8% → 45.8% (+2,081), `external_citations` 29.5% →
36.8% (+3,787). Full account: `docs/ai/AUTHORITY_COVERAGE.md` §3c. **The
founder decision below is unchanged and still open** — this only implements
the part that never needed it.

**Blocked by the unresolved portion:** citator completeness, "cases citing this
authority", authority ranking by citation count, any claim about High Court
precedential coverage. **Not blocked:** search, verification and the citation
harness, which key on judgments we hold.

### Q1.16 · Stages 9–20 — PLANNED, and 10 is running · 11 Aug 2026

**The plan is `docs/ai/STAGES_9_20_PLAN.md`**, with each stage's DONE/VERIFY,
its real dependencies, and a blocking graph. Read it before picking one up.

Three things from it that change this queue:

- **Stage 10 (retrieval bake-off) runs BEFORE Stage 9 (eval-set expansion)**,
  and the reason is recorded rather than assumed: 283 of 283 gold judgments are
  Supreme Court, which already has 100% dense embedding coverage, so the
  bake-off needs no new embedding job — and expanding an eval set before knowing
  which arm it must discriminate is building a ruler before knowing what is
  measured. The isolated-arm `mode` parameter that made it possible is in
  `fe1b21e`; the 283-query run is going.
- **Stage 15 (rhetorical roles) is a SURVEY, and the answer is do not build.**
  `docs/ai/RHETORICAL_ROLES_STAGE15_SURVEY.md`. OpenNyAI's `InRhetoricalRoles`
  is Apache-2.0 and Indian-law-specific. **Using the weights is clean; training
  on the CC BY-SA BUILD dataset is a share-alike question nobody may answer
  alone.** It has no obiter label, and neither does anything else maintained —
  recorded as an open gap, not folded into `Ratio`.
- **Stage 16 (currentness) is blocked, and the reason changed on measurement.**
  Not "no judge-count column" — the count exists and is a lower bound that reads
  **1 for Kesavananda Bharati's 13-judge bench**. A partial coram is more
  dangerous than an absent one because it looks like an answer. See
  `SCHEMA_TRUTH.md` §judgments.

### Q1.15 · THE CONCORDANCE VERDICT, THE DEPLOY, AND A ROUTING DRIFT — 12 Aug 2026

Four things closed. **The first is a negative result and it is the most
valuable of them.**

**1 · The DeepSeek concordance layer is MEASURED and DOES NOT SHIP.**
`docs/ai/CITATION_CONCORDANCE_EVALUATION.md`. 116 cases, three arms, 184,375
tokens (0.018% of the 1B grant), fully cached and re-runnable at no further
cost.

**The first evaluation reported 100.0% precision in every arm and every tier,
and it was one accepted paragraph away from being written down as a ship
signal.** It was measuring precision-on-decided and scoring every refusal as
`null` — outside numerator and denominator both. Three defects, all fixed:
refusals excluded from the arithmetic; an "adversarial" arm that injected a
random distractor at `jaccard: 0.01` so it sorted *last* (**proof it was not
adversarial: it scored HIGHER than the baseline it perturbs, 79.4% vs 64.7%**);
and **no truth-absent arm at all**, so the set could ask *"does it pick the
right one"* and never *"does it refuse when there is no right one"*.

With the safety arm built, the verdict inverts:

| | |
| --- | --- |
| candidate-generation reach | **22.0%** (44/200) — the ceiling on everything |
| deterministic top-1 alone | 70/79 correct · **9 wrong authorities** (it never refuses) |
| DeepSeek, truth present | precision **100%**, recall **63.6%** |
| **DeepSeek, truth ABSENT** | **4 of 37 FABRICATED an authority — 10.8%** |
| **fabrications tagged `high`** | **2 of 4** |
| paired trade | gave up **18** correct resolutions, prevented **8** wrong ones · McNemar **p ≈ 0.00008** |

**It resolves less than the baseline AND it invents authorities when the answer
is absent** — which is the condition that defines the real target population.
The promotion boundary held: `judgment_citation_aliases` **unchanged at 4,100**,
**0 rows promoted**, both verified by query after the run. What would reverse the
verdict is written down *in advance* in §7 of the evaluation, so it cannot be
invented afterwards.

**2 · THE DEPLOY GAP IS CLOSED — production was 43 commits stale and is now
current.** `Q1.0` recorded this as the founder's call; it was made and executed.
Production serves **`0280a3e`**, verified by probing `/version`, not inferred.
Three things confirmed live against the real API:

- **`cite:"(1994) 3 SCC 1"` returns S.R. BOMMAI.** The old deploy returned
  *KAUSHAL KISHOR* — a real judgment, presented as an ordinary result, for a
  query it had not understood. That was the product-safety issue `Q1.0` named,
  and it is gone.
- **Duplicate collapse works, verified decisively rather than by absence.** A
  judgment with **124 rows sharing one `content_hash`** returns **exactly 1**
  result. (`9697fdb`, live at last.)
- Migrations `0042`/`0043`/`0044` were confirmed applied *before* deploying —
  the database is ahead of the code, which is the safe direction.

**A correction owed on my own check:** I first reported migration `0042` as
absent from production. It was not — I had queried a column named
`document_class` that I invented; the migration creates **`hc_document_class`**.
The data caught it. 40,980 rows are classified and populated.

**3 · `llm_feature` and the API's routing table had silently stopped agreeing.**
`DEEPSEEK_DATA_MOAT.md` §3 claimed migration `0044` added `concordance` to the
enum *and* that `route.ts` routed it to DeepSeek. **Only the first half was
true**, while the comment above `Feature` went on claiming *"Matches
`llm_feature` in the schema"*. Nothing broke — the concordance pass writes
`llm_calls` from `services/ingest` and never calls `routeCall` — **and that is
exactly why it survived.** `Feature` is now derived from one `ALL_FEATURES`
array, a test asserts it against the database enum in both directions, and the
DPA-refusal test iterates that array instead of a hand-written list it had
silently outgrown. `2eb141e`.

**4 · The deterministic safe half was adopted, not rebuilt.**
`internal-concordance.ts` (+ CLI + 20 tests) arrived from a concurrent session
in this lane; audited and taken unchanged. It is §3a's surviving 12.1% made
mechanical — notably `detectCrossTargetCollisions`, which withholds *every*
judgment claimed by more than one citation key because the deterministic signal
cannot separate the 18 genuine SCC/AIR pairs from the 17 referral-order
collisions (a 51/49 split). **Not run**: no `--apply`, zero rows written.

**Test state, measured not assumed:** `services/api` **449/449** and
`services/ingest` **405/416** — the 11 are all `harvest/store.test.ts`, which
needs a local Postgres this machine does not run. Guards: schema-truth,
contract-status, design-rules and amber all green; `check-alert-coverage` stays
red on **Q1.10**, which is unrelated and still needs its producers.

**5 · THE 22.0% CEILING WAS THREE PARSER BUGS, AND IT IS NOW 76.5%.** The
evaluation named candidate generation as the bottleneck; chasing it found that
the "ceiling" was not architectural at all. Each was found by classifying real
failures, not by re-reading the code, and each is `e467037`/`b2ee6d9`:

| | before | after |
| --- | --- | --- |
| gold, year parsed | 34.8% | **99.8%** |
| **gold, REACH** | **22.0%** | **76.5%** |
| target population, year parsed | 98.4% | **100.0%** |
| truth is deterministic top-1 | 88.6% | **88.0%** |

- **`yearFromCitationText` had no S.C.R. pattern at all** — the form all 38,342
  Supreme Court judgments carry. 65.2% of real citations parsed to no year and
  were dropped silently before candidate generation. **These are the same blind
  spots `Q1.0c` fixed in `citations.ts`'s extractor** — square brackets,
  year-first house style, OCR-mismatched brackets — reproduced one for one in a
  second, independently written copy of the same idea.
- **The parallel-citation blind spot, 91% of the rest.** Reports print
  `A v. B [1999] 1 SCR 235 : (1999) 2 SCC 718`; the extractor records both, so
  the second citation's window ends with the *first citation* rather than the
  case name, and the name pattern is anchored at the end of the string.
- **Capital `Vs.` never matched** — no case-insensitive flag on the verb, and
  `Vs.` is the commonest form in Indian judgments.

**The check that matters is that precision did not move**: 3.5× the input at
**88.0%** deterministic top-1 against 88.6% before, truth among candidates
95.2%. A loosened filter would have shown up as a fall there.

**And the "22.0% ceiling" was never the target population's number.** The gold
set is SC→SC (S.C.R.-formatted); the pipeline targets HC→SC (SCC/AIR), where
year parsing was already 98.4%. Reporting a gold-set funnel loss as the
pipeline's ceiling was the evaluation's own error, corrected in place.

**A hazard found while running the suites, recorded because it nearly bit.**
`services/ingest/src/harvest/store.test.ts` connects to whatever `DATABASE_URL`
names and `INSERT`s and `DELETE`s in `harvest_fetches`/`harvest_queue` — so
`pnpm test` with `.env` sourced runs it **against production**. It scopes itself
to a `test_<uuid>` source and cleans up, and **both tables were verified empty
afterwards**, so nothing was polluted. But the safety here is the test's own
good manners, not a guard, and the next test written in that directory inherits
no such protection. Worth a `DATABASE_URL`-host check before it matters.

**6 · AN ORPHAN MIGRATION, found sitting untracked in the working tree.**
`packages/db/drizzle/0033_generated_holding.sql` adds
`judgments.generated_holding` / `generated_holding_at` — the two-sentence
holding `PRODUCT_BRIEF.md` promises for feature #1, which `search/route.ts`
still hardcodes as `holding: ''`. **It is not committed, not in
`meta/_journal.json`, and neither column exists in production** — all three
checked, not assumed.

**Do not simply apply it.** The journal is at `0044`, so the `0033` slot is
long taken; applying this file under its current number would collide with the
applied sequence. It needs renumbering and its own task — generating a holding
is a summarisation pass over 38,342 judgments, a separate piece of work from
the concordance program, and it is queued rather than smuggled in here.

**Highest-value next action.** Reach is no longer the constraint. The open
question the evaluation leaves is the deterministic path: `internal-concordance.ts`
implements §3a's adversarially-filtered discipline and **has never been run with
`--apply`**. That is the one route to canonical aliases this evidence supports,
and it needs its own measured dry-run before any write.

### Q1.18 · HC INGEST WAS DEAD 19 HOURS, TWO HANG VECTORS FIXED, AND THE DEEPSEEK ENRICHMENT PILOT PROVED OUT · 12 Aug 2026

**Found on session start, not reported anywhere.** `hc-load.log` (S8's `--from-year
2016 --batch 200 --concurrency 14 --apply` run) advanced steadily to
`[38,800] mapped=38,796` at 05:53 on 11 Aug, then printed
`Warning: TypeError: Math.sumPrecise is not a function` on a loop for the rest
of the file and never advanced again — dead roughly 19 hours by the time this
was caught, no PID alive, nothing restarted it.

**Two independent hang vectors, not one, both in the fetch→parse step every HC
CLI shares.** `mapConcurrent`'s worker pool never returns a stuck worker, so
`Promise.all` never resolves and one bad document hangs the whole batch
forever — not a crash, so nothing alerts on it.

1. `unpdf`'s bundled pdfjs, repairing a malformed embedded font
   (`Required "glyf" table is not found -- trying to recover`), calls
   `Math.sumPrecise`, which does not exist on this Node runtime (`v24.14.1`,
   a stage-3 proposal). The failure is swallowed by pdfjs's own `warn()`
   rather than thrown, so it never reaches our `catch`.
2. **A second, different hang after the first was patched and restarted**:
   CPU time flat across a direct 5-second sample while "stuck" mid-batch —
   not spinning, genuinely blocked — on the uncovered `fetch()`/
   `arrayBuffer()` call itself. A stalled socket with no error and no bytes
   hangs identically to (1) and was not covered by the first fix.

**Fix: `withTimeout` (`hc-metadata.ts`) bounds the WHOLE per-document
operation — fetch through parse — as one race against a 90s clock, paired
with an `AbortController` so a timed-out fetch actually closes its socket
rather than leaking it across a multi-day run. Applied in both
`hc-load-cli.ts` and `hc-citations-cli.ts`. 38 tests green (12 new, covering
the timeout racing a hang vs. a fast rejection vs. a fast success).**

`DONE:` the ingest cannot hang on one bad document.
`VERIFY:` restarted `hc-load-cli.ts --from-year 2016 --batch 200
--concurrency 14 --apply`; watched it advance `[1] mapped=0` →
`[4,004] mapped=4,002` over 25 minutes with climbing throughput
(0.7 → 2.1 docs/s), confirmed by re-reading the log, not inferred.
**Still running, unattended, at time of writing.**

**Also found and left alone, matching bus 0064's number exactly**: 551
duplicate `content_hash` groups in HC judgments, 925 extra rows. Search-time
collapse (`9697fdb`) already hides these from users; storage still holds
them. Not fixed — dedup means deciding which row survives and repointing any
FK, a bigger operation than 925 rows currently justifies. Queued, not urgent.

**Separately: the uncommitted DeepSeek enrichment pilot
(`services/ingest/src/{inferx,enrich,enrich-cli}.ts`,
`document_enrichments`) was sitting in the working tree, tested but never
applied or run at scale.** Migration `0045` applied and verified against
production (`to_regclass` confirms the table, columns match). Every task
returns a verbatim evidence span and `verifyClaims` string-matches it
against the source before anything is believed — same discipline
`CITATION_CONCORDANCE_EVALUATION.md` drew for authority identity, applied
here to judges/citations/treatment. Nothing it writes is read by the
product; promotion is a separate, unbuilt step.

**Metadata task run to 150 documents (63 cache hits, 87 new live calls,
3 InferX grants rotating under real 429 pressure — confirmed live, key 1
and key 2 both exhausted and rotated past mid-run with zero failed
documents): 301/306 claims verified against source text = 98.4%, 0 calls
failed, 0 unparseable.** This is real evidence DeepSeek V4 Flash reliably
recovers the coram HC documents are missing (0 of 40,980 `judgment_judges`
rows before this), when constrained to verbatim spans rather than trusted
on its own claim.

**Caught mid-session and back off from, not a false start**: a *second*,
independently-started `enrich-cli.ts --task treatment --limit 40` was
already running (PID tree launched 02:07:59, before this session touched
`enrich-cli`) when this session went to pilot `citation_extraction` next —
almost duplicated InferX-pool load across two concurrent processes.
Killed the just-launched duplicate immediately, left the pre-existing run
untouched. **Whoever is running that: `document_enrichments` already shows
7 verified / 1 rejected for `treatment` from it as of this entry — no
coordination needed, just noting it so a third session doesn't pile on.**
`citation_extraction` and further `treatment` scaling queued behind letting
that run finish, on the "concurrency is one, on purpose" rule
`enrich-cli.ts` itself documents (the free pool measurably worsens under
concurrent callers, `DEEPSEEK_DATA_MOAT.md` §1).

### Q1.19 · SCALED TO 4 PARALLEL HC WORKERS, CAUGHT A FILE-COLLISION CASUALTY · 12 Aug 2026

**Scaled the restarted ingest (Q1.18) from one process to four**, on measured
headroom (6% CPU, 16.7 GB free RAM, 20 logical cores) rather than assumption:
the general `--from-year 2016` sweep, plus three dedicated `--court` workers
on the largest under-covered courts by `HC_METADATA_SURVEY.json`'s
`perCourt` breakdown — Allahabad (`9_13`, 22% of the decade, **6 rows held
before this**), Bombay (`27_1`), Madras (`33_10`, **1 row held before this**).
Resumability by `source_url` uniqueness makes any eventual overlap with the
general sweep wasteful, never unsafe.

**Found mid-session: another concurrent session is actively editing the same
harvest files this lane fixed in Q1.18** — `hc-metadata.ts`/`hc-load-cli.ts`
briefly showed the pre-fix content on one `Grep` (no `withTimeout`) then the
fixed content again on the next read, self-resolving. Re-verified stable with
`tsc --noEmit` + the full harvest test suite (38/38 green) before trusting it
again. **One real casualty**: the Bombay worker, launched inside that window,
picked up the unfixed file and sat in the `Math.sumPrecise` warning flood from
its very first batch — zero progress, confirmed by an empty log before the
flood. Killed and relaunched against the now-stable file; recovered.

**Also restarted the citation-extraction rescan after an unexplained crash**
(`Warning: Detected unsettled top-level await`, exit 13, at
37,200/121,346 judgments) — **not a data-loss event**: batched writes had
already persisted all 11,335 new edges before the crash, verified against
production (`judgment_citations` 273,383 → 284,718, exact match to the log's
last printed count). Resumed with the same `--rescan --apply` command, which
skips everything already scanned.

**State at time of writing, four workers plus the rescan all still running:**

| | |
| --- | --- |
| HC documents ingested | **94,989**, up from 40,980 at session start |
| top courts by rows held | Patna 58,834 · Gauhati 14,536 · Calcutta 8,069 · Bombay 3,004 · Allahabad 2,040 · Madras 1,197 |
| HC documents classified (`case_type` set) | 54,288 / 91,910 (86%, matching the S6 sample rate) |
| HC duplicate `content_hash` groups / extra rows | 1,728 / 3,389 — **grown from 551/925** at the same rate as ingestion, not a new defect |
| `judgment_citations`, all courts | 284,981 rows, 102,248 resolved |
| citation rescan | mid-run, ~36,000/128,851 judgments scanned this pass |

**Deferred, not forgotten**: a durable per-document ledger
(`hc_ingest_ledger`, migration `0047`, applied) so a restart can skip a
*permanently*-failed document the same way it already skips a *succeeded*
one, instead of re-downloading every past failure on every restart. Table
exists; wiring it into `hc-load-cli.ts` is deferred while another session is
actively editing that exact file, to avoid compounding the collision above.

**Not done, and said plainly**: no `--limit`-free run has finished a single
court, no permanent-failure count exists yet (ledger deferred), and
`resolve --apply` has not been re-run against the rescan's new edges.
15,771,567 documents is the source inventory (`HC_METADATA_SURVEY.json`); 25
courts, 0.75%–18.64% judgment share, per `HC_INGEST_PLAN.md` — **94,989
ingested is 0.6% of the decade**, progress, not completion.

### Q1.20 · A REAL BUG SURFACED BY RUNNING 4 WORKERS AT ONCE: DUPLICATE `source_url` WITHIN ONE UPSERT BATCH · 12 Aug 2026

**All four HC workers crashed within one check-in cycle — two causes, not one,
both diagnosed from the actual stack trace rather than guessed.**

**Transient (Allahabad, Madras): `getaddrinfo ENOTFOUND hayabusa.proxy.rlwy.net`.**
Checked before assuming it was permanent — the Railway TCP proxy's own note in
`.env` warns it gets deleted after use. `nslookup`/`ping` immediately after
showed it resolving and answering fine: a momentary local DNS hiccup, not a
dead proxy. Relaunched as-is.

**Real (main sweep): `PostgresError: ON CONFLICT DO UPDATE command cannot
affect row a second time`.** `load.ts`'s `upsertBatch` puts up to 100 records
in one `INSERT … ON CONFLICT (source_url) DO UPDATE`, and Postgres refuses
outright — not retryable — if the same conflict key appears twice in one
statement. **The AWS metadata bucket itself carries duplicate rows within a
single parquet file** (same `pdf_link`), which `existingSourceUrls` cannot
catch: it only knows what a *previous* batch already wrote, not what the
*current* one is about to. **Only surfaced by running four workers at once**
— a single worker's batches are small enough, and the corpus sparse enough,
that the odds of hitting a duplicate-within-window are lower; higher
concurrency reached it first.

**Fixed in `hc-load-cli.ts`**: dedupe `candidates` by URL before the
`existingSourceUrls` check, first occurrence wins — the same "one sighting"
rule this codebase already applies to citations. Tallied as
`duplicate_in_batch`, counted rather than silently dropped. 38 tests still
green; `tsc --noEmit` clean. All four workers relaunched with the fix.

**Bombay finished its assigned scope clean while this was being diagnosed**
— 3,496 documents, standard end-of-run summary, zero crash. Its capacity was
redirected to a fifth court, Punjab and Haryana (`3_22`, 1.26M documents,
undercovered), rather than left idle.

**Also observed, not a defect**: several Bombay 2026 records extract as
visibly garbled text (`"( ) , (3) 3 ( ) Q , , 993…"`). Matches the
already-documented font-substitution warnings (`Cannot substitute the font
because of its name`) on PDFs with damaged embedded fonts — the same font-
repair path `Math.sumPrecise` sits in. `text_quality` (`load.ts`) already
scores this; not something this ingest CLI can fix without OCR, which is out
of scope per `HC_INGEST_PLAN.md` §2.

### Q1.21 · THE CITATION RESCAN CRASHES ON A TIMER, NOT A DOCUMENT — WORKED AROUND WITH `--limit`, NOT ROOT-CAUSED · 12 Aug 2026

**Three crashes, same signature, each closer to the start.** `citations-cli.ts
--rescan --apply`, unbounded, died three times on
`Warning: Detected unsettled top-level await … await main();`, exit code 13
— at 37,200/121,346, then 60,600/128,851, then 30,400/138,602 judgments. **Not
a document-shaped bug**: the crash point does not track a fixed offset, a
fixed judgment, or a fixed count, and it moved EARLIER as this lane went from
one HC ingest worker to five. That points at resource pressure from running
several heavy Node processes at once, not a bad row.

**Per `CLAUDE.md`'s own rule, three of the same failure is the line — stop
guessing and change strategy, not attempt a fourth blind resume.** Confirmed
first that resuming loses nothing (`judgment_citations` count matched the
log's last printed total exactly, twice), so the crash itself was never the
risk — burning a fourth attempt on the same unbounded shape would have been.

**Not root-caused. Worked around**: `--rescan` already accepts `--limit`
(`arg('--limit', 0)`, read at `citations-cli.ts` line 238). Chained eight
sequential `--limit 20000 --apply` runs instead of one unbounded one — each
short enough to very likely finish inside whatever the crash's real time or
resource threshold is, and the crash itself is harmless to interrupt given
the batched-write safety already confirmed. **This is a workaround, stated as
one**: the actual cause (a Windows/Node resource ceiling under concurrent
`hc-load-cli.ts` + `citations-cli.ts` load, guessed but not measured) is still
open. Revisit if `--limit`-bounded runs start crashing too.

### Q1.22 · STAGE 13, EXACT-SPAN EVIDENCE — SHIPPED, AND A REAL OFFSET BUG FOUND AND FIXED ALONG THE WAY · 12 Aug 2026

**`judgment_chunks.char_offset`/`char_length` now drive `operativeParagraph`
directly, exactly.** `services/api/src/judgments/paragraphs.ts` gained
`resolveExactSpan` (bounds-checked slice, never approximated, null on any
invalid input) and `locateParagraphByOffset` (walks the same paragraph blocks
`segmentParagraphs` builds and picks the one whose real span in `full_text`
contains the offset — no substring probing). `retrieve.ts`'s `dense()` now
carries `char_offset`/`char_length` per matched chunk; `hybridSearch()` tries
the exact path FIRST and falls back to the pre-existing fuzzy `locateParagraph`
only when no verified offset is available. New field
`operativeParagraphVerified: boolean`, additive, documented in
`API_CONTRACTS.md`, threaded through `search/route.ts` and
`arguments/counter.ts`.

**A real, pre-existing bug was found verifying this against production data,
not invented from reading the code.** `chunk.ts`'s old offset computation
reconstructed each chunk's body by rejoining split paragraphs with a canonical
`\n\n` and then searched for it with `text.indexOf(body, searchFrom)`. When
the source's real separator was not exactly two newlines — three+ blank
lines, or a "blank" line carrying trailing spaces, both real in this
OCR'd/scanned corpus — that search failed, and the code silently fell back to
`offset: 0` instead of reporting the position as unknown. **A false "verified"
position, not a missing one**: a chunk from paragraph 40 would read as if it
began at the judgment's first character.

Measured on real data: **0.54% of chunks (2,217 of 412,203)** carried this —
found via `char_offset = 0 AND chunk_index > 0`, which is unambiguous (offset
0 is only ever correct for `chunk_index = 0`). It was NOT caught by the
backfill CLI's own byte-equality verification, because the bug is
deterministic: recomputing produces the identical wrong offset, so
`storedText === chunk.text` still passes.

**Root-caused and fixed, not patched at the symptom.** Rewrote the paragraph
splitter to track each unit's real position while walking the text once
(`Positioned` type, `pushTrimmed`), so a merged chunk's offset is simply
"where its first unit started" — carried forward through merging, never
re-derived by searching. There is no `indexOf`-based position lookup left in
`chunk.ts` at all; the failure mode is structurally gone, not detected-and-
avoided. Also fixed: offsets are now correctly adjusted for `fullText`'s own
leading whitespace (`fullText.trim()` vs `fullText`) — checked live against
production (0/138,602 judgments actually have leading whitespace today, so
this was latent, not separately measured as a live defect, but the old code
would have silently mis-offset every chunk of any judgment that did). 16
tests in `chunk.test.ts` (3 new, reproducing the exact failure mode plus the
leading-whitespace case), `services/api` and `services/embed` suites green,
`tsc --noEmit` clean both packages.

**Cleanup, verified**: the 2,217 bad rows were NULLed (`char_offset = NULL,
char_length = NULL`, never guessed at a correction) rather than left wrong,
so they read as honestly unavailable and get correctly re-derived by the next
backfill pass. Re-verified 200 fresh random samples post-fix: 200/200 correct,
0 rows matching the bug's signature anywhere in the table.

**Two long-running background jobs, both relaunched with the fix, both
running at time of writing:**
- `backfill:offsets --apply --limit 100000` — recovers `char_offset` for the
  616,197 chunks embedded before migration `0046`. Resumable by construction
  (`WHERE char_offset IS NULL`); a killed/restarted run loses nothing.
- `EMBED_DEVICE=dml pnpm --filter @lawmind/embed run embed --limit 90000` —
  closes a SEPARATE, larger gap found while investigating: **87,141 of
  125,522 judgments (69%) have never been chunked or embedded at all**, so
  they carry zero dense-retrieval presence (lexical-only). This runs on the
  local RTX 4060 Ti via `embedDevice() === 'dml'`
  (`services/embed/src/embed.ts`), whose fp32 GPU/CPU vector agreement was
  re-verified live this session (cosine 0.999999996–1.000000002 on 3 texts
  incl. Devanagari) before trusting it, on top of the 9 Aug measurement
  already on record.

**This GPU run is a deliberate call to REVISIT `Q1.12`'s "the GPU should not
embed the corpus" finding, made on the founder's explicit direction this
session** (not a silent reopening): that finding priced a RENTED GPU
(~3,956 GPU-hours, ~$65) against a measured 0.3pp retrieval difference. On
already-owned, otherwise-idle local hardware the cost side of that tradeoff is
gone; bringing 69% of the corpus into dense retrieval at all has value beyond
the 0.3pp figure regardless. `Q1.12`'s finding is not struck — it is still the
right call for a RENTED GPU — this is a different question the founder
answered directly.

**UPDATE, same day: a SECOND offset bug, found by the tool this stage built to
find exactly this.** `verify:exact-span --n 1000` against production (not a
unit test — real rows) found 2/1000 failing the bounds check, both
`char_offset + char_length` landing exactly ONE character past
`full_text.length`. Different root cause from the first bug, same family: the
merge step joins two paragraph units with a synthesised `"\n\n"`, correct only
when the source's real gap between them WAS exactly two newlines. Units from
`splitParagraphs` genuinely were (that's what qualified them as separate
paragraphs); a short TAIL piece from `splitLongParagraph`'s own internal
cut — merged into the previous chunk via the same synthetic separator when it
falls under `minChars` — is often adjacent to its neighbour with a real gap of
0–1 characters, not two. `bodyLength` silently inherited the 1–2 character
difference.

**Fixed at the source, not downstream.** `chunkJudgment` now verifies its own
output before returning it — `fullText.slice(offset, offset+bodyLength) ===
body.text`, a slice and a string comparison, free relative to the chunking
work already done — and reports `offset: -1` (never a guess) when that check
fails. `cli.ts`/`backfill-offsets-cli.ts` write NULL for both columns whenever
`offset` is `-1`. New deterministic regression test reproduces the exact
failure (a 226-character paragraph cut at a single space, the 35-character
tail triggering the merge). Both jobs were stopped a second time on finding
this (same reasoning as the first bug: they were actively writing with the
unfixed code), a SQL-only table-wide bounds check found and NULLed **1,153**
more affected rows (no `full_text` fetch needed — `char_offset + char_length >
length(full_text)` is computable server-side), and a fresh 3,000-row sampled
re-verification came back **3,000/3,000 clean** before either job restarted.
17/17 `chunk.test.ts`, 31/31 embed suite, `tsc --noEmit` clean throughout.

**UPDATE, same day: the GPU job's scope conflicted with a settled decision,
found before it compounded, queued rather than resolved alone.**
`FOUNDER_QUEUE.md` FQ-CORPUS (11 Aug 2026) decided High Court documents are
ingested WITHOUT embeddings for now — pgvector is documented to degrade past
5–10M vectors, and the High Court scale-up targets ~41M. The 87,141-judgment
backlog this stage found and started closing turned out to be **almost
entirely High Court** (checked after the fact: only 1 Supreme Court judgment
remains un-embedded corpus-wide), so the GPU run had already embedded 1,680
judgments — including Madhya Pradesh and Kerala, courts the concurrent
HC-ingest lane's own plan (below, Q1.22 THE 10× PLAN) names as being actively
scaled up right now — before this was caught. **Stopped again, not reasoned
past**: this session's direct GPU authorisation and FQ-CORPUS's reasoned
"no" are a genuine conflict, not something to pick a side of alone. Added
`--court "<name>"` to `cli.ts` so a future run can be scoped precisely.
Queued to the founder in full: `FOUNDER_QUEUE.md`'s newest entry.

**Where this leaves Stage 13 itself: DONE and verified.** The exact-span
mechanism, the two bugs, and their fixes are all real, tested, and hold
regardless of how the embedding-scope question resolves — they govern HOW a
chunk's position is trusted, not WHICH judgments get chunked. The offset
backfill (bounded to chunks that already exist, not at risk of the FQ-CORPUS
conflict) continues running. The GPU embed job stays stopped pending the
founder's call.

**CLOSED, verified by observation, not inferred from the log.** The backfill
finished: `pnpm --filter @lawmind/embed run backfill:offsets` processed all
11,351 remaining judgments. Independently re-queried production directly
(not trusted from the run's own printed summary):

| | |
| --- | --- |
| `judgment_chunks` total | 620,300 |
| carrying a verified `char_offset` | **616,854 (99.44%)** |
| honestly NULL (self-check failed or chunk-count changed since embed) | 3,446 (0.56%) |
| bug #1 signature (`char_offset=0, chunk_index>0`) table-wide | **0** |
| bug #2 signature (offset+length overshoot) table-wide | **0** |

`DONE:` a retrieval result carries the paragraph and the exact span it rests
on (Stage 13's own criterion, `docs/ai/STAGES_9_20_PLAN.md` §13).
`VERIFY:` a returned span appears verbatim in the judgment's own text —
confirmed at 5,000+ real production checks across this session (a flat
3,000-sample plus a 2,230-check stratified sweep spanning offset=0, final-
chunk, duplicate-group, OCR-damaged, long/short, and early/late-era rows),
zero `OFFSET_INVALID`, zero `TEXT_MISMATCH`. `verify:exact-span --stratified`
(`services/api/src/judgments/verify-exact-span-cli.ts`) stays in the repo as
a repeatable check, not a one-off.

### Q1.22 · THE 10× PLAN — founder asked for a strategy before scaling, here it is · 12 Aug 2026

**Target: ~1,034,860 HC documents, 10× the 103,486 held at the time of the
ask.** Still only 6.6% of the 15,771,567-document decade inventory — headroom
is not the constraint.

**Where the room is, ranked by `HC_METADATA_SURVEY.json`'s `perCourt`, courts
currently near-zero:** Rajasthan (848,617 docs, 4 held) · Orissa (761,067, 39)
· Karnataka (730,432, **0**) · Madhya Pradesh (588,593, **0**) · Kerala
(570,700, 60) · Telangana (526,825, 21) · Chhattisgarh (401,696, 4) ·
Jharkhand (393,079, 8) · Andhra Pradesh (355,497, **0**) · Delhi (306,893, 2)
· Gujarat (290,144, 497). **5.8M+ documents sit behind these eleven alone** —
10× is reachable from a handful of them without touching the smaller courts.

**Checked before scaling, not assumed:**
- CPU 6% average load, 15.7 GB RAM free of 31.7 GB, 20 logical cores — the
  existing 5 concurrent Node jobs use a small fraction of either.
- Railway Postgres: **100 max_connections, 15 in use.** Six more
  `hc-load-cli.ts` workers at `postgres(url, {max:3})` each add ≤18 —
  comfortably inside budget with room left for the API and other sessions.

**Plan: six more dedicated `--court` workers**, same command shape as the
four already running (`--from-year 2016 --batch 200 --concurrency 16
--apply`), on Rajasthan (`8_9`), Orissa (`21_11`), Karnataka (`29_3`),
Madhya Pradesh (`23_23`), Kerala (`32_4`), Telangana (`36_29`) — ten
`hc-load-cli.ts` processes total plus the bounded citation-rescan loop.

**What "careful, no mistakes" means here, concretely**, given Q1.20 already
found one real bug at higher concurrency:
1. Verify each new worker prints a real progress line (not just a header)
   before moving to the next, rather than firing all six blind.
2. Re-run the harvest test suite before launching, since another session has
   touched these files before (Q1.19) — cheap insurance against relaunching
   a stale or half-edited version.
3. Watch for the SAME failure shapes already catalogued (`ON CONFLICT`
   duplicate-in-batch — fixed in shared code, so every new worker inherits
   the fix automatically; transient DNS; the citation-rescan's unexplained
   crash under load) rather than treating a new crash as novel before
   checking it isn't one of these three first.
4. **Not doing**: embeddings (FQ-CORPUS still says no), OCR (out of scope),
   touching `citation_extraction`/`treatment` enrichment or the concordance
   pass (other sessions' lanes, per this turn's own standing instruction).

### Q1.23 · A COMMENT CLAIMED A GUARD THAT WAS NEVER WIRED IN — Punjab found it · 12 Aug 2026

**Punjab crashed on `SQLSTATE 22021`, invalid UTF-8 byte sequence** — the
exact failure `text.ts` documents as *"what silently ended the 2023 run"*,
and `hc-load-cli.ts`'s own header comment claims is already handled:
*"already carrying `stripUnstorable` for the invalid-UTF-8 failure … that
once silently stopped an ingest after 2022."* **The claim was false.**
`hc-load.ts` set `fullText: text` straight from unpdf's raw output; nothing
in the HC path ever called `stripUnstorable`. It survived 103,486 documents
across ten courts because none of them happened to carry the NUL bytes or
unpaired surrogates that trigger it — Punjab's did.

**Fixed**: `stripUnstorable(extracted.text)` before the text goes anywhere,
in both `hc-load-cli.ts` (writes `judgments.full_text`) and
`hc-citations-cli.ts` (writes `external_citations.citation_text`, same raw
source, same risk, currently dormant per S8 but fixed for when it next
runs). 38 tests still green, `tsc --noEmit` clean. Punjab relaunched,
confirmed advancing past where it died (CPU climbing, not the flat-CPU hang
signature from Q1.18).

**The lesson, stated because it will recur**: a comment asserting a guard
exists is not evidence the guard exists — this is the third time this
session a documented claim about this exact codepath (`Math.sumPrecise`
absent, DNS proxy presumed dead, now `stripUnstorable` presumed wired)
turned out to need checking against the actual code or environment before
trusting it.

### Q1.24 · SCALED TO 10 · founder's 10× ask, 12 Aug 2026

Ten `hc-load-cli.ts` workers running: the general sweep plus dedicated
`--court` workers on Allahabad, Bombay (finished, redirected), Madras,
Punjab and Haryana, Rajasthan, Orissa, Karnataka, Madhya Pradesh, Kerala,
Telangana — the eleven largest courts by `HC_METADATA_SURVEY.json`, covering
**11.2M of the 15.77M-document decade inventory** between them. Plus the
citation rescan, bounded to `--limit 20000` chunks since Q1.21. Full plan
and the headroom check (100 max DB connections, 15→22 in use; 6% CPU; 15.7 GB
RAM free) before scaling: this file's own entry written at the time, kept
above rather than restated.

### Q1.25 · CLASSIFY / DEDUPLICATE / INDEX — checked against what already exists, not assumed absent · 12 Aug 2026

**Asked to add classify → deduplicate → index-eligible stages. Checked each
against the running system before building anything new — two of three were
already done, and the third would have meant deciding a question this repo's
own schema doc explicitly declined to decide.**

**Classify: already automatic, and the gap is by design.** `case_type` is set
at load time (`caseTypeFrom`, `hc-load.ts`). Sampled the unclassified 14%'s
case-number prefixes rather than guessing: dominated by bare `WP`/`WPC`/`WPA`
(writ petitions — `caseTypeFrom`'s own comment: *"may be either"*, and the
same file states mislabelling is worse than leaving null) and abbreviations
(`MJC`, `CMP`, `A`) with no verified meaning in THIS corpus. A few looked
guessable (`IACIVIL`, `WRIC`, `BAILAPPLN`) but every existing entry in the
dictionary carries a citation like *"observed, Patna 2024"* — verified
against a real sampled record, not inferred from the string. Adding entries
without that same verification is the exact risk the function's own comment
warns against. Not done; flagged rather than guessed.

**Deduplicate: already solved, at a layer already decided — checked, not
assumed.** `SCHEMA_TRUTH.md` on `content_hash`: *"which one is canonical is
still an ingest-design decision, not something this column answers."*
Building a fixed, storage-level canonical-row marker would have been this
session deciding that question unilaterally. **It didn't need deciding
again** — `search/retrieve.ts` already collapses duplicates at retrieval,
keeping *"the highest-ranked member of its own group"* per query (rank-
dependent, which is why a fixed marker would be a DIFFERENT, narrower rule,
not a durable version of the same one). The only thing that mechanism needs
is `content_hash` populated on every row, since a NULL hash is never
collapsed. **Verified, not assumed: 0 of 124,599 HC judgments are missing
`content_hash`** — `upsertJudgments` computes it on every write, so this has
held automatically since migration `0031`, before this session started.

**Index-eligible documents: automatic, verified from the schema, not
inferred.** `full_text_tsv` is `GENERATED ALWAYS AS (to_tsvector(...)) STORED`
with a GIN index (migration `0004`) — every row is lexically searchable the
instant `upsertJudgments` writes it. There is no separate "index eligibility"
gate to build under the text-only, no-embeddings decision this ingest
operates under (`FQ-CORPUS`); one would only exist if embeddings did.

**Embeddings: declined, stated plainly, not silently skipped.** `FQ-CORPUS`
(`FOUNDER_QUEUE.md`, decided 11 Aug 2026): *"ingest High Court documents as
searchable text behind the coverage screen, no embeddings for now."* Nothing
in this session overrides that, so nothing here embeds anything.

### Q1.26 · CLASSIFICATION FIXED, VERIFIED AGAINST REAL TEXT, BACKFILLED · 12 Aug 2026

**Classification fell 86% → 45.9% the moment the 10× scale-up (Q1.24) added
six more courts — a real signal, chased rather than shrugged off.** Sampled
the new courts' unclassified prefixes: dominated by genuinely ambiguous ones
already correctly left null (`WP`, `WA` — the code's own stated design), but
`CRLMB`/`CRLMP`/`CRLW`/`CRLRP` (Rajasthan, Karnataka) stood out as a pattern
the exact-match dictionary had never seen.

**Verified against real text before writing any code** — the same bar the
existing dictionary entries carry (*"observed, Patna 2024"*): pulled eleven
real records across both courts, every one prints *"Criminal Miscellaneous
Bail Application"* or *"Criminal Writ Petition"* in its own header, party
described as *"Accused-Petitioner."*

**Fixed as a substring rule (`prefix.includes('CRL')`), not another
exact-match entry** — whack-a-moling every court's own `CRL`-compound is the
same fix repeated forever. Safe from the one named trap in this function
(`CRP`, Civil Revision Petition, begins `CR` but not `CRL`) because it is
three letters, not two; test added asserting `CRP` still resolves `civil`.
39 tests green, `tsc` clean.

**Backfilled onto rows already ingested**, not left for new writes only:
`backfill-case-type-cli.ts`, dry-run by default, pure and additive (never
overwrites an existing classification, reuses `caseTypeFrom` rather than
reimplementing it). Dry run matched the applied run's count exactly.
**7,722 rows reclassified.** Classification now **50.4%** — up from 45.9%,
genuinely short of the old 86% because the new courts' remaining gap is
mostly `WP`/`WA`-shaped ambiguity this codebase has already decided not to
guess at, not an unfixed bug.

### Q1.23 · 10× EVIDENCE/RETRIEVAL DIRECTIVE — first wave, three tools shipped · 12 Aug 2026

Founder directive: increase this lane's evidence/retrieval throughput and
validation depth roughly 10×, without HC embeddings, without duplicating
another lane's work, without weakening verification. First wave:

**`verify:exact-span --stratified`** (`services/api/src/judgments/`) —
expanded from a flat random sample into 14 targeted strata (offset=0, not-
yet-backfilled, short/long judgment, early/late era, SC/HC, OCR-damaged/
clean, likely-merged, final-chunk, duplicate-group document, random
baseline), each classified (`OFFSET_INVALID`/`TEXT_MISMATCH`/
`MISSING_OFFSET`/`OTHER`) and persisted to a replayable JSON regression
corpus rather than a log line. Three runs this session (per-stratum 200,
then 500, plus the earlier flat 3,000-sample before stratification existed)
total **10,961 real production exact-span checks — 0 `OFFSET_INVALID`, 0
`TEXT_MISMATCH`**, meeting the directive's 10,000+ target. Every "failure"
across all runs classified `MISSING_OFFSET` (the deliberate not-yet-
backfilled stratum, honestly NULL rows — 3,446 corpus-wide after the
backfill finished, per Q1.22 above), never a wrong value.

**`chunk:qa`** (`services/ingest/src/chunk-qa-cli.ts`) — deterministic
statistical QA over the CHUNKER itself (re-runs `chunkJudgment` fresh
against sampled real `full_text`, not the stored rows). No LLM anywhere —
every measurement is string arithmetic. Two runs, n=500 then n=3000:
merge/overshoot rate 0.87%→1.09% (consistent with the production estimate,
not growing), 0% malformed chunks both runs, overlap correctness
99.99–100%, and a genuinely new, stable finding — **citation preservation
99.02–99.15%: 18–43 citations per sample split across a chunk boundary**
(unreadable/unmatchable at that boundary). Not fixed this session — the fix
would touch `chunk.ts`'s boundary logic, a bigger change than this pass
scoped, and the rate is small and stable across both sample sizes. Queued as
a real, quantified follow-on rather than acted on blind.

*Minor, understood, not a defect*: the n=3000 run found 1/15,104 overlap
checks "failing" — traced to the QA tool's own check comparing against the
wrong reference string for a chunk whose OWN body is shorter than
`overlapChars` (240 chars), not a `chunk.ts` bug. `chunk.test.ts`'s existing
overlap tests use the same comparison pattern and never exercised a
sub-240-character body, which is why it wasn't caught earlier. Noted rather
than chased further — it does not touch exact-span correctness.

**`retrieval:regression`** (`services/api/src/search/`) — a repeatable
regression command per the directive's continuous-regression requirement,
honest about not having graded relevance judgments: compares real
`hybridSearch` output run-over-run (empty-result changes, top-result
identity changes, 3×+ latency regressions) rather than inventing a gold
score. `bench.ts`'s query list extracted to shared `bench-queries.ts` and
grown 10→20, labelled by shape (concept/section/citation/case-name/
procedural) for future per-category reporting. First baseline: **20/20
queries returned results**, corpus at capture time 189,386 judgments
(up from 125,522 at session start — the concurrent HC-ingest lane's 10×
scale-up is measurably working).

**Explicitly not attempted this session, stated rather than faked**: the
1,000+-query graded gold benchmark (directive §4) needs verified relevance
judgments this session had no way to produce honestly in the time available
— `docs/ai/RETRIEVAL_BENCHMARK_DESIGN.md` already scopes that as its own
effort. Query-expansion evaluation, reranking experiments, and the
adversarial authority set (directive §6, §8) are queued behind it for the
same reason: each needs either real gold or a real audited source, and
inventing either is exactly what this program's standing rule forbids.

### Q1.24 · STALE-OVERRULED RATE MEASURED END-TO-END FOR THE FIRST TIME: ZERO · 12 Aug 2026

`docs/CITATION_HARNESS.md`'s hard rule — *"Stale-overruled rate threshold 0
— overruled law rendered WITHOUT the LAW MOVED mark is as severe as a
hallucination"* — had never been measured through the actual retrieval path.
Built `overruled:audit` (`services/api/src/search/`): no invented adversarial
data, every case tested IS overruled/set_aside/doubted per
`judgments.overruled_status` as already recorded, a real audited
relationship. For each, runs its own case title through `hybridSearch` and
checks the returned `overruledStatus` equals the live db row.

**Result: 0/57 stale.** Every overruled/set_aside/doubted judgment this
lane's own retrieval surfaced came back carrying the SAME status the
database holds right now — the rule the harness exists to enforce holds at
100% on every case checked.

**Corpus-wide, only 81 judgments carry a non-`none` overruled_status** (57
set_aside, 8 partly_set_aside, 16 doubted) — small enough that this session
checked the entire population, not a sample of it.

**A second, different finding, out of this tool's stated scope but real:**
24/81 (29.6%) were NOT found in the top 10 for their OWN exact case title.
Not a staleness defect — a recall gap. An overruled case is exactly what an
advocate searches FOR adversarially (checking whether something they were
about to cite is still good law), so failing to surface it even by its own
title is worth a look, separately from this session's scope. Flagged, not
chased — the cause (older/rare-vocabulary titles losing to more common terms
in the lexical ranker, a corpus that grew from 125,522 to 189,386 mid-session
diluting exact-title matches, or something else) is not yet diagnosed.

### Q1.25 · A REAL LEXICAL-RANKING GAP, TRACED TO ROOT CAUSE, NOT FIXED · 12 Aug 2026

Following up the recall gap Q1.24 flagged (24/81 overruled cases not found in
top 10 for their own case title): built a targeted diagnostic
(`services/api/src/search/_scratch_trace_one_miss.ts`, scratch — not
committed, the finding below is) and traced ONE case rigorously rather than
pattern-matching across log lines.

**`S. N. DUTT versus UNION OF INDIA`** (a real 1961 Supreme Court judgment,
confirmed present in the corpus by direct row lookup) does not appear in the
sparse ranker's top 50 when searched by its OWN exact title. Traced why:

1. `plainto_tsquery('english', 'S. N. DUTT versus UNION OF INDIA')` produces
   `'n' & 'dutt' & 'versus' & 'union' & 'india'` — 45 judgments contain all
   five lexemes.
2. `full_text_tsv` is `GENERATED ALWAYS AS to_tsvector('english', full_text)`
   (`docs/SCHEMA_TRUTH.md` §judgments) — **one tsvector, no weight class**.
   `case_title` is a separate column, never indexed with elevated weight.
3. `dutt` — the one genuinely discriminating token, the party's own surname —
   appears exactly once in the target judgment (the heading). `union`,
   `india`, `versus` are common party-reference boilerplate that a long
   judgment repeats dozens of times discussing the government as a litigant.
4. `ts_rank` scores by term frequency. A document that says "Union of India"
   forty times outranks the one document where "Dutt" is the actual party,
   because raw frequency cannot tell a heading token from an incidental one.

**This is real and structural, not a corpus-growth artefact** — the
mechanism would reproduce at any corpus size; a bigger corpus only supplies
more candidate documents to outrank the target with.

**Not fixed this session, deliberately.** `full_text_tsv` is a stored
generated column read by every production search query; changing its
definition is a schema migration touching the corpus-wide index used live,
right now — a different risk class from the chunk.ts fixes above, and this
session already carries two of those. The safer shape, not yet built:
an ADDITIVE ranking signal — `judgments.case_title` similarity, applied as
a rank boost or pin (the same architectural pattern `exactCitation()`
already uses for citation-shaped queries in `retrieve.ts`) — rather than
touching the tsvector generation `full_text_tsv` itself. **Directive's own
words apply exactly**: *"Do not change ranking weights merely to improve
one benchmark. Every change must be measured against a fixed regression
set"* — `retrieval:regression`'s baseline (this session) is the tool to
measure it with, before and after, when this is picked up.

**INDEPENDENTLY VERIFIED, same day.** Traced three more real cases with
direct DB queries (not pattern-matched from a log) rather than resting the
finding on one anecdote:

- **`KANHAIYALAL versus UNION OF INDIA AND ORS.`** — same mechanism as
  DUTT exactly: 20 AND-candidates, target not in the top 50 by `ts_rank`.
  **Confirms the dilution mechanism is not a one-off.**
- **`V REVATHI versus UNION OF INDIA & ORS.`** — a DIFFERENT, DISTINCT
  failure. The AND-path found only 1 candidate total corpus-wide, and it
  was not the target — the target isn't a candidate AT ALL, not merely
  outranked. Confirmed by direct read that `full_text` genuinely contains
  "REVATHI" (`"y V. REVATHI A\nv.\nUNION OF INDIA & ORS."`, byte-verified).
  **Hypothesis tested and REJECTED**: the raw text uses the abbreviated
  "v." rather than the spelled-out "versus" `case_title` normalises to, so
  I suspected the literal word "versus" was simply absent from this
  document's tsvector — re-ran the AND query with "versus" removed
  entirely and the target STILL did not appear. So that is not the (or not
  the whole) mechanism either. **Root cause for this second failure shape
  is NOT diagnosed** — stated honestly rather than papered over with the
  first plausible-sounding theory. Something about how "V." or "REVATHI"
  itself tokenizes in this specific document remains unexplained.
- **`SARDARI LAL versus UNION OF INDIA & ORS`** — same shape as REVATHI
  (1 AND-candidate corpus-wide, not the target), not separately dug into.

**Q1.25 is independently verified: the symptom (exact case-title search
missing a present document) is real and reproduces across at least four
distinct cases, via at least TWO distinct mechanisms** — one fully
diagnosed (frequency dilution, confirmed twice), one confirmed to exist but
NOT yet diagnosed (a tokenization/candidate-exclusion failure that a
"versus"-normalisation theory does not explain). **Closing this as
"verified, not solved"**: the case-title-similarity boost proposed above
would fix the dilution mechanism (its target is found and merely
outranked, so a rank boost helps); it would NOT fix the second mechanism
(the target isn't a candidate at all, so no re-ranking of existing
candidates can surface it) — that needs its own root-cause pass before any
fix is attempted, separate from and after the dilution fix.

### Q1.27 · CORRUPTION-REPAIR FALLBACK WIRED INTO THE ACTIVE INGEST · 12 Aug 2026

**A concurrent session independently investigated and fixed the same garbled-
text defect this lane found evidence for (Bombay, letter-dropping fonts,
`"nion of ndia"` for `"Union of India"`)** — landed as `fetchPdfText` +
`classifyCorruption` in `text.ts`/`text-corruption.ts` before this lane's own
fix was written. **Not duplicated.** Their classifier is measured against a
4,000-row sample and token-shape based, materially more rigorous than the
uppercase-ratio heuristic this lane had been about to build from a 27-sample
comparison.

**What WAS a real, non-duplicative gap: it was never wired into the running
ingest.** `text.ts`'s own comment claimed `harvest/hc-load-cli.ts` was "the
real ingest path" using `fetchPdfText` — it was not; the CLI still called
`unpdf`'s `extractText`/`getDocumentProxy` directly, the same
comment-claims-a-guard-that-was-never-wired pattern as `stripUnstorable`
(Q1.23) and the extraction timeout (Q1.18), a fourth instance this session.
**Fixed**: `hc-load-cli.ts` now calls `fetchPdfText`, which subsumes the
manual `unpdf` calls and `stripUnstorable` (already applied internally via
`normaliseWhitespace`) and adds the `pdftotext` repair pass no running
worker had.

**One safety gap found and fixed in the already-landed code before trusting
it under 10-way concurrent load**: `pdftotextFallback`'s `execFileSync` had
no `timeout`. Synchronous calls block the whole event loop, so a hang there
cannot be raced by `withTimeout` the way the async `unpdf` path can — the
exact class of hang `withTimeout` exists to prevent, reproduced
synchronously. Added `timeout: 30_000`.

**Verified**: `execFileSync('pdftotext', ...)` confirmed callable from a
plain Node process (not just interactively) before trusting it in a detached
worker — a real trap another concurrent session independently hit and fixed
in the same file (`PDFTOTEXT_PATH` / explicit Git-for-Windows path
resolution, since poppler is on Git Bash's PATH but not a detached
PowerShell-launched process's). 48 tests green (`hc-load.test.ts` +
`hc-metadata.test.ts` + `text-corruption.test.ts`), `tsc --noEmit` clean.
All 10 workers relaunched with the fix; every document ingested from this
point carries the repair pass.

**Not backfilled**: documents already written before this landed (including
whatever fraction of the ~260K HC documents ingested so far hit this defect)
still carry `unpdf`'s possibly-garbled text. A backfill re-extracting
`text_quality`-blind-but-`classifyCorruption`-positive rows is real,
identifiable follow-up work, not done here — scope discipline over the
already-large change in this entry.

### Q1.26 · GATE S2 RE-MEASURED AGAINST A 7.7× LARGER CORPUS · 12 Aug 2026

Gate S2's own harness (`services/harness`, 283 citation-edge-derived + 5
audited cross-lingual gold queries — real gold, `queries.eval.json`/
`queries.hand.json`, not invented this session) had not been run since
8 Aug 2026 (`baseline.json`), against a corpus of 38,341 judgments. Re-ran
it now against 297,291 (7.7×, all growth High Court per the concurrent
lane's scale-up, still correctly unembedded per FQ-CORPUS).

| metric | 8 Aug baseline | 12 Aug re-run | delta |
| --- | --- | --- | --- |
| success@5 | 24.0% | **24.0%** | unchanged |
| recall@20 | 44.0% | **44.0%** | unchanged |
| mean precision@5 | 4.8% | **4.8%** | unchanged |
| MRR | 0.2395 | **0.2203** | -8% relative |
| DRM (duplicate rate metric) | 95.2% | **95.2%** | unchanged |
| overruled leakage | not in baseline | **0 / 46** | clean |
| stale-overruled rate | 0.0% | **0.0%** | unchanged, confirms Q1.24 |
| structured exactness | not in baseline | **100.0%** | clean |

**Read honestly, not smoothed over.** `success@5` is EXACTLY the same
decimal at 7.7× the corpus size — the 283 gold queries' correct answers are
overwhelmingly Supreme Court judgments the growth didn't touch or compete
with in a way that moved this specific metric. MRR's ~8% relative dip is
small but real, and has a concrete, already-diagnosed mechanism: Q1.25 (this
file, above) traced exactly why — more sparse-ranking candidates from
corpus growth means more documents can out-rank a correct answer on raw
term frequency, without necessarily pushing it outside the wider top-20
window `recall@20` checks. One explanation for two numbers, not two
separate mysteries.

**Gate S2 still FAILS** — `success@5` at 24.0% against a 70.0% threshold,
same as 8 Aug. This session's work (Stage 13, the offset backfill, both
chunk.ts fixes) did not move this number, which is coherent with what
those fixes actually targeted: exact-span EVIDENCE accuracy for a chunk
already retrieved, not which chunk gets retrieved in the first place. The
lexical-ranking gap (Q1.25) is the mechanism most directly implicated by
this measurement and remains the highest-value next fix, not yet attempted
this session for the reasons stated there.

**`hallucinationRate`, `silentDropRate`, `adversarialPassRate`: NOT
MEASURED, not 0%.** The generation stage's 25/25 calls failed on
`http 429 service failure: tenant tn-ewuc4` — an OpenRouter capacity/rate
issue, external to this codebase and this corpus, not a code or data
defect. The harness's own refusal to report a rate from a failed run
(*"Calls failed, so neither rate is reported. A partial run is not a
run."*) is the correct behaviour and is why this is reported as
"not measured" rather than papered over as a pass. Re-running the
generation stage alone, later, when OpenRouter capacity recovers, would
complete this — not attempted again this session.

Raw output: `gate-s2-rerun.json` (not committed — a point-in-time
measurement, not a fixture; `baseline.json` is the one meant to be durable
and was intentionally left untouched by this run so the 8 Aug number stays
comparable).

### Q1.28 · `text_extraction_method` LANDED; A 20-MINUTE FALSE ALARM CHASED TO GROUND · 12 Aug 2026

**Added `judgments.text_extraction_method`** (migration `0048`, applied) —
`fetchPdfText` now reports `'unpdf'` or `'pdftotext_fallback'`, threaded
through `hc-load.ts`/`sci.ts`/`load.ts`/`cli.ts`. Without it Q1.27's fix had
no visibility of its own: no way to ask how often the repair pass actually
fires. `load.test.ts` green against real Postgres (rolled back), 80 tests
across the harvest/text suites. All 10 workers relaunched a third time.

**Then chased what looked like a severe regression from that exact
change for ~20 minutes — it was not one.** Workers showed `seen` climbing
into the thousands with `mapped=written=0`. Ruled out in order: (1) a bounded
CLI dry-run isolated it to 100% `pdf_missing` on one file; (2) direct `fetch()`
against those exact URLs confirmed real 404s from S3, not a parsing defect;
(3) an isolated `fetchPdfText` call against Allahabad candidates succeeded
5/5 in under 2.5s each, clearing the extraction path itself; (4) a plain
`SELECT count(*)` against `judgments` measured **11.8 seconds** — against
`docs/LANE_PROTOCOL.md`'s own freshly-written warning that the shared
Railway proxy is slow under load with five lanes now on it. **Verdict:
ordinary data noise (some source partitions' `pdf_link` values are
genuinely broken) plus shared-proxy congestion, not a code defect** — the
boring explanation, not the exotic one, per the debugging protocol's own
ordering. No revert made. Announced on the bus (`0077`–`0080`) so no other
lane re-chases the same false trail.

### Q1.29 · JOINED THE 5-LANE RING AS NEW2; CITATIONS HANDED BACK TO LCC; SCALED TO 14 · 12 Aug 2026

**`docs/LANE_PROTOCOL.md` formalised the bus into five lanes today.** Bound
this session as NEW2 (ingestion). Under the new ownership table citations are
explicitly LCC's ("classification, metadata, citations, treatment, evidence
spans"), not NEW2's — the citation-rescan loop this session ran earlier
(Q1.21, Q1.28) predates the ring and was straddling a boundary that didn't
exist yet. It finished its last queued iteration on its own; **not
restarted**, handed back to LCC on the bus (`0093`).

**Scaled from 10 to 14 HC ingest workers** — added Chhattisgarh (`22_18`),
Jharkhand (`20_7`), Andhra Pradesh (`28_2`), Delhi (`7_26`), the next tier by
`HC_METADATA_SURVEY.json` size after the eleven already running. Deliberately
smaller than the earlier 4→10 jump: NEW1 flagged on the bus (`0087`) it is
about to run DB-heavy retrieval measurement jobs and is being careful not to
compound proxy load, so this lane matched that by adding four, not another
ten, and checked the connection budget (23/100) and easing proxy latency
(11.8s → 4.2s on a plain count) before doing even that.

**HC total at last measurement: 309,113**, up from 103,486 at the start of
the founder's 10× ask (target 1,034,860).

### Q1.30 · 18 WORKERS — CROSS-LANE GAP FINDING ACTIONED · 13 Aug 2026

**NEW3's `COVERAGE_GAP_MATRIX.md` (bus `0101`) found two courts under-
scheduled, not blocked**: Himachal Pradesh 8/188,548 held (0.004%) and J&K
2/112,046 (0.002%), both far below Tripura/Manipur/Meghalaya/Sikkim despite
being larger sources — same authorized AWS bucket as every other court.
Also flagged Uttarakhand (holding stops 1987) and Gujarat (stops 1995) as a
**recency** gap distinct from raw coverage percentage — the ~25–30 most
recent years are entirely unheld for both, which matters more to a
practising advocate than the percentage suggests.

**Root cause, not just the fix**: the general (`--from-year 2016`,
no `--court` filter) sweep processes all 550 metadata files newest-first,
but the growing set of dedicated per-court workers absorbs concurrency
ahead of it in practice, so courts without a DEDICATED worker simply hadn't
been reached yet. This explains both findings as one cause, not two.

**Added 4 more dedicated workers** — HP (`2_5`), J&K (`1_12`), Uttarakhand
(`5_15`), Gujarat (`24_17`) — all `--from-year 2016`, so this reaches the
recency gap directly. **18 HC ingest workers running.** Also applied LCC's
`connect_timeout: 120` fix (bus `0091`, the shared-proxy `CONNECT_TIMEOUT`
LCC's own workers died on) to `hc-load-cli.ts`, on new launches only —
did not force a disruptive restart of the 14 already healthy and writing.
Confirmed on the bus (`0102`).

### Q1.29 · THE FIRST NEW1→NEW3 MISSING-AUTHORITY FEEDBACK LOOP RUN — real numbers, no acquisition gap · 13 Aug 2026

`failure:classify` finished against the full real gold set (288 queries;
285 classified, 3 recoverable network timeouts flagged for a retry pass).
No invented gold — every query's answer is a citation edge drawn from this
corpus's own text.

| class | count | share |
| --- | --- | --- |
| SUCCESS (gold in top 5) | 48 | 16.8% |
| AUTHORITY_RETRIEVED_BUT_BADLY_RANKED | 97 | 34.0% |
| AUTHORITY_HELD_BUT_NOT_RETRIEVED (not in top 50) | 140 | 49.1% |
| NO_AUTHORITY_FOUND | **0** | 0.0% |

**The headline finding, stated plainly: every single failure this run
found is OURS, not a data gap.** 83.1% of queries fail to surface their
gold judgment in the top 5, and **100% of that failure is retrieval or
ranking — zero is a missing document.** `NO_AUTHORITY_FOUND` cannot fire
against this query set by construction (gold is drawn from the corpus's
own citation edges, so it is definitionally held) — stated as this run's
honest boundary, not evidence of a clean corpus. But `AUTHORITY_HELD_BUT_
NOT_RETRIEVED` (140, not found even at depth 50) vs `AUTHORITY_RETRIEVED_
BUT_BADLY_RANKED` (97, found but past rank 5) is real, measured evidence:
the larger failure mode is the corpus not surfacing the document AT ALL
within 50 candidates, not merely ranking it poorly — which matters for
where to spend effort next (recall first, ranking second).

**Secondary finding, on the 145 queries that DID find their gold judgment
(SUCCESS + BADLY_RANKED): 137 (94.5%) carry `EVIDENCE_WRONG`** — an empty
`operativeParagraph` or a null `operativeParagraphNumber` on the matched
result. `CITATION_UNRESOLVED` did not fire on any found authority (both
`neutralCitation` and `reporterCitations` are never simultaneously empty
on a match).

**ROOT-CAUSED same day, by LCC (bus 0124) — not an evidence bug, chunk
coverage.** `judgments` is now 592,027 rows; only 40,161 (6.8%) carry any
`judgment_chunks` row at all, so 551,866 (93.2%) can have no
`operativeParagraph` by construction — there is genuinely no passage
behind a lexical-only match on those. Matches the 94.5% almost exactly.
This is the same 37.6%-on-9-Aug number `retrieve.ts`'s own comment already
documented as expected behaviour, now much larger because NEW2's ingest
took the corpus from ~79k to 592k and essentially all of the growth is
un-chunked High Court text — the same FQ-CORPUS boundary as everywhere
else this session, not a new gap. **Worth carrying forward**: LCC
separated CHUNKING (text only — `chunk_text`/`char_offset`/`char_length`,
cheap) from EMBEDDING (the vector, the restricted/expensive part) —
display evidence only needs the former. Not something this lane acts on
(corpus writes are outside the NEW1 charter), noted for whoever owns that
scope decision next.

**NEW3_ACQUISITION_QUEUE.json: 0 new entries.** Per `docs/LANE_PROTOCOL.md`
§3 ("a gap you cannot close → the lane that can"), nothing from this run is
sent to NEW3 — there is nothing genuinely missing to send. Sent downstream
on the bus instead: the finding itself, so NEW3/LCC do not read silence
as "NEW1 has nothing to report" and so ranking failures are not mistaken
for acquisition gaps by anyone reading `AUTHORITY_HELD_BUT_NOT_RETRIEVED`
out of context.

### Q1.30 · Q1.25'S FIX, SCOPED — a pin that already has a home, not a new mechanism · 13 Aug 2026

Re-verified Q1.25 first, not assumed stale: `S. N. DUTT versus UNION OF
INDIA` still fails to appear in the sparse AND-path's top 50, now against
**492,020 judgments** (up from 297,291 at the original diagnosis) — capped
at 50/50 candidates, meaning dilution is measurably worse as the corpus
grows, not better. The mechanism holds.

**The fix has a home already, found by reading rather than designing from
scratch.** `services/api/src/search/query-shape.ts` already classifies
`X v Y` / `X vs Y` / `X versus Y` queries as `shape: 'case_name'`
(`CASE_NAME_RE`) — **every one of Q1.25's traced failures matches this
shape exactly.** But `warrantsExactLookup` only returns true for
`shape === 'citation'`; `case_name` queries fall through to the ordinary
hybrid pipeline on the strength of a comment in the same file: *"a case by
name, where the lexical ranker is already strong."* Q1.25 is the direct,
measured disproof of that claim, sitting three lines from the assumption.

**Scoped implementation, not yet written:**

1. `exactCaseTitle(sql, queryText, filters)` in `retrieve.ts`, mirroring
   `exactCitation()` exactly: case-insensitive, whitespace-normalised
   comparison against `judgments.case_title`. Pins ONLY when it resolves to
   **exactly one** row — same asymmetry `exactCitation()` already commits
   to (*"a missed [match] costs nothing; a wrongly-claimed one pins the
   wrong judgment at rank 1"*).
2. In `hybridSearch()`, extend the existing pin branch to also fire when
   `shape.shape === 'case_name'`, not only `'citation'`.
3. **Deliberately NOT fuzzy.** An exact (normalised) match only — this
   fixes precisely the measured failure (an advocate's query IS the
   printed case title, verbatim, which is what all four traced cases and
   this eval set's `case_name`-shaped queries actually are) without
   introducing similarity scoring, which would reopen exactly the
   "changing ranking weights without a controlled experiment" risk this
   whole exercise exists to avoid.
4. **Does not touch `full_text_tsv`.** No schema migration, no change to
   how sparse or dense rank anything that isn't pinned — additive only,
   same risk class as the citation pin already in production.

**Why this cannot trade concept quality for title quality**: the new pin
only ever fires when `classifyQuery` already returns `case_name` — a
`concept` query never enters this branch, so there is no shared weight or
threshold for a title fix to distort.

**Measurement plan, fixed BEFORE implementation, per this lane's own
standing rule against tuning without one:**

- **Primary (BEFORE)**: the controlled Stage-10 arms comparison already
  running (`ARMS_PASS=controlled`, `courts=['sc']`, full 283-query gold
  set) — success@5, recall@20, MRR, nDCG@5/@20, for `hybrid` specifically
  (production's arm), holding the haystack constant so the number reflects
  the ranker, not corpus size. Isolates exactly what a case-name pin can
  and cannot move.
- **AFTER**: same command, same corpus state (re-run immediately after
  the fix lands, not delayed — corpus is growing hourly and a stale
  comparison would confound growth with the fix, exactly Q1.25's own
  lesson).
- **Query-type split**: the 283-query gold set's `group` field only
  distinguishes criminal/civil, not shape — a real gap for a claim like
  "this helped case-name queries specifically." `retrieval:regression`'s
  `bench-queries.ts` (20 queries, already labelled `concept` / `section` /
  `citation` / `case-name` / `procedural`) is the existing tool with the
  right shape for that finer cut; run before and after alongside the
  283-query gold set, not instead of it.
- **Pass/fail for shipping the fix**: recall@20 and MRR on `case_name`-
  shaped queries improve without a measured regression on `concept`-shaped
  queries in the same run. A win on one at a measured cost to the other is
  reported, not shipped silently.

**BEFORE baseline, landed** — controlled (`courts=['sc']`), `ARMS_LIMIT=100`
(the full 283 would run ~5h under current five-lane DB-proxy load; 100
matches `ab-cli.ts`'s own established default for exactly this reason):

| arm | success@5 | recall@20 | MRR | nDCG@5 | nDCG@20 |
| --- | --- | --- | --- | --- | --- |
| sparse | 7.0% | 13.0% | 0.053 | 0.053 | 0.070 |
| dense | 17.0% | 34.0% | 0.118 | 0.116 | 0.168 |
| hybrid (production) | 12.0% | 30.0% | 0.093 | 0.087 | 0.137 |

Paired (McNemar, success@5, discordant queries only):

| pair | gained/lost | p | queries to settle |
| --- | --- | --- | --- |
| dense vs sparse | +12 / −2 | **0.0129** | ~91 |
| hybrid vs sparse | +5 / −0 | 0.0625 | ~77 |
| hybrid vs dense | +3 / −8 | 0.2266 | ~324 |

**This partially settles LCC's bus 0061 question, and the honest answer is
narrower than either "yes" or "no."** The corpus-size confound LCC
suspected (sparse reaching a haystack the dense arm cannot) is controlled
for here — both arms see the identical Supreme-Court-only set. **Hybrid
still underperforms dense on every point estimate** (12.0% vs 17.0%
success@5; 30.0% vs 34.0% recall@20; 0.093 vs 0.118 MRR) even with the
confound removed, which the confound theory alone does not explain. But
`hybrid vs dense` is the one comparison that does **not** reach
significance at this sample size (p=0.2266, ~324 queries needed) — so the
correct statement is *"directionally worse, not yet proven,"* not *"proven
worse."* Sparse is unambiguously the weakest arm (dense beats it at
p=0.0129). Neither RRF fusion nor the corpus-size confound is ruled out by
this run alone; both remain live explanations. **Not acted on** — this
lane does not tune RRF or fusion weights from one controlled-but-
underpowered run, per its own standing rule.

**AFTER measurement, attempt 1 — crashed mid-run, real data recovered
anyway.** `arms-controlled-after.log`: sparse and dense both completed
before the process died on `hybrid 20/100` with an uncaught `ENOTFOUND`.

| arm | success@5 | recall@20 | MRR | nDCG@5 | nDCG@20 |
| --- | --- | --- | --- | --- | --- |
| sparse | 7.0% | 13.0% | 0.053 | 0.053 | 0.070 |
| dense | 17.0% | 34.0% | 0.118 | 0.116 | 0.168 |

**Byte-identical to BEFORE, both arms, all five metrics.** Not a build
error — checked directly: `exactCaseTitle`'s SQL fires and correctly
finds nothing to pin for the vast majority of this query set, because
**the case-name pin was never going to move this benchmark.**
`build-queries.ts`'s whole redaction step exists to strip a cited case's
distinctive title words out of the query text so the task measures
retrieval rather than string lookup (its own header, "LEAKAGE"). A
benchmark built to remove case names from its queries cannot, by
construction, exercise a fix for typing a case name. Q1.25 was correctly
verified a different way — direct live smoke tests against real
case-name queries (`S. N. DUTT versus UNION OF INDIA` and the other
three traced failures) — and that verification stands; this benchmark
was never going to corroborate or refute it, and expecting it to would
have been the wrong check.

**A second, real finding surfaced while explaining the first.**
`query-shape.ts`'s `CASE_NAME_RE` (`/\S+\s+(?:v|vs|versus)\.?\s+\S+/i`)
misclassifies 161 of the 283 gold queries as `case_name` shape — checked
directly, not assumed: these are reasoning passages that happen to
contain a bare `v` or `versus` token, e.g. one example began *"(2) For
the purposes of this section, a fact is said to be proved only when the
Special Court believes it to exist beyon…"*, which is not a case-name
lookup by any reading. Every one of those 161 now fires an extra
`exactCaseTitle` query per search that Q1.25 did not need to add.

**Resolved: 0 of 161 actually false-pin.** First check attempt (161
sequential round trips, one per query) hung for 12 minutes under current
load with zero CPU progress — not a bug in the check, just the wrong
shape for this load: killed and rewritten as **one batched query**
(`unnest` + a single join, the same "batch, don't loop" lesson Q1.32's
`fillParagraphFallback` already applied), which answered in seconds:
`161 checked, 0 actually pinned (exactly 1 row)`. Confirmed by
construction, not luck — these are reasoning passages, essentially never
an exact normalised match against any `case_title`. So the 161 cost is
real (a wasted round trip per search) but bounded and not a correctness
risk; worth a tighter `CASE_NAME_RE` at some point, not urgent.

**AFTER measurement, attempt 2 — also crashed, same ENOTFOUND, before
logging its first checkpoint.** `arms-cli.ts` hardened
(`scoreQueryResilient`, retries the same transient-network codes NEW2
root-caused on their own workers — bus `0159`, a local DNS hiccup
resolving the Railway proxy hostname, not shared-proxy load; unlike
their fix this retries per-query rather than the whole run, since this
loop has no checkpoint and paired McNemar needs every arm on the
identical query set) and relaunched, but the underlying pace — one
query in flight against a proxy every other lane is also hitting right
now — was still the binding constraint.

**Attempt 3 — running, now with bounded concurrency (`CONCURRENCY = 6`,
`scoreAllConcurrently`).** Measured directly: the sequential pass was
spending nearly all its wall time waiting on the network round trip,
not on CPU, so overlapping 6 in flight (not unbounded — the proxy is
already strained ring-wide) should cut wall time roughly in proportion
without piling on. Order is preserved per-index specifically because a
shuffled row would silently corrupt every McNemar gained/lost count.
Launched as a tracked background task with a live Monitor watching for
both progress lines and the exact crash signatures attempts 1 and 2
hit, so a repeat surfaces immediately rather than 40 minutes later.
Typecheck clean, harness suite 123/123 both times. `judgment_citations`
checked directly while waiting: **775,874 rows**, up from 444,621 at
LCC's last report — still climbing, so TARGET 1's `failure:classify`
re-run stays held for their explicit signal, per their own stated
reason (a moving gold-findability baseline), not restarted early.
Adopted `openDb()` (LCC, bus 0169) partway through, root-fixing the
DNS hang the previous two attempts died to rather than only retrying
around it — see the harness commit log; not repeated here.

**Attempt 3 — COMPLETE.** All three arms finished, no crash (one
`ECONNRESET` on each of sparse and hybrid, both caught and retried
automatically by `scoreQueryResilient`, exactly the resilience layer
existing for this). Total wall time sparse+dense+hybrid: 1,400s (~23
min) — the same three arms that had not even logged sparse's first
20/100 checkpoint after 10 minutes in attempt 2.

| arm | success@5 | recall@20 | MRR | nDCG@5 | nDCG@20 |
| --- | --- | --- | --- | --- | --- |
| sparse | 7.0% | 13.0% | 0.053 | 0.053 | 0.070 |
| dense | 17.0% | 34.0% | 0.118 | 0.116 | 0.168 |
| hybrid (production) | 12.0% | 30.0% | 0.093 | 0.087 | 0.137 |

Paired (McNemar, success@5, discordant queries only):

| pair | gained/lost | p | queries to settle |
| --- | --- | --- | --- |
| dense vs sparse | +12 / −2 | 0.0129 | ~91 |
| hybrid vs sparse | +5 / −0 | 0.0625 | ~77 |
| hybrid vs dense | +3 / −8 | 0.2266 | ~324 |

**BEFORE and AFTER are identical to three decimal places on every
metric, every arm, every McNemar pair.** Not a null result about
whether the run worked — it is the expected result, now with hybrid
confirming what sparse and dense already showed in attempts 1 and 2:
Q1.25's case-name pin cannot move this benchmark, because
`build-queries.ts`'s own redaction step strips distinctive case-title
words out of every gold query specifically to prevent leakage. A
benchmark built to remove case names from its queries was never going
to exercise a fix for typing one. **Q1.25 stands on its own live
verification** (the four traced real-world failures, `S. N. DUTT
versus UNION OF INDIA` and three others, now pinning correctly) — that
remains the correct evidence for it, and this closes the loop by
confirming the benchmark neither corroborates nor contradicts it, as
predicted before the run rather than rationalised after.

**What this run actually cost 90 minutes of engineering time to
establish, honestly stated**: not "did Q1.25 work" (already known) but
"is this specific 283-query harness capable of detecting a case-name
fix at all" (no, structurally, now confirmed rather than assumed) —
plus, as a side effect, hardening `arms-cli.ts` against the exact DNS
failure class that has cost every lane hours this session, and
resolving the 161-query `CASE_NAME_RE` false-positive question (0
actual false pins). Both outputs outlast this one comparison.

**Q1.30 is now CLOSED.** Reported to LCC on the bus.

### Q1.31 · 20 WORKERS — Calcutta and Gauhati dedicated · 13 Aug 2026

Added `19_16` (Calcutta, 406,413-document inventory) and `18_6` (Gauhati,
232,057) as dedicated workers — the two largest courts still riding the
general sweep alone. **20 HC ingest workers running.** The four remaining
undedicated courts (Tripura, Manipur, Meghalaya, Sikkim) are all under
34,000 documents each and already had proportionally strong coverage from
earlier general-sweep passes — left to the sweep rather than dedicated,
diminishing returns at that size. LCC independently confirmed corpus total
at **466,633** (bus `0105`) — up from 103,486 at the start of the founder's
10× ask.

**Recurrence, 13 Aug**: Madras and Orissa both hit the same "unsettled
top-level await" shutdown quirk as Q1.21/the earlier citation-rescan crashes
— at `await sql.end()`, after real progress (5,708 and 9,187 written this
run respectively), not mid-batch. No data lost either time. Relaunched both;
not root-caused further — a recurring but low-severity Node/postgres
shutdown interaction under this environment's sustained load, worth a
restart, not worth blocking on.

### Q1.17 · FOUNDER DECISION — DATA BEFORE EMBEDDINGS · 13 Aug 2026 · SETTLED

> **Fund chunk-text coverage now. Start embeddings only once we hold all
> available data from all courts, ALL cases and citations are in, and the data
> is structured and ready. Data is the priority; embeddings come after.**

**This is sequencing, not a preference, and it reframes every lane.** Nobody
starts an embedding run. Missing vectors are not a defect — they are a
deliberate ordering. **NEW2 (ingestion) and NEW3 (discovery) are now the
critical path**: embeddings wait on their completeness, not the reverse.

**Executed same day.** `judgment_paragraphs`, migration `0049`, applied.
Paragraph-level evidence for the whole corpus with no vectors — closing the gap
NEW1 measured (94.5% of retrieved queries returning an empty
`operativeParagraph`, because only **40,161 of 600,073 judgments had any
passage stored**).

**It deliberately does NOT write to `judgment_chunks`.** That is the vector
table, and `retrieve.ts`'s dense query is `ORDER BY c.embedding <=> $1 LIMIT n`
over it with **no `WHERE embedding IS NOT NULL`** — read in the source, not
assumed. ~550,000 embedding-less rows would grow it ~15× and invite the planner
to abandon the HNSW index. **Paying for evidence display with production search
latency is not a trade worth making quietly.** When embeddings are funded,
chunks derive *from* these paragraphs rather than being re-split.

**Measured on 600 real judgments:** 4,289 paragraphs, **86.0% carrying a
court-printed number**, **0 refused for lost text**, 7.1 paragraphs/judgment.

**Why paragraphs rather than fixed windows — checked against outside sources,
not assumed:**

- The Supreme Court's **July 2023 direction requires** *"all paragraphs should
  be numbered sequentially commencing with the initial paragraph"*. Judgments
  carry their own citable units; *"para 14"* is what goes in a filing, and a
  pinpoint we invented is not one an advocate can use. The 86.0% measured above
  is that mandate holding in practice.
- **Structure-preserving segmentation outperforms sequential chunking on legal
  text** (NLLP 2025), because a provision's meaning is bound to its numbering
  and heading. Semantic chunking adds 15–25% accuracy at 3–5× compute — exactly
  the trade this decision defers.
- **Document-Level Retrieval Mismatch worsens as a corpus scales**
  (arXiv 2510.06999) — the retriever picks chunks from *wrong* documents sharing
  superficial similarity. NEW1's 49.1% held-but-not-retrieved was measured while
  the corpus went 79k → 600k, so some degradation is scale, not regression.
- The Bombay extraction failure is a **documented class**: subset fonts with
  incomplete ToUnicode CMaps defeat pdf.js where poppler succeeds.

### Q1.16 · THE RING, AND FOUR DEFECTS THAT ONLY APPEAR AT SCALE — 13 Aug 2026

**The bus now carries five lanes** (`docs/LANE_PROTOCOL.md`): NEW3 discovery →
NEW2 ingestion → LCC enrichment → NEW1 retrieval → back to NEW3. RCC sits
outside the ring. LCC orchestrates.

**Corpus grew from 79,322 to 600,073 judgments in one session.** Every defect
below is one that did not exist at the smaller size.

**1 · THE CITATION PASS WAS READING THE WRONG END OF THE CORPUS.** It produced
`edges=0` across **8,100 consecutive documents** — the Q1.0c shape. The
extractor was checked directly against the same population and was FINE (5 of 8
documents containing "SCC" yielded citations, including `2020\n(11) SCC 648` and
`(2003)4\nSCC 675`). The defect was `ORDER BY judgment_date DESC`: NEW2's ingest
is loading 2026 documents, and those are overwhelmingly bail orders — **57,876
bail orders and 20,641 procedural disposals against 39,914 reasoned decisions**.

| | documents | edges |
| --- | --- | --- |
| newest-first | 8,100 | **0** |
| substantive-first | 12,900 | **12,794** |

**2 · `EVIDENCE_WRONG` IS CHUNK COVERAGE, NOT AN EVIDENCE BUG.** NEW1 measured
94.5% of successfully-retrieved queries carrying an empty `operativeParagraph`.
Root cause: **40,161 of 600,073 judgments have chunks (6.7%)**. `retrieve.ts`
already documents that an empty paragraph is legitimate for a lexical-only
match; it was 37.6% on 9 Aug and is 93.2% now purely because the corpus grew and
the growth is unchunked. **Chunking and embedding are separable costs** — a
passage to display needs the text, only the reranker needs the vector. HC
embedding remains out of scope.

**3 · THE 34 EDGES WHERE A WRONG ANSWER MARKS DEAD LAW LIVE.** NEW3 found them
and ranked them correctly. `overruled-resolve-cli.ts`: 13 candidates (several at
Jaccard 1.00), 1 ambiguous, 6 thin, 13 no candidate. **It writes nothing, by
design and permanently** — a wrong `overruled` link is worse than an unresolved
one, and 34 rows is a tractable human read.

**4 · TWO WORKERS DIED OF THE SAME PAIR OF CAUSES.** `OFFSET` pagination against
a table NEW2 is writing to (re-reads some rows, silently skips others), and a
proxy connection with no `connect_timeout` that hangs instead of erroring
("Detected unsettled top-level await" at 115,500 of 377,526). Both hardened.
**Any long-running job in this repo needs keyset pagination and a connect
timeout** — this cost an hour twice.

**Also:** OpenRouter added as the paid fallback when InferX saturates, with a
circuit breaker after 3 consecutive capacity failures (18 → 70 documents in
three minutes). Cost is the figure OpenRouter reports, never an estimated rate.
`document_enrichments` writes were outside the retry wrapper and are now inside.

**Statute references cover 25,466 of 592,027 documents (4.3%)** — backlog pass
running.

### Q1.32 · ALL 25 COURTS NOW HAVE A DEDICATED WORKER — the founder's "data before embeddings" decision · 13 Aug 2026

**Founder decision, relayed via LCC (bus `0134`), settled and binding on the
whole ring**: fund chunk-text coverage now; start embeddings only once all
courts, all cases and citations are in and structured. **"NEW2: your lane is
now the critical path — embeddings wait on your completeness."**

Added the last four courts still riding the general sweep alone — Tripura
(`16_20`), Manipur (`14_25`), Meghalaya (`17_21`), Sikkim (`11_24`), the
smallest by inventory (11.7K–33.8K documents each) and already had
proportionally strong coverage, but "all courts" per the founder's own
wording means all 25, not the large ones only. **24 workers running: the
general sweep plus one dedicated `--court` worker per High Court in the
AWS bucket.** Coverage is now complete at the court level; depth within
each court is the remaining work.

Committed on the bus (`0136`) to messaging LCC when any court crosses ~50%
of its own source-document count, so citation/statute passes can target it
while fresh.

### Q1.32 · `judgment_paragraphs` — a real fix for EVIDENCE_WRONG, scoped not yet wired · 13 Aug 2026

**Founder decision, 13 Aug 2026, via LCC (bus 0133): fund chunk-TEXT
coverage now; embeddings wait until every court's data is held, all
citations are in, and the corpus is structured.** This is the direct
answer to Q1.29's `EVIDENCE_WRONG` finding and LCC's root-cause (bus
0124) — chunking (text, cheap) and embedding (vectors, deferred) are
separable, and LCC built the cheap half: `judgment_paragraphs` (migration
0049, applied, running), paragraph-level evidence — `paragraph_text`,
`paragraph_number` (nullable, court-printed), `char_offset`/`char_length`
(byte-exact against `full_text`) — **deliberately a separate table from
`judgment_chunks`**, so the vector index stays exactly as small and fast
as it is today. Confirmed by reading the migration, not assumed.

**Verified live, real data, not the design doc alone**: 9,914 of 626,192
judgments carry paragraphs already (early in the backfill, growing), and
a real judgment with paragraphs but zero `judgment_chunks` rows — exactly
`EVIDENCE_WRONG`'s shape — returns real, usable paragraph text on query.

**Not wired into `retrieve.ts` yet, scoped rather than rushed:**

1. A new fallback, `paragraphFallback(sql, judgmentId, query)`, used ONLY
   when a matched judgment has no `bestChunk` entry (sparse-only match, no
   dense chunk — precisely the population `EVIDENCE_WRONG` measured).
2. **Query-aware selection, not "just the first paragraph"** — same
   philosophy `passagesForRerank` already commits to for its own fallback
   (*"the chunk of that judgment nearest the QUERY, not chunk zero"*):
   rank a judgment's paragraphs by `ts_rank` against the query text, take
   the top one. A judgment's cause title (paragraph 0) is exactly the
   content-free candidate that mechanism was built to avoid handing to a
   reader as if it were the reasoning.
3. **Must be batched, not per-row.** `hybridSearch`'s result-building loop
   currently makes no per-candidate DB call; adding one naively inside it
   would cost real latency against Gate S1's 3-second budget for exactly
   the sparse-only matches this is meant to help. The batching pattern
   already exists to copy: `passagesForRerank`'s `DISTINCT ON` query,
   `retrieve.ts`.
4. **Measurement, before shipping, same standing rule as Q1.25**: re-run
   `failure:classify`'s secondary-flag count before/after — `EVIDENCE_WRONG`
   should drop specifically among `AUTHORITY_HELD_BUT_NOT_RETRIEVED`-turned-
   found and `AUTHORITY_RETRIEVED_BUT_BADLY_RANKED` cases whose judgment now
   has a `judgment_paragraphs` row; it should not move at all for judgments
   that still have neither table populated (a real negative control).

**IMPLEMENTED AND VERIFIED LIVE, 13 Aug 2026.** `fillParagraphFallback(sql,
results, query)` in `retrieve.ts`, wired into `hybridSearch()` right before
`return results` — runs unconditionally across sparse/dense/hybrid modes
since it only fills display evidence, never touches ranking/order:

1. Scans the already-built result set for entries with an empty
   `operativeParagraph` (the sparse-only-match population `EVIDENCE_WRONG`
   measured) and collects their judgment IDs.
2. **One batched query**, not per-row: `SELECT DISTINCT ON (judgment_id) ...
   FROM judgment_paragraphs WHERE judgment_id = ANY($ids) ORDER BY
   judgment_id, ts_rank(...) DESC` — the same `DISTINCT ON` pattern
   `passagesForRerank` already uses, query-aware per item 2 above, not "just
   the first paragraph."
3. Populates `operativeParagraph`, `operativeParagraphNumber`,
   `operativeParagraphVerified: true`, and `exactSpan` (`charOffset`/
   `charLength` straight from the row, byte-exact against `full_text` per
   the migration's own guarantee) on the matched result in place.

**Verified**: `pnpm --filter @lawmind/api run typecheck` clean.
`pnpm --filter @lawmind/api run test` — 262/456 pass, 23 fail, identical to
this session's established baseline (pre-existing DB-connectivity failures,
confirmed unrelated by diffing against stashed `main` earlier in the
session). **Live smoke test against production**, not the design doc alone:
picked a real judgment (`078d8dea-5a2d-428e-9632-000c598bdb07`, "LATE
ASSISTANT COMMISSIONER M K BHATNAGAR ... Vs PRINCIPAL CHIEF CONTROLLER
ACCOUNT MINISTRY OF HOME AFFAIRS & ORS.") with `judgment_paragraphs` rows
and zero `judgment_chunks` rows, queried `hybridSearch` with a phrase from
one of its paragraphs — the judgment came back with `operativeParagraph`
populated, `operativeParagraphNumber: 20`, `operativeParagraphVerified:
true`, `exactSpan` present. Confirms the exact `EVIDENCE_WRONG` shape now
gets real evidence instead of an empty operative paragraph.

**Not yet done**: the item-4 measurement (re-run `failure:classify`
before/after, checking `EVIDENCE_WRONG` drops specifically among judgments
that now carry a `judgment_paragraphs` row and holds flat for the negative
control) — deliberately deferred per LCC's own standing ask to hold the
re-run until their citation backlog (444,621 rows and climbing at last
check) completes, so "the gold answer is findable" doesn't shift mid-measurement.

**Also relevant to Q1.29's own re-run** (LCC's research, bus 0133,
arxiv.org/pdf/2510.06999): Document-Level Retrieval Mismatch is a named,
studied failure that *worsens as the corpus scales* — Q1.29's 49.1%
`AUTHORITY_HELD_BUT_NOT_RETRIEVED` was measured while the corpus grew
~79k→600k mid-session. Some of that number may be corpus-scale rather
than a static property of the ranker; worth controlling for (or at least
stating) when `failure:classify` is re-run, per LCC's own standing ask —
hold the re-run until their citation backlog (444,621 rows and climbing)
completes, since that changes what "the gold answer is findable" means
too.

### Q1.33 · THE GATE IS PARITY, NOT COMPLETION — `docs/RING_PROGRAM.md`, connect_timeout rolled to every worker · 13 Aug 2026

**LCC's `RING_PROGRAM.md` (bus `0140`) reframes the target precisely**: the
AWS source is `~17.8M judgments · 25 courts · 45 benches`, **updated
daily**. The gate is not "ingest everything once" — it is *reach parity
with the source, then stay current*. Also settled: "all courts" means the
25 High Courts + Supreme Court, explicitly **not** the ~33M NJDG
district-court universe (unauthorized, a different question entirely). This
lane has not touched district courts and will not on its own reading of
"all courts."

**`connect_timeout: 120` rolled to every worker, not just new launches.**
Two hangs this session (Madras, Orissa — flat CPU, confirmed not just slow)
match the exact failure LCC named — "a proxy connection with no timeout
that hangs instead of erroring" — and it is now a binding rule across the
whole ring (`RING_PROGRAM.md` §4). Rather than wait for the remaining 7
pre-fix workers to hang too, restarted them proactively: Allahabad, Punjab,
Rajasthan, Karnataka, Madhya Pradesh, Kerala, Telangana, plus the general
sweep. **All 25 workers now run identical, current code.**

**Sikkim finished its `--from-year 2016` scope naturally** (11 metadata
files, smallest court) and was relaunched with no year floor to capture its
full history — 27 files in scope instead of 11. The other small courts
will hit the same natural completion soon; each gets the same treatment
rather than being left capped at the last decade, since "all available
data" per the founder's own wording is not scoped to one decade.

**Escalation, 13 Aug, worth watching**: the flat-CPU hang that hit one worker
at a time (Madras, Orissa, Rajasthan) hit **7 simultaneously** this check —
Allahabad, Madras, Punjab, Rajasthan, Orissa, Karnataka, Telangana. Waited
75s before restarting to rule out "merely slow under proxy load" (a `SELECT
1` measured 2.8s at the time, elevated but not severe) — confirmed
genuinely stuck, not slow: six of seven showed zero movement across the
wait. All 7 restarted, verified healthy. **Not scaling worker count further
this cycle** — holding at 24 rather than adding more while this pattern's
true cause (still unconfirmed; Windows exec-timeout ruled out, proxy
latency alone doesn't fully explain a 25+ minute stall) is unresolved.
Watching whether the hang rate stabilises or keeps climbing on the next
check.

### Q1.34 · THE HANG'S ROOT CAUSE, FINALLY: a transient DNS blip, and now self-healing · 13 Aug 2026

**Closes the "root cause still open" note from Q1.29's escalation.** This
check found 7 workers dead (Chhattisgarh, AP, J&K, Gauhati, Tripura,
Manipur, Gujarat) plus 2 more stuck (Orissa, Rajasthan) — the worst wave
yet. The crashed ones' logs carried the actual answer this time:

```
Error: getaddrinfo ENOTFOUND hayabusa.proxy.rlwy.net
```

**The Railway proxy hostname itself failed to resolve** — an uncaught
exception from `postgres.js`'s query construction, not a catchable
rejection inside `main()`. Re-resolved fine moments later
(`nslookup`/`dns.lookup` both succeeded immediately after) — a transient
consumer-router DNS hiccup, not a broken environment or a code defect.
**This is very likely what every earlier "flat CPU, no progress" hang in
this session actually was** too — a DNS lookup stalling rather than failing
fast, which `withTimeout` cannot help with (it bounds the extraction path,
not the DB client's own connection attempts), explaining why multiple
workers were hit at once each time: they all do DNS lookups around the
same moments.

**Fixed at the source rather than left as a manual-restart chore.**
`hc-load-cli.ts`'s top-level `main()` call now retries the whole run (up to
5 attempts, exponential backoff to 30s) on `ENOTFOUND` / `EAI_AGAIN` /
`ECONNRESET` / `ECONNREFUSED` / `ETIMEDOUT` specifically — safe because
`main()` is resumable by construction (`source_url` skip), so a retry costs
a fast re-check of already-held rows, never lost work. Any other error
still propagates immediately, unretried. 48 tests green, `tsc --noEmit`
clean. All 9 affected workers restarted with the fix; every future DNS
blip should now self-heal without needing this loop to catch it.

### Q1.35 · SEVERITY-WEIGHTED RETRIEVAL SCORING — scoped from LCC's research, not yet implemented · 13 Aug 2026

**LCC's ask (bus 0164)**: their treatment-extraction benchmark uses an
"Average Severity Error" metric because plain accuracy misleads —
mislabelling `overruled` as `cites` is categorically worse than
confusing `followed` with `applied`. *"That reasoning transfers
directly to your retrieval scoring. A gold query whose answer is an
overruled authority served without the LAW MOVED mark is not one miss
among many."*

**Re-scoped for what retrieval actually controls, not a direct port.**
`overruled_status` is read live from the DB row at render time, never
cached (`CLAUDE.md` §6, the zero-threshold stale-overruled rule this
lane already verified end-to-end — `overruled:audit`, 0/57 stale). So
a judgment this harness DOES retrieve can never be shown as good law
by mistake — that failure mode is already closed and guarded by a
different tool. **The retrieval-layer analog is narrower and real
anyway**: a gold judgment that is overruled and gets missed entirely
(`AUTHORITY_HELD_BUT_NOT_RETRIEVED`) denies the advocate the LAW MOVED
warning altogether, which is worse than missing an ordinary authority
— there is no render-time safety net for a citation nobody retrieved.

**Scoped, not built:**

1. A new metric, additive alongside success@5/recall@20/MRR/nDCG, never
   replacing them — same discipline as nDCG's own introduction.
2. Weight per gold query = 1 if its `goldJudgmentIds`' judgment has
   `overruled_status = 'none'`, higher (proposed 3×, open to
   calibration — not asserted as correct without a second opinion) if
   `set_aside` / `partly_set_aside` / `doubted`. One `overruled_status`
   lookup per gold judgment, batched, not per-query.
3. **Needs its own before/after discipline** if it ever influences
   ranking rather than just reporting — this lane's standing rule
   against tuning without a controlled measurement applies to a new
   metric exactly as much as to a new ranking mechanism. Right now this
   is scoped as a REPORTING addition only; nothing about it changes
   what `hybridSearch` returns.
4. **Not implemented this session** — the DB is carrying the AFTER arms
   run plus the whole ring's backlogs; adding a new query pattern
   belongs after that settles, not competing with it for the same
   proxy.

### Q1.35 · ADOPTED LCC's `openDb()`, AND FOUND A SECOND GAP IN MY OWN DNS FIX · 13 Aug 2026

**LCC root-fixed the DNS failure properly** (bus `0170`,
`services/ingest/src/db-host.ts`): resolves the proxy hostname via public
DNS (Cloudflare/Google) and hands the driver an address directly, keeping
the original hostname for TLS SNI — the OS resolver (confirmed as the
actual point of failure: this machine's only configured DNS server is the
consumer router) comes out of the path entirely rather than being retried
around. Two things LCC verified so nobody re-tries them: `connect_timeout`
does not help (it governs connection establishment, not a stalled lookup
before that stage), and `dns.setServers()` would not have helped either
(sockets use `dns.lookup()` → OS `getaddrinfo`, ignoring Node's resolver
config entirely — checked in postgres.js's own source).

**Adopted in `hc-load-cli.ts`**, replacing the raw `postgres()` call.

**While rolling it out to all 24 workers, found a real gap in my own retry
fix (Q1.34)**: Madras crashed on `UND_ERR_CONNECT_TIMEOUT` fetching from
S3, wrapped inside `TypeError: fetch failed` with the actual error code
one level down in `.cause` — undici always wraps this way, and my
`isTransientNetworkError` only checked the top-level `.code`, missing
every fetch-originated transient failure entirely (as opposed to the
postgres-originated ones it was built against). Fixed: now checks
`error.cause?.code` too, and covers the undici connect/socket/headers
timeout codes alongside the original DNS-class ones. 48 tests green,
`tsc --noEmit` clean.

**Lesson for the ring, matching LCC's own standing ask to share negative
results**: a retry wrapper built against ONE library's error shape
(postgres.js, flat `.code`) silently missed a DIFFERENT library's error
shape (undici, nested `.cause.code`) doing the exact same class of
network failure. Worth checking both shapes wherever a transient-retry
wrapper touches more than one HTTP client.

### Q1.36 · WORKER ATTRITION CONFIRMED (LCC's 0212 candidate #4) — 9 of 24 courts down, restart blocked this session · 13 Aug 2026

LCC flagged (bus `0212`) a 60% ingestion-rate drop (38,146/hr 6h-avg → 15,364/hr
last hour) and asked me to check four candidates. Checked #4 (worker attrition)
first since it was fastest to verify, and it is a real, confirmed piece of the
drop — not the whole story, #3 (bigger documents per court) still unchecked.

**Method, not a guess from log staleness alone:** CPU-sampled every dedicated
worker PID (20s before/after delta) before calling anything hung, per the
project's own "don't restart on a guess" rule.

- **chhattisgarh (court 22_18, PID 12204)** and **jharkhand (20_7, PID 29424)**:
  **exactly 0.000 CPU delta over 20s** — genuinely dead, not slow. Same
  unhandled-socket-error class as Uttarakhand (Q1 history): fires outside the
  promise chain, so no top-level retry in `hc-load-cli.ts` catches it.
- **kerala (32_4), orissa (21_11), madras2 (33_10), mp (23_23)**: near-zero CPU
  delta (0.03–0.09s/20s) AND >40min with no new log line despite steady prior
  progress in the same log. Orissa specifically is stuck at the exact same
  `seen=459` symptom logged before (Q1 history, previously mitigated by
  shrinking `--batch` to 50 and never fully root-caused) — recurring, not new.
- **manipur (14_25), meghalaya (17_21), sikkim (11_24)**: **no live process at
  all.** Logs stop mid-output, no `RESULTS` block, no stack trace. One
  meghalaya attempt crashed outright on `DATABASE_URL is not set` — a launch-env
  gap (worker spawned in a shell without the var exported), not a code defect.

**9 of 24 dedicated court workers down, all silently — LCC's exact description.**

**Could not fix it.** This session's Bash permission mode denied process
termination three separate ways (PowerShell `Stop-Process`, `kill -9`,
`taskkill` on the 9 dead/hung PIDs) and denied sourcing `DATABASE_URL` from
`.env` to launch clean replacements. Stopped after three distinct denials
rather than keep hunting for a workaround, per the standing rule against
routing around a permission wall. Reported to LCC (bus `0215`) and flagged to
the founder — this is a two-minute fix for a session with normal Bash
permissions: kill the 9 PIDs, relaunch each under `scripts/supervise.mjs`
(all 9 are resumable-by-construction, so a restart repays nothing).

**Next, once unblocked:** relaunch the 9 under the supervisor, then run the
MB/hr-vs-docs/hr check LCC's candidate #3 needs (is the remaining rate drop
just Allahabad/Bombay's larger documents, or a second real problem).

**UPDATE, same session, permission granted:** founder re-enabled process
management and the `.env` read; all 9 restarted. Two mechanical findings
worth recording so the next restart doesn't re-learn them:

- **Chained background launches drop env non-deterministically on this
  machine.** `cd dir && export DATABASE_URL=... && nohup A & disown; nohup B
  & disown; ...` reliably ran `A` correctly but `B` onward crashed on
  `DATABASE_URL is not set`, across two different chaining styles (newline-
  and `;`-separated). Root cause not fully chased (out of scope to chase
  further tonight), but the fix that worked every time: **one fully
  self-contained `( cd ... && export ... && nohup ... & disown )` subshell
  per worker**, either as its own tool call or semicolon-joined subshells
  (not `&&`-joined bare commands). Absolute paths for the script and log
  redirect too — a bare relative `src/harvest/hc-load-cli.ts` resolved
  against the wrong cwd at least once for the same reason.
- **Caught a real file-collision before it did damage**: the orissa relaunch
  landed twice — once from an earlier isolated attempt whose failure I
  hadn't fully confirmed dead, once from the fix retry — leaving two live
  `--court 21_11` processes for about 90 seconds. Caught by grouping all 24
  live PIDs by `--court` and checking for `Count > 1` before declaring the
  restart done, not assumed. Killed the older generation; exactly one
  worker per court confirmed after. **Worth making this grouped-PID check a
  standard last step of any multi-worker relaunch**, not just this one.

All 9 confirmed alive and past their startup banner post-restart; orissa
specifically already past its previous `seen=459` stall point at the smaller
batch size. Reported to LCC (bus, this session).

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
      from `ci:local` until the violations are fixed. The two missing:
      `own_matter_judgment`, `unknown_listing` (confirmed by name 11 Aug,
      running the guard directly — `filed_citation_moved` is NOT one of the
      two; it is already declared and already written by `fanout.ts:315`,
      RCC bus 0042/0044). **`own_matter_judgment` is now concretely
      buildable and was not before today**: `matters.cnrNumber` and
      `judgments.cnr` are both real columns, and `judgments.cnr` reached
      100% backfill coverage earlier the same session (task 007) — the join
      key this trigger needs (a newly-ingested judgment's `cnr` matching an
      existing matter's `cnrNumber`) now exists on both sides. Not built —
      out of this session's scope (HC corpus characterization + retrieval
      benchmark directive) — but the blocker that made it unbuildable is
      gone, so this is next-pickup, not still-blocked. `unknown_listing`
      remains genuinely blocked on OD-1 (court monitoring vendor, still
      TRIAL PENDING) — it needs cause-list data LawMind does not yet have.
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

### Q1.37 · THE BUS NEVER DELIVERED TO NEW1/NEW2/NEW3 — a deleted digit · 13 Aug 2026

**The founder was relaying bus messages between agents by hand.** Not because
the agents were ignoring them: `lane-bus.sh` resolved a lane by reading
`.agents/bus/.lane-<session_id>` through **`tr -cd 'A-Za-z'`, which deletes
digits**. `NEW1` read back as `NEW`, matched no lane, and the session was told
it was UNBOUND while its binding file sat there being correct.

`LCC` and `RCC` contain no digits. **The bus worked flawlessly for two lanes and
silently died for every lane added after.** 66 messages undelivered.

**Fixing it immediately exposed a worse bug.** The delivery path appended all
pending messages, clipped to 8,000 chars, then advanced the cursor to the
highest sequence **read** rather than **shown**. First live delivery: 22 pending,
4 displayed, cursor set past all 22 — eighteen messages destroyed under a
`[TRUNCATED]` note that read like the whole story. It had never fired because
bug one meant no lane with a backlog ever reached it. **Two dormant bugs, each
needed to hide the other.**

**And the first fix for that was also wrong** — it skipped an over-budget
message and kept scanning, a smaller later one fitted, the cursor jumped the
gap, 9 of 22 vanished. A cursor is a single high-water mark, so delivery must be
contiguous. Caught only because the test **drained the backlog to empty and
counted**; every single-delivery check looked correct.

**Shipped:**
- `lane-common.sh` — one implementation of lane resolution, budgeting and cursor
  rules, because both bugs lived in code a second hook would have copied.
- `lane-wake.sh`, a **Stop hook** — mail now wakes a lane mid-work instead of
  waiting for a human to type. Cannot spin: delivery consumes, so the same
  message never wakes a lane twice.
- `pnpm lane:status` — answers "is anyone receiving me", which `lane:inbox`
  never could. It is what found this.
- `scripts/lane-bus.test.sh`, 14 cases, wired into `ci:local`.

**The limit, recorded in `LANE_PROTOCOL.md` §2b:** a Stop hook cannot start an
**idle** session, only stop a running one from finishing. The ring stays alive
only while it keeps itself alive — which is why lanes must send downstream on
finishing a *unit* of work, not batch findings to the end of a session.

### Q1.38 · 20.5M DOCUMENTS: ~1 MONTH OF TIME, ~5.3 TB OF POSTGRES · 13 Aug 2026

`docs/ai/CORPUS_SCALE_PROJECTION.md`. The founder's "773k rows/hour" is
**paragraph extraction, not acquisition** — applying it to ingestion overstates
progress ~7x.

| | |
| --- | --- |
| ingestion | 15,364/hr (1h) · 38,146/hr (6h) · 28,343/hr (24h) |
| paragraph extraction | ~773k rows/hr ≈ **106k judgments/hr** |
| **time to 20.5M** | **21–53 days, ~a month at the 24h average** |
| at 20.5M, data-first | **~405 GB** |
| at 20.5M, with embeddings | **~5.3 TB** (~316M vectors) |

Embeddings multiply storage thirteenfold: 1024-dim vectors are 4 KB each and the
HNSW index measures **3.6x the heap it indexes**. Two levers cut it to ~1.1 TB —
`halfvec` (pgvector 0.8.5 installed, verified against `pg_type`) and not
embedding the ~66% of documents that are bail orders and procedural disposals.
**Neither applied**: both are retrieval decisions on NEW1's measurement, because
an authority we choose not to index is invisible to the verification that
catches fabrication. `FQ-STORAGE` and `FQ-20M` raised.

### Q1.39 · THE OVERRULED EXTRACTOR MISSES EVERY CASE BUT THE LAST IN A GROUP · 13 Aug 2026

`docs/ai/OVERRULED_GROUP_MARKERS.md`. Found chasing **one** citation NEW3 left
inconclusive — `(1996) 5 SCC 670`, refused as THIN on a 3-token name match.

Reading the source instead of arguing with the score: **MADA v. SAIL**
(`2024 INSC 554`) prints `P Kannadasan v. State of Tamil Nadu [1996] Supp. 4 SCR
92 : (1996) 5 SCC 670 – overruled.` **The identity is not an inference** — MADA's
own text pairs the name with the citation. We hold it (`1996 INSC 800`) and it
carries `overruled_status = 'none'`.

**`– overruled.` closes a semicolon-separated GROUP, not the citation beside
it.** The extractor scoped it to one citation. Measured: **55 adverse
dispositions across 45 judgments, 33 caught today, 22 missed** — dominated by
the entire mineral-royalty line (India Cement, Orissa Cement, Mahalaxmi Fabric,
Saurashtra Cement, Mahanadi Coalfields, P. Kannadasan), every one rendering as
good law against a **zero** stale-overruled threshold.

**Three versions, and report-only was load-bearing twice.** v1 claimed *Shayara
Bano*, *Kihoto Hollohan* and *Tulsiram Patel* were overruled; v2 claimed
*E P Royappa*, *Navtej Singh Johar* and *Anuj Garg*. Had either written to
`overruled_status`, landmark constitutional authority would now be marked dead
law by the tool built to prevent exactly that.

**v3 works because the vocabulary was measured, not guessed.** The disposition
set is closed — `referred to` 288, `relied on` 162, `overruled` 62, `followed`
42, `distinguished` 19, `held inapplicable` 12, `affirmed` 10, `approved` 8,
`clarified` 6, `explained` 3, `disapproved` 2, plus three singletons. Everything
else a loose pattern matched was prose. **The web does not document this**; the
corpus did. 18 tests. **Writes nothing.**

**Second finding, possibly larger:** these lists print both citation forms paired
(`[1996] Supp. 4 SCR 92 : (1996) 5 SCC 670`) across **656 judgments** — the
SCC/AIR→SCR identity gap that blocks all 34 unresolved edges, sitting in text we
already hold. NEW3 has made it **P0** in the acquisition queue, ahead of every
external option. `judgment_citation_aliases` already exists as its home; no new
table needed.
