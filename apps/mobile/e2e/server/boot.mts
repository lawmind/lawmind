/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REAL BACKEND, ON A REAL PORT, WITH A CORPUS GENERATION WE CAN MOVE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * RCC R25 Phase B/C require the client half proved against the ACTUAL server
 * rather than against `api/mock.ts`. Every previous R17 claim from this lane was
 * a contract-and-fixture claim — bus 1748 said so in as many words
 * (`R17_WRITE_E2E = PENDING_LCC`) — and a fixture cannot catch the two things
 * that matter here: that the server really sends `409 CORPUS_TARGET_UNAVAILABLE`
 * where we branch on it, and that nothing is written when it does.
 *
 * ── WHY A SEPARATE PROCESS ──────────────────────────────────────────────────
 *
 * The client under test imports `react-native`, so it only runs under the
 * jest-expo transform. The server is plain Node ESM with its own module tree.
 * Loading both into one runtime would mean transforming the server through a
 * React Native preset to prove a statement about HTTP. So the server is spawned,
 * speaks over a socket, and the test drives `src/api/client.ts` unmodified —
 * which is the only configuration in which "the client works against the
 * backend" is a claim about the client at all.
 *
 * ── THE CORPUS SWITCH ───────────────────────────────────────────────────────
 *
 * `services/api/src/matters/authorities-corpus-split.test.ts` established the
 * fixture shape and this reuses it: two disposable databases on the same server,
 * A carrying the judgment and B not, USER role left on the development database
 * where `users`/`matters`/`matter_authorities` live.
 *
 * What is added is that ONE port serves BOTH, choosing per request from a
 * mutable handle. A corpus rollback and its recovery are then the same client,
 * the same base URL, the same saved row and the same `authorityId` — which is
 * exactly the property R17 §1 asserts and exactly what a restart would destroy.
 *
 * NOTHING HERE IS PRODUCTION CODE. It lives under `apps/mobile/e2e/`, ships in
 * no bundle, and the control endpoint exists on a SECOND port whose number the
 * app client is never told.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { serve } from '@hono/node-server';
import postgres, { type Sql } from 'postgres';

import { signAccessToken } from '../../../../packages/auth/src/tokens.ts';
import { createApp } from '../../../../services/api/src/app.ts';

const REPO = resolve(import.meta.dirname, '../../../..');

/** The repo `.env` is the only source of the database URL. No guessed default. */
function databaseUrl(): string {
  const raw = readFileSync(resolve(REPO, '.env'), 'utf8');
  const line = raw.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is not in .env — refusing to guess one');
  return line.slice('DATABASE_URL='.length).trim();
}

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

const CORPUS_A = 'lawmind_e2e_rcc_a';
const CORPUS_B = 'lawmind_e2e_rcc_b';
const SECRET = 'rcc-r25-e2e-secret-not-a-real-key';

/** Exactly the corpus tables these routes read. Same set as LCC's split suite. */
async function buildGeneration(sql: Sql): Promise<void> {
  await sql`CREATE TABLE judgments (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              case_title text NOT NULL,
              neutral_citation text,
              reporter_citations text[] NOT NULL DEFAULT '{}',
              court text NOT NULL,
              judgment_date date NOT NULL,
              overruled_status text NOT NULL DEFAULT 'none',
              overruled_by_judgment_id uuid,
              overruled_paras int[],
              overruled_note text,
              script_quality text,
              script_quality_method text)`;
  await sql`CREATE TABLE judgment_citations (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              cited_judgment_id uuid,
              relationship text,
              treatment_provenance text)`;
}

const base = databaseUrl();
const admin = postgres(withDatabase(base, 'postgres'), { max: 1, onnotice: () => {} });
for (const name of [CORPUS_A, CORPUS_B]) {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE template0`);
}

const genA = postgres(withDatabase(base, CORPUS_A), { max: 4, onnotice: () => {} });
const genB = postgres(withDatabase(base, CORPUS_B), { max: 4, onnotice: () => {} });
await buildGeneration(genA);
await buildGeneration(genB);

/* Chosen here, not by the database: "A has it and B does not" is then a fact
 * about the two generations rather than about two independent inserts. */
const judgmentId = randomUUID();
await genA`INSERT INTO judgments (id, case_title, neutral_citation, court, judgment_date)
           VALUES (${judgmentId}, 'SYNTHETIC — RCC R25 Generation A Only',
                   'RCC 2026 INSC 25', 'Test Court', '2026-01-01')`;

const user = postgres(base, { max: 6, onnotice: () => {} });

const tag = randomUUID().slice(0, 8);

/** An advocate who finished onboarding: `auth_user` + `users`. */
async function seedProfileBacked() {
  const authId = `rcc-e2e-profile-${tag}`;
  const email = `${authId}@example.test`;
  await user`INSERT INTO auth_user (id, name, email, email_verified)
             VALUES (${authId}, 'Adv Profile', ${email}, true)`;
  await user`INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
             VALUES (${authId}, 'Adv Profile',
                     ${`+9199${Math.floor(Math.random() * 100000000)}`},
                     ${email}, 'unverified')`;
  return { authId, email, token: await signAccessToken({ sub: authId, email }, SECRET) };
}

/**
 * `identity_only`: a verified authentication identity and NO `users` row.
 * NEW3 bus 1744's exact classification — an authenticated app account without a
 * LawMind profile, which is not the same thing as "no account".
 */
async function seedIdentityOnly() {
  const authId = `rcc-e2e-identity-${tag}`;
  const email = `${authId}@example.test`;
  await user`INSERT INTO auth_user (id, name, email, email_verified)
             VALUES (${authId}, 'Adv Identity', ${email}, true)`;
  return { authId, email, token: await signAccessToken({ sub: authId, email }, SECRET) };
}

const profileBacked = await seedProfileBacked();
const identityOnly = await seedIdentityOnly();

const [profile] = await user<{ id: string }[]>`
  SELECT id FROM users WHERE auth_id = ${profileBacked.authId}`;
const [matter] = await user<{ id: string }[]>`
  INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                       our_side, status, source)
  VALUES (${profile!.id}, 'State v. RCC R25 E2E Fixture', 'Delhi High Court', 'criminal',
          ${JSON.stringify({ petitioner: 'State', respondent: 'Fixture' })}::jsonb,
          'Fixture', 'accused', 'active', 'manual')
  RETURNING id`;
const matterId = matter!.id;

const build = (corpus: Sql) =>
  createApp({
    ping: async () => {
      await corpus`SELECT 1`;
    },
    search: { sql: corpus, userSql: user, embedQuery: async () => null },
    auth: { auth: null as never, sql: user, secret: SECRET },
  });

const apps = { A: build(genA), B: build(genB) };
let active: 'A' | 'B' = 'A';

const appPort = Number(process.env.RCC_E2E_PORT ?? 4319);
const controlPort = appPort + 1;

const appServer = serve({
  port: appPort,
  hostname: '127.0.0.1',
  fetch: (req: Request) => apps[active].fetch(req),
});

/**
 * The generation switch, on its own port. Not a route on the app: the app under
 * test must have no endpoint a client could reach to change which corpus it is
 * reading, not even one that exists only in this file.
 */
const controlServer = serve({
  port: controlPort,
  hostname: '127.0.0.1',
  fetch: async (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname === '/generation' && req.method === 'POST') {
      const next = url.searchParams.get('active');
      if (next !== 'A' && next !== 'B') return new Response('bad generation', { status: 400 });
      active = next;
      return Response.json({ active });
    }
    if (url.pathname === '/rows' && req.method === 'GET') {
      /* The test's only read of the user database. "Nothing was written" is not
       * observable through the API the client has: the absence of a row has no
       * response shape. */
      const [count] = await user<{ count: string }[]>`
        SELECT count(*)::text AS count FROM matter_authorities WHERE matter_id = ${matterId}`;
      const live = await user<{ authorityId: string; judgmentId: string }[]>`
        SELECT id AS "authorityId", judgment_id AS "judgmentId" FROM matter_authorities
        WHERE matter_id = ${matterId} AND removed_at IS NULL ORDER BY added_at`;
      return Response.json({ total: Number(count!.count), live });
    }
    if (url.pathname === '/data-requests' && req.method === 'GET') {
      const authId = url.searchParams.get('authId')!;
      const rows = await user`
        SELECT id, auth_id AS "authId", user_id AS "userId", kind, status
        FROM data_requests WHERE auth_id = ${authId}`;
      return Response.json({ rows });
    }
    if (url.pathname === '/profile-rows' && req.method === 'GET') {
      const authId = url.searchParams.get('authId')!;
      const [row] = await user<{ count: string }[]>`
        SELECT count(*)::text AS count FROM users WHERE auth_id = ${authId}`;
      return Response.json({ count: Number(row!.count) });
    }
    if (url.pathname === '/shutdown' && req.method === 'POST') {
      /**
       * TIDY UP FIRST, THEN ANSWER.
       *
       * This used to answer immediately and tear down on a microtask, and jest
       * then exited — taking the child with it, on Windows, part-way through.
       * The `data_requests` deletes had run and the `users`/`matters` ones had
       * not, so the development database accumulated a fixture advocate and a
       * fixture matter per run and nothing said so. Blocking here makes
       * `globalTeardown` wait for the work it asked for.
       */
      const residue = await teardown();
      return Response.json(residue, { status: residue.errors.length === 0 ? 200 : 500 });
    }
    return new Response('not found', { status: 404 });
  },
});

/**
 * Undo everything this process created, and REPORT what would not go.
 *
 * The fixture advocates, the matter and the saved authority are real rows in the
 * DEVELOPMENT database, so a swallowed error here is a row that stays forever
 * and a suite that slowly stops describing a clean database. Every statement's
 * failure is collected and handed back to `globalTeardown` instead.
 *
 * ORDER IS THE FOREIGN KEYS, IN REVERSE: `matter_authorities` before `matters`,
 * `matters` before `users` (`matters_user_id_users_id_fk`), and `users` before
 * `auth_user`.
 */
let teardownStarted = false;
async function teardown(): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  if (teardownStarted) return { errors };
  teardownStarted = true;

  const attempt = async (what: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      errors.push(`${what}: ${(error as Error).message}`);
    }
  };

  await attempt(
    'matter_authorities',
    () => user`DELETE FROM matter_authorities WHERE matter_id = ${matterId}`,
  );
  await attempt('matters', () => user`DELETE FROM matters WHERE id = ${matterId}`);
  for (const a of [profileBacked, identityOnly]) {
    await attempt(
      `data_requests ${a.authId}`,
      () => user`DELETE FROM data_requests WHERE auth_id = ${a.authId}`,
    );
    await attempt(
      `api_idempotency_records ${a.authId}`,
      () => user`DELETE FROM api_idempotency_records WHERE auth_id = ${a.authId}`,
    );
    await attempt(`users ${a.authId}`, () => user`DELETE FROM users WHERE auth_id = ${a.authId}`);
    await attempt(
      `auth_user ${a.authId}`,
      () => user`DELETE FROM auth_user WHERE id = ${a.authId}`,
    );
  }

  /* A residue check of our own making, so "clean" is observed rather than assumed. */
  await attempt('residue check', async () => {
    const [left] = await user<{ n: string }[]>`
      SELECT (
        (SELECT count(*) FROM auth_user WHERE id LIKE 'rcc-e2e-%') +
        (SELECT count(*) FROM users WHERE auth_id LIKE 'rcc-e2e-%') +
        (SELECT count(*) FROM matters WHERE id = ${matterId})
      )::text AS n`;
    if (left!.n !== '0') errors.push(`residue: ${left!.n} fixture rows remain`);
  });

  await Promise.all([genA.end(), genB.end(), user.end()]).catch(() => {});
  await attempt('drop A', () => admin.unsafe(`DROP DATABASE IF EXISTS ${CORPUS_A} WITH (FORCE)`));
  await attempt('drop B', () => admin.unsafe(`DROP DATABASE IF EXISTS ${CORPUS_B} WITH (FORCE)`));
  await admin.end().catch(() => {});

  appServer.close();
  controlServer.close();
  /* Let the shutdown response flush before the process goes. */
  setTimeout(() => process.exit(errors.length === 0 ? 0 : 1), 250).unref();
  return { errors };
}

process.on('SIGTERM', () => void teardown());
process.on('SIGINT', () => void teardown());

/** The handshake. One line, parsed by `globalSetup`. */
console.log(
  `RCC_E2E_READY ${JSON.stringify({
    baseUrl: `http://127.0.0.1:${appPort}`,
    controlUrl: `http://127.0.0.1:${controlPort}`,
    matterId,
    judgmentId,
    absentJudgmentId: randomUUID(),
    profileBacked,
    identityOnly,
  })}`,
);
