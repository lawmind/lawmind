#!/usr/bin/env node
/**
 * LCC R31 B3 — does a repeated bare `cite:` structured search cross PostgreSQL's
 * plan-cache boundary into a bad GENERIC plan, the way the Reader did in R30?
 *
 *   node --env-file=.env --import tsx scripts/lcc-r31-cite-plan-cache.mjs [--out docs/ai/lcc-r31] [--n 12]
 *
 * ONE connection (`max: 1`, postgres.js prepared statements on, as production),
 * so every execution of a statement lands on the same backend and its plan-cache
 * counter really advances. The pool in production spreads work over many
 * connections; that is the weaker case, so this measures the strong one.
 *
 * Phases:
 *   1. AUTO    — the real `answerStructured` (what POST /search calls), N times
 *                per class, interleaved and then back-to-back, with the backend
 *                pid and `pg_prepared_statements.generic_plans/custom_plans`
 *                read back so "crossed the threshold" is observed, not assumed.
 *   2. FORCED  — the exact prepared texts captured in phase 1, re-PREPAREd on a
 *                reserved connection and EXPLAIN ANALYZEd per class under
 *                `SET LOCAL plan_cache_mode = force_custom_plan` and
 *                `force_generic_plan`. Results are compared by judgment id.
 *
 * Read-only. Session/transaction-local settings only. Writes one JSON artifact.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';

import postgres from 'postgres';

import { answerStructured } from '../services/api/src/search/structured.ts';
import { citationLookupKey } from '../services/api/src/search/query-shape.ts';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const OUT = resolve(flag('out', './docs/ai/lcc-r31'));
const N = Number(flag('n', '12'));
const TIMEOUT_MS = Number(process.env['PG_STATEMENT_TIMEOUT_MS'] ?? 15_000);
const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

/** Each class is re-checked live below; a stale assumption fails the run. */
const CLASSES = [
  { cls: 'A_unique_neutral', citation: '2022 INSC 690', expect: 'matched', expectTotal: 1 },
  { cls: 'B1_reporter_only', citation: '[2018] 3 S.C.R. 65', expect: 'matched', expectTotal: null },
  { cls: 'B2_alias_concordance', citation: '(2013) 15 SCC 27', expect: 'matched', expectTotal: 1 },
  { cls: 'C_ambiguous', citation: '2020 INSC 189', expect: 'ambiguous', expectTotal: 3 },
  { cls: 'D_zero', citation: '2099 INSC 99999', expect: 'no_match', expectTotal: 0 },
];
const LIMIT = 10;

const sql = postgres(url, {
  max: 1,
  onnotice: () => {},
  connection: { statement_timeout: TIMEOUT_MS, application_name: 'lcc-r31-cite-plan-cache' },
});

const activity = async () =>
  sql`SELECT pid, state, application_name, backend_type,
             extract(epoch FROM now() - query_start)::int AS age_s, left(query, 70) AS q
        FROM pg_stat_activity
       WHERE state IS DISTINCT FROM 'idle' AND pid <> pg_backend_pid()
         AND backend_type = 'client backend'`;

const planCounters = async () =>
  sql`SELECT name, generic_plans, custom_plans, left(statement, 120) AS head
        FROM pg_prepared_statements
       WHERE statement LIKE '%lawmind_citation_keys%' AND statement NOT LIKE '%pg_prepared_statements%'`;

const artifact = {
  round: 'LCC R31 B3',
  startedAt: new Date().toISOString(),
  host: hostname(),
  statementTimeoutMs: TIMEOUT_MS,
  executionsPerClass: N,
  activityBefore: await activity(),
  classes: CLASSES,
  auto: [],
  autoPlanCounters: null,
  forced: [],
};
const [{ version }] = await sql`SELECT version()`;
artifact.serverVersion = version;
const [{ mode }] = await sql`SELECT current_setting('plan_cache_mode') AS mode`;
artifact.autoPlanCacheMode = mode;

async function autoRun(c, round) {
  const [{ pid }] = await sql`SELECT pg_backend_pid() AS pid`;
  const started = performance.now();
  let out;
  let error = null;
  try {
    out = await answerStructured(sql, `cite:"${c.citation}"`, LIMIT);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const row = {
    cls: c.cls,
    round,
    pid,
    elapsedMs: Math.round((performance.now() - started) * 10) / 10,
    outcome: out?.kind ?? 'threw',
    total: out && 'total' in out ? out.total : out?.kind === 'no_match' ? 0 : null,
    ids: out && 'hits' in out ? out.hits.map((h) => h.judgmentId).sort() : [],
    ambiguous: out?.kind === 'ambiguous',
    timeout: out?.kind === 'timed_out',
    error,
  };
  artifact.auto.push(row);
  return row;
}

// Interleaved first (every class meets a warm cache), then back-to-back.
for (let round = 1; round <= N; round++) {
  for (const c of CLASSES) await autoRun(c, `interleaved-${round}`);
}
for (const c of CLASSES) {
  for (let round = 1; round <= N; round++) await autoRun(c, `serial-${round}`);
}
artifact.autoPlanCounters = await planCounters();

const [{ pid: autoPid }] = await sql`SELECT pg_backend_pid() AS pid`;
artifact.autoSingleBackend = artifact.auto.every((r) => r.pid === autoPid);

// Exact prepared texts, captured from the backend that ran them.
const texts = await sql`
  SELECT statement, array_to_json(parameter_types::text[]) AS types FROM pg_prepared_statements
   WHERE statement LIKE '%lawmind_citation_keys%' AND statement NOT LIKE '%pg_prepared_statements%'`;

mkdirSync(OUT, { recursive: true });
const file = join(OUT, `cite-plan-cache-${flag('label', 'baseline')}.json`);
artifact.capturedStatements = texts.map((t) => ({ types: t.types, statement: t.statement }));
// Checkpoint: the AUTO phase is the expensive half and must survive a FORCED failure.
writeFileSync(file, JSON.stringify(artifact, null, 2) + '\n');
console.error(
  'captured',
  JSON.stringify(artifact.capturedStatements.map((t) => [t.types, t.statement.slice(0, 60)])),
);

const reserved = await sql.reserve();
try {
  let k = 0;
  for (const t of texts) {
    const name = `r31_cite_${k++}`;
    const kind = /count\(\*\)/.test(t.statement) ? 'count' : 'page';
    const nParams = t.types.length;
    await reserved.unsafe(`PREPARE ${name}(${t.types.join(',')}) AS ${t.statement}`);
    for (const c of CLASSES) {
      const key = citationLookupKey(c.citation);
      // $1..$3 are the citation key (three arms); a page adds OFFSET, LIMIT.
      const params = nParams === 3 ? [key, key, key] : [key, key, key, 0, LIMIT];
      if (params.length !== nParams)
        throw new Error(`unexpected parameter count ${nParams} for ${kind}`);
      const lit = params.map((p) => (typeof p === 'number' ? String(p) : `'${p}'`)).join(',');
      for (const mode of ['force_custom_plan', 'force_generic_plan']) {
        const rec = { cls: c.cls, statement: kind, mode };
        await reserved`BEGIN`;
        try {
          await reserved.unsafe(`SET LOCAL plan_cache_mode = ${mode}`);
          const started = performance.now();
          await reserved`SAVEPOINT r31_sp`;
          try {
            const [plan] = await reserved.unsafe(
              `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE ${name}(${lit})`,
            );
            const p = plan['QUERY PLAN'][0];
            rec.executionMs = p['Execution Time'];
            rec.planningMs = p['Planning Time'];
            rec.plan = summarise(p.Plan);
            rec.timeout = false;
          } catch (e) {
            rec.timeout = /statement timeout/i.test(String(e?.message));
            rec.error = String(e?.message);
            rec.elapsedMs = Math.round(performance.now() - started);
            await reserved`ROLLBACK TO SAVEPOINT r31_sp`;
          }
          // Result identity under this mode, same statement, same connection.
          if (!rec.timeout && !rec.error) {
            const rows = await reserved.unsafe(`EXECUTE ${name}(${lit})`);
            rec.result =
              kind === 'count' ? { n: Number(rows[0].n) } : { ids: rows.map((r) => r.id).sort() };
          }
          // Plan shape without executing, for the record.
          const shape = await reserved.unsafe(`EXPLAIN (FORMAT JSON) EXECUTE ${name}(${lit})`);
          rec.estimate = summarise(shape[0]['QUERY PLAN'][0].Plan);
        } finally {
          await reserved`ROLLBACK`;
        }
        artifact.forced.push(rec);
      }
    }
    await reserved.unsafe(`DEALLOCATE ${name}`);
  }
} finally {
  reserved.release();
}

function summarise(node) {
  const nodes = [];
  (function walk(n, depth) {
    nodes.push(
      `${'  '.repeat(depth)}${n['Node Type']}${n['Index Name'] ? ` on ${n['Index Name']}` : ''}` +
        `${n['Relation Name'] ? ` [${n['Relation Name']}]` : ''}` +
        ` est=${n['Plan Rows']}` +
        (n['Actual Rows'] !== undefined ? ` act=${n['Actual Rows']}x${n['Actual Loops']}` : '') +
        (n['Shared Hit Blocks'] !== undefined
          ? ` buf=${n['Shared Hit Blocks'] + (n['Shared Read Blocks'] ?? 0)}`
          : ''),
    );
    for (const c of n.Plans ?? []) walk(c, depth + 1);
  })(node, 0);
  return { cost: node['Total Cost'], nodes };
}

// ── verdicts ────────────────────────────────────────────────────────────────
const byCls = {};
for (const c of CLASSES) {
  const rows = artifact.auto.filter((r) => r.cls === c.cls);
  const ms = rows.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const idSets = new Set(rows.map((r) => r.ids.join(',')));
  byCls[c.cls] = {
    executions: rows.length,
    outcomes: [...new Set(rows.map((r) => r.outcome))],
    totals: [...new Set(rows.map((r) => r.total))],
    stableIds: idSets.size === 1,
    timeouts: rows.filter((r) => r.timeout).length,
    errors: rows.filter((r) => r.error).length,
    minMs: ms[0],
    p50Ms: ms[Math.floor(ms.length / 2)],
    maxMs: ms[ms.length - 1],
    expectedOutcome: c.expect,
    outcomeAsExpected: rows.every((r) => r.outcome === c.expect),
    totalAsExpected: c.expectTotal === null ? true : rows.every((r) => r.total === c.expectTotal),
  };
  const f = artifact.forced.filter((r) => r.cls === c.cls);
  for (const stmt of ['count', 'page']) {
    const cu = f.find((r) => r.statement === stmt && r.mode === 'force_custom_plan');
    const ge = f.find((r) => r.statement === stmt && r.mode === 'force_generic_plan');
    byCls[c.cls][`${stmt}IdentityEqual`] =
      cu && ge && JSON.stringify(cu.result) === JSON.stringify(ge.result);
    byCls[c.cls][`${stmt}CustomMs`] = cu?.executionMs ?? null;
    byCls[c.cls][`${stmt}GenericMs`] =
      ge?.executionMs ?? (ge?.timeout ? `TIMEOUT>${TIMEOUT_MS}` : null);
  }
}
artifact.summary = byCls;
const seqScan = artifact.forced.some((r) =>
  (r.plan?.nodes ?? r.estimate?.nodes ?? []).some((n) =>
    /Seq Scan \[judgments\]|Index Scan Backward on judgments_judgment_date/.test(n),
  ),
);
const worstGeneric = Math.max(
  ...artifact.forced
    .filter((r) => r.mode === 'force_generic_plan')
    .map((r) => (r.timeout ? Infinity : (r.executionMs ?? 0))),
);
const worstCustom = Math.max(
  ...artifact.forced
    .filter((r) => r.mode === 'force_custom_plan')
    .map((r) => (r.timeout ? Infinity : (r.executionMs ?? 0))),
);
const autoTimeouts = artifact.auto.filter((r) => r.timeout).length;
const autoMax = Math.max(...artifact.auto.map((r) => r.elapsedMs));
artifact.verdict = {
  CITE_REPEATED_EXECUTIONS: Math.min(...Object.values(byCls).map((s) => s.executions)),
  AUTO_SINGLE_BACKEND: artifact.autoSingleBackend,
  AUTO_GENERIC_PLANS_USED: artifact.autoPlanCounters.map((p) => ({
    generic: p.generic_plans,
    custom: p.custom_plans,
  })),
  AUTO_TIMEOUTS: autoTimeouts,
  AUTO_MAX_MS: autoMax,
  FORCED_WORST_CUSTOM_MS: worstCustom,
  FORCED_WORST_GENERIC_MS: worstGeneric,
  CORPUS_SCAN_NODE_SEEN: seqScan,
  RESULT_IDENTITY_EQUAL: Object.values(byCls).every(
    (s) => s.countIdentityEqual && s.pageIdentityEqual,
  ),
  SEMANTICS_AS_EXPECTED: Object.values(byCls).every(
    (s) => s.outcomeAsExpected && s.totalAsExpected && s.stableIds,
  ),
};
artifact.activityAfter = await activity();
artifact.finishedAt = new Date().toISOString();
await sql.end();

writeFileSync(file, JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify({ file, verdict: artifact.verdict, summary: byCls }, null, 2));
for (const r of artifact.forced) {
  console.log(`\n# ${r.cls} ${r.statement} ${r.mode} exec=${r.executionMs ?? r.error}`);
  console.log((r.plan ?? r.estimate).nodes.join('\n'));
}
