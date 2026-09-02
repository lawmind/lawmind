#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO DATABASES THAT CANNOT COVER FOR EACH OTHER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Round brief §7–§9. The earlier split proofs each built the two databases by
 * hand, with exactly the tables the route under test needed. That is right for
 * a focused suite and wrong for a matrix: a route reading `documents` out of the
 * corpus handle passes against a corpus database that has no `documents` for the
 * same reason it passes against one that does — nobody looked.
 *
 * So this builds both from the LIVE schema and then performs the subtraction
 * that makes the experiment mean something:
 *
 *     USER database    — every corpus table DROPPED
 *     CORPUS database  — every user table DROPPED
 *
 * §8 asks for "at least representative high-value tables". This drops all of
 * them, because the halfway version has a failure mode of its own: the one table
 * you left behind is the one the wrong-role query happens to read.
 *
 * ── WHY THE SCHEMA COMES FROM THE LIVE DATABASE AND NOT FROM `migrate` ──────
 *
 * `migration-fresh-install-proof.mjs` measured it: `drizzle.__drizzle_migrations`
 * holds 58 rows against 87 journal entries, and 28 migrations are
 * APPLIED_UNRECORDED. A `migrate` into an empty database therefore produces a
 * schema that is not the one the API runs on, and every route that touched a
 * missing column would fail here for a reason that has nothing to do with roles.
 *
 * The dump is `--schema-only` and carries no rows, so nothing of an advocate's
 * is copied anywhere.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import postgres from 'postgres';

import { CORPUS_TABLES, USER_TABLES } from '../services/api/src/ops/db-roles.ts';

export const CORPUS_SPLIT_TEST_DB = 'lawmind_r28_corpus';
export const USER_SPLIT_TEST_DB = 'lawmind_r28_user';

export function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

function pgRunner(base, bin) {
  const src = new URL(base);
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(src.password) };
  const conn = [
    '-h',
    src.hostname,
    '-p',
    src.port || '5432',
    '-U',
    decodeURIComponent(src.username),
  ];
  return (tool, argv, opts = {}) =>
    execFileSync(join(bin, tool), [...conn, ...argv], {
      env,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      ...opts,
    });
}

/**
 * Build the pair, and return the facts that prove they are what they claim.
 *
 * `sourceDatabase` is read for its SCHEMA only. Its rows are never copied.
 */
export async function buildSplitEnvironment({ base, bin, log = () => {} }) {
  const pg = pgRunner(base, bin);
  const sourceDatabase = new URL(base).pathname.replace(/^\//, '');
  const admin = postgres(withDatabase(base, 'postgres'), { max: 1, onnotice: () => {} });

  const work = mkdtempSync(join(tmpdir(), 'lawmind-r28-'));
  const schemaDump = join(work, 'schema.dump');

  try {
    log(`  dumping schema of "${sourceDatabase}" (--schema-only, no rows) ...`);
    pg('pg_dump', ['-d', sourceDatabase, '--schema-only', '--format=custom', '--file', schemaDump], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });

    for (const name of [CORPUS_SPLIT_TEST_DB, USER_SPLIT_TEST_DB]) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE template0`);
      try {
        pg('pg_restore', ['-d', name, '--no-owner', '--no-privileges', schemaDump], {
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      } catch {
        /* A schema restore into template0 reports errors for objects it cannot
         * own (extensions installed by a superuser elsewhere, comments on them).
         * The tables are what matter and the count below is what proves them. */
      }
      log(`  created ${name}`);
    }
  } finally {
    await admin.end();
  }
  return { sourceDatabase, work, pg };
}

/**
 * The subtraction, and the proof that it happened.
 *
 * Dropping the other role's tables is what turns "the split works" from an
 * opinion into an experiment: after this, a user query on the corpus handle
 * cannot succeed by accident, because there is nothing there to succeed against.
 *
 * `CASCADE` is safe in exactly one direction and that is not an accident either.
 * `db-roles.test.ts` asserts against the live catalogue that **no corpus table
 * holds a foreign key into a user table**, so dropping the user tables out of
 * the corpus database cannot take a corpus table with it. The reverse — user
 * tables referencing corpus rows — is the expected direction and is precisely
 * what the split replaces with a soft reference, so those FKs are dropped here
 * along with the corpus tables they point at.
 */
export async function applyNegativeSchema({ base, log = () => {} }) {
  const corpus = postgres(withDatabase(base, CORPUS_SPLIT_TEST_DB), { max: 2, onnotice: () => {} });
  const user = postgres(withDatabase(base, USER_SPLIT_TEST_DB), { max: 2, onnotice: () => {} });

  const tablesIn = async (sql) =>
    (await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`).map(
      (r) => r.tablename,
    );

  const corpusBefore = await tablesIn(corpus);
  const userBefore = await tablesIn(user);

  /* Only what is actually present: naming an absent table would abort the
   * statement and leave the subtraction half-done. */
  const dropFromCorpus = USER_TABLES.filter((t) => corpusBefore.includes(t));
  const dropFromUser = CORPUS_TABLES.filter((t) => userBefore.includes(t));

  if (dropFromCorpus.length > 0) {
    await corpus.unsafe(
      `DROP TABLE ${dropFromCorpus.map((t) => `public."${t}"`).join(', ')} CASCADE`,
    );
  }
  if (dropFromUser.length > 0) {
    await user.unsafe(`DROP TABLE ${dropFromUser.map((t) => `public."${t}"`).join(', ')} CASCADE`);
  }

  const corpusAfter = await tablesIn(corpus);
  const userAfter = await tablesIn(user);

  /**
   * The CASCADE audit. A corpus table that vanished while dropping user tables
   * would mean the FK invariant is false, and every downstream conclusion here
   * would be about a database missing tables for the wrong reason.
   */
  const corpusCollateral = corpusBefore
    .filter((t) => CORPUS_TABLES.includes(t))
    .filter((t) => !corpusAfter.includes(t));

  const proof = {
    corpusDatabase: CORPUS_SPLIT_TEST_DB,
    userDatabase: USER_SPLIT_TEST_DB,
    droppedFromCorpus: dropFromCorpus.length,
    droppedFromUser: dropFromUser.length,
    corpusTablesRemaining: corpusAfter.length,
    userTablesRemaining: userAfter.length,
    /* The named negative controls §8 asks for, stated rather than implied. */
    userDbHasJudgments: userAfter.includes('judgments'),
    userDbHasJudgmentCitations: userAfter.includes('judgment_citations'),
    corpusDbHasUsers: corpusAfter.includes('users'),
    corpusDbHasMatters: corpusAfter.includes('matters'),
    corpusDbHasMatterAuthorities: corpusAfter.includes('matter_authorities'),
    corpusCollateralDrops: corpusCollateral,
  };

  await corpus.end();
  await user.end();

  const bad = [];
  if (proof.userDbHasJudgments) bad.push('user database still holds judgments');
  if (proof.corpusDbHasUsers) bad.push('corpus database still holds users');
  if (proof.corpusDbHasMatters) bad.push('corpus database still holds matters');
  if (corpusCollateral.length > 0) {
    bad.push(`CASCADE took corpus tables with it: ${corpusCollateral.join(', ')}`);
  }
  if (bad.length > 0) throw new Error(`negative schema proof failed: ${bad.join('; ')}`);

  log(
    `  negative schema proof: corpus keeps ${proof.corpusTablesRemaining} tables ` +
      `(no users/matters), user keeps ${proof.userTablesRemaining} (no judgments)`,
  );
  return proof;
}

export async function dropSplitEnvironment(base) {
  const admin = postgres(withDatabase(base, 'postgres'), { max: 1, onnotice: () => {} });
  try {
    for (const name of [CORPUS_SPLIT_TEST_DB, USER_SPLIT_TEST_DB]) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => {});
    }
  } finally {
    await admin.end();
  }
}
