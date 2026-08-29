/**
 * Re-verify the eCourts network-safety properties by RUNNING the checks, not by
 * reading the code that implements them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A RUNNER AND NOT A DOCUMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every property below has a test. A document that lists them is a claim about
 * tests; this executes the suites and records what happened, so "the quota is
 * atomic" is an observation with a timestamp rather than a sentence somebody
 * wrote once and nobody re-checked.
 *
 * It names each property against the test that covers it. A property whose test
 * cannot be found in the run output is reported as `NOT_COVERED` rather than
 * assumed — a checklist that silently passes when its check disappears is worse
 * than no checklist, because it is trusted.
 *
 *   node --import tsx scripts/lcc-ecourts-network-safety.mts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function envValue(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  let dir = process.cwd();
  for (let up = 0; up < 6; up += 1) {
    try {
      const line = readFileSync(join(dir, '.env'), 'utf8')
        .split(/\r?\n/)
        .find((l) => l.startsWith(`${name}=`));
      if (line) return line.slice(name.length + 1).trim();
    } catch {
      // keep walking
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return i === -1 ? 'docs/ai/lcc-r11/ecourts-network-safety.json' : process.argv[i + 1]!;
})();

/**
 * One line per property the founder's brief asks to be independently verified,
 * each bound to the test whose NAME must appear as passing in the run.
 */
const PROPERTIES: readonly { property: string; suite: string; test: string }[] = [
  {
    property: 'ONE_LOGICAL_NETWORK_OWNER',
    suite: 'src/court/guard.test.ts',
    test: 'names an eCourts host in no module but the adapter and Tier 3',
  },
  /**
   * The grant requires attribution on EVERY request. It says nothing about
   * which header, so R12 moved it off `User-Agent` — the most-logged header on
   * the internet — onto a dedicated one.
   *
   * Bound here because the move is exactly the kind of change that can quietly
   * become a removal, and because it already did on one of the module's two
   * fetch sites: `guardedRequest` calls itself "The ONE network path", and the
   * word doing the work is "below". `fetchCauseList` predates it and calls
   * `fetch` directly, so the first version of this change left that site
   * sending a `User-Agent` and no attribution at all. Nothing errored.
   */
  {
    property: 'ATTRIBUTION_ON_EVERY_PERMITTED_REQUEST',
    suite: 'src/court/attribution-transport.test.ts',
    test: 'EVERY request the session makes carries the attribution header',
  },
  {
    property: 'ATTRIBUTION_IS_NOT_THE_USER_AGENT',
    suite: 'src/court/attribution-transport.test.ts',
    test: 'the attribution header is a dedicated header, not User-Agent',
  },
  {
    property: 'GLOBAL_ATOMIC_QUOTA_RESERVATION',
    suite: 'src/court/quota-reservation.test.ts',
    test: 'two concurrent callers cannot both take the same remaining slot',
  },
  {
    property: 'ONE_BUDGET_NOT_ONE_PER_COURT',
    suite: 'src/court/quota-reservation.test.ts',
    test: 'serialises on ONE lock for the whole grant, not one per court',
  },
  {
    property: 'AGGREGATE_MINIMUM_SPACING',
    suite: 'src/court/quota-reservation.test.ts',
    test: 'refusals do not consume the quota they just protected',
  },
  {
    property: 'RESERVATION_DURABLE_BEFORE_TRANSMISSION',
    suite: 'src/court/quota-reservation.test.ts',
    test: 'a reservation is durable before the network, so a crash cannot double-spend it',
  },
  {
    property: 'LOCK_CANNOT_LEAK_PAST_TRANSACTION',
    suite: 'src/court/quota-reservation.test.ts',
    test: 'releases the quota lock at transaction exit, so nothing can leak it',
  },
  {
    property: 'REFUSAL_CANNOT_BE_SETTLED_INTO_SUCCESS',
    suite: 'src/court/quota-reservation.test.ts',
    test: 'a refusal can never be settled into a success',
  },
  {
    property: 'TEST_ROWS_EXCLUDED_FROM_REAL_QUOTA',
    suite: 'src/court/raw-capture.test.ts',
    test: 'never counts an explicitly non-network test ledger row against the grant',
  },
  {
    property: 'UNRECORDED_FETCH_IS_NOT_MADE',
    suite: 'src/court/ledger-rollback.test.ts',
    test: 'an unrecorded fetch never produces usable data',
  },
  {
    property: 'RAW_RETAINED_BEFORE_PARSE_IS_REQUIRED',
    suite: 'src/court/raw-capture.test.ts',
    test: 'keeps the bytes when the parser cannot read them, and writes no observation',
  },
  {
    property: 'PARSER_FAILURE_CANNOT_ERASE_SOURCE',
    suite: 'src/court/raw-capture.test.ts',
    test: 'retains a non-2xx response too, marked fetch_failed rather than observed',
  },
  {
    property: 'REPLAY_CANNOT_DUPLICATE_OBSERVATIONS',
    suite: 'src/court/raw-capture.test.ts',
    test: 'writes one page once, however many times it is replayed',
  },
  {
    property: 'TESTS_CANNOT_REACH_PRODUCTION_KILL_SWITCH',
    suite: 'src/testing/isolated-schema.test.ts',
    test: 'ecourts_harvest: enabling it in a test does not enable it in production',
  },
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * OUR REQUEST IS THE LICENSED CLIENT'S REQUEST
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The grant permits the licensed interface's scope. A request that is not the
   * one the licensed interface makes is, at best, a request nobody authorised
   * anybody to evaluate — and at worst it is what an operator reading their logs
   * sees as an unfamiliar client poking at endpoints.
   *
   * Bound here because the five known defects (two header constants, `est_code`,
   * `selprevdays`, the reply key) were all invisible to our own tests and all
   * came from TRANSCRIBING the client rather than running it. The assertion now
   * executes the retained client offline, so deleting it reports `NOT_COVERED`
   * instead of passing quietly — which is exactly how the wrong `delimeter` pair
   * survived two rounds.
   */
  {
    property: 'REQUEST_SHAPE_MATCHES_LICENSED_CLIENT',
    suite: 'src/court/official-client-recorder.test.ts',
    test: 'submitCauseList — flag off, so est_code is EMPTY, not the complex segment',
  },
  {
    property: 'AJAX_HEADERS_READ_FROM_RETAINED_BYTES',
    suite: 'src/court/official-client-recorder.test.ts',
    test: 'the two ajaxCall headers match the client, name and value',
  },
];

const suites = [...new Set(PROPERTIES.map((p) => p.suite))];

const env = { ...process.env };
for (const name of ['DATABASE_URL', 'ECOURTS_GRANT_ATTRIBUTION']) {
  const value = envValue(name);
  if (value) env[name] = value;
}

const started = Date.now();
const run = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-concurrency=1', ...suites],
  { cwd: 'services/api', env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;

/** `✔ <name> (…ms)` in the default reporter. Matched on the name, not a count. */
function passed(name: string): boolean {
  return output.includes(`✔ ${name} (`);
}
function failed(name: string): boolean {
  return output.includes(`✖ ${name} (`);
}

const results = PROPERTIES.map((p) => ({
  ...p,
  verdict: passed(p.test) ? 'PASS' : failed(p.test) ? 'FAIL' : 'NOT_COVERED',
}));

const summary = {
  tests: Number(/^ℹ tests (\d+)$/m.exec(output)?.[1] ?? -1),
  pass: Number(/^ℹ pass (\d+)$/m.exec(output)?.[1] ?? -1),
  fail: Number(/^ℹ fail (\d+)$/m.exec(output)?.[1] ?? -1),
};

const report = {
  artifact: 'LCC_ECOURTS_NETWORK_SAFETY',
  version: 'ECOURTS_NETSAFE_V1',
  takenAt: new Date().toISOString(),
  ranSuites: suites,
  durationMs: Date.now() - started,
  exitCode: run.status,
  summary,
  properties: results,
  verdict:
    summary.fail === 0 && results.every((r) => r.verdict === 'PASS') ? 'PASS' : 'HOLD',
  note:
    'Each property is bound to the NAME of the test that covers it, so a test that is renamed ' +
    'or deleted reports NOT_COVERED instead of quietly passing. Nothing here contacts eCourts: ' +
    'every suite drives the adapter with an injected fetch, and the two that need committed ' +
    'rows run against an isolated schema.',
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
for (const r of results) console.log(`${r.verdict.padEnd(12)} ${r.property}`);
console.log(`\nsummary  tests=${summary.tests} pass=${summary.pass} fail=${summary.fail}`);
console.log(`verdict  ${report.verdict}`);
console.log(`wrote    ${OUT}`);
if (report.verdict !== 'PASS') process.exitCode = 1;
