#!/usr/bin/env node
/**
 * Push a verified PostgreSQL backup to Cloudflare R2 — and refuse to call it a
 * backup until it has been read back.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A BACKUP IS, FOR THE PURPOSES OF THIS FILE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Not "the upload returned 200". The founder directive spells out the sequence
 * and it is the right one: produce the archive, checksum it LOCALLY, upload,
 * verify size and checksum and readability against the remote copy, and only
 * then treat it as a backup. Everything before the read-back is an upload.
 *
 * This matters more here than in a normal project. After the Railway shutdown
 * there is exactly one copy of the corpus — a Windows workstation in one room —
 * and R2 is the only thing standing between a failed NVMe and the loss of the
 * entire data moat. A backup that was never verified is a belief, and this
 * project already has a rule about presenting unverified things as verified.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT REFUSES HONESTLY WITHOUT CREDENTIALS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `packages/storage/src/r2.ts` established the pattern for this repo and it is
 * followed exactly: the whole path builds and runs with no key, and the only
 * thing missing is the network call. What it must never do is APPEAR to work.
 * With no credentials this exits non-zero saying precisely which variables are
 * missing — it does not skip, warn, or "continue without backup".
 *
 * Required, all four:
 *   R2_ENDPOINT           https://<accountid>.r2.cloudflarestorage.com
 *   R2_BACKUP_BUCKET      the private bucket for backups
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *
 * `R2_BACKUP_BUCKET` is deliberately its OWN variable and not `R2_BUCKET`, even
 * though both currently name `lawmind-corpus`. `packages/storage/src/r2.ts`
 * reads `R2_BUCKET` for corpus objects served to the product; database backups
 * are a different blast radius and a different retention policy, and a
 * lifecycle rule written for one must never be able to reach the other. Today
 * the separation is by prefix (`backups/postgres/`, per the founder directive's
 * layout); the separate variable is what makes moving to a separate bucket a
 * config change rather than a code change.
 *
 * The credentials are the OBJECT pair — the one that cannot create or delete a
 * bucket. Verified rather than assumed: that pair is refused on `ListBuckets`
 * with a 403, which is exactly the blast radius r2.ts asks for.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COST DISCIPLINE, because the whole point of this migration is cost
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - **64 MB multipart chunks.** R2 bills Class A operations per part. At 5 MB
 *   parts a 20 GB file is 4,000 operations; at 64 MB it is 320.
 * - **The archive is already zstd-compressed by pg_dump.** It is not compressed
 *   again — that would burn CPU to add bytes.
 * - **Verification uses `rclone check --download`, and that is deliberate.**
 *   R2 charges nothing for egress, so reading the whole backup back costs zero
 *   and proves the bytes rather than trusting an ETag. On S3 this would be an
 *   expensive choice; on R2 it is a free one, and it is the difference between
 *   a checked backup and a hoped-for one.
 * - **Bounded rotation, not unlimited accumulation.** `--keep N` deletes the
 *   oldest full backups beyond N. Default 3.
 *
 *   node scripts/migration/backup-r2.mjs --archive full
 *   node scripts/migration/backup-r2.mjs --archive full --keep 3
 *   node scripts/migration/backup-r2.mjs --archive full --dry-run
 *   node scripts/migration/backup-r2.mjs --verify-only backups/postgres/2026-08-15T...
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PG } from './pg-local.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RCLONE = process.env.LAWMIND_RCLONE ?? 'C:\\lawmind\\bin\\rclone.exe';

/** The R2 key prefix layout from the founder directive, kept in one place. */
export const R2_PREFIXES = {
  postgres: 'backups/postgres/',
  pdf: 'sources/pdf/',
  parquet: 'sources/parquet/',
  ocr: 'sources/ocr/',
  providers: 'providers/',
  training: 'datasets/training/',
  evaluation: 'datasets/evaluation/',
  temporary: 'temporary/',
};

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

const REQUIRED = ['R2_ENDPOINT', 'R2_BACKUP_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];

export function r2ConfigFromEnv(env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    endpoint: env.R2_ENDPOINT,
    bucket: env.R2_BACKUP_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
}

/**
 * rclone is configured entirely through environment variables, so no config
 * file is written and no secret is left on disk for someone to find later.
 */
function rcloneEnv(cfg) {
  return {
    ...process.env,
    RCLONE_CONFIG_R2_TYPE: 's3',
    RCLONE_CONFIG_R2_PROVIDER: 'Cloudflare',
    RCLONE_CONFIG_R2_ENDPOINT: cfg.endpoint,
    RCLONE_CONFIG_R2_ACCESS_KEY_ID: cfg.accessKeyId,
    RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: cfg.secretAccessKey,
    // R2 does not implement AWS's per-object ACLs; asking for one makes every
    // PUT fail with a 400 that reads like a permissions problem.
    RCLONE_CONFIG_R2_NO_CHECK_BUCKET: 'true',
    RCLONE_S3_ACL: '',
  };
}

function rclone(args, cfg, { quiet } = {}) {
  return new Promise((resolve) => {
    const child = spawn(RCLONE, args, { env: rcloneEnv(cfg), windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      if (!quiet) process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      out += d;
      if (!quiet) process.stderr.write(d);
    });
    child.on('close', (code) => resolve({ code, out }));
  });
}

function sha256File(p) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(8 * 1024 * 1024);
  let read;
  while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, read));
  fs.closeSync(fd);
  return h.digest('hex');
}

/** SHA-256 of every file in the archive. This is the local half of the proof. */
function checksumArchive(dir) {
  const entries = [];
  const walk = (d, rel = '') => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else entries.push({ file: r, bytes: fs.statSync(p).size, sha256: sha256File(p) });
    }
  };
  walk(dir);
  const total = entries.reduce((a, e) => a + e.bytes, 0);
  // One hash over the per-file hashes: a single value that changes if anything
  // about the archive changes, including a file appearing or disappearing.
  const rollup = crypto
    .createHash('sha256')
    .update(entries.map((e) => `${e.file}:${e.bytes}:${e.sha256}`).join('\n'))
    .digest('hex');
  return { entries, totalBytes: total, fileCount: entries.length, rollup };
}

const GB = 1024 ** 3;

async function main() {
  const argv = process.argv.slice(2);
  const archiveName = argv.includes('--archive') ? argv[argv.indexOf('--archive') + 1] : 'full';
  const keep = argv.includes('--keep') ? Number(argv[argv.indexOf('--keep') + 1]) : 3;
  const dryRun = argv.includes('--dry-run');
  const verifyOnly = argv.includes('--verify-only') ? argv[argv.indexOf('--verify-only') + 1] : null;
  const transfers = argv.includes('--transfers') ? Number(argv[argv.indexOf('--transfers') + 1]) : 4;

  const env = { ...readEnvFile(), ...process.env };
  const cfg = r2ConfigFromEnv(env);

  if (!fs.existsSync(RCLONE)) {
    console.error(`rclone not found at ${RCLONE}. Set LAWMIND_RCLONE or install it.`);
    process.exit(2);
  }

  const archiveDir = path.isAbsolute(archiveName) ? archiveName : path.join(PG.dump, archiveName);

  // ── The local half runs with or without credentials, because it is useful on
  // its own: it is how you know the archive on disk has not rotted.
  let local = null;
  if (!verifyOnly) {
    if (!fs.existsSync(archiveDir)) {
      console.error(`No archive at ${archiveDir}. Run dump.mjs first.`);
      process.exit(2);
    }
    console.log(`backup: checksumming ${archiveDir} …`);
    const t0 = Date.now();
    local = checksumArchive(archiveDir);
    console.log(
      `backup: ${local.fileCount} files · ${(local.totalBytes / GB).toFixed(2)} GB · rollup ${local.rollup.slice(0, 16)}… (${Math.round((Date.now() - t0) / 1000)}s)`,
    );
    const manifestPath = path.join(archiveDir, 'CHECKSUMS.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        { tool: 'scripts/migration/backup-r2.mjs', archive: archiveDir, createdAt: new Date().toISOString(), ...local },
        null,
        2,
      ),
    );
    console.log(`backup: wrote ${manifestPath}`);
  }

  if (!cfg.ok) {
    console.error('');
    console.error('backup: NOT UPLOADED — R2 credentials are missing.');
    console.error(`backup: absent variables: ${cfg.missing.join(', ')}`);
    console.error('');
    console.error('  This is a refusal, not a warning, and nothing above counts as a backup.');
    console.error('  The archive and its checksums exist on local disk only, which means');
    console.error('  the corpus currently has exactly ONE copy, on one machine.');
    console.error('  Queued in docs/FOUNDER_QUEUE.md. Everything else in the migration');
    console.error('  proceeds; this step is re-runnable the moment the keys land:');
    console.error(`      node scripts/migration/backup-r2.mjs --archive ${archiveName}`);
    process.exit(3);
  }

  if (verifyOnly) {
    console.log(`backup: verifying remote ${verifyOnly} by full download comparison`);
    const r = await rclone(['check', archiveDir, `r2:${cfg.bucket}/${verifyOnly}`, '--download', '--one-way'], cfg);
    process.exit(r.code === 0 ? 0 : 1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const remotePrefix = `${R2_PREFIXES.postgres}${stamp}-${archiveName}`;
  const remote = `r2:${cfg.bucket}/${remotePrefix}`;

  const uploadArgs = [
    'copy',
    archiveDir,
    remote,
    '--s3-chunk-size', '64M',
    '--s3-upload-concurrency', '4',
    '--transfers', String(transfers),
    '--checkers', '8',
    '--retries', '5',
    '--low-level-retries', '20',
    '--stats', '30s',
    '--stats-one-line',
    '--progress',
  ];
  if (dryRun) uploadArgs.push('--dry-run');

  console.log(`backup: uploading -> ${remote}`);
  const t1 = Date.now();
  const up = await rclone(uploadArgs, cfg);
  const upS = Math.round((Date.now() - t1) / 1000);
  if (up.code !== 0) {
    console.error(`backup: UPLOAD FAILED (rclone exit ${up.code}). Not a backup.`);
    process.exit(1);
  }
  console.log(`backup: upload finished in ${upS}s`);

  if (dryRun) {
    console.log('backup: --dry-run, nothing was written and nothing is verified.');
    return;
  }

  // ── The read-back. This is the step that turns an upload into a backup.
  console.log('backup: verifying by downloading every object back and comparing bytes');
  console.log('        (R2 egress is free, so this costs nothing and proves the copy)');
  const t2 = Date.now();
  const chk = await rclone(['check', archiveDir, remote, '--download', '--one-way'], cfg);
  const chkS = Math.round((Date.now() - t2) / 1000);

  const receipt = {
    tool: 'scripts/migration/backup-r2.mjs',
    archive: archiveDir,
    remote: `${cfg.bucket}/${remotePrefix}`,
    endpoint: cfg.endpoint,
    fileCount: local.fileCount,
    totalBytes: local.totalBytes,
    rollupSha256: local.rollup,
    uploadSeconds: upS,
    verifySeconds: chkS,
    verified: chk.code === 0,
    at: new Date().toISOString(),
  };
  const receiptPath = path.join(PG.dump, `backup-${archiveName}.receipt.json`);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

  if (chk.code !== 0) {
    console.error('backup: VERIFICATION FAILED. The remote copy does not match local bytes.');
    console.error('backup: this is NOT a backup and must not be counted as one.');
    process.exit(1);
  }
  console.log(`backup: VERIFIED — ${local.fileCount} files, ${(local.totalBytes / GB).toFixed(2)} GB, read back and compared in ${chkS}s`);
  console.log(`backup: receipt ${receiptPath}`);

  // ── Bounded rotation. Unlimited accumulation is a cost bug, and this whole
  // migration exists because of a cost problem.
  const list = await rclone(['lsf', `r2:${cfg.bucket}/${R2_PREFIXES.postgres}`, '--dirs-only'], cfg, { quiet: true });
  const dirs = list.out
    .split(/\r?\n/)
    .map((s) => s.replace(/\/$/, '').trim())
    .filter(Boolean)
    .sort();
  const stale = dirs.slice(0, Math.max(0, dirs.length - keep));
  if (stale.length === 0) {
    console.log(`backup: rotation — ${dirs.length} backup(s) retained, keep=${keep}, nothing to delete`);
  } else {
    for (const d of stale) {
      console.log(`backup: rotation — deleting old backup ${d}`);
      await rclone(['purge', `r2:${cfg.bucket}/${R2_PREFIXES.postgres}${d}`], cfg, { quiet: true });
    }
    console.log(`backup: rotation — deleted ${stale.length}, retained ${keep}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
