#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHICH ROLE DOES THIS MODULE ACTUALLY QUERY — ANSWERED FROM THE SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ops/db-roles.ts` says which DATABASE owns which table. It cannot say which
 * database a given `sql` handle is connected to, and that is the bug class R28
 * exists to close: a handler that takes the corpus handle and reads `matters`
 * works perfectly on one database and answers `relation "matters" does not
 * exist` the moment the two are pulled apart.
 *
 * This walks every `services/api/src` module, extracts the table names out of
 * its SQL, and resolves each to its role. The output is one row per module:
 * which roles it touches, and which tables put it there.
 *
 * ── WHY STATIC, WHEN THERE IS ALSO AN INTEGRATION SUITE ─────────────────────
 *
 * The integration suite proves the routes it drives. This proves the routes
 * nobody drove: a module added next month with one `FROM matters` in it shows
 * up here without anyone remembering to write a test for it. §12 of the round
 * brief asks for both, and for exactly this reason.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 *
 * It does not decide whether the handle a module was PASSED is the right one; a
 * parameter named `sql` says nothing. It reports the roles a module NEEDS,
 * which is the fact the wiring must then satisfy, and `db-role-wiring.test.ts`
 * plus the split integration matrix are what prove the wiring satisfied it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CORPUS_TABLES, USER_TABLES } from '../services/api/src/ops/db-roles.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'services', 'api', 'src');

const CORPUS = new Set(CORPUS_TABLES);
const USER = new Set(USER_TABLES);
const KNOWN = new Set([...CORPUS_TABLES, ...USER_TABLES]);

/**
 * Table names lifted out of SQL text.
 *
 * Deliberately syntactic and deliberately generous: `FROM`, every `JOIN`
 * spelling, `INSERT INTO`, `UPDATE`, `DELETE FROM`. A name it does not
 * recognise lands in the `unknown` bucket rather than being guessed at.
 */
const TABLE_RE = /\b(?:from|join|into|update|delete\s+from)\s+(?:only\s+)?"?([a-z_][a-z0-9_]*)"?/gi;

/** A statement keyword, used to tell a query from a sentence. */
const STATEMENT_RE = /\b(?:select|insert\s+into|update|delete\s+from|truncate)\b/i;

/**
 * SQL text lifted out of the file.
 *
 * Every backtick-delimited span is collected and then filtered to those holding
 * a statement keyword. Matching the SPAN rather than the TAG is deliberate:
 * `sql<Row[]>`, `tx`, `userSql`, `sql.unsafe(...)` and a fragment assembled in a
 * helper are all the same fact here, and a tag-anchored regex silently missed
 * the largest modules in this repository on the first attempt — it reported 17
 * modules where there are 40, and `matters/route.ts` was not among them.
 *
 * Prose backticks — `matters` in a comment — survive collection and are dropped
 * by the keyword filter, because a sentence is not a statement.
 */
function sqlFragments(source) {
  const out = [];
  for (const m of source.matchAll(/`([^`]*)`/gs)) {
    if (!STATEMENT_RE.test(m[1])) continue;
    out.push(m[1]);
  }
  return out;
}

function tablesIn(source) {
  const found = new Set();
  for (const frag of sqlFragments(source)) {
    for (const m of frag.matchAll(TABLE_RE)) found.add(m[1].toLowerCase());
  }
  return found;
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|mts)$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** Tests build their own schemas; they are evidence, not production wiring. */
const isTest = (p) => /\.test\.(ts|mts)$/.test(p);

/**
 * One row per module that talks to the database at all.
 *
 * Exported because `db-role-wiring.test.ts` asserts against it: the guard and
 * the report must read the same source, or the guard is guarding a different
 * program from the one that ships.
 */
export function auditModules() {
  const rows = [];
  for (const file of walk(SRC)) {
    if (isTest(file)) continue;
    const rel = relative(ROOT, file).split(sep).join('/');
    const tables = [...tablesIn(readFileSync(file, 'utf8'))];
    const corpus = tables.filter((t) => CORPUS.has(t)).sort();
    const user = tables.filter((t) => USER.has(t)).sort();
    const unknown = tables.filter((t) => !KNOWN.has(t)).sort();
    if (corpus.length === 0 && user.length === 0) continue;
    const roles = [];
    if (corpus.length > 0) roles.push('corpus');
    if (user.length > 0) roles.push('user');
    rows.push({ module: rel, roles, corpus, user, unknown });
  }
  return rows.sort((a, b) => a.module.localeCompare(b.module));
}

if (process.argv[1] && process.argv[1].endsWith('lcc-db-role-audit.mjs')) {
  const rows = auditModules();
  const pick = (n) => rows.filter((r) => r.roles.length === n[0] && (n[1] ? r.roles[0] === n[1] : true));
  const both = pick([2]);
  const userOnly = pick([1, 'user']);
  const corpusOnly = pick([1, 'corpus']);
  if (process.argv.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          kind: 'lawmind-db-role-audit',
          counts: {
            modules: rows.length,
            both: both.length,
            userOnly: userOnly.length,
            corpusOnly: corpusOnly.length,
          },
          rows,
        },
        null,
        2,
      ),
    );
  } else {
    const show = (label, list) => {
      console.log(`\n=== ${label} (${list.length}) ===`);
      for (const r of list) {
        console.log(`  ${r.module}`);
        if (r.user.length) console.log(`      user  : ${r.user.join(', ')}`);
        if (r.corpus.length) console.log(`      corpus: ${r.corpus.join(', ')}`);
        if (r.unknown.length) console.log(`      ??????: ${r.unknown.join(', ')}`);
      }
    };
    show('BOTH ROLES - needs two handles', both);
    show('USER ROLE ONLY', userOnly);
    show('CORPUS ROLE ONLY', corpusOnly);
  }
}
