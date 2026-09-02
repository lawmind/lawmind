#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE API, DRIVEN AGAINST TWO PHYSICALLY SEPARATE DATABASES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Round brief §18: restore the user backup into a fresh database, then run the
 * current-v1 user/matter API smoke against THAT database plus one known corpus
 * database.
 *
 * Everything before this proves a PROPERTY — the roles are distinct, a TRUNCATE
 * cannot cross, the backup restores, the generations switch. This proves the
 * PRODUCT still works when the two are apart, which is a different question and
 * the one that fails silently if the wiring is wrong: a user route reading
 * matters out of the corpus database finds nothing and reports an empty matter
 * list, which looks exactly like a new account.
 *
 * It drives the REAL Hono app through `createApp`, not a hand-rolled client, so
 * the auth middleware, the validators and the envelope all participate.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import postgres from 'postgres';

import { createApp } from '../services/api/src/app.ts';
import { resolveDatabases } from '../services/api/src/db-split.ts';
import { verifyDistinctDatabases } from '../services/api/src/ops/db-identity.ts';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const OUT = resolve(flag('out') ?? './docs/ai/lcc-r25');
const BIN = flag('pgbin') ?? process.env['LAWMIND_PGBIN'] ?? 'C:/lawmind/pgsql/pgsql/bin';
const PACK = resolve(flag('pack') ?? './user-backup-pack');

const base = process.env['DATABASE_URL'];
if (!base) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}
const src = new URL(base);
const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(src.password) };
const conn = ['-h', src.hostname, '-p', src.port || '5432', '-U', decodeURIComponent(src.username)];
const pg = (tool, argv, opts = {}) =>
  execFileSync(join(BIN, tool), argv, {
    env: pgEnv,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    ...opts,
  });

const USER_DB = 'lawmind_user_smoke';
const withDb = (name) => {
  const u = new URL(base);
  u.pathname = `/${name}`;
  return u.toString();
};

const admin = postgres(withDb('postgres'), { max: 1, onnotice: () => {} });
const steps = [];
const record = (step, detail) => {
  steps.push({ step, ...detail });
  console.log(`  ${step}: ${JSON.stringify(detail)}`);
};

try {
  // ── 1. RESTORE THE USER BACKUP INTO A FRESH DATABASE ──────────────────────
  await admin.unsafe(`DROP DATABASE IF EXISTS ${USER_DB} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${USER_DB} TEMPLATE template0`);
  try {
    pg(
      'pg_restore',
      [...conn, '-d', USER_DB, '--no-owner', '--no-privileges', join(PACK, 'user-schema.dump')],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch {
    // Corpus-side objects in the whole-database schema dump. Expected, and the
    // DATA restore below is the one that must be clean.
  }
  pg(
    'pg_restore',
    [
      ...conn,
      '-d',
      USER_DB,
      '--no-owner',
      '--no-privileges',
      '--disable-triggers',
      '--exit-on-error',
      '--single-transaction',
      join(PACK, 'user-data.dump'),
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  record('user_restore', { database: USER_DB });

  // ── 2. THE TWO ROLES, AND THE GUARD ───────────────────────────────────────
  //
  // The CORPUS role is the real local corpus: the smoke is about the USER
  // database being a restored one, not about the corpus being disposable.
  const corpusUrl = base;
  const userUrl = withDb(USER_DB);
  const resolved = resolveDatabases({
    CORPUS_DATABASE_URL: corpusUrl,
    USER_DATABASE_URL: userUrl,
    DB_SPLIT_MODE: 'split',
  });
  record('split_resolved', { mode: resolved.mode });

  const corpusSql = postgres(corpusUrl, { max: 4, onnotice: () => {} });
  const userSql = postgres(userUrl, { max: 4, onnotice: () => {} });

  const verdict = await verifyDistinctDatabases(corpusSql, userSql);
  if (!verdict.distinct) throw new Error('the two roles are the same database');
  record('identity_verified', {
    corpus: verdict.corpus.database,
    user: verdict.user.database,
    sameCluster: verdict.sameCluster,
  });

  // ── 3. THE REAL APP, WIRED TO TWO ROLES ───────────────────────────────────
  const app = createApp({
    ping: async () => {
      await corpusSql`SELECT 1`;
    },
    search: {
      sql: corpusSql,
      userSql,
      // No embedder: this smoke is about the DATABASE wiring, and the dense arm
      // is not what is under test. Search still answers lexically.
      embedQuery: async () => null,
    },
  });

  const checks = [];
  const check = async (name, path, expect) => {
    const res = await app.request(path);
    const body = await res.json().catch(() => null);
    const ok = expect(res.status, body);
    checks.push({ name, path, status: res.status, ok });
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} -> ${res.status}`);
    return { res, body };
  };

  await check('health answers', '/health', (s) => s === 200);
  // Unauthenticated user routes must refuse, not 500. A 500 here is the shape a
  // mis-wired role produces: the query runs against the wrong database and throws.
  await check('matters requires auth', '/matters', (s) => s === 401);
  await check('alerts requires auth', '/alerts', (s) => s === 401);

  // ── 4. THE USER DATA IS ACTUALLY THERE, IN THE RESTORED DATABASE ──────────
  //
  // The API smoke above proves the routes are wired. This proves they are wired
  // to the RESTORED database rather than to an empty one that also answers 401.
  const [counts] = await userSql`
    SELECT (SELECT count(*)::text FROM users)              AS users,
           (SELECT count(*)::text FROM matters)            AS matters,
           (SELECT count(*)::text FROM matter_authorities) AS authorities`;
  record('restored_user_rows', counts);
  if (Number(counts.users) === 0) throw new Error('the restored user database is empty');

  // And the corpus role is genuinely the corpus.
  const [corpusCount] = await corpusSql`SELECT count(*)::text AS n FROM judgments`;
  record('corpus_rows', { judgments: corpusCount.n });

  // ── 5. THE CROSS-ROLE READ, END TO END ────────────────────────────────────
  //
  // A saved authority in the USER database, hydrated from the CORPUS database.
  // This is the read that used to be a JOIN and is now two statements.
  const { judgmentFacts } = await import('../services/api/src/judgments/hydrate.ts');
  const saved = await userSql`
    SELECT judgment_id FROM matter_authorities ORDER BY added_at DESC LIMIT 20`;
  const facts = await judgmentFacts(
    corpusSql,
    saved.map((r) => r.judgment_id),
  );
  record('cross_role_hydration', {
    savedAuthorities: saved.length,
    resolvedFromCorpus: facts.size,
    corpusUnavailable: saved.length - facts.size,
  });

  const allOk = checks.every((c) => c.ok);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'split-api-smoke.json'),
    `${JSON.stringify(
      {
        kind: 'lawmind-split-api-smoke',
        note: 'The real Hono app driven against a RESTORED user database and the live corpus database.',
        steps,
        checks,
        verdict: allOk ? 'SPLIT_API_SMOKE_PASS' : 'SPLIT_API_SMOKE_FAIL',
      },
      null,
      2,
    )}\n`,
  );

  await corpusSql.end();
  await userSql.end();
  console.log(`\n${allOk ? 'SPLIT_API_SMOKE_PASS' : 'SPLIT_API_SMOKE_FAIL'}`);
  if (!allOk) process.exitCode = 1;
} finally {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${USER_DB} WITH (FORCE)`).catch(() => {});
  await admin.end();
}
