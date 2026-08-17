/**
 * NEW2 — should the fleet take the next scale step? Answered from the ledger.
 *
 * Reads `new2-fleet-metrics.jsonl` and compares the most recent worker-count
 * level against the one before it. Prints GO / HOLD / BACK OFF and the reason.
 *
 * ---------------------------------------------------------------------------
 * WHY A TOOL AND NOT A JUDGEMENT CALL
 * ---------------------------------------------------------------------------
 * The scale-up ladder is 3 canaries -> 8 -> 16 -> 24/32/38, and every step is
 * taken at a moment when the fleet looks busy and the temptation is to read
 * "busy" as "working". This lane has been wrong about exactly that more than
 * once: workers alive is the number that is easy to see and documents landing is
 * the number that matters. Handing the comparison to a script removes the step
 * where a tired reader eyeballs two numbers and rounds in the direction they
 * were already going.
 *
 * 38 IS NOT THE TARGET. It is a historical figure reached against Railway's
 * shared TCP proxy, where the bottleneck was network round-trips and more
 * concurrency genuinely helped. Locally the bottleneck is NVMe and Postgres,
 * and there is no reason the same number is optimal. The ladder stops wherever
 * the measurements say it stops, which may be well below 38.
 *
 * ---------------------------------------------------------------------------
 * THE VERDICT RULES
 * ---------------------------------------------------------------------------
 *   GO        throughput rose by more than the noise floor AND no stop-signal
 *             turned over
 *   HOLD      throughput did not rise materially — adding workers is buying
 *             nothing, so the current level is the answer
 *   BACK OFF  a stop-signal turned over: disk queue climbing, RAM falling,
 *             Postgres waits rising, or errors per batch rising. Throughput
 *             bought with failures is not throughput, and a saturated NVMe
 *             makes every later measurement unreadable.
 *
 * It REFUSES to advise from a single sample per level. One measurement of a
 * fleet is an anecdote: batch sizes differ, a big court lands in one window and
 * not the next, and the restore or a backup can be sharing the disk.
 *
 *   node scripts/migration/new2-scale-decision.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/**
 * `--ledger` exists so the GO / HOLD / BACK OFF branches can be exercised
 * against constructed ledgers. Every one of them is a path that fires once, at
 * 3am, on the strength of never having been run — which is the same trust
 * problem as a launcher that parses cleanly and fails at runtime.
 */
const ledgerArg = process.argv.indexOf('--ledger');
const LEDGER =
  ledgerArg >= 0 && process.argv[ledgerArg + 1]
    ? process.argv[ledgerArg + 1]
    : join(ROOT, 'docs', 'ops', 'migration', 'new2-fleet-metrics.jsonl');

if (!existsSync(LEDGER)) {
  console.error(`no ledger at ${LEDGER} — run new2-fleet-metrics.mjs first.`);
  process.exit(2);
}

const rows = readFileSync(LEDGER, 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  /**
   * Rows with no database are excluded from the DECISION, not from the ledger.
   * They are real measurements of the host and are worth keeping, but the
   * objective function is documents written per hour and they cannot supply it.
   * Dropping them silently would let a null quietly read as a zero.
   */
  .filter((r) => r.objective?.documentsWrittenPerHour != null);

const excluded = readFileSync(LEDGER, 'utf8').split(/\r?\n/).filter((l) => l.trim()).length - rows.length;

if (rows.length === 0) {
  console.error('no rows with a live database — nothing to decide from.');
  process.exit(2);
}

/** Group by worker count: the ladder rung, not the label, is what varies. */
const byLevel = new Map();
for (const r of rows) {
  const k = r.objective.workersAlive;
  if (!byLevel.has(k)) byLevel.set(k, []);
  byLevel.get(k).push(r);
}

const mean = (xs) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const num = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x));

function summarise(level, list) {
  const waits = list.map((r) => (r.database?.waits ?? []).filter((w) => w.kind !== 'running').reduce((n, w) => n + w.n, 0));
  return {
    workers: level,
    samples: list.length,
    docsPerHour: mean(num(list.map((r) => r.objective.documentsWrittenPerHour))),
    diskQueue: mean(num(list.map((r) => r.host.diskQueue))),
    diskWriteMbs: mean(num(list.map((r) => r.host.diskWriteMbs))),
    ramFreeMb: mean(num(list.map((r) => r.host.ramFreeMb))),
    pgWaits: mean(num(waits)),
    errPerBatch: mean(num(list.map((r) => r.errors.perBatch))),
    cpuPct: mean(num(list.map((r) => r.host.cpuPct))),
  };
}

const levels = [...byLevel.entries()]
  .map(([k, v]) => summarise(k, v))
  .sort((a, b) => a.workers - b.workers);

console.log(`NEW2 SCALE DECISION — ${new Date().toISOString()}`);
console.log(`  ledger rows used ${rows.length}${excluded > 0 ? `  (${excluded} excluded: no live database, null is not zero)` : ''}\n`);
console.log(
  '  workers'.padEnd(10),
  'n'.padStart(3),
  'docs/hour'.padStart(12),
  'diskQ'.padStart(7),
  'wrMB/s'.padStart(8),
  'ramFreeMB'.padStart(10),
  'pgWaits'.padStart(8),
  'err/batch'.padStart(10),
);
for (const l of levels) {
  const f = (v, d = 2) => (v == null ? 'n/a' : Number(v).toFixed(d));
  console.log(
    `  ${String(l.workers).padEnd(8)}`,
    String(l.samples).padStart(3),
    f(l.docsPerHour, 0).padStart(12),
    f(l.diskQueue).padStart(7),
    f(l.diskWriteMbs).padStart(8),
    f(l.ramFreeMb, 0).padStart(10),
    f(l.pgWaits, 1).padStart(8),
    f(l.errPerBatch, 3).padStart(10),
  );
}
console.log('');

if (levels.length < 2) {
  console.log('NO VERDICT — only one worker level in the ledger.');
  console.log('  Take at least two samples at the current level, then raise the fleet and sample again.');
  process.exit(0);
}

const prev = levels[levels.length - 2];
const cur = levels[levels.length - 1];

if (prev.samples < 2 || cur.samples < 2) {
  console.log(`NO VERDICT — ${prev.workers}w has ${prev.samples} sample(s), ${cur.workers}w has ${cur.samples}.`);
  console.log('  One measurement of a fleet is an anecdote: batch sizes differ, a large court');
  console.log('  lands in one window and not the next, and a backup can be sharing the disk.');
  console.log('  Two samples per level minimum before this will advise anything.');
  process.exit(0);
}

/**
 * A 10% noise floor. Ingest throughput swings on which court and year a worker
 * happens to be in — a scope of scanned 1990s PDFs and one of clean 2024 text do
 * not produce comparable rates — so a small rise is not evidence that adding
 * workers caused anything.
 */
const NOISE = 0.10;
const gain = prev.docsPerHour > 0 ? (cur.docsPerHour - prev.docsPerHour) / prev.docsPerHour : null;

const stopSignals = [];
const worse = (a, b, frac) => a != null && b != null && b > a * (1 + frac);
if (worse(prev.diskQueue, cur.diskQueue, 0.5) && cur.diskQueue > 2) {
  stopSignals.push(`NVMe queue ${prev.diskQueue.toFixed(2)} -> ${cur.diskQueue.toFixed(2)} — the disk is queueing, extra workers only wait in line`);
}
if (worse(prev.pgWaits, cur.pgWaits, 0.5) && cur.pgWaits > 1) {
  stopSignals.push(`Postgres waits ${prev.pgWaits.toFixed(1)} -> ${cur.pgWaits.toFixed(1)} — contention, not capacity`);
}
if (worse(prev.errPerBatch, cur.errPerBatch, 0.25) && cur.errPerBatch > 0.05) {
  stopSignals.push(`errors/batch ${prev.errPerBatch.toFixed(3)} -> ${cur.errPerBatch.toFixed(3)} — throughput bought with failures is not throughput`);
}
if (cur.ramFreeMb != null && prev.ramFreeMb != null && cur.ramFreeMb < prev.ramFreeMb * 0.6 && cur.ramFreeMb < 4096) {
  stopSignals.push(`free RAM ${prev.ramFreeMb.toFixed(0)}MB -> ${cur.ramFreeMb.toFixed(0)}MB — thrashing is silent and ruins every later measurement`);
}

console.log(`  comparing ${prev.workers} workers -> ${cur.workers} workers`);
console.log(`  throughput ${prev.docsPerHour.toFixed(0)} -> ${cur.docsPerHour.toFixed(0)} docs/hour${gain == null ? '' : `  (${(gain * 100).toFixed(1)}%)`}\n`);

if (stopSignals.length > 0) {
  console.log(`BACK OFF to ${prev.workers} workers — a stop-signal turned over:`);
  for (const s of stopSignals) console.log(`  ${s}`);
  console.log('\nThe ladder stops where the measurements say it stops. 38 is history, not a target.');
  process.exit(1);
}
if (gain != null && gain > NOISE) {
  console.log(`GO — throughput rose ${(gain * 100).toFixed(1)}%, above the ${(NOISE * 100).toFixed(0)}% noise floor, and no stop-signal turned over.`);
  console.log(`  Next rung: ${cur.workers < 8 ? 8 : cur.workers < 16 ? 16 : cur.workers < 24 ? 24 : cur.workers < 32 ? 32 : 38} workers. Sample twice there before deciding again.`);
  process.exit(0);
}
console.log(`HOLD at ${prev.workers} workers — throughput did not rise materially (${gain == null ? 'n/a' : `${(gain * 100).toFixed(1)}%`}, floor ${(NOISE * 100).toFixed(0)}%).`);
console.log('  Adding workers is buying nothing. The lower number is the answer; extra');
console.log('  processes are pure local thrash, and cheap compute is not free compute.');
process.exit(0);
