# LEGAL STRUCTURE EXTRACTION — Stage 5, measured against production

**11 August 2026, LCC, Stage 5 of the DATA → RETRIEVAL EXECUTION PROGRAM.**
Every field below is triaged **EXTRACTED** (source-provided or deterministically
derived, no guessing), **INFERRED** (a weaker deterministic derivation, stated
as such), or **UNKNOWN** (genuinely absent from what we hold). Nothing here
uses a model to invent structured metadata — every new field added this
session is a verbatim source value or a documented, tested, pure-function
split of one.

**This document does not repeat what Stages 2–4 already established** —
`docs/ai/CANONICAL_IDENTITY.md` (DOCUMENT/CASE/VERSION/SOURCE_ARTIFACT),
`docs/ai/DEDUPLICATION.md` (exact-duplicate groups), `docs/ai/CORPUS_QUALITY.md`
(A/B/C/D buckets). It covers the fields Stage 5 asks for specifically:
parties, advocates, judges, bench, court, case identifiers, dates, document
type, paragraph numbers, sections/Acts, cited authorities, orders/disposition.

---

## 1 · PARTIES — EXTRACTED, two methods, both deterministic

**Migration `0037`**: `judgments.petitioner`, `judgments.respondent`,
`judgments.parties_extraction_method` (`source_metadata` | `title_parsed` |
`unknown`). Applied to production, `services/ingest` full suite green
(342/342) both before and after.

### The bug this session found before building anything

`SciMetadataRow` (Supreme Court source metadata) already carries
`petitioner`/`respondent` as separate, structured fields — verified by
re-reading the real public 2018 metadata file: **795 rows, 0 blank on either
side**, and `title` is `petitioner + " versus " + respondent` verbatim in
every one. **This was never threaded into `JudgmentRecord`** — `sci.ts`'s
`toJudgment` read only `row.title`. Same class of gap as the `cnr` column
found dropped for the whole corpus (task 007): a real field, present in the
source since ingest began, silently discarded before reaching the database.

### The measurement that shaped the design

A corpus-wide check for a separator in `case_title` (`versus`/`Vs`/`Vs.`/`V.`)
initially reported 64 rows with none — **which was itself a bug in the check,
not the corpus**: a `\s+` pattern requires whitespace on both sides of the
separator, and a title with an empty petitioner or respondent (`"Vs"`,
`"SATTO YADAV Vs"`) has no whitespace to require at the string's own
start/end. The same defect class `docs/CURRENT_PLAN.md` Q1.0b names for `\d`
patterns not surviving a JS template literal into Postgres — found
independently here, in application code rather than a SQL string this time.
Fixed with zero-width boundary assertions
(`(?<=^|\s)versus(?=\s|$)`); re-run against all 79,322 `case_title` values,
**every row now matches some separator** (0 `'unknown'`), with 36 rows
returning both sides null (a bare `"Vs"`, no title information at all) and
115 with exactly one side present.

### The method, and why two

```
extractParties(caseTitle, sourcePetitioner?, sourceRespondent?)
  → source metadata first, IF the source row actually carries it
  → deterministic case_title split second (services/ingest/src/parties.ts)
```

Source metadata is preferred wherever it exists: it is what the court itself
filed, not a string this codebase re-derives. It exists only for Supreme
Court rows (`SciMetadataRow`); the held High Court corpus comes entirely from
the **plain** metadata variant, which carries no petitioner/respondent field
at all (`docs/ai/DATA_MOAT_PROGRAM.md` §6 — the mobile variant that would
carry them was never actually the source of any held row).

**16 tests**, `services/ingest/src/parties.test.ts`, encoding real corpus
fixtures rather than invented cases: the Gujarat/Patna-style edge cases, a
genuine suo motu/reference matter (`"IN RE: … versus"` with nothing after
it — the source itself states no second party), and a negative control
(`"VASANT …"` must not be misread as containing a bare `V.` separator).

### Backfilled and verified against production, not assumed

| method | rows | with petitioner | with respondent |
| --- | ---: | ---: | ---: |
| `source_metadata` | 38,324 | 38,324 | 38,324 |
| `title_parsed` | 40,998 | 40,955 | 40,921 |
| **total** | **79,322** | | |

**100% method coverage — 0 rows with `parties_extraction_method IS NULL`.**
The `source_metadata` count (38,324) is 9 below the 38,333 URL→party pairs the
dry run recovered from source; the 9 are recoverable pairs whose computed
`source_url` did not match a currently-held row (consistent with the 11
permanently-unreachable Supreme Court documents named in `docs/ai/
AWS_CORPUS_INVENTORY.md` §3) — not a defect in the backfill, checked rather
than assumed. Spot-checked 8 random rows post-backfill: every split is
correct against the stored `case_title`.

---

## 2 · ADVOCATES — SURVEYED, not built

**Per `docs/ai/DATA_MOAT_PROGRAM.md` §4's own instruction**: *"not measured
whether the source data … even states advocate names reliably … needs a
survey before a schema decision."* This session ran that survey rather than
skip straight to a schema.

**Neither source metadata schema carries a structured advocate field.**
Checked directly: `SciMetadataRow`'s full field list (`title`, `petitioner`,
`respondent`, `description`, `judge`, `author_judge`, `citation`, `case_id`,
`cnr`, `decision_date`, `disposal_nature`, `court`, `available_languages`,
`path`, `nc_display`, `year`, `raw_html`) and `HcMetadataRow`'s (`title`,
`judge`, `decision_date`, `court`, `cnr`, `pdf_link`, `disposal_nature`,
`order_type`) — no `advocate`/`counsel` field on either.

**A signal exists in `full_text`, and it is not clean enough to build on
today.** A 300-row `TABLESAMPLE` for appearance-block phrases (*"for the
petitioner/appellant"*, *"for the respondent"*, *"senior advocate"*,
*"learned counsel for"*) found **96.3% of sampled rows carry some signal**,
concentrated in Supreme Court text (247 of ~150 SC rows vs. 42 of ~150 HC
rows). Reading three real hits rather than trusting the count:

```
"for the appellant"                    — phrase only, no name captured
"for the Appellants"                   — phrase only, no name captured
"for the appellant : N aunit Lal"      — a name, but OCR-mangled
                                          ("N aunit Lal" — a spurious
                                          mid-word space)
```

**Verdict: the appearance-block signal is real but not a reliable name
boundary without real pattern-building** — the same iterative process
`citations.ts`/`treatment.ts`/`paragraph-refs.ts` each went through before
landing safe extraction rules, tested against dozens of real passages, not
one quick survey. Building an `advocates` table off this survey would risk
exactly the "claimed complete when partial" failure `CLAUDE.md` names, or a
table whose `extractionConfidence` is honest but whose actual rows are mostly
noise. **Deferred, not abandoned** — recorded here as the concrete next step
for whoever picks it up: build a name-boundary extractor against ≥50 hand-read
real passages first (matching every other extractor in this codebase's own
discipline), THEN decide the schema (name, side where the surrounding text
states it, raw source span, extraction confidence — exactly the shape the
program's own instruction specifies), not before.

---

## 3 · ORDERS / DISPOSITION — EXTRACTED, another dropped field found

**Migration `0038`**: `judgments.disposal_nature`, verbatim, never
classified. Found while working through Stage 5's checklist: `disposal_nature`
is present on **both** source schemas — `SciMetadataRow.disposal_nature`
(required) and `HcMetadataRow.disposal_nature` (optional) — and was read by
**neither** mapper. The third field in this same class this session found
(after `cnr`, task 007, and `petitioner`/`respondent`, §1 above).

**Sampled directly before committing to store it**: Supreme Court year=2018,
787 of 795 rows populated (99.0%), real distinct outcomes — `Appeal(s)
allowed` (271), `Dismissed` (196), `Disposed off` (166), `Case Partly allowed`
(32), `Leave Granted & Allowed` (32), `Matter referred to larger bench` (7),
and 9 more. Genuinely useful, previously uncaptured structural data.

**Never classified into disposed/pending or judgment/order here.**
`docs/ai/HC_CORPUS_CHARACTERIZATION.md` §11 already named that as separate,
harder, not-yet-designed work (a plain-variant `disposal_nature` value alone
cannot distinguish a reportable judgment from a disposed interim application)
— this migration stores the raw signal every future task needs, without
pretending the classification problem is solved by storing it.

**Backfilled and verified against production.**
`services/ingest/src/backfill-disposal-nature.ts`, re-reading the same public
AWS metadata (Supreme Court year files + all 198 High Court partitions)
`backfill-cnr.ts` already proved works at high match rates, matching by the
same `sourceUrlFor`/`pdfUrlFor` functions the real loaders use. 220,162
url→value pairs recovered from source (most for source rows we do not hold —
only matches against an existing `source_url` write anything).

| | measured |
| --- | ---: |
| `judgments.disposal_nature` populated | **78,160 of 79,322 (98.5%)** |
| — High Court | 40,791 of 40,980 (99.5%) |
| — Supreme Court | 37,369 of 38,342 (97.5%) |

Top values confirmed real and meaningful across both court classes, not
placeholder text: `Appeal(s) allowed` (14,419), `BAIL GRANTED` (14,273),
`Dismissed` (14,152), `DISPOSED` (9,800), `ALLOWED` (4,978), `WITHDRAWN`
(2,588), `Case Partly allowed` (1,895), `ABATED` (419), and more — the
casing split (`Dismissed` vs `DISMISSED`) is itself evidence the value is
verbatim source text, not normalised, exactly as designed.

---

## 4 · WHAT WAS ALREADY BUILT — verified fresh against production, not recalled

Re-queried directly this session rather than trusted from
`docs/ai/DATA_MOAT_PROGRAM.md` §4's earlier claims, per the instruction not to
trust old summaries where the repository can answer directly:

| field | table/column | measured, live |
| --- | --- | --- |
| Judges | `judgment_judges` | **44,360 rows, 277 distinct judges** |
| Bench | `judgments.bench` | **79,306 of 79,322 populated (99.98%)** |
| Court | `judgments.court` | 100% (`NOT NULL`) |
| Case identifiers | `judgments.case_number`, `judgments.cnr` | **both 100% (79,322/79,322)** |
| Dates | `judgments.judgment_date` | 100% (`NOT NULL`) |
| Document type | `judgments.source_document_type` | **still 0.0% corpus-wide** — a standing, previously-flagged, not-yet-root-caused gap (`docs/ai/DATA_MOAT_PROGRAM.md` §6), not re-investigated here |
| Paragraph numbers | `services/api/src/judgments/paragraphs.ts` `segmentParagraphs`/`numberedShare` | built; SAMPLED corpus-wide coverage in `docs/ai/CORPUS_QUALITY.md` §3 (avg 0.747) |
| Statutes / Sections | `judgment_statute_refs` | **97,806 references** |
| Cited authorities | `judgment_citations` | **227,478 edges** (43.0% resolved to a held judgment, `docs/ai/DEDUPLICATION.md`) |

**All eight re-verified live, none taken on trust.** Nothing in this table was
built this session — it is the confirmation that Stage 5's checklist is
mostly already satisfied, so the concrete gaps really were only parties (§1),
advocates (§2, surveyed not built) and orders/disposition (§3), not a wider
rebuild.

---

## 5 · WHAT THIS DOCUMENT DOES NOT DO

- Does not build an `advocates` table — §2 explains why, and names the exact
  next step (real pattern-building against real passages) rather than
  leaving it unscoped.
- Does not classify `disposal_nature` into disposed/pending or judgment/order
  — `docs/ai/HC_CORPUS_CHARACTERIZATION.md` §11's own deferral stands.
- Does not root-cause `source_document_type`'s 0.0% coverage — a pre-existing,
  separately-flagged gap, not touched here.
- Does not touch `apps/**` or any RCC-owned surface.
- Does not attempt HEADNOTES as a distinct extracted field — no source schema
  or `full_text` pattern for a headnote block was surveyed this session;
  genuinely unstarted, not silently skipped.
