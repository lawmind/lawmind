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
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { RELEASE_CAPABILITIES_VERSION, capabilityRegistry } from './capabilities.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../../packages/db/drizzle', import.meta.url));

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

/**
 * -----------------------------------------------------------------------------
 * THE CODE SIDE OF THE CANDIDATE - FIFTH bus 1365
 * -----------------------------------------------------------------------------
 *
 * The first version bound corpus counts and a HEAD string, and `check` compared
 * only the counts. FIFTH found what that permits, on this very candidate:
 *
 *   sealed head   d12f2a9        current HEAD   63eb0b1
 *   checker says  FROZEN
 *
 * Worse, checking out `d12f2a9` does NOT reproduce the sealed capability set:
 * the manifest embeds `RELEASE_CAPABILITIES_R8_3.2` with NEW1's dotted names,
 * and that registry was only committed later, in `63eb0b1`. The candidate was
 * sealed from a DIRTY TREE, so the HEAD it names is not the code it was sealed
 * from. A release candidate that cannot be checked out is not a candidate; it is
 * a note about a moment.
 *
 * So the seal now binds code identity as well, and refuses to call itself
 * reproducible when the tree is dirty:
 *
 *   head              the commit
 *   treeClean         whether the working tree had uncommitted changes
 *   dirtyPaths        which ones, when it did not
 *   migrationFiles    count + digest of the migration FILENAMES
 *   registryDigest    a hash of the capability set actually embedded
 *   schemaDigest      tables/columns/indexes/triggers/enums/views of the live DB
 *
 * `check` compares every one of them. `FROZEN` may not mean "the counts did not
 * move" while §7 requires code, DB, capabilities and build frozen together.
 */
export type CodeIdentity = {
  head: string;
  /**
   * False when RELEASE-RELEVANT paths were uncommitted at seal time.
   *
   * -----------------------------------------------------------------------------
   * WHY THIS IS NOT "the tree is clean"
   * -----------------------------------------------------------------------------
   *
   * Five agents share one worktree. `.agents/bus/leases/*.json` change on every
   * lease acquire, `.agents/jobs/observations.jsonl` grows whenever the job
   * observer runs, and another lane's ingest checkpoints move while its walk
   * does. A literal `git status --porcelain` is NEVER empty here and never will
   * be, so a `reproducible` flag defined against it would be permanently false
   * and would therefore say nothing.
   *
   * The question the flag has to answer is narrower and is the one FIFTH's bus
   * 1365 actually asked: **does checking out this HEAD give you the code that
   * was sealed?** Lease churn does not affect that. An uncommitted edit to
   * `services/`, `packages/`, `apps/` or the API contract does, and it is exactly
   * what happened -- the capability registry was sealed from a dirty tree and
   * only committed afterwards, so the named HEAD did not reproduce it.
   *
   * So `treeClean` is scoped to {@link RELEASE_RELEVANT}, and BOTH lists are
   * recorded. Narrowing a check to what it can actually mean is not the same as
   * relaxing it, and hiding the churn would be.
   */
  treeClean: boolean;
  /**
   * Release-relevant paths that were uncommitted, capped.
   *
   * Present so `reproducible: false` is actionable rather than a scold: the
   * fastest route to a reproducible candidate is knowing what to commit.
   */
  dirtyPaths: string[];
  /**
   * Everything else that was uncommitted — lease files, logs, another lane's
   * checkpoints. Recorded and NOT judged, so a reader can see the whole state
   * without the verdict turning on somebody else's heartbeat.
   */
  operationalChurn: string[];
  migrationFiles: number;
  migrationDigest: string;
  registryVersion: string;
  registryDigest: string;
  /** Shape of the live schema: tables, columns, indexes, triggers, enums, views. */
  schemaDigest: string;
};

export type ReleaseCandidate = {
  releaseCandidateId: string;
  sealedAt: string;
  head: string;
  /**
   * TRUE only when the tree was clean at seal time, so the named HEAD really
   * does reproduce this candidate. A candidate sealed dirty is still useful for
   * measurement and must never be frozen as a release.
   */
  reproducible: boolean;
  capabilityRegistryVersion: string;
  code: CodeIdentity;
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

/**
 * The live schema's SHAPE, hashed.
 *
 * Not the data - the structure a restore has to reproduce. It is the same set
 * the fresh-install replay compares, so a candidate that passes replay and a
 * candidate whose schema later drifts are distinguishable by one string.
 */
async function schemaDigest(sql: Sql): Promise<string> {
  const rows = await sql<{ sig: string }[]>`
    SELECT string_agg(sig, chr(10) ORDER BY sig) AS sig FROM (
      SELECT 'c:' || table_name || ':' || column_name || ':' || data_type || ':' || is_nullable AS sig
        FROM information_schema.columns WHERE table_schema = 'public'
      UNION ALL
      SELECT 'i:' || indexname || ':' || indexdef FROM pg_indexes WHERE schemaname = 'public'
      UNION ALL
      SELECT 't:' || c.relname || ':' || t.tgname
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE NOT t.tgisinternal AND n.nspname = 'public'
      UNION ALL
      SELECT 'e:' || ty.typname || ':' || e.enumlabel
        FROM pg_type ty JOIN pg_enum e ON e.enumtypid = ty.oid
        JOIN pg_namespace n ON n.oid = ty.typnamespace WHERE n.nspname = 'public'
      UNION ALL
      SELECT 'v:' || table_name FROM information_schema.views WHERE table_schema = 'public'
    ) s`;
  return createHash('sha256').update(rows[0]?.sig ?? '').digest('hex').slice(0, 16);
}

/**
 * Read the code side. `git` is shelled here rather than in the CLI because the
 * candidate's reproducibility is part of its identity, not a display concern.
 */
/**
 * Paths whose uncommitted state means the named HEAD does not reproduce the
 * candidate. Everything outside this is operational churn on a shared worktree.
 */
const RELEASE_RELEVANT = [/^services\//, /^packages\//, /^apps\//, /^scripts\//, /^docs\/API_CONTRACTS\.md$/];

/**
 * Excluded from the above even though they live under a release-relevant root.
 *
 * `services/ingest/.checkpoints/*` is a walk cursor, `*.log` and `*.lock` are
 * runtime artefacts. None of them is code, and checking out HEAD reproduces the
 * candidate whatever they say -- they move because a worker ran, which is the
 * definition of operational churn.
 */
const NOT_CODE = [/\.checkpoints\//, /\.log$/, /\.lock$/, /\.err$/, /^\.agents\//];

const isReleaseRelevant = (p: string) =>
  RELEASE_RELEVANT.some((re) => re.test(p)) && !NOT_CODE.some((re) => re.test(p));

async function readCodeIdentity(sql: Sql, head: string): Promise<CodeIdentity> {
  let dirtyPaths: string[] = [];
  let operationalChurn: string[] = [];
  let treeClean = false;
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    const all = out
      .trim()
      .split(String.fromCharCode(10))
      .filter(Boolean)
      .map((l) => l.slice(3).trim());
    dirtyPaths = all.filter(isReleaseRelevant);
    operationalChurn = all.filter((p) => !isReleaseRelevant(p));
    treeClean = dirtyPaths.length === 0;
  } catch {
    // Unreadable git is not a clean tree. Same rule as an unreadable config:
    // the honest reading of "I do not know" for a release gate is no.
    treeClean = false;
    dirtyPaths = ['UNREADABLE: git status failed'];
  }

  let migrationFiles = 0;
  let migrationDigest = '';
  try {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    migrationFiles = files.length;
    migrationDigest = createHash('sha256')
      .update(files.join(String.fromCharCode(10)))
      .digest('hex')
      .slice(0, 16);
  } catch {
    migrationDigest = 'UNREADABLE';
  }

  const registry = capabilityRegistry();
  return {
    head,
    treeClean,
    dirtyPaths: dirtyPaths.slice(0, 40),
    operationalChurn: operationalChurn.slice(0, 40),
    migrationFiles,
    migrationDigest,
    registryVersion: RELEASE_CAPABILITIES_VERSION,
    // The registry's CONTENT, not only its version string. A version that is not
    // bumped when a state changes is exactly the stale-flag failure R8.3 §6
    // names, and this notices it without anyone remembering to bump.
    registryDigest: createHash('sha256')
      .update(JSON.stringify(registry.capabilities))
      .digest('hex')
      .slice(0, 16),
    schemaDigest: await schemaDigest(sql),
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
  const code = await readCodeIdentity(sql, head);
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
    /**
     * A candidate sealed over uncommitted changes names a HEAD that does not
     * reproduce it. Recorded as a FIELD rather than refused outright: the seal
     * is still the right measurement to take while blockers are open, and the
     * flag is what stops it being frozen as a release.
     */
    reproducible: code.treeClean && head !== 'UNKNOWN_HEAD',
    capabilityRegistryVersion: RELEASE_CAPABILITIES_VERSION,
    code,
    corpus,
    corpusDigest: digestOf(corpus),
  };
}

export type CandidateDrift = {
  /**
   * `FROZEN` requires BOTH sides unchanged. FIFTH bus 1365: a checker that
   * compares corpus counts only reports FROZEN while HEAD, the capability
   * registry and the schema have all moved underneath it.
   */
  state: 'FROZEN' | 'MUTATED';
  /** Which side moved, so the reason is readable without diffing the lists. */
  movedCode: { field: keyof CodeIdentity; sealed: unknown; now: unknown }[];
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
  headNow?: string,
): Promise<CandidateDrift> {
  const current = await readCorpusIdentity(sql);
  const currentCode = await readCodeIdentity(sql, headNow ?? candidate.code?.head ?? candidate.head);
  const movedCode: CandidateDrift['movedCode'] = [];
  if (candidate.code) {
    for (const key of ['head', 'migrationFiles', 'migrationDigest', 'registryVersion', 'registryDigest', 'schemaDigest'] as const) {
      // `treeClean`/`dirtyPaths` are deliberately NOT compared: they describe the
      // moment of sealing, not the candidate's identity, and a later edit to an
      // unrelated file is not corpus or code drift in this candidate.
      if (currentCode[key] !== candidate.code[key]) {
        movedCode.push({ field: key, sealed: candidate.code[key], now: currentCode[key] });
      }
    }
  }
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
    state: moved.length === 0 && movedCode.length === 0 ? 'FROZEN' : 'MUTATED',
    movedCode,
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
