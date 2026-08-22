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
  primaryKey,
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
/**
 * `source_metadata`: the court's own filed petitioner/respondent fields,
 * present on `SciMetadataRow` (Supreme Court) — `services/ingest/src/
 * parties.ts`. `title_parsed`: deterministic `case_title` separator
 * splitting, the only method available for every held High Court row.
 * `unknown`: neither method found a usable value. Never a fourth,
 * LLM-derived value — `docs/ai/LEGAL_STRUCTURE.md` §Parties.
 */
export const partiesExtractionMethodEnum = pgEnum('parties_extraction_method', [
  'source_metadata',
  'title_parsed',
  'unknown',
]);
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
  'concordance',
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
  /**
   * `advocate` | `admin` — migration `0074`, and the ONLY thing in this schema
   * that grants permission.
   *
   * **Deny-by-default lives in the DEFAULT.** A row created by any path is an
   * advocate; becoming an admin takes a deliberate write through
   * `admin/role-cli.ts`, which lands an `audit_log` row in the same transaction.
   *
   * Nothing reads this to decide PRODUCT entitlement. PD-2 is explicit that
   * enrolment is a credential and not a gate, and the same holds here: this
   * gates `/admin/*` and nothing else.
   */
  role: text('role').notNull().default('advocate'),
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
    /**
     * The judges who sat, as the source printed them. NULL where the source
     * publishes none — which is every High Court row we hold, the plain
     * metadata variant carrying no judge field at all.
     *
     * **Never a court code.** Migration `0040` moved 40,705 rows' worth of
     * S3 partition key out of here into `sourceBenchCode` below; until then
     * half the corpus rendered `patnahcucisdb94` where the coram belongs.
     */
    bench: text('bench'),
    /**
     * Migration `0040`. The source's own court-establishment code, verbatim —
     * the AWS High Court bucket's `bench=` partition key. Provenance, and never
     * a coram. NULL on Supreme Court rows, which have no such partition.
     */
    sourceBenchCode: text('source_bench_code'),
    /**
     * Migration `0042`. What KIND of document a High Court row is — DERIVED
     * from `disposal_nature` and text length, never a legal weight and never a
     * claim about precedential authority. NULL where no rule claimed it, which
     * is 26.4% of the corpus and deliberate: `disposal_nature = 'DISPOSED'`
     * covers a reasoned decision, a consent order and an infructuous closure
     * alike. `docs/ai/HC_CORPUS_QUALITY.md`.
     */
    hcDocumentClass: text('hc_document_class'),
    /** Which classification rule fired, including why a row was left unclassified. */
    hcClassMethod: text('hc_class_method'),
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
    /**
     * The R2 key holding this judgment's brotli-compressed TEXT — Tier 3 of
     * `docs/CORPUS_TIERING.md` §3. **A key, never a URL**, so the bucket,
     * account and endpoint can change without rewriting 15.9M rows.
     *
     * **Not the PDF.** `sourceUrl` already points at the public CC-BY-4.0 AWS
     * bucket, which is permanent and paid for by somebody else; we store a
     * pointer into it and never a copy of it.
     *
     * NULL means "not tiered out" — a real and permanent state for the 38,341
     * Supreme Court judgments held hot in Postgres, not a missing value.
     */
    storageKey: text('storage_key'),
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
    // sha256 of full_text. Two rows sharing a hash are the same text under two
    // different source_urls — source_url uniqueness cannot catch that.
    // Migration 0031. NULL means not yet computed, not "no duplicate".
    contentHash: text('content_hash'),
    // The same measured proxy as judgment_chunks.textQuality, at the judgment
    // level. Never accuracy — visible damage only. Migration 0031.
    textQuality: numeric('text_quality', { precision: 4, scale: 3 }),
    // Verbatim from the source's own order_type column, where the source
    // publishes one. Never classified, never guessed — DOMAIN_TRUTH.md.
    // Migration 0031.
    sourceDocumentType: text('source_document_type'),
    /**
     * The eCourts Case Number Record — the canonical cross-source identity
     * key, and what eCourts itself resolves (`docs/DATA_ADVANTAGE.md`). Found
     * present in BOTH source metadata schemas (`SciMetadataRow.cnr`,
     * `HcMetadataRow.cnr`) and read by neither mapper into `JudgmentRecord`
     * until migration 0034 — silently discarded for the entire corpus, SC
     * and HC alike. Line 378's own note named the gap this column exists to
     * close: "citation-level identity across sources... belongs to S2."
     * Verbatim from source, never derived — a court that omits it leaves this
     * NULL rather than a fabricated value.
     */
    cnr: text('cnr'),
    /**
     * Whether the source PDF had a usable text layer, computed at fetch
     * time from characters-extracted / page-count against a 100-char/page
     * floor — `services/ingest/src/text.ts`'s `isNativeText`, the same
     * classifier already proven against real High Court PDFs in the
     * extraction-cost benchmark, only newly wired to persist. Migration
     * `0035`. NULL means not computed — every row that predates this
     * migration, since recovering it needs the source PDF re-fetched, not
     * just re-read from already-stored text. Never guessed.
     * `docs/ai/AWS_CORPUS_INVENTORY.md` §6.
     */
    nativeText: boolean('native_text'),
    /**
     * `services/ingest/src/parties.ts`. NULL on every row until the migration
     * `0037` backfill runs — never guessed, never derived from `full_text`.
     * `caseTitle` remains the source of truth for display; these are a
     * queryable, structured VIEW of it (or, for Supreme Court rows, the
     * court's own filed fields — stronger evidence than a title split).
     */
    petitioner: text('petitioner'),
    respondent: text('respondent'),
    partiesExtractionMethod: partiesExtractionMethodEnum('parties_extraction_method'),
    /**
     * Verbatim from the source's own `disposal_nature` field — present on
     * BOTH `SciMetadataRow` (required, e.g. "Appeal(s) allowed", "Dismissed")
     * and `HcMetadataRow` (optional, e.g. "DISMISS FOR NON-PROSECUTION") and
     * read by neither mapper before migration `0038` — the same class of gap
     * `cnr` and `petitioner`/`respondent` were found to be. Never classified
     * into disposed/pending or judgment/order here — `docs/ai/
     * HC_CORPUS_CHARACTERIZATION.md` §11 named that as separate, harder,
     * not-yet-designed work. Migration `0038`.
     */
    disposalNature: text('disposal_nature'),
  },
  (t) => [
    index('judgments_full_text_idx').using('gin', t.fullTextTsv),
    index('judgments_judgment_date_idx').on(t.judgmentDate),
    index('judgments_court_idx').on(t.court),
    // Arrival-order pagination for the paragraph-coverage backfill (NEW2, bus
    // 0461): `judgments.id` is uuid v4, so a persisted id watermark would skip
    // newly-harvested rows landing below it — `created_at` is monotonic and
    // safe to page by. Without this index, ORDER BY created_at sorts 3.2M rows
    // per page. Migration 0050.
    index('judgments_created_at_idx').on(t.createdAt),
    // Partial: finding the tiered-out rows is the whole point, and the NULLs
    // are the majority for as long as Tier 1 exists.
    index('judgments_storage_key_idx')
      .on(t.storageKey)
      .where(sql`storage_key IS NOT NULL`),
    // Partial: a dedup lookup is the only query this serves.
    index('judgments_content_hash_idx')
      .on(t.contentHash)
      .where(sql`content_hash IS NOT NULL`),
    // Partial, not unique: data quality across 25+ courts is not yet proven
    // clean enough to enforce uniqueness without risking a rejected ingest
    // write on a legitimate edge case — the same caution already applied to
    // content_hash above.
    index('judgments_cnr_idx')
      .on(t.cnr)
      .where(sql`cnr IS NOT NULL`),
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
    /**
     * Character offset/length of this chunk's own BODY (overlap excluded) in
     * `judgments.full_text` — migration 0046. `judgments.full_text.slice(
     * charOffset, charOffset + charLength)` is the exact span this chunk rests
     * on, verbatim by construction. NULL on rows embedded before this column
     * existed and not yet backfilled (`backfill-offsets-cli.ts`) — NULL means
     * "unavailable", never "no span exists"; a reader must fall back to the
     * located paragraph, never invent an offset.
     */
    charOffset: integer('char_offset'),
    charLength: integer('char_length'),
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

/**
 * Amendment events, parsed out of `statute_sections.footnote` — migration
 * `0041`, Stage 8's point-in-time foundation.
 *
 * The footnotes were ingested on the first pass and never read. 18,590 events
 * across 9,064 footnoted sections; `docs/ai/STATUTE_TEMPORAL_STAGE8.md` holds
 * the measurements and the extractor's rules.
 *
 * **Not a version history of the text.** indiacode publishes only the current
 * wording; knowing a clause was substituted is not knowing what it said before.
 * `substitutedText` is the fragment the note happens to quote, verbatim, and is
 * never assembled into a reconstructed provision.
 */
export const statuteAmendments = pgTable(
  'statute_amendments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    statuteSectionId: uuid('statute_section_id')
      .notNull()
      .references(() => statuteSections.id, { onDelete: 'cascade' }),
    /** The footnote's own printed number, so a row traces back to its note. */
    ordinal: integer('ordinal').notNull(),
    eventType: text('event_type').notNull(),
    /** Verbatim, including a state prefix. NEVER resolved to a jurisdiction. */
    amendingActRaw: text('amending_act_raw'),
    amendingActNumber: integer('amending_act_number'),
    amendingActYear: integer('amending_act_year'),
    amendingSection: text('amending_section'),
    /** NULL where the note states none — never the amending Act's year instead. */
    effectiveDate: date('effective_date'),
    substitutedText: text('substituted_text'),
    ibidResolved: boolean('ibid_resolved').notNull().default(false),
    /** Kept as a state. Reaching forward for an Act would be a wrong answer. */
    ibidUnresolved: boolean('ibid_unresolved').notNull().default(false),
    verbatim: text('verbatim').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('statute_amendments_section_ordinal_key').on(t.statuteSectionId, t.ordinal),
    index('statute_amendments_effective_date_idx').on(t.effectiveDate),
    index('statute_amendments_amending_act_idx').on(t.amendingActYear, t.amendingActNumber),
  ],
);

/**
 * A footnote entry the extractor could not read.
 *
 * 596 of them, and they are overwhelmingly editorial cross-references —
 * *"See now the Arbitration Act, 1940"*. Recorded rather than dropped so that
 * "how much did we fail to read" is a query: the silent-drop rule from
 * `docs/CITATION_HARNESS.md`, applied to statutes.
 */
export const statuteAmendmentUnparsed = pgTable(
  'statute_amendment_unparsed',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    statuteSectionId: uuid('statute_section_id')
      .notNull()
      .references(() => statuteSections.id, { onDelete: 'cascade' }),
    verbatim: text('verbatim').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('statute_amendment_unparsed_section_idx').on(t.statuteSectionId)],
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

/**
 * Coverage per court per year — what EXISTS at the source, against what we hold.
 *
 * A different GRAIN from {@link corpusCoverage}, not a replacement. That table is
 * keyed on `source` and answers *"has this source been fully enumerated"*; it
 * cannot express *"Allahabad, 2024"* without encoding two dimensions into one
 * text key, which would make counting by court and counting by year both
 * unanswerable.
 *
 * **`sourceDocuments` counts DOCUMENTS, not judgments.** `docs/HC_CORPUS_SURVEY.md`:
 * the judgment share of the AWS High Court bucket is a measured **range, 0.75%
 * to 18.64%**, because the only available label — `order_type`, published by
 * four of twenty-five courts — carries a `View Judgement/Order` value on 17.89%
 * of rows that does not distinguish the two. **A column named `sourceJudgments`
 * would be a number nobody measured.**
 *
 * **What we hold is NOT stored.** It is derived at query time from `judgments`,
 * exactly as `/statutes` derives `held`. A cached count drifts the moment an
 * ingest writes a row, and a coverage figure that is stale in the *reassuring*
 * direction is worse than no figure at all.
 */
export const judgmentCoverage = pgTable(
  'judgment_coverage',
  {
    source: text('source').notNull(),
    /** The source's own code, e.g. `9_13` — the only stable join back to its partitions. */
    courtCode: text('court_code').notNull(),
    /** As published by the source. Stored so a rendered gap needs no mapping table. */
    courtName: text('court_name').notNull(),
    year: integer('year').notNull(),
    sourceDocuments: integer('source_documents').notNull(),
    /** When the SOURCE was counted — distinct from when this row was written. */
    enumeratedAt: timestamp('enumerated_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.courtCode, t.year] }),
    index('judgment_coverage_court_idx').on(t.source, t.courtName),
    index('judgment_coverage_year_idx').on(t.source, t.year),
  ],
);

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
 * What a source published, as it published it. **Append-only, enforced by a
 * trigger in migration 0061 — an UPDATE or DELETE raises.**
 *
 * Deliberately has no foreign key to `judgments`, not even a nullable one. A
 * cause-list entry and a next-hearing date are registry bookkeeping; `judgments`
 * is the population the retrieval lane treats as authority. A nullable link is
 * an invitation to backfill one, and once embeddings and citation edges are
 * built over registry rows there is no undo.
 *
 * `observationKind` has no `hearing_occurred` value and must never gain one.
 * eCourts publishes listings, not attendance — *a listing is not a hearing* —
 * and a hearing having happened is only ever evidenced by a later artefact.
 * The CHECK constraint makes minting one impossible rather than detectable.
 *
 * Provenance is four NOT NULL columns, because a row we cannot place inside the
 * registrar's grant is a row we cannot defend. `conditionsVersion` is the
 * fingerprint from `authorisation.ts`, which survives a renewal that narrows
 * the terms in a way the letter's own reference would not.
 */
export const ecourtsObservation = pgTable(
  'ecourts_observation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    observationKind: text('observation_kind').notNull(),
    source: text('source').notNull().default('ecourts'),
    /** When WE fetched it. */
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * The date the SOURCE puts on the fact, where it states one. Separate from
     * `observedAt` so a late or out-of-order fetch cannot move live state
     * backwards — a Wednesday fetch returning Monday's page is still Monday.
     */
    sourceAssertedAt: timestamp('source_asserted_at', { withTimezone: true }),
    court: text('court').notNull(),
    courtCode: text('court_code'),
    cnr: text('cnr'),
    caseNumber: text('case_number'),
    caseYear: integer('case_year'),
    caseType: text('case_type'),
    listingDate: date('listing_date'),
    nextListingDate: date('next_listing_date'),
    disposalDate: date('disposal_date'),
    caseStatus: text('case_status'),
    bench: text('bench'),
    courtNumber: text('court_number'),
    itemNumber: integer('item_number'),
    orderRef: text('order_ref'),
    payload: jsonb('payload').notNull(),
    /** Over the bytes as received, before parsing — a parser change must not renumber history. */
    payloadSha256: text('payload_sha256').notNull(),
    endpoint: text('endpoint').notNull(),
    grantDataType: text('grant_data_type').notNull(),
    conditionsVersion: text('conditions_version').notNull(),
    fetchLedgerId: uuid('fetch_ledger_id')
      .notNull()
      .references(() => ecourtsFetchLedger.id),
    /**
     * `partial` and `unreadable` rows are still written and still counted. They
     * are never promoted into a transition. An observation we could not read is
     * not an observation that did not happen — same rule as an unverified
     * citation, which is shown and never silently dropped.
     */
    extractionState: text('extraction_state').notNull().default('parsed'),
    extractionNote: text('extraction_note'),
  },
  (t) => [
    index('ecourts_observation_observed_at_idx').on(t.observedAt.desc()),
    // Not unique: a repeated identical page is evidence the court said the same
    // thing again, which is a different fact from us not having asked.
    index('ecourts_observation_payload_sha256_idx').on(t.payloadSha256),
  ],
);

/**
 * The CHANGE between two observations — a hearing moved, a bench changed, an
 * order appeared. **The change is the product**, not the snapshot.
 *
 * Stored rather than derived on read, for two reasons that outweigh the
 * redundancy: raw payloads will be pruned on a retention schedule and the
 * transitions they evidence must outlive them; and notification is at-most-once,
 * so *"did we already tell the advocate"* has to be answerable from a row.
 *
 * `first_observation` is a kind of its own because seeing an attribute for the
 * first time is not a change, and `listing_removed` is not a disposal.
 */
export const ecourtsTransition = pgTable(
  'ecourts_transition',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transitionKind: text('transition_kind').notNull(),
    court: text('court').notNull(),
    cnr: text('cnr'),
    caseNumber: text('case_number'),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    fromObservationId: uuid('from_observation_id').references(() => ecourtsObservation.id, {
      onDelete: 'set null',
    }),
    toObservationId: uuid('to_observation_id').references(() => ecourtsObservation.id, {
      onDelete: 'set null',
    }),
    /** Says the evidence is gone, so a NULL id is never read as "never had any". */
    evidencePrunedAt: timestamp('evidence_pruned_at', { withTimezone: true }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    derivedAt: timestamp('derived_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Late-binding by design. A transition is observed before any advocate has a
     * matter for it, and the matter may be created weeks later.
     */
    matterId: uuid('matter_id').references(() => matters.id, { onDelete: 'set null' }),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  (t) => [
    index('ecourts_transition_cnr_idx').on(t.cnr, t.occurredAt.desc()),
    index('ecourts_transition_matter_idx').on(t.matterId, t.occurredAt.desc()),
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
 * Authorities saved to a matter. Migration `0032`, 11 Aug 2026 — the feature
 * `matters/route.ts`'s own header comment already described without anything
 * behind it. Mirrors `matterShares`: removal is a timestamp, never a delete.
 */
export const matterAuthorities = pgTable(
  'matter_authorities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matterId: uuid('matter_id')
      .notNull()
      .references(() => matters.id, { onDelete: 'cascade' }),
    judgmentId: uuid('judgment_id')
      .notNull()
      .references(() => judgments.id),
    addedByUserId: uuid('added_by_user_id')
      .notNull()
      .references(() => users.id),
    /** Null when the calling surface had no citation_checks row — never invented. */
    citationCheckId: uuid('citation_check_id').references(() => citationChecks.id),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedByUserId: uuid('removed_by_user_id').references(() => users.id),
  },
  (t) => [
    // One live authority per (matter, judgment) — re-adding is idempotent.
    uniqueIndex('matter_authorities_live_key')
      .on(t.matterId, t.judgmentId)
      .where(sql`removed_at IS NULL`),
    index('matter_authorities_judgment_idx').on(t.judgmentId),
  ],
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

/**
 * One row per judge per judgment — because `bench` is a LIST.
 *
 * Measured before building: 4,846 of 38,325 judgments name more than one judge
 * in a single comma-delimited `bench` string, up to nine. A trigram index on
 * that raw column filters correctly and makes **facets and counts wrong**:
 * `D.Y. CHANDRACHUD` appears 572 times as a *sole* bench while having sat on
 * many more, and `ARIJIT PASAYAT, S.B. SINHA` faces as a different judge from
 * `ARIJIT PASAYAT`. The 1,717 distinct values are bench COMPOSITIONS, not
 * judges — so "how many judgments did this judge decide" is unanswerable from
 * that column, and advocates ask it constantly.
 *
 * Migration `0026_structured_search.sql` is the authority on the indexes.
 */
export const judgmentJudges = pgTable(
  'judgment_judges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    judgmentId: uuid('judgment_id')
      .notNull()
      .references(() => judgments.id, { onDelete: 'cascade' }),
    /** As printed in `bench`, trimmed. Kept verbatim — the advocate should see the reporter's spelling. */
    judgeName: text('judge_name').notNull(),
    /**
     * Upper-cased with punctuation and spacing removed: `S.K. DAS` and
     * `S. K. DAS` both become `SKDAS`. **Matching only, never displayed.**
     *
     * Deliberately NOT an identity. Two spellings collapsing to one key is a
     * match; deciding two different keys are the same person is a judgement
     * about a human being, and this table does not make it. There is no
     * `judge_id`, and adding one needs evidence rather than a similarity score.
     */
    judgeKey: text('judge_key').notNull(),
    /** 0-based position in the printed bench; the presiding judge is listed first by convention. */
    seatIndex: integer('seat_index').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('judgment_judges_judgment_key').on(t.judgmentId, t.judgeKey),
    index('judgment_judges_judgment_id_idx').on(t.judgmentId),
    index('judgment_judges_key_idx').on(t.judgeKey),
  ],
);

/**
 * Which statutory sections a judgment actually refers to.
 *
 * 845 acts and 34,928 sections are already ingested; this link was not, so
 * *"cases on section 138 NI Act"* — the archetypal advocate query — had no
 * answer at all.
 *
 * **`statuteId` is nullable on purpose and the rule is strict: a section
 * reference with no identifiable act is NOT recorded.** A bare "section 5" is as
 * likely to be a clause of a contract or of the judgment's own scheme as a
 * statutory provision, and guessing a default act would put confident wrong rows
 * into the index — worse than an empty one, because an empty index is visibly
 * empty.
 */
export const judgmentStatuteRefs = pgTable(
  'judgment_statute_refs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    judgmentId: uuid('judgment_id')
      .notNull()
      .references(() => judgments.id, { onDelete: 'cascade' }),
    statuteId: uuid('statute_id').references(() => statutes.id, { onDelete: 'set null' }),
    /** The act as named IN THE JUDGMENT, e.g. `NI Act`. Kept even when it resolves. */
    actNamed: text('act_named').notNull(),
    /** Text, not integer: sections carry letters (`302A`, `63A`). */
    sectionNumber: text('section_number').notNull(),
    /** A section mentioned once in passing and one the judgment turns on are different things. */
    occurrences: integer('occurrences').notNull().default(1),
    firstOffset: integer('first_offset').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('judgment_statute_refs_unique').on(t.judgmentId, t.actNamed, t.sectionNumber),
    index('judgment_statute_refs_section_idx').on(t.sectionNumber),
    index('judgment_statute_refs_statute_idx').on(t.statuteId),
    index('judgment_statute_refs_judgment_idx').on(t.judgmentId),
  ],
);

/**
 * The concordance — the citations advocates actually type.
 *
 * **Separate from `judgments.reporter_citations` on purpose.** That column is
 * what the SOURCE published; every row in this corpus carries exactly one and it
 * is always S.C.R., because that is what our source digitised. Appending derived
 * aliases there would destroy the distinction between *"the reporter printed
 * this"* and *"we worked this out"*, and once destroyed it cannot be recovered.
 *
 * Provenance has to stay answerable. *"Who says this judgment is AIR 1952 SC
 * 343?"* has an answer here — **"at least two Supreme Court judgments printed it
 * beside the S.C.R. citation we hold"** — which is a stronger claim than a
 * column, and worth being able to make. Migration `0027` is the authority.
 */
export const judgmentCitationAliases = pgTable(
  'judgment_citation_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    judgmentId: uuid('judgment_id')
      .notNull()
      .references(() => judgments.id, { onDelete: 'cascade' }),
    /** As printed: `AIR 1973 SC 1461`. Shown to a human checking the derivation. */
    alias: text('alias').notNull(),
    /** Upper-cased, non-alphanumerics stripped — the same rule as `citationLookupKey`. */
    aliasKey: text('alias_key').notNull(),
    /** `AIR` | `SCC`. A CHECK constraint in migration 0027 is the authority. */
    aliasReporter: text('alias_reporter').notNull(),
    /**
     * How many separate citing judgments printed the pairing. **Two is the
     * floor**: one sighting could be a single OCR slip in a single judgment, and
     * an alias nobody can trace is worse than no alias.
     */
    corroborations: integer('corroborations').notNull(),
    /** The span that justified it. An alias whose evidence cannot be read is an assertion. */
    evidence: text('evidence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // ONE ALIAS, ONE JUDGMENT — a citation string names exactly one case.
    uniqueIndex('judgment_citation_aliases_key').on(t.aliasKey),
    index('judgment_citation_aliases_judgment_idx').on(t.judgmentId),
  ],
);

/**
 * Every citation form the corpus holds, keyed — the resolver's index, made a
 * table instead of a query.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: THE RESOLVER WAS WRITTEN FOR 38,341 JUDGMENTS AND NOW FACES
 * 7,296,068
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `resolve-cli.ts` built its lookup index inline, on every run, as a CTE:
 * `judgments × unnest(reporter_citations)` UNION the neutral citations UNION the
 * alias table, then a LATERAL `regexp_matches` over every one of those strings to
 * pull its years, then `GROUP BY` the lot. At 38k rows that is a rounding error.
 * At 7.3M it is two sequential scans of an 8.4 GB heap plus a regex over every
 * citation string in the corpus — **materialised four separate times in one
 * `--apply --external` run**, because the same CTE appears in four statements.
 * NEW1 caught it as a 16.4-hour query blocking a second copy of itself (bus
 * 0523), and it is 190x the corpus it was designed against, not 100x.
 *
 * **The fix is not a faster scan. It is not scanning.** The keys change only when
 * judgments or aliases change, so they belong in a table that is maintained
 * incrementally and read through an index — after which resolution touches only
 * the keys the unresolved edges actually ask for, which is a few hundred thousand
 * rather than all of them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT EACH COLUMN IS FOR, AND WHY NONE OF THEM IS DERIVED AT READ TIME
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `source` and `sourceText` are the provenance requirement, and they are the
 * reason this is not a materialised view of keys alone. *"Why does this key point
 * at that judgment?"* has to stay answerable — **"because the reporter printed
 * `[1950] 1 S.C.R. 806` on it"** is an answer; a bare key is not. It is also what
 * makes a bad row correctable: a key with no traceable form is indistinguishable
 * from a bug.
 *
 * `years` is stored rather than recomputed because it is the resolver's YEAR
 * GUARD — the check that stops a digit-boundary collapse pointing an advocate at
 * a case from another decade — and recomputing it per run is exactly the LATERAL
 * regex that made the old pass unaffordable.
 *
 * **This table is an INDEX, never an authority.** It asserts nothing that
 * `judgments` and `judgment_citation_aliases` do not already say; it can be
 * dropped and rebuilt from them at any time, and `citation-keys-cli.ts` exists to
 * do exactly that. Nothing may write a fact here that has no source row.
 */
export const judgmentCitationKeys = pgTable(
  'judgment_citation_keys',
  {
    /** Upper-cased, non-alphanumerics stripped — the same rule as `citationLookupKey`. */
    citationKey: text('citation_key').notNull(),
    judgmentId: uuid('judgment_id')
      .notNull()
      .references(() => judgments.id, { onDelete: 'cascade' }),
    /** `neutral` | `reporter` | `alias`. Which of the three origins this form came from. */
    source: text('source').notNull(),
    /** The citation exactly as it was printed or derived. Provenance, and a human's check. */
    sourceText: text('source_text').notNull(),
    /**
     * Every four-digit year appearing in `sourceText`. The resolver's year guard
     * reads this and nothing else.
     *
     * `[0-9]` and never `\d` when this is populated — a backslash does not survive
     * the trip from a JS tagged template through the driver to PostgreSQL, and it
     * fails as an EMPTY MATCH SET rather than an error, so a guard built on it
     * looks like a guard that simply never had to fire. Measured, `resolve-cli.ts`.
     */
    years: text('years').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The resolver's only access path: given a key, which judgments claim it.
    index('judgment_citation_keys_key_idx').on(t.citationKey),
    // Rebuild-one-judgment and the ON DELETE CASCADE both walk this.
    index('judgment_citation_keys_judgment_idx').on(t.judgmentId),
    // Idempotence. The builder is resumable and therefore WILL re-visit rows on
    // an overlapping restart; without this a crash mid-page silently doubles a
    // key's target count, and a key with two targets is one the resolver refuses
    // outright. A duplicate row here does not corrupt data — it SUPPRESSES a
    // correct resolution, which is the harder failure to notice.
    uniqueIndex('judgment_citation_keys_unique').on(
      t.citationKey,
      t.judgmentId,
      t.source,
      t.sourceText,
    ),
  ],
);

/**
 * DeepSeek-adjudicated candidate resolutions for `external_citations` targets
 * that the deterministic concordance (`concordance.ts`) could not join —
 * `docs/ai/CITATION_CONCORDANCE_PROGRAM.md`.
 *
 * **This table is an adjudication AID, never a source of truth.** A row here
 * is a recorded opinion — the model's, checked against deterministic
 * candidate-generation signals — not a fact about the corpus. Nothing reads
 * this table to answer a citation query; only `judgment_citation_aliases`
 * does that, and promotion from here into it is a separate, explicit,
 * threshold-gated step this table does not perform on its own.
 *
 * **Every row is cached and auditable.** `modelInputHash` is the idempotency
 * key (`CLAUDE.md` FQ-directive: "never pay twice for the same exact task") —
 * a re-run with the same citation, context and candidate set is a lookup, not
 * a second model call. `modelReasoning` is stored verbatim so a human can
 * read why the model decided what it decided, the same discipline
 * `judgment_citation_aliases.evidence` already applies to the deterministic
 * concordance.
 */
export const citationConcordanceResolutions = pgTable(
  'citation_concordance_resolutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Which unresolved-citation feed this target came from, e.g. `aws_high_court`. */
    source: text('source').notNull(),
    /** Matches `external_citations.citation_key` — alphanumeric-only comparison form. */
    citationKey: text('citation_key').notNull(),
    /** As printed, for provenance. */
    citationText: text('citation_text').notNull(),
    citationYear: integer('citation_year'),
    /**
     * A bounded snippet around one sighting of the citation — the case name a
     * court printed beside it. **Not the document.** The same "evidence span,
     * never the source text" discipline as `judgment_citation_aliases.evidence`;
     * `docs/CITATION_STRATEGY.md`'s "read as evidence, throw the text away"
     * rule governs the document this snippet was taken from.
     */
    contextEvidence: text('context_evidence').notNull(),
    /**
     * The candidate set actually shown to the model: `{judgmentId, caseTitle,
     * judgmentDate, jaccard}[]`. Kept so a stored decision is reproducible
     * without re-running candidate generation against a corpus that may have
     * grown since.
     */
    candidates: jsonb('candidates').notNull(),
    /** Which candidate the model selected, if any. NULL is a real answer, not a gap. */
    candidateJudgmentId: uuid('candidate_judgment_id').references(() => judgments.id, {
      onDelete: 'set null',
    }),
    decision: text('decision').notNull(),
    /**
     * HIGH/MEDIUM/LOW/AMBIGUOUS/UNRESOLVED — `docs/ai/
     * CITATION_CONCORDANCE_EVALUATION.md` derives the thresholds from a
     * measured precision/recall curve on a gold set drawn from the corpus's
     * own already-corroborated aliases; not invented ahead of measurement.
     */
    confidence: text('confidence').notNull(),
    deterministicTopScore: numeric('deterministic_top_score', { precision: 5, scale: 4 }),
    deterministicRunnerUpScore: numeric('deterministic_runner_up_score', {
      precision: 5,
      scale: 4,
    }),
    modelUsed: text('model_used').notNull(),
    /** sha256 of (citationKey + contextEvidence + candidate id list) — the cache key. */
    modelInputHash: text('model_input_hash').notNull(),
    modelOutputHash: text('model_output_hash'),
    /** The model's own stated reason, verbatim. Never edited, never summarised. */
    modelReasoning: text('model_reasoning'),
    /** Contradictions the model itself flagged, verbatim. NULL means none reported. */
    contradictions: text('contradictions'),
    signalsUsed: text('signals_used')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    needsHumanReview: boolean('needs_human_review').notNull().default(true),
    /**
     * `unvalidated` | `gold_positive` | `gold_negative` | `promoted` | `rejected`.
     * `promoted` is the ONLY status that means a row's `candidateJudgmentId`
     * was ever written elsewhere (`judgment_citation_aliases`), and that write
     * is a separate, explicit step — never automatic on insert here.
     */
    validationStatus: text('validation_status').notNull().default('unvalidated'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The idempotency/cache constraint — re-adjudicating identical evidence is a lookup.
    uniqueIndex('citation_concordance_resolutions_cache').on(
      t.source,
      t.citationKey,
      t.modelInputHash,
    ),
    index('citation_concordance_resolutions_key_idx').on(t.citationKey),
    index('citation_concordance_resolutions_candidate_idx').on(t.candidateJudgmentId),
    index('citation_concordance_resolutions_confidence_idx').on(t.confidence),
  ],
);

/* -------------------------------------------------- document deduplication -- */

/**
 * `docs/ai/CANONICAL_IDENTITY.md` / `docs/ai/DEDUPLICATION.md` — Stage 3 of the
 * DATA → RETRIEVAL EXECUTION PROGRAM. A GROUP, not a pairwise edge table: the
 * largest exact-duplicate group found (`docs/ai/tasks/003-corpus-inventory.md`,
 * the Gujarat 327-matter batch judgment) has 124 members, and a pairwise table
 * would need C(124,2) = 7,626 rows to say the same thing one group row says.
 *
 * **Never destroys provenance.** No column here can cause a `judgments` row to
 * be deleted or merged — `judgment_id`'s only foreign-key action is
 * `ON DELETE CASCADE` on the group membership, never the reverse. Each member's
 * own identity (`cnr`, `case_number`, `source_url`) is untouched.
 */
export const documentDuplicateRelationshipEnum = pgEnum('document_duplicate_relationship', [
  'exact_duplicate',
  'near_duplicate',
  'unknown',
]);

export const documentDuplicateMethodEnum = pgEnum('document_duplicate_method', [
  'content_hash',
  'minhash_lsh',
  'manual',
]);

export const documentDuplicateGroups = pgTable(
  'document_duplicate_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    relationship: documentDuplicateRelationshipEnum('relationship').notNull(),
    method: documentDuplicateMethodEnum('method').notNull(),
    /** The value the method grouped on — the shared `content_hash` for the
     * `content_hash` method. Opaque for other methods; never re-derived from it. */
    groupKey: text('group_key').notNull(),
    /** Denormalised from `document_duplicate_members` at write time — an
     * inserted count, not a live aggregate, so a query reporting "how big are
     * duplicate groups" does not need to join and count every time. */
    memberCount: integer('member_count').notNull(),
    /** Human-readable justification, e.g. "content_hash match: <hash>". */
    evidence: text('evidence'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotent re-runs: the same method finding the same key updates one row,
    // never inserts a second group for text already grouped.
    uniqueIndex('document_duplicate_groups_method_key_idx').on(t.method, t.groupKey),
  ],
);

export const documentDuplicateMembers = pgTable(
  'document_duplicate_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => documentDuplicateGroups.id, { onDelete: 'cascade' }),
    judgmentId: uuid('judgment_id')
      .notNull()
      .references(() => judgments.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.judgmentId] }),
    index('document_duplicate_members_judgment_idx').on(t.judgmentId),
  ],
);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MODEL-DERIVED ENRICHMENT CANDIDATES — what a model SAYS, never what LawMind KNOWS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Transcribed into `schema.ts` on 14 Aug 2026, having existed in production
 * since migration 0045 without ever appearing here.** 28,728 rows and two CLIs
 * were writing a table Drizzle had no idea about. Nothing was broken by it —
 * every writer uses raw SQL — but `SCHEMA_TRUTH.md` calls itself the only
 * authority on data shapes, and a table missing from the transcription is a way
 * for the next agent to conclude it does not exist. `documentEnrichments` is
 * declared here so that reading is impossible, not so a query changes.
 *
 * `docs/ai/CITATION_CONCORDANCE_EVALUATION.md` is the reason the table is
 * separate at all: with the true answer removed from its options this model
 * invented an authority 10.8% of the time, and two of those four inventions
 * carried its own `high` confidence. So model output lands HERE, and promotion
 * into `judgments`, `judgment_citations`, `judgment_citation_aliases` or
 * `judgment_judges` is a separate, measured, deliberate step. **No route joins
 * this table and no retrieval path consults it.**
 *
 * `verificationState` is decided by STRING-MATCHING the model's claimed evidence
 * span against the source text — never by the model's own confidence. A claim
 * whose span cannot be located is `rejected`, with the reason recorded.
 *
 * `task` is text with a CHECK constraint rather than a `pgEnum`, deliberately:
 * a new enrichment task is a normal weekly event, and 0044 taught what it costs
 * to rewrite a type in production. Drizzle carries no CHECK here, so the
 * constraint lives in the migrations (0045, extended by 0051 and 0054) and that
 * is where the current task list is authoritative.
 *
 * 0054 adds the ATOMIC vocabulary — `issue`, `relief`, `procedural_event`,
 * `date_event`, `fact_proposition`, `party_action`, `court_action`,
 * `reasoning_proposition`, `statute_role` — alongside 0051's composite objects
 * rather than replacing them. The reason is the verification rule two paragraphs
 * up: a composite object fails as a UNIT, so a rejected `case_structure`
 * discards the parts whose spans located perfectly. An atomic task is one
 * assertion with one span, so a rejection names one proposition.
 */
export const documentEnrichments = pgTable(
  'document_enrichments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    judgmentId: uuid('judgment_id')
      .notNull()
      .references(() => judgments.id, { onDelete: 'cascade' }),
    /** Which enrichment was attempted. CHECK-constrained in the migration, not here. */
    task: text('task').notNull(),
    /** Bumped when the prompt changes, so a revision re-runs instead of reusing. */
    promptVersion: text('prompt_version').notNull(),
    model: text('model').notNull(),
    /** task + prompt version + the exact excerpt sent. The cache key. */
    inputHash: text('input_hash').notNull(),
    /** The document text the excerpt came from, so a re-extraction invalidates
     * its own enrichments rather than keeping answers about text that is gone. */
    sourceTextHash: text('source_text_hash').notNull(),
    /** Kept verbatim so re-verification costs no tokens when the verifier improves. */
    rawOutput: text('raw_output'),
    parsedOutput: jsonb('parsed_output'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    latencyMs: integer('latency_ms'),
    attempts: integer('attempts').notNull().default(1),
    /** `ok` means the call returned and parsed. It says NOTHING about truth —
     * that is `verificationState`'s job, and conflating the two is how a
     * transport success becomes a legal fact. `ok` | `call_failed` | `unparseable`. */
    status: text('status').notNull(),
    error: text('error'),
    /** `verified` | `partial` | `rejected` | `unverified`. Set by span matching. */
    verificationState: text('verification_state').notNull().default('unverified'),
    verifiedCount: integer('verified_count').notNull().default(0),
    rejectedCount: integer('rejected_count').notNull().default(0),
    rejectionReasons: jsonb('rejection_reasons'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A repeat of the same task, prompt and excerpt is a lookup, never a second
    // call against a rate-limited free pool.
    uniqueIndex('document_enrichments_cache_key').on(
      t.judgmentId,
      t.task,
      t.promptVersion,
      t.inputHash,
    ),
    index('document_enrichments_task_idx').on(t.task, t.verificationState),
    index('document_enrichments_judgment_idx').on(t.judgmentId),
    // Added by 0051: the staged rollout asks "how did the last stage verify"
    // constantly, which is a range read, not a scan of every row ever produced.
    index('document_enrichments_task_created_idx').on(t.task, t.createdAt),
  ],
);
