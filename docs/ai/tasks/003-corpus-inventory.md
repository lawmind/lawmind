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

## WHAT DID NOT LAND — the actual remaining gap

**No backfill.** The 79,321 existing rows (38,341 Supreme Court, 40,980 High
Court from the paused ingest) all have `content_hash`, `text_quality` and
`source_document_type` NULL — new columns populate only on the next write to
each row. A `services/ingest/src/backfill-provenance.ts` CLI (dry-by-default,
matching every other CLI in this package) that reads `full_text` already in
Postgres and writes the three computed fields, with no re-fetch, is the
natural next increment and the thing that would actually let someone answer
*"do the two metadata variants collide"* for real, on the corpus already
held. **Not built this session** — recorded here rather than left implicit.

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
