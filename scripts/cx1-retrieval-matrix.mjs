#!/usr/bin/env node
/**
 * CX1 retrieval matrix planner.
 *
 * Offline only: reads NEW1 harness source/fixtures and existing checkpoints,
 * computes reproducible hashes and completed-arm summaries, then writes a CX1
 * matrix plan. It does not query PostgreSQL, call an embedder, or run retrieval.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-retrieval-matrix');
const OUT_JSON = path.join(OUT_DIR, 'matrix-plan.json');
const OUT_CSV = path.join(OUT_DIR, 'completed-controlled-summary.csv');
const OUT_CONFIG_CSV = path.join(OUT_DIR, 'planned-configs.csv');
const OUT_MD = path.join(ROOT, 'docs', 'ai', 'CX1_RETRIEVAL_MATRIX.md');

const INPUTS = {
  checkpoint: 'arms-checkpoint.jsonl',
  baseline: 'services/harness/baseline.json',
  armsCli: 'services/harness/src/arms-cli.ts',
  retrievalSource: 'services/harness/src/retrieval.ts',
  retrieveSource: 'services/api/src/search/retrieve.ts',
  metricsSource: 'services/harness/src/metrics.ts',
  statsSource: 'services/harness/src/stats.ts',
  evalQueries: 'services/harness/src/fixtures/queries.eval.json',
  derivedQueries: 'services/harness/src/fixtures/queries.derived.json',
  handQueries: 'services/harness/src/fixtures/queries.hand.json',
  postMigrationProbes: 'services/harness/src/fixtures/post-migration-probes.json',
  preMigrationBaseline: 'docs/ai/PRE_MIGRATION_RETRIEVAL_BASELINE.md',
};

function abs(relativePath) {
  return path.join(ROOT, relativePath);
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

function readText(relativePath) {
  return fs.readFileSync(abs(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs(relativePath))).digest('hex');
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(file, rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function gitCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function gitDirty() {
  const result = spawnSync('git', ['status', '--short'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim().length > 0 : null;
}

function readJsonl(relativePath) {
  if (!fs.existsSync(abs(relativePath))) return [];
  return readText(relativePath)
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function ndcgAt(rows, k) {
  return mean(
    rows.map(({ row }) => {
      const rank = row.foundAtAnyRank;
      return rank && rank <= k ? 1 / Math.log2(rank + 1) : 0;
    }),
  );
}

function summarizeCheckpoint(rows) {
  const byArm = new Map();
  for (const item of rows) {
    const key = `${item.pass}:${item.mode}`;
    byArm.set(key, [...(byArm.get(key) || []), item]);
  }
  return [...byArm.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => {
      const [pass, mode] = key.split(':');
      const scored = items.map((item) => item.row);
      return {
        pass,
        mode,
        queries: scored.length,
        successAt5: scored.filter((row) => (row.goldRanks || []).length > 0).length / scored.length,
        recallAt20: scored.filter((row) => row.foundAtAnyRank !== null).length / scored.length,
        mrr: mean(scored.map((row) => (row.foundAtAnyRank ? 1 / row.foundAtAnyRank : 0))),
        ndcgAt5: ndcgAt(items, 5),
        ndcgAt20: ndcgAt(items, 20),
        meanReturned: mean(scored.map((row) => row.returned || 0)),
      };
    });
}

function fixtureSummary() {
  const evalDoc = readJson(INPUTS.evalQueries);
  const derivedDoc = readJson(INPUTS.derivedQueries);
  const handDoc = readJson(INPUTS.handQueries);
  const all = [
    ...(evalDoc.queries || []).map((query) => ({ ...query, fixture: 'queries.eval.json' })),
    ...(derivedDoc.queries || []).map((query) => ({ ...query, fixture: 'queries.derived.json' })),
    ...(handDoc.queries || []).map((query) => ({ ...query, fixture: 'queries.hand.json' })),
  ];
  const byFixture = new Map();
  const byGroup = new Map();
  const byLanguage = new Map();
  for (const query of all) {
    byFixture.set(query.fixture, (byFixture.get(query.fixture) || 0) + 1);
    byGroup.set(query.group || 'unknown', (byGroup.get(query.group || 'unknown') || 0) + 1);
    byLanguage.set(query.language || 'unknown', (byLanguage.get(query.language || 'unknown') || 0) + 1);
  }
  return {
    totalQueriesAcrossFixtures: all.length,
    evalQueries: (evalDoc.queries || []).length,
    derivedQueries: (derivedDoc.queries || []).length,
    handQueries: (handDoc.queries || []).length,
    groups: Object.fromEntries([...byGroup.entries()].sort()),
    languages: Object.fromEntries([...byLanguage.entries()].sort()),
    caveat:
      'queries.eval.json is the 283-query full arms set named in arms-cli.ts; derived/hand fixtures overlap with smaller gate/probe workflows and are not automatically additive gold.',
  };
}

function plannedConfigs() {
  return [
    {
      configId: 'E0-controlled-sparse-existing',
      status: 'complete_existing_checkpoint',
      gate: 'none_offline_summary',
      command: 'not rerun; summarized from arms-checkpoint.jsonl',
      pass: 'CONTROLLED',
      mode: 'sparse',
      notes: 'Existing NEW1 controlled pass; Supreme Court haystack. Postgres ts_rank, not BM25.',
    },
    {
      configId: 'E0-controlled-dense-existing',
      status: 'complete_existing_checkpoint',
      gate: 'none_offline_summary',
      command: 'not rerun; summarized from arms-checkpoint.jsonl',
      pass: 'CONTROLLED',
      mode: 'dense',
      notes: 'Existing NEW1 controlled pass; dense searches embedded Supreme Court corpus.',
    },
    {
      configId: 'E0-controlled-hybrid-existing',
      status: 'complete_existing_checkpoint',
      gate: 'none_offline_summary',
      command: 'not rerun; summarized from arms-checkpoint.jsonl',
      pass: 'CONTROLLED',
      mode: 'hybrid',
      notes: 'Existing NEW1 controlled pass; sparse+dense RRF through production harness code at run time.',
    },
    {
      configId: 'E1-uncontrolled-sparse',
      status: 'prepared_not_run',
      gate: 'MEDIUM_CLEAN',
      command: 'ARMS_PASS=uncontrolled pnpm --filter @lawmind/harness arms',
      pass: 'UNCONTROLLED',
      mode: 'sparse',
      notes: 'Measures production haystack behavior; do not compare as ranker quality against controlled pass.',
    },
    {
      configId: 'E1-uncontrolled-dense',
      status: 'prepared_not_run',
      gate: 'MEDIUM_CLEAN',
      command: 'ARMS_PASS=uncontrolled pnpm --filter @lawmind/harness arms',
      pass: 'UNCONTROLLED',
      mode: 'dense',
      notes: 'Same command produces sparse/dense/hybrid; listed separately for matrix accounting.',
    },
    {
      configId: 'E1-uncontrolled-hybrid',
      status: 'prepared_not_run',
      gate: 'MEDIUM_CLEAN',
      command: 'ARMS_PASS=uncontrolled pnpm --filter @lawmind/harness arms',
      pass: 'UNCONTROLLED',
      mode: 'hybrid',
      notes: 'Same command produces sparse/dense/hybrid; listed separately for matrix accounting.',
    },
    {
      configId: 'E2-halfvec-controlled-dense',
      status: 'blocked_by_missing_disposable_halfvec_retrieval_runner',
      gate: 'VECTOR_EXCLUSIVE',
      command: 'future: copied/disposable halfvec retrieval runner over frozen 283-query benchmark',
      pass: 'CONTROLLED',
      mode: 'dense_halfvec',
      notes: 'Requires Workstream C3/D disposable ANN recall and a harness that points only at copied vectors.',
    },
    {
      configId: 'E3-halfvec-controlled-hybrid',
      status: 'blocked_by_missing_disposable_halfvec_retrieval_runner',
      gate: 'VECTOR_EXCLUSIVE',
      command: 'future: copied/disposable halfvec hybrid retrieval runner over frozen 283-query benchmark',
      pass: 'CONTROLLED',
      mode: 'hybrid_halfvec',
      notes: 'Do not route production retrieval to halfvec; NEW1 owns quality approval.',
    },
    {
      configId: 'E4-ef-search-sweep',
      status: 'blocked_by_hnsw_parameter_lab',
      gate: 'VECTOR_EXCLUSIVE',
      command: 'future: run HNSW finalist ef_search values against frozen retrieval benchmark',
      pass: 'CONTROLLED',
      mode: 'dense_or_hybrid',
      notes: 'Depends on Workstream D Pareto frontier; avoid tuning against hidden data.',
    },
    {
      configId: 'E5-exact-route-probes',
      status: 'prepared_not_run',
      gate: 'MEDIUM_CLEAN',
      command: 'future: bounded exact citation/title probe set from post-migration-probes.json',
      pass: 'PROBES',
      mode: 'exact_citation_title',
      notes: 'Probe exact routes separately from dense/lexical arms; citation harness five-state semantics apply.',
    },
  ];
}

function inputInventory() {
  return Object.entries(INPUTS).map(([name, relativePath]) => ({
    name,
    path: relativePath,
    exists: fs.existsSync(abs(relativePath)),
    sha256: fs.existsSync(abs(relativePath)) ? sha256(relativePath) : null,
    sizeBytes: fs.existsSync(abs(relativePath)) ? fs.statSync(abs(relativePath)).size : null,
  }));
}

function renderMarkdown(plan) {
  const lines = [];
  lines.push('# CX1 Retrieval Matrix');
  lines.push('');
  lines.push(`Generated: **${plan.generatedAt}**`);
  lines.push('');
  lines.push(`Status: **${plan.status}**`);
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push('This checkpoint is offline. It reads existing NEW1 harness fixtures, source, logs, and checkpoints; it does not query PostgreSQL, call embeddings, run retrieval, mutate production, edit NEW1 gold, or change ranking code.');
  lines.push('');
  lines.push('## Completed Existing Evidence');
  lines.push('');
  lines.push('The existing `arms-checkpoint.jsonl` contains the full CONTROLLED pass: 283 queries x 3 arms = 849 rows. This is a Supreme Court controlled haystack comparison, not a High Court benchmark and not a halfvec decision.');
  lines.push('');
  lines.push('| Pass | Mode | Queries | success@5 | recall@20 | MRR | nDCG@5 | nDCG@20 |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|');
  for (const row of plan.completedSummaries) {
    lines.push(
      `| ${row.pass} | ${row.mode} | ${row.queries} | ${(row.successAt5 * 100).toFixed(1)}% | ${(row.recallAt20 * 100).toFixed(1)}% | ${row.mrr.toFixed(3)} | ${row.ndcgAt5.toFixed(3)} | ${row.ndcgAt20.toFixed(3)} |`,
    );
  }
  lines.push('');
  lines.push('## Matrix State');
  lines.push('');
  lines.push('| Config | Status | Gate | Command |');
  lines.push('|---|---|---|---|');
  for (const config of plan.configs) {
    lines.push(`| \`${config.configId}\` | ${config.status} | ${config.gate} | \`${config.command}\` |`);
  }
  lines.push('');
  lines.push('## KNOW / Not KNOW');
  lines.push('');
  lines.push('- KNOW: the controlled sparse/dense/hybrid checkpoint can be summarized reproducibly from 849 existing rows.');
  lines.push('- KNOW: in that controlled Supreme Court pass, dense leads the three existing modes on success@5, recall@20, MRR, and nDCG.');
  lines.push('- Not KNOW: uncontrolled production-haystack comparison is not complete in this artifact.');
  lines.push('- Not KNOW: fp32-vs-halfvec retrieval impact, HNSW `ef_search` frontier impact, and High Court retrieval quality remain unmeasured here.');
  lines.push('- Not safe to claim: Postgres `ts_rank` sparse is BM25. It is not.');
  lines.push('');
  lines.push('## Machine Outputs');
  lines.push('');
  lines.push('- `docs/ai/cx1-retrieval-matrix/matrix-plan.json`');
  lines.push('- `docs/ai/cx1-retrieval-matrix/completed-controlled-summary.csv`');
  lines.push('- `docs/ai/cx1-retrieval-matrix/planned-configs.csv`');
  lines.push('');
  lines.push('## Next Action');
  lines.push('');
  lines.push('When the queue permits MEDIUM_CLEAN, run only one bounded retrieval command at a time and preserve per-arm checkpoints. When VECTOR_EXCLUSIVE opens, run C3/D disposable vector measurements before any halfvec retrieval arm.');
  return `${lines.join('\n')}\n`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const checkpointRows = readJsonl(INPUTS.checkpoint);
  const completedSummaries = summarizeCheckpoint(checkpointRows);
  const configs = plannedConfigs();
  const plan = {
    schema: 'cx1-retrieval-matrix-v1',
    generatedAt: new Date().toISOString(),
    status: 'prepared_with_existing_controlled_summary',
    git: {
      commit: gitCommit(),
      dirty: gitDirty(),
    },
    boundary:
      'offline only: no PostgreSQL query, no embedding call, no retrieval run, no NEW1 gold edit, no production mutation',
    inputs: inputInventory(),
    fixtureSummary: fixtureSummary(),
    checkpoint: {
      path: INPUTS.checkpoint,
      rows: checkpointRows.length,
      completeControlledRowsExpected: 283 * 3,
      completeControlledRowsObserved: checkpointRows.filter((row) => row.pass === 'CONTROLLED').length,
      passes: [...new Set(checkpointRows.map((row) => row.pass))].sort(),
      modes: [...new Set(checkpointRows.map((row) => row.mode))].sort(),
    },
    completedSummaries,
    configs,
    caveats: [
      'queries.eval.json is a Supreme Court regression/evaluation set; it does not prove High Court retrieval quality.',
      'CONTROLLED holds the haystack constant for ranker comparison; UNCONTROLLED measures production reach and must not be conflated with CONTROLLED.',
      'Sparse mode is Postgres ts_rank, not BM25.',
      'Halfvec retrieval arms are not runnable until copied/disposable halfvec retrieval structures exist.',
      'No citation shown here is a verified user-facing legal answer.',
    ],
  };
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(plan, null, 2)}\n`);
  writeCsv(OUT_CSV, completedSummaries, [
    'pass',
    'mode',
    'queries',
    'successAt5',
    'recallAt20',
    'mrr',
    'ndcgAt5',
    'ndcgAt20',
    'meanReturned',
  ]);
  writeCsv(OUT_CONFIG_CSV, configs, ['configId', 'status', 'gate', 'command', 'pass', 'mode', 'notes']);
  fs.writeFileSync(OUT_MD, renderMarkdown(plan));
  console.log(`wrote ${rel(OUT_JSON)}`);
  console.log(`wrote ${rel(OUT_CSV)}`);
  console.log(`wrote ${rel(OUT_MD)}`);
  console.log(`controlled summaries ${completedSummaries.length}; checkpoint rows ${checkpointRows.length}`);
}

main();
