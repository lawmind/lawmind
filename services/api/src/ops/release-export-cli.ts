/**
 * RELEASE EXPORT — a versioned, checksummed slice of APPROVED SERVING DATA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT `pg_dump`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Three independent reasons, and each one alone would be enough:
 *
 * 1. **A whole-database dump exports the advocates.** `matters`, `documents`,
 *    `judgment_annotations` and `users` hold client names, case notes and
 *    uploaded files. A serving release must carry the LAW and nothing else, and
 *    the safest way to guarantee that is a list of tables that is enumerated
 *    here rather than a filter applied to everything.
 *
 * 2. **`pg_dump -t` omits enum types.** A table-scoped dump does not emit the
 *    `CREATE TYPE` its own columns depend on, so the restore fails on exactly
 *    the enum-bearing tables and succeeds on the rest — a half-restored schema
 *    that looks like a partial success. `docs/ai/lcc` carries the incident.
 *
 * 3. **The schema should arrive the way it arrives in production.** By running
 *    the migrations. A release that builds its schema from a dump is a release
 *    whose schema has never been tested against the migration path that every
 *    real deployment uses.
 *
 * So: **migrations build the schema, this builds the data.** `COPY ... TO
 * STDOUT` per approved table, into one file each, with a manifest.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE MANIFEST IS FOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A restore that "worked" is not a release. The manifest records what a correct
 * restore must be able to reproduce, so the target can be CHECKED rather than
 * trusted:
 *
 *   * row count per table;
 *   * a content checksum per table, computed the same way on both sides;
 *   * the schema version (the highest migration in the journal);
 *   * the extensions the source actually had, read from `pg_extension`;
 *   * **the source collation**, because it is the one thing a Linux target
 *     cannot reproduce and the one whose difference is silent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE COLLATION PROBLEM, STATED HERE BECAUSE IT IS DISCOVERED HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This corpus was built on Windows and its database collation is
 * `English_United States.1252`. **No Linux PostgreSQL can offer that
 * collation.** A Linux target gets `en_US.UTF-8` or `C`, and text ordering
 * differs between them — which means `ORDER BY case_title`, every btree index
 * on a text column, and therefore keyset pagination, can all order differently
 * on the serving box than they did in the factory.
 *
 * That is why a cross-platform PHYSICAL copy of the data directory is refused
 * outright, and why a logical restore has to REBUILD its indexes rather than
 * receive them. The manifest carries both collations so the rehearsal can show
 * the difference instead of discovering it in production.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';

import postgres from 'postgres';

/**
 * THE APPROVED SERVING SET — enumerated, never derived.
 *
 * A rule like "everything that is not user data" is a rule that silently
 * includes the next table somebody adds. This list is the decision, and adding
 * to it is a deliberate edit with a reviewer.
 *
 * `orderBy` exists so the export is DETERMINISTIC: the checksum has to be
 * comparable across two machines, and `COPY (SELECT * FROM t)` has no defined
 * order at all.
 */
export const SERVING_TABLES: readonly { table: string; orderBy: string }[] = [
  { table: 'judgments', orderBy: 'id' },
  { table: 'judgment_citations', orderBy: 'id' },
  { table: 'judgment_judges', orderBy: 'judgment_id, judge_name' },
  { table: 'judgment_statute_refs', orderBy: 'id' },
  { table: 'statutes', orderBy: 'id' },
  { table: 'statute_sections', orderBy: 'id' },
  { table: 'lexeme_document_frequency', orderBy: 'lexeme' },
];

/** Named so a reader can see what was CONSIDERED and refused, not just what won. */
export const DELIBERATELY_EXCLUDED = [
  'users / auth_user / auth_session / refresh_tokens — identity',
  'matters / matter_events / matter_authorities / matter_shares — client detail',
  'documents / ocr_jobs — uploaded files',
  'judgment_annotations / saved_searches / searches / alerts — an advocate’s work',
  'audit_log / citation_disputes / data_requests — platform records, not law',
  'llm_calls / search_events — telemetry',
  'judgment_chunks / new1_doc_vector_stage — retrieval representations, NOT YET APPROVED (NEW1 owns the decision; the master plan forbids promoting the staged vectors)',
];

type Manifest = {
  releaseVersion: string;
  createdAt: string;
  source: {
    database: string;
    serverVersion: string;
    /** The one thing a Linux target cannot reproduce. */
    collation: string;
    ctype: string;
    encoding: string;
    extensions: { name: string; version: string }[];
  };
  schemaVersion: { highestMigration: string; migrationCount: number };
  bounded: { judgmentLimit: number | null };
  tables: { table: string; rows: number; checksum: string; bytes: number; file: string }[];
  excluded: readonly string[];
};

/**
 * One checksum per table, order-stable and computed IN SQL so both sides agree.
 *
 * **Per-row `md5` first, then an aggregate over the digests.** The obvious
 * version — `md5(string_agg(row::text, ...))` — concatenates every row into ONE
 * server-side value before hashing it, and `judgments` carries `full_text` and a
 * tsvector: five thousand rows is hundreds of megabytes in a single string, and
 * the first version of this function did not return inside two minutes. Hashing
 * each row to 32 characters first bounds the aggregate by the ROW COUNT rather
 * than by the content size.
 *
 * Not cryptographic and does not need to be — the question is "did every byte
 * arrive", and the threat model is a truncated transfer, not an adversary.
 */
async function checksum(
  sql: postgres.Sql,
  table: string,
  orderBy: string,
  where: string,
): Promise<{ rows: number; checksum: string }> {
  const [row] = await sql.unsafe<{ n: string; ck: string | null }[]>(
    `SELECT count(*)::text AS n,
            md5(coalesce(string_agg(t.h, '' ORDER BY t.ord), '')) AS ck
       FROM (SELECT row_number() OVER (ORDER BY ${orderBy}) AS ord,
                    md5(${table}::text) AS h
               FROM ${table} ${where}) t`,
  );
  return { rows: Number(row?.n ?? 0), checksum: row?.ck ?? '' };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (n: string) => {
    const i = argv.indexOf(`--${n}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const outDir = arg('out') ?? 'release';
  /**
   * Bounded by default. The plan is explicit: prove the pipeline on a small
   * Linux-like rehearsal, do NOT clone the 291 GB factory. An unbounded export
   * is also a DB_SCAN, which the resource gate has been deferring all round.
   */
  const judgmentLimit = arg('judgment-limit') ? Number(arg('judgment-limit')) : 500;

  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = postgres(url, { max: 2, onnotice: () => {} });

  await mkdir(outDir, { recursive: true });

  const [meta] = await sql<
    { db: string; ver: string; collate: string; ctype: string; enc: string }[]
  >`
    SELECT current_database() AS db,
           current_setting('server_version') AS ver,
           datcollate AS collate, datctype AS ctype,
           pg_encoding_to_char(encoding) AS enc
      FROM pg_database WHERE datname = current_database()`;

  const extensions = await sql<{ extname: string; extversion: string }[]>`
    SELECT extname, extversion FROM pg_extension ORDER BY extname`;

  const journal = (await import('node:fs/promises')).readFile;
  const journalText = await journal(
    new URL('../../../../packages/db/drizzle/meta/_journal.json', import.meta.url),
    'utf8',
  );
  const entries = (JSON.parse(journalText) as { entries: { tag: string }[] }).entries;

  const releaseVersion = `${new Date().toISOString().slice(0, 10)}.${Date.now().toString(36)}`;

  /**
   * The bound is applied to `judgments` and then FOLLOWED through the tables
   * that reference it. A citation edge pointing at a judgment that was not
   * exported is a dangling reference, and a release whose referential integrity
   * depends on nobody looking is not a release.
   */
  /**
   * The id set is RESOLVED ONCE and then bound as a literal array.
   *
   * The first version left it as a correlated `IN (SELECT ... LIMIT n)` in every
   * dependent table's WHERE. On `judgments` that is an index range read; on
   * `judgment_citations` — tens of millions of rows — the planner would not use
   * `judgment_citations_citing_idx` for it and the export did not return in two
   * minutes. `= ANY(array)` on 500 literal uuids does use the index.
   *
   * It also makes the slice STABLE. A repeated subquery is re-evaluated per
   * table, so a concurrent insert could put a different 500 judgments in front
   * of one table than another and the export would be internally inconsistent
   * — the kind of corruption that only shows up as a dangling reference weeks
   * later on the serving box.
   */
  const boundIds =
    judgmentLimit > 0
      ? (
          await sql<{ id: string }[]>`
            SELECT id FROM judgments ORDER BY id LIMIT ${judgmentLimit}`
        ).map((r) => r.id)
      : null;

  const idList = boundIds === null ? '' : `'{${boundIds.join(',')}}'::uuid[]`;
  const whereFor = (table: string): string => {
    if (boundIds === null) return '';
    if (table === 'judgments') return `WHERE id = ANY(${idList})`;
    /**
     * Only edges whose BOTH ends are in the slice. An edge pointing at a
     * judgment that was not exported is a dangling reference, and a release
     * whose referential integrity depends on nobody looking is not a release.
     * Unresolved edges (`cited_judgment_id IS NULL`) are real data and are kept.
     */
    if (table === 'judgment_citations')
      return `WHERE citing_judgment_id = ANY(${idList}) AND (cited_judgment_id IS NULL OR cited_judgment_id = ANY(${idList}))`;
    if (table === 'judgment_judges' || table === 'judgment_statute_refs')
      return `WHERE judgment_id = ANY(${idList})`;
    return '';
  };

  const tables: Manifest['tables'] = [];
  for (const { table, orderBy } of SERVING_TABLES) {
    const where = whereFor(table);
    const { rows, checksum: ck } = await checksum(sql, table, orderBy, where);

    const file = `${table}.copy`;
    const path = join(outDir, file);
    const query = `COPY (SELECT * FROM ${table} ${where} ORDER BY ${orderBy}) TO STDOUT`;
    const readable = await sql.unsafe(query).readable();
    /**
     * `pipeline()` NEVER RESOLVES here, and that cost an hour.
     *
     * postgres.js's COPY readable does not settle `stream/promises.pipeline`,
     * so the first table hung forever and the export looked like a slow query
     * against `judgment_citations` — which it was not: the same predicate
     * measured 23 ms on its own. Waiting on the readable's own `end` is what
     * actually completes.
     */
    await new Promise<void>((resolve, reject) => {
      const dest = createWriteStream(path);
      /**
       * `finish` on the DESTINATION, not `end` on the source.
       *
       * `end` fires when the last byte leaves postgres.js, which for an empty
       * table is before `createWriteStream` has opened the file at all — so the
       * `stat` below threw ENOENT on a table that had simply produced no rows.
       * A zero-row table is a legitimate export and must still leave a file.
       */
      dest.on('finish', resolve);
      dest.on('error', reject);
      readable.on('error', reject);
      readable.pipe(dest);
    });

    const { size } = await (await import('node:fs/promises')).stat(path);
    tables.push({ table, rows, checksum: ck, bytes: size, file });
    console.log(`  ${table.padEnd(28)} ${String(rows).padStart(9)} rows  ${ck}  ${size} bytes`);
  }

  const manifest: Manifest = {
    releaseVersion,
    createdAt: new Date().toISOString(),
    source: {
      database: meta?.db ?? '',
      serverVersion: meta?.ver ?? '',
      collation: meta?.collate ?? '',
      ctype: meta?.ctype ?? '',
      encoding: meta?.enc ?? '',
      extensions: extensions.map((e) => ({ name: e.extname, version: e.extversion })),
    },
    schemaVersion: {
      highestMigration: entries.at(-1)?.tag ?? 'unknown',
      migrationCount: entries.length,
    },
    bounded: { judgmentLimit: judgmentLimit > 0 ? judgmentLimit : null },
    tables,
    excluded: DELIBERATELY_EXCLUDED,
  };

  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(outDir, 'MANIFEST.json'), manifestJson, 'utf8');
  /** The manifest's own checksum, so a tampered or truncated manifest is visible. */
  await writeFile(
    join(outDir, 'MANIFEST.sha256'),
    `${createHash('sha256').update(manifestJson).digest('hex')}  MANIFEST.json\n`,
    'utf8',
  );

  console.log(`\nrelease ${releaseVersion} written to ${outDir}`);
  console.log(`source collation: ${manifest.source.collation}  (a Linux target CANNOT match this)`);
  await sql.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
