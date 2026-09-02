#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * §14 — THE BLUE/GREEN SWITCH, WITH THE AUTHENTICATED API ACTUALLY RUNNING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `lcc-corpus-bluegreen-proof.mjs` (R25) proves the PROPERTY: activation is a
 * pointer, nothing is written to either database, and an ordered md5 over every
 * user table is unchanged across A -> B -> A. That is still true and is not
 * repeated here.
 *
 * What it does NOT do is drive the product. Its `resolveOn` is a hand-written
 * SELECT that asks the corpus which saved ids it carries — a faithful model of
 * what the route does, written twice. The spelling that disagreed would be the
 * one that shipped, and R28's whole finding is that a model of the wiring and
 * the wiring had diverged in thirteen places.
 *
 * So this switches the corpus generation UNDER A LIVE APP, over HTTP, with a
 * real token, and reads the answers the advocate would see:
 *
 *     A   save an authority           201, and it hydrates with its case title
 *     B   the same matter             200, the row is in unavailableAuthorities
 *     B   a NEW save of that target   409 CORPUS_TARGET_UNAVAILABLE
 *     A   the same matter again       200, back in authorities[] with its title
 *
 * The `authorityId` and `addedAt` must be identical at both ends. R20 is
 * explicit that no user-data write or resave occurs, so a row that came back
 * with a new id would mean the round trip had rewritten an advocate's work.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import postgres from 'postgres';

import { signAccessToken } from '../packages/auth/src/tokens.ts';
import { createApp } from '../services/api/src/app.ts';
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
const flagOf = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const OUT = resolve(flagOf('out') ?? './docs/ai/lcc-r28');
const BIN = flagOf('pgbin') ?? process.env['LAWMIND_PGBIN'] ?? 'C:/lawmind/pgsql/pgsql/bin';
const SECRET = 'r28-bluegreen-secret-not-used-anywhere-real-0123456789';
const GEN_A = 'lawmind_r28_gen_a';
const GEN_B = 'lawmind_r28_gen_b';

const base = process.env['DATABASE_URL'];
if (!base) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const steps = [];
const record = (step, detail) => {
  steps.push({ step, ...detail });
  console.log(`  ${step}: ${JSON.stringify(detail)}`);
};

/**
 * An ordered md5 over the full content of every user table.
 *
 * A row COUNT answers "was anything deleted" and cannot see a `removed_at`
 * quietly stamped on a saved authority, which R20 forbids as firmly as it
 * forbids a delete. `::text` on the whole row and an ORDER BY make the digest
 * deterministic across two reads of the same unchanged table.
 */
async function userDigest(sql) {
  const tables = (
    await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  ).map((r) => r.tablename);
  const digest = {};
  for (const t of tables) {
    const [row] = await sql.unsafe(
      `SELECT count(*)::text AS rows,
              coalesce(md5(string_agg(t.line, E'\n' ORDER BY t.line)), 'empty') AS md5
         FROM (SELECT x::text AS line FROM public."${t}" x) t`,
    );
    digest[t] = { rows: row.rows, md5: row.md5 };
  }
  return digest;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log('R28 blue/green, driven through the API\n');

  // The USER database is built exactly as the matrix builds it — real schema,
  // corpus tables removed — so a route reaching for the corpus through the user
  // handle fails here too rather than being covered for.
  await buildSplitEnvironment({ base, bin: BIN, log: (s) => console.log(s) });
  const negative = await applyNegativeSchema({ base, log: (s) => console.log(s) });

  const admin = postgres(withDatabase(base, 'postgres'), { max: 1, onnotice: () => {} });
  const userSql = postgres(withDatabase(base, USER_SPLIT_TEST_DB), { max: 4, onnotice: () => {} });

  /**
   * Two generations carrying the same schema and different contents.
   *
   * Built from the R28 corpus database, which already holds the live schema, so
   * the generations differ in exactly one fact: whether they contain the target.
   */
  for (const name of [GEN_A, GEN_B]) {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE ${CORPUS_SPLIT_TEST_DB}`);
  }
  const genA = postgres(withDatabase(base, GEN_A), { max: 3, onnotice: () => {} });
  const genB = postgres(withDatabase(base, GEN_B), { max: 3, onnotice: () => {} });

  const judgmentId = randomUUID();
  await genA`
    INSERT INTO judgments (id, case_title, neutral_citation, reporter_citations, court,
                           judgment_date, language, source_url, full_text)
    VALUES (${judgmentId}, 'SYNTHETIC — Present In Generation A Only', 'FIX 2026 INSC 9', '{}',
            'Supreme Court of India', '2026-03-01', 'en', ${`r28bg://${judgmentId}`},
            'synthetic blue-green target')`;

  const inA = await genA`SELECT id FROM judgments WHERE id = ${judgmentId}`;
  const inB = await genB`SELECT id FROM judgments WHERE id = ${judgmentId}`;
  if (inA.length !== 1 || inB.length !== 0) {
    throw new Error('the two generations are not in the state under test');
  }
  record('generations', { A: GEN_A, B: GEN_B, targetInA: inA.length, targetInB: inB.length });

  const verdict = await verifyDistinctDatabases(genA, userSql);
  if (!verdict.distinct) throw new Error('generation A and the user database are the same');

  // ── the advocate, and one app per generation ──────────────────────────────
  const authId = `r28-bg-${randomUUID()}`;
  const email = `${authId}@example.test`;
  await userSql`INSERT INTO auth_user (id, name, email, email_verified)
                VALUES (${authId}, 'Adv', ${email}, true)`;
  await userSql`INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
                VALUES (${authId}, 'Blue Green',
                        ${`+9199${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`},
                        ${email}, 'unverified')`;
  const token = await signAccessToken({ sub: authId, email }, SECRET);

  /* Activation is a POINTER. Both apps share one user database and differ only
   * in which corpus generation the corpus role resolves to — which is what a
   * blue/green switch is, and why no user row is touched by one. */
  const appOn = (corpusSql) =>
    createApp({
      ping: async () => {
        await corpusSql`SELECT 1`;
      },
      search: { sql: corpusSql, userSql, embedQuery: async () => null },
      auth: { auth: null, sql: userSql, secret: SECRET },
    });
  const onA = appOn(genA);
  const onB = appOn(genB);

  const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const call = async (app, path, init = {}) => {
    const res = await app.request(path, { headers: H, ...init });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  // ── A: the matter and the saved authority, over HTTP ──────────────────────
  const created = await call(onA, '/matters', {
    method: 'POST',
    body: JSON.stringify({
      caseTitle: 'State v. Blue Green',
      court: 'Delhi High Court',
      caseType: 'criminal',
      parties: { petitioner: 'State', respondent: 'BG' },
      clientName: 'BG',
      ourSide: 'accused',
    }),
  });
  if (created.status !== 201) throw new Error(`matter create failed: ${created.status}`);
  const matterId = created.body.data.matter.matterId;

  const saved = await call(onA, `/matters/${matterId}/authorities`, {
    method: 'POST',
    body: JSON.stringify({ judgmentId }),
  });
  if (saved.status !== 201) throw new Error(`save failed: ${JSON.stringify(saved.body)}`);
  const authorityId = saved.body.data.authority.authorityId;
  const addedAt = saved.body.data.authority.addedAt;

  const readA = await call(onA, `/matters/${matterId}/authorities`);
  const hitA = (readA.body.data.authorities ?? []).find((a) => a.judgmentId === judgmentId);
  record('active_A', {
    status: readA.status,
    authorities: (readA.body.data.authorities ?? []).length,
    unavailable: (readA.body.data.unavailableAuthorities ?? []).length,
    caseTitle: hitA?.caseTitle ?? null,
  });
  if (!hitA?.caseTitle) throw new Error('generation A did not hydrate the saved authority');

  const digestBefore = await userDigest(userSql);

  // ── B: the same matter, the target absent ─────────────────────────────────
  const readB = await call(onB, `/matters/${matterId}/authorities`);
  const shell = (readB.body.data.unavailableAuthorities ?? []).find(
    (a) => a.judgmentId === judgmentId,
  );
  record('switch_A_to_B', {
    status: readB.status,
    authorities: (readB.body.data.authorities ?? []).length,
    unavailable: (readB.body.data.unavailableAuthorities ?? []).length,
    availability: shell?.availability ?? null,
    sameAuthorityId: shell?.authorityId === authorityId,
    sameAddedAt: shell?.addedAt === addedAt,
    /* R20 forbids fabricating any of these into the shell. Checked rather than
     * trusted: a cached title is the trap RCC named at bus 1735. */
    noFabricatedFields:
      shell !== undefined &&
      shell.caseTitle === undefined &&
      shell.neutralCitation === undefined &&
      shell.verificationState === undefined,
  });
  if (!shell) throw new Error('the saved row did not appear as an unavailable shell under B');

  const writeUnderB = await call(onB, `/matters/${matterId}/authorities`, {
    method: 'POST',
    body: JSON.stringify({ judgmentId: randomUUID() }),
  });
  record('new_save_under_B', {
    status: writeUnderB.status,
    code: writeUnderB.body?.error?.code ?? null,
    /* R17 forbids claiming no such judgment exists — after a rollback it does. */
    forbiddenSentence: /no judgment/i.test(writeUnderB.body?.error?.message ?? ''),
  });

  // ── back to A: the row returns, unchanged ─────────────────────────────────
  const backOnA = await call(onA, `/matters/${matterId}/authorities`);
  const hitBack = (backOnA.body.data.authorities ?? []).find((a) => a.judgmentId === judgmentId);
  record('rollback_B_to_A', {
    status: backOnA.status,
    authorities: (backOnA.body.data.authorities ?? []).length,
    unavailable: (backOnA.body.data.unavailableAuthorities ?? []).length,
    caseTitle: hitBack?.caseTitle ?? null,
    sameAuthorityId: hitBack?.authorityId === authorityId,
    sameAddedAt: hitBack?.addedAt === addedAt,
  });

  const digestAfter = await userDigest(userSql);
  const changed = Object.keys(digestBefore).filter(
    (t) =>
      digestBefore[t].md5 !== digestAfter[t]?.md5 || digestBefore[t].rows !== digestAfter[t]?.rows,
  );
  record('user_digest', { tables: Object.keys(digestAfter).length, changedTables: changed });

  const checks = {
    A_hydrates: hitA?.caseTitle != null,
    B_shows_unavailable_shell: shell?.availability === 'corpus_unavailable',
    B_shell_is_the_same_row: shell?.authorityId === authorityId && shell?.addedAt === addedAt,
    B_shell_fabricates_nothing:
      shell?.caseTitle === undefined &&
      shell?.neutralCitation === undefined &&
      shell?.verificationState === undefined,
    B_new_save_refused_409: writeUnderB.status === 409,
    B_refusal_code: writeUnderB.body?.error?.code === 'CORPUS_TARGET_UNAVAILABLE',
    B_refusal_does_not_deny_existence: !/no judgment/i.test(
      writeUnderB.body?.error?.message ?? '',
    ),
    A_recovers: hitBack?.caseTitle != null,
    A_recovers_the_same_row: hitBack?.authorityId === authorityId && hitBack?.addedAt === addedAt,
    user_data_unchanged: changed.length === 0,
  };
  const pass = Object.values(checks).every(Boolean);

  writeFileSync(
    join(OUT, 'bluegreen-api.json'),
    `${JSON.stringify(
      {
        kind: 'lawmind-r28-bluegreen-api',
        note:
          'A -> B -> A with the authenticated Hono app running, over HTTP, against a user ' +
          'database stripped of every corpus table.',
        generations: { A: GEN_A, B: GEN_B },
        userDatabase: USER_SPLIT_TEST_DB,
        negativeSchema: negative,
        judgmentId,
        matterId,
        authorityId,
        steps,
        checks,
        USER_DATA_CHANGED_BY_CORPUS_SWITCH: changed.length === 0 ? 'NO' : 'YES',
        changedTables: changed,
        verdict: pass ? 'BLUEGREEN_API_PASS' : 'BLUEGREEN_API_FAIL',
      },
      null,
      2,
    )}\n`,
  );

  for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? 'PASS' : 'FAIL'}  ${k}`);
  console.log(`\nUSER_DATA_CHANGED_BY_CORPUS_SWITCH = ${changed.length === 0 ? 'NO' : 'YES'}`);
  console.log(pass ? 'BLUEGREEN_API_PASS' : 'BLUEGREEN_API_FAIL');

  await Promise.all([genA.end(), genB.end(), userSql.end()]);
  for (const name of [GEN_A, GEN_B]) {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => {});
  }
  await admin.end();
  if (!pass) process.exitCode = 1;
}

try {
  await main();
} finally {
  await dropSplitEnvironment(base);
}
