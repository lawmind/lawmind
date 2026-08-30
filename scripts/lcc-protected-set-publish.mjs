#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BUILD THE PROTECTED SET, ENCRYPT IT, PUT IT OFF-MACHINE — ONE COMMITTED PATH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Three steps that had been three ad-hoc command lines: dump, encrypt, upload.
 * Ad-hoc is how the last pack came to be missing an identity map without anyone
 * deciding to leave it out, and it is why the restore proof insists on running
 * the COMMITTED script rather than whatever is in the working tree.
 *
 * It writes nothing to the database and reads no table it does not pack.
 * Restore is deliberately NOT done here: `lcc-offsite-restore-proof.mjs` proves
 * the restore from R2, which is the only version of that question worth
 * answering. A dump restored thirty seconds after it was taken proves that
 * pg_dump and pg_restore agree.
 *
 *   node scripts/lcc-protected-set-publish.mjs
 *   node scripts/lcc-protected-set-publish.mjs --no-upload
 *   node scripts/lcc-protected-set-publish.mjs --skip-dump --out <existing-pack>
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RCLONE = process.env['LAWMIND_RCLONE'] ?? 'C:/lawmind/bin/rclone.exe';
const SCRATCH = process.env['LAWMIND_PACK_SCRATCH'] ?? 'C:/lawmind/dump/protected-set';
const RECEIPT = join(ROOT, 'docs', 'ai', 'lcc-r14', 'protected-set-publish.json');

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const val = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);

function envFile() {
  const out = {};
  const f = join(ROOT, '.env');
  if (!existsSync(f)) return out;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && out[m[1]] === undefined) out[m[1]] = m[2].trim();
  }
  return out;
}
const E = { ...envFile(), ...process.env };
if (!E['DATABASE_URL']) throw new Error('DATABASE_URL is not set');
if (!E['R2_BACKUP_ENCRYPTION_KEY']) throw new Error('R2_BACKUP_ENCRYPTION_KEY is not set — refusing to publish a plaintext protected set');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const prefix = `${stamp}-moat-r14-enc`;
const plain = val('--out') ?? join(SCRATCH, prefix, 'plain');
const cipher = join(SCRATCH, prefix, 'cipher');

mkdirSync(plain, { recursive: true });

// ── 1. the pack ────────────────────────────────────────────────────────────
if (!has('--skip-dump')) {
  console.log(`pack      -> ${plain}`);
  execFileSync(
    process.execPath,
    [join(ROOT, 'scripts', 'lcc-moat-backup.mjs'), '--out', plain, '--no-restore'],
    { cwd: ROOT, env: { ...process.env, DATABASE_URL: E['DATABASE_URL'] }, stdio: 'inherit' },
  );
} else {
  console.log(`pack      reusing ${plain}`);
}
const manifest = JSON.parse(readFileSync(join(plain, 'MANIFEST.json'), 'utf8'));

// ── 2. encrypt ─────────────────────────────────────────────────────────────
/**
 * Client-side, with a key Cloudflare never sees. The pack carries `matters`,
 * `matter_events`, party names, hearing notes and an advocate's annotations —
 * `CLAUDE.md` §5 sensitive-class — and server-side encryption is a control the
 * storage provider holds the key to.
 */
console.log(`\nencrypt   -> ${cipher}`);
rmSync(cipher, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [join(ROOT, 'scripts', 'migration', 'encrypt-pack.mjs'), '--in', plain, '--out', cipher],
  { cwd: ROOT, env: { ...process.env, R2_BACKUP_ENCRYPTION_KEY: E['R2_BACKUP_ENCRYPTION_KEY'] }, stdio: 'inherit' },
);
const encryption = JSON.parse(readFileSync(join(cipher, 'ENCRYPTION.json'), 'utf8'));

// ── 3. off-machine ─────────────────────────────────────────────────────────
let uploaded = false;
if (!has('--no-upload')) {
  const bucket = E['R2_BACKUP_BUCKET'];
  if (!bucket) throw new Error('R2_BACKUP_BUCKET is not set');
  console.log(`\nupload    -> R2:${bucket}/backups/postgres/${prefix}/`);
  // Single-stream. rclone's default multi-thread copy truncated large objects
  // against this bucket on 30 Aug 2026 and then failed the retry with
  // `object not found`; single-stream retrieved them at exactly their size.
  execFileSync(
    RCLONE,
    ['copy', cipher, `R2:${bucket}/backups/postgres/${prefix}/`, '--transfers', '2', '--multi-thread-streams', '0', '--progress'],
    {
      env: {
        ...process.env,
        RCLONE_CONFIG_R2_TYPE: 's3',
        RCLONE_CONFIG_R2_PROVIDER: 'Cloudflare',
        RCLONE_CONFIG_R2_ENDPOINT: E['R2_ENDPOINT'],
        RCLONE_CONFIG_R2_ACCESS_KEY_ID: E['R2_ACCESS_KEY_ID'],
        RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: E['R2_SECRET_ACCESS_KEY'],
      },
      stdio: 'inherit',
    },
  );
  uploaded = true;
}

mkdirSync(dirname(RECEIPT), { recursive: true });
writeFileSync(
  RECEIPT,
  JSON.stringify(
    {
      kind: 'lcc_protected_set_publish',
      writtenAt: new Date().toISOString(),
      tool: 'scripts/lcc-protected-set-publish.mjs',
      prefix,
      bucket: E['R2_BACKUP_BUCKET'] ?? null,
      uploaded,
      packCreatedAt: manifest.createdAt,
      tablesPacked: (manifest.tables ?? []).length,
      tablesAbsent: (manifest.missingTables ?? []).map((m) => m.table),
      identityRows: manifest.identityRows ?? null,
      protectedFiles: manifest.protectedFiles ?? null,
      cipherBytes: encryption.files.reduce((a, f) => a + f.cipherBytes, 0),
      plainBytes: encryption.files.reduce((a, f) => a + f.plainBytes, 0),
      files: encryption.files.map((f) => ({ file: f.file, plainBytes: f.plainBytes, cipherBytes: f.cipherBytes })),
      restoreProof: 'NOT PROVEN BY THIS TOOL. Run scripts/lcc-offsite-restore-proof.mjs --prefix ' + prefix + ' — upload without restore is HOLD.',
      keyEscrow: 'NOT ESCROWED. R2_BACKUP_ENCRYPTION_KEY exists only in .env on this workstation, so HOST_LOSS_RECOVERABLE is NO until it is escrowed. Founder item; the key is never printed here.',
    },
    null,
    2,
  ) + '\n',
);
console.log(`\nreceipt   ${RECEIPT}`);
console.log(`prefix    ${prefix}`);
console.log(`cipher    ${(statSync(cipher).isDirectory() ? encryption.files.reduce((a, f) => a + f.cipherBytes, 0) / 1e9 : 0).toFixed(3)} GB`);
