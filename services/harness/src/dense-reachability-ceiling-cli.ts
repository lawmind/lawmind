/**
 * NEW1 — THE CEILING. What is the BEST the dense arm could possibly score?
 *
 *   pnpm --filter @lawmind/harness ceiling:dense
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS MEASUREMENT CHANGES THE ROUND'S CONCLUSION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ADVOCATE-100 reports doctrine 1/12, fact_pattern 0/10, supporting_authority
 * 0/6, adverse_authority 0/4. Every previous reading of those numbers — this
 * lane's included — treated them as a RANKING or REPRESENTATION failure, and
 * the whole representation lab was built on that reading.
 *
 * Before spending another GPU-hour on representations, one cheaper question has
 * to be answered: **is the target even in the index the dense arm searches?**
 *
 * `retrieve.ts`'s dense arm reads `judgment_chunks`. That table holds
 * **40,161 distinct judgments** — roughly 0.2% of the 18.7M-row corpus. It is
 * not a sample of the corpus; it is a small, historically-grown subset.
 *
 * So this computes, per query class:
 *
 *   denseReachable   the task has at least one bound target with a row in
 *                    `judgment_chunks`. If it does not, the dense arm CANNOT
 *                    return it, at any ef_search, under any representation,
 *                    with any reranker.
 *   inTop5           what ADVOCATE-100 actually measured
 *   hit AND reachable / hit AND NOT reachable
 *                    the cross-tab. The second cell is the falsifier: if hits
 *                    appear on unreachable targets, the reachability theory is
 *                    wrong and this file should be deleted.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A CEILING IS AND IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `denseReachable / bound` is an UPPER BOUND on dense success — the score a
 * PERFECT dense arm would get. It is not a prediction and not a target. The gap
 * between it and the measured score is the part that representation and ranking
 * work can address; everything below it is a coverage problem and belongs to the
 * embedding walk and the eligibility contract, not to the ranker.
 *
 * Reported alongside are the other two indexes, because "which index" is the
 * first thing anyone will ask and the answer differs sharply between them.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (rel: string): string => (isAbsolute(rel) ? rel : join(ROOT, rel));
const GOLD = abs(process.env['ADVOCATE100'] ?? 'docs/ai/new2/ADVOCATE100.json');
const RESULTS = abs(process.env['A100_RESULTS'] ?? 'docs/ai/new1-tier-a/advocate100-results.json');
const OUT = abs(process.env['OUT'] ?? 'docs/ai/new1-tier-a/dense-reachability-ceiling.json');

type Task = { task_id: string; query_class: string; targets: string[] };
type ResultRow = {
  taskId: string;
  queryClass: string;
  targetsBound: number;
  bestRank: number | null;
};

const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`);

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const gold = JSON.parse(readFileSync(GOLD, 'utf8')) as {
    tasks: Task[];
    gold_set_version?: string;
  };
  const results = JSON.parse(readFileSync(RESULTS, 'utf8')) as {
    rows: ResultRow[];
    measuredAt?: string;
  };

  const ids = [...new Set(gold.tasks.flatMap((t) => t.targets))];
  const sql = postgres(url, {
    ssl: sslFor(url),
    max: 2,
    onnotice: () => {},
    connection: { statement_timeout: 120_000 },
  });

  console.log('DENSE_REACHABILITY_CEILING');
  console.log(`  ${ids.length} distinct bound targets across ${gold.tasks.length} tasks`);

  const presence = async (
    label: string,
    run: () => Promise<readonly { judgment_id: string }[]>,
  ): Promise<Set<string>> => {
    const rows = await run();
    const s = new Set(rows.map((r) => r.judgment_id));
    console.log(`  ${label.padEnd(36)} ${s.size}/${ids.length}  (${pct(s.size, ids.length)})`);
    return s;
  };

  const chunked = await presence(
    'judgment_chunks — PRODUCTION dense arm',
    () =>
      sql`SELECT DISTINCT judgment_id FROM judgment_chunks WHERE judgment_id = ANY(${ids}::uuid[])`,
  );
  const probe = await presence(
    'new1_probe_half_250k — the 250k probe',
    () => sql`SELECT judgment_id FROM new1_probe_half_250k WHERE judgment_id = ANY(${ids}::uuid[])`,
  );
  const staged = await presence(
    'new1_doc_vector_stage — the Tier-A walk',
    () =>
      sql`SELECT judgment_id FROM new1_doc_vector_stage WHERE judgment_id = ANY(${ids}::uuid[])`,
  );

  const [corpusWide] = await sql<{ n: string }[]>`
    SELECT count(DISTINCT judgment_id)::text AS n FROM judgment_chunks`;
  console.log(`\n  judgment_chunks holds ${corpusWide?.n} distinct judgments corpus-wide.`);
  console.log(
    '  That is the population the production dense arm can return. Nothing else is reachable by it.\n',
  );

  const targetsOf = new Map(gold.tasks.map((t) => [t.task_id, t.targets]));
  const bound = results.rows.filter((r) => r.targetsBound > 0);

  type Cell = { n: number; reach: number; hit: number; hitReach: number; hitNotReach: number };
  const byClass: Record<string, Cell> = {};
  for (const r of bound) {
    const targets = targetsOf.get(r.taskId) ?? [];
    const reachable = targets.some((id) => chunked.has(id));
    const hit = r.bestRank !== null && r.bestRank <= 5;
    const c = (byClass[r.queryClass] ??= { n: 0, reach: 0, hit: 0, hitReach: 0, hitNotReach: 0 });
    c.n += 1;
    if (reachable) c.reach += 1;
    if (hit) c.hit += 1;
    if (hit && reachable) c.hitReach += 1;
    if (hit && !reachable) c.hitNotReach += 1;
  }

  console.log(
    'CLASS                          n  reachable  ceiling   inTop5  hit&reach  hit&NOTreach',
  );
  const total: Cell = { n: 0, reach: 0, hit: 0, hitReach: 0, hitNotReach: 0 };
  for (const [cls, c] of Object.entries(byClass).sort()) {
    console.log(
      cls.padEnd(28) +
        String(c.n).padStart(3) +
        String(c.reach).padStart(11) +
        pct(c.reach, c.n).padStart(9) +
        String(c.hit).padStart(9) +
        String(c.hitReach).padStart(11) +
        String(c.hitNotReach).padStart(14),
    );
    total.n += c.n;
    total.reach += c.reach;
    total.hit += c.hit;
    total.hitReach += c.hitReach;
    total.hitNotReach += c.hitNotReach;
  }
  console.log(
    'TOTAL'.padEnd(28) +
      String(total.n).padStart(3) +
      String(total.reach).padStart(11) +
      pct(total.reach, total.n).padStart(9) +
      String(total.hit).padStart(9) +
      String(total.hitReach).padStart(11) +
      String(total.hitNotReach).padStart(14),
  );

  console.log('');
  console.log(
    `CEILING: a PERFECT dense arm scores ${total.reach}/${total.n} = ${pct(total.reach, total.n)}.`,
  );
  console.log(`MEASURED: ${total.hit}/${total.n} = ${pct(total.hit, total.n)}.`);
  console.log(
    `WITHIN THE CEILING: ${total.hitReach}/${total.reach} = ${pct(total.hitReach, total.reach)} of reachable targets are found.`,
  );
  console.log('');
  if (total.hitNotReach === 0) {
    console.log(
      'FALSIFIER NOT TRIGGERED: zero hits on unreachable targets, as the theory requires.',
    );
    console.log('Coverage is a HARD ceiling here, not a correlation.');
  } else {
    console.log(
      `FALSIFIER TRIGGERED: ${total.hitNotReach} hit(s) on targets with no chunk row. The dense arm is not the only`,
    );
    console.log(
      'path to a top-5 result — the lexical arm reaches documents the dense arm cannot, and this',
    );
    console.log('ceiling bounds DENSE only, not the product.');
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        kind: 'new1_dense_reachability_ceiling',
        generatedAt: new Date().toISOString(),
        goldSetVersion: gold.gold_set_version ?? null,
        advocate100MeasuredAt: results.measuredAt ?? null,
        indexes: {
          judgment_chunks: {
            role: 'PRODUCTION dense arm',
            targetsPresent: chunked.size,
            distinctJudgmentsCorpusWide: Number(corpusWide?.n ?? 0),
          },
          new1_probe_half_250k: { role: 'probe', targetsPresent: probe.size },
          new1_doc_vector_stage: {
            role: 'Tier-A walk staging, not yet promoted',
            targetsPresent: staged.size,
          },
        },
        targetsTotal: ids.length,
        byClass,
        total,
        ceiling: {
          perfectDenseScore: total.reach,
          of: total.n,
          pct: total.n === 0 ? null : total.reach / total.n,
          measured: total.hit,
          withinCeiling: total.reach === 0 ? null : total.hitReach / total.reach,
          hitsOnUnreachableTargets: total.hitNotReach,
          interpretation:
            'A ceiling is an UPPER BOUND, not a prediction. The gap between ceiling and measured is what representation and ranking work can address. Everything BELOW the ceiling is a coverage problem owned by the embedding walk and the eligibility contract, not by the ranker.',
        },
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${OUT}`);
  await sql.end({ timeout: 5 });
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
