#!/usr/bin/env node
/**
 * The migration manifest — one JSON file describing a Postgres database
 * completely enough that two of them can be compared and a cutover decided.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS RATHER THAN "pg_restore said OK"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `pg_restore` exits 0 having skipped an extension it could not create, an
 * index it could not build, and a constraint it silently deferred. The founder
 * directive for this migration says it plainly: **do not cut over based on
 * "restore succeeded."** So the cutover decision is made by diffing two
 * manifests, not by reading an exit code.
 *
 * The same file serves STAGE A (baseline of the Railway source) and STAGE F
 * (verification of the local target). One tool, two invocations, one diff —
 * which is the only way the two sides are guaranteed to have been measured the
 * same way.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXACT COUNTS vs ESTIMATES, and why the flag exists
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `reltuples` is free and wrong — it is whatever the last ANALYZE saw, and on a
 * table taking inserts from twenty ingest workers it is wrong by construction.
 * `count(*)` on `judgment_paragraphs` (26.6M rows) is a real seq scan over a
 * shared proxy.
 *
 * Both are collected. `--exact` adds the `count(*)` pass. The rule for using
 * them: **estimates are for planning, exact counts are for the cutover
 * decision** — and the exact pass on the source is only meaningful AFTER the
 * write freeze (STAGE D), because a count taken against a moving table can only
 * ever disagree with its copy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node scripts/migration/manifest.mjs --url "$DATABASE_URL" --out a.json
 *   node scripts/migration/manifest.mjs --url "$LOCAL_DATABASE_URL" --out f.json --exact
 *   node scripts/migration/manifest.mjs --source railway --out a.json
 *
 * `--source railway` reads DATABASE_URL from .env; `--source local` reads
 * LOCAL_DATABASE_URL. Neither is ever printed — a manifest is a document that
 * gets committed, and a password in it is a credential leak that outlives the
 * migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';
import { setTimeout } from 'node:timers';
import postgres from 'postgres';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ─────────────────────────────────────────────────────────────────────────────
// Resolver bypass. Same reasoning as services/ingest/src/db-host.ts: this
// machine's only configured DNS server is the consumer router, and seven long
// passes have died to `getaddrinfo ENOTFOUND hayabusa.proxy.rlwy.net`. A
// manifest pass over 26.6M rows is exactly the kind of long pass that dies.
// Duplicated rather than imported because that module is TypeScript and this is
// a plain .mjs script runnable with no build step — the duplication is 20 lines
// and buys a tool that cannot fail to start.
// ─────────────────────────────────────────────────────────────────────────────
export const PUBLIC_RESOLVERS = ['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4'];
export const IS_IP = /^\d{1,3}(?:\.\d{1,3}){3}$/;

async function resolveDbUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { url: rawUrl, servername: null };
  }
  const hostname = parsed.hostname;
  if (hostname === '' || IS_IP.test(hostname) || hostname === 'localhost' || hostname === '127.0.0.1') {
    return { url: rawUrl, servername: null };
  }
  const resolver = new dns.promises.Resolver();
  resolver.setServers(PUBLIC_RESOLVERS);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [address] = await resolver.resolve4(hostname);
      if (address) {
        parsed.hostname = address;
        return { url: parsed.toString(), servername: hostname };
      }
    } catch {
      // Expected case on a bad resolver; fall through to the retry.
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return { url: rawUrl, servername: null };
}

export async function openDb(rawUrl, max = 2) {
  const { url, servername } = await resolveDbUrl(rawUrl);
  const local = url.includes('localhost') || url.includes('127.0.0.1');
  return postgres(url, {
    ssl: local ? false : servername ? { rejectUnauthorized: false, servername } : 'require',
    max,
    connect_timeout: 120,
    idle_timeout: 0,
    // A count(*) over 26.6M rows through a shared proxy is not a hung query.
    statement_timeout: 0,
    onnotice: () => {},
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Env
// ─────────────────────────────────────────────────────────────────────────────
function readEnvFile() {
  const out = {};
  const file = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Strips the password so a manifest can be committed. */
function redact(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '<unparseable>';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The queries. Each answers one question the cutover decision needs.
// ─────────────────────────────────────────────────────────────────────────────

async function collect(sql, { exact }) {
  const m = {};

  const [ver] = await sql`SELECT version() AS v, current_setting('server_version_num') AS num,
                                 current_database() AS db, current_user AS usr`;
  m.server = {
    version: ver.v,
    versionNum: Number(ver.num),
    majorVersion: Math.floor(Number(ver.num) / 10000),
    database: ver.db,
    user: ver.usr,
  };

  const [size] = await sql`SELECT pg_database_size(current_database()) AS bytes`;
  m.databaseSizeBytes = Number(size.bytes);

  m.extensions = (
    await sql`SELECT extname AS name, extversion AS version, n.nspname AS schema
              FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
              ORDER BY extname`
  ).map((r) => ({ name: r.name, version: r.version, schema: r.schema }));

  m.schemas = (
    await sql`SELECT nspname AS name FROM pg_namespace
              WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'
              ORDER BY nspname`
  ).map((r) => r.name);

  // Roles matter because a restore that cannot find an owner reassigns silently.
  m.roles = (
    await sql`SELECT rolname AS name, rolsuper AS super, rolcanlogin AS canlogin
              FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%' ORDER BY rolname`
  ).map((r) => ({ name: r.name, super: r.super, canlogin: r.canlogin }));

  // Enum types: the `verified_by_source` and `overruled_status` values are
  // product-critical, and a missing enum label is a restore failure that only
  // shows up when a row is written months later.
  m.enums = (
    await sql`SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
              FROM pg_type t
              JOIN pg_enum e ON e.enumtypid = t.oid
              JOIN pg_namespace n ON n.oid = t.typnamespace
              WHERE n.nspname = 'public'
              GROUP BY t.typname ORDER BY t.typname`
  ).map((r) => ({ name: r.name, labels: r.labels }));

  const tables = await sql`
    SELECT c.relname AS name,
           c.reltuples::bigint AS est_rows,
           pg_total_relation_size(c.oid) AS total_bytes,
           pg_relation_size(c.oid) AS heap_bytes,
           pg_indexes_size(c.oid) AS index_bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname`;

  m.tables = tables.map((t) => ({
    name: t.name,
    estRows: Number(t.est_rows),
    totalBytes: Number(t.total_bytes),
    heapBytes: Number(t.heap_bytes),
    indexBytes: Number(t.index_bytes),
    exactRows: null,
  }));

  // Columns. A dropped column or a changed type is the kind of thing a restore
  // gets right 99% of the time, and the 1% is a product defect.
  // `generated` is captured because its absence cost a failed restore and would
  // have cost worse than that. A STORED generated column must be un-generated to
  // load a binary COPY into it, and if it is not generated again afterwards the
  // structure still looks identical here — same name, same type, same
  // nullability — while the column silently stops being maintained on write.
  // For `judgments.full_text_tsv` that is full-text search rotting from the next
  // INSERT onward, with nothing failing loudly at any point.
  m.columns = (
    await sql`SELECT table_name AS t, column_name AS c, data_type AS ty,
                     is_nullable AS nullable, column_default AS dflt,
                     is_generated AS gen, generation_expression AS genexpr
              FROM information_schema.columns
              WHERE table_schema = 'public'
              ORDER BY table_name, ordinal_position`
  ).map((r) => ({
    table: r.t,
    column: r.c,
    type: r.ty,
    nullable: r.nullable === 'YES',
    default: r.dflt,
    generated: r.gen !== 'NEVER',
    generationExpression: r.genexpr ?? null,
  }));

  m.indexes = (
    await sql`SELECT i.relname AS name, t.relname AS table, pg_get_indexdef(i.oid) AS def,
                     pg_relation_size(i.oid) AS bytes, s.idx_scan AS scans
              FROM pg_class i
              JOIN pg_index x ON x.indexrelid = i.oid
              JOIN pg_class t ON t.oid = x.indrelid
              JOIN pg_namespace n ON n.oid = i.relnamespace
              LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
              WHERE n.nspname = 'public' AND i.relkind = 'i'
              ORDER BY i.relname`
  ).map((r) => ({
    name: r.name,
    table: r.table,
    def: r.def,
    bytes: Number(r.bytes),
    scans: r.scans === null ? null : Number(r.scans),
  }));

  m.constraints = (
    await sql`SELECT c.conname AS name, t.relname AS table, c.contype AS type,
                     pg_get_constraintdef(c.oid) AS def, c.convalidated AS validated
              FROM pg_constraint c
              JOIN pg_class t ON t.oid = c.conrelid
              JOIN pg_namespace n ON n.oid = t.relnamespace
              WHERE n.nspname = 'public'
              ORDER BY c.conname`
  ).map((r) => ({ name: r.name, table: r.table, type: r.type, def: r.def, validated: r.validated }));

  // Sequences carry `last_value`. A restored sequence left at 1 hands out
  // primary keys that already exist — the classic post-migration data-loss bug,
  // and it does not surface until the first insert after cutover.
  m.sequences = (
    await sql`SELECT sequencename AS name, last_value AS last, start_value AS start, increment_by AS inc
              FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename`
  ).map((r) => ({
    name: r.name,
    lastValue: r.last === null ? null : String(r.last),
    startValue: String(r.start),
    increment: String(r.inc),
  }));

  m.views = (
    await sql`SELECT viewname AS name FROM pg_views WHERE schemaname = 'public' ORDER BY viewname`
  ).map((r) => r.name);

  m.matviews = (
    await sql`SELECT matviewname AS name FROM pg_matviews WHERE schemaname = 'public' ORDER BY matviewname`
  ).map((r) => r.name);

  m.functions = (
    await sql`SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' ORDER BY p.proname, args`
  ).map((r) => `${r.name}(${r.args})`);

  // Large objects: pg_dump handles them, but only with the right flags, and a
  // silent zero here is the difference between "none exist" and "none copied".
  const [lo] = await sql`SELECT count(*)::bigint AS n FROM pg_largeobject_metadata`;
  m.largeObjects = Number(lo.n);

  if (exact) {
    m.exactCountsTakenAt = new Date().toISOString();
    for (const t of m.tables) {
      const started = Date.now();
      const [row] = await sql.unsafe(`SELECT count(*)::bigint AS n FROM public."${t.name}"`);
      t.exactRows = Number(row.n);
      process.stderr.write(`  count ${t.name} = ${t.exactRows} (${Date.now() - started}ms)\n`);
    }
  }

  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { url: null, out: null, exact: false, source: null, label: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--url') a.url = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--exact') a.exact = true;
    else if (k === '--source') a.source = argv[++i];
    else if (k === '--label') a.label = argv[++i];
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = { ...readEnvFile(), ...process.env };

  let url = args.url;
  if (!url && args.source === 'railway') url = env.DATABASE_URL;
  if (!url && args.source === 'local') url = env.LOCAL_DATABASE_URL;
  if (!url) url = env.DATABASE_URL;

  if (!url) {
    console.error('No database url. Pass --url, or --source railway|local with the matching env var set.');
    process.exit(2);
  }

  const sql = await openDb(url, 2);
  const startedAt = new Date().toISOString();
  process.stderr.write(`manifest: connecting to ${redact(url)}\n`);

  let m;
  try {
    m = await collect(sql, { exact: args.exact });
  } finally {
    await sql.end({ timeout: 5 });
  }

  m.meta = {
    label: args.label ?? args.source ?? 'unlabelled',
    url: redact(url),
    startedAt,
    finishedAt: new Date().toISOString(),
    exact: args.exact,
    tool: 'scripts/migration/manifest.mjs',
  };

  const json = JSON.stringify(m, null, 2);
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, json);
    process.stderr.write(`manifest: wrote ${args.out} (${(json.length / 1024).toFixed(0)} KB)\n`);
  } else {
    process.stdout.write(json);
  }

  process.stderr.write(
    `manifest: pg ${m.server.majorVersion} · ${m.tables.length} tables · ` +
      `${m.indexes.length} indexes · ${m.extensions.length} extensions · ` +
      `${(m.databaseSizeBytes / 1024 ** 3).toFixed(1)} GB\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('manifest.mjs')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
