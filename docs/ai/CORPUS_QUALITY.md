# CORPUS QUALITY — buckets, measured against production

**11 August 2026, LCC, Stage 4 of the DATA → RETRIEVAL EXECUTION PROGRAM.**
Builds on Stage 2 (`docs/ai/CANONICAL_IDENTITY.md`) and Stage 3
(`docs/ai/DEDUPLICATION.md`) — bucket B's "member of an exact-duplicate group"
and "citation extraction has not run" signals both come directly from those
stages' own tables. C/D rows are **reported, never deleted** — they remain
part of the corpus and may be reprocessed later, per the program's own
instruction.

---

## 1 · THE BUCKET DEFINITION

`services/ingest/src/quality-buckets.ts`, `classifyQuality()`. Built
**deliberately only from columns already near-100% populated**
(`content_hash`, `cnr`, `text_quality`) plus two facts this program's own
earlier stages made queryable (exact-duplicate membership, whether the
citation extractor has run at all). `native_text` and `source_document_type`
are **not** gating fields — both are populated on a small minority of the
corpus today (`docs/ai/DATA_MOAT_PROGRAM.md` §6/§7), and requiring them would
push nearly the whole corpus into a lower tier for a reason unrelated to the
text's actual quality.

| bucket | meaning | condition |
| --- | --- | --- |
| **A** | research ready | `content_hash` present, `text_quality ≥ 0.90`, `cnr` present, not an exact-duplicate member, citation extraction has run |
| **B** | usable with limitations | undamaged text (`text_quality ≥ 0.90`) but missing one signal: `cnr`, or duplicate membership, or citation extraction not yet run |
| **C** | poor extraction | `text_quality < 0.90` — the same damage-proxy floor every prior report in this program has used, not invented here |
| **D** | unusable/blocked | no `content_hash` (extraction never completed far enough to hash it), or `text_quality` was never computed |

## 2 · MEASURED RESULT — `services/ingest/src/quality-report-cli.ts`

Dry, read-only, no `full_text` fetched (buckets derive entirely from indexed
columns and two `EXISTS` subqueries). Full census, not a sample — **79,322
rows** (the corpus grew by one row between this report and earlier program
stages' 79,321 count; not investigated further, a routine ingest write, not a
data-quality finding).

| bucket | count | share |
| --- | ---: | ---: |
| A | 38,307 | 48.3% |
| B | 40,627 | 51.2% |
| C | 388 | 0.5% |
| D | 0 | 0.0% |

**By court class — the real story is here, not in the corpus-wide total:**

| | n | A | B | C | D |
| --- | ---: | --- | --- | --- | --- |
| Supreme Court | 38,342 | 38,307 (99.9%) | 25 (0.1%) | 10 (0.0%) | 0 |
| High Court | 40,980 | **0 (0.0%)** | 40,602 (99.1%) | 378 (0.9%) | 0 |

**Zero High Court rows reach bucket A, and the reasons list explains
precisely why**: 40,603 of the 40,627 rows counted as a reason are
`"citation extraction has not run"` — matching the High Court's B-count
(40,602) almost exactly. **This is not a text-quality problem.** High Court
`text_quality` is fine on 99.1% of rows (only 378 fall to C); it is bucketed B
almost entirely because the citation extraction pass has never run against
the ingested High Court corpus. Confirmed consistent with
`docs/ai/DATA_MOAT_PROGRAM.md` §0's own citation-graph total being built from
a corpus that, per `docs/CURRENT_PLAN.md` Q1.4, paused the High Court ingest
before citation extraction reached it.

**A real defect was found and fixed while building this report.** The first
run reported `"cnr present"` as a top reason contributing to a non-A bucket on
**78,934 rows** — nonsensical, since having a CNR is the *good* case. Root
cause: `classifyQuality()` pushed `'cnr present'` into the same `reasons`
array as genuinely degrading conditions, and the report treated every entry
in that array as a reason for the row's bucket. **The bucket assignment
itself was never wrong** — only `cnr missing` (not `cnr present`) drove the
`degraded` check — so the A/B/C/D counts above are unaffected by the bug and
were re-verified unchanged after the fix. Two tests now pin this: an A row
reports zero reasons, and no reason string may ever contain `"cnr present"`.
`INTENT`: the code computed the right bucket; the report's reasons list was
wrong; fixed at the reasons-collection site, not by loosening a test.

## 3 · PARAGRAPH-NUMBER DETECTION — SAMPLED, not corpus-wide

`services/api/src/judgments/paragraph-quality-sample.ts`
(`pnpm --filter @lawmind/api quality:paragraphs --n 500`). Reuses
`segmentParagraphs`/`numberedShare` directly from
`services/api/src/judgments/paragraphs.ts` rather than re-deriving them —
they already exist and are already used by the reading-view surface.

**Why sampled, not measured**: `services/ingest/src/corpus-report-cli.ts`'s
own header names this exact gap — computing `numberedShare` for all 79,322
rows means fetching every `full_text`, the expensive full-corpus scan a dry
report should not casually trigger. `TABLESAMPLE SYSTEM` gives an honestly
random slice without the full-scan cost `ORDER BY random()` would force.

| | |
| --- | --- |
| sample size | 500 (requested 500, `TABLESAMPLE SYSTEM (2)`) |
| average `numberedShare` | **0.747** |
| rows with 0.0 `numberedShare` (no printed paragraph number found at all) | **52 (10.4%)** |
| Supreme Court (n=304 in sample) | avg 0.727 |
| High Court (n=196 in sample) | avg 0.777 |

**Read plainly**: roughly three-quarters of paragraphs in a typical judgment
carry the court's own printed number, and one row in ten has none at all —
consistent with `services/api/src/judgments/paragraphs.ts`'s own comment that
a null `paragraphNumber` is common (headnote, bench, case title text before
the first numbered paragraph) and that a 0.0-share judgment is real and must
render without pretending anchors exist. **This single sample is not
sufficient to break the figure down further** (by decade, by court, by
native-vs-scanned) — a larger or stratified sample is future work if this
number needs to inform a product decision, not assumed sufficient here.

## 4 · WHAT THIS DOCUMENT DOES NOT DO

- Does not delete or reprocess any C/D row — none exist to delete at the D
  tier, and the 388 C rows remain fully queryable, exactly as before.
- Does not measure OCR confidence — `judgment_chunks.ocr_confidence` remains
  unpopulated for High Court text, an open gap named in `docs/ai/
  DATA_MOAT_PROGRAM.md` §2.1, not re-investigated here.
- Does not measure citation-extraction *quality* (precision/recall) — only
  *whether it ran at all*, which is what bucket B's reason needed and no more.
- Does not act on the "citation extraction has not run on the High Court
  corpus" finding — that is `services/ingest/src/citations-cli.ts`'s job, a
  separate task, not run against production here.
