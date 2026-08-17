# POST-MIGRATION RETRIEVAL GATE — FINAL VERDICT

**`POST_MIGRATION_RETRIEVAL_GATE_PASS`**

Built 2026-08-17T12:14:30.366Z · database `127.0.0.1` · **57 unique
checks** · **52 PASS · 0 FAIL · 5 INFO** ·
**11 of them re-measured today after the count was questioned.**

This file is immutable. A new verdict gets a new file.

---

## WHY THIS FILE EXISTS AND THE OLD NUMBER DOES NOT

The accumulated artefact reported `pass: 60` over **65 entries for 57 distinct
checks**. Eight `span-retrieval-hybrid-*` ids appeared exactly twice. LCC caught
it (bus 0629) before it was published as the migration verdict.

**The cause is mechanical and was read out of the source, not guessed.** A
check's tagged class is not the stage that produces it:

- `spansFromResults()` emits `cls: 'D'` from **inside the E/F stage**
  (`post-migration-cli.ts:503`, called at `:661`)
- `classG()` emits `paragraph-fallback-span` as `cls: 'D'` (`:912`)

The resume logic carries forward every prior check whose **class** was not
re-run (`:1574-1576`). So the final `--only A,B,E,F` pass carried the eight
class-D span checks forward **and** re-emitted them from its E/F stage. That
accounts for all eight duplicates exactly, and for nothing else.

**The killed `--only A,B` duplicate is exonerated.** With `only={A,B}` it grades
no D stage at all, and its carried set is a filter over the prior file, which
cannot introduce a copy. Two E/F executions are required; `--only A,B` is not
one of them. That also answers NEW2's 0631 question about which process wrote
the file.

**All eight duplicated pairs were byte-identical** — same verdict, same detail,
same offsets. No grade ever disagreed with itself.

## THE ANSWER WAS RE-MEASURED, NOT ARGUED

Run isolation **cannot be proven from the artefact**: it carries no per-check run
id or timestamp, the file is untracked in git, and no console log of the earlier
runs survives. Concluding "these came from two clean runs" from the file alone
would be an inference dressed as an observation. So the affected checks were
**re-executed**.

| | what happened |
| --- | --- |
| **class D storage checks** (3) | re-run alone into a **fresh output path**, so nothing was carried and nothing could accumulate. 342s. All PASS. |
| **the 8 duplicated span checks** | re-measured **directly against `judgment_chunks` / `judgment_paragraphs`**, bypassing retrieval. All PASS. |
| **A · B · C · E · F · G · H** | carried unchanged. Not duplicated, and not re-run for a reporting defect in D. |

**`--only D` alone would have been wrong**, and it is worth recording: the eight
duplicated checks are produced by the **E/F** stage, so re-running D by itself
would have *dropped* them rather than re-grading them — the same class-vs-stage
confusion, in the other direction. That is why the re-run was launched as
`D,E,F,G`.

## WHY THE SPAN CHECKS WERE RE-MEASURED SIDEWAYS

The `D,E,F,G` re-run **did not reach E/F**. It aborted:

    PostgresError 42601: syntax error at or near "UNION"
      at exactCitation (services/api/src/search/retrieve.ts:477)

That is LCC's **uncommitted in-flight** change for migration `0052`, and the
defect is a `LIMIT` on an un-parenthesised `UNION` branch — a **parse** error.
Isolated four ways against the local cluster:

| statement | result |
| --- | --- |
| un-parenthesised, references `lawmind_citation_keys` | `42601` syntax error |
| **parenthesised**, references `lawmind_citation_keys` | `42883` function does not exist |
| un-parenthesised, **no reference to it at all** | `42601` syntax error |
| **parenthesised**, no reference to it at all | **OK** |

Row 3 settles it: **migration `0052` will not fix this.** Reported to LCC as bus
0638; `retrieve.ts` was **not** touched by NEW1.

**This is not a migration defect.** The accumulated E/F checks ran against
`retrieve.ts` *as it was before that edit*, and they measured the database, which
is what the gate is for. It does mean the eight span checks had to be
re-established without retrieval.

### One wrong turn inside that re-measurement, recorded because it looked like data loss

`exactSpan` has **two** sources: the retrieved chunk (`retrieve.ts:796`) and
`judgment_paragraphs` via `fillParagraphFallback` (`:897`). A first pass checked
only chunks and reported **3 of 8 as FAIL**. All three are judgments holding
**zero chunks** — the paragraph table was their span source, and a chunk-shaped
question was simply the wrong question. Corrected to check both: **8 PASS, 0
FAIL**.

**What this re-measurement does and does not establish:** it re-establishes the
span assertion — `full_text` at that offset is still byte-identical to the stored
chunk or paragraph text. It does **not** re-establish the hybrid retrieval that
selected those candidates; that half was measured at 08:19:26Z and cannot be
re-measured until the `exactCitation` defect is fixed.

## CARRIED CLASSES ARE CLASS-COMPLETE

Checked against the fixtures rather than assumed: **A 11** = 1 `bommai-exact` + 5
neutral + 5 reporter, matching the five `citationIdentity` entries in
`fixtures/post-migration-probes.json`, each carrying both a neutral and a
reporter citation · **B 2** = ambiguous + nonexistent · **C 15** = 4 counts + 5
overruled + 5 live-read + 1 currentness-population · **E 3** · **F 6** · **G 1** ·
**H 7**.

## EVERY RE-MEASUREMENT AGREED

Divergences: **0** · new in re-measurement: **0**.

Every one of the 11 re-measured checks came back with the same verdict as the accumulated artefact. The accumulated grades were right; only the *count* was over the wrong set.

## THE DEFECT IS FIXED, NOT JUST WORKED AROUND

`summarise()` now counts over unique `cls`+`id` (`dedupeChecks`, **last write
wins** — a re-run exists to supersede an earlier grade), and the CLI **names every
collapse out loud** before printing totals, because a silent dedupe is the same
defect wearing a new coat. 46/46 harness unit tests pass; `tsc --noEmit` clean.

## PROVENANCE

**`accumulated-2026-08-17T08:19:26Z`** — ranAt 2026-08-17T08:19:26.001Z
source of A, B, C, E, F, G, and D/paragraph-fallback-span
`docs/ops/migration/gate-runs/accumulated-2026-08-17T081926Z.json`
`sha256 d1f3af3bb21182729bcef30783a87ed021e5d068b0a85542aaf868866b7fc3d1`

**`rerun-D-2026-08-17T11:56:22.098Z`** — ranAt 2026-08-17T11:56:22.098Z
source of class D storage checks (3)
`docs/ops/migration/gate-runs/rerun-DEFG.json`
`sha256 36ea731c379ddb049737d58eab16b780ea8ffb60fe9a988344ebfe66b3a9aa89`

**`span-reverify-2026-08-17T12:12:43.373Z`** — ranAt 2026-08-17T12:12:43.373Z
source of the 8 duplicated span-retrieval-hybrid checks
`docs/ops/migration/gate-runs/rerun-span-reverify.json`
`sha256 939e482e99dc8c843242064986bd7cd86ded66f3a054f54a1519ac22aa7593d7`

Database: PostgreSQL 18.6 at `127.0.0.1:5432/lawmind`, postmaster up since
2026-08-17T02:47:38Z — **the same server instance** that ran the accumulated
gate. LCC applied migration `0053` between the runs (`CREATE TABLE` on an empty
derived table); `0052` is deliberately **not** applied, so no retrieval hot path
changed under either run.

---

## EVERY CHECK

| class | id | result | provenance | evidence |
| --- | --- | --- | --- | --- |
| A | `bommai-exact` | PASS | accumulated | cite:"(1994) 3 SCC 1" resolves to BOMMAI |
| A | `neutral-20a2b2c4` | PASS | accumulated | cite:"2006 INSC 943" resolves to the same judgment id as before |
| A | `neutral-5c62ae39` | PASS | accumulated | cite:"2009 INSC 389" resolves to the same judgment id as before |
| A | `neutral-78ef7fdc` | PASS | accumulated | cite:"1986 INSC 207" resolves to the same judgment id as before |
| A | `neutral-daf3d53d` | PASS | accumulated | cite:"1961 INSC 249" resolves to the same judgment id as before |
| A | `neutral-ef4eadf6` | PASS | accumulated | cite:"1987 INSC 311" resolves to the same judgment id as before |
| A | `reporter-20a2b2c4` | PASS | accumulated | cite:"[2006] SUPP. 9 S.C.R. 954" resolves to the same judgment id as before |
| A | `reporter-5c62ae39` | PASS | accumulated | cite:"[2009] 4 S.C.R. 834" resolves to the same judgment id as before |
| A | `reporter-78ef7fdc` | PASS | accumulated | cite:"[1986] 3 S.C.R. 1004" resolves to the same judgment id as before |
| A | `reporter-daf3d53d` | PASS | accumulated | cite:"[1962] 3 S.C.R. 305" resolves to the same judgment id as before |
| A | `reporter-ef4eadf6` | PASS | accumulated | cite:"[1988] 1 S.C.R. 780" resolves to the same judgment id as before |
| B | `insc-189-ambiguous` | PASS | accumulated | cite:"2020 INSC 189" is still flagged ambiguous across 3 judgments |
| B | `nonexistent-citation` | PASS | accumulated | cite:"(9999) 99 SCC 999" correctly returns nothing |
| C | `currentness-population` | INFO | accumulated | set_aside=70 · partly_set_aside=8 · doubted=17 |
| C | `judgment_chunks-count` | INFO | accumulated | 6,20,300 rows |
| C | `judgment_citations-count` | INFO | accumulated | 17,34,857 rows |
| C | `judgment_paragraphs-count` | INFO | accumulated | 2,79,67,835 rows |
| C | `judgments-count` | PASS | accumulated | row count matches the frozen source exactly |
| C | `live-read-d27280d5` | PASS | accumulated | retrieval serves the stored overruled_status, live |
| C | `live-read-eecc8f01` | PASS | accumulated | retrieval serves the stored overruled_status, live |
| C | `live-read-f09f8d00` | PASS | accumulated | retrieval serves the stored overruled_status, live |
| C | `live-read-f9885dbe` | PASS | accumulated | retrieval serves the stored overruled_status, live |
| C | `live-read-ffda795d` | PASS | accumulated | retrieval serves the stored overruled_status, live |
| C | `overruled-d27280d5` | PASS | accumulated | RITU MAHAJAN v. INDIAN OIL CORPORATION & ORS. — currentness intact |
| C | `overruled-eecc8f01` | PASS | accumulated | M/S. RAINBOW COLOUR LAB AND ANR. v. THE STATE OF MADHYA PRADESH — currentness intact |
| C | `overruled-f09f8d00` | PASS | accumulated | VIJAY KUMAR MISHRA AND ANR. v. HIGH COURT OF JUDICATURE AT PATNA AND ORS. — currentness intact |
| C | `overruled-f9885dbe` | PASS | accumulated | M/S SUN EXPORT CORPORATION BOMBAY v. COLLECTOR OF CUSTOMS, BOMBAY AND ANR. — currentness intact |
| C | `overruled-ffda795d` | PASS | accumulated | NEW INDIA ASSURANCE CO. LTD. v. R. SRINIVASAN — currentness intact |
| D | `paragraph-fallback-span` | PASS | accumulated | exactSpan is byte-identical at offset 0 (254 chars) |
| D | `span-retrieval-hybrid-2b427e54` | PASS | re-measured | re-resolves byte-identically at offset 36393 (4508 chars) against judgment_paragraphs |
| D | `span-retrieval-hybrid-44d56193` | PASS | re-measured | re-resolves byte-identically at offset 13944 (2322 chars) against judgment_chunks |
| D | `span-retrieval-hybrid-6b05401b` | PASS | re-measured | re-resolves byte-identically at offset 54548 (3434 chars) against judgment_paragraphs |
| D | `span-retrieval-hybrid-70effbcc` | PASS | re-measured | re-resolves byte-identically at offset 32009 (7014 chars) against judgment_paragraphs |
| D | `span-retrieval-hybrid-7842f390` | PASS | re-measured | re-resolves byte-identically at offset 264408 (2059 chars) against judgment_chunks |
| D | `span-retrieval-hybrid-a1bf8601` | PASS | re-measured | re-resolves byte-identically at offset 8728 (2320 chars) against judgment_chunks |
| D | `span-retrieval-hybrid-bff546dd` | PASS | re-measured | re-resolves byte-identically at offset 109558 (2300 chars) against judgment_chunks |
| D | `span-retrieval-hybrid-f04bd8c4` | PASS | re-measured | re-resolves byte-identically at offset 4700 (2336 chars) against judgment_chunks |
| D | `span-signature-overshoot` | PASS | re-run D | no chunk span runs past the end of its own full_text |
| D | `span-signature-zero-offset` | PASS | re-run D | no chunk carries the char_offset=0 defect signature |
| D | `span-storage-sample` | PASS | re-run D | 300 chunk spans re-resolve byte-identically against full_text |
| E | `collapse-hybrid` | PASS | accumulated | 10 results, 10 distinct content_hash, 0 un-hashed (never collapsed, by design) |
| E | `collapse-known-duplicate` | PASS | accumulated | a 2-row duplicate group occupies exactly 1 result slot — collapsed, not dropped |
| E | `collapse-sparse` | PASS | accumulated | 9 results, 9 distinct content_hash, 0 un-hashed (never collapsed, by design) |
| F | `arm-dense` | PASS | accumulated | the dense arm returned 10 result(s) |
| F | `arm-hybrid` | PASS | accumulated | the hybrid arm returned 10 result(s) |
| F | `arm-sparse` | PASS | accumulated | the sparse arm returned 9 result(s) |
| F | `citation-pin-hybrid` | PASS | accumulated | the citation query pins its judgment at rank 1 in hybrid mode |
| F | `citation-pin-sparse` | PASS | accumulated | the citation query pins its judgment at rank 1 in sparse mode |
| F | `fusion-provenance` | PASS | accumulated | every hybrid result came from an arm or the exact-lookup pin |
| G | `paragraph-fallback` | PASS | accumulated | a chunkless judgment is served evidence from judgment_paragraphs (253 chars, verified) |
| H | `generated-judgments.full_text_tsv` | PASS | accumulated | judgments.full_text_tsv is STORED GENERATED with the declared expression |
| H | `generated-statute_sections.full_text_tsv` | PASS | accumulated | statute_sections.full_text_tsv is STORED GENERATED with the declared expression |
| H | `generated-write-judgments.full_text_tsv` | PASS | accumulated | insert populates and update recomputes the generated tsvector |
| H | `generated-write-statute_sections.full_text_tsv` | PASS | accumulated | insert populates and update recomputes the generated tsvector |
| H | `tsv-index-plan` | INFO | accumulated | random_page_cost=1.1 · planner CHOOSES judgments_full_text_idx |
| H | `tsv-matches-recomputation` | PASS | accumulated | 500 judgments sampled by id: every stored tsvector equals to_tsvector('english', full_text) recomputed now |
| H | `tsv-populated-sample` | PASS | accumulated | 5,000 judgments sampled by id: every one with text carries a tsvector |
