#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * §H — THE SIX ZEROES, MEASURED RATHER THAN ASSERTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Each of these is a way the split could be true on paper and false in the
 * database, and each is answered from a different place:
 *
 *   CROSS_ROLE_FKS                  the live catalogue — a constraint either
 *                                   exists or it does not, and a comment saying
 *                                   it was removed is not evidence
 *   CROSS_ROLE_SQL_JOINS            the source — a statement naming both roles
 *   FDW / DBLINK                    `pg_extension`, `pg_foreign_server` and
 *                                   `relkind = 'f'`; either would make a
 *                                   cross-role join WORK, which is the failure
 *                                   mode that hides all the others
 *   DISTRIBUTED_TRANSACTION_LAYER   prepared transactions, and any two-phase
 *                                   commit vocabulary in the source
 *   WRONG_ROLE_FALLBACK             the source — a catch that retries the other
 *                                   handle. §2: a fallback makes every
 *                                   wrong-role query work everywhere except
 *                                   production.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { CORPUS_TABLES, USER_TABLES } from '../services/api/src/ops/db-roles.ts';
import { crossRoleStatements } from './lcc-cross-role-sql.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'services', 'api', 'src');
const args = process.argv.slice(2);
const flagOf = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const OUT = resolve(flagOf('out') ?? './docs/ai/lcc-r28');

const base = process.env['DATABASE_URL'];
if (!base) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|mts)$/.test(e)) acc.push(full);
  }
  return acc;
}

const productionSources = () =>
  walk(SRC).filter((f) => !/\.test\.(ts|mts)$/.test(f));

const sql = postgres(base, { max: 2, onnotice: () => {} });
const findings = {};

try {
  /**
   * CROSS_ROLE_FKS — read from `pg_constraint`, both directions.
   *
   * The user->corpus direction is the one migration 0102 removed and the one
   * that must stay removed. The corpus->user direction is the invariant
   * `db-roles.test.ts` asserts, and it is checked here too because the split
   * environment's `DROP TABLE ... CASCADE` depends on it: a corpus table holding
   * a foreign key into a user table would be destroyed by the subtraction, and
   * the matrix would then be testing a corpus database missing tables for a
   * reason that has nothing to do with roles.
   */
  const fks = await sql`
    SELECT c.conname   AS constraint_name,
           src.relname AS from_table,
           tgt.relname AS to_table
      FROM pg_constraint c
      JOIN pg_class src   ON src.oid = c.conrelid
      JOIN pg_class tgt   ON tgt.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = src.relnamespace
     WHERE c.contype = 'f' AND n.nspname = 'public'`;
  const corpus = new Set(CORPUS_TABLES);
  const user = new Set(USER_TABLES);
  const crossRoleFks = fks.filter(
    (f) =>
      (corpus.has(f.from_table) && user.has(f.to_table)) ||
      (user.has(f.from_table) && corpus.has(f.to_table)),
  );
  findings.CROSS_ROLE_FKS = {
    count: crossRoleFks.length,
    totalForeignKeys: fks.length,
    offenders: crossRoleFks.map((f) => `${f.from_table} -> ${f.to_table} (${f.constraint_name})`),
  };

  // ── FDW / DBLINK ──────────────────────────────────────────────────────────
  const extensions = (await sql`SELECT extname FROM pg_extension ORDER BY extname`).map(
    (r) => r.extname,
  );
  const foreignServers = (await sql`SELECT srvname FROM pg_foreign_server`).map((r) => r.srvname);
  const foreignTables = (
    await sql`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relkind = 'f' AND n.nspname = 'public'`
  ).map((r) => r.relname);
  findings.FDW = {
    used:
      extensions.some((e) => /_fdw$/.test(e)) ||
      foreignServers.length > 0 ||
      foreignTables.length > 0,
    fdwExtensions: extensions.filter((e) => /_fdw$/.test(e)),
    foreignServers,
    foreignTables,
  };
  findings.DBLINK = { used: extensions.includes('dblink'), extensions };

  // ── DISTRIBUTED TRANSACTION LAYER ─────────────────────────────────────────
  const prepared = await sql`SELECT gid FROM pg_prepared_xacts`;
  const [{ v: maxPrepared }] = await sql`
    SELECT current_setting('max_prepared_transactions') AS v`;
  const twoPhaseSource = [];
  for (const file of productionSources()) {
    const text = readFileSync(file, 'utf8');
    if (/\bPREPARE\s+TRANSACTION\b|\bCOMMIT\s+PREPARED\b|\bROLLBACK\s+PREPARED\b/i.test(text)) {
      twoPhaseSource.push(relative(ROOT, file).split(sep).join('/'));
    }
  }
  findings.DISTRIBUTED_TRANSACTION_LAYER = {
    used: prepared.length > 0 || twoPhaseSource.length > 0,
    preparedTransactions: prepared.length,
    maxPreparedTransactions: maxPrepared,
    twoPhaseSource,
  };

  // ── CROSS_ROLE_SQL_JOINS ──────────────────────────────────────────────────
  const joins = crossRoleStatements();
  findings.CROSS_ROLE_SQL_JOINS = {
    count: joins.length,
    offenders: joins.map((j) => `${j.module}:${j.line}`),
  };

  /**
   * WRONG_ROLE_FALLBACK — a catch block that reaches for the other handle.
   *
   * Searched as a co-occurrence inside an eight-line window rather than as a
   * phrase, because the shape it would take has no fixed wording: what it always
   * has is a catch, a missing-relation test, and the name of the other handle.
   */
  const fallbacks = [];
  for (const file of productionSources()) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/\bcatch\b/.test(line)) return;
      const window = lines.slice(i, i + 8).join('\n');
      if (/relation .* does not exist|42P01/i.test(window) && /(userSql|corpusSql)/.test(window)) {
        fallbacks.push(`${rel}:${i + 1}`);
      }
    });
  }
  findings.WRONG_ROLE_FALLBACK = { count: fallbacks.length, offenders: fallbacks };

  const verdicts = {
    CURRENT_V1_CROSS_ROLE_FKS: findings.CROSS_ROLE_FKS.count,
    CURRENT_V1_CROSS_ROLE_SQL_JOINS: findings.CROSS_ROLE_SQL_JOINS.count,
    FDW: findings.FDW.used ? 1 : 0,
    DBLINK: findings.DBLINK.used ? 1 : 0,
    DISTRIBUTED_TRANSACTION_LAYER: findings.DISTRIBUTED_TRANSACTION_LAYER.used ? 1 : 0,
    WRONG_ROLE_FALLBACK: findings.WRONG_ROLE_FALLBACK.count,
  };
  const pass = Object.values(verdicts).every((v) => v === 0);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'required-zeroes.json'),
    `${JSON.stringify(
      {
        kind: 'lawmind-r28-required-zeroes',
        database: new URL(base).pathname.replace(/^\//, ''),
        measuredAt: new Date().toISOString(),
        verdicts,
        findings,
        verdict: pass ? 'REQUIRED_ZEROES_PASS' : 'REQUIRED_ZEROES_FAIL',
      },
      null,
      2,
    )}\n`,
  );
  for (const [k, v] of Object.entries(verdicts)) {
    console.log(`  ${v === 0 ? 'PASS' : 'FAIL'}  ${k} = ${v}`);
  }
  console.log(`\n${pass ? 'REQUIRED_ZEROES_PASS' : 'REQUIRED_ZEROES_FAIL'}`);
  if (!pass) process.exitCode = 1;
} finally {
  await sql.end();
}
