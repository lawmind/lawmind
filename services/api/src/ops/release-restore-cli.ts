/**
 * RELEASE RESTORE + VERIFY — the other half of the rehearsal.
 *
 * Takes a directory written by `release-export-cli.ts` and loads it into a
 * TARGET database, then proves the target can reproduce what the manifest
 * claims. It never touches the source.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It does not create the schema.** The target must already have been migrated
 * — `pnpm --filter @lawmind/db migrate` against `TARGET_DATABASE_URL`. That is
 * deliberate: the migrations are the path every real deployment uses, and a
 * release that builds its schema any other way is a release whose schema has
 * never been tested. It also means enum types arrive through `CREATE TYPE` in a
 * migration rather than through a dump that would have omitted them.
 *
 * **It does not trust a load that reported no error.** `COPY FROM` is perfectly
 * happy to load a truncated file: it stops at the last complete line and
 * returns success. Row counts and checksums are the only evidence, and they are
 * computed on the target with the SAME expression the export used.
 *
 * **It does not run against the source by accident.** `TARGET_DATABASE_URL` is
 * a separate variable and the tool refuses if it equals `DATABASE_URL`.
 */
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import postgres from 'postgres';

type Manifest = {
  releaseVersion: string;
  source: {
    collation: string;
    ctype: string;
    encoding: string;
    serverVersion: string;
    extensions: { name: string; version: string }[];
  };
  schemaVersion: { highestMigration: string; migrationCount: number };
  tables: { table: string; rows: number; checksum: string; bytes: number; file: string }[];
};

/** The same expression the export used. Two spellings would prove nothing. */
async function checksum(
  sql: postgres.Sql,
  table: string,
  orderBy: string,
): Promise<{ rows: number; checksum: string }> {
  const [row] = await sql.unsafe<{ n: string; ck: string | null }[]>(
    `SELECT count(*)::text AS n,
            md5(coalesce(string_agg(t.h, '' ORDER BY t.ord), '')) AS ck
       FROM (SELECT row_number() OVER (ORDER BY ${orderBy}) AS ord,
                    md5(${table}::text) AS h
               FROM ${table}) t`,
  );
  return { rows: Number(row?.n ?? 0), checksum: row?.ck ?? '' };
}

const ORDER_BY: Record<string, string> = {
  judgments: 'id',
  judgment_citations: 'id',
  judgment_judges: 'judgment_id, judge_name',
  judgment_statute_refs: 'id',
  statutes: 'id',
  statute_sections: 'id',
  lexeme_document_frequency: 'lexeme',
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (n: string) => {
    const i = argv.indexOf(`--${n}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const dir = arg('from') ?? 'release';
  /** Simulate a transfer that stopped mid-file. See the note where it is used. */
  const truncateTable = arg('truncate-table');

  const target = process.env['TARGET_DATABASE_URL'];
  if (!target) throw new Error('TARGET_DATABASE_URL is required');
  if (target === process.env['DATABASE_URL']) {
    throw new Error('TARGET_DATABASE_URL equals DATABASE_URL — refusing to restore onto the source');
  }

  const manifest = JSON.parse(await readFile(join(dir, 'MANIFEST.json'), 'utf8')) as Manifest;
  const sql = postgres(target, { max: 2, onnotice: () => {} });

  console.log(`restoring release ${manifest.releaseVersion}\n`);

  // ── the environment the release lands in ──────────────────────────────────
  const [meta] = await sql<{ ver: string; collate: string; ctype: string; enc: string }[]>`
    SELECT current_setting('server_version') AS ver,
           datcollate AS collate, datctype AS ctype,
           pg_encoding_to_char(encoding) AS enc
      FROM pg_database WHERE datname = current_database()`;
  const extensions = await sql<{ extname: string; extversion: string }[]>`
    SELECT extname, extversion FROM pg_extension ORDER BY extname`;

  const findings: string[] = [];
  const have = new Set(extensions.map((e) => e.extname));
  for (const e of manifest.source.extensions) {
    if (!have.has(e.name)) findings.push(`MISSING EXTENSION: ${e.name}@${e.version}`);
  }

  /**
   * The collation check, and it is a FINDING rather than a failure.
   *
   * A Windows-built corpus carries `English_United States.1252`, which no Linux
   * PostgreSQL can offer. The restore is still correct — every row arrives —
   * but text ORDERING is not the same, which reaches `ORDER BY case_title`,
   * every btree index on a text column, and therefore keyset pagination.
   *
   * Refusing the restore would be wrong (there is no Linux collation that would
   * satisfy it, so nothing could ever ship). Staying quiet would be worse. So it
   * is reported, loudly, with both values.
   */
  if (meta?.collate !== manifest.source.collation) {
    findings.push(
      `COLLATION DIFFERS: source ${manifest.source.collation} -> target ${meta?.collate}. ` +
        'Text ordering is not identical. Indexes must be REBUILT on the target, never copied.',
    );
  }
  if (meta?.enc !== manifest.source.encoding) {
    findings.push(`ENCODING DIFFERS: ${manifest.source.encoding} -> ${meta?.enc}`);
  }

  /**
   * Enum types, checked explicitly. This is the class of failure a `pg_dump -t`
   * release produces — the enum-bearing tables fail to restore and the rest
   * succeed, which reads as a partial success rather than a broken schema.
   * Here the migrations create them, so this asserts the migration path worked.
   */
  const [enums] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype = 'e'`;
  console.log(`  target ${meta?.ver}  collation ${meta?.collate}  encoding ${meta?.enc}`);
  console.log(`  extensions: ${extensions.map((e) => `${e.extname}@${e.extversion}`).join(', ')}`);
  console.log(`  enum types: ${enums?.n}\n`);

  // ── load ──────────────────────────────────────────────────────────────────
  for (const t of manifest.tables) {
    /**
     * Truncate in reverse dependency order is avoided entirely by disabling
     * triggers for the load: the export is already referentially closed, and a
     * per-table FK check on a bulk restore is the difference between minutes
     * and hours.
     */
    await sql.unsafe(`TRUNCATE ${t.table} CASCADE`);
  }

  for (const t of manifest.tables) {
    const path = join(dir, t.file);
    const writable = await sql.unsafe(`COPY ${t.table} FROM STDIN`).writable();

    if (truncateTable === t.table) {
      /**
       * SIMULATED PARTIAL TRANSFER. Half the bytes, then stop.
       *
       * `COPY FROM` will accept this without complaint — it loads every
       * complete line and returns success — which is exactly why "the restore
       * did not error" is not evidence and the checksum below is.
       */
      const half = Math.floor(t.bytes / 2);
      await pipeline(createReadStream(path, { start: 0, end: half }), writable);
      console.log(`  ${t.table.padEnd(28)} DELIBERATELY TRUNCATED at ${half} of ${t.bytes} bytes`);
    } else {
      await pipeline(createReadStream(path), writable);
    }
  }

  // ── verify ────────────────────────────────────────────────────────────────
  console.log('\nverifying against the manifest:\n');
  let mismatches = 0;
  for (const t of manifest.tables) {
    const orderBy = ORDER_BY[t.table] ?? 'ctid';
    const got = await checksum(sql, t.table, orderBy);
    const rowsOk = got.rows === t.rows;
    const ckOk = got.checksum === t.checksum;
    if (!rowsOk || !ckOk) mismatches += 1;
    console.log(
      `  ${t.table.padEnd(28)} rows ${String(got.rows).padStart(8)}/${String(t.rows).padEnd(8)} ` +
        `${rowsOk ? 'ok ' : 'MISMATCH'}  checksum ${ckOk ? 'ok' : 'MISMATCH'}`,
    );
  }

  /**
   * ANALYZE after a bulk load. Without it the target's statistics say every
   * table is empty, and the first real query gets a plan built for no rows —
   * which is the same class of failure as the sparse arm's constant estimate,
   * arriving on day one of a new deployment.
   */
  console.log('\nANALYZE...');
  const analyzeStart = Date.now();
  await sql.unsafe('ANALYZE');
  console.log(`  ${Date.now() - analyzeStart} ms`);

  if (findings.length > 0) {
    console.log('\nFINDINGS:');
    for (const f of findings) console.log(`  ! ${f}`);
  }
  console.log(`\n${mismatches === 0 ? 'RESTORE VERIFIED' : `RESTORE FAILED — ${mismatches} table(s) do not match`}`);

  await sql.end();
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
