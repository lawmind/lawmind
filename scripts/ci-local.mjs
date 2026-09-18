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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCRATCH = 'lawmind_ci';
const keep = process.argv.includes('--keep');

/**
 * POST-CUTOVER DEFAULT, 17 Aug 2026. `ADMIN_DATABASE_URL` used to be mandatory
 * and the error text sent you to Railway to create a TCP proxy. After the local
 * cutover that guidance is actively dangerous — NEW2 (bus 0571) pointed out that
 * this script CREATEs and DROPs a database on whatever that variable names, so a
 * routine `ci:local` with a stale value is a live write to the system we just
 * left. Repointing `.env` does NOT repoint it, because it is supplied
 * per-invocation and `.env` cannot show it.
 *
 * So when it is unset we now derive the local cluster's `postgres` maintenance
 * database from `LOCAL_DATABASE_URL` rather than refusing. An explicit
 * `ADMIN_DATABASE_URL` still wins — this is a default, not an override.
 */
function localAdminUrl() {
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  const local = (/^LOCAL_DATABASE_URL=(.+)$/m.exec(env) ?? [])[1]?.trim();
  if (!local) return null;
  const u = new URL(local);
  u.pathname = '/postgres';
  return u.toString();
}

const adminUrl = process.env['ADMIN_DATABASE_URL'] ?? localAdminUrl();
if (!adminUrl) {
  console.error(
    'ADMIN_DATABASE_URL is not set and LOCAL_DATABASE_URL is missing from .env.\n' +
      'It must point at a Postgres server this may CREATE and DROP a database on —\n' +
      'never at the database under test. Normally it is derived automatically from\n' +
      "LOCAL_DATABASE_URL's cluster, maintenance database `postgres`.",
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
/**
 * `sslmode=require` was unconditional, which was right when the only server was
 * Railway and is wrong now: the local cluster does not serve SSL, so forcing it
 * fails the connection before a single step runs. Loopback is exempt; anything
 * else still gets it, because a remote database reached without TLS is a worse
 * failure than a broken gate.
 */
const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(new URL(scratchUrl).hostname);
const withSsl =
  isLoopback || scratchUrl.includes('?') ? scratchUrl : `${scratchUrl}?sslmode=require`;

/** Every step CI runs, in CI's order. A failure stops the run, as it should. */
const STEPS = [
  ['lint', 'pnpm', ['lint']],
  ['format', 'pnpm', ['format']],
  ['typecheck', 'pnpm', ['--filter', './services/*', '--filter', './packages/*', 'typecheck']],
  // BEFORE the two migrate steps, because those two cannot see the defect it
  // looks for. Drizzle's migrator reads `meta/_journal.json` and nothing else,
  // so an unjournalled `.sql` file is not a pending migration — it is a file the
  // migrator has never heard of. Both steps below therefore went green every day
  // for a week while NINE migrations (0030, 0033, 0047-0053) existed only on
  // LCC's disk, seven of them not even tracked by git. The scratch database was
  // built correctly from the journal it could see, agreed with itself, and said
  // so. Static, opens no socket, runs in milliseconds.
  ['migration journal', 'node', ['scripts/check-migration-journal.mjs']],
  // A config that does not parse is DISCARDED, not partially applied. NEW3
  // suggested this after I shipped a .vscode/settings.json with a missing comma,
  // which made 141 lines of watcher exclusions inert while looking like they
  // simply were not aggressive enough.
  ['json configs', 'node', ['scripts/check-json-configs.mjs']],
  // Same class as the two above, for the only load-bearing language in this repo
  // that nothing checked. `n2-daily-delta.ps1` runs UNATTENDED at 18:00 daily; a
  // PowerShell file that does not parse runs nothing at all — no manifest, no
  // ingest, no ledger — while its scheduled task still reports that it fired.
  // Added 5 Sep 2026 after one em dash inside a double-quoted string silently
  // broke that file: these files carry no BOM, PowerShell 5.1 decodes them as
  // ANSI, and the UTF-8 em dash becomes `â€"` whose third character CLOSES THE
  // STRING. Static, no socket, milliseconds.
  ['powershell syntax', 'node', ['scripts/check-powershell-syntax.mjs']],
  // Twice: the first proves migrations apply to an empty database, the second
  // proves a re-run is a no-op. Both are real failures we have shipped before.
  ['migrate (fresh)', 'pnpm', ['--filter', '@lawmind/db', 'migrate']],
  ['migrate (idempotent)', 'pnpm', ['--filter', '@lawmind/db', 'migrate']],
  ['test', 'pnpm', ['--filter', './services/*', '--filter', './packages/*', 'test']],
  ['design rules', 'node', ['scripts/check-design-rules.mjs', 'design/screens']],
  // The lane bus carries every cross-agent message and had NO test until it had
  // already shipped two message-destroying bugs. `tr -cd 'A-Za-z'` ate the digit
  // in NEW1/NEW2/NEW3, so three correctly-bound lanes were told they were
  // unbound and the founder relayed their mail by hand for weeks. Fixing that
  // exposed a cursor advancing past messages it had never shown — 22 pending,
  // 4 delivered, all 22 marked read.
  //
  // Neither is visible in a check that inspects ONE delivery and sees a
  // plausible payload; both appear the moment you drain a backlog and count.
  // Needs no database and runs in about a second, so there is no reason for it
  // to sit outside the gate the way the two guards below did for days.
  ['lane bus', 'bash', ['scripts/lane-bus.test.sh']],
  // The shared resource gate the four lanes consult before heavy work. Its
  // decisions are tested against synthetic snapshots, so it is fast and does not
  // depend on what this box happens to be doing — except for two cases that
  // read the real machine, one of which asserts a WALL-CLOCK bound. That bound
  // is the point: a full collection measured 3.1s / 15.2s / 31.9s on three
  // consecutive tries under fleet load, which is why the default path collects
  // no PowerShell at all. A gate expensive enough to be skipped is not a gate.
  ['resource gate', 'node', ['--test', 'scripts/resource-gate.test.mjs']],
  // The backup tooling, against the SOURCE rather than a database. Both
  // defects the Gate-B audit found were one identifier wrong and needed no
  // Postgres to catch: a restore proof checksumming `judgment_citations`
  // columns that do not exist and reporting UNAVAILABLE while still printing
  // a verdict, and an identity export filtered to a third of the corpus while
  // every protected table addressed the whole of it. A backup tool nobody runs
  // between disasters is exactly the thing that should be checked in CI.
  ['backup pack shape', 'node', ['--test', 'scripts/backup-pack-shape.test.mjs']],
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
  // Alerts: does the product PROMISE one it cannot deliver? This replaced
  // `check-alert-coverage.mjs` on 18 Sep 2026. That guard asked whether all four
  // PD-5 triggers can fire; two cannot, because `monitoring.user_product` and
  // `documents.upload_and_ocr` are DISABLED in the capability registry by
  // decision. It was therefore red on every single run since 11 Aug — including
  // the comment two entries above that wired it "knowing ci:local goes red" — and
  // the only ways to make it pass were to build monitoring and uploads (outside
  // current v1) or to delete a correct measurement. Neither. It is now
  // `scripts/check-pd5-alerts-readiness.mjs`, required before any capability
  // claims full PD-5/PD-6 behaviour and required by nothing today.
  //
  // What runs here instead is the question current v1 owns: the Alert Settings
  // screen said "Four things", named the evening briefing as the delivery channel
  // while `briefing.daily_loop` was DISABLED_NOT_READY, drew a mandatory always-ON
  // switch for a trigger whose audience needs an exported draft, and asked for
  // push permission on a channel with no project id. Four promises, none kept, and
  // no capability registry row existed for any of it.
  ['alert surface truth', 'node', ['scripts/check-alert-surface-truth.mjs']],
  // STOP coverage: every path that can start a database WRITER must cross the
  // pause sentinel. Added 16 Aug 2026 because the claim was made without the
  // enumeration — `enrich-worker.cmd` has its own loop, never went through
  // `supervise.mjs`, and was therefore opted out of a fleet-wide freeze that
  // nobody had decided to opt it out of (LCC, bus 0560). Three launchers sit in
  // the Startup folder, so a reboot mid-freeze would have started writers
  // against the database being migrated. A new launcher is exactly how this
  // comes back, so the enumeration is a test rather than a memory.
  ['stop coverage', 'node', ['scripts/check-stop-coverage.mjs']],
  // Railway static audit: after the exit, the ONLY thing pointing the fleet at a
  // database is `DATABASE_URL` in `.env`. That is a good position and a fragile
  // one — it holds exactly as long as nobody adds a second path, and the second
  // path is always added innocently (a hardcoded host in a one-off script, a
  // `?? RAILWAY_DATABASE_URL` fallback added to make something work at 3am).
  // Opens no socket, so it is safe to run in CI and during a freeze. It runs in
  // code-audit mode here on purpose: `DATABASE_URL` pointing at Railway is
  // CORRECT until cutover, and a step that is red for the whole window it
  // polices is a step everyone learns to skip. `--cutover` is the stricter gate,
  // run by hand once the local database is live.
  ['railway static audit', 'node', ['scripts/migration/new2-railway-static-audit.mjs']],
  // ───────────────────────────────────────────────────────────────────────────
  // WIRED 25 Aug 2026 — LCC, R7 §8 LCC-P0
  // ───────────────────────────────────────────────────────────────────────────
  //
  // The process-control plane's identity rules. It reported another lane's GPU
  // sidecar as STARTING on a pid Windows had recycled into a stranger 25ms
  // earlier, because a registry line with no recorded creation time
  // short-circuited the recycling check to TRUE — the ABSENCE of the check
  // scored as the check passing. The test builds that condition deliberately
  // against a known-alive non-LawMind process, since nobody can ask Windows to
  // recycle a pid to order. Opens no socket beyond a process sweep.
  ['job health identity', 'node', ['scripts/job-health.test.mjs']],
  // The screened-vs-clean vocabulary guard. NEW2 (bus 1177) pointed out it was
  // proven non-vacuous and wired NOWHERE, which is the same "a guard nobody runs
  // is not a guard" argument that put the two 11 Aug entries above in this list.
  // It is LCC's file and LCC's omission.
  ['screened not clean', 'node', ['scripts/check-screened-not-clean.mjs']],
  // Every SERVING caller of `hybridSearch` must collect the degradation signal
  // and publish a retrieval outcome. Written because `onDegrade` was added for
  // `/search` and the two surfaces where incompleteness matters most --
  // counter-arguments and the saved-search feed -- were still discarding it
  // weeks later. The same "a rule implemented at one call site is a rule the
  // second call site does not have" failure as the admission gate and OD-14.
  ['retrieval outcome coverage', 'node', ['scripts/check-retrieval-outcome-coverage.mjs']],
  // NEW2 bus 1636. `08baae98` rewrote docs/ai/new2-r10/parity-matrix.json and did
  // not republish the observation that binds it by sha, so from that commit the
  // repository could not reproduce its own parity evidence. The publisher already
  // refuses an incoherent PAIR; nothing refused an incoherent COMMIT, and
  // `1a550cf5` was the same defect one round earlier. Reads committed objects with
  // `--ref HEAD` rather than the working tree, because a coupled set committed one
  // file at a time is green here and red in a clone.
  ['freshness binding', 'node', ['scripts/check-freshness-binding.mjs', '--ref', 'HEAD']],
  // What an advocate types is a fact about their client -- provider-policy.ts
  // says so in its own header and the storage layer already honours it:
  // `searches` is deleted on erasure, `llm_calls` holds no prompt column, and
  // `search_events` keeps a length and a digest rather than the text.
  //
  // Every one of those was a convention held in the head of whoever wrote the
  // insert, and nothing enforced any of it. Proven non-vacuous four ways, each
  // committed against the live database and reverted: a content column on
  // `llm_calls`, an unreviewed text column on `search_events`, an undeclared
  // table carrying `query_text`, and prose written into an allowed column.
  ['query-log privacy', 'npx', ['tsx', '--test', 'services/api/src/security/query-log-privacy.test.ts']],
  // postgres.js truncates a timestamptz bind parameter to milliseconds (NEW2 bus
  // 1231). A `>` comparison then re-reads -- their walk re-walked 266,124,061
  // judgments before they killed it -- and a `<` comparison SKIPS. Measured
  // here: three audit entries inside one millisecond, page two returns 0 of the
  // 2 that should follow the cursor. Ten call sites fixed; this step fails the
  // moment an eleventh is written, which is how the first ten arrived.
  ['timestamp precision', 'npx', ['tsx', '--test', 'services/api/src/admin/timestamp-precision.test.ts']],
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

/**
 * ───────────────────────────────────────────────────────────────────────────
 * DEPLOYED SAFETY IS NOT A REPOSITORY CI STEP
 * ───────────────────────────────────────────────────────────────────────────
 *
 * It was one until 18 Sep 2026, and it was wrong to be. Every other step above
 * runs against the scratch database this script just created; these two call a
 * DEPLOYED service over HTTP. They used to default to
 * `api-production-1c0b4.up.railway.app` — which stopped being production, so an
 * unconfigured `ci:local` was grading a retired host and reporting the answer as
 * a fact about LawMind.
 *
 * LawMind currently has `PRODUCTION = NONE` and `PERSISTENT_BETA = NONE`
 * (docs/CURRENT_STATE.md §11). Between Gate C and the persistent beta there is
 * deliberately nothing deployed, and repository CI must not go red for that. So:
 *
 *     PROBE_BASE_URL set    -> run the probes; their verdict is the verdict
 *     PROBE_BASE_URL unset  -> DEPLOYED_SAFETY = NOT_RUN_NO_DEPLOYED_TARGET
 *
 * NOT_RUN is not green. The summary at the bottom prints REPOSITORY_CI and
 * DEPLOYED_SAFETY on separate lines precisely so nobody can read one as the
 * other, and neither probe's assertions are touched by any of this.
 *
 * The judgment-detail probe additionally needs `CORPUS_DATABASE_URL`: it picks
 * its target row (a citationless judgment, an overruled one) from a real corpus,
 * so against the empty scratch database "no target row" would itself pass and
 * mean nothing. `docs/ai/V2_RECONCILIATION.md`, 11 Aug 2026.
 */
const DEPLOYED_STEPS = [];
const probeBaseUrl = process.env['PROBE_BASE_URL']?.trim();
if (probeBaseUrl) {
  DEPLOYED_STEPS.push(['citation safety probe', 'pnpm', ['citation-safety-probe']]);
  if (process.env['CORPUS_DATABASE_URL']) {
    DEPLOYED_STEPS.push(['judgment safety probe', 'pnpm', ['judgment-safety-probe']]);
  } else {
    console.log(
      'judgment safety probe SKIPPED — CORPUS_DATABASE_URL is not set.\n' +
        '                     Run it directly: CORPUS_DATABASE_URL=... pnpm judgment-safety-probe\n',
    );
  }
} else {
  console.log(
    'deployed safety      NOT_RUN_NO_DEPLOYED_TARGET — PROBE_BASE_URL is not set.\n' +
      '                     PRODUCTION = NONE and PERSISTENT_BETA = NONE, so there is\n' +
      '                     nothing deployed to grade. This is not a pass.\n',
  );
}

// `ssl` follows the same loopback rule as `withSsl` above, and for the same
// reason: the local cluster serves no TLS, so a hardcoded 'require' fails the
// connection with ECONNRESET before any step runs. Remote still requires it.
const admin = postgres(adminUrl, {
  max: 1,
  ssl: isLoopback ? false : 'require',
  onnotice: () => {},
});
const results = [];
/** Deployed-probe outcomes are kept apart from repository CI on purpose: a
 *  missing deployment must never be able to turn REPOSITORY_CI red, and a
 *  passing repository must never be able to make DEPLOYED_SAFETY look green. */
const deployedResults = [];
let failed = false;
let deployedFailed = false;

/** Runs one step, prints its line, records it, and returns whether it passed. */
function run(name, cmd, args, into) {
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
  console.log(`${ok ? 'ok' : 'FAILED'}  ${((Date.now() - started) / 1000).toFixed(1)}s`);
  into.push({ name, ok });
  if (!ok) {
    // Print the tail only. The whole log is noise; the end is where the reason is.
    const log = `${out.stdout ?? ''}${out.stderr ?? ''}`.trimEnd().split('\n');
    console.log(
      log
        .slice(-40)
        .map((l) => `    ${l}`)
        .join('\n'),
    );
  }
  return ok;
}

try {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${SCRATCH}`);
  console.log(`scratch database ${SCRATCH} created\n`);

  for (const [name, cmd, args] of STEPS) {
    if (!run(name, cmd, args, results)) {
      failed = true;
      break;
    }
  }

  // Deployed probes run only when a target is configured, and NEVER against the
  // scratch database above. They carry their own verdict.
  for (const [name, cmd, args] of DEPLOYED_STEPS) {
    if (!run(name, cmd, args, deployedResults)) {
      deployedFailed = true;
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
for (const r of deployedResults) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`);

/**
 * Two verdicts, two lines, never one. `NOT_RUN_NO_DEPLOYED_TARGET` is the third
 * state and it is neither of the other two: LawMind deliberately has no
 * deployment between Gate C and the persistent beta, so repository CI passing
 * while nothing is deployed is the CORRECT reading — and calling a skipped probe
 * green would be the lie this whole file exists to prevent.
 */
const deployedVerdict = !probeBaseUrl
  ? 'NOT_RUN_NO_DEPLOYED_TARGET'
  : deployedFailed
    ? 'FAIL'
    : 'PASS';
console.log(`\nREPOSITORY_CI   = ${failed ? 'FAIL' : 'PASS'}`);
console.log(`DEPLOYED_SAFETY = ${deployedVerdict}`);

if (failed || deployedFailed) {
  process.exitCode = 1;
} else {
  console.log(
    '\nCorpus-dependent tests SKIP against a fresh database, here and in CI alike —\n' +
      'run them against a populated one before claiming retrieval is verified.',
  );
}
