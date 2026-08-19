/**
 * Retrieval regression harness — structural, repeatable, honest about not
 * having graded relevance judgments.
 *
 *   pnpm --filter @lawmind/api retrieval:regression [--save-baseline]
 *
 * **What this can and cannot claim.** There is no graded gold set yet
 * (`docs/ai/RETRIEVAL_BENCHMARK_DESIGN.md` scopes that separately, and
 * inventing one here would be exactly the fabricated-gold-answer failure
 * this program's own standing rule forbids). What IS honestly measurable
 * without one: whether a query that used to return something now returns
 * nothing, whether its TOP result changed to a different judgment, and
 * whether it got materially slower. None of those requires knowing the
 * "right" answer — they require only comparing today's real output to a
 * previous real run's real output.
 *
 * `--save-baseline` writes today's run as the new baseline
 * (`retrieval-regression-baseline.json`). Without it, this run is compared
 * against whatever baseline already exists and reports deltas; first run
 * with no baseline file just establishes one.
 *
 * A CHANGED top result is reported, never treated as pass/fail on its own —
 * a better result looks identical to a worse one from this tool's point of
 * view, which is exactly why `docs/CURRENT_PLAN.md`'s own rule holds: a
 * retrieval change that shifts a top result must be judged by a human or
 * against real gold, not by this script alone.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { BENCH_QUERIES } from './bench-queries.ts';
import { hybridSearch } from './retrieve.ts';
import { sslFor } from '../db-ssl';

type QueryResult = {
  query: string;
  shape: string;
  resultCount: number;
  topJudgmentId: string | null;
  topCaseTitle: string | null;
  latencyMs: number;
};

type Baseline = {
  capturedAt: string;
  corpusJudgments: string;
  corpusChunks: string;
  results: QueryResult[];
};

const BASELINE_PATH = 'retrieval-regression-baseline.json';

async function runAll(sql: postgres.Sql): Promise<QueryResult[]> {
  const out: QueryResult[] = [];
  for (const { query, shape } of BENCH_QUERIES) {
    const started = performance.now();
    const results = await hybridSearch(sql, query, null, {}, 5);
    const latencyMs = performance.now() - started;
    out.push({
      query,
      shape,
      resultCount: results.length,
      topJudgmentId: results[0]?.judgmentId ?? null,
      topCaseTitle: results[0]?.caseTitle ?? null,
      latencyMs,
    });
  }
  return out;
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const saveBaseline = process.argv.includes('--save-baseline');

  const sql = postgres(url, { max: 4, ssl: sslFor(url) });
  let exitCode = 0;
  try {
    const [size] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM judgments`;
    const [vectors] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM judgment_chunks`;

    console.log(`RETRIEVAL REGRESSION — ${BENCH_QUERIES.length} queries`);
    console.log(`corpus: ${size?.n} judgments, ${vectors?.n} chunks`);
    console.log('='.repeat(78));

    const results = await runAll(sql);

    const emptyCount = results.filter((r) => r.resultCount === 0).length;
    console.log(`\nqueries returning nothing: ${emptyCount}/${results.length}`);
    for (const r of results.filter((x) => x.resultCount === 0)) {
      console.log(`  EMPTY [${r.shape}] "${r.query}"`);
    }

    if (!existsSync(BASELINE_PATH)) {
      console.log(`\nno baseline at ${BASELINE_PATH} yet -- this run establishes one.`);
      const baseline: Baseline = {
        capturedAt: new Date().toISOString(),
        corpusJudgments: size?.n ?? '0',
        corpusChunks: vectors?.n ?? '0',
        results,
      };
      writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
      console.log(`baseline written.`);
    } else {
      const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
      console.log(`\ncomparing against baseline captured ${baseline.capturedAt} ` +
        `(corpus was ${baseline.corpusJudgments} judgments, now ${size?.n})`);

      const byQuery = new Map(baseline.results.map((r) => [r.query, r]));
      let topChanged = 0;
      let wentEmpty = 0;
      let recoveredFromEmpty = 0;
      let latencyRegressed = 0;
      console.log('\nDELTAS');
      console.log('='.repeat(78));
      for (const r of results) {
        const prev = byQuery.get(r.query);
        if (!prev) {
          console.log(`  NEW QUERY [${r.shape}] "${r.query}" -- not in baseline, no delta to report`);
          continue;
        }
        if (prev.resultCount > 0 && r.resultCount === 0) {
          wentEmpty++;
          console.log(`  WENT EMPTY [${r.shape}] "${r.query}" -- had ${prev.resultCount} results, now 0`);
        }
        if (prev.resultCount === 0 && r.resultCount > 0) {
          recoveredFromEmpty++;
          console.log(`  RECOVERED [${r.shape}] "${r.query}" -- was empty, now ${r.resultCount} results`);
        }
        if (prev.topJudgmentId !== r.topJudgmentId && prev.topJudgmentId !== null && r.topJudgmentId !== null) {
          topChanged++;
          console.log(
            `  TOP RESULT CHANGED [${r.shape}] "${r.query}"\n` +
              `    was: ${prev.topCaseTitle} (${prev.topJudgmentId})\n` +
              `    now: ${r.topCaseTitle} (${r.topJudgmentId})`,
          );
        }
        // A generous threshold -- this corpus grows between runs (more
        // judgments to scan is a REAL reason latency rises, not a defect),
        // so this flags gross regressions, not routine growth.
        if (r.latencyMs > prev.latencyMs * 3 && r.latencyMs > 500) {
          latencyRegressed++;
          console.log(
            `  LATENCY UP 3x+ [${r.shape}] "${r.query}" -- was ${prev.latencyMs.toFixed(0)}ms, now ${r.latencyMs.toFixed(0)}ms`,
          );
        }
      }

      console.log('\nSUMMARY');
      console.log('='.repeat(78));
      console.log(`  top result changed:       ${topChanged}/${results.length}`);
      console.log(`  went from results to empty: ${wentEmpty}`);
      console.log(`  recovered from empty:       ${recoveredFromEmpty}`);
      console.log(`  latency regressed 3x+:      ${latencyRegressed}`);

      if (wentEmpty > 0 || latencyRegressed > 0) exitCode = 1;

      if (saveBaseline) {
        const newBaseline: Baseline = {
          capturedAt: new Date().toISOString(),
          corpusJudgments: size?.n ?? '0',
          corpusChunks: vectors?.n ?? '0',
          results,
        };
        writeFileSync(BASELINE_PATH, JSON.stringify(newBaseline, null, 2));
        console.log(`\nbaseline updated at ${BASELINE_PATH}.`);
      }
    }
  } finally {
    await sql.end();
  }
  process.exitCode = exitCode;
}

await main();
