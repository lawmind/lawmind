#!/usr/bin/env node
/**
 * LCC R32A — GATE-C FOOTPRINT, MEASURED FROM THE LIVE CATALOGUE.
 *
 * Read-only. Every number here comes from PostgreSQL's own size functions on
 * the live accepted database, never from a dump size or a remembered figure.
 * The corpus/user split is the one `ops/db-roles.ts` defines, and the release
 * set is the one `ops/release-export-cli.ts` enumerates, both imported rather
 * than copied so the classification cannot drift from the code.
 *
 *   pnpm exec tsx scripts/lcc-r32a-footprint.mjs --out docs/ai/lcc-r32a
 */
import { readFileSync, writeFileSync, mkdirSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

import { CORPUS_TABLES, USER_TABLES } from '../services/api/src/ops/db-roles.ts';
import { SERVING_TABLES } from '../services/api/src/ops/release-export-cli.ts';
import { SEARCH_CRITICAL_TABLES } from '../services/api/src/release/activation.ts';

const outDir = process.argv[process.argv.indexOf('--out') + 1] ?? 'docs/ai/lcc-r32a';

function envUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const line = readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('DATABASE_URL='));
  return line.slice('DATABASE_URL='.length).trim();
}

const GIB = 1024 ** 3;
const gib = (b) => Math.round((Number(b) / GIB) * 1000) / 1000;

// Tables the lexical/structured request path reads that the export manifest
// does not carry. Established from the source (search/retrieve.ts
// fillParagraphFallback), recorded here so the sizing cannot omit them.
const REQUEST_PATH_OUTSIDE_MANIFEST = ['judgment_paragraphs'];
// Retrieval representations whose only serving reader is the dense arm, which
// is disabled for current-v1 (public semantic search off, HNSW deferred).
const DEFERRED = ['judgment_chunks', 'new1_doc_vector_stage', 'new1_tranche_passages'];

const serving = new Set(SERVING_TABLES.map((t) => t.table));
const corpus = new Set(CORPUS_TABLES);
const user = new Set(USER_TABLES);

function classify(name) {
  if (serving.has(name)) return 'CURRENT_V1_REQUIRED';
  if (REQUEST_PATH_OUTSIDE_MANIFEST.includes(name))
    return 'CURRENT_V1_REQUIRED_NOT_IN_EXPORT_MANIFEST';
  if (DEFERRED.includes(name)) return 'DEFERRED_CAPABILITY_DATA';
  if (corpus.has(name)) return 'CURRENT_V1_PRESENT_BUT_NOT_REQUEST_PATH';
  if (user.has(name)) return 'USER_PLANE';
  return 'UNKNOWN';
}

const sql = postgres(envUrl(), { max: 1, idle_timeout: 5 });
try {
  await sql`SET statement_timeout = '120s'`;
  const [server] = await sql`
    SELECT current_database() AS db, version() AS version,
           current_setting('shared_buffers') AS shared_buffers,
           current_setting('work_mem') AS work_mem,
           current_setting('maintenance_work_mem') AS maintenance_work_mem,
           current_setting('max_connections') AS max_connections,
           current_setting('server_version_num') AS server_version_num,
           pg_database_size(current_database())::bigint AS db_bytes`;
  const databases = await sql`
    SELECT datname, pg_database_size(datname)::bigint AS bytes
      FROM pg_database WHERE datallowconn ORDER BY 2 DESC`;

  const rels = await sql`
    SELECT c.relname AS name, n.nspname AS schema,
           pg_relation_size(c.oid)::bigint AS heap,
           pg_indexes_size(c.oid)::bigint AS indexes,
           COALESCE(pg_total_relation_size(NULLIF(c.reltoastrelid, 0)), 0)::bigint AS toast,
           pg_total_relation_size(c.oid)::bigint AS total,
           c.reltuples::bigint AS est_rows,
           s.n_live_tup::bigint AS live, s.n_dead_tup::bigint AS dead
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
     WHERE c.relkind IN ('r', 'p', 'm')
       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
       AND n.nspname NOT LIKE 'pg_toast%'
     ORDER BY pg_total_relation_size(c.oid) DESC`;

  const indexes = await sql`
    SELECT i.relname AS index, t.relname AS "table", am.amname AS method,
           pg_relation_size(i.oid)::bigint AS bytes
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class t ON t.oid = x.indrelid
      JOIN pg_am am ON am.oid = i.relam
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
     ORDER BY 4 DESC LIMIT 40`;

  const [wal] =
    await sql`SELECT COALESCE(sum(size), 0)::bigint AS bytes, count(*)::int AS files FROM pg_ls_waldir()`;
  const [tmp] = await sql`
    SELECT temp_files::bigint, temp_bytes::bigint, stats_reset FROM pg_stat_database WHERE datname = current_database()`;
  const [ext] =
    await sql`SELECT json_agg(json_build_object('name', extname, 'version', extversion)) AS list FROM pg_extension`;

  const byClass = {};
  const rows = rels.map((r) => {
    const cls = r.schema === 'public' ? classify(r.name) : 'UNKNOWN';
    const b = (byClass[cls] ??= { heap: 0, indexes: 0, toast: 0, total: 0, relations: 0 });
    for (const k of ['heap', 'indexes', 'toast', 'total']) b[k] += Number(r[k]);
    b.relations += 1;
    return {
      name: r.schema === 'public' ? r.name : `${r.schema}.${r.name}`,
      class: cls,
      heapGiB: gib(r.heap),
      indexesGiB: gib(r.indexes),
      toastGiB: gib(r.toast),
      totalGiB: gib(r.total),
      totalBytes: Number(r.total),
      estRows: Number(r.est_rows),
      deadTupleRatio:
        r.live == null || Number(r.live) + Number(r.dead) === 0
          ? null
          : Math.round((Number(r.dead) / (Number(r.live) + Number(r.dead))) * 10000) / 10000,
    };
  });
  for (const v of Object.values(byClass))
    for (const k of ['heap', 'indexes', 'toast', 'total']) v[`${k}GiB`] = gib(v[k]);

  const sumOf = (names) =>
    rels
      .filter((r) => r.schema === 'public' && names.has(r.name))
      .reduce(
        (a, r) => ({
          heap: a.heap + Number(r.heap),
          indexes: a.indexes + Number(r.indexes),
          toast: a.toast + Number(r.toast),
          total: a.total + Number(r.total),
        }),
        { heap: 0, indexes: 0, toast: 0, total: 0 },
      );
  const withGib = (o) =>
    Object.fromEntries(
      Object.entries(o).flatMap(([k, v]) => [
        [`${k}Bytes`, v],
        [`${k}GiB`, gib(v)],
      ]),
    );

  const gateCSet = new Set([...serving, ...REQUEST_PATH_OUTSIDE_MANIFEST]);
  const present = new Set(rels.filter((r) => r.schema === 'public').map((r) => r.name));
  const userSum = sumOf(user);
  const corpusAll = sumOf(new Set([...present].filter((n) => !user.has(n))));

  let disk = null;
  try {
    const s = statfsSync('C:\\');
    disk = { volume: 'C:', freeGiB: gib(s.bavail * s.bsize), sizeGiB: gib(s.blocks * s.bsize) };
  } catch {
    /* not load-bearing */
  }

  const report = {
    kind: 'lcc-r32a-footprint',
    measuredAt: new Date().toISOString(),
    method:
      'pg_database_size / pg_relation_size / pg_indexes_size / pg_total_relation_size on the live accepted database; read-only',
    server: { ...server, db_bytes: Number(server.db_bytes), dbGiB: gib(server.db_bytes) },
    extensions: ext.list,
    databases: databases.map((d) => ({
      name: d.datname,
      bytes: Number(d.bytes),
      gib: gib(d.bytes),
    })),
    physicalLayout:
      'single cluster, single database: corpus and user planes share `' +
      server.db +
      '` locally (DB_SPLIT_MODE unset). Plane sizes below are the db-roles.ts partition of it.',
    planes: {
      corpusAllTables: withGib(corpusAll),
      user: withGib(userSum),
      exportManifest: { tables: [...serving], ...withGib(sumOf(serving)) },
      gateCRequired: { tables: [...gateCSet], ...withGib(sumOf(gateCSet)) },
      searchCriticalForActivation: {
        tables: [...SEARCH_CRITICAL_TABLES],
        ...withGib(sumOf(new Set(SEARCH_CRITICAL_TABLES))),
      },
      deferred: {
        tables: DEFERRED.filter((t) => present.has(t)),
        ...withGib(sumOf(new Set(DEFERRED))),
      },
      nonTableOverheadGiB: gib(
        Number(server.db_bytes) - rels.reduce((a, r) => a + Number(r.total), 0),
      ),
    },
    byClass,
    missingFromDatabase: [...gateCSet].filter((t) => !present.has(t)),
    topRelations: rows.slice(0, 30),
    topIndexes: indexes.map((i) => ({ ...i, bytes: Number(i.bytes), gib: gib(i.bytes) })),
    wal: { bytes: Number(wal.bytes), gib: gib(wal.bytes), files: wal.files },
    tempSinceReset: {
      files: Number(tmp.temp_files),
      bytes: Number(tmp.temp_bytes),
      gib: gib(tmp.temp_bytes),
      since: tmp.stats_reset,
    },
    workstationDisk: disk,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'footprint.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        db: report.server.dbGiB,
        planes: report.planes,
        missing: report.missingFromDatabase,
        wal: report.wal,
        temp: report.tempSinceReset,
      },
      null,
      1,
    ),
  );
} finally {
  await sql.end();
}
