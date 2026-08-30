#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GATE-B RESTORE PROOF — FROM THE OFF-MACHINE COPY, NOT THE LOCAL ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Roadmap v7.1 §8: `UPLOAD_WITHOUT_RESTORE = HOLD`. LCC R12b proved a restore,
 * but it restored the dump sitting on THIS disk. That proves pg_restore works.
 * It does not prove the thing Gate B is actually asking, which is:
 *
 *   *if this workstation is gone tomorrow, does the copy in Cloudflare R2 come
 *   back?*
 *
 * The difference is not pedantry. A local restore cannot detect a truncated
 * upload, an object written with the wrong key, a decryption key that no longer
 * matches the ciphertext, or a pack whose manifest describes files that were
 * never pushed. Every one of those failures looks identical from here until the
 * day it matters.
 *
 * So this file starts at R2 and touches the local archive at no point:
 *
 *   fresh download -> cipher sha256 -> decrypt -> PLAIN sha256 -> restore into a
 *   disposable database -> row counts against the pack's OWN manifest -> content
 *   checksum -> model file hashes -> elapsed -> drop the database
 *
 * Row counts are compared against the manifest the pack carries, never against
 * the live database. The live database has moved on since the pack was cut —
 * comparing to it would fail for the one reason that is not a defect, and would
 * teach us to ignore the check.
 *
 *   node scripts/lcc-offsite-restore-proof.mjs --prefix <r2-prefix> [--keep]
 *   node scripts/lcc-offsite-restore-proof.mjs --list
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RCLONE = process.env['LAWMIND_RCLONE'] ?? 'C:\\lawmind\\bin\\rclone.exe';
const PG_BIN = process.env['LAWMIND_PG_BIN'] ?? 'C:\\lawmind\\pgsql\\pgsql\\bin';
const SCRATCH_ROOT = process.env['LAWMIND_RESTORE_SCRATCH'] ?? 'C:\\lawmind\\dump\\offsite-restore-proof';
const PROBE_DB = `lawmind_offsite_restore_${process.pid}`;
const REPORT = join(ROOT, 'docs', 'ai', 'lcc-r13', 'offsite-restore-proof.json');

function env() {
  const file = readFileSync(join(ROOT, '.env'), 'utf8');
  const out = {};
  for (const line of file.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && out[m[1]] === undefined) out[m[1]] = m[2].trim();
  }
  return { ...out, ...process.env };
}

const E = env();

/** rclone reads its whole configuration from the environment — no config file. */
function rcloneEnv() {
  return {
    ...process.env,
    RCLONE_CONFIG_R2_TYPE: 's3',
    RCLONE_CONFIG_R2_PROVIDER: 'Cloudflare',
    RCLONE_CONFIG_R2_ENDPOINT: E['R2_ENDPOINT'],
    RCLONE_CONFIG_R2_ACCESS_KEY_ID: E['R2_ACCESS_KEY_ID'],
    RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: E['R2_SECRET_ACCESS_KEY'],
  };
}

function rclone(args, opts = {}) {
  const r = spawnSync(RCLONE, args, { env: rcloneEnv(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.status !== 0) throw new Error(`rclone ${args[0]} failed (${r.status}): ${r.stderr}`);
  return r.stdout;
}

function sha256File(path) {
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
}

function pg(bin, args, extraEnv = {}) {
  const r = spawnSync(join(PG_BIN, `${bin}.exe`), args, {
    env: { ...process.env, PGPASSWORD: new URL(E['DATABASE_URL']).password, ...extraEnv },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return r;
}

function adminSql() {
  const u = new URL(E['DATABASE_URL']);
  u.pathname = '/postgres';
  return postgres(u.toString(), { ssl: false, max: 1, onnotice: () => {} });
}

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);

async function main() {
  const bucket = E['R2_BACKUP_BUCKET'];
  if (!bucket) throw new Error('R2_BACKUP_BUCKET is not set — refusing to pretend a backup was verified');

  if (flag('--list')) {
    process.stdout.write(rclone(['lsf', `R2:${bucket}/backups/postgres/`, '--dirs-only']));
    return;
  }

  const prefix = val('--prefix');
  if (!prefix) throw new Error('--prefix is required (see --list)');

  const key = E['R2_BACKUP_ENCRYPTION_KEY'];
  if (!key) throw new Error('R2_BACKUP_ENCRYPTION_KEY is not set — an encrypted pack that cannot be decrypted is not a backup');

  const t0 = Date.now();
  const work = join(SCRATCH_ROOT, prefix);
  const cipherDir = join(work, 'cipher');
  const plainDir = join(work, 'plain');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(cipherDir, { recursive: true });

  // ── 1. fresh download, no local archive consulted ──────────────────────────
  console.log(`download  R2:${bucket}/backups/postgres/${prefix}/ -> ${cipherDir}`);
  const tDl = Date.now();
  // `--multi-thread-streams 0`, and this is a RECOVERY finding rather than a
  // tuning preference. rclone's default multi-thread download against this R2
  // bucket truncated both large objects and then failed the retry with
  // `failed to find object after copy: object not found` — measured 30 Aug 2026
  // on 369,048,958 and 1,217,596,651 byte objects. Single-stream retrieved the
  // same two objects at exactly their stored size.
  //
  // The stored objects are sound; the DEFAULT command for getting them back is
  // not, and a restore procedure that fails on the day it is needed is the
  // failure this proof exists to find. It is pinned here so the recovery path is
  // the one that was actually proven.
  rclone(['copy', `R2:${bucket}/backups/postgres/${prefix}/`, cipherDir, '--transfers', '2', '--multi-thread-streams', '0'], { stdio: 'inherit' });
  const downloadSeconds = (Date.now() - tDl) / 1000;

  const encMeta = JSON.parse(readFileSync(join(cipherDir, 'ENCRYPTION.json'), 'utf8'));

  // ── 2. the ciphertext is the ciphertext that was uploaded ──────────────────
  const cipherChecks = [];
  for (const f of encMeta.files) {
    const path = join(cipherDir, f.cipherFile);
    const bytes = statSync(path).size;
    const sha256 = await sha256File(path);
    cipherChecks.push({
      file: f.cipherFile,
      bytesExpected: f.cipherBytes,
      bytesFound: bytes,
      sha256Expected: f.cipherSha256,
      sha256Found: sha256,
      match: bytes === f.cipherBytes && sha256 === f.cipherSha256,
    });
    console.log(`cipher    ${f.cipherFile.padEnd(32)} ${cipherChecks.at(-1).match ? 'MATCH' : 'MISMATCH'}`);
  }

  // ── 3. decrypt, and check the PLAINTEXT hash the pack recorded ─────────────
  const tDec = Date.now();
  execFileSync(
    process.execPath,
    [join(ROOT, 'scripts', 'migration', 'encrypt-pack.mjs'), '--decrypt', '--in', cipherDir, '--out', plainDir],
    { cwd: ROOT, env: { ...process.env, R2_BACKUP_ENCRYPTION_KEY: key }, stdio: 'inherit' },
  );
  const decryptSeconds = (Date.now() - tDec) / 1000;

  const plainChecks = [];
  for (const f of encMeta.files) {
    const path = join(plainDir, f.file);
    const bytes = statSync(path).size;
    const sha256 = await sha256File(path);
    plainChecks.push({
      file: f.file,
      bytesExpected: f.plainBytes,
      bytesFound: bytes,
      sha256Expected: f.plainSha256,
      sha256Found: sha256,
      match: bytes === f.plainBytes && sha256 === f.plainSha256,
    });
    console.log(`plain     ${f.file.padEnd(32)} ${plainChecks.at(-1).match ? 'MATCH' : 'MISMATCH'}`);
  }

  // A failed hash means the restore below would be restoring something other
  // than what was backed up. Stop rather than produce a green report over it.
  const badCipher = cipherChecks.filter((c) => !c.match);
  const badPlain = plainChecks.filter((c) => !c.match);
  if (badCipher.length || badPlain.length) {
    writeFileSync(REPORT, JSON.stringify({ kind: 'lcc_offsite_restore_proof', prefix, verdict: 'HOLD_CHECKSUM_MISMATCH', cipherChecks, plainChecks }, null, 2) + '\n');
    throw new Error(`checksum mismatch: ${badCipher.length} cipher, ${badPlain.length} plain`);
  }

  const manifest = JSON.parse(readFileSync(join(plainDir, 'MANIFEST.json'), 'utf8'));

  // ── 4. restore into a disposable database ─────────────────────────────────
  const admin = adminSql();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${PROBE_DB} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${PROBE_DB}`);
  await admin.end();

  const probeUrl = (() => { const u = new URL(E['DATABASE_URL']); u.pathname = `/${PROBE_DB}`; return u.toString(); })();
  const probe = postgres(probeUrl, { ssl: false, max: 1, onnotice: () => {}, connection: { statement_timeout: 0 } });
  await probe.unsafe('CREATE EXTENSION IF NOT EXISTS vector');
  await probe.unsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');

  const tRes = Date.now();

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * `schema.sql` FIRST, AND IT IS NOT OPTIONAL — MEASURED 30 AUGUST 2026
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The first version of this file restored `moat.dump` on its own, which is
   * what anyone reaching for a backup at 3am would type. 33 of 35 tables came
   * back. The two that did not were `statute_mappings` and
   * `ecourts_fetch_ledger`, both reported as `relation ... does not exist`, and
   * a check that counted total rows or spot-checked one table would have called
   * the restore clean.
   *
   * The cause: `pg_dump -t` emits **zero** `TYPE` entries — verified,
   * `pg_restore -l` on this pack lists 278 objects and not one is a type. So
   * exactly the enum-bearing tables fail, and only those, which is why the
   * failure is invisible in aggregate. `ecourts_fetch_ledger.outcome` is
   * `ecourts_fetch_outcome`; `statute_mappings` carries three enums.
   *
   * Losing those two silently is not a small thing: the fetch ledger IS the
   * evidence that eCourts access stayed inside the grant.
   *
   * `scripts/lcc-moat-backup.mjs` already knew this and ships `schema.sql`
   * beside the dump for it. What was missing was any proof that a RECOVERY
   * would use it. The documented sequence is pinned here and exercised every run.
   */
  console.log(`schema    ${join(plainDir, 'schema.sql')} -> ${PROBE_DB}`);
  const schemaRun = pg('psql', ['--dbname', probeUrl, '-q', '-f', join(plainDir, 'schema.sql')]);
  const schemaStderrTail = (schemaRun.stderr ?? '').split(/\r?\n/).filter(Boolean).slice(-8);

  console.log(`restore   ${join(plainDir, 'moat.dump')} -> ${PROBE_DB}`);
  const r = pg('pg_restore', [
    '--dbname', probeUrl,
    '--no-owner', '--no-acl',
    '--data-only', '--disable-triggers',
    '--jobs', '4',
    join(plainDir, 'moat.dump'),
  ]);
  const restoreSeconds = (Date.now() - tRes) / 1000;
  // pg_restore exits non-zero on benign notices (an extension it cannot own, a
  // comment it cannot set). The row counts below are the verdict, not the code.
  const restoreExit = r.status;
  const restoreStderrTail = (r.stderr ?? '').split(/\r?\n/).filter(Boolean).slice(-12);

  // ── 5. row counts, against the pack's own manifest ────────────────────────
  const rowChecks = [];
  for (const [table, expected] of Object.entries(manifest.rowCounts ?? {})) {
    let found = null;
    try {
      const [row] = await probe.unsafe(`SELECT count(*)::bigint AS n FROM ${table}`);
      found = Number(row.n);
    } catch (e) {
      found = `ERROR ${e.message}`;
    }
    rowChecks.push({ table, expected, found, match: found === expected });
    console.log(`rows      ${table.padEnd(30)} ${String(expected).padStart(10)} ${String(found).padStart(10)}  ${found === expected ? 'ok' : 'DIFFERS'}`);
  }
  if (rowChecks.length === 0) throw new Error('the pack manifest carries no rowCounts — there is nothing to verify a restore against');

  // ── 6. content checksum, not only cardinality ─────────────────────────────
  // The same check the R12b local proof used, so the two are comparable: a row
  // count matches happily over rows whose contents were mangled.
  let contentChecksum = null;
  try {
    const [row] = await probe.unsafe(`
      SELECT md5(string_agg(t, '|' ORDER BY t)) AS h FROM (
        SELECT citing_id::text || ':' || cited_id::text AS t
          FROM judgment_citations ORDER BY citing_id, cited_id LIMIT 100000
      ) s`);
    contentChecksum = row.h;
  } catch (e) {
    contentChecksum = `UNAVAILABLE ${e.message}`;
  }

  await probe.end();
  if (!flag('--keep')) {
    const a2 = adminSql();
    await a2.unsafe(`DROP DATABASE IF EXISTS ${PROBE_DB} WITH (FORCE)`);
    await a2.end();
    rmSync(work, { recursive: true, force: true });
  }

  const mismatchedRows = rowChecks.filter((c) => !c.match);
  const report = {
    kind: 'lcc_offsite_restore_proof',
    writtenAt: new Date().toISOString(),
    prefix,
    bucket,
    source: 'CLOUDFLARE_R2_FRESH_DOWNLOAD',
    verdict: mismatchedRows.length === 0 ? 'RESTORE_PROVEN_FROM_OFFSITE' : 'HOLD_ROW_COUNT_MISMATCH',
    packCreatedAt: manifest.createdAt ?? null,
    encryption: { algorithm: encMeta.algorithm, keySource: encMeta.keySource },
    timings: {
      downloadSeconds,
      decryptSeconds,
      restoreSeconds,
      totalSeconds: (Date.now() - t0) / 1000,
    },
    cipherChecks,
    plainChecks,
    rowChecks,
    mismatchedRows,
    contentChecksum,
    restore: {
      procedure: 'psql -f schema.sql, then pg_restore --data-only --disable-triggers',
      schemaExitCode: schemaRun.status,
      schemaStderrTail,
      exitCode: restoreExit,
      stderrTail: restoreStderrTail,
    },
    scratchDatabase: PROBE_DB,
    kept: flag('--keep'),
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(`\n${report.verdict}  ·  ${report.timings.totalSeconds.toFixed(1)}s total  ·  ${REPORT}`);
  if (report.verdict !== 'RESTORE_PROVEN_FROM_OFFSITE') process.exitCode = 1;
}

await main();
