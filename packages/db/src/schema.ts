/**
 * Transcribed field-by-field from `docs/SCHEMA_TRUTH.md`.
 *
 * SCHEMA_TRUTH is the only authority on data shapes. Never infer a column; never
 * add a table without updating that file in the same commit.
 *
 * Nullability convention read from the source: SCHEMA_TRUTH marks nullable columns
 * with an explicit trailing `null`. Every column without that marker is NOT NULL.
 *
 * S0 creates 13 of the 23 tables (`sprints/SPRINT_0.md` §Migration scope). The ten
 * deferred tables are NOT declared here — a deferred table created "while you're in
 * there" is exactly what that decision forbids.
 */
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  boolean,
  customType,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

/** Postgres `tsvector`. Drizzle has no built-in for it. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

/* ------------------------------------------------------------------ enums -- */

/**
 * One locale type, shared by `users.preferred_language`, `judgments.language`,
 * `documents.language` and `searches.query_language` — the same two values with
 * the same meaning in all four. A third locale is then one ALTER TYPE, which is
 * what SCHEMA_TRUTH means by "a migration, not a rewrite".
 */
export const languageEnum = pgEnum('language', ['en', 'hi']);

export const enrolmentStatusEnum = pgEnum('enrolment_status', [
  'unverified',
  'verified',
  'rejected',
]);
export const subscriptionTierEnum = pgEnum('subscription_tier', [
  'none',
  'practice',
  'chamber',
  'expert',
  'firm',
  'enterprise',
]);

/**
 * Four states, not a boolean. `set_aside` disables add-to-matter,
 * `partly_set_aside` must name the affected paragraphs, `doubted` shows no banner.
 * A bool cannot carry that.
 */
export const overruledStatusEnum = pgEnum('overruled_status', [
  'none',
  'set_aside',
  'partly_set_aside',
  'doubted',
]);

export const platformConfigKindEnum = pgEnum('platform_config_kind', [
  'maintenance',
  'kill_switch',
  'flag',
]);

/**
 * `ok` and `empty` are different facts, not degrees of the same one. A court
 * genuinely publishes nothing some days; a parser that returned nothing is a
 * failure. Collapsing them is how briefings go out with stale dates.
 */
export const causeListStatusEnum = pgEnum('cause_list_status', ['ok', 'empty', 'stale', 'failed']);

export const ecourtsFetchOutcomeEnum = pgEnum('ecourts_fetch_outcome', ['ok', 'refused', 'error']);

/**
 * Where a hearing date came from. A date the advocate typed is a first-class
 * source (PD-12), not a fallback — next dates are given orally in open court, and
 * a date is not more trustworthy for having been scraped.
 */
export const hearingDateSourceEnum = pgEnum('hearing_date_source', ['advocate', 'cause_list']);

export const oldActEnum = pgEnum('old_act', ['ipc', 'crpc', 'evidence']);
export const newActEnum = pgEnum('new_act', ['bns', 'bnss', 'bsa']);
export const statuteRelationshipEnum = pgEnum('statute_relationship', [
  'exact',
  'split',
  'merged',
  'no_equivalent',
]);

export const caseTypeEnum = pgEnum('case_type', ['criminal', 'civil']);
export const ourSideEnum = pgEnum('our_side', [
  'petitioner',
  'respondent',
  'accused',
  'complainant',
  'other',
]);
export const matterStatusEnum = pgEnum('matter_status', ['active', 'disposed', 'archived']);
export const matterSourceEnum = pgEnum('matter_source', ['manual', 'vendor']);

export const eventTypeEnum = pgEnum('event_type', ['hearing', 'order', 'filing', 'note']);
export const noteVisibilityEnum = pgEnum('note_visibility', ['private', 'shared']);
export const eventSourceEnum = pgEnum('event_source', ['manual', 'vendor', 'ocr']);

export const documentTypeEnum = pgEnum('document_type', [
  'bail',
  'anticipatory_bail',
  'plaint',
  'written_statement',
  'legal_notice',
  'notice_reply',
  'affidavit',
  'vakalatnama',
  'writ_petition',
  'rti',
]);

export const llmFeatureEnum = pgEnum('llm_feature', [
  'search',
  'draft',
  'briefing',
  'extract',
  'ocr_postprocess',
]);
export const dataClassEnum = pgEnum('data_class', ['public', 'sensitive']);

/**
 * Three independent fields, never one combined enum — `verification_state` answers
 * whether the authority exists, `verified_by_source` who confirmed it, and
 * `judgments.overruled_status` whether it is still good law. A judgment can be
 * verified AND overruled. `docs/CITATION_HARNESS.md`.
 *
 * `failed` means the check could not run. It renders identically to `unverified`
 * and is separated only so an outage does not masquerade as a corpus gap.
 */
export const verificationStateEnum = pgEnum('verification_state', [
  'verified',
  'unverified',
  'failed',
]);

/**
 * Six values. `public_x2` is what tier 2 writes when IndianKanoon and the AWS S3
 * datasets AGREE; the per-source values remain for partial and diagnostic records
 * where only one matched. The API surface only ever emits four of these
 * (`corpus` · `public_x2` · `ecourts` · `none`) — `docs/API_CONTRACTS.md`.
 */
export const verifiedBySourceEnum = pgEnum('verified_by_source', [
  'corpus',
  'indiankanoon',
  'aws_s3',
  'public_x2',
  /** A named human solved the CAPTCHA and vouched. The strongest assertion. */
  'ecourts',
  /**
   * The registry answered us directly, under the registrar's grant — added
   * 8 Aug 2026, migration 0022.
   *
   * Deliberately NOT `ecourts`. That value means a human vouched, which is why
   * it caches permanently and why the harness falls back to it. Bulk resolution
   * writing the same value would degrade the product's strongest assertion to
   * "a machine said so" while still spelling it `ecourts`, with no test
   * failing. Different acts, different weight.
   *
   * May be upgraded to `ecourts` if an advocate later confirms. Never
   * downgraded, and a bulk pass must never overwrite an `ecourts` row — a
   * human's word is not superseded by a machine re-reading the same page.
   */
  'ecourts_bulk',
  /**
   * Content that arrived under a commercial licence — a publisher's editorial
   * view, bought. Added 8 Aug 2026, migration 0024.
   *
   * Not `corpus` (we did not resolve it), not `ecourts` (nobody vouched), not
   * `public_x2` (one source, not two agreeing). Ranks below `ecourts_bulk`
   * because a publisher is not the registry: a headnote is an editor's reading,
   * expert and valuable and still one organisation's opinion.
   *
   * **The one value that can go stale by contract.** The others rest on facts;
   * this rests on an agreement that can end.
   */
  'licensed',
  'none',
]);

export const citationFanoutTriggerEnum = pgEnum('citation_fanout_trigger', [
  'dispute_upheld',
  'recheck',
  'admin_correction',
]);

export const citationFanoutStatusEnum = pgEnum('citation_fanout_status', [
  'pending',
  'complete',
  'failed',
]);

export const citationSurfaceEnum = pgEnum('citation_surface', [
  'search',
  'judgment_detail',
  'briefing',
  'draft',
  'matter',
]);

// Trigger 1 is always in-app only. Trigger 2 covers the filed-draft AND the
// copied-out audience — identical severity by decision (CITATION_HARNESS.md
// §When the law moves) — and is never togglable.
export const alertKindEnum = pgEnum('alert_kind', [
  'saved_authority_moved',
  'filed_citation_moved',
]);
// immediate = pushed the moment the fan-out completes. batched = the evening
// briefing's "since yesterday" block and nowhere else — PD-6.
export const alertSeverityEnum = pgEnum('alert_severity', ['immediate', 'batched']);

export const disputeStatusEnum = pgEnum('dispute_status', ['open', 'upheld', 'rejected']);

export const ocrSourceTypeEnum = pgEnum('ocr_source_type', ['pdf_scanned', 'image', 'camera']);
export const ocrEngineEnum = pgEnum('ocr_engine', ['paddleocr', 'tesseract']);
export const ocrJobStatusEnum = pgEnum('ocr_job_status', [
  'queued',
  'processing',
  'complete',
  'failed',
  'needs_review',
]);

export const dataRequestKindEnum = pgEnum('data_request_kind', ['export', 'correction', 'erasure']);
export const dataRequestStatusEnum = pgEnum('data_request_status', [
  'received',
  'in_progress',
  'completed',
  'refused',
]);

/* ----------------------------------------------------------------- tables -- */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authId: text('auth_id').notNull().unique(),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  barEnrolmentNumber: text('bar_enrolment_number'),
  enrolmentStatus: enrolmentStatusEnum('enrolment_status').notNull().default('unverified'),
  preferredLanguage: languageEnum('preferred_language').notNull().default('en'),
  subscriptionTier: subscriptionTierEnum('subscription_tier').notNull().default('none'),
  /**
   * Expo push token. **Null means no device has registered** — an absence, not a
   * refusal and not a failure. An advocate who has not opened the app on a phone,
   * or who declined the OS prompt, is a normal state: the briefing is generated
   * and simply not delivered.
   */
  expoPushToken: text('expo_push_token'),
  // PD-8 — consent replaces the AI-assisted mark. Set together at onboarding,
  // never back-filled. An unset pair means consent was not given, and the app
  // must be able to see that state.
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  termsVersion: text('terms_version'),
  /**
   * Training consent — **a second, separate consent, and deliberately not the
   * PD-8 pair above.** DPDP Act 2023 s. 6 requires consent to be specific to a
   * stated purpose; accepting the terms is not agreeing that an advocate's own
   * work may teach the model.
   *
   * **An unset pair means NO.** There is no boolean default, because that would
   * make "never asked" and "asked and declined" indistinguishable. Withdrawal
   * sets both back to NULL — the history lives in `trainingConsentEvents`.
   * Migration `0025` carries the reasoning and a CHECK enforcing both-or-neither.
   */
  trainingConsentAt: timestamp('training_consent_at', { withTimezone: true }),
  trainingConsentVersion: text('training_consent_version'),
  // Citator alert settings — PD-5/PD-6. Default true: these are safety-relevant,
  // so an advocate opts OUT of being told an authority moved, never opts in.
  // There is no column for trigger 2 (filed_citation_moved): it cannot be
  // disabled, and the API rejects any attempt to send a key for it.
  alertSavedAuthorityMoved: boolean('alert_saved_authority_moved').notNull().default(true),
  alertOwnMatterJudgment: boolean('alert_own_matter_judgment').notNull().default(true),
  alertUnknownListing: boolean('alert_unknown_listing').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const judgments = pgTable(
  'judgments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseTitle: text('case_title').notNull(),
    neutralCitation: text('neutral_citation'),
    reporterCitations: text('reporter_citations').array().notNull(),
    court: text('court').notNull(),
    bench: text('bench'),
    judgmentDate: date('judgment_date').notNull(),
    fullText: text('full_text').notNull(),
    language: languageEnum('language').notNull(),
    sourceUrl: text('source_url').notNull(),
    overruledStatus: overruledStatusEnum('overruled_status').notNull().default('none'),
    // Set in the same write as any overruled_status change, including inside
    // applyOverruledChange. Without it the stale-overruled rate cannot separate a
    // badge that was wrong when drawn from one the world invalidated afterwards.
    overruledStatusChangedAt: timestamp('overruled_status_changed_at', { withTimezone: true }),
    overruledByJudgmentId: uuid('overruled_by_judgment_id').references(
      (): AnyPgColumn => judgments.id,
    ),
    overruledParas: integer('overruled_paras').array(),
    overruledNote: text('overruled_note'),
    // The official case number as printed, e.g. `CRIMINAL APPEAL No. 19/1955`.
    // Stored so the case_type derivation below is auditable.
    caseNumber: text('case_number'),
    // Derived mechanically from case_number, never from the judgment's content.
    // Null where the case number states no side — those rows are excluded when
    // the filter is applied rather than guessed into one.
    caseType: caseTypeEnum('case_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Stored, not an expression index. An expression gin index cannot hand the
     * vector back to `ts_rank`, which then recomputes `to_tsvector` per matching
     * row — measured at 20.8s for one query over 1,281 judgments. See
     * `docs/SCHEMA_TRUTH.md` §judgments.
     */
    fullTextTsv: tsvector('full_text_tsv').generatedAlwaysAs(
      sql`to_tsvector('english', "full_text")`,
    ),
  },
  (t) => [
    index('judgments_full_text_idx').using('gin', t.fullTextTsv),
    index('judgments_judgment_date_idx').on(t.judgmentDate),
    index('judgments_court_idx').on(t.court),
    // Ingest resumability, enforced by the database rather than by application
    // code: re-running a killed ingest must not duplicate. `source_url` is the
    // natural key of a judgment at its source (one canonical document per URL).
    // NOTE this does NOT deduplicate the same judgment arriving from two
    // different sources — that is citation-level identity and belongs to S2.
    uniqueIndex('judgments_source_url_key').on(t.sourceUrl),
  ],
);

export const judgmentChunks = pgTable(
  'judgment_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    judgmentId: uuid('judgment_id')
      .notNull()
      .references(() => judgments.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    chunkText: text('chunk_text').notNull(),
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    tokenCount: integer('token_count').notNull(),
    // An OCR ENGINE's own confidence, and only that. Null for text that arrived
    // already extracted — we did not run the engine, so we cannot report it.
    ocrConfidence: numeric('ocr_confidence', { precision: 4, scale: 3 }),
    // A measured proxy for visible OCR damage, computed from the text itself.
    // NOT accuracy: a confidently-wrong character scores a clean 1.000.
    // Retrieval down-ranks on this and never excludes on it.
    textQuality: numeric('text_quality', { precision: 4, scale: 3 }),
  },
  (t) => [
    // HNSW, not ivfflat. Measured on the finished 616,197-chunk corpus, the dense
    // candidate stage runs in 10.7 ms median through this index against 1,100.5 ms
    // scanning — and ivfflat's recall additionally decays on an append-only corpus,
    // because its centroids are fixed at build time. `docs/LCC_PLAN.md` §2B.
    // Build parameters live in migration 0011 and are NOT expressed here: drizzle
    // has no `with` for index options, so the migration is the authority.
    index('judgment_chunks_embedding_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('judgment_chunks_judgment_id_idx').on(t.judgmentId),
    uniqueIndex('judgment_chunks_judgment_id_chunk_index_key').on(t.judgmentId, t.chunkIndex),
  ],
);

/** One row per Act. `docs/SCHEMA_TRUTH.md` §statutes. */
export const statutes = pgTable('statutes', {
  id: uuid('id').primaryKey().defaultRandom(),
  // The source's own identifier — makes ingest resumable the same way
  // judgments.source_url does.
  actId: text('act_id').notNull().unique(),
  shortTitle: text('short_title').notNull(),
  hindiTitle: text('hindi_title'),
  actNumber: text('act_number').notNull(),
  actYear: integer('act_year').notNull(),
  enactmentDate: date('enactment_date'),
  // Which regime applies to an offence turns on THIS date, not enactment:
  // BNS was enacted 2023-12-25 and came into force 2024-07-01.
  enforcementDate: date('enforcement_date'),
  ministry: text('ministry'),
  sourceUrl: text('source_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const statuteSections = pgTable(
  'statute_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    statuteId: uuid('statute_id')
      .notNull()
      .references(() => statutes.id, { onDelete: 'cascade' }),
    // Text, not int: sections carry letters (63A) and renumbering is common.
    sectionNumber: text('section_number').notNull(),
    heading: text('heading'),
    sectionText: text('section_text').notNull(),
    footnote: text('footnote'),
    // The Act's own ordering — section_number does not sort lexically.
    orderIndex: integer('order_index').notNull(),
    sourceUrl: text('source_url').notNull(),
    fullTextTsv: tsvector('full_text_tsv').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce("heading", '') || ' ' || "section_text")`,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('statute_sections_statute_id_section_number_key').on(t.statuteId, t.sectionNumber),
    index('statute_sections_full_text_idx').using('gin', t.fullTextTsv),
    index('statute_sections_statute_id_order_idx').on(t.statuteId, t.orderIndex),
  ],
);

export const statuteMappings = pgTable('statute_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  oldAct: oldActEnum('old_act').notNull(),
  oldSection: text('old_section').notNull(),
  newAct: newActEnum('new_act').notNull(),
  newSection: text('new_section').notNull(),
  relationship: statuteRelationshipEnum('relationship').notNull(),
  note: text('note'),
});

export const matters = pgTable(
  'matters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    caseTitle: text('case_title').notNull(),
    cnrNumber: text('cnr_number'),
    court: text('court').notNull(),
    caseType: caseTypeEnum('case_type').notNull(),
    parties: jsonb('parties').notNull(),
    clientName: text('client_name').notNull(),
    ourSide: ourSideEnum('our_side').notNull(),
    nextHearingDate: date('next_hearing_date'),
    status: matterStatusEnum('status').notNull(),
    source: matterSourceEnum('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // The nightly sweep reads this.
  (t) => [index('matters_user_id_next_hearing_date_idx').on(t.userId, t.nextHearingDate)],
);

export const matterEvents = pgTable('matter_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  matterId: uuid('matter_id')
    .notNull()
    .references(() => matters.id, { onDelete: 'cascade' }),
  eventDate: date('event_date').notNull(),
  eventType: eventTypeEnum('event_type').notNull(),
  // The court record. Always visible to a share.
  orderText: text('order_text'),
  // What the advocate thinks about it. Obeys note_visibility.
  notes: text('notes'),
  // PD-4 — the default is `private` at the COLUMN level, not in application code.
  // A note that defaults to shared through a missed branch is the failure this
  // prevents.
  noteVisibility: noteVisibilityEnum('note_visibility').notNull().default('private'),
  source: eventSourceEnum('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const briefings = pgTable(
  'briefings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matterId: uuid('matter_id')
      .notNull()
      .references(() => matters.id, { onDelete: 'cascade' }),
    hearingDate: date('hearing_date').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    content: jsonb('content').notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }),

    /**
     * The cause-list escalation target, added in migration 0013.
     *
     * **Three states, deliberately not a boolean.** A bool cannot say "nobody has
     * looked", and that is a different thing to tell an advocate than "we looked
     * and could not confirm it". Both null = never checked; `dates_confirmed_at`
     * set = confirmed against a successful sync; `dates_not_confirmed_at` set =
     * we tried and failed, and the reason says how.
     *
     * An unconfirmed listing is never presented as confirmed — the same rule as
     * citations.
     */
    datesConfirmedAt: timestamp('dates_confirmed_at', { withTimezone: true }),
    datesNotConfirmedAt: timestamp('dates_not_confirmed_at', { withTimezone: true }),
    datesNotConfirmedReason: text('dates_not_confirmed_reason'),
    hearingDateSource: hearingDateSourceEnum('hearing_date_source'),
  },
  // The sweep is idempotent — re-running must not duplicate.
  (t) => [uniqueIndex('briefings_matter_id_hearing_date_key').on(t.matterId, t.hearingDate)],
);

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  matterId: uuid('matter_id').references(() => matters.id),
  documentType: documentTypeEnum('document_type').notNull(),
  inputParams: jsonb('input_params').notNull(),
  generatedContent: text('generated_content').notNull(),
  language: languageEnum('language').notNull(),
  storageKey: text('storage_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // PD-8 superseded 1 Aug 2026: `watermark_removed`, `watermark_removed_at` and
  // `watermark_removed_by` are RETIRED and must not be created. The citation
  // summary in the draft footer is derived from citation_checks at read time and
  // is not stored here.
});

export const searches = pgTable('searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  matterId: uuid('matter_id').references(() => matters.id),
  queryText: text('query_text').notNull(),
  queryLanguage: languageEnum('query_language').notNull(),
  resultsReturned: integer('results_returned').notNull(),
  modelUsed: text('model_used').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Every model call writes a row. No exceptions. Cost control and DPDP audit trail. */
export const llmCalls = pgTable('llm_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  feature: llmFeatureEnum('feature').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
  latencyMs: integer('latency_ms').notNull(),
  dataClass: dataClassEnum('data_class').notNull(),
  pseudonymised: boolean('pseudonymised').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const citationChecks = pgTable('citation_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  searchId: uuid('search_id').references(() => searches.id),
  documentId: uuid('document_id').references(() => documents.id),
  citationClaimed: text('citation_claimed').notNull(),
  judgmentIdMatched: uuid('judgment_id_matched').references(() => judgments.id),
  verificationState: verificationStateEnum('verification_state').notNull(),
  verifiedBySource: verifiedBySourceEnum('verified_by_source').notNull(),
  matchConfidence: numeric('match_confidence', { precision: 4, scale: 3 }),
  // Measures silent-drop rate. A stripped citation with no unverified state shown
  // is a harness failure. Threshold 0.0%.
  shownToUser: boolean('shown_to_user').notNull(),
  // Measures the stale-overruled rate: the status the server sent for THIS render.
  overruledStatusShown: text('overruled_status_shown'),
  surface: citationSurfaceEnum('surface'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Permanent. A case confirmed once is never re-verified.
 *
 * Overruledness is NEVER cached here — it lives on `judgments` and moves when a
 * later judgment moves the law, so a permanent cache would go stale silently.
 */
export const verificationCache = pgTable(
  'verification_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    citationText: text('citation_text').notNull(),
    normalisedCitation: text('normalised_citation').notNull(),
    judgmentId: uuid('judgment_id').references(() => judgments.id),
    verificationState: verificationStateEnum('verification_state').notNull(),
    verifiedBySource: verifiedBySourceEnum('verified_by_source').notNull(),
    matchConfidence: numeric('match_confidence', { precision: 4, scale: 3 }),
    // Set for eCourts human confirmation. We never bypass the CAPTCHA.
    confirmedByUserId: uuid('confirmed_by_user_id').references(() => users.id),
    rawResponse: jsonb('raw_response').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('verification_cache_normalised_citation_key').on(t.normalisedCitation),
    index('verification_cache_judgment_id_idx').on(t.judgmentId),
  ],
);

/**
 * APPEND-ONLY. Every privileged admin action writes exactly one row.
 *
 * Enforcement is a revoked grant PLUS a BEFORE UPDATE OR DELETE trigger that
 * raises — see the hand-written migration in `drizzle/`. Kill switches without an
 * audit trail is a governance failure.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    actorRole: text('actor_role').notNull(),
    // Dotted verb, e.g. `platform.kill_switch.toggle`, `enrolment.approve`.
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    // The changed fields only, not whole rows.
    before: jsonb('before'),
    after: jsonb('after'),
    reason: text('reason'),
    ip: inet('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_created_at_idx').on(t.createdAt.desc()),
    index('audit_log_actor_user_id_created_at_idx').on(t.actorUserId, t.createdAt.desc()),
    index('audit_log_target_type_target_id_idx').on(t.targetType, t.targetId),
  ],
);

/* ------------------------------------------ tables added after S0 (S1) -- */

/**
 * **These four were live in the database before they were declared here**, added
 * through hand-written migrations 0008–0012 while the typed client stayed blind
 * to them. That breaks this file's own rule at the top — *never add a table
 * without updating that file in the same commit* — and it meant every query
 * against them had to go through raw `postgres.js` SQL with no type checking.
 * Transcribed from the migrations, which are the shipped truth.
 */

/**
 * Judgment-to-judgment edges — the citation graph.
 *
 * `cited_judgment_id` is nullable **on purpose**. A citation that does not resolve
 * EXACTLY against a stored `neutral_citation` or `reporter_citations` entry keeps
 * its row unresolved rather than being fuzzy-matched to the nearest candidate: a
 * wrong edge is a fabricated statement about what one court said of another.
 * Unresolved rows are kept because they measure corpus coverage.
 *
 * `relationship` and `evidence` travel together. Where the court printed an
 * annotation — "– overruled", "– relied on" — the relationship is recorded WITH
 * the phrase that justifies it, so any row can be audited back to its own text.
 * The check constraint lives in migrations 0008 and 0010, not in a pgEnum,
 * because that is how it was shipped.
 */
export const judgmentCitations = pgTable(
  'judgment_citations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    citingJudgmentId: uuid('citing_judgment_id')
      .notNull()
      .references(() => judgments.id, { onDelete: 'cascade' }),
    /** Null when the citation did not resolve. Never guessed. */
    citedJudgmentId: uuid('cited_judgment_id').references(() => judgments.id, {
      onDelete: 'set null',
    }),
    citationText: text('citation_text').notNull(),
    normalisedCitation: text('normalised_citation').notNull(),
    /** cites | followed | distinguished | doubted | overruled | overruled_in_part */
    relationship: text('relationship').notNull().default('cites'),
    /** The court's own phrase that justified the relationship. Auditable. */
    evidence: text('evidence'),
    charOffset: integer('char_offset').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('judgment_citations_unique_edge').on(t.citingJudgmentId, t.normalisedCitation),
    index('judgment_citations_citing_idx').on(t.citingJudgmentId),
    index('judgment_citations_cited_idx').on(t.citedJudgmentId),
    index('judgment_citations_cited_relationship_idx').on(t.citedJudgmentId, t.relationship),
    index('judgment_citations_unresolved_idx').on(t.normalisedCitation),
  ],
);

/**
 * Highlight and save, PD-9 item 3.
 *
 * Two paragraph fields because they answer different questions and diverge. A
 * re-ingest can move a paragraph's POSITION, and an annotation that followed the
 * index would silently relocate to a different passage of the same judgment —
 * nothing errors, the note is simply attached to the wrong law.
 */
export const judgmentAnnotations = pgTable(
  'judgment_annotations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    judgmentId: uuid('judgment_id')
      .notNull()
      .references(() => judgments.id, { onDelete: 'cascade' }),
    matterId: uuid('matter_id').references(() => matters.id, { onDelete: 'set null' }),
    /** What the court PRINTED. Null on every pre-1990s scan. The citable anchor. */
    paragraphNumber: integer('paragraph_number'),
    /** Position in the rendered array. Never citable. */
    paragraphIndex: integer('paragraph_index').notNull(),
    quote: text('quote').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete: what an advocate had marked, and when, is asked later. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('judgment_annotations_user_judgment_idx').on(t.userId, t.judgmentId),
    index('judgment_annotations_matter_idx').on(t.matterId),
  ],
);

/**
 * Subject following — an in-app feed, never a notification.
 *
 * **There is deliberately no `notified_at` and no delivery state.** PD-5 excludes
 * subject-following from notifications entirely — *"that is discovery, not an
 * alert; it belongs in the app, never in a notification"* — and a column for
 * delivery would invite one to be built. PD-6 is why it matters: advocates who
 * disable notifications lose their hearing reminders with them.
 *
 * `last_seen_at` is what makes a feed a feed: anything newer is unseen.
 */
export const savedSearches = pgTable(
  'saved_searches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    queryText: text('query_text').notNull(),
    /** en | hi — check constraint in migration 0009. */
    queryLanguage: text('query_language').notNull().default('en'),
    filters: jsonb('filters'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('saved_searches_user_idx').on(t.userId),
    index('saved_searches_last_seen_idx').on(t.userId, t.lastSeenAt),
  ],
);

/**
 * What we hold, against what the source has. One row per source.
 *
 * A library rendered as complete when it is not **misstates what we hold**, and an
 * advocate searching for an Act we have not reached concludes we do not have it.
 * Same argument as `truncated` on the precedent graph.
 *
 * `source_total` is what the SOURCE reports — read from its own index at
 * enumeration — never a number anyone typed, and **null until an enumeration has
 * run**: unknown is a state, not zero. The count of what we hold is recomputed on
 * read from the real tables and never cached here, because a stale count is
 * exactly the lie this table exists to prevent.
 */
export const corpusCoverage = pgTable('corpus_coverage', {
  source: text('source').primaryKey(),
  /** Null until an enumeration has run. Unknown is a state, not zero. */
  sourceTotal: integer('source_total'),
  /** When the source was last enumerated — distinct from when rows were written. */
  enumeratedAt: timestamp('enumerated_at', { withTimezone: true }),
  /** True only when a full pass finished with no failures. */
  complete: boolean('complete').notNull().default(false),
  /** Named, never merely counted — an unauditable gap is not a known gap. */
  failedIds: text('failed_ids')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------- eCourts under the registrar's grant -- */

/**
 * Maintenance mode, the kill switches, and feature flags. One row per key —
 * current state only; history lives in `audit_log`, which is the point.
 *
 * Created in migration 0013 rather than S0. It was one of SPRINT_0's ten deferred
 * tables, and it is pulled forward because the eCourts adapter needs a switch that
 * defaults off and the correct switch is the one the admin surface already
 * specifies, not a second mechanism invented alongside it.
 *
 * **There is no write path in this sprint.** `POST /admin/platform/kill-switches/:key`
 * is S6 and still SPECCED. Until it exists, this row moves only by a deliberate
 * statement from someone with database access — which also means such a change is
 * NOT in `audit_log`, because the transaction that would have written it does not
 * exist yet. Stated rather than papered over.
 */
export const platformConfig = pgTable('platform_config', {
  key: text('key').primaryKey(),
  kind: platformConfigKindEnum('kind').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  /** Flags only, 0–100. */
  rolloutPercent: integer('rollout_percent'),
  /** Maintenance only. */
  message: text('message'),
  /** NOT NULL for `kind = 'kill_switch'`, by check constraint. */
  reason: text('reason'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-court cause-list scrape health.
 *
 * `ok` and `empty` are different facts and the check constraints keep them apart:
 * a court genuinely has no listings some days, and reading that as a parser
 * failure — or a parser failure as an empty day — is the same error class as
 * confusing `miss` with `not_attempted` on the verification sheet.
 */
export const causeListSyncs = pgTable(
  'cause_list_syncs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    court: text('court').notNull(),
    listDate: date('list_date').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    itemCount: integer('item_count').notNull().default(0),
    status: causeListStatusEnum('status').notNull(),
    retryCount: integer('retry_count').notNull().default(0),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => [
    uniqueIndex('cause_list_syncs_court_list_date_key').on(t.court, t.listDate),
    index('cause_list_syncs_list_date_status_idx').on(t.listDate.desc(), t.status),
  ],
);

/**
 * Every request made under the registrar's authorisation — and every one refused.
 *
 * Permission arrives with conditions: volume, frequency, hours, attribution. This
 * table is what makes "did we stay inside the grant" answerable by query rather
 * than by memory. Refusals are recorded too, because its other job is to show
 * that the switch and the limiter actually held.
 *
 * The rate limiter counts rows here, not an in-memory counter: a restart must not
 * hand us a fresh quota we were not granted.
 */
export const ecourtsFetchLedger = pgTable(
  'ecourts_fetch_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    court: text('court'),
    endpoint: text('endpoint').notNull(),
    outcome: ecourtsFetchOutcomeEnum('outcome').notNull(),
    httpStatus: integer('http_status'),
    durationMs: integer('duration_ms'),
    /** Which transcription of the grant was in force. Amendments must be distinguishable. */
    authorisationReference: text('authorisation_reference'),
    /** Set on `refused`, null otherwise: which lock stopped it. */
    refusalReason: text('refusal_reason'),
    causeListSyncId: uuid('cause_list_sync_id').references(() => causeListSyncs.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('ecourts_fetch_ledger_requested_at_idx').on(t.requestedAt.desc()),
    index('ecourts_fetch_ledger_court_requested_at_idx').on(t.court, t.requestedAt.desc()),
  ],
);

/**
 * The citation fan-out — **one implementation, two triggers.**
 *
 * When a judgment's overruled status changes, the work is identical whether an
 * admin upheld a dispute or the nightly re-check noticed it. `ADMIN_SURFACE.md`
 * §15: *"Do not build a second fan-out. Two implementations would drift, and the
 * one that drifts is the one that stops notifying."*
 *
 * **The counts are nullable and that is load-bearing.** Null means the population
 * was never enumerated; 0 means it was enumerated and was empty. `citation_copies`
 * is still deferred, so `copiedCount` is null on every row written today — writing
 * 0 would assert that nobody copied the citation out of the app, which is a claim
 * nothing supports. An absent check is not a negative result.
 */
export const citationFanouts = pgTable(
  'citation_fanouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    judgmentId: uuid('judgment_id')
      .notNull()
      .references(() => judgments.id),
    trigger: citationFanoutTriggerEnum('trigger').notNull(),
    /** The dispute or recheck id. Null for an ingest-time flip, which has none. */
    triggerRef: uuid('trigger_ref'),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    status: citationFanoutStatusEnum('status').notNull().default('pending'),
    saved: integer('saved_count'),
    filed: integer('filed_count'),
    copied: integer('copied_count'),
    notified: integer('notified_count'),
    /**
     * `sha256(judgment_id || to_status || trigger || trigger_ref)`, unique.
     *
     * What makes a double-uphold, or an uphold racing the nightly re-check, safe:
     * the second insert loses and nobody is told twice. Being told the same
     * authority moved twice is how an advocate learns to ignore the notification
     * that matters.
     */
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('citation_fanouts_status_created_at_idx').on(t.status, t.createdAt),
    index('citation_fanouts_judgment_id_idx').on(t.judgmentId),
  ],
);

/**
 * **The advocate at highest risk.** Somebody who copies a citation into their own
 * Word document has taken it out of the app entirely — they saw the badge, they
 * may file it, and without this row **no notification can ever reach them** when
 * the law moves.
 *
 * `client_key` is per TAP, not per citation. Copy works offline and queues
 * through the outbox, so the same request can arrive twice; but the same citation
 * copied a week apart is two real events an advocate may need warning about
 * twice. A content hash would silently merge them and lose a warning.
 */
export const citationCopies = pgTable(
  'citation_copies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    judgmentId: uuid('judgment_id')
      .notNull()
      .references(() => judgments.id),
    matterId: uuid('matter_id').references(() => matters.id),
    citationCheckId: uuid('citation_check_id').references(() => citationChecks.id),
    /** TEXT, not the enum: a record of what was SHOWN must survive the enum growing. */
    overruledStatusAtCopy: text('overruled_status_at_copy').notNull(),
    surface: citationSurfaceEnum('surface').notNull(),
    copiedAt: timestamp('copied_at', { withTimezone: true }).notNull().defaultNow(),
    clientKey: text('client_key').notNull(),
  },
  (t) => [
    uniqueIndex('citation_copies_user_client_key_unique').on(t.userId, t.clientKey),
    index('citation_copies_judgment_id_idx').on(t.judgmentId),
    index('citation_copies_user_copied_at_idx').on(t.userId, t.copiedAt.desc()),
  ],
);

/**
 * Citator alerts — PD-5/PD-6. Only kinds 1 and 2 have a producer today
 * (`applyOverruledChange`); triggers 3 (own-matter judgment, awaits OCR) and 4
 * (unknown listing, awaits a cause-list-to-matter matcher) have no code that
 * writes here yet. See `0019_alerts.sql` for why.
 *
 * `payload` stores FACTS about the event (fromStatus/toStatus at the time it
 * happened), never composed copy and never the judgment's CURRENT status —
 * `overruled_status` is never cached, so any surface rendering the judgment
 * itself re-reads it live.
 */
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: alertKindEnum('kind').notNull(),
    severity: alertSeverityEnum('severity').notNull(),
    judgmentId: uuid('judgment_id').references(() => judgments.id),
    matterId: uuid('matter_id').references(() => matters.id),
    fanoutId: uuid('fanout_id').references(() => citationFanouts.id),
    payload: jsonb('payload').notNull(),
    /** `sha256(fanoutId || kind || userId)` for kinds 1/2 — one alert per user per event. */
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('alerts_user_dedupe_unique').on(t.userId, t.dedupeKey),
    index('alerts_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('alerts_user_unread_idx')
      .on(t.userId)
      .where(sql`${t.readAt} IS NULL`),
  ],
);

/**
 * **The trust feedback loop. Outranks everything else in the admin.**
 *
 * Documented in `SCHEMA_TRUTH.md` and referenced throughout `ADMIN_SURFACE.md`
 * and `API_CONTRACTS.md` since before this table existed — `citationFanouts`'s
 * trigger enum carried `dispute_upheld` from its own first migration (0016).
 * No migration ever created this table until `0020_disputes_and_ocr_jobs.sql`
 * (8 Aug 2026), which `admin/disputes.ts` surfaced by being the first code to
 * query it.
 *
 * Upholding is a FAN-OUT WRITE, not a status change: it calls the same
 * `applyOverruledChange` the nightly re-check calls. This table only records
 * the dispute's own lifecycle.
 */
export const citationDisputes = pgTable(
  'citation_disputes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportedByUserId: uuid('reported_by_user_id')
      .notNull()
      .references(() => users.id),
    citationCheckId: uuid('citation_check_id').references(() => citationChecks.id),
    judgmentId: uuid('judgment_id').references(() => judgments.id),
    claim: text('claim').notNull(),
    status: disputeStatusEnum('status').notNull().default('open'),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /** The field-level fix written to the corpus — jsonb, not typed columns. */
    correction: jsonb('correction'),
    fanoutId: uuid('fanout_id').references(() => citationFanouts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('citation_disputes_status_created_at_idx').on(t.status, t.createdAt),
    index('citation_disputes_judgment_id_idx').on(t.judgmentId),
  ],
);

/**
 * **"`confirmed_by_user` gates use. OCR output is never trusted silently."**
 * Nothing derived from a job is written to a matter until
 * `POST /ocr/jobs/:id/confirm` (still SPECCED) is called. Same history as
 * `citationDisputes` above — documented since before it existed, created in
 * `0020_disputes_and_ocr_jobs.sql`.
 */
export const ocrJobs = pgTable(
  'ocr_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    matterId: uuid('matter_id').references(() => matters.id),
    sourceType: ocrSourceTypeEnum('source_type').notNull(),
    storageKey: text('storage_key').notNull(),
    engine: ocrEngineEnum('engine').notNull(),
    detectedScript: text('detected_script').array(),
    status: ocrJobStatusEnum('status').notNull(),
    extractedText: text('extracted_text'),
    extractedFields: jsonb('extracted_fields'),
    confidenceOverall: numeric('confidence_overall', { precision: 4, scale: 3 }),
    lowConfidenceBlocks: jsonb('low_confidence_blocks'),
    confirmedByUser: boolean('confirmed_by_user').notNull().default(false),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('ocr_jobs_user_id_status_idx').on(t.userId, t.status),
    index('ocr_jobs_matter_id_idx').on(t.matterId),
  ],
);

/**
 * DPDP Act obligations — "a visible clock per request." Same discovery as
 * `citationDisputes`/`ocrJobs`: documented in `SCHEMA_TRUTH.md`, never created
 * by any migration until `admin/data-requests.ts` (8 Aug 2026) queried it
 * against real Postgres. Created in `0021_data_requests.sql`.
 */
export const dataRequests = pgTable(
  'data_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: dataRequestKindEnum('kind').notNull(),
    status: dataRequestStatusEnum('status').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    refusalReason: text('refusal_reason'),
    artefactStorageKey: text('artefact_storage_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('data_requests_status_due_at_idx').on(t.status, t.dueAt)],
);

/**
 * **PD-3 — sharing is per matter, by invitation.** The owner invites a named
 * person to a specific case, the way a file is handed over.
 *
 * There is no chamber-wide switch and there must never be one: Indian chambers
 * work case-by-case, and chamber-wide default sharing is a conflicts hazard —
 * two advocates in one chamber can be on opposing sides of related matters.
 *
 * **Revocation is a timestamp, never a delete.** "Who had sight of this matter,
 * and when" is exactly what a conflicts challenge asks, possibly years later.
 */
export const matterShares = pgTable(
  'matter_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matterId: uuid('matter_id')
      .notNull()
      .references(() => matters.id, { onDelete: 'cascade' }),
    /** Null until the invitee has an account — the share survives that gap. */
    invitedUserId: uuid('invited_user_id').references(() => users.id),
    /** Enrolment number or phone, AS TYPED — what the owner believed they shared with. */
    invitedIdentifier: text('invited_identifier').notNull(),
    grantedByUserId: uuid('granted_by_user_id')
      .notNull()
      .references(() => users.id),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: uuid('revoked_by_user_id').references(() => users.id),
  },
  (t) => [index('matter_shares_invited_user_idx').on(t.invitedUserId, t.revokedAt)],
);

/**
 * Training-consent history — **append-only, and the reason the live columns on
 * `users` are allowed to be reset to NULL on withdrawal.**
 *
 * Grants and withdrawals both land here. "Did this advocate ever consent, to
 * what version, and when did they change their mind" is answerable by query
 * rather than by memory — while the *current* answer stays a single column pair
 * with two states rather than three columns with six.
 *
 * Nothing updates a row here. A correction is another row.
 */
export const trainingConsentEvents = pgTable(
  'training_consent_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `granted` | `withdrawn`. A CHECK constraint in migration 0025 is the authority. */
    action: text('action').notNull(),
    /** Null on withdrawal — you withdraw from whatever you had, and naming a version there
     *  would invent a fact. */
    version: text('version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('training_consent_events_user_idx').on(t.userId, t.createdAt)],
);
