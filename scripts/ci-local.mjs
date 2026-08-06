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
];

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
      env: { ...process.env, DATABASE_URL: withSsl },
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
