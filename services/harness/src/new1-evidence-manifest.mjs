/**
 * NEW1 — hash every artifact in a round's evidence directory, and verify it later.
 *
 *   node src/new1-evidence-manifest.mjs            # write manifest.json
 *   node src/new1-evidence-manifest.mjs --verify   # recompute and fail on drift
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FAILURE THIS EXISTS FOR, WHICH ALREADY HAPPENED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R14's `NEW1_FINALIZATION_RECEIPT.json` binds five artifacts by sha256. One of
 * them is `terminal-census.json`, bound as
 * `3fef6cba0c59070a5e45caea902e7f67c7adb3d88b642a0cc8690d71af3b74ad`.
 *
 * That hash was correct at commit `7887c00a`. The very next commit of the same
 * round, `cd613abf`, annotated the census with a `supersededByOngoingIngest`
 * block — an honest and useful annotation — and did not update the binding. From
 * `cd613abf` onward the committed file hashes to
 * `99f410293877fd95ff82abe2a3fc6a469b7500d3ec249458fb55f86d0196dc8e`.
 *
 * Nothing about the corpus was wrong. What was wrong is subtler and worse: the
 * round shipped a receipt that ASSERTS an intact chain, and the chain was broken
 * by the round itself. A binding that reads as verified when nobody can verify it
 * is worse than no binding, because the next agent trusts it.
 *
 * The binding was not the problem — the absence of anything that CHECKS the
 * binding was. This is that check.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE MANIFEST EXCLUDES ITSELF, AND WHY IT LISTS RATHER THAN NAMES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A file cannot contain its own hash. More importantly the manifest enumerates
 * the DIRECTORY rather than a hand-written list: a hand-written list silently
 * stops covering an artifact somebody adds later, which is the same failure one
 * level up.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../../', import.meta.url);
const OUT_DIR = new URL(process.env.NEW1_OUT_DIR ?? 'docs/ai/new1-r15/', ROOT);
const MANIFEST = new URL('manifest.json', OUT_DIR);
const VERIFY = process.argv.includes('--verify');
const REPO = fileURLToPath(ROOT);

/** Streamed — an evidence directory may hold a jsonl far past readFileSync's limit. */
async function sha256(u) {
  const h = createHash('sha256');
  await pipeline(createReadStream(u), h);
  return h.digest('hex');
}

const names = readdirSync(OUT_DIR)
  .filter((n) => n !== 'manifest.json')
  .filter((n) => statSync(new URL(n, OUT_DIR)).isFile())
  .sort();

const files = [];
for (const n of names) {
  const u = new URL(n, OUT_DIR);
  files.push({ path: n, bytes: statSync(u).size, sha256: await sha256(u) });
}

if (VERIFY) {
  if (!existsSync(MANIFEST)) {
    console.error('MANIFEST_MISSING — nothing to verify against');
    process.exit(1);
  }
  const prev = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const before = new Map(prev.files.map((f) => [f.path, f.sha256]));
  const after = new Map(files.map((f) => [f.path, f.sha256]));

  const changed = [...after].filter(([p, h]) => before.has(p) && before.get(p) !== h).map(([p]) => p);
  const added = [...after.keys()].filter((p) => !before.has(p));
  const removed = [...before.keys()].filter((p) => !after.has(p));

  for (const p of changed) console.error(`CHANGED  ${p}\n  was ${before.get(p)}\n  now ${after.get(p)}`);
  for (const p of added) console.error(`ADDED    ${p} — not covered by the manifest`);
  for (const p of removed) console.error(`REMOVED  ${p} — the manifest names a file that is gone`);

  const ok = changed.length === 0 && added.length === 0 && removed.length === 0;
  console.log(`EVIDENCE_MANIFEST=${ok ? 'INTACT' : 'DRIFTED'} files=${files.length}`);
  process.exit(ok ? 0 : 1);
}

const manifest = {
  kind: 'new1_evidence_manifest',
  writtenAt: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO }).toString().trim(),
  directory: OUT_DIR.href.slice(ROOT.href.length),
  verifyWith: 'node src/new1-evidence-manifest.mjs --verify',
  covers:
    'Every file in this directory except the manifest, enumerated from the directory ' +
    'rather than from a hand-written list, so an artifact added later is covered ' +
    'automatically instead of being silently omitted.',
  whyThisExists:
    "R14's finalization receipt bound terminal-census.json to a hash that the NEXT " +
    'commit of the same round invalidated. Nothing checked it, so the broken chain ' +
    'read as an intact one. A binding nobody verifies is worse than no binding.',
  files,
};

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${manifest.directory}manifest.json — ${files.length} files`);
