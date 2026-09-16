/**
 * NEW1 — ONE COMMAND that regenerates the terminal census from the live database.
 *
 *     pnpm --filter @lawmind/harness new1:terminal
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The R14 terminal result was correct and it was reproducible only by a person
 * who already knew which three scripts to run, in which order, with which
 * environment variable set. That is not reproducibility; it is a recipe held in
 * one agent's head, and the head does not survive compaction. A fresh agent runs
 * this and gets the census back.
 *
 * It does not RE-DERIVE the result. It re-MEASURES it. Every number comes from
 * the database in this run. If the corpus has moved, the output moves with it,
 * and that is the point — a receipt that cannot disagree with the database is
 * not evidence of anything.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COST, STATED UP FRONT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The census alone took 1,871 s on 15 Sep with five other backends active. The
 * integrity scan is a full pass over 8.2M vectors. Budget 45–60 minutes and run
 * it detached. This is deliberately not cheap and deliberately not cached
 * anywhere the product can read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY CHILD PROCESSES AND NOT IMPORTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Each stage owns one database connection and closes it. Importing them into one
 * process would share a connection pool across three full-table scans and make a
 * failure in the third stage look like a failure in the first. Separate
 * processes also mean a stage that dies leaves the stages before it on disk.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../../', import.meta.url);
const HERE = new URL('./', import.meta.url);
const OUT_DIR = new URL(process.env.NEW1_OUT_DIR ?? 'docs/ai/new1-r15/', ROOT);
mkdirSync(OUT_DIR, { recursive: true });

const SNAPSHOT = process.env.NEW1_SNAPSHOT_HASH ?? '5b5d02384b46c96c';

/**
 * Every stage writes into THIS round's directory. R14's artifacts are immutable
 * evidence of R14 and a re-run must not overwrite them — "the census R14 took"
 * and "the census we just took" are different facts, and R14's receipt refers to
 * the first one.
 */
const STAGES = [
  { id: 'census', script: 'new1-terminal-census.mjs', writes: 'terminal-census.json' },
  { id: 'integrity', script: 'new1-vector-integrity.mjs', writes: 'vector-integrity.json' },
  { id: 'receipt', script: 'new1-terminal-receipt.mjs', writes: 'NEW1_TERMINAL_RECEIPT.json' },
  /**
   * Last, because it hashes what the stages before it wrote. `--verify` on a
   * later run is what catches an artifact edited after the round shipped — the
   * exact break R14 introduced into its own hash chain and nothing detected.
   */
  { id: 'manifest', script: 'new1-evidence-manifest.mjs', writes: 'manifest.json' },
];

function run(stage) {
  const t0 = Date.now();
  process.stdout.write(`\n──── ${stage.id}: node src/${stage.script}\n`);
  const r = spawnSync(process.execPath, [fileURLToPath(new URL(stage.script, HERE))], {
    cwd: fileURLToPath(ROOT),
    /**
     * OUT_DIR is passed as a file:// href, not as a path. Every stage resolves it
     * with `new URL(NEW1_OUT_DIR, ROOT)`, and on Windows a bare `C:/Users/...`
     * parses as a URL whose SCHEME is `c:` — the directory would silently become
     * something else. An absolute href makes the base argument inert, which is
     * exactly the intent.
     */
    env: { ...process.env, NEW1_SNAPSHOT_HASH: SNAPSHOT, NEW1_OUT_DIR: OUT_DIR.href },
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = Number(((Date.now() - t0) / 1000).toFixed(1));
  process.stdout.write(`──── ${stage.id}: exit ${r.status} in ${seconds}s\n`);
  return { id: stage.id, script: `services/harness/src/${stage.script}`, exitCode: r.status, seconds };
}

/**
 * `--only census,integrity` runs a subset. The default is everything, and the
 * summary records which stages actually ran so a partial run can never be
 * mistaken for a full one — a receipt that does not say what it skipped is how a
 * partial measurement gets quoted as a complete one.
 */
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg === -1 ? null : new Set(process.argv[onlyArg + 1].split(',').map((s) => s.trim()));
const selected = only ? STAGES.filter((s) => only.has(s.id)) : STAGES;
if (only) {
  const unknown = [...only].filter((id) => !STAGES.some((s) => s.id === id));
  if (unknown.length) {
    console.error(`unknown stage(s): ${unknown.join(', ')} — known: ${STAGES.map((s) => s.id).join(', ')}`);
    process.exit(2);
  }
}

const results = [];
for (const s of selected) results.push(run(s));

const censusPath = new URL('terminal-census.json', OUT_DIR);
const integrityPath = new URL('vector-integrity.json', OUT_DIR);

const census = existsSync(censusPath) ? JSON.parse(readFileSync(censusPath, 'utf8')) : null;
const integrity = existsSync(integrityPath) ? JSON.parse(readFileSync(integrityPath, 'utf8')) : null;

const f = census?.fourState ?? {};
const EMBEDDING_COMPLETE =
  f.QUEUED === 0 &&
  f.UNNAMED_RESIDUAL === 0 &&
  f.EMBEDDED_CONTENT_IDENTITIES === f.ELIGIBLE_CONTENT_IDENTITIES &&
  census?.accountingCloses === true;

const summary = {
  kind: 'new1_terminal_verify',
  ranAt: new Date().toISOString(),
  snapshotHash: SNAPSHOT,
  command: 'pnpm --filter @lawmind/harness new1:terminal',
  stagesRun: selected.map((s) => s.id),
  stagesDefined: STAGES.map((s) => s.id),
  fullRun: selected.length === STAGES.length,
  stages: results,
  allStagesPassed: results.every((r) => r.exitCode === 0),
  fourState: census?.fourState ?? null,
  accountingCloses: census?.accountingCloses ?? null,
  VECTOR_INTEGRITY: integrity?.VECTOR_INTEGRITY ?? null,
  terminalReceipt: 'docs/ai/new1-r15/NEW1_TERMINAL_RECEIPT.json',
  EMBEDDING_COMPLETE,
  completenessRule:
    'QUEUED = 0 AND UNNAMED_RESIDUAL = 0 AND EMBEDDED_CONTENT_IDENTITIES = ' +
    'ELIGIBLE_CONTENT_IDENTITIES AND the four-state identity closes exactly.',
  notTerminalMeansStopped:
    'EMBEDDING_COMPLETE describes the coarse backfill reaching its frontier. It does ' +
    'NOT say the corpus stopped growing — new ingest raises the denominator and the ' +
    'incremental queue raises the numerator behind it, which is the system working.',
};

writeFileSync(new URL('terminal-verify.json', OUT_DIR), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\n${JSON.stringify(summary, null, 2)}`);
if (!summary.allStagesPassed || !EMBEDDING_COMPLETE) process.exitCode = 1;
