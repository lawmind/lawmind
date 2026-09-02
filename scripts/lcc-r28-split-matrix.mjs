#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WHOLE CURRENT-V1 AUTHENTICATED WORKFLOW, ACROSS TWO DATABASES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Round brief §10. `lcc-split-api-smoke.mjs` drove three requests — health and
 * two 401s — and that was enough to prove the process boots. It is not enough to
 * prove the product works, and the difference is the entire round: a user route
 * reading `matters` through the corpus handle answers 401 to an unauthenticated
 * caller exactly as correctly as a right one does.
 *
 * So this signs a real token, and drives the real Hono app through real HTTP
 * handlers, over the whole current-v1 user graph. A route that queries the wrong
 * database now has nowhere to hide: `lcc-r28-split-env.mjs` has removed the
 * tables that would have covered for it, so the failure is
 * `relation "matters" does not exist` and it is loud.
 *
 * ── WHAT COUNTS AS A PASS ───────────────────────────────────────────────────
 *
 * The expectation per route is the STATUS the route should answer, and a `500`
 * is never one of them. `WRONG_ROLE` is recorded separately from `FAIL`: a
 * response whose body names a missing relation is a role-routing defect, and a
 * 4xx where a 2xx was expected is an ordinary one. Keeping them apart is what
 * makes the count in the final report mean something.
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
const OUT = resolve(flag('out') ?? './docs/ai/lcc-r28');
const BIN = flag('pgbin') ?? process.env['LAWMIND_PGBIN'] ?? 'C:/lawmind/pgsql/pgsql/bin';
const KEEP = args.includes('--keep');
const SECRET = 'r28-split-matrix-secret-not-used-anywhere-real-0123456789';

const base = process.env['DATABASE_URL'];
if (!base) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const results = [];
const log = (s) => console.log(s);

/** A judgment that generation A carries and generation B does not. */
const ABSENT_TARGET = '4d1a0000-0000-4000-8000-00000000dead';

/** A string only Alice's correction request can contain, so §11 can look for it. */
const R28_CORRECTION_NOTE = 'r28-correction-fixture-only-alice';

/**
 * A missing relation, told apart from an ordinary refusal.
 *
 * PostgreSQL answers `42P01 relation "x" does not exist`, and the API's error
 * envelope deliberately does NOT put that on the wire — a 500 body says nothing
 * about the database, which is right for production and useless here.
 *
 * So the error is taken from the object rather than from any rendering of it:
 * `app.onError` hands the thrown `PostgresError` to `logger.error`, and that
 * method is wrapped for the duration of each request. Two earlier attempts read
 * the response body and then `process.stdout`, and both reported
 * `wrongRole: 0` beside fifteen failures that were every one of them a missing
 * relation — the body never carries it, and pino binds its destination at
 * construction so a later `process.stdout.write` patch never sees the line.
 */
const captured = [];
const realError = logger.error.bind(logger);
logger.error = (...args) => {
  const err = args[0]?.err;
  if (err) captured.push({ code: err.code, message: String(err.message ?? '') });
  return realError(...args);
};

/** The relation a request failed on, or null. Empties the buffer as it reads. */
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

async function main() {
  mkdirSync(OUT, { recursive: true });
  log('R28 split matrix\n');

  await buildSplitEnvironment({ base, bin: BIN, log });
  const negative = await applyNegativeSchema({ base, log });

  const corpusUrl = withDatabase(base, CORPUS_SPLIT_TEST_DB);
  const userUrl = withDatabase(base, USER_SPLIT_TEST_DB);

  // §9 — strict split mode, resolved through the real resolver.
  const resolved = resolveDatabases({
    CORPUS_DATABASE_URL: corpusUrl,
    USER_DATABASE_URL: userUrl,
    DB_SPLIT_MODE: 'split',
  });
  if (resolved.mode !== 'split') throw new Error('the resolver did not report split mode');

  const corpusSql = postgres(corpusUrl, { max: 4, onnotice: () => {} });
  const userSql = postgres(userUrl, { max: 4, onnotice: () => {} });

  const verdict = await verifyDistinctDatabases(corpusSql, userSql);
  if (!verdict.distinct) throw new Error('the two roles resolved to one database');
  log(
    `  identity: corpus="${verdict.corpus.database}" user="${verdict.user.database}" ` +
      `sameCluster=${verdict.sameCluster}`,
  );

  // ── corpus fixture ────────────────────────────────────────────────────────
  const judgmentId = randomUUID();
  const overruledId = randomUUID();
  await corpusSql`
    INSERT INTO judgments (id, case_title, neutral_citation, reporter_citations, court,
                           judgment_date, language, source_url, full_text)
    VALUES (${overruledId}, 'SYNTHETIC — Displacing Judgment', 'FIX 2026 INSC 2', '{}',
            'Supreme Court of India', '2026-02-01', 'en', ${`r28://${overruledId}`},
            'synthetic displacing judgment text for the r28 split matrix')`;
  await corpusSql`
    INSERT INTO judgments (id, case_title, neutral_citation, reporter_citations, court,
                           judgment_date, language, source_url, full_text)
    VALUES (${judgmentId}, 'SYNTHETIC — R28 Split Matrix Target', 'FIX 2026 INSC 1', '{}',
            'Supreme Court of India', '2026-01-01', 'en', ${`r28://${judgmentId}`},
            'synthetic judgment text for the r28 split matrix, mentioning bail and custody')`;
  log(`  corpus fixture: 2 judgments`);

  // ── the advocate ──────────────────────────────────────────────────────────
  async function seedAdvocate(tag) {
    const authId = `r28-${tag}-${randomUUID()}`;
    const email = `${authId}@example.test`;
    await userSql`INSERT INTO auth_user (id, name, email, email_verified)
                  VALUES (${authId}, 'Adv', ${email}, true)`;
    await userSql`INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
                  VALUES (${authId}, ${`Adv ${tag}`},
                          ${`+9199${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`},
                          ${email}, 'unverified')`;
    return { authId, email, token: await signAccessToken({ sub: authId, email }, SECRET) };
  }
  const alice = await seedAdvocate('alice');
  const bob = await seedAdvocate('bob');
  log(`  seeded two advocates`);

  // ── the real app, in strict split mode ────────────────────────────────────
  const app = createApp({
    ping: async () => {
      await corpusSql`SELECT 1`;
    },
    search: { sql: corpusSql, userSql, embedQuery: async () => null },
    auth: { auth: null, sql: userSql, secret: SECRET },
  });

  const H = (t, json = true) => ({
    authorization: `Bearer ${t}`,
    ...(json ? { 'content-type': 'application/json' } : {}),
  });

  /**
   * One route, driven and judged.
   *
   * `expect` is a list of acceptable statuses. `assert` is the optional second
   * half: a status alone cannot tell a working route from one that swallowed its
   * own error and answered `200 []`, and the routes that own data are exactly
   * the ones where that distinction is the whole question.
   */
  async function drive(name, method, path, { token, body, expect, assert: check, phase } = {}) {
    let status = 0;
    let text;
    let parsed = null;
    takeMissingRelation();
    try {
      const res = await app.request(path, {
        method: method ?? 'GET',
        ...(token ? { headers: H(token, body !== undefined) } : {}),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      status = res.status;
      text = await res.text();
      try {
        parsed = JSON.parse(text);
      } catch {
        /* not JSON; `text` is what the verdict reads */
      }
    } catch (err) {
      text = String(err?.stack ?? err);
    }
    const relation = takeMissingRelation();
    const wrongRole = relation !== null;
    const statusOk = expect.includes(status);
    let assertOk = true;
    let assertNote = null;
    if (statusOk && check) {
      try {
        const r = check(parsed, status);
        if (r !== true && r !== undefined) {
          assertOk = false;
          assertNote = typeof r === 'string' ? r : 'assertion returned false';
        }
      } catch (err) {
        assertOk = false;
        assertNote = String(err?.message ?? err);
      }
    }
    const verdict = wrongRole ? 'WRONG_ROLE' : statusOk && assertOk ? 'PASS' : 'FAIL';
    results.push({
      phase: phase ?? 'matrix',
      name,
      method: method ?? 'GET',
      path,
      status,
      expect,
      verdict,
      ...(relation ? { missingRelation: relation } : {}),
      ...(assertNote ? { assertNote } : {}),
      ...(verdict === 'PASS' ? {} : { body: text.slice(0, 400) }),
    });
    const mark = verdict === 'PASS' ? 'PASS      ' : verdict === 'WRONG_ROLE' ? 'WRONG_ROLE' : 'FAIL      ';
    console.log(
      `  ${mark} ${(method ?? 'GET').padEnd(6)} ${path} -> ${status}` +
        (relation ? `   [missing relation: ${relation}]` : ''),
    );
    return parsed;
  }

  const D = (o) => o?.data ?? {};

  // ── AUTH / PROFILE ────────────────────────────────────────────────────────
  await drive('health', 'GET', '/health', { expect: [200], phase: 'boot' });
  await drive('version', 'GET', '/version', { expect: [200], phase: 'boot' });
  await drive('capabilities', 'GET', '/release/capabilities', { expect: [200], phase: 'boot' });
  await drive('unauthenticated matters refuses', 'GET', '/matters', {
    expect: [401],
    phase: 'auth',
  });
  await drive('GET /me', 'GET', '/me', {
    token: alice.token,
    expect: [200],
    phase: 'auth',
    assert: (b) => (D(b).user?.email === alice.email ? true : 'GET /me did not return the caller'),
  });
  await drive('PATCH /me', 'PATCH', '/me', {
    token: alice.token,
    body: { fullName: 'Alice Advocate' },
    expect: [200],
    phase: 'auth',
  });
  await drive('GET /terms/current', 'GET', '/terms/current', { expect: [200], phase: 'auth' });
  await drive('POST /me/accept-terms', 'POST', '/me/accept-terms', {
    token: alice.token,
    body: { version: 'v1' },
    expect: [200, 400, 409],
    phase: 'auth',
  });

  // ── MATTER ────────────────────────────────────────────────────────────────
  const created = await drive('POST /matters', 'POST', '/matters', {
    token: alice.token,
    body: {
      caseTitle: 'State v. R28 Split',
      court: 'Delhi High Court',
      caseType: 'criminal',
      parties: { petitioner: 'State', respondent: 'R28' },
      clientName: 'R28 Fixture',
      ourSide: 'accused',
    },
    expect: [201],
    phase: 'matter',
    assert: (b) => (D(b).matter?.matterId ? true : 'no matter id returned'),
  });
  const matterId = D(created).matter?.matterId;
  await drive('GET /matters', 'GET', '/matters', {
    token: alice.token,
    expect: [200],
    phase: 'matter',
    assert: (b) =>
      Array.isArray(D(b).matters) && D(b).matters.some((m) => m.matterId === matterId)
        ? true
        : 'the matter just created is not in the list',
  });
  if (matterId) {
    await drive('GET /matters/:id', 'GET', `/matters/${matterId}`, {
      token: alice.token,
      expect: [200],
      phase: 'matter',
      assert: (b) =>
        D(b).matter?.matterId === matterId ? true : 'detail returned a different matter',
    });
    await drive('PATCH /matters/:id', 'PATCH', `/matters/${matterId}`, {
      token: alice.token,
      body: { status: 'active' },
      expect: [200],
      phase: 'matter',
    });
  }

  // ── AUTHORITY (the cross-role read and the R17 write) ─────────────────────
  if (matterId) {
    await drive('POST authority — target present', 'POST', `/matters/${matterId}/authorities`, {
      token: alice.token,
      body: { judgmentId },
      expect: [201],
      phase: 'authority',
      assert: (b) => (D(b).authority?.authorityId ? true : 'no authorityId returned'),
    });
    await drive('GET authorities — hydrated from corpus', 'GET', `/matters/${matterId}/authorities`, {
      token: alice.token,
      expect: [200],
      phase: 'authority',
      assert: (b) => {
        const a = D(b).authorities ?? [];
        if (!a.some((x) => x.judgmentId === judgmentId)) return 'the saved authority is missing';
        const hit = a.find((x) => x.judgmentId === judgmentId);
        if (!hit.caseTitle) return 'the corpus title did not hydrate across the split';
        if (!Array.isArray(D(b).unavailableAuthorities))
          return 'unavailableAuthorities must always be sent';
        return true;
      },
    });
    await drive('POST authority — target absent from corpus', 'POST', `/matters/${matterId}/authorities`, {
      token: alice.token,
      body: { judgmentId: ABSENT_TARGET },
      expect: [409],
      phase: 'authority',
      assert: (b) =>
        b?.error?.code === 'CORPUS_TARGET_UNAVAILABLE'
          ? /no judgment/i.test(b.error.message ?? '')
            ? 'the R17-forbidden sentence is still on the wire'
            : true
          : `expected CORPUS_TARGET_UNAVAILABLE, got ${b?.error?.code}`,
    });
    await drive('GET matter detail with authorities', 'GET', `/matters/${matterId}`, {
      token: alice.token,
      expect: [200],
      phase: 'authority',
    });
  }

  // ── EVENTS ────────────────────────────────────────────────────────────────
  if (matterId) {
    await drive('POST /matters/:id/events', 'POST', `/matters/${matterId}/events`, {
      token: alice.token,
      body: { eventDate: '2026-09-02', eventType: 'note', notes: 'R28 split event' },
      expect: [201],
      phase: 'events',
    });
    await drive('GET matter detail shows the event', 'GET', `/matters/${matterId}`, {
      token: alice.token,
      expect: [200],
      phase: 'events',
      assert: (b) =>
        (D(b).events ?? D(b).matter?.events ?? []).length > 0
          ? true
          : 'the event just created did not read back',
    });
  }

  // ── SHARES ────────────────────────────────────────────────────────────────
  if (matterId) {
    await drive('GET shares', 'GET', `/matters/${matterId}/shares`, {
      token: alice.token,
      expect: [200],
      phase: 'shares',
    });
    await drive('POST share', 'POST', `/matters/${matterId}/shares`, {
      token: alice.token,
      body: { identifier: 'MAH/1234/2019' },
      expect: [201, 200],
      phase: 'shares',
    });
  }

  // ── ANNOTATIONS ───────────────────────────────────────────────────────────
  await drive('GET annotations', 'GET', `/judgments/${judgmentId}/annotations`, {
    token: alice.token,
    expect: [200],
    phase: 'annotations',
  });
  await drive('POST annotation', 'POST', `/judgments/${judgmentId}/annotations`, {
    token: alice.token,
    body: { paragraphNumber: 1, paragraphIndex: 0, quote: 'bail and custody', note: 'R28' },
    expect: [201, 200],
    phase: 'annotations',
  });
  await drive('GET annotations after create', 'GET', `/judgments/${judgmentId}/annotations`, {
    token: alice.token,
    expect: [200],
    phase: 'annotations',
    assert: (b) => ((D(b).annotations ?? []).length > 0 ? true : 'the annotation did not read back'),
  });

  // ── SEARCH, JUDGMENT READS AND VERIFICATION ───────────────────────────────
  await drive('POST /search', 'POST', '/search', {
    token: alice.token,
    body: { query: 'bail custody', language: 'en', limit: 5 },
    expect: [200, 503],
    phase: 'search',
  });
  await drive('GET judgment', 'GET', `/judgments/${judgmentId}`, {
    token: alice.token,
    expect: [200],
    phase: 'search',
    /* The reading view returns the judgment at the TOP level of `data`, not
     * under a `judgment` key. Asserting on the wrong shape made this read as a
     * failure when the route was already right. */
    assert: (b) =>
      D(b).judgmentId === judgmentId ? true : 'the reading view did not return the judgment',
  });
  await drive('GET judgment treatment', 'GET', `/judgments/${judgmentId}/treatment`, {
    token: alice.token,
    expect: [200],
    phase: 'search',
  });
  await drive('GET judgment graph', 'GET', `/judgments/${judgmentId}/graph`, {
    token: alice.token,
    expect: [200],
    phase: 'search',
  });
  await drive('GET judgment authorities as-at', 'GET', `/judgments/${judgmentId}/authorities`, {
    token: alice.token,
    expect: [200],
    phase: 'search',
  });
  await drive('POST /verify/confirm', 'POST', '/verify/confirm', {
    token: alice.token,
    body: { judgmentId, citationText: 'FIX 2026 INSC 1' },
    expect: [200, 201],
    phase: 'verification',
  });
  await drive('POST /citations/copies', 'POST', '/citations/copies', {
    token: alice.token,
    body: { judgmentId, surface: 'search', clientKey: `r28-${randomUUID()}` },
    expect: [200, 201],
    phase: 'verification',
  });
  await drive('POST /verify/ecourts', 'POST', '/verify/ecourts', {
    token: alice.token,
    body: { judgmentId, citationText: 'FIX 2026 INSC 1' },
    expect: [200, 201],
    phase: 'verification',
  });

  // ── SAVED SEARCHES ────────────────────────────────────────────────────────
  await drive('GET /saved-searches', 'GET', '/saved-searches', {
    token: alice.token,
    expect: [200],
    phase: 'saved-searches',
  });

  // ── ALERTS ────────────────────────────────────────────────────────────────
  await drive('GET /alerts', 'GET', '/alerts', {
    token: alice.token,
    expect: [200],
    phase: 'alerts',
    assert: (b) => (Array.isArray(D(b).alerts) ? true : 'alerts[] missing'),
  });
  await drive('GET /me/alert-settings', 'GET', '/me/alert-settings', {
    token: alice.token,
    expect: [200],
    phase: 'alerts',
  });
  await drive('PATCH /me/alert-settings', 'PATCH', '/me/alert-settings', {
    token: alice.token,
    body: { savedAuthorityMoved: true },
    expect: [200],
    phase: 'alerts',
  });

  // ── TRAINING CONSENT ──────────────────────────────────────────────────────
  await drive('GET /me/training-consent', 'GET', '/me/training-consent', {
    token: alice.token,
    expect: [200],
    phase: 'training-consent',
  });
  await drive('POST /me/training-consent', 'POST', '/me/training-consent', {
    token: alice.token,
    body: { version: 'training-v1' },
    expect: [200, 201],
    phase: 'training-consent',
  });
  await drive('DELETE /me/training-consent', 'DELETE', '/me/training-consent', {
    token: alice.token,
    expect: [200, 204],
    phase: 'training-consent',
  });

  // ── DATA REQUESTS AND ERASURE ─────────────────────────────────────────────
  await drive('POST correction request', 'POST', '/me/data-requests', {
    token: alice.token,
    body: { kind: 'correction', note: R28_CORRECTION_NOTE },
    expect: [201, 200],
    phase: 'data-requests',
  });
  await drive('GET own data requests', 'GET', '/me/data-requests', {
    token: alice.token,
    expect: [200],
    phase: 'data-requests',
    assert: (b) =>
      (D(b).requests ?? D(b).dataRequests ?? []).length > 0 ? true : 'the request did not read back',
  });
  /* §10 — the identity-only population: an authenticated principal with NO
   * profile row. R26 made this reachable; the split must not close it again. */
  const identityOnlyAuthId = `r28-identity-${randomUUID()}`;
  const identityOnlyEmail = `${identityOnlyAuthId}@example.test`;
  await userSql`INSERT INTO auth_user (id, name, email, email_verified)
                VALUES (${identityOnlyAuthId}, 'No Profile', ${identityOnlyEmail}, true)`;
  const identityOnlyToken = await signAccessToken(
    { sub: identityOnlyAuthId, email: identityOnlyEmail },
    SECRET,
  );
  await drive('identity_only erasure request', 'POST', '/me/data-requests', {
    token: identityOnlyToken,
    body: { kind: 'erasure' },
    expect: [201, 200],
    phase: 'data-requests',
  });
  await drive('identity_only reads its own request', 'GET', '/me/data-requests', {
    token: identityOnlyToken,
    expect: [200],
    phase: 'data-requests',
    assert: (b) =>
      (D(b).requests ?? D(b).dataRequests ?? []).length > 0
        ? true
        : 'an identity-only account cannot see the request it just made',
  });
  await drive('profile-backed erasure request', 'POST', '/me/data-requests', {
    token: bob.token,
    body: { kind: 'erasure' },
    expect: [201, 200],
    phase: 'data-requests',
  });

  // ── IDEMPOTENCY ───────────────────────────────────────────────────────────
  const idemKey = `r28-${randomUUID()}`;
  const idemBody = {
    caseTitle: 'State v. Idempotent',
    court: 'Delhi High Court',
    caseType: 'criminal',
    parties: { petitioner: 'State', respondent: 'Idem' },
    clientName: 'Idem',
    ourSide: 'accused',
  };
  const idemOnce = await app.request('/matters', {
    method: 'POST',
    headers: { ...H(alice.token), 'idempotency-key': idemKey },
    body: JSON.stringify(idemBody),
  });
  const idemOnceBody = await idemOnce.json().catch(() => null);
  const idemTwice = await app.request('/matters', {
    method: 'POST',
    headers: { ...H(alice.token), 'idempotency-key': idemKey },
    body: JSON.stringify(idemBody),
  });
  const idemTwiceBody = await idemTwice.json().catch(() => null);
  const replayed = idemOnceBody?.data?.matter?.id === idemTwiceBody?.data?.matter?.id;
  results.push({
    phase: 'idempotency',
    name: 'same key replays rather than creating twice',
    method: 'POST',
    path: '/matters',
    status: idemTwice.status,
    expect: [200, 201],
    verdict: idemOnce.status === 201 && replayed ? 'PASS' : 'FAIL',
    ...(replayed ? {} : { body: JSON.stringify(idemTwiceBody).slice(0, 400) }),
  });
  console.log(`  ${idemOnce.status === 201 && replayed ? 'PASS      ' : 'FAIL      '} POST   /matters (idempotency replay) -> ${idemTwice.status}`);

  const idemMismatch = await app.request('/matters', {
    method: 'POST',
    headers: { ...H(alice.token), 'idempotency-key': idemKey },
    body: JSON.stringify({ ...idemBody, caseTitle: 'State v. Different' }),
  });
  results.push({
    phase: 'idempotency',
    name: 'different fingerprint under the same key is refused',
    method: 'POST',
    path: '/matters',
    status: idemMismatch.status,
    expect: [409, 422],
    verdict: [409, 422].includes(idemMismatch.status) ? 'PASS' : 'FAIL',
  });
  console.log(`  ${[409, 422].includes(idemMismatch.status) ? 'PASS      ' : 'FAIL      '} POST   /matters (idempotency mismatch) -> ${idemMismatch.status}`);

  // ── DOCUMENTS, ENTITLEMENTS, PREMIUM, BRIEFINGS, CORPUS, STATUTES ─────────
  await drive('GET /documents/types', 'GET', '/documents/types', { expect: [200], phase: 'documents' });
  await drive('GET /documents', 'GET', '/documents', {
    token: alice.token,
    expect: [200],
    phase: 'documents',
    assert: (b) => (Array.isArray(D(b).documents) ? true : 'documents[] missing'),
  });
  await drive('GET /me/entitlements', 'GET', '/me/entitlements', {
    token: alice.token,
    /* Premium surfaces default OFF, so `404 NOT_ENABLED` is this server's correct
     * answer and not a split defect. The role question is still asked: a wrong
     * handle would throw before the gate ever refused. */
    expect: [200, 404],
    phase: 'entitlements',
    assert: (b, s) =>
      s === 404 && b?.error?.code !== 'NOT_ENABLED' ? `unexpected 404: ${b?.error?.code}` : true,
  });
  if (matterId) {
    await drive('GET premium preview', 'GET', `/matters/${matterId}/premium-preview`, {
      token: alice.token,
      expect: [200, 402, 403, 404],
      phase: 'premium',
    });
    await drive('GET matter briefings', 'GET', `/matters/${matterId}/briefings`, {
      token: alice.token,
      expect: [200],
      phase: 'briefings',
    });
  }
  await drive('GET /corpus/coverage', 'GET', '/corpus/coverage', { expect: [200], phase: 'corpus' });
  await drive('GET /corpus/freshness', 'GET', '/corpus/freshness', { expect: [200], phase: 'corpus' });
  await drive('GET /statutes', 'GET', '/statutes', { expect: [200], phase: 'corpus' });

  // ── §11 TENANT ISOLATION ──────────────────────────────────────────────────
  //
  // The split separated authorization from corpus hydration. These prove it did
  // not separate them in the direction that grants access: every one of Bob's
  // requests is for Alice's row, with Bob's own valid token.
  if (matterId) {
    await drive('B cannot read A matter', 'GET', `/matters/${matterId}`, {
      token: bob.token,
      expect: [403, 404],
      phase: 'tenant-isolation',
    });
    await drive('B cannot patch A matter', 'PATCH', `/matters/${matterId}`, {
      token: bob.token,
      body: { status: 'archived' },
      expect: [403, 404],
      phase: 'tenant-isolation',
    });
    await drive('B cannot read A authorities', 'GET', `/matters/${matterId}/authorities`, {
      token: bob.token,
      expect: [403, 404],
      phase: 'tenant-isolation',
    });
    await drive('B cannot save into A matter', 'POST', `/matters/${matterId}/authorities`, {
      token: bob.token,
      body: { judgmentId },
      expect: [403, 404],
      phase: 'tenant-isolation',
    });
    await drive('B cannot add an event to A matter', 'POST', `/matters/${matterId}/events`, {
      token: bob.token,
      body: { eventDate: '2026-09-02', eventType: 'note', notes: 'intrusion' },
      expect: [403, 404],
      phase: 'tenant-isolation',
    });
    await drive('B cannot read A briefings', 'GET', `/matters/${matterId}/briefings`, {
      token: bob.token,
      expect: [403, 404],
      phase: 'tenant-isolation',
    });
  }
  await drive("B's matter list does not contain A's matter", 'GET', '/matters', {
    token: bob.token,
    expect: [200],
    phase: 'tenant-isolation',
    assert: (b) =>
      (D(b).matters ?? []).every((m) => m.matterId !== matterId)
        ? true
        : "B's matter list contains A's matter",
  });
  await drive("B's data requests do not contain A's", 'GET', '/me/data-requests', {
    token: bob.token,
    expect: [200],
    phase: 'tenant-isolation',
    assert: (b) =>
      (D(b).requests ?? D(b).dataRequests ?? []).every((r) =>
        !new RegExp(R28_CORRECTION_NOTE).test(JSON.stringify(r)),
      )
        ? true
        : "B can see A's data request",
  });
  await drive('B cannot reach an admin surface', 'GET', '/admin/users', {
    token: bob.token,
    expect: [401, 403],
    phase: 'tenant-isolation',
  });

  // ── §13 ROLE SENTINELS — prove the negative controls are real ─────────────
  //
  // Everything above is only evidence if a wrong-role query would actually have
  // failed. These issue two deliberately impossible ones and require them to
  // throw. A green matrix over two databases that quietly held each other's
  // tables would look identical to this one without them.
  const sentinels = [];
  for (const [name, sql, statement] of [
    ['user table through the CORPUS role', corpusSql, 'SELECT count(*) FROM matters'],
    ['corpus table through the USER role', userSql, 'SELECT count(*) FROM judgments'],
  ]) {
    let threw = null;
    try {
      await sql.unsafe(statement);
    } catch (err) {
      threw = String(err?.message ?? err);
    }
    const ok = threw !== null && /does not exist/i.test(threw);
    sentinels.push({ name, statement, refused: ok, error: threw });
    console.log(`  ${ok ? 'PASS      ' : 'FAIL      '} sentinel: ${name}`);
    results.push({
      phase: 'role-sentinel',
      name: `sentinel — ${name}`,
      method: 'SQL',
      path: statement,
      status: ok ? 0 : -1,
      expect: [0],
      verdict: ok ? 'PASS' : 'FAIL',
      ...(ok ? {} : { body: String(threw) }),
    });
  }

  // ── report ────────────────────────────────────────────────────────────────
  const counts = {
    total: results.length,
    pass: results.filter((r) => r.verdict === 'PASS').length,
    fail: results.filter((r) => r.verdict === 'FAIL').length,
    wrongRole: results.filter((r) => r.verdict === 'WRONG_ROLE').length,
  };
  const pass = counts.fail === 0 && counts.wrongRole === 0;

  writeFileSync(
    join(OUT, 'split-route-matrix.json'),
    `${JSON.stringify(
      {
        kind: 'lawmind-r28-split-route-matrix',
        note:
          'The real Hono app driven over two physically distinct databases, each stripped of ' +
          'the other role’s tables so a wrong-role query cannot succeed by accident.',
        strictSplitMode: true,
        corpusDatabase: verdict.corpus.database,
        userDatabase: verdict.user.database,
        physicallyDistinct: verdict.distinct,
        sameCluster: verdict.sameCluster,
        negativeSchema: negative,
        sentinels,
        counts,
        results,
        verdict: pass ? 'SPLIT_ROUTE_MATRIX_PASS' : 'SPLIT_ROUTE_MATRIX_FAIL',
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `\n  ${counts.pass}/${counts.total} pass · ${counts.fail} fail · ${counts.wrongRole} wrong-role`,
  );
  console.log(pass ? '\nSPLIT_ROUTE_MATRIX_PASS' : '\nSPLIT_ROUTE_MATRIX_FAIL');

  await corpusSql.end();
  await userSql.end();
  if (!pass) process.exitCode = 1;
}

try {
  await main();
} finally {
  if (!KEEP) await dropSplitEnvironment(base);
}
