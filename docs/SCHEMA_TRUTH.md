# SCHEMA TRUTH

The only authority on data shapes. Never infer a column. Never add a table
without updating this file in the same commit.

## users
`id` uuid pk · `auth_id` text unique · `full_name` text · `phone` text ·
`email` text · `bar_enrolment_number` text null · `enrolment_status` enum
(unverified|verified|rejected) default unverified · `preferred_language` enum
(en|hi) default en · `subscription_tier` enum
(none|starter|professional|expert|firm|enterprise) default none ·
`created_at` timestamptz

## judgments
`id` uuid pk · `case_title` text · `neutral_citation` text null ·
`reporter_citations` text[] · `court` text · `bench` text null ·
`judgment_date` date · `full_text` text · `language` enum (en|hi) ·
`source_url` text · `is_overruled` bool default false ·
`overruled_by_judgment_id` uuid null fk→judgments · `created_at` timestamptz

Index: gin on to_tsvector(full_text); btree on judgment_date, court.

## judgment_chunks
`id` uuid pk · `judgment_id` uuid fk→judgments cascade · `chunk_index` int ·
`chunk_text` text · `embedding` vector(1024) · `token_count` int ·
`ocr_confidence` numeric(4,3) null — set where source was a scan; retrieval
down-ranks low-confidence text

Index: ivfflat on embedding vector_cosine_ops; btree on judgment_id.
Unique: (judgment_id, chunk_index).

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

## matter_events
`id` uuid pk · `matter_id` uuid fk→matters cascade · `event_date` date ·
`event_type` enum (hearing|order|filing|note) · `order_text` text null ·
`notes` text null · `source` enum (manual|vendor|ocr) · `created_at` timestamptz

## briefings
`id` uuid pk · `matter_id` uuid fk→matters cascade · `hearing_date` date ·
`generated_at` timestamptz · `content` jsonb · `delivered_at` timestamptz null ·
`opened_at` timestamptz null

Unique: (matter_id, hearing_date). The sweep is idempotent — re-running must not
duplicate.

## documents
`id` uuid pk · `user_id` uuid fk→users · `matter_id` uuid null fk→matters ·
`document_type` enum (bail|anticipatory_bail|plaint|written_statement|
legal_notice|notice_reply|affidavit|vakalatnama|writ_petition|rti) ·
`input_params` jsonb · `generated_content` text · `language` enum (en|hi) ·
`storage_key` text null · `watermark_removed` bool default false ·
`created_at` timestamptz

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
`state` enum (verified_internal|verified_external|verified_human|unverified|overruled) ·
`verified_by_source` enum (corpus|indiankanoon|aws_s3|ecourts|none) ·
`match_confidence` numeric(4,3) null — fuzzy title similarity where used ·
`shown_to_user` bool — was it rendered, and in what state ·
`created_at` timestamptz

`shown_to_user` measures silent-drop rate. A stripped citation with no unverified
state shown is a harness failure.

## verification_cache
Permanent. A case confirmed once is never re-verified.

`id` uuid pk · `citation_text` text · `normalised_citation` text ·
`judgment_id` uuid null fk→judgments · `state` enum (as above) ·
`source` enum (as above) · `match_confidence` numeric(4,3) null ·
`confirmed_by_user_id` uuid null fk→users — set for eCourts human confirmation ·
`raw_response` jsonb · `created_at` timestamptz

Unique on `normalised_citation`. Index on `judgment_id`.

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
