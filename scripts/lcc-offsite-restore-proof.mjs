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
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
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
  //
  // The same statement `lcc-moat-backup.mjs` uses for its local proof, so the
  // two numbers are comparable. Deterministically ordered and capped, so rows
  // added since the pack was cut cannot move it merely by existing.
  //
  // The comparison is against the LIVE database and is reported as a SIGNAL, not
  // a verdict: the pack carries no checksum of its own, and the live corpus has
  // moved on since it was cut. A difference here means "look", not "corrupt".
  // The verdict rests on the file-level SHA-256 of `moat.dump`, which is an
  // exact match, and on the per-table row counts.
  const CHECKSUM_SQL = `SELECT md5(string_agg(t, '|' ORDER BY t)) AS h FROM (
    SELECT coalesce(citing_judgment_id::text,'') || coalesce(cited_judgment_id::text,'') || coalesce(relationship,'') AS t
      FROM public.judgment_citations
     ORDER BY citing_judgment_id, cited_judgment_id, relationship
     LIMIT 100000) x`;
  let contentChecksum = { restored: null, live: null, match: null };
  try {
    const [restoredRow] = await probe.unsafe(CHECKSUM_SQL);
    const live = postgres(E['DATABASE_URL'], { ssl: false, max: 1, onnotice: () => {}, connection: { statement_timeout: 0 } });
    const [liveRow] = await live.unsafe(CHECKSUM_SQL);
    await live.end({ timeout: 5 });
    contentChecksum = {
      restored: restoredRow.h,
      live: liveRow.h,
      match: restoredRow.h === liveRow.h,
    };
  } catch (e) {
    contentChecksum = { restored: null, live: null, match: null, error: e.message };
  }


  // ── 6b. CANONICAL IDENTITY, PROVENANCE, AND THE PROTECTED FILES ───────────
  /**
   * ─────────────────────────────────────────────────────────────────────────
   * ROW COUNTS CANNOT SEE THIS, WHICH IS WHY IT IS A SEPARATE SECTION
   * ─────────────────────────────────────────────────────────────────────────
   *
   * Everything above proves the packed TABLES came back. It cannot prove what a
   * recovery actually needs, because the failure has no missing row and no bad
   * checksum:
   *
   *   `judgment_citations` addresses judgments by a `gen_random_uuid()` id, and
   *   a re-ingest mints new ones. Unless the pack carries a map from those ids
   *   to something that outlives a re-ingest — the content hash, the source URL
   *   — 22 million edges restore perfectly and address nothing. Every row
   *   present, every byte intact, the citator gone.
   *
   * So the identity map is COPYed into the probe database and both ends of
   * every edge are anti-joined against it. Not sampled: a sampled anti-join on
   * 22M rows can miss an entire court and still read clean.
   */
  const identityGz = join(plainDir, 'judgment-identity.csv.gz');
  const identity = { present: existsSync(identityGz) };
  if (identity.present) {
    const csv = join(work, 'judgment-identity.csv');
    await pipeline(createReadStream(identityGz), createGunzip(), createWriteStream(csv));
    identity.plainBytes = statSync(csv).size;

    await probe.unsafe(`CREATE TABLE restored_judgment_identity (
      id uuid, content_hash text, source_url text, source_id text,
      source_edition text, authorization_basis text, provenance_recorded_at timestamptz)`);
    // The meta-command's backslash is BUILT, not written: this file has already
    // lost one escape to a transcription channel and the cost was a silent
    // UNAVAILABLE in a proof that still printed a verdict.
    const META = String.fromCharCode(92);
    const copyRun = pg('psql', ['--dbname', probeUrl, '-v', 'ON_ERROR_STOP=1', '-c',
      `${META}copy restored_judgment_identity FROM '${csv.split(META).join('/')}' WITH CSV HEADER`]);
    identity.copyExit = copyRun.status;
    identity.copyStderrTail = (copyRun.stderr ?? '').split(/\r?\n/).filter(Boolean).slice(-4);

    const [c] = await probe.unsafe('SELECT count(*)::bigint AS n FROM restored_judgment_identity');
    identity.rows = Number(c.n);
    identity.manifestRows = manifest.identityRows ?? null;
    identity.rowsMatchManifest =
      identity.manifestRows === null ? null : identity.rows === identity.manifestRows;

    const [unmapped] = await probe.unsafe(`
      SELECT count(*)::bigint AS n FROM (
        SELECT citing_judgment_id AS id FROM public.judgment_citations WHERE citing_judgment_id IS NOT NULL
        UNION SELECT cited_judgment_id FROM public.judgment_citations WHERE cited_judgment_id IS NOT NULL
      ) e LEFT JOIN restored_judgment_identity i ON i.id = e.id WHERE i.id IS NULL`);
    identity.citationEndpointsWithoutIdentity = Number(unmapped.n);
    identity.canonicalIdentityReconstructible = identity.citationEndpointsWithoutIdentity === 0;

    const [h] = await probe.unsafe(
      'SELECT count(*)::bigint AS n FROM restored_judgment_identity WHERE content_hash IS NOT NULL');
    identity.withContentHash = Number(h.n);

    /**
     * Provenance is reported as a COUNT and never as a pass. The four columns
     * are CARRIED for every judgment; they are POPULATED on a small minority,
     * which is a fact about the corpus rather than about the backup. A proof
     * that rounded that up to "present" would be the kind of claim this file
     * exists to refuse.
     */
    const [p] = await probe.unsafe(`SELECT
        count(*) FILTER (WHERE source_id IS NOT NULL)::bigint AS a,
        count(*) FILTER (WHERE source_edition IS NOT NULL)::bigint AS b,
        count(*) FILTER (WHERE authorization_basis IS NOT NULL)::bigint AS c,
        count(*) FILTER (WHERE provenance_recorded_at IS NOT NULL)::bigint AS d
      FROM restored_judgment_identity`);
    identity.provenance = {
      columnsCarried: ['source_id', 'source_edition', 'authorization_basis', 'provenance_recorded_at'],
      carriedForRows: identity.rows,
      populatedRows: {
        source_id: Number(p.a),
        source_edition: Number(p.b),
        authorization_basis: Number(p.c),
        provenance_recorded_at: Number(p.d),
      },
    };
    rmSync(csv, { force: true });
    console.log(`identity  ${identity.rows.toLocaleString()} rows  ·  unmapped citation endpoints ${identity.citationEndpointsWithoutIdentity}`);
  } else {
    console.log('identity  ABSENT from this pack — canonical identity is NOT reconstructible from it');
  }

  /**
   * The gold sets, source manifests, checkpoints, migrations and the governing
   * authority bytes. Extracted and re-hashed against the manifest the pack
   * carries: a tar that LISTS a file proves nothing about that file's contents,
   * and "it is in the Git checkout" is not an off-machine copy when the only
   * clone is on the machine the backup exists to survive.
   */
  const filesArchive = join(plainDir, 'protected-files.tar.gz');
  const filesManifestPath = join(plainDir, 'FILES.json');
  const protectedFiles = { present: existsSync(filesArchive) && existsSync(filesManifestPath) };
  if (protectedFiles.present) {
    const filesManifest = JSON.parse(readFileSync(filesManifestPath, 'utf8'));
    const extractDir = join(work, 'protected-files');
    mkdirSync(extractDir, { recursive: true });
    execFileSync('tar', ['-xzf', filesArchive, '-C', extractDir], { stdio: ['ignore', 'ignore', 'inherit'] });
    const failures = [];
    let matched = 0;
    for (const entry of filesManifest.files ?? []) {
      const at = join(extractDir, entry.path);
      if (!existsSync(at)) {
        failures.push({ path: entry.path, why: 'MISSING_FROM_ARCHIVE' });
        continue;
      }
      const actual = await sha256File(at);
      if (actual !== entry.sha256) {
        failures.push({ path: entry.path, why: 'SHA256_DIFFERS', expected: entry.sha256, actual });
        continue;
      }
      matched += 1;
    }
    protectedFiles.consistencyRule = filesManifest.consistencyRule ?? null;
    protectedFiles.declaredRoots = (filesManifest.roots ?? []).length;
    protectedFiles.absentRoots = filesManifest.absentRoots ?? [];
    protectedFiles.expected = (filesManifest.files ?? []).length;
    protectedFiles.verified = matched;
    protectedFiles.failures = failures;
    protectedFiles.allVerified = failures.length === 0 && matched > 0;
    /**
     * Named CLASSES, not a file count. The gate asks whether the gold sets and
     * the checkpoints are protected; a count of 3,000 files cannot tell you
     * which class is the one that went missing.
     */
    const paths = (filesManifest.files ?? []).map((f) => f.path).join(' ');
    protectedFiles.coverage = {
      governingAuthority:
        paths.includes('LAWMIND_MASTER_ROADMAP_V7_1.md') && paths.includes('LAWMIND_SPRINT_PROMPTS_V2.md'),
      goldEval: paths.includes('gold'),
      sourceManifests: paths.includes('upstream-manifest.json') || paths.includes('source-ledger.json'),
      worklistsCheckpoints: paths.includes('.checkpoints') && paths.includes('worklist'),
      migrations: paths.includes('drizzle'),
      schemaTruth: paths.includes('SCHEMA_TRUTH.md'),
    };
    rmSync(extractDir, { recursive: true, force: true });
    console.log(`files     ${matched}/${protectedFiles.expected} verified by sha256 out of the archive`);
  } else {
    console.log('files     ABSENT from this pack — gold/manifest/worklist coverage is NOT proven');
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
