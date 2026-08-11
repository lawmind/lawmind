# TASK 007 — can `judgments.cnr` be backfilled without a re-fetch?

**STATUS: NOT STARTED · owner LCC · from `docs/ai/DATA_MOAT_PROGRAM.md` §7 item 2**

## OBJECTIVE

Migration `0034` (11 Aug 2026) added `judgments.cnr` and fixed both loaders
to carry it through on every future write — but 0 of the 79,321 existing
rows have one, because the mapping bug (present since ingest began) meant it
was never captured for them either.

`content_hash`/`text_quality` were backfillable from `full_text`, already in
Postgres — no re-fetch needed. `cnr` is different: it lives in the source
metadata file (`SciMetadataRow.cnr` / `HcMetadataRow.cnr`), not in
`full_text`, and that metadata was never stored — only the fields the
original mapper happened to select survived into `judgments`.

**This task answers one question, and commits to nothing beyond answering
it**: can the original AWS metadata parquet/JSON files be re-read, matched
back to existing rows by `source_url`, and their `cnr` value backfilled —
without hitting a live court website, without violating any rate limit or
grant, using only the same public AWS Open Data bucket the original ingest
already reads?

## WHY THIS MATTERS

`cnr` is the canonical eCourts identity key (`docs/DATA_ADVANTAGE.md`: "CNR
is what eCourts resolves"). Every row that lacks it cannot be identity-matched
against eCourts, cannot be checked for the mobile/plain cross-duplication
`HC_CORPUS_SURVEY.md` §5 still asks about, and cannot support future
CNR-based Tier 2/3 verification. 79,321 rows lacking it is the entire corpus.

## WHAT TO CHECK, IN ORDER

1. **Is the metadata still addressable the same way?** `sci.ts`'s
   `metadataUrl(year)` and `hc-load.ts`'s equivalent read per-year parquet
   files over HTTP range requests. Confirm these URLs still resolve and
   still contain a `cnr` column, for a sample year already held (e.g. 1950
   SC, one HC court/year combination).
2. **Can a row be matched back to its source file deterministically?**
   `judgments.source_url` is unique and was built from the row's own fields
   at ingest time (`sourceUrlFor` in `sci.ts`, the `sourceUrl` parameter
   passed into `toJudgmentRecord` in `hc-load.ts`). Confirm the reverse
   mapping — given a stored `source_url`, can the originating metadata row
   be found again in the same year's file, uniquely?
3. **What is the actual coverage?** Read one full year of SC metadata and
   one full year of HC metadata (a court known to publish `cnr` reliably,
   per `hc-load.ts`'s own module header sample). Count what fraction of
   `cnr` values are non-blank. `blank()` in `sci.ts` is the existing
   emptiness check — reuse it, do not invent a second one.
4. **Estimate the real cost.** Total distinct years × courts that would need
   re-reading, against the AWS bucket's existing per-year/per-partition
   layout already used by the harvest CLIs. This is almost certainly cheap
   (same public bucket, same access pattern as the original ingest, no rate
   limit involved) but state the number rather than assume it.

## WHAT NOT TO DO

- Do not write the backfill CLI in this task. This task is the
  investigation; if it comes back positive, the backfill CLI is task 008,
  scoped separately, following `backfill-provenance.ts`'s established
  dry-by-default pattern.
- Do not touch `apps/**`.
- Do not re-fetch from any live court website — this is AWS Open Data only,
  the same source the original ingest already reads under CC-BY-4.0.

## DELIVERABLE

A short report appended to this file: what was checked, what was found,
whether a backfill is feasible, and if so, the estimated scope (years ×
courts, approximate row count recoverable). Then either proceed to task 008
or record why not.
