#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE NINE ROUTES, DRIVEN AGAINST A TARGET THIS GENERATION DOES NOT CARRY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `lcc-r29-missing-target-matrix.mjs` reads the SOURCE and proves no call site
 * still says *"no judgment with that id"*. That is the static half, and on its
 * own it can be satisfied by a file nobody routes to.
 *
 * This is the other half: the real Hono app, in strict split mode, against two
 * physically distinct databases, driven with a well-formed judgment UUID that
 * the corpus database does not contain. Every route must answer:
 *
 *   code                     CORPUS_TARGET_UNAVAILABLE
 *   details.availability     corpus_unavailable
 *   status                   409 for a write, 404 for a read
 *   message                  says the target is not in the SELECTED RELEASE,
 *                            and claims nothing about the judgment itself
 *
 * A route that 500s because it read the wrong database fails here for the same
 * reason it fails in the R28 matrix, and `WRONG_ROLE` is kept apart from `FAIL`
 * for the same reason.
 *
 * Usage:
 *   DATABASE_URL=... pnpm exec tsx scripts/lcc-r29-missing-target-smoke.mjs \
 *     --out docs/ai/lcc-r29
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { signAccessToken } from '../packages/auth/src/tokens.ts';
import postgres from 'postgres';

import { createApp } from '../services/api/src/app.ts';
import { logger } from '../services/api/src/logger.ts';
import { resolveDatabases } from '../services/api/src/db-split.ts';
import { verifyDistinctDatabases } from '../services/api/src/ops/db-identity.ts';
import {
  CORPUS_SPLIT_TEST_DB,
  USER_SPLIT_TEST_DB,
  applyNegativeSchema,
  buildSplitEnvironment,
  dropSplitEnvironment,
  withDatabase,
} from './lcc-r28-split-env.mjs';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const OUT = resolve(flag('out') ?? './docs/ai/lcc-r29');
const BIN = flag('pgbin') ?? process.env['LAWMIND_PGBIN'] ?? 'C:/lawmind/pgsql/pgsql/bin';
const KEEP = args.includes('--keep');
const SECRET = 'r29-missing-target-secret-not-used-anywhere-real-0123456789';

const base = process.env['DATABASE_URL'];
if (!base) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

/**
 * A well-formed UUID the corpus database does not contain. Deliberately NOT a
 * malformed id: a malformed id is a 400 from the shared validator and proves
 * nothing about the semantics under test.
 */
const ABSENT_TARGET = '4d1a0000-0000-4000-8000-0000000029ff';

/** The sentence may say this. */
const MUST_SAY = /not available in the selected corpus release/i;
/** And none of this. */
const MUST_NOT_SAY =
  /does not exist|no such|not found|no judgment with|removed from the law|unverified|still good law|having trouble|try again later/i;

const captured = [];
const realError = logger.error.bind(logger);
logger.error = (...a) => {
  const err = a[0]?.err;
  if (err) captured.push({ code: err.code, message: String(err.message ?? '') });
  return realError(...a);
};

function takeMissingRelation() {
  let relation = null;
  for (const e of captured) {
    const m = /relation "([a-z_0-9]+)" does not exist/i.exec(e.message);
    if (m) relation = m[1];
    else if (e.code === '42P01') relation = e.message;
  }
  captured.length = 0;
  return relation;
}

const results = [];

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log('R29 missing-target semantics, across the physical split\n');

  await buildSplitEnvironment({ base, bin: BIN, log: console.log });
  await applyNegativeSchema({ base, log: console.log });

  const corpusUrl = withDatabase(base, CORPUS_SPLIT_TEST_DB);
  const userUrl = withDatabase(base, USER_SPLIT_TEST_DB);
  const resolved = resolveDatabases({
    CORPUS_DATABASE_URL: corpusUrl,
    USER_DATABASE_URL: userUrl,
    DB_SPLIT_MODE: 'split',
  });
  if (resolved.mode !== 'split') throw new Error('the resolver did not report split mode');

  const corpusSql = postgres(corpusUrl, { max: 4, onnotice: () => {} });
  const userSql = postgres(userUrl, { max: 4, onnotice: () => {} });
  const identity = await verifyDistinctDatabases(corpusSql, userSql);
  if (!identity.distinct) throw new Error('the two roles resolved to one database');
  console.log(`  identity: corpus="${identity.corpus.database}" user="${identity.user.database}"`);

  const authId = `r29-${randomUUID()}`;
  const email = `${authId}@example.test`;
  await userSql`INSERT INTO auth_user (id, name, email, email_verified)
                VALUES (${authId}, 'Adv', ${email}, true)`;
  await userSql`INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
                VALUES (${authId}, 'Adv R29',
                        ${`+9199${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`},
                        ${email}, 'unverified')`;
  const token = await signAccessToken({ sub: authId, email }, SECRET);

  const app = createApp({
    ping: async () => {
      await corpusSql`SELECT 1`;
    },
    search: { sql: corpusSql, userSql, embedQuery: async () => null },
    auth: { auth: null, sql: userSql, secret: SECRET },
  });

  const H = (json) => ({
    authorization: `Bearer ${token}`,
    ...(json ? { 'content-type': 'application/json' } : {}),
  });

  /**
   * The user-owned rows the write routes need before they reach the corpus.
   *
   * The MATTER is created through the real route, not by INSERT: `matters` has a
   * required `workspace_id` the route derives, and a fixture that invents one
   * would be testing a row shape the product never makes. The DOCUMENT has no
   * create route in current-v1, so it is inserted — with its enum values read
   * off the live type rather than guessed, because a guessed label fails as a
   * 500 that looks exactly like a role defect.
   */
  const matterRes = await app.request('/matters', {
    method: 'POST',
    headers: H(true),
    body: JSON.stringify({
      caseTitle: 'State v. R29 Missing Target',
      court: 'Delhi High Court',
      caseType: 'criminal',
      parties: { petitioner: 'State', respondent: 'R29' },
      clientName: 'R29 Fixture',
      ourSide: 'accused',
    }),
  });
  const matterBody = await matterRes.json();
  const matterId = matterBody?.data?.matter?.matterId;
  if (!matterId) throw new Error(`could not create the fixture matter: ${matterRes.status}`);

  const firstLabel = async (column) => {
    const [row] = await userSql`
      SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = (SELECT udt_name FROM information_schema.columns
                           WHERE table_name = 'documents' AND column_name = ${column})
       ORDER BY e.enumsortorder LIMIT 1`;
    return row.enumlabel;
  };
  const [document] = await userSql`
    INSERT INTO documents (user_id, matter_id, document_type, input_params,
                           generated_content, language)
    SELECT id, ${matterId}, ${await firstLabel('document_type')}, '{}'::jsonb,
           'R29 fixture draft', ${await firstLabel('language')}
      FROM users WHERE auth_id = ${authId}
    RETURNING id`;

  async function drive({ name, method, path, body, kind }) {
    takeMissingRelation();
    let status = 0;
    let parsed = null;
    /* Assigned by the try arm or the catch arm; never read before one of them. */
    let raw;
    try {
      const res = await app.request(path, {
        method: method ?? 'GET',
        headers: H(body !== undefined),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      status = res.status;
      raw = await res.text();
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* not JSON; the verdict reads the checks below */
      }
    } catch (err) {
      raw = String(err?.stack ?? err);
    }
    const relation = takeMissingRelation();
    const error = parsed?.error ?? null;
    const expectStatus = kind === 'write' ? 409 : 404;

    const checks = {
      noWrongRole: relation === null,
      status: status === expectStatus,
      code: error?.code === 'CORPUS_TARGET_UNAVAILABLE',
      availability: error?.details?.availability === 'corpus_unavailable',
      saysRelease: typeof error?.message === 'string' && MUST_SAY.test(error.message),
      claimsNothing: typeof error?.message === 'string' && !MUST_NOT_SAY.test(error.message),
    };
    const verdict = !checks.noWrongRole
      ? 'WRONG_ROLE'
      : Object.values(checks).every(Boolean)
        ? 'PASS'
        : 'FAIL';

    results.push({
      name,
      method: method ?? 'GET',
      path,
      kind,
      status,
      expectStatus,
      code: error?.code ?? null,
      message: error?.message ?? null,
      details: error?.details ?? null,
      missingRelation: relation,
      body: verdict === 'PASS' ? undefined : String(raw ?? '').slice(0, 400),
      checks,
      verdict,
    });
    console.log(
      `  ${verdict.padEnd(10)} ${(method ?? 'GET').padEnd(6)} ${path} -> ${status} ${
        error?.code ?? ''
      }`,
    );
  }

  /* ── the four reads ────────────────────────────────────────────────────── */
  await drive({ name: 'GET judgment', path: `/judgments/${ABSENT_TARGET}`, kind: 'read' });
  await drive({
    name: 'GET judgment treatment',
    path: `/judgments/${ABSENT_TARGET}/treatment`,
    kind: 'read',
  });
  await drive({
    name: 'GET judgment graph',
    path: `/judgments/${ABSENT_TARGET}/graph`,
    kind: 'read',
  });
  await drive({
    name: 'GET judgment authorities as-at',
    path: `/judgments/${ABSENT_TARGET}/authorities`,
    kind: 'read',
  });

  /* ── the five writes, including R17 §1's own ───────────────────────────── */
  await drive({
    name: 'POST annotation',
    method: 'POST',
    path: `/judgments/${ABSENT_TARGET}/annotations`,
    body: { paragraphNumber: 1, paragraphIndex: 0, quote: 'r29 fixture quote' },
    kind: 'write',
  });
  await drive({
    name: 'POST citation copy',
    method: 'POST',
    path: '/citations/copies',
    body: { judgmentId: ABSENT_TARGET, surface: 'judgment_detail', clientKey: randomUUID() },
    kind: 'write',
  });
  await drive({
    name: 'POST verify confirm (Tier 3)',
    method: 'POST',
    path: '/verify/confirm',
    body: { judgmentId: ABSENT_TARGET, citationText: '(2026) 1 SCC 1' },
    kind: 'write',
  });
  await drive({
    name: 'POST document citation',
    method: 'POST',
    path: `/documents/${document.id}/citations`,
    body: { judgmentId: ABSENT_TARGET },
    kind: 'write',
  });
  await drive({
    name: 'POST add-to-matter (R17 §1, already released)',
    method: 'POST',
    path: `/matters/${matterId}/authorities`,
    body: { judgmentId: ABSENT_TARGET },
    kind: 'write',
  });

  const counts = {
    total: results.length,
    pass: results.filter((r) => r.verdict === 'PASS').length,
    fail: results.filter((r) => r.verdict === 'FAIL').length,
    wrongRole: results.filter((r) => r.verdict === 'WRONG_ROLE').length,
  };
  const pass = counts.pass === counts.total;

  writeFileSync(
    join(OUT, 'missing-target-smoke.json'),
    `${JSON.stringify(
      {
        kind: 'lawmind-r29-missing-target-smoke',
        generatedAt: new Date().toISOString(),
        absentTarget: ABSENT_TARGET,
        corpusDatabase: identity.corpus.database,
        userDatabase: identity.user.database,
        physicallyDistinct: identity.distinct,
        counts,
        results,
        verdict: pass ? 'MISSING_TARGET_SEMANTICS_PASS' : 'MISSING_TARGET_SEMANTICS_FAIL',
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `\n  ${counts.pass}/${counts.total} pass · ${counts.fail} fail · ${counts.wrongRole} wrong-role`,
  );
  console.log(pass ? '\nMISSING_TARGET_SEMANTICS_PASS' : '\nMISSING_TARGET_SEMANTICS_FAIL');

  await corpusSql.end();
  await userSql.end();
  if (!pass) process.exitCode = 1;
}

try {
  await main();
} finally {
  if (!KEEP) await dropSplitEnvironment(base);
}
