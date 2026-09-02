#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE STATEMENT, TWO DATABASES — THE QUERIES THAT CANNOT SURVIVE THE SPLIT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `lcc-db-role-audit.mjs` reports which roles a MODULE touches, which is the
 * wiring question. This asks the narrower and more dangerous one: does a SINGLE
 * statement name tables from both roles?
 *
 * A module touching both roles needs two handles and is ordinary. A STATEMENT
 * touching both is a cross-database join, and PostgreSQL has no such thing —
 * it works on one database, and after the split it is a syntax-level
 * impossibility rather than a slow query. Round brief §H requires this count to
 * reach zero for the current-v1 graph.
 *
 * The unit is the tagged-template span, which is how postgres.js sends a
 * statement. A fragment composed into a larger query is reported at the span
 * where the two roles actually meet.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CORPUS_TABLES, USER_TABLES } from '../services/api/src/ops/db-roles.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'services', 'api', 'src');
const CORPUS = new Set(CORPUS_TABLES);
const USER = new Set(USER_TABLES);

const TABLE_RE = /\b(?:from|join|into|update|delete\s+from)\s+(?:only\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
const STATEMENT_RE = /\b(?:select|insert\s+into|update|delete\s+from|truncate)\b/i;

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|mts)$/.test(e)) acc.push(full);
  }
  return acc;
}

export function crossRoleStatements({ includeTests = false } = {}) {
  const found = [];
  for (const file of walk(SRC)) {
    if (!includeTests && /\.test\.(ts|mts)$/.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file).split(sep).join('/');
    for (const m of src.matchAll(/`([^`]*)`/gs)) {
      const body = m[1];
      if (!STATEMENT_RE.test(body)) continue;
      const tables = new Set([...body.matchAll(TABLE_RE)].map((t) => t[1].toLowerCase()));
      const corpus = [...tables].filter((t) => CORPUS.has(t)).sort();
      const user = [...tables].filter((t) => USER.has(t)).sort();
      if (corpus.length === 0 || user.length === 0) continue;
      const line = src.slice(0, m.index).split('\n').length;
      found.push({ module: rel, line, corpus, user, sql: body.trim().replace(/\s+/g, ' ').slice(0, 220) });
    }
  }
  return found;
}

if (process.argv[1] && process.argv[1].endsWith('lcc-cross-role-sql.mjs')) {
  const rows = crossRoleStatements({ includeTests: process.argv.includes('--tests') });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ kind: 'lawmind-cross-role-sql', count: rows.length, rows }, null, 2));
  } else {
    console.log(`CROSS_ROLE_SQL_JOINS = ${rows.length}\n`);
    for (const r of rows) {
      console.log(`  ${r.module}:${r.line}`);
      console.log(`      user  : ${r.user.join(', ')}`);
      console.log(`      corpus: ${r.corpus.join(', ')}`);
      console.log(`      ${r.sql}\n`);
    }
  }
  if (rows.length > 0) process.exitCode = 1;
}
