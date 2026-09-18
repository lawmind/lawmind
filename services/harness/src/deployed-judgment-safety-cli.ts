/**
 * `pnpm --filter @lawmind/harness deployed-judgment-safety` — live probe for
 * `GET /judgments/:id`, alongside `deployed-safety-cli.ts` for `/search`.
 *
 *   PROBE_BASE_URL         REQUIRED. There is no default: PRODUCTION = NONE and
 *                          PERSISTENT_BETA = NONE, so a probe that invents a
 *                          target grades a host nobody deployed. See
 *                          `probe-target.ts`.
 *   CORPUS_DATABASE_URL    required (falls back to DATABASE_URL) — used only
 *                          to pick a real target row; every assertion grades
 *                          the live HTTP response, not the database.
 *
 * Exit codes: 0 = passed. 1 = failed. 78 = NO_DEPLOYED_TARGET (DID NOT RUN) —
 * see `deployed-safety-cli.ts` for why that is not 1.
 */
import postgres from 'postgres';

import { runDeployedJudgmentSafetyProbe } from './deployed-judgment-safety.ts';
import { resolveProbeBaseUrl } from './probe-target.ts';

/** `EX_CONFIG`. Reserved for NOT_RUN_NO_DEPLOYED_TARGET; never for an assertion. */
export const EXIT_NO_DEPLOYED_TARGET = 78;

async function main(): Promise<number> {
  const target = resolveProbeBaseUrl(process.env);
  if (!target.ok) {
    console.error(target.message);
    console.error('JUDGMENT-DETAIL SAFETY PROBE NOT RUN — NOT_RUN_NO_DEPLOYED_TARGET');
    return EXIT_NO_DEPLOYED_TARGET;
  }
  const baseUrl = target.baseUrl;
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
      report.passed ? 'JUDGMENT-DETAIL SAFETY PROBE PASSED' : 'JUDGMENT-DETAIL SAFETY PROBE FAILED',
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
