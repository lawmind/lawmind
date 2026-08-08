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
**DPDP Act 2023 s. 6** requires consent to be *free, specific, informed,
unconditional and unambiguous*, given **for a specified purpose**. Accepting the
terms is not agreeing that your drafting teaches the model.

**An unset pair means NO** — no boolean, no default. A `boolean NOT NULL DEFAULT
false` would make "never asked" and "asked and declined" indistinguishable, and
only one of those is worth asking about again. A CHECK constraint
(`training_consent_complete`) enforces **both or neither**, in the database,
because this is exactly the kind of pair that drifts when only application code
guards it.

**Withdrawal sets both columns back to NULL.** There is deliberately no
`training_consent_withdrawn_at`: a third column leaves two that can disagree and
a question — *granted in March, withdrawn in August, what about the pairs
emitted in May?* — that application code must re-answer forever. DPDP s. 6(6)
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
`reporter_citations` text[] · `court` text · `bench` text null ·
`judgment_date` date · `full_text` text · `language` enum (en|hi) ·
`source_url` text · `overruled_status` enum
(none|set_aside|partly_set_aside|doubted) default none ·
`overruled_status_changed_at` timestamptz null — when the status last moved ·
`overruled_by_judgment_id` uuid null fk→judgments ·
`overruled_paras` int[] null — the affected paragraphs, required when
`partly_set_aside` · `overruled_note` text null · `created_at` timestamptz

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

Index: gin on `full_text_tsv`; btree on judgment_date, court.
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

Added S1, 6 Aug 2026. **One row per citation found in a judgment's text.**

`id` uuid pk · `citing_judgment_id` uuid fk→judgments cascade ·
`cited_judgment_id` uuid null fk→judgments **set null** — null when the cited
authority is not in the corpus · `citation_text` text — exactly as it appeared ·
`normalised_citation` text — the comparison form · `relationship` text
(`cites`|`followed`|`distinguished`|`doubted`|`overruled`) default `cites`,
check-constrained · `evidence` text null — the phrase that justified a
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

## statute_mappings

`id` uuid pk · `old_act` enum (ipc|crpc|evidence) · `old_section` text ·
`new_act` enum (bns|bnss|bsa) · `new_section` text · `relationship` enum
(exact|split|merged|no_equivalent) · `note` text null

Seeded from indiacode.nic.in. Never model-generated. See `DOMAIN_TRUTH.md`.

## matters

`id` uuid pk · `user_id` uuid fk→users · `case_title` text · `cnr_number` text null ·
`court` text · `case_type` enum (criminal|civil) · `parties` jsonb ·
`client_name` text · `our_side` enum
(petitioner|respondent|accused|complainant|other) ·
`next_hearing_date` date null · `status` enum (active|disposed|archived) ·
`source` enum (manual|vendor) · `created_at` timestamptz

Index: btree on (user_id, next_hearing_date) — the nightly sweep reads this.

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

| Value          | Meaning                                        | Strength | On the wire    |
| -------------- | ---------------------------------------------- | -------- | -------------- |
| `ecourts`      | a named human solved the CAPTCHA and vouched   | 4        | `ecourts`      |
| `public_x2`    | two INDEPENDENT public sources agreed          | 3        | `public_x2`    |
| `ecourts_bulk` | the registry answered us directly, under grant | 3        | `ecourts_bulk` |
| `licensed`     | a commercial publisher's editorial view, bought | 2        | `licensed`     |
| `corpus`       | we hold the judgment ourselves                 | 1        | `corpus`       |
| `indiankanoon` | one public source matched, the other did not   | 0        | `none`         |
| `aws_s3`       | one public source matched, the other did not   | 0        | `none`         |
| `none`         | nobody confirmed it                            | 0        | `none`         |

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
