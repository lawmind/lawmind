#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LCC R30 — THE SIX R16 CREATES, THROUGH THE APP THE SERVER ACTUALLY BUILDS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Galaxy S24 found what `idempotency.test.ts` could not: every keyed create
 * answered 500 with a postgres.js `Bind` TypeError. The conformance suite was
 * green because it builds its app with `auth: null` on a bare pool, and the
 * defect lives in the one thing it skipped — `index.ts` handed the USER pool to
 * `createAuth`, whose `drizzle(config.sql)` REPLACES that client's json/jsonb
 * serializers (114, 3802) with an identity function. From then on every
 * `sql.json(obj)` on the user pool reaches `Bind` as a raw object.
 *
 * So this harness builds its handles the way `index.ts` does — `createRolePools`
 * plus `createAuth` — and drives the real Hono routes with a real signed token.
 *
 *   --wiring legacy   the pre-R30 wiring: createAuth({ sql: userSql }).
 *                     This MUST fail. A harness that passes here proves nothing.
 *   --wiring fixed    the R30 wiring: better-auth gets `rolePools.auth`.
 *   --topology single corpus and user roles are the one DATABASE_URL (the S24 setup)
 *   --topology split  two physically separate databases built by
 *                     `lcc-r28-split-env.mjs` (user tables absent from corpus
 *                     and vice versa), so a wrong-role query has nowhere to hide.
 *
 * Counts DURABLE ROWS, never matching JSON. A 5xx executor failure is injected
 * with a BEFORE INSERT trigger that fires only in sessions carrying the startup
 * GUC `lawmind.r30_fault=on` — every other session, including every worker on
 * this box, passes straight through it — and the trigger is dropped at the end.
 *
 * Usage:
 *   pnpm exec tsx scripts/lcc-r30-r16-real-route.mjs --topology single --wiring fixed
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createAuth, mailerFrom, signAccessToken } from '../packages/auth/src/index.ts';
import postgres from 'postgres';

import { createApp } from '../services/api/src/app.ts';
import { IDEMPOTENCY_HEADER } from '../services/api/src/idempotency.ts';
import * as poolsModule from '../services/api/src/pools.ts';
import {
  applyNegativeSchema,
  buildSplitEnvironment,
  CORPUS_SPLIT_TEST_DB,
  USER_SPLIT_TEST_DB,
  withDatabase,
} from './lcc-r28-split-env.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const TOPOLOGY = flag('topology', 'single');
const WIRING = flag('wiring', 'fixed');
const OUT = resolve(flag('out', './docs/ai/lcc-r30'));
const BIN = flag('pgbin', process.env['LAWMIND_PGBIN'] ?? 'C:/lawmind/pgsql/pgsql/bin');
const base = process.env['DATABASE_URL'];
if (!base) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}
if (!['single', 'split'].includes(TOPOLOGY) || !['fixed', 'legacy'].includes(WIRING)) {
  console.error('--topology single|split  --wiring fixed|legacy');
  process.exit(2);
}

const SECRET = 'r30-harness-secret-not-used-anywhere-real-0123456789';
const TAG = 'r30-r16';
const FAULT_GUC = 'lawmind.r30_fault';
const DOMAIN_TABLES = [
  'matters',
  'matter_events',
  'judgment_annotations',
  'data_requests',
  'citation_checks',
  'training_consent_events',
];

// ── topology ─────────────────────────────────────────────────────────────────
let corpusUrl = base;
let userUrl = base;
if (TOPOLOGY === 'split') {
  await buildSplitEnvironment({ base, bin: BIN, log: (l) => console.log(l) });
  await applyNegativeSchema({ base, log: (l) => console.log(l) });
  corpusUrl = withDatabase(base, CORPUS_SPLIT_TEST_DB);
  userUrl = withDatabase(base, USER_SPLIT_TEST_DB);
}

/** Seeding / counting handles. Plain pools, never shown to drizzle. */
const userAdmin = postgres(userUrl, { max: 3, onnotice: () => {} });
const corpusAdmin = postgres(corpusUrl, { max: 2, onnotice: () => {} });

// ── the judgment the two corpus-reading routes need ──────────────────────────
const source = postgres(base, { max: 1, onnotice: () => {} });
const [picked] = await source`
  SELECT id FROM judgments WHERE overruled_status = 'none' ORDER BY id LIMIT 1`;
if (!picked) throw new Error('no judgment in the source database');
const judgmentId = picked.id;
if (TOPOLOGY === 'split') {
  /* One row, copied by its NON-generated columns: a generated column cannot be
   * inserted, and `SELECT *` would include it. */
  const cols = (
    await source`SELECT column_name FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'judgments'
                   AND is_generated = 'NEVER'`
  ).map((r) => r.column_name);
  const [row] = await source`SELECT to_jsonb(j) AS r FROM judgments j WHERE id = ${judgmentId}`;
  const list = cols.map((c) => `"${c}"`).join(', ');
  await corpusAdmin.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL session_replication_role = replica`);
    await tx.unsafe(
      `INSERT INTO judgments (${list}) SELECT ${list} FROM jsonb_populate_record(NULL::judgments, $1)
       ON CONFLICT (id) DO NOTHING`,
      [tx.json(row.r)],
    );
  });
}
await source.end();

// ── fault injection (inert without the startup GUC) ─────────────────────────
async function installFault() {
  await userAdmin.unsafe(`SET lock_timeout = '5s'`);
  await userAdmin.unsafe(`
    CREATE OR REPLACE FUNCTION r30_fault_injection() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN
      IF current_setting('${FAULT_GUC}', true) = 'on' THEN
        RAISE EXCEPTION 'r30 injected executor failure';
      END IF;
      RETURN NEW;
    END $f$`);
  for (const t of DOMAIN_TABLES) {
    await userAdmin.unsafe(`DROP TRIGGER IF EXISTS r30_fault_injection ON ${t}`);
    await userAdmin.unsafe(
      `CREATE TRIGGER r30_fault_injection BEFORE INSERT ON ${t}
       FOR EACH ROW EXECUTE FUNCTION r30_fault_injection()`,
    );
  }
}
async function removeFault() {
  for (const t of DOMAIN_TABLES) {
    await userAdmin.unsafe(`DROP TRIGGER IF EXISTS r30_fault_injection ON ${t}`);
  }
  await userAdmin.unsafe(`DROP FUNCTION IF EXISTS r30_fault_injection()`);
}

// ── the app, built the way index.ts builds it ────────────────────────────────
const mailer = mailerFrom(
  { resendApiKey: undefined, mailFrom: 'x <x@example.test>', nodeEnv: 'development' },
  () => {},
);
const captured = [];
const openPools = [];

function buildApp({ fault = false } = {}) {
  let rolePools;
  if (fault) {
    /* Same options as `createRolePools`' user pool, plus the one GUC that arms
     * the trigger. The corpus side is unchanged. */
    const corpus = poolsModule.createPools(corpusUrl, 15_000);
    const user = postgres(userUrl, {
      max: 4,
      onnotice: () => {},
      connection: {
        idle_in_transaction_session_timeout: 30_000,
        statement_timeout: poolsModule.CORE_STATEMENT_TIMEOUT_MS,
        [FAULT_GUC]: 'on',
      },
    });
    const authOnly = postgres(userUrl, { max: 1, onnotice: () => {} });
    rolePools = {
      corpus,
      user,
      auth: authOnly,
      end: async () => Promise.all([corpus.end(), user.end(), authOnly.end()]),
    };
  } else {
    rolePools = poolsModule.createRolePools(corpusUrl, userUrl, 15_000);
  }
  const userSql = rolePools.user;
  let authSql;
  if (WIRING === 'legacy') {
    authSql = userSql; // exactly the pre-R30 index.ts line
  } else {
    authSql = rolePools.auth; // exactly the R30 index.ts line
  }
  const auth = createAuth({
    sql: authSql,
    secret: SECRET,
    baseUrl: 'http://127.0.0.1:3000',
    mailer,
  });
  openPools.push(rolePools);
  /* The same startup check index.ts now runs: legacy must report `user:*`. */
  const guard = poolsModule.jsonSerializerDefects({
    corpus: rolePools.corpus.core,
    research: rolePools.corpus.research,
    user: userSql,
  });
  const app = createApp({
    ping: async () => {},
    search: {
      sql: rolePools.corpus.core,
      userSql,
      researchSql: rolePools.corpus.research,
      embedQuery: async () => null,
    },
    auth: { auth, sql: userSql, secret: SECRET },
  });
  const original = app.errorHandler;
  app.onError((error, c) => {
    captured.push({
      name: error?.name,
      message: error?.message,
      code: error?.code,
      cause: error?.cause ? String(error.cause) : undefined,
      stack: String(error?.stack ?? '')
        .split('\n')
        .slice(0, 8)
        .join('\n'),
      query:
        typeof error?.query === 'string'
          ? error.query.replace(/\s+/g, ' ').slice(0, 200)
          : undefined,
    });
    return original(error, c);
  });
  return { app, guard };
}

// ── fixtures ─────────────────────────────────────────────────────────────────
async function seedAdvocate(label, { profile = true } = {}) {
  const authId = `${TAG}-${label}-${randomUUID()}`;
  const email = `${authId}@example.test`;
  await userAdmin`INSERT INTO auth_user (id, name, email, email_verified)
                  VALUES (${authId}, 'Adv', ${email}, true)`;
  let userId = null;
  if (profile) {
    const [u] = await userAdmin`
      INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
      VALUES (${authId}, 'Adv', '+911111111111', ${email}, 'unverified') RETURNING id`;
    userId = u.id;
  }
  return { authId, userId, email, token: await signAccessToken({ sub: authId, email }, SECRET) };
}

async function cleanup() {
  const like = `${TAG}-%`;
  const users = userAdmin`SELECT id FROM users WHERE auth_id LIKE ${like}`;
  await userAdmin`DELETE FROM api_idempotency_records WHERE auth_id LIKE ${like}`;
  await userAdmin`DELETE FROM judgment_annotations WHERE user_id IN (${users})`;
  await userAdmin`DELETE FROM citation_checks WHERE citation_claimed LIKE ${`${TAG}%`}`;
  await userAdmin`DELETE FROM matter_events WHERE matter_id IN
                  (SELECT id FROM matters WHERE user_id IN (${users}))`;
  await userAdmin`DELETE FROM activation_events WHERE user_id IN (${users})`;
  await userAdmin`DELETE FROM matters WHERE user_id IN (${users})`;
  await userAdmin`DELETE FROM data_requests WHERE auth_id LIKE ${like}`;
  await userAdmin`DELETE FROM training_consent_events WHERE user_id IN (${users})`;
  await userAdmin`DELETE FROM users WHERE auth_id LIKE ${like}`;
  await userAdmin`DELETE FROM auth_user WHERE id LIKE ${like}`;
}

const n = async (q) => (await q)[0].n;
const ledger = (adv) =>
  n(
    userAdmin`SELECT count(*)::int AS n FROM api_idempotency_records WHERE auth_id = ${adv.authId}`,
  );
const openLedger = (adv) =>
  n(userAdmin`SELECT count(*)::int AS n FROM api_idempotency_records
              WHERE auth_id = ${adv.authId} AND completed_at IS NULL`);

async function newMatter(app, adv, title) {
  const res = await call(app, '/matters', adv, { ...matterBody, caseTitle: title });
  const body = await res.json();
  if (res.status !== 201) throw new Error(`fixture matter: ${res.status} ${JSON.stringify(body)}`);
  return body.data.matter.matterId;
}

const matterBody = {
  caseTitle: `${TAG} v. State`,
  court: 'Delhi High Court',
  caseType: 'criminal',
  parties: { petitioner: 'R30', respondent: 'State' },
  clientName: 'R30 Client',
  ourSide: 'accused',
  nextHearingDate: '2026-10-01',
};

function call(app, path, adv, body, key) {
  return app.request(path, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adv.token}`,
      'content-type': 'application/json',
      ...(key === undefined ? {} : { [IDEMPOTENCY_HEADER]: key }),
    },
    body: JSON.stringify(body),
  });
}
const newKey = () => `r30-${randomUUID()}`;

/** Key order is not data: jsonb stores keys sorted, the live response does not. */
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const sameJson = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/**
 * Each route: how to build a valid body (and its mismatched sibling), which
 * durable rows count, and which status a first execution answers.
 * `setup` returns the advocate and any path parameters; `path` renders them.
 */
const ROUTES = [
  {
    name: 'MATTER_KEYED_CREATE',
    status: 201,
    setup: async () => ({ adv: await seedAdvocate('m') }),
    path: () => '/matters',
    body: (i) => ({ ...matterBody, caseTitle: `${TAG} matter ${i}` }),
    count: ({ adv }) =>
      n(userAdmin`SELECT count(*)::int AS n FROM matters WHERE user_id = ${adv.userId}`),
  },
  {
    name: 'EVENT_KEYED_CREATE',
    status: 201,
    setup: async (app) => {
      const adv = await seedAdvocate('e');
      return { adv, matterId: await newMatter(app, adv, `${TAG} events`) };
    },
    path: ({ matterId }) => `/matters/${matterId}/events`,
    body: (i) => ({ eventDate: '2026-09-20', eventType: 'order', notes: `${TAG} event ${i}` }),
    count: ({ matterId }) =>
      n(userAdmin`SELECT count(*)::int AS n FROM matter_events WHERE matter_id = ${matterId}`),
  },
  {
    name: 'ANNOTATION_KEYED_CREATE',
    status: 200,
    setup: async () => ({ adv: await seedAdvocate('a') }),
    path: () => `/judgments/${judgmentId}/annotations`,
    body: (i) => ({
      paragraphNumber: 12,
      paragraphIndex: 11,
      quote: `${TAG} quote ${i}`,
      note: 'n',
    }),
    count: ({ adv }) =>
      n(
        userAdmin`SELECT count(*)::int AS n FROM judgment_annotations WHERE user_id = ${adv.userId}`,
      ),
  },
  {
    /* The S24 row: an IDENTITY-ONLY caller (no profile) asking for deletion.
     * The mismatch sibling is a different kind, because a second request of
     * the same kind is a domain-level 200, not a key question. */
    name: 'DATA_REQUEST_KEYED_CREATE',
    status: 201,
    setup: async () => ({ adv: await seedAdvocate('d', { profile: false }) }),
    path: () => '/me/data-requests',
    body: (i) => ({ kind: ['erasure', 'correction', 'export'][i % 3] }),
    count: ({ adv }) =>
      n(userAdmin`SELECT count(*)::int AS n FROM data_requests WHERE auth_id = ${adv.authId}`),
  },
  {
    name: 'VERIFY_CONFIRM_KEYED_CREATE',
    status: 200,
    setup: async () => ({ adv: await seedAdvocate('v'), stamp: randomUUID().slice(0, 8) }),
    path: () => '/verify/confirm',
    body: (i, ctx) => ({ citationText: `${TAG} ${ctx.stamp} (2019) ${i + 4} SCC 221`, judgmentId }),
    count: ({ stamp }) =>
      n(userAdmin`SELECT count(*)::int AS n FROM citation_checks
                  WHERE citation_claimed LIKE ${`${TAG} ${stamp}%`}`),
  },
  {
    name: 'TRAINING_CONSENT_KEYED_CREATE',
    status: 200,
    setup: async () => ({ adv: await seedAdvocate('t') }),
    path: () => '/me/training-consent',
    body: (i) => ({ version: `training-v${i + 1}` }),
    count: ({ adv }) =>
      n(
        userAdmin`SELECT count(*)::int AS n FROM training_consent_events WHERE user_id = ${adv.userId}`,
      ),
  },
];

// ── the matrix ───────────────────────────────────────────────────────────────
const report = { topology: TOPOLOGY, wiring: WIRING, judgmentId, routes: {}, concurrency: {} };
const failures = [];
const check = (route, label, cond, detail) => {
  const r = (report.routes[route] ??= { checks: {} });
  r.checks[label] = cond ? 'PASS' : `FAIL ${detail ?? ''}`.trim();
  if (!cond) failures.push(`${route} ${label} ${detail ?? ''}`);
};

await cleanup();
const { app, guard } = buildApp();
report.jsonSerializerGuard = guard;
const { app: faultyApp } = buildApp({ fault: true });

try {
  await installFault();

  for (const route of ROUTES) {
    try {
      const ctx = await route.setup(app);
      const path = route.path(ctx);
      const key = newKey();
      const before = await route.count(ctx);

      // FIRST KEYED REQUEST
      const first = await call(app, path, ctx.adv, route.body(0, ctx), key);
      const firstBody = await first.json();
      const afterFirst = await route.count(ctx);
      check(
        route.name,
        'first_status',
        first.status === route.status,
        `${first.status} ${JSON.stringify(firstBody).slice(0, 200)}`,
      );
      check(
        route.name,
        'first_rows_plus_1',
        afterFirst - before === 1,
        `delta=${afterFirst - before}`,
      );
      check(
        route.name,
        'first_ledger_1',
        (await ledger(ctx.adv)) === 1,
        `ledger=${await ledger(ctx.adv)}`,
      );

      // SAME KEY + SAME REQUEST
      const replay = await call(app, path, ctx.adv, route.body(0, ctx), key);
      const replayBody = await replay.json();
      const afterReplay = await route.count(ctx);
      check(route.name, 'replay_status', replay.status === first.status, `${replay.status}`);
      check(
        route.name,
        'replay_same_data',
        sameJson(replayBody.data, firstBody.data),
        `${JSON.stringify(replayBody.data)} vs ${JSON.stringify(firstBody.data)}`.slice(0, 400),
      );
      check(
        route.name,
        'replay_extra_rows_0',
        afterReplay === afterFirst,
        `delta=${afterReplay - afterFirst}`,
      );

      // SAME KEY + DIFFERENT FINGERPRINT
      const clash = await call(app, path, ctx.adv, route.body(1, ctx), key);
      const clashBody = await clash.json();
      const afterClash = await route.count(ctx);
      check(
        route.name,
        'mismatch_409',
        clash.status === 409 && clashBody.error?.code === 'IDEMPOTENCY_KEY_REUSE_MISMATCH',
        `${clash.status} ${clashBody.error?.code}`,
      );
      check(
        route.name,
        'mismatch_extra_rows_0',
        afterClash === afterFirst,
        `delta=${afterClash - afterFirst}`,
      );
      check(route.name, 'ledger_still_1', (await ledger(ctx.adv)) === 1);

      // 5XX EXECUTOR FAILURE, then the retry becomes the executor
      const fctx = await route.setup(app);
      const fpath = route.path(fctx);
      const fkey = newKey();
      const fBefore = await route.count(fctx);
      const failed = await call(faultyApp, fpath, fctx.adv, route.body(0, fctx), fkey);
      check(route.name, 'fault_is_5xx', failed.status >= 500, `${failed.status}`);
      check(route.name, 'fault_rows_0', (await route.count(fctx)) === fBefore);
      check(
        route.name,
        'fault_poison_rows_0',
        (await ledger(fctx.adv)) === 0,
        `ledger=${await ledger(fctx.adv)}`,
      );
      const recovered = await call(app, fpath, fctx.adv, route.body(0, fctx), fkey);
      check(
        route.name,
        'retry_after_fault_executes',
        recovered.status === route.status,
        `${recovered.status}`,
      );
      check(route.name, 'retry_after_fault_rows_plus_1', (await route.count(fctx)) - fBefore === 1);

      // NO KEY — legacy behaviour
      const lctx = await route.setup(app);
      const lpath = route.path(lctx);
      const lBefore = await route.count(lctx);
      const legacy = await call(app, lpath, lctx.adv, route.body(0, lctx));
      check(route.name, 'nokey_status', legacy.status === route.status, `${legacy.status}`);
      check(route.name, 'nokey_rows_plus_1', (await route.count(lctx)) - lBefore === 1);
      check(route.name, 'nokey_ledger_0', (await ledger(lctx.adv)) === 0);

      const r = report.routes[route.name];
      r.verdict = Object.values(r.checks).every((v) => v === 'PASS') ? 'PASS' : 'FAIL';
    } catch (error) {
      check(route.name, 'threw', false, String(error?.message ?? error).slice(0, 300));
      report.routes[route.name].verdict = 'FAIL';
    }
  }

  // ── concurrency: one executor, durable count 1, no orphan ─────────────────
  for (const name of ['EVENT_KEYED_CREATE', 'DATA_REQUEST_KEYED_CREATE']) {
    try {
      const route = ROUTES.find((r) => r.name === name);
      const ctx = await route.setup(app);
      const path = route.path(ctx);
      const key = newKey();
      const before = await route.count(ctx);
      const responses = await Promise.all(
        Array.from({ length: 6 }, () => call(app, path, ctx.adv, route.body(0, ctx), key)),
      );
      const outcomes = await Promise.all(
        responses.map(async (res) => `${res.status}:${(await res.json()).error?.code ?? 'ok'}`),
      );
      const delta = (await route.count(ctx)) - before;
      const ok = outcomes.every(
        (o) => o === `${route.status}:ok` || o === '409:IDEMPOTENCY_IN_PROGRESS',
      );
      const rec = {
        outcomes,
        durableDelta: delta,
        ledgerRows: await ledger(ctx.adv),
        openLedgerRows: await openLedger(ctx.adv),
      };
      rec.verdict =
        ok && delta === 1 && rec.ledgerRows === 1 && rec.openLedgerRows === 0 ? 'PASS' : 'FAIL';
      if (rec.verdict !== 'PASS') failures.push(`${name} concurrency ${JSON.stringify(rec)}`);
      report.concurrency[name] = rec;
    } catch (error) {
      failures.push(`${name} concurrency threw ${error?.message}`);
      report.concurrency[name] = {
        verdict: 'FAIL',
        outcomes: [String(error?.message).slice(0, 200)],
      };
    }
  }
} finally {
  await removeFault().catch((e) => console.error('fault removal failed', e));
  await cleanup().catch((e) => console.error('cleanup failed', e));
  for (const p of openPools) await p.end({ timeout: 5 }).catch(() => {});
  await userAdmin.end();
  await corpusAdmin.end();
}

report.capturedErrors = captured.slice(0, 6);
report.capturedErrorCount = captured.length;
report.failures = failures;
report.verdict = failures.length === 0 ? 'PASS' : 'FAIL';
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `r16-real-route-${TOPOLOGY}-${WIRING}.json`);
writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
for (const [k, v] of Object.entries(report.routes)) console.log(`${k.padEnd(32)} ${v.verdict}`);
for (const [k, v] of Object.entries(report.concurrency))
  console.log(`${`${k} concurrency`.padEnd(32)} ${v.verdict} ${v.outcomes.join(',')}`);
console.log(`errors captured: ${captured.length}`);
if (captured[0]) console.log(JSON.stringify(captured[0], null, 2));
console.log(
  `R16_REAL_ROUTE_${TOPOLOGY.toUpperCase()}_${WIRING.toUpperCase()} = ${report.verdict}  -> ${file}`,
);
process.exit(report.verdict === 'PASS' ? 0 : 1);
