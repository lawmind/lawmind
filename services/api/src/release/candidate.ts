/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RELEASE_CANDIDATE_ID — A MOVING LOCAL DATABASE IS NOT A RELEASE CANDIDATE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R8.3 §7, and it is a release blocker because of an ordinary, boring fact: the
 * shared local database has multiple background writers, and every previous
 * round's "verified" numbers were taken against a corpus that changed while they
 * were being taken. A freeze against a mutating corpus is not a freeze; it is a
 * photograph of a moving object, and the disagreements it produces are then
 * blamed on the measurement rather than on the movement.
 *
 * So the candidate gets an IDENTITY, and every number FIFTH judges is bound to
 * it. If a writer runs during verification, the manifest's own re-read says so
 * rather than the discrepancy being discovered three documents later.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT BINDS, AND WHY EACH ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * §7 lists the fields; the reason each is load-bearing:
 *
 *   HEAD + build id        two candidates from one corpus are different candidates.
 *   migration line         87 files, 87 journal entries and 87 applied rows have
 *                          disagreed in this repository before, in both directions.
 *   corpus counts          the object under test. Re-read at seal time and
 *                          compared, so drift is DETECTED rather than assumed away.
 *   resolver identity      cursor, risk-replay version, open dirty work. A UNIQUE
 *                          claim is only as good as the index behind it, and the
 *                          index has a version.
 *   statute identity       linked share, because 79.77% must never be frozen as
 *                          "statute coverage".
 *   capability registry    the claim set. Freezing counts without the claims they
 *                          support is how a number outlives its caveat.
 *   source freshness       so "as of" is a fact rather than max(judgment_date).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PAUSE IS A DECLARATION, NOT A LOCK
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing here can stop another lane's process from writing. Claiming it could
 * would be the worst kind of safety theatre — a guarantee that holds because
 * everyone remembered. What it does instead is:
 *
 *   1. RECORD the corpus-mutating processes visible at seal time;
 *   2. RECORD the counts at seal time;
 *   3. re-read the same counts on demand and report the DELTA.
 *
 * A candidate whose counts moved is not silently invalid — it is explicitly
 * `MUTATED`, with the delta named. That is a fact FIFTH can act on. "The corpus
 * did not move" asserted from memory is not.
 */
import type { Sql } from 'postgres';
import { createHash } from 'node:crypto';

import { RELEASE_CAPABILITIES_VERSION, capabilityRegistry } from './capabilities.ts';

/**
 * The counts a candidate is bound to.
 *
 * Deliberately a small, cheap set. A manifest whose capture takes twenty minutes
 * is a manifest that cannot be re-read during verification, and re-reading is
 * the entire mechanism.
 */
export type CorpusIdentity = {
  /**
   * `reltuples` ESTIMATES, and they are NOT part of the frozen/mutated verdict.
   *
   * `count(*)` on 18.7 million rows takes minutes, and a manifest that cannot be
   * re-read cheaply is a manifest nobody re-reads. But `reltuples` moves when
   * ANALYZE runs and the corpus has not — so using it as the drift signal would
   * report MUTATED for a routine autovacuum and train the next reader to ignore
   * the field, which is worse than having no field.
   *
   * So they are carried for SCALE and excluded from the comparison. The exact
   * drift signal is `newestJudgmentCreatedAt` below.
   */
  judgmentsEstimate: number;
  judgmentCitationsEstimate: number;
  /**
   * The exact, index-backed answer to "has a judgment been written since the
   * seal". It rides the same `(created_at, id)` index the key builder walks, so
   * it is one index scan rather than a table read, and it CANNOT move without a
   * write — which is exactly the property `reltuples` lacks.
   *
   * It does not see an UPDATE that leaves `created_at` alone. That is what
   * `citationKeyDirtyOpen` is for: migration 0087's triggers record a citation
   * mutation whether or not any timestamp moved.
   */
  newestJudgmentCreatedAt: string | null;
  judgmentCitationKeys: number;
  statutes: number;
  statuteSections: number;
  statuteRefs: number;
  statuteRefsLinked: number;
  migrationsApplied: number;
  /** The builder's cursor — the resolver index's identity, not its progress. */
  citationKeyCursorAt: string | null;
  /** Open resolver dirty work. Non-zero means some UNIQUE claims are withdrawn. */
  citationKeyDirtyOpen: number;
  /** The newest judgment date we HOLD. Never to be rendered as "current law". */
  maxJudgmentDate: string | null;
};

export type ReleaseCandidate = {
  releaseCandidateId: string;
  sealedAt: string;
  head: string;
  capabilityRegistryVersion: string;
  corpus: CorpusIdentity;
  /**
   * A digest over the identity above.
   *
   * One string an operator, a bus message and a document can all carry, so
   * "were we talking about the same candidate" is answerable without diffing
   * twelve numbers by eye.
   */
  corpusDigest: string;
};

async function readCorpusIdentity(sql: Sql): Promise<CorpusIdentity> {
  /**
   * Scale, cheaply. See `judgmentsEstimate` — these two are informational and
   * are excluded from the drift verdict, because `reltuples` moves on ANALYZE
   * and a false MUTATED would make the whole field worthless.
   */
  const [est] = await sql<{ judgments: string; citations: string }[]>`
    SELECT
      coalesce((SELECT reltuples::bigint FROM pg_class WHERE oid = 'judgments'::regclass), 0)::text AS judgments,
      coalesce((SELECT reltuples::bigint FROM pg_class WHERE oid = 'judgment_citations'::regclass), 0)::text AS citations`;

  const [exact] = await sql<
    {
      keys: string;
      statutes: string;
      sections: string;
      refs: string;
      refs_linked: string;
      migrations: string;
      dirty: string;
      cursor_at: string | null;
      max_date: string | null;
      newest_created: string | null;
    }[]
  >`
    SELECT
      (SELECT count(*) FROM judgment_citation_keys)::text                              AS keys,
      (SELECT count(*) FROM statutes)::text                                            AS statutes,
      (SELECT count(*) FROM statute_sections)::text                                    AS sections,
      (SELECT count(*) FROM judgment_statute_refs)::text                               AS refs,
      (SELECT count(*) FROM judgment_statute_refs WHERE statute_id IS NOT NULL)::text   AS refs_linked,
      (SELECT count(*) FROM drizzle.__drizzle_migrations)::text                        AS migrations,
      (SELECT count(*) FROM citation_key_dirty)::text                                  AS dirty,
      (SELECT cursor_at::text FROM citation_key_frontier LIMIT 1)                      AS cursor_at,
      (SELECT max(judgment_date)::text FROM judgments)                                 AS max_date,
      -- Index-backed: judgments (created_at, id) is the key builder's walk order.
      (SELECT max(created_at)::text FROM judgments)                                    AS newest_created`;

  return {
    judgmentsEstimate: Number(est?.judgments ?? 0),
    judgmentCitationsEstimate: Number(est?.citations ?? 0),
    newestJudgmentCreatedAt: exact?.newest_created ?? null,
    judgmentCitationKeys: Number(exact?.keys ?? 0),
    statutes: Number(exact?.statutes ?? 0),
    statuteSections: Number(exact?.sections ?? 0),
    statuteRefs: Number(exact?.refs ?? 0),
    statuteRefsLinked: Number(exact?.refs_linked ?? 0),
    migrationsApplied: Number(exact?.migrations ?? 0),
    citationKeyCursorAt: exact?.cursor_at ?? null,
    citationKeyDirtyOpen: Number(exact?.dirty ?? 0),
    maxJudgmentDate: exact?.max_date ?? null,
  };
}

function digestOf(identity: CorpusIdentity): string {
  // Key order is fixed by sorting, so a field added later cannot silently change
  // a digest that was supposed to mean "the same corpus".
  const canonical = JSON.stringify(identity, Object.keys(identity).sort());
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Seal a candidate.
 *
 * `head` is passed in rather than shelled for: this module runs inside the API
 * process, and a release identity that depends on a subprocess is one that
 * behaves differently in a container.
 */
export async function sealReleaseCandidate(
  sql: Sql,
  head: string,
  now = new Date(),
): Promise<ReleaseCandidate> {
  const corpus = await readCorpusIdentity(sql);
  const sealedAt = now.toISOString();
  /**
   * Human-legible and unique in one string. The date is first so a directory of
   * manifests sorts chronologically; the digest is the part that actually
   * identifies the corpus, so two candidates sealed in the same minute from
   * different data are still distinguishable.
   */
  const releaseCandidateId = `LMRC-${sealedAt.slice(0, 10).replace(/-/g, '')}-${head.slice(0, 7)}-${digestOf(corpus)}`;
  return {
    releaseCandidateId,
    sealedAt,
    head,
    capabilityRegistryVersion: RELEASE_CAPABILITIES_VERSION,
    corpus,
    corpusDigest: digestOf(corpus),
  };
}

export type CandidateDrift = {
  state: 'FROZEN' | 'MUTATED';
  /** Every COMPARED field whose value moved since the seal, with both values. */
  moved: { field: keyof CorpusIdentity; sealed: unknown; now: unknown }[];
  /**
   * The estimate fields, sealed and now, reported and never judged.
   *
   * Present so a reader can see roughly how much moved without the verdict
   * turning on a statistic that ANALYZE rewrites.
   */
  estimatesInformational: { field: keyof CorpusIdentity; sealed: unknown; now: unknown }[];
  checkedAt: string;
};

/**
 * Has the corpus moved since the candidate was sealed?
 *
 * The answer FIFTH needs before accepting any number measured against it. A
 * `MUTATED` result does not invalidate the verification by itself — it says
 * exactly WHICH fact moved, so the affected claims can be re-taken and the
 * unaffected ones kept.
 */
export async function checkCandidateDrift(
  sql: Sql,
  candidate: ReleaseCandidate,
  now = new Date(),
): Promise<CandidateDrift> {
  const current = await readCorpusIdentity(sql);
  const moved: CandidateDrift['moved'] = [];
  for (const key of Object.keys(candidate.corpus) as (keyof CorpusIdentity)[]) {
    // The two `reltuples` fields are informational. Comparing them would make a
    // routine autovacuum read as corpus mutation — a false MUTATED is not a safe
    // failure here, it is the failure that makes the field worthless.
    if (key === 'judgmentsEstimate' || key === 'judgmentCitationsEstimate') continue;
    if (current[key] !== candidate.corpus[key]) {
      moved.push({ field: key, sealed: candidate.corpus[key], now: current[key] });
    }
  }
  return {
    state: moved.length === 0 ? 'FROZEN' : 'MUTATED',
    moved,
    estimatesInformational: (['judgmentsEstimate', 'judgmentCitationsEstimate'] as const).map(
      (field) => ({ field, sealed: candidate.corpus[field], now: current[field] }),
    ),
    checkedAt: now.toISOString(),
  };
}

/**
 * -----------------------------------------------------------------------------
 * WHO IS ACTUALLY WRITING TO THE CORPUS - ASKED OF POSTGRES, NOT OF WINDOWS
 * -----------------------------------------------------------------------------
 *
 * The first version of this scanned the OS process table for command lines
 * matching `ingest`, `statute`, `ocr` and so on. It reported a writer on its
 * first real run, and the writer was another lane's read-only `SELECT` whose SQL
 * text happened to contain the word "statute". That is the same defect as
 * comparing `reltuples`: a check that cries wolf is a check people learn to
 * ignore, and this one is load-bearing for a freeze.
 *
 * Postgres already knows the answer exactly. A backend that can mutate a corpus
 * table is holding a `RowExclusiveLock` (or stronger) on it, and `pg_locks` says
 * so without any guessing about what a command line means. Our own backend is
 * excluded - this query is itself in `pg_stat_activity`, and including it would
 * report a writer on every run.
 *
 * The OS scan is kept in the CLI as ADVISORY only: a process that has not opened
 * its transaction yet holds no lock, so "nothing in pg_locks" and "nothing is
 * about to start" are different statements. Both are reported; only this one is
 * evidence.
 */
export type CorpusWriter = {
  pid: number;
  application: string | null;
  table: string;
  lockMode: string;
  /** How long its transaction has been open. A long one is the dangerous one. */
  xactStart: string | null;
  query: string | null;
};

/** Tables whose contents a release candidate's numbers are taken from. */
const CORPUS_TABLES = [
  'judgments',
  'judgment_citations',
  'judgment_citation_keys',
  'judgment_paragraphs',
  'judgment_chunks',
  'judgment_statute_refs',
  'statutes',
  'statute_sections',
  'citation_key_frontier',
  'citation_key_dirty',
];

export async function corpusWritersFromPostgres(sql: Sql): Promise<CorpusWriter[]> {
  return sql<CorpusWriter[]>`
    SELECT l.pid,
           a.application_name AS application,
           c.relname          AS table,
           l.mode             AS "lockMode",
           a.xact_start::text AS "xactStart",
           left(a.query, 200) AS query
      FROM pg_locks l
      JOIN pg_class c ON c.oid = l.relation
      JOIN pg_stat_activity a ON a.pid = l.pid
     WHERE c.relname = ANY(${CORPUS_TABLES})
       AND l.mode IN ('RowExclusiveLock', 'ShareRowExclusiveLock',
                      'ExclusiveLock', 'AccessExclusiveLock')
       AND l.pid <> pg_backend_pid()
     ORDER BY a.xact_start NULLS LAST`;
}

/**
 * The full manifest - §7 item 4 and §10 LCC-11.
 *
 * The capability registry is embedded rather than referenced by version alone.
 * A manifest that says "registry R8.3.2" and nothing more is a manifest that
 * cannot be read once the code has moved on, and the whole purpose of freezing
 * one is that it outlives the working tree it was taken from.
 */
export function releaseManifest(candidate: ReleaseCandidate, extra: Record<string, unknown> = {}) {
  return {
    ...candidate,
    capabilities: capabilityRegistry(),
    ...extra,
  };
}
