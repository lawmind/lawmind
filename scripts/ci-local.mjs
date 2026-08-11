#!/usr/bin/env node
/**
 * Run the CI pipeline locally, against a throwaway database.
 *
 *   pnpm ci:local              # needs ADMIN_DATABASE_URL
 *   pnpm ci:local --keep       # leave the scratch database behind to inspect
 *
 * **Why this exists.** On 6 Aug 2026 GitHub stopped handing out hosted runners
 * for this repo — every workflow run cancelled after 15 minutes with
 * `The job was not acquired by Runner of type hosted`, and `runner_name` empty.
 * Whatever the cause, a lane that can only verify itself through somebody else's
 * queue is a lane that stops working when that queue does.
 *
 * So this runs the same steps `.github/workflows/ci.yml` runs, in the same order,
 * and it is the authority when CI is unavailable. It is not a substitute for CI —
 * it is the thing that lets work continue while CI is down, and it doubles as the
 * fast pre-push check when CI is up.
 *
 * **The database.** CI gets a fresh pgvector container. There is no Docker on the
 * Windows workstation, so instead this creates a scratch DATABASE on whatever
 * server `ADMIN_DATABASE_URL` points at and drops it afterwards. Migrations and
 * tests only ever see the scratch database; it refuses to run if the name it is
 * about to drop is not the scratch name.
 *
 * Tests needing a populated corpus SKIP here, exactly as they do in CI. To
 * exercise those, point `CORPUS_DATABASE_URL` at a database that has one — the
 * plan tests are read-only (`EXPLAIN`, `SELECT`, `SET LOCAL`).
 */
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';

const SCRATCH = 'lawmind_ci';
const keep = process.argv.includes('--keep');

const adminUrl = process.env['ADMIN_DATABASE_URL'];
if (!adminUrl) {
  console.error(
    'ADMIN_DATABASE_URL is not set.\n' +
      'It must point at a Postgres server this may CREATE and DROP a database on —\n' +
      'never at the database under test. On Railway:\n' +
      '  railway tcp-proxy create --service Postgres --port 5432\n' +
      '  railway variables --service Postgres --kv   # DATABASE_PUBLIC_URL\n' +
      'and delete the proxy again when finished.',
  );
  process.exit(2);
}
if (new URL(adminUrl).pathname === `/${SCRATCH}`) {
  console.error(
    `ADMIN_DATABASE_URL points at ${SCRATCH} itself — it cannot drop the database it is connected to.`,
  );
  process.exit(2);
}

const scratchUrl = adminUrl.replace(/\/[^/?]+(\?|$)/, `/${SCRATCH}$1`);
const withSsl = scratchUrl.includes('?') ? scratchUrl : `${scratchUrl}?sslmode=require`;

/** Every step CI runs, in CI's order. A failure stops the run, as it should. */
const STEPS = [
  ['lint', 'pnpm', ['lint']],
  ['format', 'pnpm', ['format']],
  ['typecheck', 'pnpm', ['--filter', './services/*', '--filter', './packages/*', 'typecheck']],
  // Twice: the first proves migrations apply to an empty database, the second
  // proves a re-run is a no-op. Both are real failures we have shipped before.
  ['migrate (fresh)', 'pnpm', ['--filter', '@lawmind/db', 'migrate']],
  ['migrate (idempotent)', 'pnpm', ['--filter', '@lawmind/db', 'migrate']],
  ['test', 'pnpm', ['--filter', './services/*', '--filter', './packages/*', 'test']],
  ['design rules', 'node', ['scripts/check-design-rules.mjs', 'design/screens']],
  // The contract's BUILT/SPECCED column against the routes actually mounted.
  // A stale column is how RCC came to call an endpoint that does not exist.
  ['contract status', 'node', ['scripts/check-contract-status.mjs']],
  // The screen inventory against the renders directory. It drifted twice in one
  // week in opposite directions — a table claiming nothing was drawn when seven
  // screens were, and rows naming renders that were never produced. Both cost
  // real work; neither needed a human to catch.
  ['design renders', 'node', ['scripts/check-design-renders.mjs']],
  // SCHEMA_TRUTH.md calls itself the only authority on data shapes, and three
  // tables it described had never been created — each found separately, each
  // only when a test hit real Postgres. TypeScript cannot catch it: a SQL
  // string is a string. Mechanical, therefore a gate.
  ['schema truth', 'node', ['scripts/check-schema-truth.mjs']],
  // ───────────────────────────────────────────────────────────────────────────
  // WIRED 11 Aug 2026, and both were RED the moment they were
  // ───────────────────────────────────────────────────────────────────────────
  //
  // These two guards existed for days and ran nowhere — not here, not in
  // `.github/workflows/ci.yml`, not in any test suite. Running them for the
  // first time found two real defects, which is the whole argument for wiring
  // them: a guard nobody runs is a guard that is not a guard.
  //
  // **They are added knowing `ci:local` goes red.** That is the honest state and
  // the alternative is worse — a green gate that has stopped looking at two of
  // the things it was written to look at. `CURRENT_PLAN.md` §Q1.10 and §Q1.11
  // carry both fixes; neither is loosened to go green.
  //
  // Amber: the reserved colour. It means THE LAW HAS MOVED and nothing else, and
  // its power comes entirely from being the only place it appears.
  ['amber reservation', 'node', ['scripts/check-amber-reservation.mjs']],
  // Alerts: `alert_kind` has two values and PD-5/PD-6 promise four. The app
  // persists switches for notifications the system cannot produce, and the
  // advocate finds out by missing a hearing.
  ['alert coverage', 'node', ['scripts/check-alert-coverage.mjs']],
  // ───────────────────────────────────────────────────────────────────────────
  // WIRED 11 Aug 2026 — `docs/ai/tasks/001-p0-citation-query-safety.md`
  // ───────────────────────────────────────────────────────────────────────────
  //
  // Every step above runs against the scratch database THIS SCRIPT JUST CREATED
  // — none of them, and no gate this project has ever run, calls the actually
  // DEPLOYED service. That gap is what let a citation-shaped query fall through
  // to semantic search in production for three days after the fix was already
  // on `origin/main`. This step calls `https://api-production-1c0b4.up.railway.app`
  // over plain HTTP — no database, no scratch schema, nothing this script
  // provisions — and fails if a citation that cannot exist returns a result, if
  // a real citation resolves to a different case, or if a `cite:` query answers
  // with no `parsed` field at all.
  //
  // **It is added knowing `ci:local` goes red**, exactly as the two guards
  // above were. The production defect is real and current; a gate that reports
  // green while it is live would be lying about the one thing this project
  // cannot lie about. It goes green the moment the Railway deploy carries the
  // fix already on `origin/main` — see `docs/ai/tasks/001-p0-citation-query-safety.md`
  // §BLOCKED. Point it at a different build with `PROBE_BASE_URL=...`.
  ['citation safety probe (deployed)', 'pnpm', ['citation-safety-probe']],
];

/**
 * Gate S2 — appended only when a populated corpus is reachable.
 *
 * **Not a normal step, and it must not become one.** Every other step above
 * runs against the scratch database this script creates, which holds a schema
 * and no judgments. The harness would refuse there, and rightly: it grades
 * retrieval, and there is nothing to retrieve. Wiring it in unconditionally
 * would produce a red pipeline that means nothing, which is how a gate gets
 * ignored.
 *
 * It also takes minutes rather than seconds, and it is run on demand far more
 * often than CI runs. `pnpm harness` is the primary way in; this is the belt.
 *
 * `CORPUS_DATABASE_URL` is passed through EXPLICITLY rather than inherited,
 * because the loop below overrides `DATABASE_URL` with the scratch database and
 * the harness falls back to `DATABASE_URL` when the corpus variable is absent.
 * Without this line the harness would silently grade the empty scratch database
 * — refusing, but for a reason nobody would understand.
 */
if (process.env['CORPUS_DATABASE_URL']) {
  STEPS.push(['gate s2 harness', 'pnpm', ['harness']]);
} else {
  console.log(
    'gate s2 harness      SKIPPED — CORPUS_DATABASE_URL is not set.\n' +
      '                     The gate grades retrieval and needs the real corpus.\n' +
      '                     Run it directly: CORPUS_DATABASE_URL=... pnpm harness\n',
  );
}

const admin = postgres(adminUrl, { max: 1, ssl: 'require', onnotice: () => {} });
const results = [];
let failed = false;

try {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${SCRATCH}`);
  console.log(`scratch database ${SCRATCH} created\n`);

  for (const [name, cmd, args] of STEPS) {
    process.stdout.write(`${name.padEnd(22)} `);
    const started = Date.now();
    // One command string with shell:true, not (cmd, args[]). Passing an args
    // array alongside shell:true is deprecated (DEP0190) because the arguments
    // are concatenated rather than escaped — the shell is needed at all only
    // because `pnpm` is a .cmd shim on Windows. Args here are literals from
    // STEPS, never user input.
    const out = spawnSync([cmd, ...args.map((a) => `"${a}"`)].join(' '), {
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        DATABASE_URL: withSsl,
        // See the harness step above: without this the corpus variable would be
        // shadowed by the scratch database for the one step that needs it.
        ...(process.env['CORPUS_DATABASE_URL']
          ? { CORPUS_DATABASE_URL: process.env['CORPUS_DATABASE_URL'] }
          : {}),
      },
      encoding: 'utf8',
    });
    const ok = out.status === 0;
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`${ok ? 'ok' : 'FAILED'}  ${secs}s`);
    results.push({ name, ok });
    if (!ok) {
      failed = true;
      // Print the tail only. The whole log is noise; the end is where the reason is.
      const log = `${out.stdout ?? ''}${out.stderr ?? ''}`.trimEnd().split('\n');
      console.log(
        log
          .slice(-40)
          .map((l) => `    ${l}`)
          .join('\n'),
      );
      break;
    }
  }
} finally {
  if (keep) {
    console.log(`\nkeeping ${SCRATCH} (--keep)`);
  } else {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
    console.log(`\nscratch database ${SCRATCH} dropped`);
  }
  await admin.end();
}

console.log(results.map((r) => `  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`).join('\n'));
if (failed) {
  process.exitCode = 1;
} else {
  console.log(
    '\nall CI steps pass locally.\n' +
      'Corpus-dependent tests SKIP against a fresh database, here and in CI alike —\n' +
      'run them against a populated one before claiming retrieval is verified.',
  );
}
