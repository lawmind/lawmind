/**
 * `pnpm gate:structured` — measure the two DETERMINISTIC release gates, alone.
 *
 * `structuredExactness` and `fieldPrecision` are the only two Gate S2 metrics
 * with a threshold of 1 that a retriever can actually reach, and both have sat
 * NOT MEASURED (`NEW1_POST_0055_BASELINE.md` §5). They were reachable only
 * through `run-cli.ts`, which also embeds 283 queries, calls a model, and takes
 * half an hour on a contended box — so the cheap deterministic gate was gated
 * behind the expensive probabilistic one, and consequently never run.
 *
 * This runs just them. No embedder, no model, no evaluation set: two bounded
 * SQL samples and the real `runStructured` compiler the product uses.
 *
 * Both are `null` over an empty sample, never 0. `grade()` fails a null, because
 * not having measured is not having passed — and a gate whose runner silently
 * returned "0 of 0 failed" would be the exact shape of a broken measurement
 * scoring perfectly.
 */
import { writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { measureStructuredGate } from './structured-gate.ts';
import { THRESHOLDS } from './metrics.ts';
import { sslFor } from './db-url.ts';

const OUT = process.env['STRUCTURED_GATE_JSON'] ?? null;
const SAMPLE = Number(process.env['GATE_SAMPLE'] ?? 60);
/** Printed with the result: every figure below is contended unless this says otherwise. */
const NOTE = process.env['GATE_NOTE'] ?? 'ingest fleet state not recorded';

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'] ?? '';
  if (!url) {
    console.error('DATABASE_URL is not set — run with --env-file=.env');
    return 2;
  }
  /**
   * `max: 1` — deliberate, not a leftover default. `measureStructuredGate`
   * issues `SET statement_timeout` mid-run (see its header) to give the setup
   * queries and the pathological `cite:` loop DIFFERENT bounds on the same
   * session; that only holds if every query in this run shares one physical
   * connection. With `max` above 1, postgres.js is free to route the next
   * query to an idle connection that never saw the `SET`, and the guard
   * silently stops applying. Fine for a single-threaded diagnostic tool.
   *
   * No connection-level `statement_timeout` here either, for the same reason:
   * two failed attempts (8s, then 20s) both killed the SETUP sampling query
   * under current fleet-write contention before reaching the `cite:` loop the
   * bound exists for. The tight bound belongs where the actual 31-minute hang
   * lives, not on every query uniformly.
   */
  const sql = postgres(url, { ssl: sslFor(url), max: 1 });

  console.log(`structured gate — sample ${SAMPLE} per side\n`);
  const started = Date.now();
  const r = await measureStructuredGate(sql, SAMPLE);
  const elapsed = Date.now() - started;
  await sql.end();

  const line = (name: string, value: number | null, tested: number): string => {
    const pass = value !== null && value >= 1;
    const shown = value === null ? 'NOT MEASURED' : `${(value * 100).toFixed(2)}%`;
    return `${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} ${shown.padStart(13)}  threshold 100%  (${tested} tested)`;
  };

  console.log(line('structuredExactness', r.structuredExactness, r.citationsTested));
  console.log(line('fieldPrecision', r.fieldPrecision, r.fieldQueriesTested));
  console.log(`\n${r.failures.length} failure(s), ${elapsed}ms\n`);

  // Every failure, not a sample of them: a number below 1.0 has to be
  // actionable, and the first twenty are what make it so.
  for (const f of r.failures.slice(0, 40)) console.log(`  ${f}`);
  if (r.failures.length > 40)
    console.log(`  ... and ${r.failures.length - 40} more (all in the artifact)`);

  if (OUT) {
    writeFileSync(
      OUT,
      `${JSON.stringify(
        {
          kind: 'new1_structured_gate',
          createdAt: new Date().toISOString(),
          sampleSize: SAMPLE,
          elapsedMs: elapsed,
          thresholds: {
            structuredExactness: THRESHOLDS.structuredExactness,
            fieldPrecision: THRESHOLDS.fieldPrecision,
          },
          structuredExactness: r.structuredExactness,
          fieldPrecision: r.fieldPrecision,
          citationsTested: r.citationsTested,
          fieldQueriesTested: r.fieldQueriesTested,
          failures: r.failures,
          contention: NOTE,
          limit:
            'the citation fixture is drawn FROM the corpus, so it can only test names the corpus holds. A 1.0 does not mean every citation an advocate types will resolve — that is a coverage question.',
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nwrote ${OUT}`);
  }

  const passed =
    r.structuredExactness !== null &&
    r.structuredExactness >= 1 &&
    r.fieldPrecision !== null &&
    r.fieldPrecision >= 1;
  return passed ? 0 : 1;
}

process.exit(await main());
