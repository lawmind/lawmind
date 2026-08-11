/**
 * `pnpm --filter @lawmind/harness deployed-judgment-safety` — live probe for
 * `GET /judgments/:id`, alongside `deployed-safety-cli.ts` for `/search`.
 *
 *   PROBE_BASE_URL         optional — defaults to production.
 *   CORPUS_DATABASE_URL    required (falls back to DATABASE_URL) — used only
 *                          to pick a real target row; every assertion grades
 *                          the live HTTP response, not the database.
 */
import postgres from 'postgres';

import { runDeployedJudgmentSafetyProbe } from './deployed-judgment-safety.ts';

const DEFAULT_BASE_URL = 'https://api-production-1c0b4.up.railway.app';

async function main(): Promise<number> {
  const baseUrl = process.env['PROBE_BASE_URL'] ?? DEFAULT_BASE_URL;
  const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!dbUrl) {
    console.error(
      'CORPUS_DATABASE_URL is not set.\n\n' +
        'This probe picks a real target row (a citationless judgment, an overruled\n' +
        'one) before grading the live HTTP response — it needs a database it can\n' +
        'read, though never one it grades against. Falls back to DATABASE_URL.\n',
    );
    return 1;
  }

  const sql = postgres(dbUrl, { max: 2 });
  try {
    console.log('JUDGMENT-DETAIL SAFETY PROBE — deployed service');
    console.log('='.repeat(78));
    console.log(`target  ${baseUrl}`);
    console.log('');

    const report = await runDeployedJudgmentSafetyProbe(baseUrl, sql);

    for (const c of report.cases) {
      console.log(`${c.passed ? 'PASS' : 'FAIL'}  ${c.id}`);
      console.log(`      http status  ${c.httpStatus ?? 'n/a'}`);
      console.log(`      ${c.reason}`);
      console.log('');
    }

    console.log('='.repeat(78));
    console.log(
      report.passed
        ? 'JUDGMENT-DETAIL SAFETY PROBE PASSED'
        : 'JUDGMENT-DETAIL SAFETY PROBE FAILED',
    );

    const jsonPath = process.env['PROBE_JSON'];
    if (jsonPath) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`wrote ${jsonPath}`);
    }

    return report.passed ? 0 : 1;
  } finally {
    await sql.end();
  }
}

// `process.exitCode`, not `process.exit()` — see `deployed-safety-cli.ts` for why.
process.exitCode = await main();
