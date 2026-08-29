# SCHEMA TRUTH

The only authority on data shapes. Never infer a column. Never add a table
without updating this file in the same commit.

## users

`id` uuid pk · `auth_id` text unique · `full_name` text · `phone` text ·
`email` text · `bar_enrolment_number` text null · `enrolment_status` enum
(unverified|verified|rejected) default unverified · `preferred_language` enum
(en|hi) default en · `subscription_tier` enum
(none|practice|chamber|expert|firm|enterprise) default none ·
`terms_accepted_at` timestamptz null · `terms_version` text null ·
`training_consent_at` timestamptz null · `training_consent_version` text null ·
`expo_push_token` text null · `created_at` timestamptz

**`expo_push_token` — added 7 Aug 2026, migration 0015.** **Null means no device
has registered**, which is an absence and never a refusal or a failure: an
advocate who has not opened the app on a phone, or who declined the OS prompt, is
a normal state, and the nightly delivery reports them as _skipped_ rather than
_failed_. An error rate that counts normal states is an error rate nobody reads.

Cleared automatically when Expo answers `DeviceNotRegistered` — the app was
removed or the token rotated, and retrying nightly forever is a permanent failure
that hides real ones. A transport error never clears it: an outage must not look
like an uninstall.

`briefings.delivered_at` is written by the same job and had never been written
before. **Generated, delivered and opened are three different facts in three
columns** — collapsing any two makes the activation metric (two briefings opened
in week one) meaningless. `delivered_at` means Expo _accepted_ the message, which
is not the same as the phone receiving it.

**TRAINING CONSENT — added 9 Aug 2026, migration 0025. A SECOND, SEPARATE
consent, and the separation is the point.**

`training_consent_at` + `training_consent_version` record that an advocate
agreed their own work may be used as training input. **This is not the PD-8 pair
below**, and reusing that pair would have been one column cheaper and wrong:
**DPDP Act 2023 s. 6** requires consent to be _free, specific, informed,
unconditional and unambiguous_, given **for a specified purpose**. Accepting the
terms is not agreeing that your drafting teaches the model.

**An unset pair means NO** — no boolean, no default. A `boolean NOT NULL DEFAULT
false` would make "never asked" and "asked and declined" indistinguishable, and
only one of those is worth asking about again. A CHECK constraint
(`training_consent_complete`) enforces **both or neither**, in the database,
because this is exactly the kind of pair that drifts when only application code
guards it.

**Withdrawal sets both columns back to NULL.** There is deliberately no
`training_consent_withdrawn_at`: a third column leaves two that can disagree and
a question — _granted in March, withdrawn in August, what about the pairs
emitted in May?_ — that application code must re-answer forever. DPDP s. 6(6)
requires processing to cease on withdrawal, and it does, because
`services/api/src/training/extract.ts` **materialises nothing**: pairs are
generated on demand and filtered by consent at generation time, so withdrawal is
retroactive by construction and there is no deletion job to forget.

**`training_consent_events`** (id · user_id fk→users cascade · action
text CHECK in (granted|withdrawn) · version text null · created_at timestamptz)
is the append-only history. Nothing updates a row; a correction is another row.
It is what makes resetting the live columns to NULL lossless.

**PD-8 — consent replaces the AI-assisted mark.** `terms_accepted_at` and
`terms_version` record the advocate actively accepting AI assistance, the duty to
verify before filing, and the terms of legal use. Both are set together at
onboarding and **never back-filled**: an unset pair means consent was not given,
and that is a state the app must be able to see. Store the **version**, not a
boolean — when the terms change, who accepted which text is the only thing that
matters.

`preferred_language` is a two-value enum today. **The i18n architecture stays
multi-language** so a third locale is a migration, not a rewrite — but note that
this enum, `judgments.language` and `documents.language` are the three places a
new locale touches the database. Thailand is out of v1 (civil-law jurisdiction —
the citation-verification moat does not transfer); revisit after ₹1Cr ARR.

## judgments

`id` uuid pk · `case_title` text · `neutral_citation` text null ·
`reporter_citations` text[] · `court` text · `bench` text null — **the judges
who sat, never a court code; see `source_bench_code` below** ·
`judgment_date` date · `full_text` text · `language` enum (en|hi) ·
`source_url` text · `overruled_status` enum
(none|set_aside|partly_set_aside|doubted) default none ·
`overruled_status_changed_at` timestamptz null — when the status last moved ·
`overruled_by_judgment_id` uuid null fk→judgments ·
`overruled_paras` int[] null — the affected paragraphs, required when
`partly_set_aside` · `overruled_note` text null · `storage_key` text null ·
`created_at` timestamptz

`storage_key` (migration `0028`) is the **R2 key holding this judgment's
brotli-compressed text** — Tier 3 of `docs/CORPUS_TIERING.md` §3. Three things
about it are load-bearing:

- **A key, never a URL.** The bucket, account and endpoint must be able to change
  without rewriting 15.9M rows; a URL would embed today's account id in all of
  them.
- **Never the PDF.** `source_url` already points at the public, permanent,
  CC-BY-4.0 AWS bucket. We store a pointer into somebody else's CDN and never a
  copy of it — `CORPUS_TIERING.md` §3 books that line at zero deliberately.
- **NULL means "not tiered out"**, which is a real and permanent state for the
  38,341 Supreme Court judgments held hot in Postgres. It is not a missing value
  and must not be backfilled.

Indexed partially, `WHERE storage_key IS NOT NULL` — the tiered-out rows are what
anyone queries, and the NULLs are the majority for as long as Tier 1 exists.

`overruled_status_changed_at` is what makes the stale-overruled rate measurable:
without it there is no way to tell a badge that was **wrong when rendered** from
one the world invalidated afterwards. Set it in the same write as any
`overruled_status` change, including inside `applyOverruledChange`.

`case_number` text null — the official case number exactly as printed by the
source, e.g. `CRIMINAL APPEAL No. 19/1955` · `case_type` enum (criminal|civil)
null — **derived from `case_number`, never inferred from the judgment's content**.
Both added S1.

`case_type` exists because `docs/API_CONTRACTS.md` §Search offers a `caseType`
filter and judgments carried nothing to filter on. The rule is mechanical: the
case number contains `CRIMINAL` → criminal, else contains `CIVIL` → civil, else
**null**. Indian Supreme Court case numbers state this themselves — `CIVIL
APPEAL`, `CRIMINAL APPEAL`, `WRIT PETITION (CIVIL)`, `SPECIAL LEAVE PETITION
(CRIMINAL)` — so this reads a published field rather than classifying a case.

`case_number` is stored alongside so the derivation is **auditable**: anyone can
see the string it came from. Categories that do not state a side —
`ARBITRATION PETITION`, `MISCELLANEOUS APPLICATION`, bare diary numbers — are
left null and are **excluded when the filter is applied**, rather than guessed
into one side. A filter that silently mis-sorts a matter is worse than one that
returns less.

`full_text_tsv` tsvector GENERATED ALWAYS AS `to_tsvector('english', full_text)`
STORED — added S1, and the reason is a measured one, not a preference.

`content_hash` text null — sha256 of `full_text`, added migration `0031`,
11 Aug 2026. `source_url` uniqueness catches a re-fetch of the same document;
it cannot catch the same underlying judgment arriving under two different
URLs, which `HC_CORPUS_SURVEY.md` found is a real possibility — the AWS High
Court bucket's two metadata variants (`metadata.parquet` and
`metadata-mobile.parquet`) share **zero CNRs**, so nothing rules out both
eventually holding the same text. Two rows sharing a hash are the same text;
which one is canonical is still an ingest-design decision, not something this
column answers. **Null means not yet computed**, not "no duplicate" —
`services/ingest/src/backfill-provenance.ts` computes it for existing rows
over text already in Postgres, no re-fetch required; new writes get it from
`upsertJudgments` (`services/ingest/src/load.ts`) going forward.

`text_quality` numeric(4,3) null — the same measured proxy already documented
under `judgment_chunks` below, applied at the judgment level. Added alongside
`content_hash`, same migration, same reasoning: a proxy for visible
OCR/extraction damage, never accuracy. Computed by
`services/embed/src/quality.ts`'s `textQuality()` — the existing function,
not a new metric.

`source_document_type` text null — verbatim from the source's own
`order_type` column where the source publishes one (today: the AWS bucket's
mobile variant only, 4 of 25 High Courts — `HC_CORPUS_SURVEY.md` §2). **Never
classified, never guessed.** `View Judgement/Order` — an ambiguous label
covering 17.89% of the labelled rows — is stored exactly as printed rather
than resolved to `judgment` or `order`; resolving that ambiguity needs the
PDF text, which this column does not read. Null on every Supreme Court row
and on the 21 High Courts that publish no such column — an absent label, not
a negative claim about the document.

`source_bench_code` text null — added migration `0040`, 11 Aug 2026. **The
source's own court-establishment code, verbatim** — the AWS High Court bucket's
`bench=` path segment (`.../court=10_8/bench=patnahcucisdb94/...`). Provenance,
and **never a coram**. NULL on every Supreme Court row, which has no such
partition.

It exists because `bench` held it. `services/ingest/src/harvest/hc-load.ts`
mapped `bench: partitions.bench`, and the word means two different things in
the two places: the partition names the court establishment that PUBLISHED the
file, `judgments.bench` means the JUDGES WHO SAT, and `GET /judgments/:id`
renders it as the coram. Measured against production: **40,980 rows — 51.3% of
the corpus, every High Court judgment held** — showed `patnahcucisdb94`,
`gujarathc`, `newos` where the bench belongs, and **zero of them had a matching
`judgment_judges` row**, so it was never a badly-formatted judge list.

`bench` is therefore **NULL on all 40,980**, plus the 16 that already were.
That is the honest value, not a gap: the plain High Court metadata variant —
the only one we hold — publishes no judge field at all. `judgment_judges`
covers 38,325 Supreme Court judgments and no High Court one.

**Bench strength is not derivable, and the reason is worse than "no column".**
RCC bus 0046 asked for `bench: ('constitution' | 'three_plus')[]`. A count _can_
be produced — `judgment_judges` has 44,360 rows over 38,325 Supreme Court
judgments, and the distribution looks legally plausible at a glance (33,484
single · 3,913 two · 798 three · 104 five · 6 seven · 2 nine).

**It is a LOWER BOUND, and on the highest-value cases in Indian constitutional
law it is catastrophically wrong.** Checked 11 Aug 2026 against benches whose
size is externally known:

| case                    | real bench | judges recorded | `bench` column holds |
| ----------------------- | ---------- | --------------- | -------------------- |
| **Kesavananda Bharati** | **13**     | **1**           | `S.M. SIKRI`         |
| **Golak Nath**          | **11**     | **1**           | `K. SUBBA RAO`       |
| **Maneka Gandhi**       | **7**      | **1**           | `M. HAMEEDULLAH BEG` |
| S.R. Bommai             | 9          | **9**           | all nine names       |

The source records the **presiding judge alone** on most rows and the full coram
on some — Sikri CJ, Subba Rao CJ and Beg CJ each presided over the bench whose
size is understated as 1. So 33,484 "single-judge Supreme Court judgments" is
not a fact about the Court, which sits in benches of two or more by convention;
it is a fact about the metadata.

A `constitution` (5+) filter built on this **would miss Kesavananda Bharati,
Golak Nath and Maneka Gandhi** — an advocate filtering for Constitution Bench
authority would be told the three most famous ones do not exist. That is the
`case_type` rule at maximum severity: _a filter that silently mis-sorts is worse
than one that returns less._ **Bench strength needs a source that publishes the
full coram, and until then it is not filterable and not reasonable-over
(Stage 16).**

`hc_document_class` text null · `hc_class_method` text null — added migration
`0042`. **What KIND of document a High Court row is**, derived from
`disposal_nature` and text length. `docs/ai/HC_CORPUS_QUALITY.md`.

Kept separate from `source_document_type`, which stays verbatim-from-source and
is NULL on all 40,980. Values: `bail_order` (23,194) · `procedural_disposal`
(3,963) · `decided` (2,410) · `decided_brief` (453) · `reference_stub` (132).
**NULL on 10,828, and that is a result rather than a default** — 10,654 of them
carry `disposal_nature = 'DISPOSED'`, which covers a reasoned decision, a consent
order and an infructuous closure alike, and guessing it into `decided` would
inflate the authority count by 24% of the corpus.

`hc_class_method` records which rule fired, including the reason a row was left
unclassified — the same shape as `parties_extraction_method`. **0 rows carry a
class with no method.** One rule, `text_bail_phrase` (6,477 rows), reads the
prose rather than a source field and is the only inference among them.

**It is a classification of documents, never a legal weight.** Whether a High
Court order carries precedential authority is a question about ratio and
reasoning, and nothing here decides it. The headline it produces: **40,980
documents contain 2,249 unique candidate authorities, 5.5%** — of which 97.4%
are Patna High Court and 95% are from 2026.

`cnr` text null — the eCourts Case Number Record, added migration `0034`,
11 Aug 2026. The canonical cross-source identity key (`docs/DATA_ADVANTAGE.md`:
"CNR is what eCourts resolves"), and what `judgments_source_url_key`'s own
comment names as the unclosed gap: `source_url` catches a re-fetch of the same
document, never the same underlying judgment arriving under two different
URLs. **Found present in both source metadata schemas
(`SciMetadataRow.cnr`, `HcMetadataRow.cnr`) and read by neither mapping
function before this migration** — silently discarded for the whole corpus,
Supreme Court and High Court alike. Verbatim from source, never derived.
**Backfilled to 100% coverage the same day** — `services/ingest/src/
backfill-cnr.ts` re-read the same public AWS metadata files (no re-fetch)
and populated all 79,321 existing rows; `docs/ai/tasks/
007-cnr-backfill-investigation.md`.

`native_text` boolean null — whether the source PDF had a usable text
layer, added migration `0035`, 11 Aug 2026. Computed at fetch time from
characters-extracted / page-count against a 100-char/page floor
(`services/ingest/src/text.ts`'s `isNativeText`) — the classifier already
existed and was proven against real High Court PDFs in the extraction-cost
benchmark (`docs/CURRENT_PLAN.md` §A3.3); this migration is what first
wires it to persist a value per judgment. **Null on every one of the
79,321 rows that predate this migration, and not backfillable the way
`content_hash`/`cnr` were** — recovering it needs the source PDF's page
count, which means re-fetching the PDF itself, not re-reading already-
stored text or metadata. `docs/ai/AWS_CORPUS_INVENTORY.md` §6.

`petitioner` text null · `respondent` text null · `parties_extraction_method`
enum (`source_metadata`|`title_parsed`|`unknown`) null -- added migration
`0037`, 11 Aug 2026, `docs/ai/LEGAL_STRUCTURE.md`. `source_metadata`: the
court's own filed petitioner/respondent, present on `SciMetadataRow` and
never threaded into `JudgmentRecord` until this migration -- the same class
of gap `cnr` was found to be. `title_parsed`: deterministic `case_title`
separator splitting (`services/ingest/src/parties.ts`), the only method
available for every held High Court row. **Backfilled to 100% method
coverage the same day** -- 38,324 `source_metadata`, 40,998 `title_parsed`,
0 rows unclassified.

`disposal_nature` text null -- verbatim from the source's own
`disposal_nature` field, added migration `0038`, 11 Aug 2026, present on
BOTH source schemas and read by neither mapper before this migration.
**Never classified** into disposed/pending or judgment/order --
`docs/ai/HC_CORPUS_CHARACTERIZATION.md` §11 named that as separate, harder,
not-yet-designed work. Backfilled to 78,160 of 79,322 rows (98.5%).

Index: gin on `full_text_tsv`; btree on judgment_date, court, **created_at**
(migration `0050`, 14 Aug 2026 — arrival-order pagination for the paragraph-
coverage backfill; `id` is uuid v4 so it cannot serve as a resumable
watermark, `created_at` is monotonic and can, NEW2 bus 0461); partial btree on
`content_hash` where not null; partial btree on `cnr` where not null.
Unique: `source_url`.

**Why the tsvector is stored rather than computed in an expression index.**
Measured on 1,281 Supreme Court judgments: a query for a common term matched 1,241
of them, so the planner correctly chose a sequential scan, and `ts_rank` then
recomputed `to_tsvector` for every matching row — several of which are over 800KB
of text. **20.8 seconds for one query.** A gin expression index cannot supply the
vector back to `ts_rank`, so no amount of index tuning fixes it; the vector has to
be stored. Gate S1 requires a known citation retrieved in under 3 seconds, and
that is unreachable without this column. Cost is roughly double the text storage.

Two notes recorded in S1, when the first real corpus was ingested:

**The unique on `source_url`** is what makes ingest resumable — killing a run and
restarting must not duplicate, and that is enforced in the database rather than in
application code. It deduplicates a judgment **within** a source, not **across**
sources: the same judgment fetched from AWS Open Data and from IndianKanoon has
two URLs and would produce two rows. Cross-source identity is a citation question
and belongs to S2, not here.

**The gin index takes an explicit `'english'` text-search configuration.** The
one-argument `to_tsvector(full_text)` in the original line cannot be indexed —
it is not IMMUTABLE, because it depends on `default_text_search_config`. So the
index is on `to_tsvector('english', full_text)`. The consequence is real and
should not be discovered later: Hindi judgments get English stemming and English
stopwords in the sparse half of hybrid retrieval. Postgres ships no Hindi
configuration; `'simple'` would drop stemming for English too. **Unresolved, and
it is a retrieval decision, not a schema one.**

`overruled_status` replaces the former `is_overruled` bool. A boolean cannot
carry the three states in `design/screens/IMPLEMENTATION.md` §9.3, where
`set_aside` **disables add-to-matter**, `partly_set_aside` must name the affected
paragraphs, and `doubted` shows no banner at all. Overruledness is a property of
the judgment, answered by a different source than verification — see
`CITATION_HARNESS.md`.

## judgment_chunks

`id` uuid pk · `judgment_id` uuid fk→judgments cascade · `chunk_index` int ·
`chunk_text` text · `embedding` vector(1024) · `token_count` int ·
`ocr_confidence` numeric(4,3) null — **an OCR engine's own confidence, and only
that.** Set where WE ran the OCR. Left null for text that arrived already
extracted, because we did not run the engine and cannot report its confidence ·
`text_quality` numeric(4,3) null — a **measured** proxy, added S1

### Why these are two columns and not one

`ocr_confidence` could not be populated from the corpus at all. AWS Open Data
ships judgment PDFs whose pre-2010 text is a scan that somebody else OCR'd, with
no confidence score attached — 1950 text reads `Oot. l't,` for "Oct. 17" and
`SAIYID FAZL Au` for "FAZL ALI". Putting a number we invented into a column that
means _engine confidence_, and then letting retrieval rank on it, would be
fabricating data in the one place this product cannot afford it.

`text_quality` is therefore a different question with an honest answer: **how
damaged does this text look**, computed from the text itself. It is the share of
alphabetic tokens with a plausible shape — tokens carrying interior punctuation or
a lower-to-upper case flip mid-word are the signature of OCR damage. 1.000 is
clean, lower is worse.

**It is a proxy and must never be described as accuracy.** It cannot see a
confidently-wrong character: an OCR engine reading `1985` as `1935` produces a
perfectly well-shaped token and scores 1.000. It measures visible corruption, not
correctness. Retrieval **down-ranks** on it and never excludes on it, because
damaged text is still the judgment.

When S4 runs our own OCR (`docs/OCR_PIPELINE.md`), that engine's real confidence
lands in `ocr_confidence` and the two coexist: one is what the engine claimed,
the other is what the text looks like.

Index: ivfflat on embedding vector_cosine_ops; btree on judgment_id.
Unique: (judgment_id, chunk_index).

## judgment_citations

Added S1, 6 Aug 2026. **One row per citation found in a judgment's text — plus
one SENTINEL row per judgment that contains no citation at all.** Documented
11 Aug 2026, after that second half went unwritten for five days and was reported
as an extraction defect on the strength of this line alone.

`id` uuid pk · `citing_judgment_id` uuid fk→judgments cascade ·
`cited_judgment_id` uuid null fk→judgments **set null** — null when the cited
authority is not in the corpus · `citation_text` text — exactly as it appeared ·
`normalised_citation` text — the comparison form · `relationship` text
(`cites`|`followed`|`approved`|`distinguished`|`doubted`|`overruled`|
`overruled_in_part`) default `cites`, check-constrained (migrations `0008`,
`0010`, `0039`) · `evidence` text null — the phrase that justified a
relationship other than `cites` · `char_offset` int — where in the citing text ·
`created_at` timestamptz

Unique: (`citing_judgment_id`, `normalised_citation`) — re-running extraction is
idempotent. Index: btree on `citing_judgment_id`; partial btree on
`cited_judgment_id` and on (`cited_judgment_id`, `relationship`) where the id is
non-null; partial btree on `normalised_citation` where it is null.

### Why this table had to exist

`overruled_status` was `none` on all 38,341 judgments and
`overruled_by_judgment_id` null on all of them, so **no surface in the product
could ever show that the law had moved**. `CITATION_HARNESS.md` names this exact
condition in its blind-spots section: a corpus that never learned an overruling
reads 0.0% stale while advocates see stale badges, because both sides of the
comparison agree. The edges have to be extracted before any of the overruled
machinery has anything to act on.

### The SENTINEL row — `citation_text = ''` — is not a citation

`citations-cli.ts` writes **one row with an empty `citation_text` and an empty
`normalised_citation`** for a judgment in which the extractor found nothing. It
exists so the resumable pass — _"skip any judgment that already has rows"_ — does
not re-scan the same judgment on every future run. Without it, the judgments that
cite nothing would be re-read forever.

#### IT WILL CORRUPT ANY `cited_judgment_id IS NULL` COUNT — this cost a day

**A sentinel is not an unresolved citation. It is the absence of a citation.**
But it sits in the same table with `cited_judgment_id IS NULL`, so the obvious
query silently conflates the two:

```sql
-- WRONG. Half of this is judgments that cite nothing at all.
SELECT count(*) FROM judgment_citations WHERE cited_judgment_id IS NULL;

-- RIGHT.
SELECT count(*) FROM judgment_citations
 WHERE cited_judgment_id IS NULL AND coalesce(citation_text,'') <> '';
```

Measured 13 Aug 2026, with the section above already written:

    sentinels           625,748   (exactly one per judgment, 0 invariant violations)
    real unresolved     598,759
    resolved            112,241
    resolution rate       15.8%   — the naive query gives 8.4%

**Two lanes computed the wrong number from this on the same day, and one of them
escalated it to a third lane as a reason to re-plan a week of retrieval work.**
Neither had read this file first, which is the whole failure — `CLAUDE.md` names
`SCHEMA_TRUTH.md` as the only authority on data shapes and it already said this.

> **Before publishing any figure derived from a corpus table, read its entry
> here.** A number computed against a shape you have not checked is a guess with
> a decimal point on it.

**The invariant, re-verified at 46x the scale it was written against:** 625,748
sentinels over 625,748 distinct judgments, and **zero** judgments carrying both a
sentinel and a real edge. `--rescan` clears the sentinel when a judgment starts
citing something. The design is sound; only its discoverability was not.

## citation_concordance_resolutions

Added 11 Aug 2026, migration `0043`. DeepSeek-adjudicated candidate resolutions
for `external_citations` targets the deterministic concordance
(`services/ingest/src/concordance.ts`) cannot join — `docs/ai/
CITATION_CONCORDANCE_PROGRAM.md`. **An adjudication aid, never a source of
truth**: nothing reads this table to answer a citation query, and moving a
row's candidate into `judgment_citation_aliases` is a separate, explicit,
threshold-gated step this table never performs on insert.

`id` uuid pk · `source` text — the unresolved-citation feed, e.g.
`aws_high_court` · `citation_key` text — matches `external_citations.
citation_key` · `citation_text` text — as printed · `citation_year` int null ·
`context_evidence` text — a bounded snippet around one sighting, never the
source document · `candidates` jsonb — the exact candidate set shown to the
model, `[{judgmentId, caseTitle, judgmentDate, jaccard}, ...]` ·
`candidate_judgment_id` uuid null fk→judgments **set null** — the model's
selection; null is a real answer (none of the candidates / impossible to
determine), not a gap · `decision` text check
(`candidate_selected`|`none_of_candidates`|`impossible_to_determine`|
`no_candidate_generated`) · `confidence` text check
(`high`|`medium`|`low`|`ambiguous`|`unresolved`) — thresholds derived from a
measured precision/recall curve on a gold set, `docs/ai/
CITATION_CONCORDANCE_EVALUATION.md`, never invented ahead of that measurement ·
`deterministic_top_score` / `deterministic_runner_up_score` numeric(5,4) null —
the Jaccard candidate-ranking scores, kept beside the model's decision so
agreement/disagreement between the two is auditable · `model_used` text ·
`model_input_hash` text — sha256 of (citation key + context + candidate id
list); the cache key, so re-adjudicating identical evidence is a lookup, not a
second model call · `model_output_hash` text null · `model_reasoning` text
null — the model's own stated reason, stored verbatim · `contradictions` text
null — verbatim, from the model · `signals_used` text[] default `{}` ·
`needs_human_review` boolean default true · `validation_status` text check
(`unvalidated`|`gold_positive`|`gold_negative`|`promoted`|`rejected`) default
`unvalidated` — `promoted` is the only status meaning this row's candidate was
ever written to `judgment_citation_aliases` · `created_at` timestamptz

Unique: (`source`, `citation_key`, `model_input_hash`) — the idempotency
constraint. Index: btree on `citation_key`; partial btree on
`candidate_judgment_id` where non-null; btree on `confidence`.

**Migration `0044`, same session:** `llm_calls.feature` widened with a
`concordance` value — `CLAUDE.md` §5's ledger rule applies to this pass exactly
as it does to search/draft/briefing. Public-class data (published court text
and case names), DeepSeek V4 Flash via the inferx.net free grant.

### Two related tables, undocumented before this entry — a pre-existing gap, noted rather than silently carried forward

`external_citations` (migration `0030`) and `judgment_citation_aliases`
(migration `0027`) both predate this entry and were never added to this file,
despite its own opening rule. Not fixed here — out of scope for this
program — but recorded so the next reader does not conclude the omission was
deliberate. `external_citations`: one row per citation sighted in a High
Court document this corpus does not hold as a judgment (`source`, `source_key`,
`court_name`, `source_year`, `citation_text`, `citation_key`,
`cited_judgment_id` null fk→judgments set null, `char_offset`), unique on
(`source`, `source_key`, `citation_key`) — `packages/db/drizzle/
0030_external_citations.sql` carries the full rationale. `judgment_citation_aliases`:
the AIR/SCC↔SCR concordance mined from courts' own parallel citations
(`judgment_id` fk→judgments cascade, `alias`, `alias_key` unique, `alias_reporter`,
`corroborations`, `evidence`) — `services/ingest/src/concordance.ts` carries the
full rationale.

**Measured against production, not assumed:** 13,834 sentinel rows over **13,834
distinct judgments**, every one with `char_offset = 0`, `relationship = 'cites'`
and `cited_judgment_id` null, and **zero judgments carrying a sentinel beside a
real edge**. One per judgment is enforced by the unique index — two sentinels for
the same judgment would collide on (`citing_judgment_id`, `''`).

**Two consequences, and both have already been got wrong once.**

1. **They are excluded from any denominator about citations.** Counting them as
   unresolved citations understated resolution as **40.4%** when the figure over
   real citation edges was **43.5%** (77,600 / 178,363). `resolve-cli` now prints
   the denominator beside the percentage for exactly this reason.
2. **They must be cleared when a judgment stops citing nothing.** A widened
   extractor turns some of them into judgments with real edges, and a sentinel
   left beside a real edge breaks the invariant the resume query stands on.
   `citations-cli --rescan` deletes it in the same transaction that inserts the
   edges.

**No advocate-facing surface can render one.** Every read filters on
`cited_judgment_id` being non-null or equal to a specific id, and a sentinel is
always null — checked across `judgments/treatment.ts`, `judgments/as-at.ts`,
`search/graph-expand.ts` and `citations/propagate-treatment.ts`.

### `cited_judgment_id` is nullable, and that is the point

A citation that does not resolve **exactly** against a stored `neutral_citation`
or `reporter_citations` entry keeps its row with a null `cited_judgment_id`. It is
never fuzzy-matched to the nearest candidate: a wrong edge is a fabricated
statement about what one court said of another, which is the failure this product
exists to prevent.

Unresolved rows are kept rather than discarded because they **measure corpus
coverage** — the share of cited authority we cannot yet resolve is a number worth
knowing, and deleting the rows would hide it.

### `relationship` defaults to `cites`, and `evidence` is why

Whether a later bench _followed_ or _overruled_ an authority is a legal reading,
not a string match. Where a signal phrase appears within 400 characters of the
citation the relationship is recorded **together with the phrase that justified
it**, so any row can be audited back to its own text. Where no phrase appears the
value is `cites` — mechanically true and claiming nothing further.

This is deliberately conservative. Most citations in a judgment are references
rather than treatments, and labelling them otherwise would overstate the record.
`relationship` answers a **different question** from
`citation_checks.verification_state`: one is how a later court treated an
authority, the other is whether that authority exists. A judgment can be
`verified` and `overruled`, or `unverified` and `followed`.

## document_duplicate_groups / document_duplicate_members

Added migration `0036`, 11 Aug 2026 — `docs/ai/CANONICAL_IDENTITY.md` /
`docs/ai/DEDUPLICATION.md`, Stage 3 of the data-moat program. A GROUP table,
not a pairwise edge table: the largest exact-duplicate group found
(`docs/ai/tasks/003-corpus-inventory.md`, a Gujarat 1993 batch judgment) has
124 members, and a pairwise table would need C(124,2) = 7,626 rows to say
what one group row says.

`document_duplicate_groups`: `id` uuid pk · `relationship`
(`exact_duplicate`|`near_duplicate`|`unknown`) · `method`
(`content_hash`|`minhash_lsh`|`manual`) · `group_key` text — the value the
method grouped on, the shared `content_hash` for the `content_hash` method ·
`member_count` int — denormalised at write time, not a live `COUNT(*)` ·
`evidence` text null · `detected_at` timestamptz.

Unique: (`method`, `group_key`) — re-running the materialiser updates one row
per group rather than duplicating it.

`document_duplicate_members`: `group_id` uuid fk→document_duplicate_groups
cascade · `judgment_id` uuid fk→judgments cascade · composite pk
(`group_id`, `judgment_id`).

**Never destroys provenance.** No column here can delete or merge a
`judgments` row — `judgment_id`'s only FK action is CASCADE on the
_membership_ row, never the reverse. Each member keeps its own `cnr`,
`case_number` and `source_url` exactly as ingested.

**Populated by `services/ingest/src/dedup-materialize-cli.ts`
(`pnpm --filter @lawmind/ingest run dedup:materialize [--confirm]`), which
reads only the already-100%-populated `judgments.content_hash` — no PDF
fetch, no full-text re-scan.** `near_duplicate` and cross-partition `unknown`
relationships are designed but not computed at corpus scale —
`docs/ai/DEDUPLICATION.md` §Near-duplicate detection states the cost and the
reproducible sampling methodology, per the founder's instruction not to
pretend an unmeasured limitation is solved.

## judgment_annotations

Added 6 Aug 2026 for PD-9 item 3 — highlight and save a passage.

`id` uuid pk · `user_id` uuid fk→users cascade · `judgment_id` uuid fk→judgments
cascade · `matter_id` uuid null fk→matters set null ·
`paragraph_number` int null — **what the court printed**, the citable anchor ·
`paragraph_index` int — position in the rendered array, never citable ·
`quote` text · `note` text null · `created_at` timestamptz ·
`deleted_at` timestamptz null

Index: partial btree on (`user_id`, `judgment_id`) and on `matter_id`, both where
`deleted_at is null`.

**Two paragraph fields, and the reason is not tidiness.** A re-ingest can move a
paragraph's position — a headnote parsed differently, reporter furniture stripped
that was not stripped before — and an annotation that followed the index would
silently relocate to a different passage of the same judgment. Nothing errors;
the note is simply attached to the wrong law. `paragraph_number` is null on
judgments that carry no numbering, which is every pre-1990s OCR'd scan, and
`paragraph_index` exists so those annotations still land somewhere.

Deletion is a timestamp, never a row removal — the same reasoning as
`matter_shares.revoked_at`: what an advocate had marked, and when, is the question
asked later.

## saved_searches

Added 6 Aug 2026. **The in-app feed only — never a notification.**

`id` uuid pk · `user_id` uuid fk→users cascade · `query_text` text ·
`query_language` enum-checked (en|hi) · `filters` jsonb null ·
`last_seen_at` timestamptz · `created_at` timestamptz ·
`deleted_at` timestamptz null

Index: partial btree on `user_id` and on (`user_id`, `last_seen_at`), both where
`deleted_at is null`.

`last_seen_at` is what makes the feed a feed: anything newer is unseen. **There is
deliberately no `notified_at` and no delivery state.** PD-5 excludes
subject-following alerts from notifications entirely — _"that is discovery, not an
alert; it belongs in the app, never in a notification"_ — and a column for
delivery would invite one to be built.

**The table existing is not approval to build the surface.** `FEATURE_PARITY.md`
§3 holds the client feed pending the founder's confirmation of the reframe.

## statutes

Added S1 for the bare acts library (`sprints/SPRINT_1.md` LCC task 3, which
requires the shape recorded here **before** the migration). One row per Act.

`id` uuid pk · `act_id` text unique — the source's own act identifier, which is
what makes ingest resumable, exactly as `judgments.source_url` does ·
`short_title` text · `hindi_title` text null · `act_number` text ·
`act_year` int · `enactment_date` date null · `enforcement_date` date null ·
`ministry` text null · `source_url` text · `created_at` timestamptz

Unique: `act_id`.

`enforcement_date` is separate from `enactment_date` and both matter: BNS was
enacted 25 December 2023 and came into force 1 July 2024, and **which regime
applies to an offence turns on the enforcement date, not the enactment date**
(`DOMAIN_TRUTH.md`). Storing only one of them would make that question
unanswerable.

## statute_sections

`id` uuid pk · `statute_id` uuid fk→statutes cascade ·
`section_number` text — **text, not int**: sections carry letters (`63A`) and
renumbering is common · `heading` text null · `section_text` text ·
`footnote` text null · `order_index` int — the Act's own ordering, because
`section_number` does not sort lexically · `source_url` text ·
`full_text_tsv` tsvector GENERATED ALWAYS AS
`to_tsvector('english', coalesce(heading,'') || ' ' || section_text)` STORED ·
`created_at` timestamptz

Unique: (`statute_id`, `section_number`). Index: gin on `full_text_tsv`;
btree on (`statute_id`, `order_index`).

The tsvector is **stored, not an expression index** — the same lesson already paid
for on `judgments`, where an expression index left `ts_rank` recomputing
`to_tsvector` per row at 20.8s a query. Applied here rather than re-learned.

**No embedding column yet.** Statutory search is lexical first: an advocate looks
up a section by number or by its exact term, and section text is short and
precise, which is where sparse retrieval is strongest. A vector column is added
when semantic statute search is actually built, not before.

`footnote` is not decoration. It carries the Act's **own printed amendment
history** — `Subs. by Act 45 of 1965, s. 8, for clause (a) (w.e.f. 1-4-1966)` —
for **9,064 of 34,928 sections**, and it was ingested on the first `acts` run
and never read until migration `0041`. See `statute_amendments` below.

## statute_amendments

**Added migration `0041`, 11 Aug 2026 — Stage 8's point-in-time foundation.**
`docs/ai/STATUTE_TEMPORAL_STAGE8.md`.

`id` uuid pk · `statute_section_id` uuid fk→statute_sections cascade ·
`ordinal` int — the footnote's own printed number, so a row traces back to its
note · `event_type` text CHECK in
(inserted|substituted|omitted|renumbered|repealed|commenced) ·
`amending_act_raw` text null · `amending_act_number` int null ·
`amending_act_year` int null · `amending_section` text null ·
`effective_date` date null · `substituted_text` text null ·
`ibid_resolved` bool · `ibid_unresolved` bool · `verbatim` text ·
`created_at` timestamptz

Unique: (`statute_section_id`, `ordinal`) — the extractor is re-runnable, so
improving the parser and re-running is the intended way to apply it. Indexed on
`effective_date` (the "what changed between two dates" question) and on
(`amending_act_year`, `amending_act_number`) — the citator question for statutes.

**18,590 events extracted, 15,388 with a real effective date, 1,208 distinct
dates spanning 1870–2026.** Everything below is a rule, not a preference:

- **`effective_date` is NULL where the source states none** — 3,202 rows. It is
  never the amending Act's year instead: those are different facts, and
  conflating them dates a legal event by guess.
- **`ibid_unresolved` is a state, not a failure to be tidied.** 1,994 rows.
  `Subs. by s. 8, ibid.` means the Act named in the _preceding_ entry;
  resolution walks backwards within the same footnote only. Reaching forward to
  an Act named later would be a confident wrong attribution, and a visible gap
  beats an invisible error.
- **`amending_act_raw` keeps state prefixes verbatim** (`Delhi Act 12 of 2011`,
  `W.B. Act 18 of 1990`) and is **never resolved to a jurisdiction**. A Central
  Act amended in one state does not read the same in another.
- **This is NOT a version history of the text.** indiacode publishes only the
  current wording. `substituted_text` is the fragment a note happens to quote
  and is **never assembled into a reconstructed provision** — a partial
  reconstruction served as the law as it stood is the statutory equivalent of a
  fabricated citation.

## statute_amendment_unparsed

**Added migration `0041`.** `id` uuid pk · `statute_section_id` uuid
fk→statute_sections cascade · `verbatim` text · `created_at` timestamptz

596 footnote entries the extractor could not read, kept so that _"how much did
we fail to read"_ is a query rather than a silence — `CITATION_HARNESS.md`'s
silent-drop rule, applied to statutes. They are overwhelmingly genuine
non-events (_"See now the Arbitration Act, 1940"_), which must **not** be parsed
as amendments because doing so would invent legal history.

Rebuilt on each extraction pass rather than upserted: it records the state of
THIS parser, and a stale "could not read" row after the parser improved would
overstate the gap. That is how it fell from 960 to 596.

## statute_mappings

`id` uuid pk · `old_act` enum (ipc|crpc|evidence) · `old_section` text ·
`new_act` enum (bns|bnss|bsa) · `new_section` text · `relationship` enum
(exact|split|merged|no_equivalent) · `note` text null

Seeded from indiacode.nic.in. Never model-generated. See `DOMAIN_TRUTH.md`.

## workspaces

**Added migration `0097`, 30 Aug 2026.** The owning container for a firm's work.
NEW3 froze this model in `docs/product/NEW3_V1_PRODUCT_DEFINITION_R12.md` §8.

`id` uuid pk · `owner_user_id` uuid fk→users cascade ·
`kind` text check (personal|firm) default `personal` ·
`display_name` text null · `created_at` timestamptz

Unique partial: one row per `owner_user_id` where `kind = 'personal'`. A user
with two personal workspaces has their matters split across two containers with
nothing reporting it, so it is made unrepresentable rather than checked.

**In v1 exactly one exists per account and it is invisible in the UI.** There is
no enterprise surface, no invite flow and no role picker. `kind` exists so that a
firm workspace is a new VALUE rather than a new table.

Created automatically by the `users_personal_workspace` trigger (migration
`0098`), not by the signup handler — two code paths insert into `users` today and
a third could be added tomorrow.

## workspace_members

**Added migration `0097`.** The seam, present from day one so that adding a
second member later is a ROW rather than a migration of every ownership check in
the product.

`workspace_id` uuid fk→workspaces cascade · `user_id` uuid fk→users cascade ·
`role` text check (owner|member) default `owner` · `added_at` timestamptz ·
pk (`workspace_id`, `user_id`)

Index: btree on (`user_id`).

**v1 never creates a second member.** Every row is the personal workspace's own
owner.

## monitoring_entitlements

**Added migration `0097`. Frozen, and zero rows are written by v1.**

`id` uuid pk · `workspace_id` uuid fk→workspaces cascade ·
`matter_id` uuid null fk→matters cascade · `policy` text null ·
`state` text check (never_attempted|active|suspended|degraded) default
`never_attempted` · `created_at` timestamptz · unique (`workspace_id`,
`matter_id`)

It exists now so that when monitoring becomes real the entitlement is a row
against a workspace rather than a column bolted onto a matter, and so the shape
is fixed while nothing depends on it. `USER_MONITORING_PRODUCT` is
`DISABLED_NOT_READY`; `state` defaults to the same `never_attempted` vocabulary
the frozen wire contract already publishes for `lastObservationOutcome`.

## matters

`id` uuid pk · `user_id` uuid fk→users · `workspace_id` uuid fk→workspaces ·
`case_title` text · `cnr_number` text null ·
`court` text · `case_type` enum (criminal|civil) · `parties` jsonb ·
`client_name` text · `our_side` enum
(petitioner|respondent|accused|complainant|other) ·
`next_hearing_date` date null · `status` enum (active|disposed|archived) ·
`source` enum (manual|vendor) · `created_at` timestamptz

Index: btree on (user_id, next_hearing_date) — the nightly sweep reads this.
Index: btree on (workspace_id), migration `0097`.

### Two ownership columns that cannot disagree

`(workspace_id, user_id)` is a **composite foreign key into
`workspace_members (workspace_id, user_id)`**, added by migration `0097`. A
matter's user is therefore a member of that matter's workspace by database
constraint, not by convention.

That is what makes two columns safe. Ownership has exactly one answer — the
workspace's members — and `user_id` degrades to *which member created it*.
Pointing a matter at another tenant's workspace raises `23503`, asserted in
`services/api/src/matters/workspace-isolation.test.ts`.

The twelve ownership checks in `services/api/src` still read `user_id` and are
correct while every workspace has one member. They move onto membership when the
first two-partner firm signs up, and the constraint above is what guarantees the
move cannot change who owns what.

**`workspace_id` is filled by the database**, by the `matters_default_workspace`
BEFORE INSERT trigger (migration `0099`), from the user's personal workspace when
it is null. No caller supplies it — not `matters/route.ts`, not the admin CLI,
not the fixtures — and **RCC's frozen contract does not gain a field**. An
explicit value always wins, so the day a firm workspace is real this is a default
and not a policy.

## matter_shares

**PD-3 — sharing is per matter, by invitation.** The owner invites a named person
to a specific case, the way a file is handed over. There is **no chamber-wide
switch**: Indian chambers work case-by-case, and chamber-wide default sharing is a
conflicts hazard — two advocates in one chamber can be on opposing sides of
related matters.

`id` uuid pk · `matter_id` uuid fk→matters cascade ·
`invited_user_id` uuid null fk→users — null until the invitee has an account ·
`invited_identifier` text — enrolment number or phone, as typed ·
`granted_by_user_id` uuid fk→users · `granted_at` timestamptz ·
`revoked_at` timestamptz null · `revoked_by_user_id` uuid null fk→users

Unique partial: one live row per (`matter_id`, `invited_identifier`) where
`revoked_at is null`. Index: btree on (`invited_user_id`, `revoked_at`).

Revocation is a timestamp, never a delete — who had sight of a matter and when is
exactly the question a conflicts challenge asks later. A share grants the **court
record** and shared notes only; private notes never travel (PD-4).

## matter_authorities

**Added migration `0032`, 11 Aug 2026.** Authorities saved to a matter —
`matters/route.ts`'s own header comment already described this feature
(_"`set_aside` disables add-to-matter... it NAMES the judgment that displaced
it"_) with nothing behind it: no table, no route, and the client's
"Add to a matter" button had never had an `onPress`. Found by RCC reading the
code rather than the docs.

`id` uuid pk · `matter_id` uuid fk→matters cascade · `judgment_id` uuid
fk→judgments · `added_by_user_id` uuid fk→users · `citation_check_id` uuid
null fk→citation_checks — the verification record this authority was added
from, where the calling surface had one; null where it did not, never
invented · `added_at` timestamptz · `removed_at` timestamptz null ·
`removed_by_user_id` uuid null fk→users

Unique partial: one live row per (`matter_id`, `judgment_id`) where
`removed_at is null` — re-adding an already-saved judgment is idempotent, not
an error, and re-adding one previously removed is allowed (same reasoning as
`matter_shares`: advocates are brought back onto authorities). Index: btree
on `judgment_id`.

**Writes are owner-only**, matching `matters/route.ts`'s existing convention
for `createMatterEvent` (`WHERE matter_id = ... AND user_id = ...`, not the
shared-access check `accessToMatter` uses for reads) — a sharee can read a
matter's saved authorities but not add to them.

**Does not back `saved_authority_moved` (PD-5).** That alert's audience is
derived from `citation_checks` joined through `searches`/`documents`,
independent of this table — measured by reading `citations/fanout.ts`, not
assumed. This table is a separate, real product surface: the matter
workspace's per-case accumulated work (`PRODUCT_BRIEF.md` §4).

**`set_aside` refuses the write, and names the replacement.** The one case
Lawmind refuses to let an authority be used at all — enforced server-side so
it cannot be styled away, per the header comment above that predated the
implementation.

## matter_events

`id` uuid pk · `matter_id` uuid fk→matters cascade · `event_date` date ·
`event_type` enum (hearing|order|filing|note) · `order_text` text null ·
`notes` text null ·
`note_visibility` enum (private|shared) **default private** ·
`source` enum (manual|vendor|ocr) · `created_at` timestamptz

**PD-4 — notes are private by default, shareable per note, reversibly.** The court
record is shared; what the advocate thinks about it is theirs until they say
otherwise. A note about fees or a client's circumstances must never travel with a
file by accident. The default is `private` at the column level, not in application
code — a note that defaults to shared through a missed branch is the failure this
prevents. `order_text` is the court record and is always visible to a share;
`notes` obey `note_visibility`.

## briefings

`id` uuid pk · `matter_id` uuid fk→matters cascade · `hearing_date` date ·
`generated_at` timestamptz · `content` jsonb · `delivered_at` timestamptz null ·
`opened_at` timestamptz null · `dates_confirmed_at` timestamptz null ·
`dates_not_confirmed_at` timestamptz null · `dates_not_confirmed_reason` text null ·
`hearing_date_source` enum (advocate|cause_list) null

Unique: (matter_id, hearing_date). The sweep is idempotent — re-running must not
duplicate.

**Date confirmation — added 7 Aug 2026, migration 0013.** `cause_list_syncs`
names `dates_not_confirmed` as its escalation target and no column carried it.
**Three states, deliberately not a boolean:** both timestamps null = _nobody has
checked_; `dates_confirmed_at` set = confirmed against a successful sync;
`dates_not_confirmed_at` set = we tried and could not, and
`dates_not_confirmed_reason` says how. A bool cannot say "we never looked", and
that is a different thing to tell an advocate than "we looked and failed". The two
timestamps are mutually exclusive by check constraint, and the reason is present
exactly when the failure is.

`hearing_date_source` records where the date came from. **A date the advocate
typed is a first-class source (PD-12), not a fallback** — next dates are given
orally in open court, and a date is not more trustworthy for having been scraped.
The briefing assembly reads the same either way, which is what lets A4 ship
whether or not the eCourts path is available.

## documents

`id` uuid pk · `user_id` uuid fk→users · `matter_id` uuid null fk→matters ·
`document_type` enum (bail|anticipatory_bail|plaint|written_statement|
legal_notice|notice_reply|affidavit|vakalatnama|writ_petition|rti) ·
`input_params` jsonb · `generated_content` text · `language` enum (en|hi) ·
`storage_key` text null · `created_at` timestamptz

**PD-8 superseded 1 Aug 2026 — the AI-assisted mark is gone.**
`watermark_removed`, `watermark_removed_at` and `watermark_removed_by` are
**retired and must not be created**. Consent is taken once at onboarding and lives
on `users` (`terms_accepted_at`, `terms_version`).

The exported document carries no watermark and no hatched margin. A single line
sits in the **export metadata**; the citation summary — "4 of 4 citations
verified" — is rendered in the **draft footer in-app only** and is derived at read
time from `citation_checks`, not stored here.

## searches

`id` uuid pk · `user_id` uuid fk→users · `matter_id` uuid null fk→matters ·
`query_text` text · `query_language` enum (en|hi) · `results_returned` int ·
`model_used` text · `created_at` timestamptz

## llm_calls

`id` uuid pk · `user_id` uuid null fk→users · `feature` enum
(search|draft|briefing|extract|ocr_postprocess) · `model` text ·
`input_tokens` int · `output_tokens` int · `cost_usd` numeric(10,6) ·
`latency_ms` int · `data_class` enum (public|sensitive) · `pseudonymised` bool ·
`created_at` timestamptz

Every call writes a row. No exceptions. Cost control and DPDP audit trail.

## citation_checks

`id` uuid pk · `search_id` uuid null fk→searches · `document_id` uuid null fk→documents ·
`citation_claimed` text · `judgment_id_matched` uuid null fk→judgments ·
`verification_state` enum (verified|unverified|failed) ·
`verified_by_source` enum (corpus|indiankanoon|aws_s3|public_x2|ecourts|ecourts_bulk|licensed|none) ·
`match_confidence` numeric(4,3) null — fuzzy title similarity where used ·
`shown_to_user` bool — was it rendered, and in what state ·
`overruled_status_shown` text null — the status the server sent for this render ·
`surface` enum (search|judgment_detail|briefing|draft|matter) null ·
`created_at` timestamptz

`shown_to_user` measures silent-drop rate. A stripped citation with no unverified
state shown is a harness failure.

`overruled_status_shown` measures the **stale-overruled rate**. One row already
exists per citation per surface, so stamping the status the server sent adds two
columns and **no new write volume** — see `CITATION_HARNESS.md` §How
stale-overruled is measured.

### The badge is derived, not stored

The five visual badge states are **computed from three fields answering three
different questions**, never persisted as one enum:

| Field                | Lives on                                | Question it answers        |
| -------------------- | --------------------------------------- | -------------------------- |
| `verification_state` | `citation_checks`, `verification_cache` | Does this authority exist? |
| `verified_by_source` | `citation_checks`, `verification_cache` | Who confirmed it?          |
| `overruled_status`   | `judgments`                             | Is it still good law?      |

| Badge             | Condition                                                    |
| ----------------- | ------------------------------------------------------------ |
| `VERIFIED`        | `verification_state = verified` · source `corpus`            |
| `VERIFIED ×2`     | `verification_state = verified` · source `public_x2`         |
| `VERIFIED BY YOU` | `verification_state = verified` · source `ecourts`           |
| `NOT CONFIRMED`   | `verification_state` in (`unverified`, `failed`)             |
| `LAW MOVED`       | `overruled_status != none` — **independent of verification** |

A judgment can be verified **and** overruled; those are different questions
answered by different sources, so folding them into one enum was wrong.
`public_x2` is the value tier 2 writes when IndianKanoon and the AWS S3 datasets
**agree** — the per-source values remain for partial and diagnostic records where
only one matched.

#### The seven column values, and the five on the wire

The column carries more values than the API emits, and the gap is deliberate.

| Value          | Meaning                                         | Strength | On the wire    |
| -------------- | ----------------------------------------------- | -------- | -------------- |
| `ecourts`      | a named human solved the CAPTCHA and vouched    | 4        | `ecourts`      |
| `public_x2`    | two INDEPENDENT public sources agreed           | 3        | `public_x2`    |
| `ecourts_bulk` | the registry answered us directly, under grant  | 3        | `ecourts_bulk` |
| `licensed`     | a commercial publisher's editorial view, bought | 2        | `licensed`     |
| `corpus`       | we hold the judgment ourselves                  | 1        | `corpus`       |
| `indiankanoon` | one public source matched, the other did not    | 0        | `none`         |
| `aws_s3`       | one public source matched, the other did not    | 0        | `none`         |
| `none`         | nobody confirmed it                             | 0        | `none`         |

`ecourts_bulk` was added 8 Aug 2026 (migration `0022`) when the registrar's
grant made bulk automated resolution lawful. It is **not** `ecourts`: that value
means a human vouched, which is why it caches permanently and why the harness
falls back to it. Bulk resolution writing the same value would degrade the
product's strongest assertion to "a machine said so" while still spelling it
`ecourts` in the database, with no test failing.

It sits **below** `public_x2` because independence is what catches a systematic
error at the source, and **above** `corpus` because the registry is the
registry.

**A row may climb this table and never fall.** A bulk pass must never overwrite
an `ecourts` row; an advocate confirming a bulk-resolved citation upgrades it.
Enforced in `services/api/src/citations/source-strength.ts`, tested beside it.

The two diagnostic values collapse to `none` at the boundary because that is
what they honestly mean to a reader: one source matching is not a confirmation
under the step-5 rule, and such a row's `verification_state` is `unverified`
anyway.

## harvest_fetches

Added S2, 8 Aug 2026, migration `0023`. **The raw archive and the fetch ledger,
in one table.**

`id` uuid pk · `source` text — `supreme_today` | `indian_kanoon`, text not enum
because sources are commercial relationships that come and go and nothing
branches on the value · `url` text · `method` text default `GET` ·
`requested_at` timestamptz · `http_status` int null · `duration_ms` int null ·
`outcome` text (`ok`|`refused`|`error`), check-constrained · `refusal_reason`
text null · `cost_paise` int null — for metered sources; **null, never zero,
where the source is not per-request priced, because zero would be a lie about a
free call** · `body` text null · `body_sha256` text null · `bytes` int null ·
`account_label` text null — an operator's nickname, **never a credential** ·
`work_item_key` text null

Index: (`source`, `requested_at` desc) · partial on (`source`, `work_item_key`)
· partial on `body_sha256`.

**Why one table and not two.** `docs/HARVEST_ENGINE.md` §1: archive the raw
response first, parse afterwards, because the licence is perpetual on what we
INGEST rather than on what we understood at the time. Every ledger row for a
successful fetch has a body, and every archived body has a request behind it —
two tables would be a join that is always one-to-one and a chance for them to
disagree.

Constraints, each closing a way the ledger could lie: a refusal must carry a
reason · a refusal never reached the network, so it can have no status and no
body · a body must carry its hash, or it cannot be de-duplicated or verified
later.

`ok` · `refused` · `error` are three different facts. **Collapsing them is how a
refusal comes to read as an outage**, which is the same reason
`cause_list_status` separates `empty` from `failed`.

## harvest_queue

Added S2, 8 Aug 2026, migration `0023`. Resumable, de-duplicated work list.

`id` uuid pk · `source` text · `item_key` text — **OUR identifier, a judgment
id, not theirs** · `citation` text null · `priority` int default 100, lower runs
first · `state` text (`pending`|`in_flight`|`done`|`failed`|`skipped`),
check-constrained · `attempts` int default 0 · `last_error` text null ·
`claimed_at` timestamptz null · `completed_at` timestamptz null · `created_at`
timestamptz

**Unique: (`source`, `item_key`) — this is the whole guarantee.** A crash
mid-run, a restarted process, or two operators starting the same job cannot
produce a second fetch of the same page. **A duplicate is money spent on
nothing.**

Index: partial on (`source`, `priority`, `created_at`) where pending — the claim
query · partial on `claimed_at` where in_flight, so a crashed worker's items can
be found by age and returned.

`item_key` is ours rather than theirs because `HARVEST_ENGINE.md` §11 makes our
own corpus the index into a licensed source: the worklist is bounded by our
corpus, and every row is a judgment we already care about. A crawler that
discovers its own worklist can run away with the budget; this cannot.

Constraints: a failure must carry a reason — **an item that failed silently is
one nobody will ever look at again** — and a `done` item must carry its
completion time.

## verification_cache

Permanent. A case confirmed once is never re-verified.

`id` uuid pk · `citation_text` text · `normalised_citation` text ·
`judgment_id` uuid null fk→judgments ·
`verification_state` enum (verified|unverified|failed) ·
`verified_by_source` enum (as above) · `match_confidence` numeric(4,3) null ·
`confirmed_by_user_id` uuid null fk→users — set for eCourts human confirmation ·
`raw_response` jsonb · `created_at` timestamptz

Unique on `normalised_citation`. Index on `judgment_id`.
Overruledness is **never cached here** — it lives on `judgments` and changes when
a later judgment moves the law, so a permanent cache would go stale silently.

## ocr_jobs

`id` uuid pk · `user_id` uuid fk→users · `matter_id` uuid null fk→matters ·
`source_type` enum (pdf_scanned|image|camera) · `storage_key` text ·
`engine` enum (paddleocr|tesseract) · `detected_script` text[] ·
`status` enum (queued|processing|complete|failed|needs_review) ·
`extracted_text` text null · `extracted_fields` jsonb null ·
`confidence_overall` numeric(4,3) null · `low_confidence_blocks` jsonb null ·
`confirmed_by_user` bool default false · `error` text null ·
`created_at` timestamptz · `completed_at` timestamptz null

`confirmed_by_user` gates use. OCR output is never trusted silently.

## pii_entities

Pseudonymisation map. **Local scope. Never leaves our infrastructure.**

`id` uuid pk · `document_id` uuid null fk→documents ·
`ocr_job_id` uuid null fk→ocr_jobs · `matter_id` uuid null fk→matters ·
`entity_type` enum (person|address|phone|pan|aadhaar|bank_account|vehicle|minor|other) ·
`original_value` text — encrypted at rest with `PII_ENCRYPTION_KEY` ·
`token` text — e.g. `[ACCUSED_1]` · `created_at` timestamptz

Deleting a matter deletes these rows. Cascade is mandatory.

## audit_log

**Append-only.** Every privileged admin action writes exactly one row. No UPDATE,
no DELETE — enforce with a revoked grant and a `BEFORE UPDATE OR DELETE` trigger
that raises. Kill switches without an audit trail is a governance failure.

`id` uuid pk · `actor_user_id` uuid fk→users · `actor_role` text ·
`action` text — dotted verb, e.g. `platform.kill_switch.toggle`,
`enrolment.approve`, `dispute.uphold`, `template.override_gate` ·
`target_type` text · `target_id` text null ·
`before` jsonb null · `after` jsonb null · `reason` text null ·
`ip` inet null · `created_at` timestamptz default now()

Index: btree on (created_at desc); btree on (actor_user_id, created_at desc);
btree on (target_type, target_id).

`before`/`after` are the changed fields only, not whole rows. A founder override
of a template gate (`template.override_gate`) is mandatory-reason.

## official_source_fetch_ledger / official_source_artifact

Added by migration `0090`. Both tables are append-only, enforced by database
triggers. `official_source_fetch_ledger` records every official-source network
decision, including refusals and errors: source · endpoint · requested_at ·
outcome · HTTP/duration fields · refusal_reason · authorization_basis ·
conditions_version.

`official_source_artifact` stores the observation separately from any canonical
judgment: source · artifact_role · observation_state · observed/source-asserted
times · URL/document key · content type · SHA-256/byte count · bounded raw bytes
or a storage key · source metadata · extraction note · authorization basis and
conditions version · optional fetch-ledger and judgment links.

Roles distinguish `judgment_index`, `judgment_pdf`, order material, editorial
summaries, cause lists and case status. Only a verified `judgment_pdf` may feed a
canonical judgment. A repeated response remains another observation; evidence is
never updated or deleted to match later derived state.

## judgment_statute_refs resolution state

Migration `0091` adds nullable `resolution_state` · `resolution_reason` ·
`resolved_at` to the existing statute-reference link. `NULL` means a legacy or
not-yet-classified decision, never a confirmed link. Allowed states are
`linked_exact`, `linked_chronology_permitted`, `unresolved_predecessor`,
`refused_pre_enactment`, `unresolved_pre_commencement`,
`unresolved_date_unsafe`, `unresolved_section_absent`, and
`unresolved_ambiguous`.

The state is evidence about identity resolution. Chronology-permitted does not
claim that the statute governed the dispute, and an unresolved state keeps the
raw `act_named`, section, occurrences and offset while `statute_id` remains
NULL. Enactment and commencement are separate official dates; neither is
substituted for the other when one is absent.

## judgments row provenance — source, edition, authorization basis

Migration `0092` adds four nullable columns to `judgments`: `source_id` ·
`source_edition` · `authorization_basis` · `provenance_recorded_at`. Additive,
backfill-free, and every row is NULL on the day it lands.

**`source_url` is not this.** It is NOT NULL and it is the uniqueness and
resumability key (see "Unique: `source_url`" above); it was never a licence key.
Audited 28 Aug 2026: of the 38 columns on `judgments`, none named a source, an
edition or an authorization basis. The only provenance available was inferred
from a URL prefix, and a hash-ordered sample of 20,000 rows resolved to exactly
two hosts — both AWS Open Data. That inference holds only while one licence
family covers the whole corpus, and stops identifying anything the moment two
grants serve from one host.

`source_edition` is the axis nothing could express: `court_raw` ·
`reporter_edited` · `mixed_unseparated`. There is no copyright in a judgment
(Copyright Act s. 52(1)(q)(iv)); a law reporter's copy-edited version IS
protected (_EBC v. D.B. Modak_), so "whose edition is this text" decides whether
a row is safe to hold. `text_extraction_method` records HOW text was extracted,
never WHOSE edition it is, and the two have been confused before.

`authorization_basis` uses the SAME value set as
`official_source_artifact.authorization_basis` (`0090`), extended by
`founder_declared_grant` for the CLAUDE.md §6a source agreements. One vocabulary
across both tables, deliberately: two spellings of one fact is how a licence
boundary becomes unqueryable.

`source_id` carries `supreme_ai` and `supreme_today` as SEPARATE values. CLAUDE.md
§6a's naming rule says they are different sources; bus 0094 asserted they are the
same. That identity is not settled, so a row records the name it actually came
from and recording one asserts nothing about the other.

**NULL means UNRECORDED. It never means safe.** A consumer that wants "safe to
hold" tests for the VALUE, never for the absence of a refusal — this corpus has
already measured what an absent-evidence pass costs.

The three CHECK constraints are `NOT VALID` and the three partial indexes are
deliberately NOT created. Both are stated in full in the migration: validating or
indexing would scan 2,822,704 pages under a lock, to confirm a fact the DDL
already guarantees about columns that are entirely NULL. The exact
`VALIDATE CONSTRAINT` and `CREATE INDEX CONCURRENTLY` statements are recorded
there for the moment real values exist.

The precondition this satisfies: the SCR counsel outcome, and any future licensed
ingest, are remediable **by WHERE clause and not by re-ingest**.

## official source artifact text state

Migration `0095` adds nullable `official_source_artifact.text_state` with exactly
two positive values: `TEXT_AVAILABLE` and `IMAGE_ONLY_OCR_PENDING`. `NULL` means
not classified, never text available.

The source artifact is held only when 0090's `raw_bytes` or `storage_key` is
present. An artifact in `IMAGE_ONLY_OCR_PENDING` may count toward source-data
holdings, but supplies no full-text, paragraph, lexical, semantic or generation
evidence. It is not inserted into `judgments` with fabricated empty text. No OCR
worker or queue is implied by this state.

## platform_config

Maintenance mode, the five kill switches, and feature flags. One row per key —
current state only; history lives in `audit_log`, which is the point.

`key` text pk · `kind` enum (maintenance|kill_switch|flag) ·
`enabled` bool default false · `rollout_percent` int null — flags only, 0–100 ·
`message` text null — maintenance only · `reason` text null ·
`updated_by_user_id` uuid null fk→users · `updated_at` timestamptz

Kill-switch keys are a **fixed set**: `search` · `drafting` · `briefings` ·
`ocr_intake` · `signups` · **`ecourts_harvest`** _(added 7 Aug 2026)_. An unknown
key is rejected, never implicitly created — a typo must not silently produce a
switch nobody is watching. The set is enforced by a check constraint, so adding a
seventh is a migration.

`ecourts_harvest` governs whether any code path may contact eCourts at all. It is
created **off**, and off is not the only lock: the guard also requires the grant's
conditions to be transcribed into
`services/api/src/court/authorisation.ts`. **On plus terms-absent still refuses.**
`CLAUDE.md`: _if the authorisation's terms are not in the repo, the switch stays
off._

**Built in migration 0013, ahead of S6.** The write endpoint
(`POST /admin/platform/kill-switches/:key`) is **not** built and stays SPECCED, so
until S6 this row moves only by a hand-written statement — which is therefore
**not** captured in `audit_log`, because the transaction that would write it does
not exist yet. Recorded as a known gap rather than assumed away.

`reason` is **NOT NULL for `kind = 'kill_switch'`**, enforced by a check
constraint. Every write here writes `audit_log` in the same transaction; if the
ledger write fails the config does not move.

## cause_list_syncs

Per-court scrape health. A parser that silently returns an empty list is worse
than an outage, because briefings still go out with stale dates.

`id` uuid pk · `court` text · `list_date` date · `started_at` timestamptz ·
`completed_at` timestamptz null · `item_count` int ·
`status` enum (ok|empty|stale|failed) · `retry_count` int default 0 ·
`escalated_at` timestamptz null · `error` text null

Unique: (court, list_date). Index: btree on (list_date desc, status).

Escalation is fixed: retry once → mark affected briefings
`dates_not_confirmed` → notify affected advocates directly. An unconfirmed
listing is **never** presented as confirmed — the same rule as citations.

**Built 7 Aug 2026, migration 0013.** Three check constraints keep the statuses
honest rather than trusting the writer: `ok` must have `item_count > 0`, `empty`
must have `item_count = 0`, `failed` must carry an `error`. **A court genuinely
publishes nothing some days, and that is not a parser failure** — collapsing the
two is the same error class as confusing `miss` with `not_attempted`.

## ecourts_fetch_ledger

**Added 7 Aug 2026.** Every request made under the registrar's authorisation, and
every one **refused**.

`id` uuid pk · `requested_at` timestamptz · `court` text null · `endpoint` text ·
`outcome` enum (ok|refused|error) · `http_status` int null ·
`duration_ms` int null · `authorisation_reference` text null ·
`refusal_reason` text null · `cause_list_sync_id` uuid null fk→cause_list_syncs

Index: btree on (requested_at desc); btree on (court, requested_at desc).

Permission arrives with conditions — volume, frequency, hours, attribution — and
this is what makes _"did we stay inside the grant"_ answerable **by query rather
than by promise.** Refusals are rows too, because the ledger's other job is to
show that the switch and the limiter actually held.

`authorisation_reference` records **which transcription of the grant was in
force**. If the registrar amends the conditions, requests made before and after
must be distinguishable, or adherence can only be argued.

Constraints: `refusal_reason` is present exactly when `outcome = 'refused'`; a
refused row must carry **no** `http_status` and **no** `duration_ms`, because it
never left the process. **The rate limiter counts only rows that reached the
network** — a refusal must not consume the quota it just protected.

## ecourts_observation · ecourts_transition

**Migration `0061`, 20 Aug 2026.** The live-judicial-state foundation. NEW2 held
live traffic until these existed (bus 0839) and was right to: a harvest whose
rows have nowhere correct to land is the one mistake that cannot be cleaned up
afterwards, and the grant runs only to January 2029.

### ecourts_observation — what a source published, as it published it

`id` uuid pk · `observation_kind` text · `source` text default 'ecourts' ·
`observed_at` timestamptz · `source_asserted_at` timestamptz null ·
`court` text · `court_code` text null · `cnr` text null ·
`case_number` text null · `case_year` int null · `case_type` text null ·
`listing_date` date null · `next_listing_date` date null ·
`disposal_date` date null · `case_status` text null · `bench` text null ·
`court_number` text null · `item_number` int null · `order_ref` text null ·
`payload` jsonb · `payload_sha256` text · `endpoint` text ·
`grant_data_type` text · `conditions_version` text ·
`fetch_ledger_id` uuid fk→ecourts_fetch_ledger · `extraction_state` text
default 'parsed' · `extraction_note` text null

Indexes: (cnr, coalesce(source_asserted_at, observed_at) desc) where cnr not
null; (court, case_number, coalesce(...) desc) where case_number not null;
(observed_at desc); (payload_sha256); (court, listing_date) where listing_date
not null.

**Three properties are load-bearing and all three are enforced, not documented.**

**1. It is not `judgments` and has no foreign key to it — not even a nullable
one.** A cause-list entry, a next-hearing date and a status transition are
registry bookkeeping; `judgments` is the population the retrieval lane treats as
**authority**. A nullable link is an invitation to backfill one, and once
embeddings and citation edges are built over registry rows there is no undo.

**2. Append-only, by trigger.** UPDATE and DELETE both raise
`restrict_violation`. If the court said 11 March on Monday and 22 April on
Wednesday, **both are true statements about what the court published** and only
the second is the current listing. An UPDATE destroys the first, and with it the
answer to _"what did we tell the advocate before this moved"_. The trigger
raises rather than silently discarding the write — a `DO INSTEAD NOTHING` rule
would make the attempt look like success. Verified by execution 20 Aug 2026:
UPDATE refused, DELETE refused, probe row rolled back, table left at 0.

**3. A listing is not a hearing.** `observation_kind` is CHECK-constrained to
nine values and **`hearing_occurred` is not among them, deliberately** — eCourts
publishes listings, never attendance. A hearing having happened is only ever
evidenced by a *later* artefact (an order appearing, a status change, a next-date
move), and the projection must reason from those. The CHECK makes minting the
fact impossible rather than detectable afterwards; an insert of
`'hearing_occurred'` was run and refused.

Kinds: `cause_list_entry` · `case_status` · `case_history_entry` ·
`order_listed` · `next_date` · `bench_composition` · `disposal` · `caveat` ·
`court_directory`.

`observed_at` (when **we** fetched) and `source_asserted_at` (the date the
**source** puts on the fact) are separate columns, so out-of-order and late
observations need no special handling in the writer — a Wednesday fetch that
returns Monday's page does not move live state forward. The projection orders by
`coalesce(source_asserted_at, observed_at)` and the indexes carry that same
expression so the two cannot drift.

**Provenance is four NOT NULL columns** — `endpoint`, `grant_data_type`,
`conditions_version`, `fetch_ledger_id`. A row we cannot place inside the grant
is a row whose adherence we could not later demonstrate, and a registrar asking
is exactly the scenario the ledger exists for. `grant_data_type` is
CHECK-constrained to `GRANT_CONDITIONS.permittedDataTypes` in
`services/api/src/court/authorisation.ts`; an insert of an ungranted type was run
and refused. `conditions_version` is `CONDITIONS_VERSION`, the fingerprint of the
limits actually enforced — it answers _"which transcription was in force"_ across
a renewal that narrows the terms, which the letter's own reference could not.

**A duplicate observation is still written.** There is deliberately no unique
constraint on `payload_sha256`: the court saying the same thing again on a later
date is a different fact from us not having asked. The index exists so duplicate
rate per request stays measurable, which is NEW2's request-allocation metric.

`extraction_state` `partial`/`unreadable` rows are written and counted, never
dropped, and never promoted into a transition. Same rule as an unverified
citation: shown honestly, never silently discarded.

### ecourts_transition — the change, which is the product

`id` uuid pk · `transition_kind` text · `court` text · `cnr` text null ·
`case_number` text null · `from_value` text null · `to_value` text null ·
`from_observation_id` uuid null fk→ecourts_observation ·
`to_observation_id` uuid null fk→ecourts_observation ·
`evidence_pruned_at` timestamptz null · `occurred_at` timestamptz ·
`derived_at` timestamptz · `matter_id` uuid null fk→matters ·
`notified_at` timestamptz null

Indexes: (occurred_at) where notified_at is null; (cnr, occurred_at desc);
(matter_id, occurred_at desc); UNIQUE (transition_kind, from_observation_id,
to_observation_id) where both evidence ids are not null.

Kinds: `first_observation` · `next_date_moved` · `status_changed` ·
`bench_changed` · `order_appeared` · `disposed` · `listing_added` ·
`listing_removed`.

**Stored, not a view, and the redundancy is paid deliberately.** NEW2 asked
whether the diff is stored or derived. Two reasons stored wins: raw payloads
will be pruned on a retention schedule and the transitions they evidence must
outlive them — a view dies with its inputs; and notification is **at-most-once**,
so _"did we already tell the advocate this hearing moved"_ must be answerable
from a row rather than recomputed from a window that may have shifted.

Both evidence ids are kept so a stored diff can be re-checked against its source
while that source survives, and `evidence_pruned_at` records honestly when it no
longer can — a NULL id must never be read as _"never had any"_.

**`first_observation` is not a change** — it is the first time we saw an
attribute, and giving it its own kind stops a NULL `from_value` being reported to
an advocate as a move. **`listing_removed` is not a disposal** — a matter absent
from today's list may have been adjourned, transferred, or simply not listed.

The unique index makes the projection **idempotent**: re-running it over the same
evidence pair cannot write the transition twice. Partial, because rows whose
evidence was pruned can no longer be deduplicated this way and must not block it.

`matter_id` is late-binding by design and never blocking: a transition is
observed before any advocate has a matter for it, and the matter may be created
weeks later.

## corpus_coverage

**Migration `0012`. Documented 11 Aug 2026 — it had been missing from this file
since it was created**, which is the rule at the top of this document being
broken by the commit that added it. Recorded now rather than quietly.

`source` text pk · `source_total` int null · `enumerated_at` timestamptz null ·
`complete` boolean default false · `failed_ids` text[] default `{}` ·
`updated_at` timestamptz

**One row per SOURCE**, holding enumeration state for that source as a whole —
today `indiacode_central_acts`, 845 acts. It answers _"has this source been fully
enumerated"_.

`source_total` is **null until an enumeration has run**: unknown is a state, not
zero. `complete` is true only when a full pass finished with no failures, and
**a client must not infer completeness from `held === source_total`** — an ingest
can reach the count with items that failed and were retried into place, and can
equal it transiently mid-run. `failed_ids` names them, because **an unauditable
gap is not a known gap**.

## judgment_coverage

**Added 11 Aug 2026, migration `0029`.** Coverage per court per year — what
EXISTS at the source, against what we hold.

`source` text · `court_code` text · `court_name` text · `year` int ·
`source_documents` int · `enumerated_at` timestamptz ·
`updated_at` timestamptz · **pk (source, court_code, year)**

Index: btree on (source, court_name); btree on (source, year).
Constraints: `source_documents >= 0`; `year BETWEEN 1800 AND 2200`.

**A different GRAIN from `corpus_coverage`, not a replacement.** That table is
keyed `source` and cannot express _"Allahabad, 2024"_ without encoding two
dimensions into one text key, which would make counting by court and counting by
year both unanswerable. Both tables keep their jobs.

**`source_documents` COUNTS DOCUMENTS, NOT JUDGMENTS**, and the column is named
for what it counts. `docs/HC_CORPUS_SURVEY.md` §2 measured the judgment share of
the AWS High Court bucket at a **range of 0.75%–18.64%** — the only published
label, `order_type`, carries a `View Judgement/Order` value on 17.89% of rows
that distinguishes neither. **A column named `source_judgments` would be a number
nobody measured**, and rendering "0 of 3,493,695 judgments" is exactly the
confident-wrong-figure this project keeps catching in itself. `GET
/corpus/coverage` carries `judgmentShareUnknown: true` for the same reason, and a
test asserts no field is ever named `sourceJudgments`.

**What we HOLD is deliberately not stored.** It is derived at query time from
`judgments`, exactly as `/statutes` derives `held`. A cached count drifts the
moment an ingest writes a row, and a coverage figure stale in the **reassuring**
direction is worse than none. The expensive half is the source enumeration —
1,493 parquet footers — and that is the half worth persisting.

**`enumerated_at` is when the SOURCE was counted**, not when the row was written.
A coverage claim with no date is not checkable.

Loaded by `pnpm --filter @lawmind/ingest coverage --apply`, **dry by default**.
889 rows across 25 courts, 20,529,202 documents, as of the survey generated
9 Aug 2026. Re-running is idempotent — `ON CONFLICT DO UPDATE`, observed to write
889 rows twice rather than 1,778.

## r2_operation_ledger

**Added 10 Aug 2026, migration `0028`.** Object-storage spend, **aggregated per
run per window** — not per operation.

`id` uuid pk · `run_label` text · `window_start` timestamptz ·
`window_end` timestamptz · `class_a_count` bigint · `class_b_count` bigint ·
`free_count` bigint · `bytes_written` bigint ·
`operation_cost_usd` numeric(12,6) · `ceiling_usd` numeric(12,6) ·
`refusal_reason` text null · `created_at` timestamptz

Index: btree on (window_start desc).

**Why this is aggregated where `ecourts_fetch_ledger` is per request, and it is
not an inconsistency.** The eCourts grant is _counted in requests_ — 1,000 a day
— so the question it answers is "did we stay inside the grant", and only a row
per request can answer that. **R2's constraint is spend, not permission.** Class
A is $4.50 per million against a 15.77M-judgment corpus, so a per-operation
ledger would be tens of millions of rows auditing a two-figure dollar number, and
**the ledger would itself become the per-object write pattern it exists to
catch.** A window counter is the right instrument for a budget; a per-request
ledger is the right instrument for a licence.

`operation_cost_usd` is computed by the application from the published
per-million rates and **stored rather than derived**, so a future price change
cannot silently rewrite what we believed we spent at the time. `ceiling_usd`
records the limit that was in force for the same reason.

`refusal_reason` is non-null when the budget ceiling or the halt switch stopped a
run — a ledger recording only completed work would hide exactly the events worth
reviewing. Enforcement lives in `packages/storage/src/spend.ts`, and the halt
switch reuses `platform_config` rather than inventing a second mechanism.
**No `platform_config` row is seeded**: for eCourts a missing row reads as OFF
because the danger is permission, whereas here the danger is spend, the budget
ceiling is the primary gate, and a missing row correctly reads as "not halted".

## citation_disputes

The trust feedback loop. Outranks everything else in the admin.

`id` uuid pk · `reported_by_user_id` uuid fk→users ·
`citation_check_id` uuid null fk→citation_checks ·
`judgment_id` uuid null fk→judgments · `claim` text — what the advocate says is wrong ·
`status` enum (open|upheld|rejected) default open ·
`resolved_by_user_id` uuid null fk→users · `resolved_at` timestamptz null ·
`correction` jsonb null — the field-level fix written to the corpus ·
`fanout_id` uuid null fk→citation_fanouts · `created_at` timestamptz

Index: btree on (status, created_at); btree on judgment_id.

Upholding is a **fan-out write**, not a status change — it creates a
`citation_fanouts` row. Drives the **false-verified rate**, whose target is zero:
disputes upheld where `verification_state` was `verified` ÷ total verified
citations shown.

## citation_copies

**The advocate at highest risk.** "Copy citation" is an action on every judgment
card. An advocate who copies a citation into their own Word document has taken it
out of the app entirely — they saw the badge, they may file it, and without this
record **no notification can ever reach them.** Plausibly a large share of early
users: the ones who trust the search but not yet the drafting.

`id` uuid pk · `user_id` uuid fk→users · `judgment_id` uuid fk→judgments ·
`matter_id` uuid null fk→matters ·
`citation_check_id` uuid null fk→citation_checks — the render it was copied from ·
`overruled_status_at_copy` text · `surface` enum
(search|judgment_detail|briefing|draft|matter) · `copied_at` timestamptz

Index: btree on judgment_id — the fan-out reads by judgment;
btree on (user_id, copied_at desc).

Copy works offline, so the write **queues through the outbox** with an idempotency
key like every other local-first write. A copy that never syncs is a citation we
cannot warn about — count outbox age here, do not assume delivery.

**Privacy.** This records what an advocate copied and when. It exists solely to
warn them later, it is their own activity about public judgments, and it contains
no third-party personal data. It is still tracking, so it is **disclosed in the
privacy disclosure**, not silent — `PRIVACY_PII.md`. Deleted on account deletion
and through the DPDP erasure path (`data_requests`).

## ~~overruled_rechecks~~ — cut 1 Aug 2026, no table

**The job stays; the table tracking its runs does not.** It was a job-run log with
one consumer, and everything it recorded is already available:

| It answered                  | Now answered by                                                    |
| ---------------------------- | ------------------------------------------------------------------ |
| Did the run happen, and when | The cron platform + the **22:50 alert** in `docs/FAILURE_MODES.md` |
| What changed                 | `citation_fanouts` rows where `trigger = 'recheck'`                |
| Did it fail                  | The alert, which is what anyone would act on anyway                |

**The re-check itself is unchanged and still mandatory** — `overruled_status` is
never cached (`CITATION_HARNESS.md`), so the nightly run at **22:30, before the
23:00 sweep**, is a correctness requirement, not telemetry.

Scope is every judgment referenced by an **active matter**, an **exported draft**
or a **copied citation**. It compares live `judgments.overruled_status` against
`citation_checks.overruled_status_shown`; each flip calls `applyOverruledChange`,
which writes a `citation_fanouts` row. It does **not** re-run verification tiers
1–3 — existence is permanent, only good-law status moves.

**What we gave up:** queryable run history in the admin. If an incident ever needs
"show me the last 30 runs", the answer is logs, not SQL. Accepted — the alert is
what actually gets acted on.

## citation_fanouts

**One fan-out, two triggers.** When a judgment's overruled status changes, the
required work is identical whether an admin upheld a dispute or the nightly
re-check found it. Do not build a second implementation.

`id` uuid pk · `judgment_id` uuid fk→judgments ·
`trigger` enum (dispute_upheld|recheck|admin_correction) ·
`trigger_ref` uuid null — dispute id or recheck id ·
`from_status` text · `to_status` text ·
`status` enum (pending|complete|failed) default pending ·
`saved_count` int null · `filed_count` int null · `copied_count` int null ·
`notified_count` int null ·
`idempotency_key` text · `created_at` timestamptz ·
`completed_at` timestamptz null

**Unique on `idempotency_key`** — `sha256(judgment_id || to_status || trigger ||
trigger_ref)`. This is what makes a double-uphold or an overlapping re-check
run safe: the second insert loses to the unique constraint and no advocate is
notified twice.

Index: btree on (status, created_at); btree on judgment_id.

The three writes are one transaction, and **partial completion is not
acceptable** — if the fan-out cannot be enqueued the whole operation fails, the
dispute stays open, and the re-check run is marked `failed` for retry. A
half-completed fan-out is the worst state: the corpus says overruled while the
advocate who filed it was never told.

## draft_templates

`id` uuid pk · `document_type` enum (as `documents.document_type`) ·
`version` int · `prompt` text · `language` enum (en|hi) ·
`golden_set_size` int · `score` numeric(5,2) null ·
`gate_results` jsonb null — court-format compliance · no invented citations ·
no overruled authority cited as good law · AI mark present · Hindi parity ·
`status` enum (draft|live|retired) · `published_by_user_id` uuid null fk→users ·
`override_reason` text null · `created_at` timestamptz

Unique: (document_type, language, version). Partial unique: one `live` row per
(document_type, language).

**Nothing ships below 90 without a founder override**, and the override writes
`template.override_gate` to `audit_log` with `override_reason` non-null.

## data_requests

DPDP Act obligations with a visible clock per request.

`id` uuid pk · `user_id` uuid fk→users ·
`kind` enum (export|correction|erasure) · `status` enum
(received|in_progress|completed|refused) · `due_at` timestamptz ·
`completed_at` timestamptz null · `refusal_reason` text null ·
`artefact_storage_key` text null · `created_at` timestamptz

Index: btree on (status, due_at).

Pseudonymisation coverage is **measured, not asserted** — computed from
`pii_entities` against detected-entity counts, and reported as a number
(currently 99.2%). The residual is disclosed to the advocate, never hidden.

**8 Aug 2026 — this paragraph conflicts with `PRIVACY_PII.md` and was not built
as written.** `pii_entities` stores only entities that WERE tokenised, so a
ratio of it against itself cannot measure what got missed — it is tautological,
not a real detection-recall figure. `PRIVACY_PII.md`'s ~80%, stated as an
estimate pending an evaluation that has not been run, is the honest account.
`GET /admin/privacy/coverage` was left unbuilt rather than implement the
formula above. See `docs/FOUNDER_QUEUE.md` §`GET /admin/privacy/coverage`.
See `PRIVACY_PII.md` — we never claim complete PII removal.

## auth_user · auth_session · auth_account · auth_verification

**Added 7 Aug 2026, migration 0014.** better-auth's own tables. Their columns were
read out of `getAuthTables()` in the installed library, **not written from its
documentation** — a guessed schema for somebody else's library is a migration that
applies cleanly and fails at the first login.

Prefixed `auth_` because better-auth asks for models named `user`, `session`,
`account` and `verification`, and those are generic names in a schema that already
holds `users`. The drizzle adapter maps the model names back, so the library is
unaffected and the database says where its tables came from.

**IDENTITY IS NOT PROFILE.** `auth_user` records that an email address was proven
reachable. `users` records that somebody is an advocate, with the name and phone
number `users` requires NOT NULL and a magic link cannot supply. Verification
creates the first; onboarding (`PATCH /me`) creates the second. **`users.auth_id`
is the join and has been in the schema since S0 for exactly this.** An identity
with no profile is a real state — somebody abandoned onboarding — and `GET /me`
reports `profileComplete: false` rather than returning a half-filled user.

`auth_account` is required by better-auth and unused: there is no OAuth provider
and no password in this product, which is also why there is no password to reuse,
leak or reset.

## refresh_tokens

**Added 7 Aug 2026, migration 0014.** Ours, not better-auth's. `SPRINT_5.md`
specifies JWT plus a rotating refresh on a 30-day sliding window.

`id` text pk · `user_id` text fk→auth_user cascade · `token_hash` text unique ·
`expires_at` timestamptz · `created_at` timestamptz · `revoked_at` timestamptz null ·
`replaced_by` text null

Index: partial btree on (user_id) WHERE revoked_at IS NULL.

**Stored as a SHA-256 hash, never as the token.** A readable refresh-token table
is a table whose leak is a working login for every advocate in it.

The access token is a short-lived JWT so the common path costs no database round
trip. The refresh token is opaque rather than a JWT **because it must be
revocable, and a stateless token cannot be withdrawn.**

**Rotation with reuse detection.** Each refresh mints a successor and revokes its
parent, with `replaced_by` making the family walkable. Presenting an
already-rotated token means it was replayed or the client is buggy, and both are
answered the same way: **every live token for that advocate is revoked.** Signing
in again is a small cost; an attacker renewing a stolen token indefinitely
alongside the real user is not.

## hc_ingest_ledger

Migration `0047`. **The FAILURE side of the ingest record.** `judgments.source_url`
is already the success ledger — a written document is never re-fetched — but a
document that FAILED left no trace at all, so every restart re-downloaded every
failure forever and nothing could distinguish "not yet tried" from "tried three
times". Measured cost on one scope: `hc-boot-23_23-y2024` paid **15,869**
`pdf_missing` 404s on every start against about **21** genuinely recoverable
documents (NEW2, bus 0667).

**Applied `0047`, wired 17 Aug 2026 — it held zero rows in between**, because the
migration shipped without a writer. Worth recording as a class: a migration
applied and never wired is indistinguishable from one that works. Nothing errors,
nothing is red, the table simply stays empty. `scripts/check-migration-journal.mjs`
catches "the migration never reached the database"; nothing catches "the database
never reached the code".

`permanent` is the field that decides behaviour:

| outcome family      | values                                               | promotion                                                      |
| ------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| metadata-row defect | `no_title`, `no_decision_date`, `test_fixture_bench` | **permanent on first sight** — reads identically on attempt 10 |
| fetch/parse failure | `pdf_timeout`, `pdf_missing`, `pdf_failed`           | retried to `MAX_ATTEMPTS = 3`, then permanent                  |

**`attempts` accumulates IN THE TABLE and the promotion is computed by the
DATABASE, never by a counter in the worker** —
`permanent = EXCLUDED.permanent OR hc_ingest_ledger.attempts + 1 >= 3`.

That constraint is recorded here rather than in the migration because `0047` is
applied and forward-only. Its header specifies the threshold and never said where
the count lives, which is a hole: a per-process counter satisfies the header
exactly and **resets on every restart**, reproducing the failure the table exists
to fix. NEW2 chose the durable form when wiring the writer and asked; confirmed
by LCC (bus 0670). Read side `permanentlyFailedUrls`, write side `recordFailures`,
plus `clearSucceeded` so the success and failure ledgers cannot disagree once a
document finally loads — `services/ingest/src/harvest/ingest-ledger.ts`.

Dry runs record nothing: a rehearsal that condemned documents to `permanent`
would change what a real run does.

### `permanent` IS A RETRY BUDGET, NOT A CLAIM ABOUT THE SOURCE — added 29 Aug 2026

**Never divide by this column to say what the publisher does or does not have.**
NEW2 did exactly that in the first version of the R10 parity matrix and published
`accounted_upstream 99.963%` off it.

The table above already says why, and it is easy to read past: a `pdf_failed` or
`no_text` row becomes `permanent` because **our** three attempts ran out, not
because the artifact is gone. Measured 29 Aug 2026 against the live bucket, per
court and per outcome, with a bounded GET and a **magic-byte** verdict rather
than a HEAD:

| stratum | sampled | live real PDF today |
| --- | ---: | ---: |
| `no_text`, every court, permanent and open | **410** | **410** |
| `pdf_absent`, Madhya Pradesh / Allahabad / Rajasthan | 360 | 0 |
| `pdf_absent`, Bombay | 120 | 1 |

Every `no_text` row marked permanent is a live PDF. `n2-no-text-diagnose.mts`
then opened 185 of them with the same `unpdf` the loader uses: **185 of 185
IMAGE_ONLY** — 316 KB to 1.6 MB of scan with a zero-character text layer, and
zero extraction defects. Those 3,709 rows are an OCR backlog filed under the
publisher's name.

So a consumer asking *"what does the source not have"* must split by **outcome**,
never by the flag:

| class | outcomes | meaning |
| --- | --- | --- |
| SOURCE_UNAVAILABLE | `pdf_absent` (404/403/410), `no_title`, `no_decision_date`, `unparseable_date`, `no_pdf_link`, `test_fixture_bench` | the publisher's own object or metadata row is not there. **Closes accounting.** |
| RETRY_EXHAUSTED | `no_text`, `pdf_failed`, `pdf_timeout`, `pdf_unavailable`, `pdf_missing` — permanent or not | the artifact is upstream and we do not hold it. **Ours.** Never counted as accounted. |

`scripts/n2-hc-parity-matrix.mts` implements exactly that split and publishes
`method.terminal` / `method.retryExhausted` so the definition travels with the
number.

**A third thing the table cannot express, recorded rather than invented.** The
one never-attempted object in the entire High Court corpus —
`TRHC010015072016_1_2017-11-17.pdf`, Tripura, 2017-11 — serves 200 with `%PDF-1.5`
and 23,998 bytes, and `unpdf` returns `Invalid PDF structure`. The publisher
supplied a **malformed** file. That is neither SOURCE_UNAVAILABLE nor ours, and
it currently lands in `pdf_failed`. One row, so no schema change is proposed;
noted so the next person who finds a `pdf_failed` that fetches fine knows this
class exists.

## lexeme_document_frequency

Migration `0055`. **Sampled document frequency per lexeme, so the sparse arm can
ask a discriminating question instead of a long one.** Derived, safe to drop and
rebuild with `services/ingest/src/lexeme-frequency-cli.ts`, never an authority
about the law.

Exists because `sparseAny()` selected its 40 query terms by LENGTH, on a stated
assumption that the long word is nearly always the rarer one. NEW1 measured it
and it is false in this corpus (bus 0664): `court` is five characters and appears
in **90.7%** of documents, `state` 72.8%, while the terms that actually
discriminate are also five characters and were being discarded. `ts_rank` carries
no IDF, so PostgreSQL cannot know that `court` is worthless in a corpus of court
judgments — only the corpus can say, and only by being counted.

`document_count` is a count **within `sampled_documents`**, never corpus-wide,
and the denominator is stored on every row because a frequency without its
denominator is a number nobody can check. `ts_stat` over all 7.9M rows reads every
`tsvector` — the same read that makes the unfixed sparse query cost 781 seconds.

Built 18 Aug 2026: **128,243 lexemes over 40,537 sampled documents (0.5%
Bernoulli), 24 lexemes above 50%.** `BERNOULLI` not `SYSTEM`: system sampling
picks whole pages, and judgments arrive court-by-court and year-by-year, so a page
sample skews along exactly the axis a vocabulary table must not.

**An ABSENT lexeme means "not seen in the sample" and the query path MUST treat it
as RARE.** Dropping an unmeasured term costs recall, and a recall failure leaves
no trace — nothing errors, the authority simply never appears.

## document_enrichments

Migration `0045`, tasks extended by `0051` and `0054`. **Documented here 14 Aug 2026 — the
table has been in production since 11 Aug with 28,728 rows and was in neither
this file nor `schema.ts`.** Both gaps are now closed. Nothing was broken by the
omission (every writer uses raw SQL) but this file claims to be the only
authority on data shapes, and a table absent from it is how the next agent
concludes it does not exist. That is exactly the sentinel incident's shape:
_intentional state ≠ missing data_, and _undocumented ≠ absent_.

**What a model SAYS, permanently separate from what LawMind KNOWS.** The same
boundary `citation_concordance_resolutions` draws for authority identity,
applied to every other enrichment task. **No route joins this table and no
retrieval path consults it.** Promotion into `judgments`, `judgment_citations`,
`judgment_citation_aliases` or `judgment_judges` is a separate, measured,
deliberate step that writing a row here never performs.

`id` uuid pk · `judgment_id` uuid fk→judgments **cascade** · `task` text check
— see below · `prompt_version` text — in the cache key, so a prompt revision
re-runs the document rather than silently reusing an answer produced by
different instructions · `model` text · `input_hash` text — sha256 of (task |
prompt version | the exact excerpt sent); the cache key · `source_text_hash`
text — sha256 of the whole document, so a re-extracted or OCR-corrected
document invalidates its own enrichments rather than keeping answers about text
that no longer exists · `raw_output` text null — kept verbatim so improving the
verifier costs no tokens to apply (`enrich-cli --reverify`) · `parsed_output`
jsonb null · `input_tokens` / `output_tokens` int default 0 · `latency_ms` int
null · `attempts` int default 1 · `status` text check
(`ok`|`call_failed`|`unparseable`) · `error` text null · `verification_state`
text check (`verified`|`partial`|`rejected`|`unverified`) default `unverified` ·
`verified_count` / `rejected_count` int default 0 · `rejection_reasons` jsonb
null · `created_at` timestamptz

Unique: (`judgment_id`, `task`, `prompt_version`, `input_hash`) — the cache key.
Index: btree (`task`, `verification_state`); btree (`judgment_id`); btree
(`task`, `created_at` desc) added by `0051` for the staged rollout, which asks
"how did the last stage verify" constantly and would otherwise scan every row a
task has ever produced.

**`status` and `verification_state` answer different questions and must never be
conflated.** `status = 'ok'` means the call returned and parsed — a transport
fact. `verification_state` is decided by string-matching the model's claimed
evidence span against the source text, **never by the model's own confidence**.
A call can be `ok` and `rejected` at once, and that combination is the pipeline
working.

**`status = 'ok'` is load-bearing in the cache lookup.** A failed call also
writes a row carrying the same `input_hash`, deliberately, so a persistent
failure is visible rather than silent. The lookup therefore filters on
`status = 'ok'`; without that clause, 840 documents touched during the
model-alias outage would have been permanently skipped rather than retried — an
outage quietly becoming a permanent hole in the corpus.

`task` values, authoritative in the migrations rather than in `schema.ts`
(Drizzle carries no CHECK): `citation_extraction` · `metadata` · `treatment` ·
`text_quality` · `classification` · `statute_reference` · `amendment_event` ·
`evidence_span` (0045), and `case_structure` · `holding` · `arguments` ·
`authorities` · `topics` (0051, the structured legal object). `task` is text
with a CHECK and not a `pgEnum` on purpose — a new task is a normal weekly
event, and `0044` is what rewriting an enum in production costs.

**The five 0051 tasks return QUOTES, not summaries**, and that is a schema-level
fact rather than a prompt detail: each claim's value _is_ its evidence span, so
it goes through the full-strength `verifyClaims` check that a citation gets,
instead of the weakened label path used for `treatment` and `document_class`.
The model's own gloss is carried in `parsed_output[].extra.label` and is
**never verified and never promoted**. `services/ingest/src/enrich.ts`,
§THE STRUCTURED LEGAL OBJECT.

---

# ACCESS PATHS — measured with `EXPLAIN (ANALYZE, BUFFERS)`, 11 August 2026

`docs/CURRENT_PLAN.md` §Q1.6. Every path added by migrations `0026`–`0029`,
planned against the real corpus rather than reasoned about.

## judgments.script_quality · script_quality_method · script_quality_at

Migration `0056`. **A verdict about a document's TEXT, separate from
`text_quality`, because two of the three measured extraction failure modes make
`text_quality` read HIGH on a document that is half gone.**

| mode | caught by `text_quality`? |
| --- | --- |
| missing or bad text layer | yes — the score collapses |
| Poppler silently DELETING Devanagari | **no** — what survives is clean Latin, so the score is high |
| legacy Kruti Dev / non-Unicode Hindi | **no** — the bytes are valid ASCII, so every character-class metric reads clean |

A second scalar squeezed into `text_quality` would have to mean two incompatible
things, so this is a separate nullable verdict with its own provenance.

Closed vocabulary, enforced by `judgments_script_quality_check`:
`clean` · `devanagari_deleted` · `legacy_font_ascii` · `mixed_script_ok` ·
`damaged_other`. `damaged_other` exists so a detector never has to lie to record
a failure it cannot classify.

The constraint is `NOT VALID`, and that is **not** a weakening. It skips the
15M-row validation scan (which would hold ACCESS EXCLUSIVE and stall the fleet)
and it does **not** skip enforcement on INSERT/UPDATE — proved 19 Aug 2026 by an
UPDATE to `'bogus_value'` inside a rolled-back transaction, rejected by
`ExecConstraints`. Every existing row was NULL when the column was created, so
there was nothing to validate.

Text + CHECK rather than a pg enum: NEW2 owns the detectors and will add verdicts
as modes are found, and adding a value to a CHECK is a one-line migration while
altering an enum under a 15M-row table is not.

**NULL means NEVER ASSESSED and is not a failure.** `script_quality_method`
mirrors `hc_class_method` deliberately — it is the column that separates "looked
at and could not judge" from "never looked". Filter on the method, never on
`script_quality IS NOT NULL`.

`ocr_candidate` / `ocr_repaired` are WORKFLOW state and must never become values
here: a document queued for OCR and a document whose script was destroyed are the
same row to a scheduler and opposite rows to a retriever.

Index `judgments_script_quality_idx` is partial (`WHERE script_quality IS NOT
NULL`) because the assessed minority is what a selector probes. **Zero rows carry
a verdict as of 19 Aug 2026.**

---

## judgment_embedding_eligibility (VIEW)

Migrations `0056`, corrected by `0058`. **Four independent axes, never collapsed
into one flag.** A document can be safe to search but not precedent-grade;
precedent-grade but of uncertain class; canonical but textually corrupt. One
boolean cannot say any of that, and the moment it tries, the reason a document
was excluded stops being answerable.

| axis | question |
| --- | --- |
| A `axis_a_identity` | do we know WHICH decision this is |
| B `axis_b_text` | is the text we hold usable |
| C `axis_c_role` | is this a decision or a piece of court admin |
| D `value_band` | is there enough here for a vector to mean anything |

A VIEW rather than a column or a materialised table: a column would be a 15M-row
UPDATE that goes stale the moment a detector improves, a materialised table is a
second truth that drifts from its definition, and a view is a macro —
`WHERE id > $cursor ORDER BY id LIMIT 1000` pushes the keyset predicate straight
into `judgments_pkey`.

**Duplicate collapse is NOT here.** The view EXPOSES `content_hash` and the
consumer collapses, because collapsing within the view would silently emit one
representative PER WINDOW.

`is_bail_order` is broken out rather than excluded or included: bail orders are
practically useful and are not precedent, and which tier they belong in is a
retrieval measurement, not a WHERE clause.

**Every boolean is NULL-safe, and `0058` exists because one was not.**
`is_bail_order` was `(hc_document_class = 'bail_order')`, which is NULL for the
93.7% of rows with no class. Consumers wrote `AND NOT e.is_bail_order`; `NOT
NULL` is NULL, NULL is not TRUE, and the row was dropped. On a 50,000-row page of
Tier-A representatives that predicate kept **6,954**; the null-safe form kept all
50,000. There are 326,187 bail orders corpus-wide (1.8%). Fixed with
`IS NOT DISTINCT FROM`. Guard:
`services/embed/src/eligibility-null-safety.test.ts`. Note `pg_get_viewdef`
re-prints that operator as `NOT a IS DISTINCT FROM b`.

Contract version is `v1` and lives in `services/embed/src/eligibility.ts`; the
definition HASH is taken from `pg_get_viewdef` so a manifest's identity tracks
the definition that really selected its rows.

---

## embedding_content_representative

Migration `0057`. **One representative per BYTE-IDENTICAL text, for embedding
only.**

36,310 ambiguous citation keys are one decision each, covering 104,930 judgment
rows. A common final order disposing of forty writ petitions is forty rows and
one decision; embedding it forty times buys forty copies of the same point in
vector space.

**It merges no cases.** Every petition, case number, caption and party keeps its
own `judgments` row untouched. The map back is `WHERE content_hash = $1` against
`judgments_content_hash_idx`, which already existed.

**Obligation this creates:** a retrieval hit on a representative MUST fan back
out to its members before display, or a petitioner searching their own case
number finds a decision filed under somebody else's name. `member_count` is on
the row so the surface can see the fan-out is required.

`representative_judgment_id` is `min(id)` over the members — arbitrary but STABLE
and reproducible from the data alone, which matters more than being meaningful.
Built with `LEAST(...)` on conflict so it is min over the WHOLE population and not
min of whichever page saw the group first.

**Only byte-identical. Nothing fuzzy.** ~2k citation keys are genuine CONFLICTS —
different decisions colliding on one key — and roughly 8,843 ambiguous keys are
mostly OCR variance. None of that is collapsed here. Collapsing a true conflict
deletes a decision from the corpus while every count still looks healthy.

Measured 19 Aug 2026: **8,854,281 groups covering 9,700,157 Tier-A rows**,
301,531 groups with more than one member, largest 7,118 (a real Madras common
order). `docs/ai/TIER_A_CENSUS.md`.

---

## embedding_census_progress · embedding_census_cell

Migration `0057`. The checkpoint and the counts for the Tier-A census
(`services/embed/src/tier-census-cli.ts`).

**Progress is a TABLE and not a file for one reason.** `member_count` and every
cell count ACCUMULATE, so double-processing a page is not an error — it is a
plausible number, and a plausible wrong number is undetectable by any later
check. The cursor therefore lives in the SAME TRANSACTION as the aggregates it
accounts for: commit both or neither. Interrupt anywhere and the resume is
correct, because the only two states that can exist are "page fully counted and
cursor advanced" and "neither". Postgres died six times in four days on this box
(0xC000013A console signals), so this is the measured operating condition rather
than defensive programming.

`embedding_census_cell` is court × year × band × bucket, and **counts the
EXCLUDED buckets too** — "what did we throw away and why" is the question a
selector has to survive. `judgment_year` is `-1` rather than NULL for undated
judgments: NULL in a primary key never equals itself, so the upsert would insert
a new row every page and the count would be low by however many pages contained
one.

Distinct content hashes are deliberately ABSENT here — the same text can appear
in two courts, so the figure is not summable across cells and comes from
`embedding_content_representative` instead. `chars_total` IS summable and gives
the text-size distribution its mean without a second walk.

---

## document_vector_staging

Migration `0057`. **Vectors before any index exists.**

`judgment_chunks.embedding` cannot serve: it is one fixed representation, carries
no model identity, and writing an experiment into it would corrupt the only dense
arm currently serving retrieval.

Three independently addressable populations, via `representation_type`:

| level | values |
| --- | --- |
| A | `document` — one canonical vector per authority |
| B | `holding`, `issue`, `proposition` — verified legal objects |
| C | `paragraph` — SELECTED paragraphs, never all of them |

For `document`, `source_object_id` is the REPRESENTATIVE judgment id.

**Deliberately NO ANN index.** An HNSW build over millions of rows is the single
most expensive thing available on this box, where retrieval is already p50 43s.
Staged vectors are for exact brute-force comparison over bounded candidate sets;
the index gets built when a measurement says which representation deserves one.

`embedding_fp32 vector` and `embedding_halfvec halfvec` sit side by side for the
SAME source object, because "does halfvec lose quality" needs both present at
once. Undimensioned on purpose (pgvector 0.8.5 permits it): the model is not
chosen and a dimension baked into DDL now would need a table rewrite later. `dim`
is stored and checked by the writer.

`source_hash` is a hash of the exact TEXT handed to the model, not of the source
row — a row can change without the embedded text changing and vice versa, and
only this answers "is this vector still valid".

`precision` is stored rather than derived from NULL-ness: "we meant to store both
and one failed" and "we only wanted halfvec" are different states that a NULL
check cannot tell apart.

**`status = 'approved'` is NEW1's call, never a writer's** — semantic approval is
not a side effect of a successful write. `superseded` rows are kept, because
deleting them destroys the ability to reproduce the comparison that replaced them.

---

## coverage_cell

Migration `0059`. **Two INDEPENDENT coverage axes per court × year**, read by the
retrieval path in one indexed lookup.

`docs/ai/NEW1_COVERAGE_STATE_CONTRACT.md`: the grouped count over `judgments`
that produces this took **86.5 seconds** live, and retrieval is already the
majority of slow statements on the box. So it is precomputed and refreshed by
`pnpm --filter @lawmind/ingest coverage:cells --apply`, which reads NEW2's
`new2-frontier.json` for the acquisition axis and measures reachability itself.

| axis | columns | states |
| --- | --- | --- |
| acquisition | `source_rows` · `source_provenance` · `held` · `held_share` | `source_state`: `COVERED` \| `PARTIAL` \| `KNOWN_GAP` \| `SOURCE_HAS_ZERO` \| `UNKNOWN` |
| reachability | `embedded` · `eligible` | `reachability`: `EMBEDDED` \| `LEXICAL_ONLY` \| `UNKNOWN` |

**Never folded into one enum.** A cell can be `COVERED` and `LEXICAL_ONLY` at
once — held in full, invisible to the dense arm — and the two produce the same
empty screen for opposite reasons.

`UNKNOWN` is the DEFAULT on both axes and must never render as `COVERED`; a cell
absent from the table is `UNKNOWN` for the same reason. `SOURCE_HAS_ZERO`
requires a POSITIVE source measurement of zero, never the absence of one.

**No PARTIAL threshold is encoded.** Where partial stops being an answer is a
product judgement (`PRODUCT_DECISIONS.md`); `held_share` is stored so that line
can be drawn later without recomputing anything. `source_provenance` is stored
because the denominator counts parquet ROWS, not documents, and over-reports gaps.

Three `measured_at` columns, not one: source, held and embedded are measured by
different jobs at different cadences, and a single timestamp would hide which is
stale. First load 20 Aug 2026: 966 cells — 631 COVERED, 257 PARTIAL, 77 UNKNOWN,
1 SOURCE_HAS_ZERO; 558 EMBEDDED, 408 LEXICAL_ONLY.

## THE FINDING: STATISTICS WERE A WEEK AND THREE MIGRATIONS STALE

`pg_stat_user_tables` reported `judgments.last_analyze = NULL` and
`last_autoanalyze = 4 Aug`. Migrations `0026`, `0027` and `0028` all landed
after that, so **the planner had no statistics at all for `storage_key`** and was
choosing plans for every new access path from week-old data.

**One `ANALYZE` per table changed the plans, not just the timings:**

| path                                           | before ANALYZE           | after                     |            |
| ---------------------------------------------- | ------------------------ | ------------------------- | ---------- |
| `judgments WHERE storage_key IS NOT NULL`      | **23.504 ms · Seq Scan** | **0.019 ms · Index Scan** | **1,237×** |
| `judgment_statute_refs` by `act_key` + section | 1.606 ms                 | **0.040 ms**              | 40×        |
| `judgment_citation_aliases` by `alias_key`     | 0.976 ms                 | **0.038 ms**              | 26×        |
| `judgment_judges` name filter                  | 15.343 ms                | **2.127 ms**              | 7×         |
| `/corpus/coverage` main query                  | 0.534 ms                 | **0.339 ms**              | 1.6×       |

**The partial index was never the problem.** `judgments_storage_key_idx` existed
and was correct; with no statistics on the column the planner assumed a default
selectivity and preferred a sequential scan. **An index nobody has analysed is an
index the planner will not use.**

> **Run `ANALYZE` on every table a migration touches, as part of applying it.**
> Autoanalyze fires on write volume, and a migration that adds a column or an
> index changes the _plan space_ without changing a single row — so autoanalyze
> may not fire for days, and the new path is slow for exactly as long.

**Why nobody would have noticed.** Over the Railway TCP proxy a request costs
**~770 ms of round trip**. Every number in that table is under 24 ms. The whole
range is invisible from the client and only shows up server-side — the same
separation `CURRENT_PLAN.md` §2 insisted on when it refused to quote a reranker
latency that had proxy time baked into it.

## The paths, after ANALYZE

| path                      | plan                                                                             | exec         |
| ------------------------- | -------------------------------------------------------------------------------- | ------------ |
| `/corpus/coverage`        | `Index Scan judgment_coverage_court_idx` + `Index Only Scan judgments_court_idx` | **0.339 ms** |
| `cite:` alias lookup      | `Index Scan judgment_citation_aliases_key`                                       | **0.038 ms** |
| `section:` + `act:`       | `Index Scan judgment_statute_refs_act_key_idx`                                   | **0.040 ms** |
| `storage_key IS NOT NULL` | `Index Scan judgments_storage_key_idx`                                           | **0.019 ms** |
| `judge:` name filter      | **Seq Scan on judgment_judges**                                                  | **2.127 ms** |

**The judge filter still sequentially scans, and that is currently correct.**
`judgment_judges_name_trgm` exists, but the query is `ILIKE '%name%'` over
**44,360 rows** — the planner costs a full scan below a trigram lookup plus heap
fetches, and at 2.1 ms it is right. **Recorded rather than fixed:** it is the
`fieldPrecision` gate's path, so it grows with the corpus, and the moment High
Court judges land it should be re-planned. Forcing the index now would be
optimising against a measurement that says not to.

**`/corpus/coverage`'s correlated subquery is fine.** `(SELECT count(*) FROM
judgments WHERE court = cov.court_name)` runs once per court and resolves to an
**Index Only Scan** — 25 index-only counts, not 25 table scans.
