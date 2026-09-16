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
import { Transform } from 'node:stream';
import { createGzip } from 'node:zlib';
import { join } from 'node:path';

import postgres from 'postgres';

import { releaseChecksum } from './release-checksum.ts';

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
/**
 * READING order, not LOAD order — and the difference cost two rounds.
 *
 * `judgment_statute_refs` sits before `statutes` here, and a restore that loaded
 * the files in this sequence violated `judgment_statute_refs_statute_id_fkey` on
 * every row against an empty parent. `release-restore-cli.ts` now sorts the
 * manifest topologically from the target's own `pg_constraint` before loading,
 * which is the right place for it: the constraint lives on the target and an
 * exporter cannot know what the target's schema will require. This list is
 * therefore free to stay in the order a human would want to read it — but
 * NOTHING may assume it is safe to load in.
 */
export const SERVING_TABLES: readonly { table: string; orderBy: string }[] = [
  { table: 'judgments', orderBy: 'id' },
  // `paragraph_index` is the canonical 0-based document order (migration 0049),
  // and `(judgment_id, paragraph_index)` is UNIQUE, so this sort is total. Its
  // `id` is a random uuid and says nothing about where a paragraph sits.
  { table: 'judgment_paragraphs', orderBy: 'judgment_id, paragraph_index' },
  { table: 'judgment_citations', orderBy: 'id' },
  // `COLLATE "C"` on every TEXT sort key: byte order is the one ordering a
  // Windows source and a Linux target agree on. Without it the digest is
  // aggregated in a different sequence on each side and mismatches on a
  // perfectly correct restore.
  { table: 'judgment_judges', orderBy: 'judgment_id, judge_name COLLATE "C"' },
  { table: 'judgment_statute_refs', orderBy: 'id' },
  { table: 'statutes', orderBy: 'id' },
  { table: 'statute_sections', orderBy: 'id' },
  { table: 'lexeme_document_frequency', orderBy: 'lexeme COLLATE "C"' },
];

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE VECTOR EXPORT CONTRACT — WRITTEN BEFORE THERE IS ANYTHING TO EXPORT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `new1_doc_vector_stage` is **factory scratch**, and this round established
 * that from the tree rather than from anyone's recollection:
 *
 * - **no `CREATE TABLE` migration exists.** Every mention of it under
 *   `packages/db/drizzle` is a COMMENT in a migration about something else.
 * - it is **absent from the Drizzle schema** in `packages/db/src`.
 * - **no serving code reads it.** `services/api/src/search` and
 *   `services/api/src/judgments` reference it zero times; every reader lives in
 *   `services/harness`, which is the factory.
 * - this file already refuses it by name, citing the master plan.
 *
 * So it stays factory-local and **gets no product migration merely to canonise
 * scratch.** What it does get is a condition on the day someone promotes it.
 *
 * **The hazard, measured 30 August 2026.** `snapshot_hash` is nullable with a
 * constant column DEFAULT of `'5b5d02384b46c96c'`, applied by no migration.
 * `doc-vector-embed.mjs` — the live writer — mentions `snapshot_hash` **zero
 * times** and relies entirely on that default. The table today holds
 * 2,342,295 rows stamped `5b5d02384b46c96c` and 486,955 stamped NULL.
 *
 * A constant default is not an identity. When NEW1 begins the next snapshot the
 * writer will keep stamping the CURRENT one, and the only thing standing between
 * two snapshots and one label is somebody remembering to `ALTER COLUMN ... SET
 * DEFAULT`. Nothing errors when they do not.
 *
 * This function is the refusal, and it is deliberately written while the export
 * set contains no vector table at all — a guard added at promotion time is a
 * guard added after the first bad export.
 */
export const VECTOR_SNAPSHOT_IDENTITY_COLUMN = 'snapshot_hash';

export type VectorExportRefusal =
  /** Some exported row carries no snapshot identity at all. */
  | { reason: 'null_snapshot_identity'; table: string; nullRows: number }
  /**
   * The column has a constant DEFAULT, so identity is being supplied by the
   * schema instead of by the job that produced the vectors. Even if every row is
   * currently non-null, the NEXT snapshot inherits this one's label.
   */
  | { reason: 'identity_from_column_default'; table: string; columnDefault: string }
  /** More than one snapshot in a single export, with no way to tell them apart. */
  | { reason: 'mixed_snapshots'; table: string; snapshots: string[] };

/**
 * Refuse a vector export whose rows cannot say WHICH embedding run produced
 * them. Returns `null` when the table may be exported.
 *
 * Called for any table in {@link SERVING_TABLES} that carries the snapshot
 * identity column. Today that is none of them, and that is the intended state.
 */
export async function vectorExportRefusal(
  sql: postgres.Sql,
  table: string,
): Promise<VectorExportRefusal | null> {
  const [column] = await sql<{ column_default: string | null }[]>`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${VECTOR_SNAPSHOT_IDENTITY_COLUMN}`;
  // Not a vector table. Nothing to say about it.
  if (!column) return null;

  if (column.column_default !== null) {
    return {
      reason: 'identity_from_column_default',
      table,
      columnDefault: column.column_default,
    };
  }

  const rows = await sql.unsafe<{ snapshot: string | null; n: string }[]>(
    `SELECT ${VECTOR_SNAPSHOT_IDENTITY_COLUMN} AS snapshot, count(*)::text AS n
     FROM ${table} GROUP BY 1`,
  );
  const nullGroup = rows.find((r) => r.snapshot === null);
  if (nullGroup) {
    return { reason: 'null_snapshot_identity', table, nullRows: Number(nullGroup.n) };
  }
  const snapshots = rows.map((r) => r.snapshot).filter((s): s is string => s !== null);
  if (snapshots.length > 1) {
    return { reason: 'mixed_snapshots', table, snapshots: snapshots.sort() };
  }
  return null;
}

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

/**
 * The columns a restore can actually WRITE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GENERATED COLUMNS ARE THE TRAP, AND THE REHEARSAL CAUGHT IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgments.full_text_tsv` is `GENERATED ALWAYS AS (...) STORED`. `COPY (SELECT
 * * FROM judgments) TO STDOUT` INCLUDES it; `COPY judgments FROM STDIN` EXCLUDES
 * it, because PostgreSQL refuses to be told the value of a generated column. So
 * the two sides disagree about the column count and the restore failed with:
 *
 *     22P04  extra data after last expected column
 *     COPY judgments, line 1: "00000057-499a-...
 *
 * Erroring is the GOOD outcome. The same mismatch in a table where the extra
 * column happens to land inside another column's type would load silently and
 * wrongly.
 *
 * So the column list is enumerated from the catalogue on the export side and
 * WRITTEN INTO THE MANIFEST, and the restore names the same columns. Neither
 * side infers it, and a schema change that adds a generated column cannot
 * quietly desynchronise them.
 */
async function writableColumns(sql: postgres.Sql, table: string): Promise<string[]> {
  const rows = await sql<{ attname: string }[]>`
    SELECT a.attname
      FROM pg_attribute a
     WHERE a.attrelid = ${table}::regclass
       AND a.attnum > 0
       AND NOT a.attisdropped
       -- '' is an ordinary column; 's' is STORED GENERATED, which COPY refuses.
       AND a.attgenerated = ''
     ORDER BY a.attnum`;
  return rows.map((r) => r.attname);
}

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
  tables: {
    table: string;
    rows: number;
    checksum: string;
    bytes: number;
    file: string;
    /** Named on BOTH sides. Generated columns are absent by construction. */
    columns: string[];
    /** sha256 of the file AS WRITTEN (compressed bytes when gzip), for transfer integrity. */
    sha256: string;
    compression: 'gzip' | null;
  }[];
  /** Every table was read inside this one exported snapshot. */
  consistency: { isolation: 'repeatable read'; snapshotId: string };
  excluded: readonly string[];
};

/**
 * Both sides must render the row IDENTICALLY, or the checksum measures the
 * session rather than the data.
 *
 * Two settings, each found by a restore that reported a mismatch on a load
 * where every row had arrived:
 *
 * 1. **`TimeZone`.** `row::text` renders `timestamptz` in the session's zone.
 *    The source session rendered `2026-08-07 09:31:01.666724+00` and the target
 *    `2026-08-07 13:31:01.666724+04` — the same instant, a different string, and
 *    a checksum that says the release is corrupt when it is not.
 * 2. **`DateStyle`.** Same class of problem for dates, and it is one line to
 *    remove the possibility.
 *
 * The COLLATION cannot be pinned this way — a Linux target has no
 * `English_United States.1252` — so the ordering is fixed at the query instead,
 * with `COLLATE "C"` on any text sort key. `C` is byte order and is the one
 * collation both platforms agree on.
 */
async function pinSessionRendering(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`SET TimeZone = 'UTC'`);
  await sql.unsafe(`SET DateStyle = 'ISO, YMD'`);
}

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
/**
 * The checksum is taken over a NAME-ORDERED projection, never over `row::text`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LIVE SCHEMA'S COLUMN ORDER HAS DRIFTED FROM THE MIGRATIONS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured during the first rehearsal, not assumed. `judgments` has the SAME 38
 * columns on both sides — nothing missing, nothing extra — but eight of them sit
 * at different ordinals on the live database than in a database built by running
 * the migrations from empty:
 *
 *     cnr, native_text, petitioner, respondent,
 *     parties_extraction_method, disposal_nature,
 *     source_bench_code, hc_document_class
 *
 * `row::text` renders columns in ORDINAL order, so a perfectly correct restore
 * produced a different string and the checksum called it corrupt.
 *
 * The much more serious consequence is the one this file already avoids: a
 * POSITIONAL `COPY table FROM STDIN` — the spelling without a column list —
 * would have loaded each value into whatever column now sits at that ordinal.
 * That does not error. It silently writes `cnr` into `native_text`.
 *
 * So: columns are named explicitly on both sides for the COPY, and sorted BY
 * NAME for the checksum. Neither depends on an ordinal agreeing across two
 * machines that were built by different routes.   *
   * ─────────────────────────────────────────────────────────────────────────
   * AND THE COMPOSITE RENDERING ITSELF IS PLATFORM-DEPENDENT
   * ─────────────────────────────────────────────────────────────────────────
   *
   * `ROW(...)::text` quotes a field when it "needs" quoting, and the test for
   * needing it includes `isspace()`, which is **LC_CTYPE-dependent**. Measured
   * on one real row, byte-identical data, both sessions pinned to UTC:
   *
   *     source (Windows-1252 ctype)  ("2026-08-17 23:19:21.945366+00",3,"aiàiáªàåzéã",40537)
   *     target (C.UTF-8 ctype)       ("2026-08-17 23:19:21.945366+00",3,aiàiáªàåzéã,40537)
   *
   * Two bytes of difference, no data difference at all. So the digest is taken
   * over `concat_ws` of the columns cast individually — `::text` on a text
   * column is the identity and adds no quoting — with a unit separator that
   * cannot occur in the data, and NULL rendered explicitly so that
   * `(NULL, 'a')` and `('a', NULL)` cannot collide.
 */
/**
 * The WHERE clause that confines one serving table to a bounded slice.
 *
 * `null` ids means an unbounded release and every table is exported whole. A
 * judgment-owned table missing from this function is exported WHOLE even in a
 * bounded release — `judgment_paragraphs` was, and a 500-judgment rehearsal
 * would have walked the entire paragraph table. Exported so the contract test
 * can execute it rather than grep for it.
 */
export function boundedWhere(table: string, boundIds: readonly string[] | null): string {
  if (boundIds === null) return '';
  const idList = `'{${boundIds.join(',')}}'::uuid[]`;
  if (table === 'judgments') return `WHERE id = ANY(${idList})`;
  /**
   * Only edges whose BOTH ends are in the slice. An edge pointing at a
   * judgment that was not exported is a dangling reference, and a release
   * whose referential integrity depends on nobody looking is not a release.
   * Unresolved edges (`cited_judgment_id IS NULL`) are real data and are kept.
   */
  if (table === 'judgment_citations')
    return `WHERE citing_judgment_id = ANY(${idList}) AND (cited_judgment_id IS NULL OR cited_judgment_id = ANY(${idList}))`;
  if (
    table === 'judgment_paragraphs' ||
    table === 'judgment_judges' ||
    table === 'judgment_statute_refs'
  )
    return `WHERE judgment_id = ANY(${idList})`;
  return '';
}

async function checksum(
  sql: postgres.Sql,
  table: string,
  orderBy: string,
  where: string,
  columns: readonly string[],
): Promise<{ rows: number; checksum: string }> {
  return releaseChecksum(sql, table, orderBy, where, columns);
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
  /**
   * `--gzip`: write `<table>.copy.gz`. A full release is ~204 GiB of COPY text
   * and does not fit on the source box uncompressed; gzip is ~3x smaller. The
   * restore reads either form.
   */
  const gzip = argv.includes('--gzip');
  const gzipLevel = Number(arg('gzip-level') ?? 6);

  const sql = postgres(url, { max: 2, onnotice: () => {} });
  await pinSessionRendering(sql);

  /**
   * ONE SNAPSHOT FOR THE WHOLE RELEASE.
   *
   * The checksum and the COPY of a table are two statements, and every table is
   * read at a different moment. On a source that ingestion is still writing,
   * a full export taken without a shared snapshot checksums one state and
   * copies another, and the restore then reports corruption that is really
   * drift. So one connection opens a REPEATABLE READ transaction and exports
   * its snapshot, and every per-table connection joins it — the same mechanism
   * `pg_dump` uses. It is held until the last table is written.
   */
  const snapHolder = postgres(url, { max: 1, onnotice: () => {} });
  await snapHolder.unsafe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const [snap] = await snapHolder.unsafe<{ id: string }[]>('SELECT pg_export_snapshot() AS id');
  const snapshotId = snap?.id ?? '';
  if (!/^[0-9A-F-]+$/i.test(snapshotId)) throw new Error(`unexpected snapshot id: ${snapshotId}`);

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
          await snapHolder<{ id: string }[]>`
            SELECT id FROM judgments ORDER BY id LIMIT ${judgmentLimit}`
        ).map((r) => r.id)
      : null;

  const whereFor = (table: string): string => boundedWhere(table, boundIds);

  const tables: Manifest['tables'] = [];
  for (const { table, orderBy } of SERVING_TABLES) {
    /**
     * Checked for EVERY table, not for a list of vector tables, so promoting one
     * into {@link SERVING_TABLES} cannot skip the guard by not being on a second
     * list somebody forgot to update. A table without the identity column
     * returns null and costs one `information_schema` lookup.
     */
    const refusal = await vectorExportRefusal(sql, table);
    if (refusal) {
      throw new Error(
        `refusing to export ${table}: ${refusal.reason}. ` +
          'A vector export must carry the embedding run\'s own snapshot identity, supplied ' +
          'explicitly by the job or manifest that produced the rows. A constant column DEFAULT ' +
          'is not an identity — it labels the NEXT snapshot with THIS one\'s name and nothing ' +
          `errors when it does. Detail: ${JSON.stringify(refusal)}`,
      );
    }
    const where = whereFor(table);
    const columns = await writableColumns(sql, table);

    const columnList = columns.map((c) => `"${c}"`).join(', ');

    const file = gzip ? `${table}.copy.gz` : `${table}.copy`;
    const path = join(outDir, file);
    const query = `COPY (SELECT ${columnList} FROM ${table} ${where} ORDER BY ${orderBy}) TO STDOUT`;
    /**
     * ONE CONNECTION PER COPY, OPENED AND CLOSED HERE.
     *
     * A COPY leaves its connection in copy-out mode, and postgres.js does not
     * always return it to the pool cleanly. Sharing the main pool wedged it:
     * `pg_stat_activity` showed the NEXT statement sitting `idle` in
     * `Client/ClientRead` for 224 seconds — the server had finished and the
     * client never read the result. From the outside that is indistinguishable
     * from a slow query, which is how twenty minutes went into looking at the
     * wrong table.
     *
     * A dedicated connection per table costs seven handshakes and cannot wedge
     * anything the next statement needs.
     */
    const copyConn = postgres(url, { max: 1, onnotice: () => {} });
    await pinSessionRendering(copyConn);
    await copyConn.unsafe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await copyConn.unsafe(`SET TRANSACTION SNAPSHOT '${snapshotId}'`);
    const { rows, checksum: ck } = await checksum(copyConn, table, orderBy, where, columns);
    const fileHash = createHash('sha256');
    const hashTap = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        fileHash.update(chunk);
        cb(null, chunk);
      },
    });
    const readable = await copyConn.unsafe(query).readable();
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
      hashTap.on('error', reject);
      if (gzip) {
        const z = createGzip({ level: gzipLevel });
        z.on('error', reject);
        readable.pipe(z).pipe(hashTap).pipe(dest);
      } else {
        readable.pipe(hashTap).pipe(dest);
      }
    });
    // No COMMIT: after a COPY the connection is wedged in copy-out mode (see
    // above) and a COMMIT on it never returns. The transaction is READ ONLY,
    // so ending the connection releases it with nothing lost.
    await copyConn.end();

    const { size } = await (await import('node:fs/promises')).stat(path);
    const sha256 = fileHash.digest('hex');
    tables.push({ table, rows, checksum: ck, bytes: size, file, columns, sha256, compression: gzip ? 'gzip' : null });
    console.log(`  ${table.padEnd(28)} ${String(rows).padStart(9)} rows  ${ck}  ${size} bytes  ${new Date().toISOString()}`);
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
    consistency: { isolation: 'repeatable read', snapshotId },
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
  await snapHolder.unsafe('COMMIT');
  await snapHolder.end();
  await sql.end();
}

/**
 * **Run only when this file IS the command, never when it is imported.**
 *
 * This was a bare `main()` call at module scope, so `import { SERVING_TABLES }`
 * performed a complete release export as a side effect. A test written against
 * the export contract discovered it by writing 58 MB to `release/` on its first
 * run — which is the harmless version. The same import from a running service,
 * or from a script that only wanted the table list, would open a second
 * connection pool and stream the corpus to disk for no reason.
 *
 * `process.argv[1]` is the script node was actually asked to run. Comparing it
 * to this module's own path is the check, and it is done on a normalised
 * `file:` URL because Windows argv paths are backslashed while `import.meta.url`
 * is not.
 */
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  const normalise = (p: string): string => p.replace(/\\/g, '/').replace(/^file:\/\/\/?/, '');
  return normalise(import.meta.url).endsWith(normalise(entry));
})();

if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
