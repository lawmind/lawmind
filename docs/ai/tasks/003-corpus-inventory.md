# TASK 003 — corpus inventory (provenance, dedup, extraction confidence)

**STATUS: IN PROGRESS — schema + loader done, backfill CLI not yet built ·
started 11 August 2026 · owner LCC**

---

## OBJECTIVE

Give the loader what the autonomous-execution charter's §10 requires before
the paused High Court ingest can resume responsibly: per-document content
hash, extraction-confidence proxy, and source-stated document type — none of
which `judgments` tracked.

**Not started from zero.** `docs/HC_CORPUS_SURVEY.md` and
`docs/HC_EXTRACTION_COST.md` (10 Aug) already measured document-vs-judgment
classification, per-court/year/provenance counts, OCR burden and extraction
cost across the AWS bucket. This task is the remaining gap those two surveys
named but did not close: §5 of `HC_CORPUS_SURVEY.md`, *"whether mobile rows
duplicate plain rows under a different CNR... de-duplication is an ingest
concern."*

---

## WHAT LANDED

1. **Migration `0031_judgment_provenance.sql`** — `judgments` gains
   `content_hash text null` (sha256 of `full_text`), `text_quality
   numeric(4,3) null` (the same measured proxy already on `judgment_chunks`,
   reused from `services/embed/src/quality.ts`, not reinvented), and
   `source_document_type text null` (verbatim `order_type` where the source
   states one — never classified, never guessed). Partial index on
   `content_hash`. Applied to production; verified by querying
   `information_schema.columns` directly.
   - **Found and fixed in the process:** the drizzle migration journal
     (`packages/db/drizzle/meta/_journal.json`) was stale — it stopped at
     `0029`, so `pnpm --filter @lawmind/db migrate` had been silently
     no-op'ing past that point. `0030_external_citations.sql` was applied to
     production at some point outside the journal (its hash is in
     `drizzle.__drizzle_migrations`, id 30, but no journal entry names it).
     **Left alone, not fixed** — out of scope for this task and risky to
     touch without understanding how it got there. Added only my own entry
     (`0031`, id 31) so future migrations resume working correctly. Flagged
     here rather than silently worked around.
2. **`services/ingest/src/load.ts`** — `content_hash` and `text_quality` are
   computed inside the shared `upsertBatch`, so every loader (`sci.ts`,
   `hc-load.ts`, and any future one) gets them without having to compute them
   itself. `source_document_type` passes through from `JudgmentRecord` when a
   loader supplies it.
3. **`services/ingest/src/harvest/hc-load.ts`** — `HcMetadataRow` gains an
   optional `order_type` field (mobile-variant-only, per
   `HC_CORPUS_SURVEY.md` §2); `toJudgmentRecord` passes it through verbatim as
   `sourceDocumentType`. `services/ingest/src/sci.ts`'s `JudgmentRecord` type
   gained the optional field; the Supreme Court loader leaves it unset (no
   such source column exists there).
4. Tests: `services/ingest/src/load.test.ts` (new — sha256 known-vector test
   plus a real-Postgres, rolled-back integration test proving the write path,
   following `services/harness/src/overruled-checks.ts`'s transaction
   pattern so nothing synthetic ever persists) and two new cases in
   `hc-load.test.ts`. Full suite: 295/0 (was 289/0), zero regressions,
   `npx tsc --noEmit` clean.

---

## WHAT LANDED, PART 2 — 11 Aug 2026, same day, resumed per the founder's
## RESUME AUTONOMOUS EXECUTION directive

**Backfill built and run.** `services/ingest/src/backfill-provenance.ts`
(dry-by-default, `--confirm` to write, keyset-paginated on `id`) computed
`content_hash`/`text_quality` for all 79,321 existing rows against
`full_text` already in Postgres — no re-fetch. Result: **78,384 distinct
hashes across 79,321 rows — 937 exact-text duplicate groups, 1,500 rows
involved (1.9% of the corpus), 1,476 of them (98.4%) High Court.**

**What the duplication actually is — verified by reading the text, not
inferred from counts.** Sampled the two largest groups (n=124, Gujarat HC,
1993; n=56, Patna HC, 2025) directly:

- The Gujarat group is `{Total 327 Matters}` — one judgment deciding 327
  tagged-along criminal revisions together, case numbers `CR.RA/151/1991`
  through `CR.RA/274/1991` and others, **each ingested as a separate
  `judgments` row sharing the one combined text.**
- The Patna group is a Letters Patent Appeal batch — 56 distinct appellants
  (`Arjun Kumar`, `Sujit Kumar Singh`, `Kumari Sudha Yadav`, …), each `Vs
  The State of Bihar`, each with a genuinely distinct case number, all
  disposed of in one 168,002-character consolidated judgment, again one row
  per case number.

**This is a real, measured finding, and it is NOT what `HC_CORPUS_SURVEY.md`
§5 asked about.** §5's question was specifically whether the bucket's two
metadata variants (`metadata.parquet` / `metadata-mobile.parquet`, zero CNR
overlap) duplicate the same judgment under different CNRs. Both sampled dupe
groups have `cnr IS NULL` throughout — not evidence either way on §5, because
these rows predate CNR being carried at all (fixed same session, see below).
**§5 remains open.** What this DOES establish: consolidated/batch judgments
inflate the document count without inflating unique legal content — a
distinct corpus-quality fact, consistent with `HC_CORPUS_SURVEY.md`'s own
"document count is not judgment count" finding, now with a measured
mechanism and two verified examples rather than a suspicion.

**Not acted on further.** Deciding whether a duplicate-hash group should
collapse to one canonical row (and which case numbers to preserve as
aliases) is a retrieval/product decision — a search returning the same text
124 times under different titles is a real UX cost, but resolving it changes
what `judgments` rows exist and needs its own task, not a byproduct of this
one's measurement.

## WHAT ALSO LANDED — `judgments.cnr`, found dropped for the whole corpus

Migration `0034`. `SciMetadataRow.cnr` and `HcMetadataRow.cnr` are present in
both source metadata schemas and were read by **neither** mapping function
into `JudgmentRecord` — silently discarded before reaching the database,
every row, since ingest began. Column added, both mappers and `load.ts` now
carry it through for every future write. **Not backfilled** — recovering it
for the 79,321 existing rows needs the original source metadata, which the
`content_hash`/`text_quality` backfill did not (that reads only `full_text`,
already in Postgres); a CNR backfill would need to re-read the AWS metadata
files by `source_url`, a distinct, larger, unbuilt task.

## WHAT DID NOT LAND — the original remaining gap, now closed above

~~**No backfill.** The 79,321 existing rows (38,341 Supreme Court, 40,980 High
Court from the paused ingest) all have `content_hash`, `text_quality` and
`source_document_type` NULL — new columns populate only on the next write to
each row.~~ **Closed — see "WHAT LANDED, PART 2" above.**

---

## WHAT THIS DOES NOT SETTLE

- **Native vs scanned.** `text_quality` measures visible damage, not
  scan-vs-born-digital. That needs the extraction path itself to report
  whether it fell back to OCR — `judgment_chunks.ocr_confidence` already
  models this correctly (engine-reported, not inferred) but nothing populates
  it for High Court text yet, and building that is S4 OCR-pipeline work, not
  this task.
- **Document-type classification.** `source_document_type` stores what 4 of
  25 courts already say; it does not classify the other 21, and does not
  resolve the `View Judgement/Order` ambiguity `HC_CORPUS_SURVEY.md` found
  covers 17.89% of the labelled rows even where a label exists. That needs
  PDF text read at classification time, which is future work.
- **Whether the paused ingest may resume.** This closes one item on the
  autonomous charter's §10 list; the loader can now track what that section
  asks for. Resuming the actual multi-hour ingest run is a separate decision,
  not made by this task landing.

---

## FILES CHANGED

`packages/db/drizzle/0031_judgment_provenance.sql`,
`packages/db/drizzle/meta/_journal.json`, `packages/db/src/schema.ts`,
`docs/SCHEMA_TRUTH.md`, `services/ingest/src/load.ts`,
`services/ingest/src/load.test.ts`, `services/ingest/src/sci.ts`,
`services/ingest/src/harvest/hc-load.ts`,
`services/ingest/src/harvest/hc-load.test.ts`,
`services/ingest/package.json` (new `@lawmind/embed` workspace dependency,
reusing `textQuality()` rather than reimplementing it).

**NOT changed:** `apps/**`, the paused ingest CLI itself
(`hc-load-cli.ts` was not run).
