#!/usr/bin/env node
/**
 * pg_dump the Railway source into a directory-format archive.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY pg_dump AND NOT LOGICAL REPLICATION — measured, not assumed
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The founder directive said to measure a more efficient PostgreSQL-native
 * method first if one is demonstrably safe under Railway privileges. It was
 * measured. It is not available, and it would not have won:
 *
 *   source wal_level          = replica   (logical replication needs `logical`)
 *   changing it               = a Railway Postgres RESTART, a founder action,
 *                               and an interruption to the ingest fleet
 *   every table has a PK      = yes, so replica identity was NOT the blocker
 *   current_user is superuser = yes, with rolreplication
 *
 * So the only thing standing in the way is a restart — but even granted, it
 * loses on the two things that matter:
 *
 * 1. **It does not make the copy faster.** Logical replication's initial table
 *    sync copies all 104 GB over the same proxy. Total transfer time is
 *    identical; only the final cutover delta shrinks.
 * 2. **It adds a failure mode that is worse than a long freeze.** A replication
 *    slot that falls behind retains WAL *on the source*. A 104 GB initial sync
 *    over a proxy that has already killed seven long passes with DNS failures
 *    is exactly the workload that falls behind — and the consequence is
 *    Railway's disk filling up mid-migration. Trading a long authorised pause
 *    for a risk of running the source out of disk is a bad trade.
 *
 * The founder authorised the pause explicitly. So: pg_dump, which the directive
 * names as acceptable, and no custom protocol.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FORMAT CHOICES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `--format=directory` because it is the only format pg_restore can restore in
 * PARALLEL, and index builds across 167 indexes are the restore's long pole.
 * `--compress=zstd` because the bulk of this corpus is `judgments.full_text` —
 * highly compressible legal prose — and zstd gives gzip-class ratios at several
 * times the speed, which matters when the compressor is racing a network.
 *
 * `--no-owner --no-privileges`: the source has exactly one role, `postgres`,
 * and so does the target. Carrying ownership statements only creates a way for
 * the restore to fail on a role mismatch that has no upside.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node scripts/migration/dump.mjs --schema-only
 *   node scripts/migration/dump.mjs --tables judgment_citations   # throughput probe
 *   node scripts/migration/dump.mjs --full                        # STAGE E
 *
 * Every run writes a receipt JSON beside the archive: what was asked for, when
 * it started and finished, the archive's size, and the source LSN at snapshot
 * time. The LSN is the part that matters — it is the answer to "what point in
 * the source's history is this copy?", which no file timestamp can give.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';
import { setTimeout } from 'node:timers';
import { spawn } from 'node:child_process';
import { PG, pgEnv } from './pg-local.mjs';
import { openDb, PUBLIC_RESOLVERS, IS_IP } from './manifest.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const exe = (n) => path.join(PG.bin, `${n}.exe`);

function readEnvFile() {
  const out = {};
  const f = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(f)) return out;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function redact(u) {
  try {
    const x = new URL(u);
    if (x.password) x.password = '***';
    return x.toString();
  } catch {
    return '<unparseable>';
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TAKING THE OS RESOLVER OUT OF pg_dump'S PATH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `services/ingest/src/db-host.ts` documents the root cause at length: this
 * machine's only configured DNS server is the consumer router, and seven long
 * passes have died with `getaddrinfo ENOTFOUND hayabusa.proxy.rlwy.net`. That
 * module solves it for Node by resolving through public resolvers and handing
 * the driver an address.
 *
 * pg_dump is libpq, not Node, so none of that applies to it — and a dump of
 * this database runs for hours, which is precisely the exposure that keeps
 * killing things here. libpq has a native answer that Node's driver did not:
 *
 *   host=hayabusa.proxy.rlwy.net  hostaddr=1.2.3.4
 *
 * `hostaddr` supplies the address to connect to; `host` is still used for TLS
 * SNI and certificate verification. So the OS resolver is bypassed WITHOUT
 * breaking TLS — which is why this is better than simply substituting the IP
 * into the URL, and why the URL form is not used here.
 *
 * `keepalives` are set for the same reason: a directory-format dump of
 * `judgments` streams for hours through a proxy that will otherwise drop an
 * apparently idle connection mid-table.
 *
 * If resolution fails, the ORIGINAL url is returned unchanged — the same
 * fail-open rule db-host.ts uses. A resolver helper that can fail closed is a
 * way to take the migration down over a network hiccup.
 */
export async function libpqConnString(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return { conn: rawUrl, note: 'url not parseable, passed through unchanged' };
  }
  if (IS_IP.test(u.hostname) || u.hostname === 'localhost') {
    return { conn: rawUrl, note: 'already an address' };
  }

  let address = null;
  const resolver = new dns.promises.Resolver();
  resolver.setServers(PUBLIC_RESOLVERS);
  for (let i = 0; i < 3 && !address; i++) {
    try {
      const [a] = await resolver.resolve4(u.hostname);
      address = a ?? null;
    } catch {
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  if (!address) return { conn: rawUrl, note: 'public resolvers did not answer; using the url unchanged' };

  const kv = [
    `host=${u.hostname}`,
    `hostaddr=${address}`,
    `port=${u.port || 5432}`,
    `dbname=${u.pathname.replace(/^\//, '')}`,
    `user=${decodeURIComponent(u.username)}`,
    `password=${decodeURIComponent(u.password)}`,
    'sslmode=require',
    // Hours-long streams through a shared proxy.
    'keepalives=1',
    'keepalives_idle=30',
    'keepalives_interval=10',
    'keepalives_count=6',
    // Not connect_timeout: db-host.ts already established that a stalled
    // getaddrinfo never reaches the point where connect_timeout applies. This
    // covers the different case of a proxy that accepts and then stalls.
    'connect_timeout=120',
  ];
  return { conn: kv.join(' '), note: `hostaddr=${address} (OS resolver bypassed, SNI keeps ${u.hostname})` };
}

function dirSize(dir) {
  let total = 0;
  let files = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        total += fs.statSync(p).size;
        files++;
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return { bytes: total, files };
}

const GB = 1024 ** 3;
const fmtGB = (b) => (b / GB).toFixed(2);

/**
 * The source's write position at the moment of the dump. Recorded because
 * "which snapshot is this?" must be answerable later from the archive alone —
 * a filesystem mtime tells you when a file was written, not what it contains.
 */
async function sourceLsnAndCounts(url) {
  const sql = await openDb(url, 1);
  try {
    // ESTIMATE, not count(*), and this is a correction to how this function was
    // first written. The exact count looked like a free nicety for the receipt;
    // it is a parallel sequential scan of 6.4M rows through a shared proxy
    // against a database that is simultaneously autovacuuming `judgments`, and
    // it held the dump at the starting line for over ten minutes without a
    // single byte moving.
    //
    // It was also the wrong instrument for the job. Verification does not read
    // this field — `compare.mjs` takes exact counts from `manifest.mjs --exact`
    // on BOTH sides, which is the only comparison that means anything. What the
    // receipt actually needs is the answer to "which point in the source's
    // history is this copy?", and that is the LSN, which costs nothing.
    const [p] = await sql`SELECT pg_current_wal_lsn()::text AS lsn, now() AS at,
                                 pg_database_size(current_database()) AS bytes`;
    const [j] = await sql`SELECT reltuples::bigint AS n FROM pg_class WHERE relname = 'judgments'`;
    return {
      lsn: p.lsn,
      at: p.at,
      databaseSizeBytes: Number(p.bytes),
      judgmentsEstimatedAtSnapshot: Number(j?.n ?? -1),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function runStreaming(cmd, args, env, logPath) {
  return new Promise((resolve) => {
    const log = fs.createWriteStream(logPath, { flags: 'a' });
    log.write(`\n=== ${new Date().toISOString()} ${path.basename(cmd)} ===\n`);
    const child = spawn(cmd, args, { env, windowsHide: true });
    child.stdout.on('data', (d) => {
      log.write(d);
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      log.write(d);
      process.stderr.write(d);
    });
    child.on('close', (code) => {
      log.end();
      resolve(code);
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const schemaOnly = argv.includes('--schema-only');
  const full = argv.includes('--full');
  const jobs = argv.includes('--jobs') ? Number(argv[argv.indexOf('--jobs') + 1]) : 4;
  const tables = argv.includes('--tables')
    ? argv[argv.indexOf('--tables') + 1].split(',').map((s) => s.trim())
    : [];
  const outName =
    (argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null) ??
    (schemaOnly ? 'schema' : tables.length ? `tables-${tables.join('-')}` : 'full');

  if (!schemaOnly && !full && tables.length === 0) {
    console.error('Pass one of --schema-only, --full, or --tables a,b,c');
    process.exit(2);
  }

  const env = { ...readEnvFile(), ...process.env };
  const url = env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set.');
    process.exit(2);
  }

  const outDir = path.join(PG.dump, outName);
  if (fs.existsSync(outDir)) {
    console.log(`dump: removing previous archive at ${outDir}`);
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(PG.dump, { recursive: true });
  fs.mkdirSync(PG.logs, { recursive: true });
  const logPath = path.join(PG.logs, `dump-${outName}.log`);

  console.log(`dump: source ${redact(url)}`);
  const snap = await sourceLsnAndCounts(url);
  console.log(`dump: source LSN ${snap.lsn} · ${fmtGB(snap.databaseSizeBytes)} GB · judgments ~${snap.judgmentsEstimatedAtSnapshot}`);

  const { conn, note } = await libpqConnString(url);
  console.log(`dump: connection — ${note}`);

  const args = [
    '--dbname',
    conn,
    '--format=directory',
    `--file=${outDir}`,
    '--no-owner',
    '--no-privileges',
    '--verbose',
  ];

  if (schemaOnly) {
    args.push('--schema-only');
    // A schema-only dump is a single quick transaction; parallelism buys nothing
    // and costs extra proxy connections.
  } else {
    args.push(`--jobs=${jobs}`);
    // zstd:3 — see the header. Level 3 is zstd's default and the point on the
    // curve where more compression starts costing more than the network saves.
    args.push('--compress=zstd:3');
    // The archive is verified by checksum and re-read afterwards; fsyncing every
    // file as it is written doubles the write cost for a guarantee we then go on
    // to check directly anyway.
    args.push('--no-sync');
  }
  for (const t of tables) args.push('--table', `public.${t}`);

  const started = Date.now();
  console.log(`dump: pg_dump ${schemaOnly ? '--schema-only' : `--jobs=${jobs} --compress=zstd:3`} -> ${outDir}`);
  const code = await runStreaming(exe('pg_dump'), args, { ...pgEnv(), PGPASSWORD: undefined }, logPath);
  const elapsedS = (Date.now() - started) / 1000;

  const size = dirSize(outDir);
  const receipt = {
    tool: 'scripts/migration/dump.mjs',
    name: outName,
    mode: schemaOnly ? 'schema-only' : tables.length ? 'tables' : 'full',
    tables,
    jobs: schemaOnly ? 1 : jobs,
    compression: schemaOnly ? 'none' : 'zstd:3',
    exitCode: code,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedSeconds: Math.round(elapsedS),
    archiveDir: outDir,
    archiveBytes: size.bytes,
    archiveFiles: size.files,
    source: {
      url: redact(url),
      lsn: snap.lsn,
      snapshotAt: snap.at,
      databaseSizeBytes: snap.databaseSizeBytes,
      judgmentsEstimatedAtSnapshot: snap.judgmentsEstimatedAtSnapshot,
    },
    // The number the freeze window is planned from. Compressed-out-per-second,
    // not rows-per-second, because the archive size is what the next stage reads.
    archiveMBPerSecond: elapsedS > 0 ? Number((size.bytes / 1024 ** 2 / elapsedS).toFixed(2)) : null,
    logicalGBPerHour:
      elapsedS > 0 && !schemaOnly
        ? Number(((snap.databaseSizeBytes / GB) * (3600 / elapsedS)).toFixed(1))
        : null,
  };

  const receiptPath = path.join(PG.dump, `${outName}.receipt.json`);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

  console.log('');
  console.log(`dump: exit ${code} · ${Math.round(elapsedS)}s · archive ${fmtGB(size.bytes)} GB in ${size.files} files`);
  console.log(`dump: receipt ${receiptPath}`);
  if (code !== 0) {
    console.error('dump: FAILED. The archive above is incomplete and must not be restored.');
    process.exit(1);
  }
}

// Only run when invoked directly. `dump-chunked.mjs` imports `libpqConnString`
// from here, and without this guard that import EXECUTES this file's main() —
// which it did, and the chunked dump exited immediately with this file's
// "Pass one of --schema-only, --full, or --tables" usage message. A module that
// runs work on import is a module that cannot be reused.
if (process.argv[1] && path.resolve(process.argv[1]).endsWith(`${path.sep}dump.mjs`)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
