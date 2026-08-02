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
`created_at` timestamptz

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

Index: gin on to_tsvector(full_text); btree on judgment_date, court.

`overruled_status` replaces the former `is_overruled` bool. A boolean cannot
carry the three states in `design/screens/IMPLEMENTATION.md` §9.3, where
`set_aside` **disables add-to-matter**, `partly_set_aside` must name the affected
paragraphs, and `doubted` shows no banner at all. Overruledness is a property of
the judgment, answered by a different source than verification — see
`CITATION_HARNESS.md`.

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
`opened_at` timestamptz null

Unique: (matter_id, hearing_date). The sweep is idempotent — re-running must not
duplicate.

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
`verified_by_source` enum (corpus|indiankanoon|aws_s3|public_x2|ecourts|none) ·
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

| Field | Lives on | Question it answers |
|---|---|---|
| `verification_state` | `citation_checks`, `verification_cache` | Does this authority exist? |
| `verified_by_source` | `citation_checks`, `verification_cache` | Who confirmed it? |
| `overruled_status` | `judgments` | Is it still good law? |

| Badge | Condition |
|---|---|
| `VERIFIED` | `verification_state = verified` · source `corpus` |
| `VERIFIED ×2` | `verification_state = verified` · source `public_x2` |
| `VERIFIED BY YOU` | `verification_state = verified` · source `ecourts` |
| `NOT CONFIRMED` | `verification_state` in (`unverified`, `failed`) |
| `LAW MOVED` | `overruled_status != none` — **independent of verification** |

A judgment can be verified **and** overruled; those are different questions
answered by different sources, so folding them into one enum was wrong.
`public_x2` is the value tier 2 writes when IndianKanoon and the AWS S3 datasets
**agree** — the per-source values remain for partial and diagnostic records where
only one matched.

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
`ocr_intake` · `signups`. An unknown key is rejected, never implicitly created —
a typo must not silently produce a switch nobody is watching.

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

| It answered | Now answered by |
|---|---|
| Did the run happen, and when | The cron platform + the **22:50 alert** in `docs/FAILURE_MODES.md` |
| What changed | `citation_fanouts` rows where `trigger = 'recheck'` |
| Did it fail | The alert, which is what anyone would act on anyway |

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
See `PRIVACY_PII.md` — we never claim complete PII removal.
