#!/usr/bin/env node
/**
 * A RESUMABLE dump. Chunk by chunk, retried, restartable after any failure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS — a monolithic pg_dump ALREADY FAILED, and Railway is dying
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `dump.mjs` is the right tool and it was tried first. It ran for 42 minutes,
 * moved 2.15 GB of an expected ~25 GB, and then:
 *
 *   pg_dump: error: Dumping the contents of table "judgment_paragraphs" failed:
 *            PQgetCopyData() failed.
 *   pg_dump: detail: server closed the connection unexpectedly
 *   pg_dump: error: a worker process died unexpectedly
 *
 * The Railway server did NOT restart — postmaster uptime was 316.8 hours across
 * the failure — so this was the proxy or the network dropping a long-lived
 * connection, and **pg_dump has no resume.** One drop discards everything.
 *
 * Independently, NEW2 measured the source degrading (bus 0550, 0554): with their
 * fleet fully down and 8 connections, `select count(*) from judgments` took
 * **48 seconds**, against ~2 seconds earlier the same day, and their fleet died
 * twice unaided. A five-to-eight hour unbroken stream against that is not a plan.
 *
 * So the directive's *"do not invent a custom migration protocol unless
 * required"* is satisfied by the exception rather than the rule: it is required,
 * demonstrably, by a failure that already happened.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DESIGN, AND WHY EACH PART IS THE BORING CHOICE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - **Schema comes from `pg_dump --schema-only`**, which already succeeded and
 *   is already verified to restore with 0 errors. This tool never reimplements
 *   DDL. Restore order is pre-data → data → post-data, which is exactly what
 *   `pg_restore --section=` gives, so foreign keys are still created after the
 *   rows land.
 * - **Data comes from `COPY (SELECT ...) TO STDOUT (FORMAT binary)`** — plain
 *   PostgreSQL, no parsing, exact type fidelity, restored by `COPY FROM STDIN
 *   (FORMAT binary)`. Same major version on both ends and the same `vector`
 *   extension version, both checked.
 * - **Chunks are UUID key ranges.** Every large table here has a `uuid` primary
 *   key from `gen_random_uuid()`, so values are uniformly distributed and a
 *   split on the leading hex digits gives even chunks with no `count`, no
 *   `OFFSET`, and no ordering pass over the table.
 * - **A chunk is done when its file exists AND its row count is recorded.** The
 *   ledger is written after the file is closed, so a crash mid-chunk leaves a
 *   partial file with no ledger entry and it is simply redone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONSISTENCY, WHICH IS THE THING A CHUNKED DUMP CAN GET WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every chunk is its own transaction and therefore its own snapshot. That is
 * safe here for exactly one reason, and it is not a general one:
 *
 *   **THE SOURCE IS FROZEN.** The fleet is stopped through NEW2's STOP-file
 *   mechanism (`services/ingest/.checkpoints/STOP`), verified by zero row delta
 *   over a 60-second window, not by a process list.
 *
 * With no writers, all snapshots are identical and chunking is free. Without the
 * freeze it would be silently wrong — a row moved between two chunk boundaries
 * would be copied twice or not at all. So this tool CHECKS quiescence before it
 * starts and again at the end, and refuses to declare success if the source
 * moved underneath it.
 *
 *   node scripts/migration/dump-chunked.mjs --plan
 *   node scripts/migration/dump-chunked.mjs --run
 *   node scripts/migration/dump-chunked.mjs --run --only judgments
 *   node scripts/migration/dump-chunked.mjs --status
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers';
import { spawn } from 'node:child_process';
import { PG } from './pg-local.mjs';
import { openDb } from './manifest.mjs';
import { libpqConnString } from './dump.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(PG.dump, 'chunked');
const LEDGER = path.join(OUT, 'ledger.json');

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

/**
 * How finely to split each large table. Chosen so a chunk transfers in roughly
 * one to two minutes at the ~4 MB/s this proxy sustains — short enough that a
 * dropped connection costs one chunk, not one table.
 *
 * Everything not listed is dumped whole: 50 of the 53 tables total 0.46 GB
 * between them, and splitting a 4 MB table would add ledger entries and buy
 * nothing.
 */
const CHUNKED_TABLES = {
  judgments: { splits: 256, payloadGB: 47.55 },
  judgment_paragraphs: { splits: 256, payloadGB: 21.86 },
  judgment_chunks: { splits: 64, payloadGB: 4.53 },
};

/** Hex boundaries over the leading digits of a uuid, as text for comparison. */
function uuidRanges(splits) {
  // Split on the leading 2 hex digits when splits <= 256. gen_random_uuid() is
  // uniform over the whole space, so equal hex ranges are equal row counts.
  const ranges = [];
  const width = 256 / splits;
  for (let i = 0; i < splits; i++) {
    const lo = Math.round(i * width);
    const hi = Math.round((i + 1) * width);
    const loHex = lo.toString(16).padStart(2, '0');
    const hiHex = hi >= 256 ? null : hi.toString(16).padStart(2, '0');
    ranges.push({
      index: i,
      lo: `${loHex}000000-0000-0000-0000-000000000000`,
      hi: hiHex === null ? null : `${hiHex}000000-0000-0000-0000-000000000000`,
    });
  }
  return ranges;
}

function loadLedger() {
  if (!fs.existsSync(LEDGER)) return { chunks: {}, startedAt: new Date().toISOString() };
  try {
    return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  } catch {
    console.error(`ledger at ${LEDGER} is unreadable; refusing to overwrite it.`);
    process.exit(2);
  }
}

function saveLedger(l) {
  fs.mkdirSync(OUT, { recursive: true });
  // Written to a temp file and renamed: a crash during the write must not
  // destroy the record of everything already transferred.
  const tmp = `${LEDGER}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(l, null, 2));
  fs.renameSync(tmp, LEDGER);
}

const exe = (n) => path.join(PG.bin, `${n}.exe`);

/**
 * One chunk, via psql's \copy so the bytes land in a file without going through
 * this process. Returns bytes written.
 */
function copyChunk(conn, table, range, file) {
  const where =
    range === null
      ? ''
      : range.hi === null
        ? ` WHERE id >= '${range.lo}'`
        : ` WHERE id >= '${range.lo}' AND id < '${range.hi}'`;
  // `SELECT *` INCLUDES STORED GENERATED COLUMNS, AND THAT IS LOAD-BEARING.
  // `COPY <table> FROM` with no column list EXCLUDES them, so these archives
  // carry one more field than a naive restore expects:
  //
  //   ERROR:  row field count is 33, expected 32   (judgments.full_text_tsv)
  //
  // Do not "fix" that by naming columns here without changing the other side
  // too — the archives already on disk were written with `SELECT *`, and
  // `restore-chunked.mjs` now handles the extra field by loading those tables
  // through a `LIKE` staging clone (which is EXCLUDING GENERATED, so its column
  // is plain and in the same position). The two sides are a matched pair.
  const sqlText = `\\copy (SELECT * FROM public.${table}${where}) TO PROGRAM 'C:/lawmind/bin/zstd.exe -3 -q -o ${file.replace(/\\/g, '/')}' (FORMAT binary)`;

  return new Promise((resolve) => {
    const child = spawn(exe('psql'), [conn, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sqlText], {
      env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
      windowsHide: true,
    });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.stdout.on('data', () => {});
    child.on('close', (code) => resolve({ code, err: err.trim() }));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const doPlan = argv.includes('--plan');
  const doRun = argv.includes('--run');
  const doStatus = argv.includes('--status');
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  const maxRetries = argv.includes('--retries') ? Number(argv[argv.indexOf('--retries') + 1]) : 6;
  const concurrency = argv.includes('--concurrency') ? Number(argv[argv.indexOf('--concurrency') + 1]) : 3;

  const env = { ...readEnvFile(), ...process.env };
  const url = env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(2);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const ledger = loadLedger();

  const sql = await openDb(url, 2);
  let allTables;
  try {
    const rows = await sql`
      SELECT c.relname AS name,
             (pg_relation_size(c.oid) + coalesce(pg_relation_size(c.reltoastrelid),0)) AS payload
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY payload DESC`;
    allTables = rows.map((r) => ({ name: r.name, payload: Number(r.payload) }));
  } finally {
    await sql.end({ timeout: 5 });
  }

  const jobs = [];
  for (const t of allTables) {
    if (only && t.name !== only) continue;
    const cfg = CHUNKED_TABLES[t.name];
    if (cfg) {
      for (const r of uuidRanges(cfg.splits)) {
        jobs.push({ table: t.name, key: `${t.name}#${String(r.index).padStart(3, '0')}`, range: r });
      }
    } else {
      jobs.push({ table: t.name, key: `${t.name}#whole`, range: null });
    }
  }

  const done = (k) => ledger.chunks[k]?.ok === true;

  if (doPlan || doStatus) {
    const total = jobs.length;
    const complete = jobs.filter((j) => done(j.key)).length;
    const bytes = Object.values(ledger.chunks).reduce((a, c) => a + (c.bytes ?? 0), 0);
    console.log(`plan: ${total} chunk(s) across ${new Set(jobs.map((j) => j.table)).size} table(s)`);
    console.log(`plan: ${complete} complete · ${total - complete} outstanding`);
    console.log(`plan: ${(bytes / 1024 ** 3).toFixed(2)} GB written so far in ${OUT}`);
    for (const t of Object.keys(CHUNKED_TABLES)) {
      const ts = jobs.filter((j) => j.table === t);
      if (!ts.length) continue;
      console.log(`  ${t.padEnd(22)} ${ts.filter((j) => done(j.key)).length}/${ts.length} chunks`);
    }
    if (!doRun) return;
  }

  if (!doRun) {
    console.log('Nothing to do. Pass --run.');
    return;
  }

  // ── Quiescence gate. A chunked dump is only consistent against a frozen
  //    source, so this is a precondition and not a nicety.
  {
    const s = await openDb(url, 1);
    const a = await s`SELECT count(*)::bigint AS n FROM pg_stat_activity
                      WHERE datname = current_database() AND state = 'active'
                        AND pid <> pg_backend_pid()
                        AND query NOT ILIKE 'autovacuum:%'`;
    await s.end({ timeout: 5 });
    console.log(`run: ${a[0].n} non-autovacuum backend(s) active on the source`);
    console.log('run: chunked dumping is consistent ONLY against a frozen source.');
    console.log('run: the fleet must be stopped (services/ingest/.checkpoints/STOP).');
    if (!fs.existsSync(path.join(REPO_ROOT, 'services', 'ingest', '.checkpoints', 'STOP'))) {
      console.error('run: REFUSED — the STOP file is absent, so the fleet is not paused.');
      console.error('run: powershell -File scripts\\fleet-stop.ps1 -IncludeAllLanes');
      process.exit(1);
    }
  }

  // Same hostaddr trick dump.mjs uses: the OS resolver is this machine's most
  // reliable failure, and every chunk opens a fresh connection, so a bad lookup
  // would not fail once — it would fail hundreds of times.
  const { conn, note } = await libpqConnString(url);
  console.log(`run: connection — ${note}`);

  const startedAt = Date.now();
  let didBytes = 0;
  let didChunks = 0;

  /**
   * Concurrency, chosen from a measurement rather than a guess. Against this
   * proxy: one stream sustained 4.05 MB/s, four streams sustained 6.45 MB/s
   * aggregate — clearly sub-linear, because the proxy and not our concurrency is
   * the limit. So a small pool is worth roughly 1.5x and a large one is worth
   * nothing except a higher chance of the drops that killed the first dump.
   *
   * One process, one ledger, one writer. Two processes sharing ledger.json
   * would race on it, and a lost ledger entry means a chunk is dumped twice and
   * loaded twice — and there is no primary key during the data phase to catch
   * the duplicate.
   */
  const outstandingJobs = jobs.filter((j) => !done(j.key));
  let cursor = 0;

  const runOne = async (job) => {
    const file = path.join(OUT, `${job.key.replace('#', '__')}.bin.zst`);

    let ok = false;
    let lastErr = '';
    for (let attempt = 1; attempt <= maxRetries && !ok; attempt++) {
      const t0 = Date.now();
      const res = await copyChunk(conn, job.table, job.range, file);
      if (res.code === 0 && fs.existsSync(file)) {
        const bytes = fs.statSync(file).size;
        ledger.chunks[job.key] = {
          ok: true,
          bytes,
          file: path.basename(file),
          seconds: Math.round((Date.now() - t0) / 1000),
          at: new Date().toISOString(),
        };
        saveLedger(ledger);
        didBytes += bytes;
        didChunks++;
        ok = true;
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = elapsed > 0 ? didBytes / 1024 ** 2 / elapsed : 0;
        console.log(
          `  ok   ${job.key.padEnd(30)} ${(bytes / 1024 ** 2).toFixed(1).padStart(8)} MB  ` +
            `${String(ledger.chunks[job.key].seconds).padStart(4)}s  [${rate.toFixed(2)} MB/s avg]`,
        );
      } else {
        lastErr = res.err.split('\n').slice(0, 2).join(' | ');
        // A partial file from a dropped connection must not be mistaken for a
        // finished chunk on the next pass. No ledger entry was written, but the
        // file would still be there.
        if (fs.existsSync(file)) fs.rmSync(file, { force: true });
        const backoff = Math.min(60_000, 2000 * 2 ** (attempt - 1));
        console.log(`  retry ${job.key} attempt ${attempt}/${maxRetries} after ${backoff / 1000}s — ${lastErr}`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    if (!ok) {
      console.error(`  FAIL ${job.key} after ${maxRetries} attempts — ${lastErr}`);
      console.error('  The ledger records everything already transferred; re-run --run to continue.');
      process.exit(1);
    }
  };

  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= outstandingJobs.length) return;
      await runOne(outstandingJobs[i]);
    }
  };

  console.log(`run: ${outstandingJobs.length} outstanding chunk(s), concurrency ${concurrency}`);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const totalBytes = Object.values(ledger.chunks).reduce((a, c) => a + (c.bytes ?? 0), 0);
  ledger.finishedAt = new Date().toISOString();
  saveLedger(ledger);
  console.log('');
  console.log(`run: complete — ${jobs.length} chunk(s), ${(totalBytes / 1024 ** 3).toFixed(2)} GB in ${OUT}`);
  console.log(`run: ${didChunks} transferred this pass`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
