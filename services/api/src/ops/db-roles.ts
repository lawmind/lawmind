/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHICH DATABASE OWNS WHICH TABLE — THE ONE ANSWER, WRITTEN DOWN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gate C requires that a corpus rollback cannot roll back an advocate's matters.
 * `cascade-guard.ts` makes that safe by REFUSING when the two roles share a
 * database. This file is the other half: it says what the two roles ARE, so the
 * refusal, the release, the backup and the startup guard all mean the same thing
 * by "corpus" and by "user".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFAULT IS `user`, AND THAT DIRECTION IS THE WHOLE SAFETY PROPERTY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A table nobody has classified resolves to `user`. The two failures are not
 * symmetric:
 *
 * - **A corpus table wrongly called `user`** means a release does not carry it.
 *   The restore's own verification notices a missing table, an operator sees it,
 *   and nothing was destroyed.
 * - **A user table wrongly called `corpus`** means a rollback TRUNCATEs an
 *   advocate's saved authorities. Silent, and unrecoverable without a backup.
 *
 * So the unknown case takes the loud failure. {@link unclassifiedTables} exists
 * so the loudness arrives at a test rather than at an incident: a table added by
 * any lane and classified by none fails the assertion with its own name in the
 * message.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INVARIANT THAT MAKES THIS CHECKABLE RATHER THAN AN OPINION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **No corpus table may hold a foreign key into a user table.** The corpus is
 * published law and the machinery that acquired it; it existed before any
 * advocate signed up and must survive every one of them leaving. A corpus row
 * that cannot exist without a user row is a misclassification, and
 * `db-roles.test.ts` asserts it against the live catalogue rather than against
 * this list's good intentions.
 *
 * The converse — a user table referencing a corpus row — is expected, and is
 * exactly what the split replaces with an indexed soft reference.
 */

export type DbRole = 'corpus' | 'user';

/**
 * Published law, and the machinery that acquired, normalised, enriched and
 * indexed it. Everything here is reproducible from the sources: destroying it
 * costs machine time, never an advocate's work.
 */
export const CORPUS_TABLES: readonly string[] = [
  // -- the judgments themselves and everything derived from their text --
  'judgments',
  'judgment_chunks',
  'judgment_citation_aliases',
  'judgment_citation_keys',
  'judgment_citations',
  'judgment_coverage',
  'judgment_date_quality',
  'judgment_judges',
  'judgment_paragraphs',
  'judgment_recovery_queue',
  'judgment_statute_refs',
  'judgment_text_recovery',
  // -- statute law --
  'statute_amendment_unparsed',
  'statute_amendments',
  'statute_mappings',
  'statute_sections',
  'statutes',
  // -- retrieval structures built from the corpus --
  'document_vector_staging',
  'embedding_census_cell',
  'embedding_census_progress',
  'embedding_content_representative',
  'embedding_snapshot',
  'embedding_snapshot_policy',
  'lexeme_document_frequency',
  // -- measurement and coverage OF the corpus --
  'corpus_coverage',
  'coverage_cell',
  'document_duplicate_groups',
  'document_duplicate_members',
  'document_enrichments',
  'quality_screen_runs',
  // -- the citation graph and its resolution machinery --
  'citation_concordance_resolutions',
  'citation_key_dirty',
  'citation_key_frontier',
  'external_citation_documents',
  'external_citations',
  // -- acquisition: what we fetched, from where, and under which grant --
  'cause_list_syncs',
  'ecourts_fetch_ledger',
  'ecourts_observation',
  'harvest_fetches',
  'harvest_queue',
  'hc_class_candidate',
  'hc_ingest_ledger',
  'official_source_artifact',
  'official_source_fetch_ledger',
  // -- factory scratch. Corpus-side by ownership, and disposable by design --
  'factory_schema_journal',
  'lcc_r15_falseunique',
  'n1_lab_passage_role',
  'new1_doc_vector_stage',
  'new1_doc_vector_stage_refused',
  'new1_head_baseline',
  'new1_inbound_counts',
  'new1_probe_hnsw_1000000',
  'new1_probe_hnsw_250000',
  'new1_source_vector_stage',
  'new1_tranche_passages',
  'new2_neutral_dupe_groups',
  'new2_p1_sample_groups',
  'resolver_risk_replay',
];

/**
 * Everything an advocate created, was billed for, consented to, or is
 * identified by — plus the platform's own operational record.
 *
 * `platform_config`, `audit_log`, `llm_calls` and `api_idempotency_records` are
 * here rather than in a third role on purpose. They are not corpus, they must
 * survive a corpus rollback, and inventing a third database to hold four tables
 * would buy nothing and add a failure mode.
 *
 * `verification_cache` is here for a reason worth stating: it records that a
 * citation WAS confirmed, and `CITATION_HARNESS.md` holds verification to be
 * permanent while good-law status is not. A corpus rollback must not erase the
 * record of a confirmation that really happened.
 */
export const USER_TABLES: readonly string[] = [
  // -- identity --
  'auth_account',
  'auth_session',
  'auth_user',
  'auth_verification',
  'refresh_tokens',
  'users',
  'workspace_members',
  'workspaces',
  // -- the advocate's own work --
  'briefings',
  'documents',
  'judgment_annotations',
  'matter_authorities',
  'matter_events',
  'matter_shares',
  'matters',
  'saved_searches',
  // -- what they searched, checked and were alerted to --
  'alerts',
  // Both moved here 2 Sep 2026 by the FK invariant below, not by opinion:
  // `ecourts_transition` references `matters` and `ocr_jobs` references BOTH
  // `matters` and `users`. They are an advocate's court-monitoring events and
  // the OCR of an advocate's UPLOADED document -- sensitive-class user data that
  // a corpus rollback must never touch. Classified as acquisition machinery on
  // first writing, and the catalogue refuted it in one query.
  'ecourts_transition',
  'ocr_jobs',
  'citation_checks',
  'citation_copies',
  'citation_disputes',
  'citation_fanouts',
  'monitoring_entitlements',
  'search_events',
  'searches',
  'verification_cache',
  // -- money, entitlement and consent --
  'credit_ledger',
  'entitlement_events',
  'entitlements',
  'premium_jobs',
  'training_consent_events',
  // -- rights requests, which are ABOUT a user and must outlive the corpus --
  'data_requests',
  'erasure_objects',
  // -- product telemetry keyed to a person --
  'activation_events',
  'experiment_assignments',
  'experiment_exposures',
  // -- platform operations --
  'api_idempotency_records',
  'audit_log',
  'llm_calls',
  'ops_alert_deliveries',
  'ops_job_observations',
  'platform_config',
  'r2_operation_ledger',
];

const CORPUS = new Set(CORPUS_TABLES);
const USER = new Set(USER_TABLES);

/**
 * The role that owns a table. Unknown resolves to `user` — see the header for
 * why the two errors are not symmetric.
 */
export function roleOf(table: string): DbRole {
  return CORPUS.has(table) ? 'corpus' : 'user';
}

/** Is this table classified at all, or is it merely defaulting? */
export function isClassified(table: string): boolean {
  return CORPUS.has(table) || USER.has(table);
}

/**
 * Tables that exist in a database but appear in neither list.
 *
 * Not an error at runtime — they default to `user` and are therefore safe — but
 * a test failure, because a table nobody classified is a table nobody decided
 * about, and the decision is cheaper now than during a restore.
 */
export function unclassifiedTables(live: readonly string[]): string[] {
  return live.filter((t) => !isClassified(t)).sort();
}

/** Tables named in a list but absent from the database. A stale entry, not a risk. */
export function phantomTables(live: readonly string[]): string[] {
  const present = new Set(live);
  return [...CORPUS_TABLES, ...USER_TABLES].filter((t) => !present.has(t)).sort();
}

/** A table classified twice. Ambiguous ownership is worse than none. */
export function doublyClassifiedTables(): string[] {
  return CORPUS_TABLES.filter((t) => USER.has(t)).sort();
}
