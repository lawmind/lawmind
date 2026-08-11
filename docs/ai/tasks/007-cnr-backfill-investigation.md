# TASK 007 — can `judgments.cnr` be backfilled without a re-fetch?

**STATUS: ANSWERED YES, backfill CLI built (`backfill-cnr.ts`) · 11 Aug 2026 ·
owner LCC · from `docs/ai/DATA_MOAT_PROGRAM.md` §7 item 2**

## RESULT

**Feasible, cheap, and low-risk. Investigated directly against the live
bucket before writing any backfill code:**

- **Supreme Court, year=1950**: metadata file still addressable (HTTP 200),
  43/43 rows carry a non-blank `cnr` (100%). The first row's computed
  `sourceUrlFor()` matched a real held `judgments` row by exact `source_url`
  — proving the matching strategy, not just the data's presence.
- **High Court, Patna 2024, plain variant**: one partition file, 123,106
  rows, 100% non-blank `cnr`.
- **Real scope, measured against the corpus that actually needs it** (rows
  with `cnr IS NULL`): **≤76 Supreme Court year-files** and **198 distinct
  High Court (year, court, bench) partitions** — not thousands. Each HC
  partition is fetched once (`listMetadataKeys` on the exact prefix), so this
  is on the order of ~275 HTTP requests total, against the same public
  CC-BY-4.0 bucket the original ingest already reads, at 6-way bounded
  concurrency (`mapConcurrent`, reused from `harvest/hc-metadata.ts`).

**Built `services/ingest/src/backfill-cnr.ts`** (dry-by-default, `--confirm`
to write, matching `backfill-provenance.ts`'s established convention).
Matches by the exact same url-construction functions the real loaders use —
`sourceUrlFor` (`sci.ts`) and `pdfUrlFor` (`harvest/hc-metadata.ts`) — never
a second implementation. Never guesses: blank `cnr` skipped, unmatched url
skipped, and a url reachable from two metadata rows with disagreeing `cnr`
values (checked, not assumed — the plain/mobile variants are documented to
share zero CNRs) is skipped rather than picked.

## RESULTS — run to completion, 11 Aug 2026

Dry run: 38,351 SC url→cnr pairs, 182,978 HC url→cnr pairs, 221,329 total
recoverable (more than the corpus size — the source metadata files hold more
rows than were ever ingested, expected given the partial/paused ingest;
extra map entries simply match nothing).

`--confirm` run: **79,321 of 79,321 judgments now carry a `cnr` — 100%
coverage, the whole corpus, in one run.** Spot-checked directly against
production (not inferred from the CLI's own count): `count(*) = 79321`,
`count(cnr) = 79321`, `count(DISTINCT cnr) = 79299` — 22 rows share a cnr
with another row (0.03%), plausibly the same consolidated-judgment
duplication already documented in task 003's dedup findings, not
investigated further here.

**Closes the canonical-identity gap named at the top of `docs/ai/
DATA_MOAT_PROGRAM.md` §0.** Every held judgment now carries the key eCourts
itself resolves.

## `HC_CORPUS_SURVEY.md` §5 — ANSWERED, for the first time, same session

With `cnr` populated everywhere, the exact query §5 asked for finally
runs: two DIFFERENT `judgments` rows (different `source_url`), same `cnr`.
**10 pairs found (22 rows, 0.03% of the corpus) — and every one is the SAME
court/bench, SAME cnr, SAME filename, differing only in the `year=` segment
of the path** (e.g. `year=2024/court=10_8/bench=patnahcucisdb94/
BRHC010127392021_1_2024-11-28.pdf` vs. the identical filename under
`year=2026/...`).

**This is not the mobile/plain-variant duplication §5 hypothesised — it is
the SAME defect class already documented for the Supreme Court corpus**
(`docs/CURRENT_PLAN.md` Q1.0's superseded entry: "694 of 1,804 rows... a
`row.year` different from their partition"). A document's metadata `year`
field can differ from the year-partition it was actually filed under, and
the loader keys `source_url` off whichever one it read — two ingest passes
reading the same underlying document under its two different year-tags
produce two rows. **§5 is answered: no evidence of mobile/plain-variant
cross-duplication in the 40,980 held HC rows.** The real, much smaller
(0.03% vs. task 003's 1.9% content-hash finding) duplication mechanism is
year-partition drift, not the metadata-variant split. Not fixed here — 22
rows is not worth a dedup CLI on its own; noted for whoever next touches HC
ingest resumption.

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
