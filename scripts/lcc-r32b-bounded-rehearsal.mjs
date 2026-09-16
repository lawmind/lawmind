#!/usr/bin/env node
/**
 * LCC R32B — bounded release rehearsal for the `judgment_paragraphs` fix.
 *
 *   empty disposable DB  ->  committed migrations
 *   bounded export (--judgment-limit N) from the local source
 *   pack checks: paragraphs present, every paragraph's judgment_id in the bound set
 *   release-restore-cli into the disposable DB
 *   trace check: judgments COPY completes before judgment_paragraphs COPY opens
 *   post-restore paragraph proof (Reader + Search fallback)
 *
 * The source is only READ, and only through the bounded exporter. Nothing here
 * counts or scans a full source table. The disposable DB is dropped at the end
 * unless --keep is passed.
 *
 * Usage: node scripts/lcc-r32b-bounded-rehearsal.mjs [--judgment-limit 500] [--out docs/ai/lcc-r32b-do] [--keep]
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import postgres from 'postgres';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const OUT = resolve(flag('out') ?? './docs/ai/lcc-r32b-do');
const LIMIT = flag('judgment-limit') ?? '500';
const KEEP = args.includes('--keep');
const GZIP = args.includes('--gzip');
const TARGET_DB = 'lawmind_r32b_rehearsal';

const base = process.env['DATABASE_URL'];
if (!base) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}
const withDb = (name) => {
  const u = new URL(base);
  u.pathname = `/${name}`;
  return u.toString();
};
const target = withDb(TARGET_DB);
const admin = postgres(withDb('postgres'), { max: 1, onnotice: () => {} });

const node = (script, argv, env, cwd) =>
  execFileSync(process.execPath, ['--import', 'tsx', script, ...argv], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    cwd: resolve(cwd),
  });

const evidence = { round: 'LCC R32B-DO', phase: '1D bounded rehearsal', judgmentLimit: Number(LIMIT), gzip: GZIP, steps: [] };
const step = (name, detail) => {
  evidence.steps.push({ step: name, at: new Date().toISOString(), ...detail });
  console.log(`  ${name}: ${JSON.stringify(detail)}`);
};

/** Stream a COPY text file and return the values of one column, by index. */
async function columnValues(path, index) {
  const out = [];
  const raw = createReadStream(path);
  const input = path.endsWith('.gz') ? raw.pipe(createGunzip()) : raw;
  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.length === 0) continue;
    out.push(line.split('\t')[index]);
  }
  return out;
}

let verdict = 'FAIL';
try {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${TARGET_DB} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${TARGET_DB} TEMPLATE template0`);
  const t0 = Date.now();
  const migrateOut = node('src/migrate.ts', [], { DATABASE_URL: target }, 'packages/db');
  step('migrate', { ms: Date.now() - t0, tail: migrateOut.trim().split('\n').at(-1) });

  const pack = mkdtempSync(join(tmpdir(), 'lawmind-r32b-'));
  const t1 = Date.now();
  node('src/ops/release-export-cli.ts', ['--out', pack, '--judgment-limit', LIMIT, ...(GZIP ? ['--gzip'] : [])], {}, 'services/api');
  const manifest = JSON.parse(readFileSync(join(pack, 'MANIFEST.json'), 'utf8'));
  step('export', {
    ms: Date.now() - t1,
    pack,
    tables: manifest.tables.map(({ table, rows, checksum, bytes }) => ({ table, rows, checksum, bytes })),
  });

  const para = manifest.tables.find((t) => t.table === 'judgment_paragraphs');
  const judg = manifest.tables.find((t) => t.table === 'judgments');
  if (!para) throw new Error('manifest has no judgment_paragraphs entry');
  if (!(para.rows > 0)) throw new Error('judgment_paragraphs exported 0 rows');
  if (!para.checksum) throw new Error('judgment_paragraphs has no checksum');

  const boundIds = new Set(await columnValues(join(pack, judg.file), judg.columns.indexOf('id')));
  const paraJids = await columnValues(join(pack, para.file), para.columns.indexOf('judgment_id'));
  const outside = paraJids.filter((id) => !boundIds.has(id));
  step('pack_paragraph_bound', {
    boundJudgments: boundIds.size,
    paragraphRows: paraJids.length,
    manifestRows: para.rows,
    distinctParagraphJudgments: new Set(paraJids).size,
    outsideBoundSet: outside.length,
  });
  if (outside.length !== 0 || paraJids.length !== para.rows) throw new Error('paragraph pack is not bounded');

  const t2 = Date.now();
  let restoreOut = '';
  try {
    restoreOut = node(
      'src/ops/release-restore-cli.ts',
      ['--from', pack, '--allow-cascade-into'],
      { TARGET_DATABASE_URL: target },
      'services/api',
    );
  } catch (err) {
    restoreOut = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
    step('restore_failed', { tail: restoreOut.trim().split('\n').slice(-30) });
    throw new Error('restore failed');
  }
  const trace = readFileSync(join(pack, 'RESTORE_TRACE.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const idx = (phase, table) => trace.findIndex((e) => e.phase === phase && e.table === table);
  const verify = trace.filter((e) => e.phase === 'verify');
  const copyPhases = [...new Set(trace.filter((e) => e.table).map((e) => e.phase))];
  step('restore', {
    ms: Date.now() - t2,
    copyPhases,
    fileIntegrity: trace.filter((e) => e.phase === 'file_integrity').map(({ table, ok }) => ({ table, ok })),
    snapshot: manifest.consistency ?? null,
    verify: verify.map(({ table, rows, expectedRows, rowsOk, checksumOk }) => ({ table, rows, expectedRows, rowsOk, checksumOk })),
    tail: restoreOut.trim().split('\n').slice(-12),
  });
  const pv = verify.find((v) => v.table === 'judgment_paragraphs');
  if (!pv || !pv.rowsOk || !pv.checksumOk) throw new Error('judgment_paragraphs did not verify');
  if (verify.some((v) => !v.rowsOk || !v.checksumOk)) throw new Error('a table did not verify');

  // Load order: the first event naming each table, whatever the COPY phase is called.
  const firstJ = trace.findIndex((e) => e.table === 'judgments' && /copy/i.test(e.phase));
  const firstP = trace.findIndex((e) => e.table === 'judgment_paragraphs' && /copy/i.test(e.phase));
  const lastJ = trace.map((e, i) => (e.table === 'judgments' && /copy/i.test(e.phase) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  step('fk_load_order', { firstJudgmentsCopy: firstJ, lastJudgmentsCopy: lastJ, firstParagraphsCopy: firstP, verifyIdx: idx('verify', 'judgment_paragraphs') });
  if (!(firstJ >= 0 && firstP > lastJ)) throw new Error('judgment_paragraphs loaded before judgments finished');

  let proofOut;
  try {
    proofOut = node('../../scripts/lcc-r32b-paragraph-proof.mts', [], { PROOF_DATABASE_URL: target }, 'services/api');
  } catch (err) {
    proofOut = err.stdout ?? '';
  }
  const proof = JSON.parse(proofOut.slice(proofOut.indexOf('{')));
  step('paragraph_proof', proof);
  if (!proof.pass) throw new Error('paragraph proof failed');

  verdict = 'PASS';
} catch (err) {
  step('error', { message: err instanceof Error ? err.message : String(err) });
} finally {
  if (!KEEP) {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${TARGET_DB} WITH (FORCE)`).catch(() => {});
    step('cleanup', { dropped: TARGET_DB });
  }
  await admin.end();
}

evidence.verdict = verdict;
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, GZIP ? 'bounded-rehearsal-gzip.json' : 'bounded-rehearsal.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`\nBOUNDED_REHEARSAL = ${verdict}`);
process.exit(verdict === 'PASS' ? 0 : 1);
