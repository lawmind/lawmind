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
  'ecourts',
  'none',
]);

export const citationSurfaceEnum = pgEnum('citation_surface', [
  'search',
  'judgment_detail',
  'briefing',
  'draft',
  'matter',
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
  // PD-8 — consent replaces the AI-assisted mark. Set together at onboarding,
  // never back-filled. An unset pair means consent was not given, and the app
  // must be able to see that state.
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  termsVersion: text('terms_version'),
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
    // Set where the source was a scan. Retrieval down-ranks low-confidence text.
    ocrConfidence: numeric('ocr_confidence', { precision: 4, scale: 3 }),
  },
  (t) => [
    index('judgment_chunks_embedding_idx').using('ivfflat', t.embedding.op('vector_cosine_ops')),
    index('judgment_chunks_judgment_id_idx').on(t.judgmentId),
    uniqueIndex('judgment_chunks_judgment_id_chunk_index_key').on(t.judgmentId, t.chunkIndex),
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
