/**
 * NEW2 — R9 §1. WHICH SCOPES OWN THE UPSTREAM DELTA. Derived, never typed.
 *
 * `new2-yearscope-plan.mjs` reports ZERO candidate scopes right now, and it is
 * right about the question it asks: every scope walked its file to the end AS
 * THAT FILE WAS. The manifest asks a different question — the publisher has since
 * grown 46 objects and added one — and `fleet-work-is-derived-not-typed` forbids
 * answering it by hand-picking court codes out of the grown list.
 *
 * So this maps every GROWN / NEW upstream key back to the checkpoint file that
 * records our cursor for it, and from that filename to the launcher scope name,
 * using the SAME construction `hc-load-cli.ts` uses:
 *
 *     <court>[-y<year>][-to<toYear>].json
 *       X.json          -> hc-boot-X          (--from-year 2016, newest-first)
 *       X-to2015.json   -> hc-boot-hist-X
 *       X-to2022.json   -> hc-boot-mid-X
 *       X-y2026.json    -> hc-boot-X-y2026
 *
 * A key that appears in NO checkpoint has never been walked by any scope, and is
 * reported separately — that is the class a cursor cannot see.
 *
 * Prints the exact `-Only` list. Opens nothing but files.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CHECKPOINT_DIR = join(ROOT, 'services/ingest/.checkpoints');
const MANIFEST = join(ROOT, 'docs/ai/new2-r9/upstream-manifest.json');

function scopeForCheckpoint(file) {
  const base = file.replace(/\.json$/, '');
  let m = /^(.+?)-y(\d{4})$/.exec(base);
  if (m) return { scope: `hc-boot-${m[1]}-y${m[2]}`, court: m[1], year: Number(m[2]) };
  m = /^(.+?)-to(\d{4})$/.exec(base);
  if (m) {
    if (m[2] === '2015') return { scope: `hc-boot-hist-${m[1]}`, court: m[1], toYear: 2015, fromYear: 1950 };
    if (m[2] === '2022') return { scope: `hc-boot-mid-${m[1]}`, court: m[1], toYear: 2022, fromYear: 2016 };
    return { scope: `hc-boot-${m[1]}-to${m[2]}`, court: m[1], toYear: Number(m[2]), fromYear: 2016 };
  }
  return { scope: `hc-boot-${base}`, court: base, fromYear: 2016 };
}

/** key -> [{file, offset, size}] across every checkpoint. */
const keyToFiles = new Map();
for (const f of readdirSync(CHECKPOINT_DIR)) {
  if (!f.endsWith('.json')) continue;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(CHECKPOINT_DIR, f), 'utf8'));
  } catch {
    continue;
  }
  if (!parsed || typeof parsed !== 'object') continue;
  for (const [key, v] of Object.entries(parsed)) {
    if (!key.startsWith('metadata/parquet/')) continue;
    if (!v || typeof v !== 'object' || !Number.isFinite(Number(v.offset))) continue;
    if (!keyToFiles.has(key)) keyToFiles.set(key, []);
    keyToFiles.get(key).push({ file: f, offset: Number(v.offset), size: Number(v.size) });
  }
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const hc = manifest.buckets.aws_open_data_hc;

const scopes = new Map(); // scope -> {court, year, fromYear, toYear, keys:[], bytes}
const unowned = [];

function note(row, cls) {
  const owners = keyToFiles.get(row.key) ?? [];
  if (owners.length === 0) {
    unowned.push({ ...row, class: cls });
    return;
  }
  for (const o of owners) {
    const s = scopeForCheckpoint(o.file);
    if (!scopes.has(s.scope)) scopes.set(s.scope, { ...s, keys: [], bytes: 0, classes: {} });
    const e = scopes.get(s.scope);
    e.keys.push({ key: row.key, class: cls, added: row.added ?? row.upstreamSize, offset: o.offset });
    e.bytes += row.added ?? row.upstreamSize;
    e.classes[cls] = (e.classes[cls] ?? 0) + 1;
  }
}

for (const r of hc.grown) note(r, 'GROWN');
for (const r of hc.shrunk ?? []) note(r, 'SHRUNK');
for (const r of hc.changed ?? []) note(r, 'CHANGED');
for (const r of hc.newKeys) {
  if (r.bench === 'testcase') continue; // refused by isTestFixture; never a work item
  note(r, 'NEW');
}

const ranked = [...scopes.entries()]
  .map(([scope, v]) => ({ scope, ...v }))
  .sort((a, b) => b.bytes - a.bytes);

console.log(`DELTA SCOPES — ${ranked.length} scope(s) own ${hc.grown.length} GROWN + ${hc.newKeys.filter((k) => k.bench !== 'testcase').length} real NEW upstream objects`);
console.log('');
console.log('  scope                      objects   bytes waiting');
for (const r of ranked) {
  console.log(`  ${r.scope.padEnd(26)} ${String(r.keys.length).padStart(7)}   ${r.bytes.toLocaleString().padStart(12)}   ${JSON.stringify(r.classes)}`);
}
console.log('');
console.log(`  testcase fixture keys skipped: ${hc.newKeys.filter((k) => k.bench === 'testcase').length} (isTestFixture refuses them; a fixture partition is not work)`);
console.log(`  upstream keys owned by NO checkpoint: ${unowned.length}`);
for (const u of unowned) console.log(`    ${u.class}  ${u.key}  ${u.upstreamSize}`);
console.log('');
console.log('-Only list:');
console.log(ranked.map((r) => r.scope).join(','));

writeFileSync(join(ROOT, 'docs/ai/new2-r9/delta-scopes.json'), JSON.stringify({ takenAt: new Date().toISOString(), manifestTakenAt: manifest.takenAt, scopes: ranked, unowned }, null, 2));
console.log('');
console.log('written: docs/ai/new2-r9/delta-scopes.json');
