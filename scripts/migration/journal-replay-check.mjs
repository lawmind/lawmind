#!/usr/bin/env node
/**
 * REGRESSION CHECK — does the repo's migration list still rebuild local Gold?
 *
 * LCC, 17 Aug 2026. The second half of the journal-drift fix; the first half is
 * `scripts/check-migration-journal.mjs`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A STATIC GUARD IS NOT ENOUGH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `check-migration-journal.mjs` proves the journal, the files and git agree with
 * EACH OTHER. It cannot prove they agree with the database, and that is the
 * claim that actually matters: **a fresh clone, given a fresh database, must
 * arrive at the schema everything runs against.**
 *
 * Those are different claims and the gap between them is where hand-applied DDL
 * lives. Nine migrations were applied to this cluster by hand over a week; each
 * one was correct, and not one of them left a trace the repo could see. A guard
 * that only reads files would have gone green the whole time — it did, because
 * `ci:local`'s two `migrate` steps are exactly that guard, and they were green.
 *
 * So this one replays the repo onto an empty database and DIFFS THE RESULT
 * against Gold, using the same manifest/compare pair the Railway cutover was
 * decided with. One tool, two invocations, one diff.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A FAILURE MEANS, IN EITHER DIRECTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   missing in GOLD    the repo describes something the live database does not
 *                      have — a migration written but never applied. Expected
 *                      and correct in the window between committing a migration
 *                      and running it, which is why `--expect-unapplied` names
 *                      those instead of relaxing the check.
 *   missing in REPLAY  the live database has something no migration produces.
 *                      This is the dangerous one: it means a restore from the
 *                      repo silently loses it, and nothing else in the tree
 *                      looks. There is no flag for this — it is a defect.
 *
 * Both directions are run, and both are reported. Reporting only one is how a
 * two-sided drift becomes a one-sided reassurance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SAFETY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It CREATEs and DROPs a database, so it is fenced three ways: the target URL
 * must be loopback, the scratch name is a hardcoded constant, and that name is
 * validated at module load against a protected-name list BEFORE any connection
 * is opened. NEW2 (bus 0571) found `ci:local` dropping whatever
 * `ADMIN_DATABASE_URL` happened to name; that is the failure mode these fences
 * exist for. Gold is opened READ-ONLY — the only writes this script makes
 * anywhere are to the scratch database it just created.
 *
 * It is schema-only, so it is safe to run during a write freeze and adds no
 * meaningful load: the replay builds empty tables.
 *
 *   node scripts/migration/journal-replay-check.mjs
 *   node scripts/migration/journal-replay-check.mjs --expect-unapplied 0052_hot_path_exact_lookup_indexes
 *   node scripts/migration/journal-replay-check.mjs --keep      # leave the scratch db for inspection
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Hardcoded, and deliberately not configurable. The DROP below compares against
 * this exact string, so there is no input that can point it at anything else.
 */
const SCRATCH_DB = 'lawmind_journal_replay';

/**
 * The fence, asserted ONCE at module load rather than re-tested beside each
 * `DROP`. Those inline re-tests compared the constant against itself, which
 * proves nothing, and the one in the cleanup path sat inside a `finally` where a
 * `throw` would have replaced whatever exception was already propagating.
 *
 * This is the check that actually has content: the name must look like a scratch
 * database and must not be one of the real ones. It runs before a connection is
 * opened, so an edit that repointed this script at Gold fails immediately and
 * loudly instead of at `DROP DATABASE`.
 */
const PROTECTED = new Set(['lawmind', 'postgres', 'railway', 'template0', 'template1']);
if (!/^lawmind_[a-z0-9_]+$/.test(SCRATCH_DB) || PROTECTED.has(SCRATCH_DB)) {
  throw new Error(`refusing to CREATE/DROP a database named ${SCRATCH_DB}`);
}

const argv = process.argv.slice(2);
const keep = argv.includes('--keep');
const expectUnapplied = new Set(
  argv.includes('--expect-unapplied')
    ? (argv[argv.indexOf('--expect-unapplied') + 1] ?? '').split(',').filter(Boolean)
    : [],
);

function goldUrl() {
  const env = fs.readFileSync(join(ROOT, '.env'), 'utf8');
  const url = (/^LOCAL_DATABASE_URL=(.+)$/m.exec(env) ?? [])[1]?.trim();
  if (!url) throw new Error('LOCAL_DATABASE_URL is not set in .env');
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(
      `refusing a non-loopback target: ${host}. This script creates and drops databases.`,
    );
  }
  return url;
}

/** The same URL with the database name swapped. Credentials are never printed. */
function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/**
 * One command string with `shell: true`, matching `ci-local.mjs` and for the
 * same reason: `pnpm` is a `.cmd` shim on Windows and `execFileSync` will not
 * resolve it. Every argument here is a literal or a path this script built, and
 * the database URL travels in the ENVIRONMENT rather than the command line —
 * credentials must not reach a process listing.
 */
const run = (cmd, args, env) =>
  execFileSync([cmd, ...args.map((a) => `"${a}"`)].join(' '), {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });

async function main() {
  const gold = goldUrl();
  const scratch = withDatabase(gold, SCRATCH_DB);
  const maintenance = withDatabase(gold, 'postgres');
  const tmp = join(ROOT, 'scripts', 'migration', '.journal-replay');
  fs.mkdirSync(tmp, { recursive: true });

  // ── 1. a genuinely empty database ────────────────────────────────────────
  const admin = postgres(maintenance, { max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${SCRATCH_DB}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${SCRATCH_DB}"`);
    console.log(`replay: created ${SCRATCH_DB}`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  let failed = false;
  try {
    // ── 2. the repo, and only the repo ─────────────────────────────────────
    const started = Date.now();
    run('pnpm', ['--filter', '@lawmind/db', 'migrate'], { DATABASE_URL: scratch });
    console.log(`replay: migrations applied in ${((Date.now() - started) / 1000).toFixed(1)}s`);

    // Re-run: the repo must also be idempotent against its own output.
    run('pnpm', ['--filter', '@lawmind/db', 'migrate'], { DATABASE_URL: scratch });
    console.log('replay: re-run is a no-op');

    // ── 3. manifest both sides the same way ────────────────────────────────
    const replayManifest = join(tmp, 'replay.json');
    const goldManifest = join(tmp, 'gold.json');
    run('node', [
      'scripts/migration/manifest.mjs',
      '--url',
      scratch,
      '--out',
      replayManifest,
      '--label',
      'replay',
    ]);
    run('node', [
      'scripts/migration/manifest.mjs',
      '--url',
      gold,
      '--out',
      goldManifest,
      '--label',
      'gold',
    ]);

    // ── 4. both directions ─────────────────────────────────────────────────
    // compare's FAIL is always "missing in TARGET", so the direction is chosen
    // by which side is `--b`. Running one direction and calling it a diff is
    // how a two-sided drift reads as clean.
    const direction = (label, a, b) => {
      try {
        const out = run('node', [
          'scripts/migration/compare.mjs',
          '--a',
          a,
          '--b',
          b,
          '--schema-only',
        ]);
        console.log(`\n── ${label} ──\n${out.trim()}`);
        return { ok: true, out };
      } catch (error) {
        const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        console.log(`\n── ${label} ──\n${out.trim()}`);
        return { ok: false, out };
      }
    };

    const missingInGold = direction(
      'what the repo produces that GOLD lacks',
      replayManifest,
      goldManifest,
    );
    const missingInReplay = direction(
      'what GOLD has that the repo does NOT produce',
      goldManifest,
      replayManifest,
    );

    if (!missingInGold.ok) {
      // Named-unapplied migrations are the one legitimate reason for this side
      // to differ. They are named, never waved through as a class.
      if (expectUnapplied.size > 0) {
        console.log(
          `\nnote: ${[...expectUnapplied].join(', ')} declared unapplied to Gold — the differences above must be exactly what those migrations create, and that is a HUMAN check, not this script's.`,
        );
      }
      failed = true;
    }
    if (!missingInReplay.ok) {
      console.error(
        '\nGOLD HOLDS SCHEMA NO MIGRATION PRODUCES. A rebuild from this repo loses it.',
      );
      failed = true;
    }
  } finally {
    if (keep) {
      console.log(`\nreplay: keeping ${SCRATCH_DB} (--keep)`);
    } else {
      const admin2 = postgres(maintenance, { max: 1, connect_timeout: 10, onnotice: () => {} });
      try {
        // No fence re-check here. The one at module load already ran, and a
        // `throw` inside a `finally` REPLACES whatever exception was propagating
        // — so a guard placed here would destroy the very error a caller needs to
        // see, in exchange for re-testing a constant against itself.
        await admin2.unsafe(`DROP DATABASE IF EXISTS "${SCRATCH_DB}" WITH (FORCE)`);
        console.log(`replay: dropped ${SCRATCH_DB}`);
      } finally {
        await admin2.end({ timeout: 5 });
      }
    }
  }

  if (failed) process.exit(1);
  console.log('\nreplay: OK — a fresh database from this repo matches Gold');
}

await main();
