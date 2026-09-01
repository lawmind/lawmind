# NEW2 R20 — the shared neutral-citation token boundary

**Lane** NEW2 · **HEAD at start** `90547174` (LCC R18) · **Network** none ·
**DB writes** 0 · **DB migrations** 0 · **NEW1 interrupted** no

R18 fixed the `-DB`/`-FB` boundary in `harvest/hc-load.ts` and said so plainly:

> `citations.ts` carries the same regex for CITED references and is **NOT**
> changed: that moves the edge key space while `CITATION_BULK_APPLY = HOLD`.

LCC R17 then measured the consequence from the other side — the copy R18 left
alone is the copy `/search` runs on every bare-citation query — and could not
close it, because closing it is a NEW2 write. This round is that write, plus the
measurement that says what it costs.

**The correction is to future extraction only. Nothing stored moved.**

---

## 1. Precheck

| | |
|---|---|
| `HEAD_START` | `9054717406cfd23de73aecb50bbcac784781ed48` |
| `WORKTREE` | shared, dirty with other lanes' operational artifacts; nothing of mine staged before the commit |
| `LEASES` | `NEW2` RELEASED · `GIT_COMMIT` RELEASED by LCC at 05:50:44Z · `HEAVY_BOX` HELD by NEW1 and **not taken** |
| `NEW1_HEALTH` | HELD, `durable-progress`, `zeroDeltaWindows 0`, stage rows 4,584,039 → 4,600,979 across the round |

Dependencies confirmed ancestors of HEAD: `d396d95d` (NEW2 R19), `f4d5371d`
(LCC R17), `de373832` (NEW3 R15). **LCC R18 is `90547174` itself** — its bus
message 1670 names that hash, and the commit touches
`services/api/src/search/citation-boundary-parity.test.ts`.

**The LCC boundary test is PARITY-only.** It derives every expectation from the
live shared extractor (`sharedKey()` calls `extractCitations` +
`normaliseCitation`) and asserts each API path equals that. It contains no
copied regex and no hard-coded glued answer, so it passes before this change and
after it. The precheck's stop condition — *do not commit a parser change that
leaves a cross-lane test red* — is satisfied by construction, and confirmed by
running it (§9).

## 2. The semantic source

```
SHARED_EXTRACTOR   services/ingest/src/citations.ts, PATTERNS[1]
SUFFIX_ALTERNATIVES  DB, FB   — exactly two, enumerated from the source, not assumed
CALLERS_COUNT      7 import sites, 6 non-test modules
```

The suffix alternatives were read out of the rule rather than taken from R18's
prose: the group is `(?:-(?:DB|FB))?` and there is no other suffix anywhere in
`PATTERNS`. `KHC-D` is a hyphenated **court** token, matched by
`([A-Z]{2,10}(?:-[A-Z]{1,3})?)`, and is not a suffix — a distinction the
negative controls hold onto throughout.

Callers of `@lawmind/ingest/citations`:

| module | what it is |
|---|---|
| `services/api/src/search/query-shape.ts` | `classifyQuery` — the `/search` routing decision |
| `services/api/src/search/qlang/parse.ts` | `cite:` field value |
| `services/api/src/judgments/citations.ts` | paragraph-level citation display |
| `services/harness/src/build-queries.ts` | benchmark query construction |
| `services/harness/src/citation-strip.ts` | citation removal for the failure harness |
| `services/harness/src/failure-taxonomy-cli.ts` | failure classification |
| `services/api/src/search/citation-boundary-parity.test.ts` | LCC's cross-lane harness |

Two modules ship the rule, and only two: `citations.ts:145` and
`hc-load.ts:271`. Both now carry the corrected boundary. Every other occurrence
in the tree is an R17/R18 evidence script that pins the OLD rule on purpose, to
reproduce a past measurement; those are historical records and are left alone.

`hc-load.ts` is **not** on the caller list, and this round does not put it there.
`extractCitations` answers *"which citations appear in this text"*;
`neutralCitationFrom` answers *"which one is this document's own"*, weighs
occurrence position against the cause title, and refuses rather than guess. They
overlap in their regex and in nothing else. §8 binds the one thing they do owe
each other.

## 3. Reproduced, failure-first

```
INPUT                              2025:DHC:8491-DBThis Court held
OLD_EXTRACTED_VALUE                2025:DHC:8491
CORRECT_EXPECTED_VALUE             2025:DHC:8491-DB
```

The mechanism is not a failure. `(?:-(?:DB|FB))?\b` puts the word boundary after
the optional suffix; on `…8491-DBThis` the `B|T` pair is not a boundary, so the
`-DB` alternative fails, the group matches EMPTY, and the `\b` then succeeds
against the hyphen, because a digit followed by a hyphen **is** a boundary. The
regex returns a different, valid-looking key. Where the page also prints the
citation cleanly, one authority becomes two keys in the same document.

The expected value comes from the token grammar: `-DB` and `-FB` are printed by
the issuing court as part of the citation — the same two alternatives the rule
already enumerates — and prose fused onto the token by a PDF text extractor
cannot retroactively shorten it.

**Observed RED at `90547174`**, before any code moved: `services/ingest/src/citations.test.ts`
66 tests, **60 pass, 6 fail**, and the six are exactly the glued cases. Every
separator that already worked (space, full stop, comma, parentheses, LF, CRLF,
tab, the printed label) and every negative control (`-SB`, `-Crl.A.`, `-D`,
a spaced suffix, `KHC-D`, an over-long number, a letter fused to the number,
INSC/AIR/SCC) passed **before** the change — so the new tests demand the boundary
move and nothing else.

One of the six was written wrong and is recorded as such rather than deleted. It
asserted that `2026:MLHC:71-DB2026:MLHC:74-DB` yields both citations. It does
not, and it must not: the rule opens on `\b`, and between the `B` of `-DB` and
the `2` of the next year there is no word boundary. Recovering the second
citation needs the LEADING boundary relaxed, which is a change to the
neutral-citation **grammar**, not to a token boundary, and §6 forbids that here.
The test now asserts the honest behaviour — the first suffix is recovered, the
citation glued behind it is still unreachable — and it was red before the fix too
(`2026:MLHC:71` → `2026:MLHC:71-DB`). A concatenated next citation is the
commonest glue tail in the corpus, so this is the round's largest **uncorrected**
recall gap and it is named, not buried.

## 4. Reconciliation — four rounds, four numbers, no contradiction

Full table with every denominator: `count-reconciliation.json`. Every
database-derived figure was **re-run**, not transcribed, and every LCC R17 number
reproduced to the digit.

| metric | value | unit | denominator | measures |
|---|---:|---|---|---|
| `R19_DB_SUFFIX_EXISTING_ROWS` | 52 | stored judgment row | 1,350,954 HC rows carrying a stored citation | stored judgment identity |
| `R19_DB_SUFFIX_QUARANTINE` | **51** | stored judgment row inside the frozen population | 20,556 rows of `NEW2-R18-EXISTING-9679cff06d0e6404` | stored judgment identity |
| `R18_MISSING_BOUNDARY` | **138** | text occurrence | 4,575,593 occurrences in 1,350,954 rows | text occurrence |
| `LCC_SPLIT_PAIRS` | **83** | (citing judgment, base) pair emitting both forms | 1,376,237 neutral edge rows | extracted citation rows |
| `LCC_DISTINCT_CITATIONS` | **33** | distinct base in a split pair | 1,376,237 | extracted citation rows |
| `LCC_CORPUS_WIDE_SPLIT` | **158** | distinct base with both forms anywhere | 1,376,237 | extracted citation rows |
| `LCC_EDGE_EXPOSURE` | **15,290** | resolved edge row | 22,408,376 edges → 1,376,237 neutral → 19,314 resolved | resolved edge, **upper bound** |
| `ALIASES_SCANNED` | **4,394** | alias row | 4,394 | alias — unaffected by CONSTRAINT |
| `R20_AFFECTED_UNIVERSE` | **1,148,519** | document | 18,752,608 judgments | input exposure |
| `R20_DOCS_WITH_A_MOVED_TOKEN` | **74** | document | 1,148,519 | input exposure |

51 versus 52 is not a discrepancy: 52 rows were observed, 51 of them fall inside
the R18 frozen population and 1 outside, and `NEW2_R19.md` says so in its own
ledger. `QUARANTINED = 51` and `DB_SUFFIX_EXISTING_ROWS = 52` answer different
questions.

15,290 stays an **upper bound** and this round does not tighten it.
`citation_text` stores the old rule's own `match[0]`, already truncated, and
`evidence` is NULL on all 1,376,237 neutral rows, so the glue is not recoverable
from an edge row. Recovering it means re-reading source text, which is what §5
does — over the input population, not over the edge population, so it produces a
different number rather than a replacement for that one.

**The cross-round overlap is exact.** R19's 52 rows split 43 `STORED_PLAIN_SUFFIX_GLUED`
+ 9 `STORED_PLAIN_SUFFIX_WITH_BOUNDARY`. Of R20's 74 documents:

- **43** are precisely R19's 43 glued rows — the same documents, reached by two
  independent routes (R19 from the stored value, R20 from the extractor output).
- R19's **9** boundary rows are correctly **absent**: the suffixed form is printed
  with a proper separator, so no glue exists and the extractor's output does not
  move. Those are a stored-value defect, not a parser defect.
- R20 adds **31** documents R19 never asked about — 9 carrying a stored citation
  unrelated to the glued token, and **22 carrying no stored neutral citation at
  all**, which R18's and R19's walks could not reach by construction.

## 5. The affected-input universe

```
AFFECTED_UNIVERSE_ID    NEW2-R20-SHARED-BOUNDARY
AFFECTED_UNIVERSE_HASH  3cc2c5452e49a9232e33e476674ca9f4c2f68701b178d2c3a7e658b636ce3c34
AFFECTED_HITS_HASH      dcca5be3947a0b6f3250ab75c92cd6bd0d1b25dbdc4835c0ef04e3671a79240b
R19_DB_SUFFIX_ROWS_HASH 89b04122f5f0bd930b204c77f23794593b9b9a03087ca38f8517613822fb0000
AFFECTED_INPUTS         1,148,519 documents, walked exhaustively in 353 s
```

The prefilter is a **superset**, and the argument is mechanical. The two rules
can disagree only where the text holds `<digit>-DB` or `<digit>-FB` followed by a
word character. Under the OLD rule that occurrence matched the UNSUFFIXED form,
so the edge pass wrote an unsuffixed neutral row for that document. Hence

> { documents whose shared-extractor output moves } ⊆ { documents holding ≥1
> unsuffixed neutral edge row }

— for every document the edge pass has read, which is every document there is:
`judgment_citations` carries a `normalised_citation = ''` sentinel for a document
that yielded nothing (16,128,279 of the 22,408,376 rows), and 18,759,868 distinct
`citing_judgment_id` values carry a row against 18,752,608 estimated judgments.
Presence is complete, so this is a corpus-wide superset and not a sample of one.

The alternative — a regex scan of all 18.7M `full_text` values, 151 GB — is not
resource-safe beside NEW1's coarse walk on the same box. The prefilter is 16×
smaller and it is derived, not guessed. The necessary condition is evaluated
inside Postgres so 1.15M texts are read and never shipped, and the walk
checkpoints every batch.

```
OLD_OUTPUT_CLASSES over the universe
  DOCS_WALKED             1,148,519
  PRECONDITION_MATCHED           88   documents
  DOCS_WITH_A_MOVED_TOKEN        74   documents
```

The 14-document gap between 88 and 74 is the precondition doing its job: it is a
necessary condition, not a sufficient one.

## 6. The fix

One line, in one file.

```diff
-  /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/g,
+  /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})\b(?:-(?:DB|FB))?/g,
```

The boundary moves off the optional suffix and onto the number. Byte-identical to
the correction R18 applied to `hc-load.ts` and to the one LCC R17 validated in an
isolated copy and handed over. No global suffix stripping, no alias change, no
ownership inference, no grammar relaxation, no rewrite, no formatting.

## 7. Differential, OLD vs NEW, over the frozen universe

```
CHANGED_OUTPUTS            160 moved match positions in 74 documents
                            34 distinct (old, new) token pairs
EXPECTED_BUG_CLOSURE       152
AMBIGUOUS                    8   by rule — 0 after inspection, see below
VALID_SUFFIX_REGRESSION      0
NEW_FALSE_POSITIVE           0
NEW_FALSE_NEGATIVE           0
ARITY_CHANGED                0
```

Courts touched: Meghalaya 37, Delhi 17, Rajasthan 8, Himachal Pradesh 7,
Allahabad 3, Punjab & Haryana 1, Karnataka 1.

**The 8 flagged AMBIGUOUS are one text.** The classifier flags a glue tail that
opens with 1–3 capitals, because a longer real suffix hiding there would make the
greedy take wrong. All eight are `2024:FU-JP:3205-DBI [SAW-332120231` in eight
connected Rajasthan matters. Reading the source window settles it:

> `[2024:FU-JP:3205-DBI [SAW-332120231` … `th sideration is. th.aJ the case`

The page prints a stamp of the form `[CITATION-DB] [CASE-NUMBER]`. The scan has
mis-read the closing `]` — as `I` after `-DB`, and as `1` in `332/2023]` →
`332120231` — and the surrounding prose is visibly damaged in the same way. So
the tail is a mis-scanned bracket, `-DBI` is not a token in the grammar under
either rule, and this is `EXPECTED_BUG_CLOSURE` over damaged source. That is an
inference from the OCR's consistent bracket damage, not a certainty; it does not
change the disposition either way, because neither rule can produce `-DBI`.

`2024:FU-JP:3205` is itself almost certainly scan damage for `2024:RJ-JP:3205` —
the same Rajasthan series-token corruption R18 found in 4 REPLACE candidates. It
is damaged identically under both rules. This round neither creates nor repairs
it, and does not touch it.

### Negative controls, prediction-blind

| control | population | precondition matched | output moved |
|---|---:|---:|---:|
| **A** edge-pass faithfulness | all 74 found documents | — | 74/74 hold the OLD token as an edge; **0 missing, 0 outside the prefilter** |
| **B1** text read, both rules run | **18,797** documents outside the prefilter | 0 | **0** |
| **B2** wide, condition in Postgres | **469,327** documents outside the prefilter | 12 | **0** |

`judgments.id` is a random uuid, so a contiguous run of the primary key is
uncorrelated with court, year and source — a slab is a genuine sample here, which
it would not be on a clustered key. Starting points are seeded (`20260901`).

B2 is the one that could have broken the round: 12 documents outside the
prefilter match the necessary condition, and **none of them moves**. A single
mover there would have meant the superset argument was wrong and the differential
incomplete. Control A is the other half — if the edge pass had not written what
the extractor read, the prefilter would have a hole no differential could show.

A note on cost, because it nearly went wrong. `select j.id::text as id … order by
id` makes Postgres sort on the OUTPUT column `(id)::text`, not the primary key,
and the plan becomes a parallel sequential scan of a 151 GB table. Five backends
were four minutes into that before it was cancelled; the query is now qualified
(`order by j.id`) and costs 117 instead of 4,806,721. NEW1 was unaffected —
`zeroDeltaWindows` stayed 0 and stage rows kept climbing throughout.

## 8. hc-load parity, without over-refactoring

New durable fixture: `services/ingest/src/citation-boundary-parity.test.ts`, a
frozen **27-control** set — LCC R17's 18 verbatim, so both harnesses answer about
the same strings, plus 9 of NEW2's own drawn from the glue tails R18 actually
measured.

It does **not** demand identical arrays. It demands one thing: where both
functions name the same underlying citation, they must agree on whether it
carries `-DB`/`-FB`. A refusal by `neutralCitationFrom` is not a disagreement,
and the two-citation case is asserted as a documented layer difference so nobody
"fixes" it into byte identity.

```
HC_LOAD_BOUNDARY_PARITY   29/29 pass
                          6/29 RED when citations.ts is swapped back to the old rule
```

Observed both ways: the fixture is failure-first against the class, not decorative.
`hc-load.ts` is **not** refactored to call the shared parser. Their semantics have
not been measured as identical beyond this boundary, and §8 of the round forbids
the merge without that measurement.

## 9. API parity

```
LCC_PARITY_HARNESS        services/api/src/search/citation-boundary-parity.test.ts  60/60 PASS
API_SHARED_PARSER_PARITY  query-shape 30/30 · qlang/parse 34/34 · judgments/citations 5/5
                          citations/resolver 13/13
DB_SUFFIX_CROSS_SYSTEM_PARITY = PASS
```

All four API citation-input paths — `classifyQuery`, the bare structured lookup,
`cite:` parsing and paragraph citation display — reach the shared extractor and
moved with it. The LCC harness passes because it asks a parity question, not a
value question.

**`DB_SUFFIX_CROSS_SYSTEM_PARITY = PASS` is not citation-graph apply safety.** It
says one parser now answers one way everywhere. It says nothing about whether the
22.4M stored edges should be rewritten, and this round did not rewrite one.

The resolver suite failed 6/13 on the first run with *password authentication
failed for user "Xerxus"* — a missing `DATABASE_URL` in the shell, not a
regression. With it exported: 13/13.

## 10. Aliases and the existing key space

Aliases are unaffected **by constraint, not by sample**:

```
ALIASES_SCANNED  4,394  =  AIR 335 + SCC 4,059
NEUTRAL_SHAPED_ALIAS_KEYS  0
CHECK ((alias_reporter = ANY (ARRAY['AIR'::text, 'SCC'::text])))
ALIASES_CHANGED  0
```

A neutral citation can never become an alias row. LCC R17's 4,394 / 0 is
reproduced exactly.

What the fix does to **future** input meeting **existing** keys, across the 34
distinct token pairs (`key-space.json`):

| outcome | pairs | what it means |
|---|---:|---|
| `NEITHER_FORM_RESOLVES` | 13 | we hold no judgment under either key |
| `NO_LONGER_RESOLVES` | 11 | the corpus holds only the unsuffixed form |
| `NEWLY_RESOLVES` | 8 | the corpus holds only the suffixed form — the fix **recovers** a resolution the glue was losing |
| `RESOLVES_TO_A_DIFFERENT_JUDGMENT` | 2 | the edge moves to a judgment the old key never named |
| `NARROWS_TO_A_SUBSET` | 0 | |
| `STILL_RESOLVES_SAME_JUDGMENT` | 0 | |

The 11 `NO_LONGER_RESOLVES` are the mirror of R19's quarantine, and
`2023:AHC:111864` is the worked example: the judgment whose page prints
`2023:AHC:111864-DB` is stored under the plain key, because the defective rule
stored it. The parser is now right and the stored value is still wrong.
**Disposing of that is R19's, not this round's** — which is exactly why they were
quarantined rather than corrected.

The 2 moves are both Meghalaya and both **true moves**, checked rather than
assumed: the new key's holder is not among the old key's holders in either case.

- `2025:MLHC:405` → `2025:MLHC:405-DB` — **26** holders under the old key, **1**
  under the new, **0** in common. Twenty-six judgments claiming one unsuffixed
  neutral key is a Meghalaya storage problem of its own; it is reported, not
  touched.
- `2025:MLHC:384` → `2025:MLHC:384-DB` — 1 holder each, 0 in common.

Under the grammar the `-DB` holder is the correct target, because `-DB` is what
the page prints. That the correction *moves a graph edge* at all is precisely why
a bulk re-apply is a separately authorised act and not a consequence of this
commit.

## 11. R19 quarantine

```
PARSER_TRUTH_FIXED       YES  (future extraction only)
EXISTING_51_ROWS_UNCHANGED  YES
R19_ROWS_MUTATED            0
NEXT_REQUIRED_ACTION     an independent correction audit and disposition of the
                         51 quarantined rows — owned by whoever takes R19's
                         population forward, gated behind CITATION_BULK_APPLY
```

Parser parity passing does not authorise correcting those rows, and this round
did not edit R19.

## 12. Final state

```
CANONICAL_JUDGMENTS_CHANGED   0
ALIASES_CHANGED               0
EDGES_CHANGED                 0
DB_MIGRATION                  NO
FINAL_CITATION_FALSIFIER_RUN  NO
CITATION_BULK_APPLY           HOLD
FINAL_APPLY_AUTHORIZATION     NO
NEW1_INTERRUPTED              NO
THREE_ATTEMPT_STOP_TRIGGERED  NO
```

### What is not verified

- The `-DBI` reading in §7 is an inference from consistent OCR bracket damage.
  It does not change the disposition, because neither rule can emit `-DBI`.
- The affected universe is exhaustive over documents the edge pass has read. That
  is every document today, evidenced by the sentinel row count; a document
  ingested and never extracted would be outside it, and none was found.
- B1/B2 are blind samples of 18,797 and 469,327 documents outside the prefilter,
  not the full 17.6M. The superset claim rests on the mechanical argument plus
  those samples plus control A, not on an exhaustive outside scan.
- `services/harness` typecheck reports 5 pre-existing errors, in
  `retrieval.ts`, `tranche-reach-delta-cli.mts` and `v31-freeze-cli.ts`. None is
  in a file this round touched and none is citation-related. `services/ingest`
  and `services/api` typecheck clean.
- Second-citation recall after a concatenated glue is **not** closed (§3).
- `pnpm format` was **already red at HEAD** for `citations.ts` and
  `citations.test.ts` — both fail `prettier --check` at `90547174` under the
  repo's own `.prettierrc.json`. This round did not run `prettier --write`,
  because that rewrites a whole file and buries a one-line change. What was
  checked instead: formatting both versions and diffing them leaves exactly the
  38 added comment lines and the 1 changed regex line in `citations.ts`, and
  **zero** prettier disagreements anywhere in the block added to
  `citations.test.ts`. The new file `citation-boundary-parity.test.ts` passes
  `--check` outright. No new violation was added; an old one was not fixed.
- The full `services/api` suite failed **1 of 1,074** on its first run:
  `sparse-bound.test.ts` — *"admitted narrow query must be fast; took 5593ms"*.
  That is a wall-clock latency assertion and the reconciliation scan (a
  22.4M-row parallel sequential scan) was running beside it. The file passes
  5/5 in isolation under **both** the old rule and the new one, so it is not
  this change; it is what else was on the box. Re-run clean afterwards.
