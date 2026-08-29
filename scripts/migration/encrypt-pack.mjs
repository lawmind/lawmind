#!/usr/bin/env node
/**
 * Encrypt a backup pack before it leaves this machine — and prove it decrypts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY CLIENT-SIDE, WHEN R2 ALREADY ENCRYPTS AT REST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R2 gives TLS in transit and server-side encryption at rest, and for the bulk
 * corpus that is plenty — judgments are published documents. This pack is not
 * that. `scripts/lcc-moat-backup.mjs` packs `matters`, `matter_events`,
 * `matter_notes`, `documents` and `users`: client names, party names, hearing
 * notes and an advocate's own annotations. `CLAUDE.md` §5 calls that
 * sensitive-class, and server-side encryption is a control the STORAGE PROVIDER
 * holds the key to — it protects against a stolen disk, not against the
 * provider, a misconfigured bucket policy, or a leaked object-scoped key.
 *
 * So the pack is encrypted here, with a key that never goes to Cloudflare, and
 * what is uploaded is ciphertext.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AES-256-GCM, AND THE HONEST TRADE THAT COMES WITH IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Per file: a fresh random 96-bit IV, streamed, with the 128-bit auth tag
 * appended. GCM is authenticated, so a corrupted or tampered object fails to
 * decrypt rather than yielding plausible garbage — which for a backup is the
 * whole point, since nobody reads a restore closely enough to notice.
 *
 * **The trade, stated because it is the founder's to accept:** an encrypted
 * backup whose key exists only in `.env` on one workstation is a backup that
 * dies with that workstation. That is the exact failure this backup exists to
 * survive. The key MUST be escrowed somewhere else — a password manager is
 * enough — and until it is, this protects confidentiality while WEAKENING
 * recoverability. `docs/FOUNDER_QUEUE.md` carries the item.
 *
 *   node scripts/migration/encrypt-pack.mjs --in <dir> --out <dir>
 *   node scripts/migration/encrypt-pack.mjs --decrypt --in <dir> --out <dir>
 *   node scripts/migration/encrypt-pack.mjs --decrypt-one <file.enc> --out <file>
 */
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const MAGIC = Buffer.from([0x4c, 0x4d, 0x42, 0x41, 0x4b, 0x00, 0x00, 0x01]);
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + 1 + IV_BYTES;

const argv = process.argv.slice(2);
const flag = (n) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : undefined);

function envValue(name) {
  if (process.env[name]) return process.env[name];
  const f = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(f)) return undefined;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === name) return m[2].trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

/**
 * Refuse honestly with no key. `packages/auth/src/mail.ts` is the standing
 * pattern in this repo: build the whole path, run it, and refuse rather than
 * silently doing something weaker. An "encrypted backup" that quietly fell back
 * to plaintext would be the worst object in this directory.
 */
function key() {
  const hex = envValue('R2_BACKUP_ENCRYPTION_KEY');
  if (!hex) {
    console.error('R2_BACKUP_ENCRYPTION_KEY is not set.');
    console.error('Generate one and put it in .env (which is gitignored):');
    console.error(`  R2_BACKUP_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('hex')}`);
    console.error('');
    console.error('Then ESCROW it somewhere off this machine. A key that exists only here');
    console.error('makes the backup unrecoverable in exactly the disaster it is for.');
    process.exit(2);
  }
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    console.error(`R2_BACKUP_ENCRYPTION_KEY must be 32 bytes of hex (got ${buf.length})`);
    process.exit(2);
  }
  return buf;
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

async function encryptFile(k, src, dst) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const out = fs.createWriteStream(dst);
  out.write(Buffer.concat([MAGIC, Buffer.from([VERSION]), iv]));
  await pipeline(fs.createReadStream(src), cipher, out, { end: false });
  await new Promise((res, rej) => out.write(cipher.getAuthTag(), (e) => (e ? rej(e) : res())));
  await new Promise((res) => out.end(res));
}

async function decryptFile(k, src, dst) {
  const size = fs.statSync(src).size;
  const fd = fs.openSync(src, 'r');
  const header = Buffer.alloc(HEADER_BYTES);
  fs.readSync(fd, header, 0, HEADER_BYTES, 0);
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    fs.closeSync(fd);
    throw new Error(`${src} is not a LawMind backup envelope`);
  }
  const iv = header.subarray(MAGIC.length + 1);
  const tag = Buffer.alloc(TAG_BYTES);
  fs.readSync(fd, tag, 0, TAG_BYTES, size - TAG_BYTES);
  fs.closeSync(fd);

  const decipher = crypto.createDecipheriv('aes-256-gcm', k, iv);
  decipher.setAuthTag(tag);
  // GCM verifies on flush: a tampered or truncated object throws here rather
  // than producing a file that looks restorable and is not.
  await pipeline(
    fs.createReadStream(src, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }),
    decipher,
    fs.createWriteStream(dst),
  );
}

const k = key();

if (argv.includes('--decrypt-one')) {
  const src = flag('decrypt-one');
  const dst = flag('out');
  await decryptFile(k, src, dst);
  console.log(`decrypted ${src} -> ${dst}`);
  console.log(`sha256    ${sha256File(dst)}`);
  process.exit(0);
}

const inDir = flag('in');
const outDir = flag('out');
if (!inDir || !outDir) {
  console.error('--in <dir> and --out <dir> are required');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const decrypting = argv.includes('--decrypt');
const files = fs.readdirSync(inDir).filter((f) => fs.statSync(path.join(inDir, f)).isFile());

const record = [];
for (const f of files) {
  const src = path.join(inDir, f);
  if (decrypting) {
    if (!f.endsWith('.enc')) continue;
    const dst = path.join(outDir, f.replace(/\.enc$/, ''));
    await decryptFile(k, src, dst);
    console.log(`  ${f} -> ${path.basename(dst)}  ${fs.statSync(dst).size} bytes`);
    record.push({ file: path.basename(dst), bytes: fs.statSync(dst).size, sha256: sha256File(dst) });
    continue;
  }
  if (f === 'ENCRYPTION.json') continue;
  const dst = path.join(outDir, `${f}.enc`);
  const plainSha = sha256File(src);
  await encryptFile(k, src, dst);
  const entry = {
    file: f,
    plainBytes: fs.statSync(src).size,
    plainSha256: plainSha,
    cipherFile: `${f}.enc`,
    cipherBytes: fs.statSync(dst).size,
    cipherSha256: sha256File(dst),
  };
  record.push(entry);
  console.log(`  ${f}  ${entry.plainBytes} -> ${entry.cipherBytes} bytes`);
}

if (!decrypting) {
  /**
   * The plaintext digests travel WITH the ciphertext.
   *
   * Without them a readback can only prove "the bytes we uploaded came back",
   * which says nothing about whether those bytes decrypt to the pack. With
   * them, a restore can be verified end to end by someone who has the key and
   * nothing else.
   */
  fs.writeFileSync(
    path.join(outDir, 'ENCRYPTION.json'),
    JSON.stringify(
      {
        tool: 'scripts/migration/encrypt-pack.mjs',
        algorithm: 'AES-256-GCM',
        envelope: 'MAGIC(8) || VERSION(1) || IV(12) || ciphertext || TAG(16)',
        keySource: 'R2_BACKUP_ENCRYPTION_KEY (32 bytes hex, never uploaded)',
        createdAt: new Date().toISOString(),
        files: record,
      },
      null,
      2,
    ),
  );
}
console.log(`${decrypting ? 'decrypted' : 'encrypted'} ${record.length} files -> ${outDir}`);
