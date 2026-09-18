/**
 * `pnpm --filter @lawmind/harness deployed-safety` — the release-blocking probe
 * for `docs/ai/tasks/001-p0-citation-query-safety.md`.
 *
 *   PROBE_BASE_URL   REQUIRED. There is no default: PRODUCTION = NONE and
 *                    PERSISTENT_BETA = NONE, so a probe that invents a target
 *                    grades a host nobody deployed. See `probe-target.ts`.
 *                    Point it at a local server (e.g. http://localhost:3999)
 *                    to prove the probe can pass, not just fail.
 *
 * No database connection: this calls the deployed HTTP service, which is
 * exactly the layer every other gate in this project has never observed.
 *
 * Exit codes: 0 = probe passed. 1 = probe failed. 78 = NO_DEPLOYED_TARGET,
 * i.e. the probe DID NOT RUN. 78 is `EX_CONFIG` from sysexits(3) and is
 * deliberately not 1 — a missing deployment is not a safety failure, and a
 * caller that cannot tell them apart will eventually report one as the other.
 */
import { runDeployedSafetyProbe } from './deployed-safety.ts';
import { resolveProbeBaseUrl } from './probe-target.ts';

/** `EX_CONFIG`. Reserved for NOT_RUN_NO_DEPLOYED_TARGET; never for an assertion. */
export const EXIT_NO_DEPLOYED_TARGET = 78;

async function main(): Promise<number> {
  const target = resolveProbeBaseUrl(process.env);
  if (!target.ok) {
    console.error(target.message);
    console.error('CITATION-SAFETY PROBE NOT RUN — NOT_RUN_NO_DEPLOYED_TARGET');
    return EXIT_NO_DEPLOYED_TARGET;
  }
  const baseUrl = target.baseUrl;

  console.log('CITATION-SAFETY PROBE — deployed service');
  console.log('='.repeat(78));
  console.log(`target  ${baseUrl}`);
  console.log('');

  const report = await runDeployedSafetyProbe(baseUrl);

  for (const c of report.cases) {
    console.log(`${c.passed ? 'PASS' : 'FAIL'}  ${c.id}`);
    console.log(`      query        ${c.query}`);
    console.log(`      http status  ${c.httpStatus ?? 'n/a'}`);
    console.log(`      parsed field ${c.parsedPresent ?? 'n/a'}`);
    console.log(`      results      ${c.resultCount ?? 'n/a'}`);
    console.log(`      ${c.reason}`);
    console.log('');
  }

  console.log('='.repeat(78));
  console.log(
    report.passed
      ? 'CITATION-SAFETY PROBE PASSED'
      : 'CITATION-SAFETY PROBE FAILED — a citation-shaped query fell through unsafely',
  );

  const jsonPath = process.env['PROBE_JSON'];
  if (jsonPath) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${jsonPath}`);
  }

  return report.passed ? 0 : 1;
}

/**
 * `process.exitCode`, not `process.exit()`. The latter force-closes handles
 * mid-flight — observed on Windows to crash the Node process (`libuv` assertion
 * in `src\win\async.c`) after a `fetch()` call, because undici's keep-alive
 * socket is still being torn down when the exit call yanks the event loop out
 * from under it. Setting `exitCode` lets Node drain naturally and still exits
 * non-zero.
 */
process.exitCode = await main();
