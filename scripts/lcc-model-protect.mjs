#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EMBEDDING MODEL, ENCRYPTED BEFORE IT LEAVES THIS MACHINE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The weights are already off-machine. They went up in PLAINTEXT, as
 * `backups/postgres/2026-08-30T00-10-01-494Z-new1-model-pack-v2`, and
 * `docs/ai/lcc-r13/model-artifact-manifest.json` records that as an
 * ACCEPTED_DEVIATION on the reasoning that MIT-licensed public weights carry no
 * client data, so the confidentiality rule the encryption exists for does not
 * bite. That reasoning is sound and it is not what changed.
 *
 * What changed is the requirement: the current round states that the model set
 * must be copied using client-side encryption before off-machine storage, and
 * the Gate-B restore check asks for the model artifacts ENCRYPTED. So this
 * writes an encrypted pack. The plaintext v2 prefix is deliberately LEFT IN
 * PLACE and not deleted — see the receipt — because deleting it would trade a
 * confidentiality gain we do not need for a recoverability loss we would feel
 * on the one day this matters, and removing a founder's data is not this
 * lane's call.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY FLAT NAMES AND NO TAR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `scripts/migration/encrypt-pack.mjs` encrypts the TOP-LEVEL files of a
 * directory. `onnx/model.onnx_data` is not top-level, and a tool that silently
 * skips a subdirectory would have produced a pack missing the 2.2 GB that
 * matters. Tarring first would fix the shape and cost a second full copy of
 * 2.28 GB, and would bury the per-file plaintext digests inside an archive.
 *
 * So each file is staged under a flat name — `onnx/model.onnx_data` becomes
 * `onnx__model.onnx_data` — and `MODEL_MAP.json` records the mapping. The
 * benefit is not cosmetic: `ENCRYPTION.json` then carries a plaintext sha256
 * PER MODEL FILE, so a restore verifies the weights themselves rather than an
 * archive that contains them.
 *
 * Encryption is streamed by that tool (createReadStream -> cipher -> file), so
 * the 2.27 GB weights are never held in memory.
 *
 *   node scripts/lcc-model-protect.mjs            # stage, encrypt, upload
 *   node scripts/lcc-model-protect.mjs --dry      # stage and encrypt, no upload
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RCLONE = process.env['LAWMIND_RCLONE'] ?? 'C:/lawmind/bin/rclone.exe';
const SCRATCH = process.env['LAWMIND_MODEL_SCRATCH'] ?? 'C:/lawmind/dump/model-protect';
const MANIFEST = join(ROOT, 'docs', 'ai', 'lcc-r13', 'model-artifact-manifest.json');
const RECEIPT = join(ROOT, 'docs', 'ai', 'lcc-r14', 'model-encrypted-offsite.json');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');

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

function sha256File(path) {
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
}

function rclone(args) {
  return execFileSync(RCLONE, args, {
    env: {
      ...process.env,
      RCLONE_CONFIG_R2_TYPE: 's3',
      RCLONE_CONFIG_R2_PROVIDER: 'Cloudflare',
      RCLONE_CONFIG_R2_ENDPOINT: E['R2_ENDPOINT'],
      RCLONE_CONFIG_R2_ACCESS_KEY_ID: E['R2_ACCESS_KEY_ID'],
      RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: E['R2_SECRET_ACCESS_KEY'],
    },
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const files = manifest.artifacts?.files ?? [];
if (files.length === 0) throw new Error('the model artifact manifest lists no files — refusing to guess a set');

/**
 * EVERY file in the committed manifest, and the hashes are re-verified against
 * the live bytes before anything is encrypted.
 *
 * The manifest is a claim about what was on disk on 30 August. Encrypting a
 * file that has since changed would produce a pack whose contents do not match
 * the identity the repository records, and the mismatch would only surface at
 * the restore — which is to say, on the day it is needed.
 */
console.log(`verifying ${files.length} model files against ${MANIFEST}`);
const verified = [];
for (const f of files) {
  const at = join(ROOT, f.path);
  if (!existsSync(at)) throw new Error(`${f.path} is in the manifest and not on disk — refusing to pack a partial model`);
  const bytes = statSync(at).size;
  const sha256 = await sha256File(at);
  const ok = bytes === f.bytes && sha256 === f.sha256;
  console.log(`  ${f.path.padEnd(46)} ${ok ? 'MATCH' : 'DRIFTED'}`);
  if (!ok) {
    throw new Error(
      `${f.path} does not match the committed manifest (bytes ${bytes} vs ${f.bytes}, sha256 ${sha256} vs ${f.sha256}). ` +
        'These are the only known-working weights and their identity is REPRODUCIBILITY_CRITICAL: stop rather than protect an unidentified file.',
    );
  }
  verified.push({ ...f, flatName: f.path.split('/').slice(3).join('__') });
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const prefix = `${stamp}-model-pack-v3-enc`;
const stage = join(SCRATCH, prefix, 'plain');
const cipher = join(SCRATCH, prefix, 'cipher');
rmSync(join(SCRATCH, prefix), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

for (const f of verified) {
  copyFileSync(join(ROOT, f.path), join(stage, f.flatName));
}
writeFileSync(
  join(stage, 'MODEL_MAP.json'),
  JSON.stringify(
    {
      tool: 'scripts/lcc-model-protect.mjs',
      note: 'Flat names, because encrypt-pack.mjs encrypts top-level files only and a silently skipped subdirectory would have lost the weights. Restore by moving each flatName back to path.',
      identityManifest: 'docs/ai/lcc-r13/model-artifact-manifest.json',
      modelRevision: manifest.MODEL_REVISION ?? 'UNKNOWN',
      licence: manifest.licence?.LICENCE ?? null,
      files: verified.map((f) => ({ path: f.path, flatName: f.flatName, bytes: f.bytes, sha256: f.sha256, role: f.role })),
    },
    null,
    2,
  ),
);

console.log(`\nencrypting -> ${cipher}`);
execFileSync(
  process.execPath,
  [join(ROOT, 'scripts', 'migration', 'encrypt-pack.mjs'), '--in', stage, '--out', cipher],
  { cwd: ROOT, env: { ...process.env, R2_BACKUP_ENCRYPTION_KEY: E['R2_BACKUP_ENCRYPTION_KEY'] }, stdio: 'inherit' },
);

const encryption = JSON.parse(readFileSync(join(cipher, 'ENCRYPTION.json'), 'utf8'));
const cipherBytes = encryption.files.reduce((a, f) => a + f.cipherBytes, 0);

let uploaded = false;
if (!DRY) {
  const bucket = E['R2_BACKUP_BUCKET'];
  if (!bucket) throw new Error('R2_BACKUP_BUCKET is not set');
  console.log(`\nuploading -> R2:${bucket}/backups/postgres/${prefix}/`);
  // Single-stream, for the reason pinned in lcc-offsite-restore-proof.mjs: the
  // default multi-thread copy truncated large objects against this bucket.
  rclone(['copy', cipher, `R2:${bucket}/backups/postgres/${prefix}/`, '--transfers', '2', '--multi-thread-streams', '0', '--progress']);
  uploaded = true;
}

mkdirSync(dirname(RECEIPT), { recursive: true });
writeFileSync(
  RECEIPT,
  JSON.stringify(
    {
      kind: 'lcc_model_encrypted_offsite',
      writtenAt: new Date().toISOString(),
      tool: 'scripts/lcc-model-protect.mjs',
      prefix,
      bucket: E['R2_BACKUP_BUCKET'] ?? null,
      uploaded,
      MODEL_REVISION: manifest.MODEL_REVISION ?? 'UNKNOWN',
      identitySource: 'docs/ai/lcc-r13/model-artifact-manifest.json',
      filesProtected: verified.length,
      plainBytes: verified.reduce((a, f) => a + f.bytes, 0),
      cipherBytes,
      encryption: { algorithm: encryption.algorithm, envelope: encryption.envelope, keySource: encryption.keySource },
      files: encryption.files,
      plaintextPrefixRetained: {
        prefix: 'backups/postgres/2026-08-30T00-10-01-494Z-new1-model-pack-v2',
        deleted: false,
        why: 'Left in place deliberately. These are MIT-licensed public weights with no client data, so the plaintext copy leaks nothing; it is also the only copy recoverable WITHOUT the encryption key, which currently exists on one workstation. Deleting it would trade a confidentiality gain we do not need for a recoverability loss on the day this matters — and removing a founder-owned object is not this lane\u2019s call to make unasked.',
      },
      keyEscrow: 'NOT ESCROWED. R2_BACKUP_ENCRYPTION_KEY exists only in .env on this workstation. HOST_LOSS_RECOVERABLE stays NO for anything only this key can open. Founder item.',
    },
    null,
    2,
  ) + '\n',
);
console.log(`\nreceipt   ${RECEIPT}`);
console.log(`prefix    ${prefix}`);
if (!DRY) rmSync(join(SCRATCH, prefix), { recursive: true, force: true });
