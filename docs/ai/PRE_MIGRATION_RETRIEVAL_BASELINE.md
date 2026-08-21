# PRE-MIGRATION RETRIEVAL BASELINE — 15–16 Aug 2026

**Owner: NEW1.** Captured against the live Railway corpus, ahead of the
Railway → local Postgres migration.

**STATUS: Gate S2 re-run is INCOMPLETE, stopped deliberately. Do not treat
§3 as measured.** §§2, 4, 5 (corpus counts, overruled samples, citation
samples) completed and are usable as-is.

## 0 · Timeline — the surprise, and its resolution

Flagged on the bus (0544) rather than assumed: at capture time, no record of
a decided Railway exit existed in `CLAUDE.md` §4, `docs/OPEN_DECISIONS.md`,
or `docs/FOUNDER_QUEUE.md`. **Resolved by LCC's bus 0541, 15 Aug 18:47:**
founder directive, same day — LawMind is pre-revenue, Railway's monthly burn
is unacceptable, the whole database moves to local workstation Postgres, R2
becomes the durable backup, Railway is shut down once local + R2 are both
independently verified. Confirmed real, not a premature premise.

**Then, 16 Aug: a follow-up directive arrived mid-run** — stop all
nonessential Railway queries immediately, the bill is actively rising. The
Gate S2 re-run this file was built to capture was still in progress (25
queries, embedding + retrieval against production) and was **killed on
receipt**, not allowed to finish. `TaskStop` on the background shell did not
kill the actual DB connection — a full process tree (`bash` → `npx` →
`npm-cli` → `cmd` → `tsx` → `node`, 6 PIDs) survived it and had to be
`Stop-Process -Force`'d individually. **Verified after the fact**: `Get-
CimInstance Win32_Process` swept for `run-cli.ts` again, zero remained. Three
unrelated `psql.exe` connections to the same Railway proxy were left
untouched — they are LCC's Stage A `pg_dump`, someone else's essential
migration traffic, not mine to kill.

**This baseline is still useful for what it does contain.** §2/§4/§5 are
cheap, already-run, single queries — corpus counts and 10 sampled rows — not
the kind of Railway load this stop-order is aimed at. What did NOT complete
is §3, the 25-query Gate S2 pass, which needs an embedder plus per-query DB
round trips and was mid-flight when stopped.

**§2's corpus counts are now known-stale — use `docs/ops/migration/
freeze-baseline.json` instead, not this file, for the migration's own
row-count target.** LCC's freeze data (bus 0546, corrected in the JSON file
itself at 21:00Z) shows the *actual* freeze took two attempts: a taskkill at
19:24Z that NEW2 could not distinguish from an outage and correctly responded
to by restarting their fleet, writing 301,422 more judgments before the real
freeze (NEW2's STOP-file mechanism) held at **20:57Z, 7,296,068 judgments** —
not the 6,994,646 LCC's first message (0546, received this session) reported,
which that same file now marks superseded. My own §2 reading
(6,807,237 / 6,822,267, taken well before either freeze) was never a
candidate for the migration's verification target and was only ever meant
as this session's orientation snapshot; treat it as that, not as competing
with `freeze-baseline.json`.

**Also worth not repeating: NEW2's bus 0552 (delivered this session) reported
"Railway is measurably degrading, count(*) took 48s vs 2s" — that claim was
retracted by NEW2 itself (bus 0557) and confirmed by LCC: the same query
took 12s while LCC's own monolithic `pg_dump` was saturating the shared
proxy. Not a vendor problem, a self-inflicted one.** Recorded here because
the retraction is easy to miss if only the original claim was read, and
because it plausibly also explains this session's own slow reads (§2's
90-second `corpus` CLI call, and generic query slowness observed earlier) —
proxy contention from concurrent lane traffic, not a Railway fault. Not
independently confirmed as the cause of my own readings specifically —
labelled INFER, not KNOW.

## 1 · Identity — what this baseline is a snapshot of

| | |
| --- | --- |
| captured | 2026-08-15, this session |
| commit | `8f49c1eb1bb75ccc4265c7532473402799a5952e` |
| schema version | migration `0051` (`packages/db/drizzle/0051_enrichment_legal_object_tasks.sql`), latest applied |
| benchmark version | `pnpm harness` (Gate S2), `services/harness/src/run-cli.ts`, unmodified |
| benchmark query set | `queries.derived.json` (20: 10 criminal, 10 civil) + `queries.hand.json` (5 Hindi) = 25 of the harness's own `TARGET_QUERIES = 30` |
| raw JSON artifact | **DOES NOT EXIST.** `.agents/baselines/pre-migration-baseline-2026-08-15.json` was the intended target (`HARNESS_JSON`, gitignored, same convention as `gate-s2-rerun.json` in Q1.26) but `writeFileSync` only fires at the end of `main()`, and the run was killed before reaching it — confirmed empty by listing the directory post-kill. See §0/§3. |
| database | Railway Postgres, `hayabusa.proxy.rlwy.net:24909/railway` (proxy id current at capture time) |

## 2 · Corpus counts, at capture time

Via `pnpm --filter @lawmind/harness corpus` (`countCorpus`):

| | |
| --- | --- |
| judgments | 6,807,237 |
| embeddedChunks | 620,300 |
| resolvedCitations | 115,041 |
| overruledJudgments | 95 |
| hindiJudgments | 0 |
| criminalJudgments | 1,155,178 |
| civilJudgments | 328,992 |

**Read this against known volatility, not as a stable denominator**: LCC's
0534 reports citation resolution at 13.63% in *production* with a 30.0%
dry-run projection stuck behind the same orphaned backend `FQ-PGKILL`
describes, and NEW2's 0508 names a 7.69M-document 2016–2022 gap still being
filled. A post-migration re-run comparing against this table should expect
`judgments` and `resolvedCitations` to have moved from ingest/enrichment
continuing, not only from any migration — the two are not separable from
count deltas alone.

**Corroborating read, ~30–60 min later, before the run was killed (§3):**
`pnpm harness`'s own startup line printed `68,22,267 judgments` (6,822,267) —
+15,030 over the `corpus` CLI reading above, consistent with the active
ingest fleet rather than anything migration-related.

## 3 · Search results and exact evidence — Gate S2 re-run — **INCOMPLETE, STOPPED**

**Do not treat this section as measured.** The 25-query re-run (production
`hybridSearch`, unmodified `pnpm harness`) was started, got through corpus
validation and printed its header, then was mid-flight scoring queries
against Railway when the 16 Aug stop-order arrived. **Killed on receipt** —
see §0. `HARNESS_JSON`'s `writeFileSync` only fires at the very end of
`main()`, so **no JSON artifact exists**:
`.agents/baselines/pre-migration-baseline-2026-08-15.json` is empty/absent,
confirmed by listing the directory after the kill.

What did print before the kill (not a result, an orientation only):

```
LAWMIND GATE S2 — citation accuracy harness
corpus  68,22,267 judgments · 6,20,300 embedded chunks · 1,15,041 citation edges · 95 overruled
queries 25 of 30
        5 × bns NOT WRITTEN — Workstream C1 — statute_mappings holds no rows
```

Zero per-query ranks, zero `success@5`/`precision@5`/`recall@20`/`MRR`/`DRM`,
zero structured-gate or overruled-leakage/staleness results were produced.
**None of `hallucinationRate` / `silentDropRate` / `adversarialPassRate` were
attempted either** (they run after retrieval scoring, which never
completed) — same "not measured" outcome §3 would have carried anyway, since
neither `OPENROUTER_API_KEY` nor `ANTHROPIC_API_KEY` is set here, but now for
two compounding reasons instead of one.

**The post-migration gate does not need this section repeated in full.**
Per the 16 Aug directive: the post-migration comparison uses the subset
already measured (§2 corpus counts, §4 overruled rows, §5 citation rows)
plus smaller deterministic probes run fresh against local Postgres — not a
race to re-run the full 25-query Gate S2 pass against Railway before
cutover. A full Gate S2 pass belongs in the *local* environment once
`LOCAL_READY_FOR_POST_MIGRATION_GATE` arrives, per §6.

## 4 · Known overruled-status cases

Five most-recently-changed `overruled_status <> 'none'` rows, pulled directly
(`overruled_status_changed_at DESC NULLS LAST`), for post-migration spot
comparison — same id, same status, same `overruled_by_judgment_id` expected:

| id | case | status | overruled by |
| --- | --- | --- | --- |
| `ffda795d-e296-4f72-918d-3d425a0c1ba6` | NEW INDIA ASSURANCE CO. LTD. v. R. SRINIVASAN | set_aside | `fb20f8d5-c54f-4087-b092-92b43cb166a5` |
| `f9885dbe-7486-41c8-bcb0-add10eb37c28` | M/S SUN EXPORT CORPORATION BOMBAY v. COLLECTOR OF CUSTOMS, BOMBAY AND ANR. | set_aside | `2d4ae970-0def-46a4-85ba-70e840d8f569` |
| `f09f8d00-94f4-4ff2-8f04-3ad1f864af17` | VIJAY KUMAR MISHRA AND ANR. v. HIGH COURT OF JUDICATURE AT PATNA AND ORS. | set_aside | `bd04ebf4-cedd-4f4a-88d4-20fa496acd18` |
| `eecc8f01-f84d-4864-8fdb-f989638d22f3` | M/S. RAINBOW COLOUR LAB AND ANR. v. THE STATE OF MADHYA PRADESH | set_aside | `3e64f14a-8c98-4a88-9a46-44911328772d` |
| `d27280d5-d05a-40b4-9cef-4fa24583ebd8` | RITU MAHAJAN v. INDIAN OIL CORPORATION & ORS. | set_aside | `c61ca820-0722-40fa-a45a-997232897d59` |

**Not independently exercised by Gate S2's own `overruledLeakage` /
`staleOverruled` checks** — those live inside the run that §3 records as
incomplete. This table is the only overruled-status evidence this baseline
actually has; treat it as the pre-migration reference, not as a cross-check
of a graded run that never happened.

## 5 · Citation lookup examples

Five real `judgments` rows, sampled for their `reporter_citations` /
`neutral_citation`, to re-resolve post-migration via `cite:"..."` and confirm
identical `matched` outcome and identical resolved id:

| id | case | neutral citation | reporter citation |
| --- | --- | --- | --- |
| `78ef7fdc-9e28-482b-bcc8-db04fe3eb24f` | PANDURANG & ORS. v. STATE OF MAHARASHTRA | 1986 INSC 207 | [1986] 3 S.C.R. 1004 |
| `20a2b2c4-ba78-422d-a120-e6c5e60e3553` | M/S ASHOKA SMOKELESS COAL IND. P. LTD. AND ORS. v. UNION OF INDIA AND ORS. | 2006 INSC 943 | [2006] SUPP. 9 S.C.R. 954 |
| `5c62ae39-5f79-4bf9-8171-4ac9b64b8488` | URMILA ROY & ORS. v. M/S.BENGAL PEERLESS HOUSING DEVELOPMENT COMPANY LTD. & ORS. | 2009 INSC 389 | [2009] 4 S.C.R. 834 |
| `daf3d53d-f2b5-4e81-958b-7d49910c136d` | DEVATA PRASAD SINGH CHAUDHURI AND OTHERS v. THE HONBLE THE CHIEF JUSTICE AND JUDGES OF THE PATNA HIGH COURT | 1961 INSC 249 | [1962] 3 S.C.R. 305 |
| `ef4eadf6-07b6-45f5-969a-32d6836800b1` | MAHARAJA PILLAI LAKSHMI AMMAL v. MAHARAJA PILLAI THILLANAYAKOM PILLAI AND ANOTHER | 1987 INSC 311 | [1988] 1 S.C.R. 780 |

Plus two standing regression cases, neither yet run against this corpus this
session — both go in the post-migration probe set (§6):

- `docs/CITATION_HARNESS.md`'s own example: `cite:"2020 INSC 189"` must
  continue to resolve `ambiguous` with the same three distinct judgments
  (same date, same court, different parties) — a migration that silently
  collapsed this to `matched` or `no_match` would be a real regression, not
  noise.
- **Named explicitly by the 16 Aug post-migration-gate directive**:
  `cite:"(1994) 3 SCC 1"` → *S.R. Bommai v. Union of India*. Not yet
  looked up against this corpus — first run of it belongs post-migration,
  per §6 below, not as more Railway load now.

## 6 · WAITING FOR LOCAL — current state, 16 Aug 2026

**No further Railway DB traffic from this lane until LCC sends
`LOCAL_READY_FOR_POST_MIGRATION_GATE`.** Per the 16 Aug directive: static
code inspection, diff-tooling prep, and documentation only until then.

### What ships as soon as local is ready — a small, deterministic probe set, not a full Gate S2 re-run first

1. **`cite:"(1994) 3 SCC 1"` → S.R. Bommai v. Union of India.** Named
   explicitly; run first.
2. **`cite:"2020 INSC 189"` → still `ambiguous`, same 3 judgments.**
3. **The 5 overruled-status ids in §4, by id** — same `overruled_status`,
   same `overruled_by_judgment_id`. `set_aside` disables add-to-matter; a
   flip to `none` post-migration is a P0, not a diff-log entry.
4. **The 5 citation samples in §5, by id** — `cite:"<neutral_citation>"` and
   `cite:"<reporter_citation>"` both resolve `matched` to the same id.
5. **Corpus counts, re-run via `pnpm --filter @lawmind/harness corpus`** —
   compared against `docs/ops/migration/freeze-baseline.json`'s
   **7,296,068 judgments at 20:57Z, 15 Aug** (the actual, twice-corrected
   freeze target), NOT this file's own §2 (a pre-freeze orientation snapshot,
   see §0). `judgment_paragraphs`/`judgment_citations` were not re-counted at
   the 20:57Z freeze either — that file says explicitly to re-count them from
   the frozen source at its own "STAGE F", not carry forward any earlier
   number, mine included.
6. **A representative Gate S2 subset** (not necessarily all 25 — the
   directive's own wording), scored the same way §3 would have been, with
   `goldRanks` compared where §3 has nothing to compare against (it does
   not, per the STOPPED status above) — so this is the FIRST real Gate S2
   read against this corpus shape, not a diff of two runs. Framed as a fresh
   floor, not a regression check, precisely because §3 never produced a
   baseline to diff against.
7. **Duplicate collapse and exact-span (`exactSpan`) integrity** — per the
   directive's own list; `content_hash` behaviour documented in
   `docs/ai/HELD_NOT_RETRIEVED_DECOMPOSITION.md` §4a is the mechanism to
   re-check, not re-derive.

### Correctness before performance

LCC observed `random_page_cost` 4.0 (Railway) vs 1.1 (local), and the large
full-text index may plan differently. **Ranking MAY legitimately change from
this.** Latency improving locally is expected and not a finding. Neither is
graded here — this baseline proves *semantic equivalence* first (same
authority, same citation resolution, same evidence text, same currentness,
same duplicate identity). Performance is a separate, later measurement, per
the directive's own ordering.

### What sends `POST_MIGRATION_RETRIEVAL_GATE_PASS` to LCC

Only once every check in the list above matches, or every difference found
is explained in writing — not asserted as "the database migrated
successfully." Any unexplained change in correct authority, citation
resolution, evidence text, currentness, or duplicate identity blocks it.

## 7 · THE RUNNER EXISTS — built 16 Aug 2026, while the restore was running

**`pnpm --filter @lawmind/harness gate:postmigration`.** Everything §6 listed
is now a command rather than a plan, written during the wait so that the gate
costs minutes when `LOCAL_READY_FOR_POST_MIGRATION_GATE` arrives instead of
being designed then.

| | |
| --- | --- |
| grading logic, pure, no database | `services/harness/src/post-migration.ts` |
| its own unit tests, **43, every FAIL branch exercised** | `services/harness/src/post-migration.test.ts` |
| the runner | `services/harness/src/post-migration-cli.ts` |
| fixtures, copied from §4/§5 of this file | `services/harness/src/fixtures/post-migration-probes.json` |
| report written to | `docs/ops/migration/post-migration-gate.json` |

### It refuses Railway before it opens a connection

`classifyDatabaseUrl` is an **allowlist of local hosts, not a denylist of
Railway names** — a denylist passes the moment the rollback copy answers to a
new proxy hostname or a tunnel. `DATABASE_PUBLIC_URL` is refused by VARIABLE
NAME regardless of where it points. Variable order is
`POST_MIGRATION_DATABASE_URL` → `LOCAL_DATABASE_URL` → `DATABASE_URL`, with
`DATABASE_URL` last precisely because it still points at Railway until cutover.

**Observed, not asserted:** run against `hayabusa.proxy.rlwy.net` it prints
`REFUSED — no connection was opened` and exits 2; against an arbitrary
non-Railway remote host it refuses for the other reason and exits 2.

### The eight classes, and where each fixture came from

| class | what it grades | fixture source |
| --- | --- | --- |
| A citation identity | 5 neutral + 5 reporter citations resolve to the **same judgment id**; `cite:"(1994) 3 SCC 1"` → Bommai | §5 of this file; `deployed-safety.ts` `PROBE_CASES` |
| B ambiguous | `cite:"2020 INSC 189"` still `ambiguous`; `cite:"(9999) 99 SCC 999"` still `no_match` | `deployed-safety.ts` |
| C currentness | the 5 `set_aside` rows by id, **plus** that retrieval SERVES the stored status live | §4 of this file |
| D exact evidence | the two table-wide offset signatures + a deterministic 300-chunk span re-resolve, + `exactSpan` from a live search | `verify-exact-span-cli.ts`'s own invariant |
| E duplicate collapse | no two results share a non-null `content_hash`, aimed at a real duplicate group | `retrieve.ts`'s stated rule |
| F three arms | sparse/dense/hybrid each answer; hybrid ⊆ sparse ∪ dense ∪ {pinned}; the citation pin holds | — |
| G paragraph fallback | a chunkless judgment, addressed by its unique title, is served verified paragraph evidence with a span | `retrieve.ts` `fillParagraphFallback` |
| H generated column | catalogue `attgenerated`/expression for **both** stored generated columns, plus a WRITE probe | `schema.ts`, migrations `0004`/`0005` |

**No new gold was invented.** Every literal above already existed in this repo.

**Amended 17 Aug 2026, after the power loss, by re-reading the gate rather than
re-running it** (there is still no database to run it against). Class G decided
which candidate titles were unique with `count(*) WHERE case_title = $1` **once
per candidate, up to 25 times**; it is now one grouped `= ANY(...)`. Identical
verdicts, one round trip instead of twenty-five.

Worth keeping for the reason it was written wrong: `judgments.case_title` **has**
an index — `judgments_case_title_trgm`, `gin (case_title gin_trgm_ops)`,
migration `0026` — and my first draft of the fix asserted in a comment that it
had none. Both the original defect and the wrong justification for fixing it
came from reasoning about the schema instead of reading it. The comment now
states what the index is and explicitly does **not** assume whether that opclass
serves bare equality on this Postgres version, because the batched form is
correct either way.

That reading is also what surfaced §NEW1.M2 in `docs/CURRENT_PLAN.md` —
`exactCaseTitle`'s normalised-title predicate cannot match that index at all, and
`CASE_NAME_RE` fires it on ~57% of searches. **Queued for measurement after this
gate passes, not before it.**

**The class-H write probe's rollback changed too, for the same reason and with
the same lesson.** It ended with a raw `ROLLBACK` inside a driver-managed
`sql.begin(...)`, and I recorded on the bus that its behaviour could not be
established without a live Postgres. That was wrong: it needed
`node_modules/.pnpm/postgres@3.4.9/.../src/index.js`, not a database. `begin()`
sends `commit` when the callback resolves and `rollback` when it **throws**, so
the raw statement ended the transaction and left the driver committing into no
transaction — a Postgres *warning*, not an error, so it worked by accident. It
now throws a module-level `Symbol`, caught by identity, using the driver's own
rollback path; a callback that resolves without measuring is graded FAIL rather
than defaulted.

**Verified after both changes:** harness typecheck clean, `post-migration.test.ts`
43 pass / 0 fail, whole harness suite **190 pass / 0 fail** with `DATABASE_URL`
cleared so `hard-negatives.live.test.ts` skips visibly instead of querying
Railway. Still **zero database connections opened by this lane**, of any kind.

### Class H answers LCC's ask, and does it without touching a canonical row

LCC's finding was that a schema comparison checking name/type/nullability would
have missed a generation expression being lost — every existing row still looks
right, because the values were dumped and restored, and nothing shows until a
WRITE, at which point new judgments become invisible to full-text search and no
error is ever raised.

So the probe writes, and writes somewhere disposable:

    CREATE TEMP TABLE … (LIKE public.judgments INCLUDING GENERATED …) ON COMMIT DROP
    → INSERT, read the tsvector → UPDATE the source text, read it again → ROLLBACK

**`LIKE … INCLUDING GENERATED` is what makes the clone a test of the SOURCE.**
If `judgments.full_text_tsv` had come back as an ordinary column, the clone's
column would be ordinary too and the INSERT would leave it NULL. Three outcomes
are distinguished on purpose: never populated (expression gone), populated but
frozen across the UPDATE (**worse** — it reads as maintained until the text
changes), and correct. `statute_sections.full_text_tsv` — the second stored
generated column, `to_tsvector('english', coalesce(heading,'') || ' ' ||
section_text)` — gets the same treatment.

### Correctness blocks; performance is recorded and blocks nothing

`INFO` is a first-class verdict, never a soft failure and never counted as one.
It carries the things LCC said in advance would legitimately move —
`random_page_cost` 4.0 vs 1.1, whether the planner CHOOSES
`judgments_full_text_idx` locally where Railway refuses it, per-check
milliseconds — and the things this corpus may simply not contain. A probe with
nothing to aim at says so rather than reading green.

**One number IS graded as an equality: `judgments` against
`freeze-baseline.json`'s 7,296,068.** Not a floor. Fewer means rows were lost;
MORE means something wrote to local during the restore, and the comparison this
whole gate rests on no longer holds. `judgment_paragraphs` / `judgment_citations`
are recorded as INFO only, because that same file says in writing that its
19:33Z figures for them are stale and must be re-counted from the frozen source.

### The register of differences that are EXPECTED — named in advance, 17 Aug 2026

**Written down before the run, deliberately.** A difference explained after the
fact is indistinguishable from a difference explained away; these were declared
by LCC (bus 0578) while the gate could still be changed, and the gate does not
grade any of them.

| declared difference | why it is not a defect | what it WOULD look like if it were |
| --- | --- | --- |
| `full_text_tsv` **recomputed locally**, not carried across — `COPY` refuses generated columns, so `judgments` and `statute_sections` are rebuilt and this server recomputes both tsvectors | same expression, same `'english'` regconfig, taken from the schema archive | class H FAILs on one of three now: `attgenerated` is not `'s'`; the expression does not normalise to the declared one; or **`tsv-matches-recomputation`** finds a stored tsvector the expression does not reproduce |
| **collation** libc `en_US.utf8` (Railway) → ICU `en-US` (local) | `MIGRATION_RUNBOOK` §3, by design; text `ORDER BY` may legitimately reorder | a change in WHICH judgments come back, not their order — classes A–E all key on ids and citations, none on text ordering |
| **PostgreSQL 18.6** locally | a different major version plans differently | any class A–H FAIL; a plan change alone is INFO |
| `random_page_cost` 4.0 → 1.1, index choice, latency | infrastructure, LCC's §M3.5 prediction | never graded — INFO on the `tsv-index-plan` line |
| **`cite:"…"` costs ~14m39s** — `countStructured` builds `A OR B OR C` where B is `EXISTS(unnest(reporter_citations)…)`, unindexable, so no BitmapOr and a seq scan of 7.3M rows (LCC 0593) | **query shape, not the migration.** The 167 indexes are identical both sides. My own §5 records that this query was NEVER run against Railway — so **neither lane may call it pre-existing or a regression**; it is a NEW measurement with no delta | a citation resolving to the WRONG id, or to `no_match`. The clock is not the check |
| **Full-text tokenisation differs on 119 of 28,425 rows** (LCC 0593). `full_text` is byte-identical, md5-verified; only the tsvectors differ. Devanagari-bearing rows: **85 of 163, 52%**. ASCII-only: 34 of 28,262, **0.12%** | **malformed** Devanagari — vowel signs in visual order from PDF extraction, and glibc vs Windows classify a *leading* combining mark differently. Correct Devanagari is identical on both sides | **if Hindi probes move, look here first, not at retrieval code.** English at 0.12% is the same phenomenon inside mixed-script documents |

**LCC's own instruction, kept verbatim because it names the first suspect:** *if
the post-migration diff shows full-text ranking drift, the recomputation is the
first place to look, not the retrieval code.* Class H is what turns that from an
inference into an answer — it reads the expression actually installed, so a
regconfig that drifted is reported directly rather than deduced from a ranking
change.

**A check added because of that message, and it is not the tautology it looks
like.** `tsv-matches-recomputation` compares the STORED tsvector against
`to_tsvector('english', full_text)` computed at run time, over 500 rows
deterministic by id — small on purpose, because the defect is systematic (a load
path that wrote the column wrote it for every row it touched) while the cost is
not: this check must detoast `full_text` for every row it reads. For a generated
column those agree by construction *only
when every row was generated*; a row whose tsvector was **written** — loaded into
a column that was temporarily plain, which is precisely `MIGRATION_RUNBOOK` §4d's
first workaround — is not recomputed merely because the column is generated
again afterwards. LCC's landed fix never alters the real table; this is what
makes that claim falsifiable instead of trusted. A catalogue PASS beside a
recomputation FAIL says something exact: **the expression is right and the data
was not produced by it.** Rows over 200,000 characters are excluded and named,
because `to_tsvector` raises above the 1 MB tsvector limit and this corpus holds
judgments of 2.9M characters — excluded from the denominator, never counted as
agreeing.

**The target, confirmed and guard-tested**:
`postgresql://postgres@127.0.0.1:5432/lawmind`. `classifyDatabaseUrl` was run
against that exact string — `{"ok":true,"host":"127.0.0.1"}` — plus the
`postgres://` scheme, a `localhost` form and `[::1]`. All four open. Checked
because a refusal guard that also refuses the real target is discovered at the
worst possible moment.

**Do not run the gate on the strength of this section.** As of bus 0578 the data
phase is complete and every row count matches the frozen source, but **the
indexes are not built and `compare.mjs` has not run** — every query would seq-scan
and every number would be garbage. The gate waits for
`LOCAL_READY_FOR_POST_MIGRATION_GATE` **in a message subject**, not for a mention
of it in prose.

### Two traps on the local cluster that would have made this gate LIE — NEW2, bus 0580

Measured by NEW2 on the local cluster, adopted here without reproducing them
(this lane has still opened no connection).

**1 · `judgments` may not be the table holding the data, and nothing is lost.**
LCC's rebuild loads into `public.judgments__stage`; the power loss landed before
it finished, so the corpus sat in the stage table — 7,296,068 rows,
`max(created_at)` matching NEW2's last write to the millisecond. **Run then, this
gate would have printed `judgments-count` FAIL, expected 7,296,068, actual 0**,
with every downstream class failing behind it. Wrong in the most expensive
direction: it reads as catastrophic data loss at the moment someone might respond
by re-restoring 40 GB or rewinding ingest checkpoints.

**These are point-in-time readings and the state has already moved twice —
do not treat any row count in this section as current.** `judgments` empty +
stage full was true at **20:25Z**. By **21:00Z** LCC was refilling `judgments`
directly from the stage table, that refill had itself crashed at ~20:39 and
restarted, and 8 load backends were running. Only the *mechanism* below is
durable.

**Now a PRE-FLIGHT REFUSAL, before anything is graded.** Exit 2 with a
diagnosis, never a FAIL: a FAIL says the migration is broken, this says **the
gate cannot answer yet**, and only one of them invites a 40 GB re-restore.

**Keyed on the stage table EXISTING, not on `judgments` being empty** — and that
distinction stopped being theoretical 40 minutes after it was written. NEW2's own
version fired only at a count of 0; the cluster then crashed mid-refill and
recovered with partial rows committed in batches, leaving `judgments` holding
*some* rows while the stage table still existed. An empty-only test grades that
half-loaded table and reports the shortfall as an unexplained deficit — the exact
wrong answer the check exists to prevent.

**A count then decides refuse-vs-warn, and is paid only when the stage table is
present.** `to_regclass` is instant; `count(*)` here is minutes. The count exists
because a *completed* load may legitimately leave the artefact behind — NEW2
reports LCC refilling `judgments` FROM the stage table rather than renaming it
into place, so its disappearance marks completion while its presence does not
mark incompleteness. Refusing on existence alone would then refuse a healthy
database. **Rather than depend on someone else's cleanup step, the guard decides
from the row count**, which is the thing actually being asserted: equal to the
frozen target → warn and proceed; anything else → refuse.

**2 · The crash discarded the statistics collector.** `n_live_tup` reads 0 for
every table including one of 22 GB, and `reltuples` reads -1 with `relpages = 0`.
Only a real `count(*)` means anything on this cluster right now.

**The gate was already safe** — `counts()` and the class-H sample are `count(*)`
throughout, and its only `pg_class` read is the generated-column catalogue lookup.
**One file over was not:** `held-not-retrieved-cli.ts` printed a corpus snapshot
from `reltuples`, labelled "approx", which would have recorded `~-1` for a 22 GB
table beside a measurement. It now prints `not analyzed (no estimate)`. That is
the `held:decompose` path — the work queued immediately after this gate — so the
warning arrived inside the window where it mattered.

**The transferable half, in NEW2's framing:** content in the table survives a
crash, counters about the table do not. Both lanes have been leaning on cheap
catalogue reads this week to avoid full scans; this is that habit's failure mode.

**2a · ANSWERED, and the check I proposed would ITSELF have lied.** LCC (bus
0595) confirms `ANALYZE` ran — `restore-chunked.mjs --post-data` as its final
step, 27s, after all 167 indexes built with 0 errors. **But `last_analyze` reads
`NEVER`**, because `pg_stat_user_tables` is a statistics-collector view and a
crash resets it, while `pg_statistic` is a WAL-logged catalogue and survives:
**790 `pg_statistic` rows, 33 column stats on `judgments`, `reltuples`
7,333,718.** So the statistics are real and the `random_page_cost` measurement is
legitimate. The gate reads `reltuples`/`relpages`, not the timestamp, which is
the right side of that distinction by luck as much as design — I proposed the
concern, LCC supplied the trap inside it. **Counters lie after a crash;
catalogues do not** — the third instance of that same lesson in two days, after
NEW2's `n_live_tup` and `n_tup_ins`.

**2b · The same wiped statistics would have faked a refutation of LCC's own
prediction.** `tsv-index-plan` is the INFO line LCC asked for: does local at
`random_page_cost` 1.1 CHOOSE `judgments_full_text_idx` where Railway at 4.0
refuses it (§M3.5)? With `reltuples = -1` and `relpages = 0` the planner has no
size information for `judgments` and plans it as tiny — and a tiny table is
sequentially scanned **whatever `random_page_cost` is**. Printed bare, "planner
refuses" reads as **prediction refuted**, when the cause is that `ANALYZE` has
not run since the rebuild. It is the first measurement anyone takes of that
prediction, so the wrong reading is the one that gets recorded and quoted.

**The line now reads its own precondition** — `pg_class.reltuples`/`relpages` —
and, when statistics are absent, says so in the same breath and states that the
plan is not evidence either way. Raised with LCC (bus 0592) as something to
settle **before** sending the signal, since afterwards is too late to
un-contaminate it. `restore-chunked.mjs` does run `ANALYZE`, but inside the
`--post-data` branch *after* `finishStaging()` and `pgRestoreSection('post-data')`
— and "stage table gone, index set unconfirmed" (NEW2, 0590) is exactly the
signature of that branch having started and not finished.

**3 · A third indicator that lies, and it is the one anyone checks first.**
`LawMindPostgres` starts Postgres with `pg_ctl … -w -t 120`. Crash recovery took
**150.86 s**, so `pg_ctl` gave up at 120 s and the scheduled task recorded
`LastTaskResult: 1` — for a start that **succeeded**, with the server reporting
`ready to accept connections` thirty seconds later. NEW2 raised it with LCC
(bus 0585) as theirs to change. Recorded here only so that, on the morning this
gate finally runs, **a `1` from that task is not read as a dead cluster** and
does not send anyone diagnosing an outage that did not happen.

### Two additive changes outside this lane, both one line

`services/api/package.json` gained `./search/structured` and
`./judgments/paragraphs` to its `exports` map — the gate calls
`answerStructured` and reuses `resolveExactSpan` rather than re-implementing
either. Same additive precedent that file already records for `./llm/call`
(NEW1, 14 Aug). No API behaviour changed.

### `held:rrfsim` — still parked

The 16 `DENSE_OK_BUT_MISSED` anomalies from
`docs/ai/HELD_NOT_RETRIEVED_DECOMPOSITION.md` §4b/4c remain INFER, not KNOW.
`held:rrfsim` runs **locally, after** the correctness gate above passes —
not before, and not as a reason to delay `POST_MIGRATION_RETRIEVAL_GATE_PASS`
or the Railway deletion it gates.

## 8 · THE RUN — results as they land, 17 Aug 2026

**In progress. Not a verdict.** Written as each stage persists so that a crash
loses the run and not the record. Signal received bus 0593; target
`127.0.0.1` from `LOCAL_DATABASE_URL` — the gate chose that variable over
`DATABASE_URL`, which still points at Railway, which is the ordering it was
built for.

Run as `--only C,D,E,F,G,H` first, citation classes A/B after: at ~9 minutes a
`cite:` probe, grading the cheap classes first buys a correctness answer in the
hour rather than the afternoon.

### Class C — currentness · **11 PASS · 0 FAIL**

| check | result |
| --- | --- |
| `judgments-count` | **PASS — exactly 7,296,068**, the one graded equality in the gate |
| `judgment_paragraphs` / `citations` / `chunks` | 27,967,835 · 1,734,857 · 620,300 — INFO, and all three match LCC's 0593 independently |
| the 5 `set_aside` rows by id | **PASS ×5** — same status, same `overruled_by_judgment_id` |
| the same 5 through retrieval | **PASS ×5** — retrieval serves the stored `overruled_status` LIVE, which is `CITATION_HARNESS.md`'s never-cached rule and the half a column inspection cannot reach |

**An unplanned cross-check that is worth more than the checks that were
planned.** `currentness-population` reads **set_aside 70 · partly_set_aside 8 ·
doubted 17 = 95**. §2 of this file recorded `overruledJudgments` **95** against
Railway on 15 August, before the freeze. **Exactly equal**, across a migration,
a different server, a different collation provider and four crashes — and
measured two entirely different ways (a `countCorpus` helper then, a grouped
count now). `judgments` itself moved 6,807,237 → 7,296,068 over the same window
because ingest continued; the overruled population did not, because overruled
enrichment was not running. Both numbers behaving as their own history predicts
is a stronger signal than either alone.

### The `cite:` cost, measured — 5 samples against LCC's 1

LCC reported **14m39s** for `cite:"(1994) 3 SCC 1"` (bus 0593). The five
`live-read` probes in class C are the same code path against the same table:

    347,952 ms · 431,992 ms · 487,522 ms · 603,039 ms · 604,985 ms
    range 5.8–10.1 min · mean ~8.9 min

So the true cost is **roughly 6–10 minutes**, and LCC's single sample sits at the
top of that range — plausibly taken while their own restore work was competing
for the disk. **Not a correction to their finding, which stands**: the plan is a
sequential scan of 7.3M rows forced by an `A OR B OR C` predicate whose middle
arm is unindexable. Only a refinement of its magnitude, from one sample to six.
It also prices the rewrite LCC has taken as theirs: at ~9 minutes a probe, this
gate spends about three hours inside that one query shape.

### Classes D, E/F, G, H — 28 more PASS, and one FAIL that was MINE

| class | result |
| --- | --- |
| **D · exact evidence** | **3 PASS.** No chunk carries the `char_offset=0` signature; no span runs past the end of its own `full_text`; **300 chunk spans re-resolve byte-identically**. Both table-wide signatures are clean, so the sample is not luck |
| **F · three arms** | **6 PASS.** sparse 9 · dense 10 · hybrid 10 results; `fusion-provenance` confirms every hybrid result came from an arm or the exact-lookup pin — nothing invented; the citation pin holds at rank 1 in **both** sparse and hybrid |
| **E · duplicate collapse** | 2 PASS on distinct-hash invariants — **plus one vacuous pass, see below** |
| **G · paragraph fallback** | **PASS.** A chunkless judgment, addressed by its own unique title, is served 253 chars of verified evidence out of `judgment_paragraphs` with an `exactSpan` |
| **H · generated columns** | **6 PASS · 1 INFO**, after a false FAIL was fixed |

#### The vacuous pass — `collapse-known-duplicate` graded 0 as success

It reported *"a 2-row duplicate group occupies 0 result slot(s), as designed"*
and counted it **PASS**, because the threshold was `≤1`. **Zero satisfies ≤1 and
proves nothing** — neither member of the group came back at all, so the collapse
was never exercised. This file's own rule for every other probe is that *a probe
with nothing to aim at says so rather than reading green*; this branch did not
follow it.

Fixed twice over: **0 is now INFO**, worded as *a gap in the evidence, not
evidence that collapse works*; only exactly 1 is PASS. And the probe now tries up
to **5** duplicate groups and grades the first one the search can actually reach.
The miss is understood, not mysterious — `exactCaseTitle` declines to pin when
two rows share a title, so the group can only arrive via the sparse ranker.

#### The FAIL was mine, and proving it mattered more than fixing it

`generated-statute_sections.full_text_tsv` FAILED as *"generated, but from a
DIFFERENT expression than the schema declares"*:

    declared   to_tsvector('english', coalesce(heading, '') || ' ' || section_text)
    printed    to_tsvector('english'::regconfig, ((COALESCE(heading, ''::text) || ' '::text) || section_text))

**Identical.** `||` is left-associative, so `a || b || c` *is* `((a || b) || c)`;
Postgres re-prints the parentheses explicitly. `normaliseExpr` stripped casts,
quoting and whitespace but not parentheses.

**The fix is not another string-mangling rule** — each one is a fresh chance to
normalise away a difference that matters. The declared expression is now handed
to Postgres on a throwaway temp table and read back through `pg_get_expr`, the
same printer that produced the real one. **Canonical against canonical**: the
re-run returns the two strings byte-identical, which is proof rather than an
argument. A formatting difference cannot survive that comparison and a semantic
one cannot hide in it — and a class-H FAIL nobody believes is exactly how a
genuinely lost generation expression would get waved through.

#### Two results that answer questions older than this gate

- **`tsv-matches-recomputation` PASS** — 500 judgments, every stored tsvector
  equals `to_tsvector('english', full_text)` computed now. LCC's rebuild
  **generated** the column rather than writing it, so `MIGRATION_RUNBOOK` §4d's
  fix is confirmed under test instead of asserted.
- **`random_page_cost=1.1 · planner CHOOSES judgments_full_text_idx`.**
  **LCC's §M3.5 prediction is CONFIRMED.** Railway at 4.0 refused that 15.5 GB
  GIN index and took a parallel seq scan; local at 1.1 takes the index. The
  missing-statistics precondition guard correctly stayed silent, because
  `ANALYZE` really had run (bus 0595).

**Classes A and B had not run at this point, and the runner says so in its own
output** — *any class never run is simply absent, which is NOT a pass*. No
`POST_MIGRATION_RETRIEVAL_GATE_PASS` was sent on the strength of 39 green lines
with the citation classes missing.
