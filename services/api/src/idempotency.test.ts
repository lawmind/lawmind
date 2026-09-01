/**
 * R16 conformance — the thirteen situations, and all six routes.
 *
 * `docs/product/RCC_V1_API_CONTRACT_R16_AMENDMENT.md` §5 is an outcome table, so
 * this file is written as one: every row of it is a named test, and the two rows
 * that cannot be reached through a real route (a handler that dies before its
 * mutation is durable, and a response that is thrown away after the transaction
 * committed) are driven through a probe app that wraps a REAL domain write with
 * the real wrapper rather than through a mock of either.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WOULD MAKE THIS SUITE WORTHLESS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Asserting the RESPONSE and not the ROW. Every replay assertion here counts the
 * durable domain rows as well, because "the second call returned the same JSON"
 * is exactly what a broken implementation that inserted twice and returned the
 * newer row would also print. The bug being prevented is a second permanent
 * record, so a second permanent record is what gets counted.
 *
 * Two more traps, both avoided deliberately:
 *
 *   * A concurrency test whose two requests do not actually overlap proves
 *     nothing. `B` holds the executor open with a real slow domain write and
 *     asserts that exactly one row exists afterwards, not merely that both
 *     callers got a 2xx.
 *   * A mismatch test that changes the body in a way that ALSO changes what the
 *     handler would do cannot tell key-reuse detection from ordinary domain
 *     behaviour. `C` changes one free-text field, which the domain layer is
 *     entirely happy with.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { signAccessToken } from '@lawmind/auth';
import { Hono } from 'hono';
import postgres from 'postgres';

import { createApp } from './app.ts';
import { ok } from './envelope.ts';
import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_WAIT_BUDGET_MS,
  requestFingerprint,
  withIdempotency,
} from './idempotency.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 6, onnotice: () => {} });
const SECRET = 'test-secret-not-used-anywhere-real-0123456789';

const app = createApp({
  ping: async () => {},
  search: { sql, embedQuery: async () => null },
  auth: { auth: null as never, sql, secret: SECRET },
});

/** Distinctive, so anything this suite creates is identifiable if it escapes. */
const TAG = 'test-r16';

type Advocate = { authId: string; userId: string; token: string };

async function seedAdvocate(label: string): Promise<Advocate> {
  const authId = `${TAG}-${label}-${crypto.randomUUID()}`;
  const email = `${authId}@example.test`;
  await sql`INSERT INTO auth_user (id, name, email, email_verified)
            VALUES (${authId}, 'Adv', ${email}, true)`;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
    VALUES (${authId}, 'Adv', '+911111111111', ${email}, 'unverified')
    RETURNING id`;
  return { authId, userId: u!.id, token: await signAccessToken({ sub: authId, email }, SECRET) };
}

const headers = (token: string, key?: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  ...(key === undefined ? {} : { [IDEMPOTENCY_HEADER]: key }),
});

const post = (path: string, token: string, body: unknown, key?: string) =>
  app.request(path, { method: 'POST', headers: headers(token, key), body: JSON.stringify(body) });

const newKey = () => `k-${crypto.randomUUID()}`;

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** The single count a `SELECT count(*)::int AS n` returns. */
const countOf = (rows: { n: number }[]): number => rows[0]!.n;

async function ledgerCount(userId: string): Promise<number> {
  return countOf(
    await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM api_idempotency_records WHERE user_id = ${userId}::uuid`,
  );
}

async function skipUnlessMigrated(t: { skip: (m: string) => void }): Promise<boolean> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'api_idempotency_records'`;
  if (!row?.n) {
    t.skip('0100 has not been applied to this database');
    return false;
  }
  return true;
}

/** A judgment BORROWED from the corpus. Absent on a scratch CI database. */
let judgmentId: string | null = null;

const matterBody = {
  caseTitle: 'R16 v. State',
  court: 'Delhi High Court',
  caseType: 'criminal' as const,
  parties: { petitioner: 'R16', respondent: 'State' },
  clientName: 'R16 Client',
  ourSide: 'accused' as const,
  nextHearingDate: '2026-10-01',
};

let alice: Advocate;
let bob: Advocate;

async function cleanup(): Promise<void> {
  const users = sql`SELECT id FROM users WHERE auth_id LIKE ${`${TAG}-%`}`;
  await sql`DELETE FROM api_idempotency_records WHERE user_id IN (${users})`;
  await sql`DELETE FROM judgment_annotations WHERE user_id IN (${users})`;
  await sql`DELETE FROM citation_checks WHERE citation_claimed LIKE ${`${TAG}%`}`;
  await sql`DELETE FROM matter_events WHERE matter_id IN
            (SELECT id FROM matters WHERE user_id IN (${users}))`;
  await sql`DELETE FROM activation_events WHERE user_id IN (${users})`;
  await sql`DELETE FROM matters WHERE user_id IN (${users})`;
  await sql`DELETE FROM data_requests WHERE user_id IN (${users})`;
  await sql`DELETE FROM training_consent_events WHERE user_id IN (${users})`;
  await sql`DELETE FROM users WHERE auth_id LIKE ${`${TAG}-%`}`;
  await sql`DELETE FROM auth_user WHERE id LIKE ${`${TAG}-%`}`;
}

describe('R16 idempotency', () => {
  before(async () => {
    await cleanup();
    alice = await seedAdvocate('a');
    bob = await seedAdvocate('b');
    const [j] = await sql<{ id: string }[]>`SELECT id FROM judgments LIMIT 1`;
    judgmentId = j?.id ?? null;
  });

  // Deliberately NOT sql.end() — the connection is shared with the suite below,
  // and closing it here cancelled every test in it with CONNECTION_ENDED. The
  // last teardown in the file owns the close.
  after(cleanup);

  // ───────────────────────────────────────────────────────────────────────────
  // J · HEADER ABSENT — THE COMPATIBILITY WINDOW
  // ───────────────────────────────────────────────────────────────────────────

  it('J · a legacy request with no key behaves exactly as before and writes no ledger row', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const before = await ledgerCount(alice.userId);

    const first = await post('/matters', alice.token, matterBody);
    const second = await post('/matters', alice.token, matterBody);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);

    // Two calls, two matters. Without a key there is no attempt identity, so
    // these are two intentional creates — and R16 must not change that.
    const a = (await json(first))['data'] as { matter: { matterId: string } };
    const b = (await json(second))['data'] as { matter: { matterId: string } };
    assert.notEqual(a.matter.matterId, b.matter.matterId);
    assert.equal(await ledgerCount(alice.userId), before);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // K · A MALFORMED KEY IS REFUSED BEFORE ANYTHING HAPPENS
  // ───────────────────────────────────────────────────────────────────────────

  it('K · malformed, empty, over-length, spaced and comma-joined keys are 400 and consume nothing', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const beforeLedger = await ledgerCount(alice.userId);
    const beforeMatters = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matters WHERE user_id = ${alice.userId}::uuid`,
    );

    /**
     * R16 §1 also names "surrounding whitespace" as a rejection. It is NOT
     * tested here and the omission is deliberate: the Headers API strips leading
     * and trailing whitespace from a header value before the request is
     * dispatched, so `' key '` reaches the server as `'key'` and there is no
     * padded value for the server to refuse. Asserting a 400 for it would be
     * asserting a behaviour no client can produce — and it failed exactly that
     * way when this test first claimed it. Interior whitespace, which the
     * transport does preserve, IS refused.
     */
    const bad = [
      '', // empty
      'short7', // 6 characters, under the floor
      'has space in it', // interior space, which the transport does preserve
      'tab	inside-key', // interior tab, preserved and refused
      'key-one,key-two', // what Headers.get() produces from a repeated header
      'x'.repeat(129), // over length
    ];
    for (const key of bad) {
      const res = await post('/matters', alice.token, matterBody, key);
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(key)}`);
      assert.equal(
        ((await json(res))['error'] as { code: string }).code,
        'INVALID_IDEMPOTENCY_KEY',
        `wrong code for ${JSON.stringify(key)}`,
      );
    }

    // The refusal is before the mutation AND before the key is reserved.
    assert.equal(await ledgerCount(alice.userId), beforeLedger);
    const afterMatters = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matters WHERE user_id = ${alice.userId}::uuid`,
    );
    assert.equal(afterMatters, beforeMatters);

    // 8 characters exactly — the boundary is inclusive, not off by one.
    const edge = await post('/matters', alice.token, matterBody, '12345678');
    assert.equal(edge.status, 201);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // A + H · THE LOST RESPONSE
  // ───────────────────────────────────────────────────────────────────────────

  it('A · a lost-response retry returns the ORIGINAL body and creates exactly one matter', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const key = newKey();
    // Its OWN title. Counting on the shared one counted four matters that other
    // tests had created and called it a failure of this one.
    const title = `${TAG} A lost response`;
    const body = { ...matterBody, caseTitle: title };

    const first = await post('/matters', alice.token, body, key);
    assert.equal(first.status, 201);
    const created = ((await json(first))['data'] as { matter: Record<string, string> }).matter;

    // The client never saw the response above. It retries with the same key.
    const retry = await post('/matters', alice.token, body, key);
    assert.equal(retry.status, 201, 'the replay carries the ORIGINAL status, not 200');
    const replayed = ((await json(retry))['data'] as { matter: Record<string, string> }).matter;

    // Same resource id AND same mutation timestamp — R16 §4. A re-derived body
    // would agree on the id and disagree on the clock.
    assert.equal(replayed['matterId'], created['matterId']);
    assert.equal(replayed['createdAt'], created['createdAt']);
    assert.deepEqual(replayed, created);

    const n = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matters
      WHERE user_id = ${alice.userId}::uuid AND case_title = ${title}`,
    );
    assert.equal(n, 1, 'ONE durable domain mutation — this is the whole contract');
  });

  it('H · the response is discarded after commit; the retry still yields one durable mutation', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const key = newKey();
    const title = `${TAG} discarded response`;

    // Deliberately never read: this is the request whose response is lost.
    const sent = await post('/matters', alice.token, { ...matterBody, caseTitle: title }, key);
    assert.equal(sent.status, 201);

    const afterFirst = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matters
      WHERE user_id = ${alice.userId}::uuid AND case_title = ${title}`,
    );
    assert.equal(afterFirst, 1, 'the mutation IS durable — that is the premise');

    const retry = await post('/matters', alice.token, { ...matterBody, caseTitle: title }, key);
    assert.equal(retry.status, 201);
    const afterRetry = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matters
      WHERE user_id = ${alice.userId}::uuid AND case_title = ${title}`,
    );
    assert.equal(afterRetry, 1, 'still one');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // C · SAME KEY, DIFFERENT BODY
  // ───────────────────────────────────────────────────────────────────────────

  it('C · the same key with a different body is 409 MISMATCH, mutates nothing, and leaves the original intact', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const key = newKey();
    const title = `${TAG} mismatch original`;

    const first = await post('/matters', alice.token, { ...matterBody, caseTitle: title }, key);
    assert.equal(first.status, 201);
    const created = ((await json(first))['data'] as { matter: Record<string, string> }).matter;

    // One free-text field changes. The domain layer would happily accept this;
    // only key reuse makes it a refusal.
    const clash = await post(
      '/matters',
      alice.token,
      { ...matterBody, caseTitle: `${title} EDITED` },
      key,
    );
    assert.equal(clash.status, 409);
    assert.equal(
      ((await json(clash))['error'] as { code: string }).code,
      'IDEMPOTENCY_KEY_REUSE_MISMATCH',
    );

    const edited = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matters
      WHERE user_id = ${alice.userId}::uuid AND case_title = ${`${title} EDITED`}`,
    );
    assert.equal(edited, 0, 'zero new domain mutation');

    // "never return the earlier result as though it answered the new request" —
    // and the earlier result must still be replayable by the request that made it.
    const replay = await post('/matters', alice.token, { ...matterBody, caseTitle: title }, key);
    assert.equal(replay.status, 201);
    assert.equal(
      ((await json(replay))['data'] as { matter: Record<string, string> }).matter['matterId'],
      created['matterId'],
    );
  });

  it('C2 · JSON key order and transport whitespace do not make a fingerprint differ', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const key = newKey();
    const title = `${TAG} key order`;

    const first = await app.request('/matters', {
      method: 'POST',
      headers: headers(alice.token, key),
      body: JSON.stringify({ ...matterBody, caseTitle: title }),
    });
    assert.equal(first.status, 201);

    // Same fields, reversed order, and pretty-printed.
    const reordered = Object.fromEntries(
      Object.entries({ ...matterBody, caseTitle: title }).reverse(),
    );
    const second = await app.request('/matters', {
      method: 'POST',
      headers: headers(alice.token, key),
      body: JSON.stringify(reordered, null, 2),
    });
    assert.equal(second.status, 201, 'a reordered body is the SAME request, not a mismatch');
    assert.deepEqual((await json(second))['data'], (await json(first))['data']);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // D + E · PATH PARAMETERS AND QUERY ARE IN THE FINGERPRINT
  // ───────────────────────────────────────────────────────────────────────────

  it('D · the same key against a different matter is 409 MISMATCH even though the route template matches', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const one = await post('/matters', alice.token, { ...matterBody, caseTitle: `${TAG} D one` });
    const two = await post('/matters', alice.token, { ...matterBody, caseTitle: `${TAG} D two` });
    const idOne = ((await json(one))['data'] as { matter: { matterId: string } }).matter.matterId;
    const idTwo = ((await json(two))['data'] as { matter: { matterId: string } }).matter.matterId;

    const key = newKey();
    const event = { eventDate: '2026-09-15', eventType: 'hearing', notes: `${TAG} D event` };

    const first = await post(`/matters/${idOne}/events`, alice.token, event, key);
    assert.equal(first.status, 201);

    // Identical body, identical route template, different path parameter.
    const second = await post(`/matters/${idTwo}/events`, alice.token, event, key);
    assert.equal(second.status, 409);
    assert.equal(
      ((await json(second))['error'] as { code: string }).code,
      'IDEMPOTENCY_KEY_REUSE_MISMATCH',
    );

    const n = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matter_events WHERE matter_id = ${idTwo}::uuid`,
    );
    assert.equal(n, 0, 'the second matter gained nothing');
  });

  it('E · an operation-significant query value changes the fingerprint', () => {
    // None of the six current-v1 creates takes one, so this is asserted on the
    // fingerprint itself rather than invented onto a route. The mechanism has to
    // carry query values now, because the route that needs one will not arrive
    // with a test that remembers to check.
    const base = { route: '/x', method: 'POST', params: {}, body: { a: 1 } };
    assert.notEqual(
      requestFingerprint({ ...base, userId: undefined, query: { scope: 'mine' } }),
      requestFingerprint({ ...base, userId: undefined, query: { scope: 'all' } }),
    );
    assert.equal(
      requestFingerprint({ ...base, userId: undefined, query: { a: '1', b: '2' } }),
      requestFingerprint({ ...base, userId: undefined, query: { b: '2', a: '1' } }),
    );
    // Path parameters are in it too, which is what makes D a mismatch.
    assert.notEqual(
      requestFingerprint({ ...base, userId: undefined, params: { id: 'one' } }),
      requestFingerprint({ ...base, userId: undefined, params: { id: 'two' } }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // F · VALIDATION FAILS BEFORE THE KEY IS EVER LOOKED AT
  // ───────────────────────────────────────────────────────────────────────────

  it('F · a validation failure does not consume the key; the corrected request may reuse it', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const key = newKey();
    const before = await ledgerCount(alice.userId);

    const invalid = await post(
      '/matters',
      alice.token,
      { ...matterBody, caseType: 'nonsense' },
      key,
    );
    assert.equal(invalid.status, 400);
    assert.equal(((await json(invalid))['error'] as { code: string }).code, 'INVALID_REQUEST');
    assert.equal(await ledgerCount(alice.userId), before, 'no record was reserved');

    const corrected = await post(
      '/matters',
      alice.token,
      { ...matterBody, caseTitle: `${TAG} F corrected` },
      key,
    );
    assert.equal(corrected.status, 201, 'the same key still works after a validation error');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // I · IDENTICAL CONTENT, TWO KEYS, TWO WRITES
  // ───────────────────────────────────────────────────────────────────────────

  it('I · two intentional identical writes under two keys are two rows — never content de-duplication', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const title = `${TAG} deliberate duplicate`;
    const body = { ...matterBody, caseTitle: title };

    const first = await post('/matters', alice.token, body, newKey());
    const second = await post('/matters', alice.token, body, newKey());
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);

    const n = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matters
      WHERE user_id = ${alice.userId}::uuid AND case_title = ${title}`,
    );
    assert.equal(n, 2, 'byte-identical content under two keys is two intentional writes');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // L + M · SCOPE
  // ───────────────────────────────────────────────────────────────────────────

  it('L · one principal cannot replay, collide with or observe another principal key', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const key = newKey();
    const title = `${TAG} principal scope`;
    const body = { ...matterBody, caseTitle: title };

    const mine = await post('/matters', alice.token, body, key);
    assert.equal(mine.status, 201);
    const mineId = ((await json(mine))['data'] as { matter: { matterId: string } }).matter.matterId;

    // Same raw key, same body, different advocate. This must EXECUTE, not
    // replay: a replay here would hand Bob a matter belonging to Alice.
    const theirs = await post('/matters', bob.token, body, key);
    assert.equal(theirs.status, 201);
    const theirId = ((await json(theirs))['data'] as { matter: { matterId: string } }).matter
      .matterId;
    assert.notEqual(theirId, mineId);

    const [owner] = await sql<{ user_id: string }[]>`
      SELECT user_id FROM matters WHERE id = ${theirId}::uuid`;
    assert.equal(owner!.user_id, bob.userId);

    // And a different body under that same raw key is Bob's business, not a
    // conflict with Alice's record.
    const theirsEdited = await post(
      '/matters',
      bob.token,
      { ...body, caseTitle: `${title} bob` },
      key,
    );
    assert.equal(theirsEdited.status, 409, "it conflicts with BOB's own earlier use");
  });

  it('M · the same raw key on a different canonical route does not collide', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const key = newKey();

    const matter = await post(
      '/matters',
      alice.token,
      { ...matterBody, caseTitle: `${TAG} M` },
      key,
    );
    assert.equal(matter.status, 201);

    const request = await post('/me/data-requests', alice.token, { kind: 'export' }, key);
    assert.equal(request.status, 201, 'a different route is a different scope');

    const n = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM api_idempotency_records
      WHERE user_id = ${alice.userId}::uuid AND idempotency_key = ${key}`,
    );
    assert.equal(n, 2, 'two records, one per route');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE OTHER FIVE ROUTES
  // ───────────────────────────────────────────────────────────────────────────

  it('matter events · replay returns the original event and appends once', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const created = await post('/matters', alice.token, {
      ...matterBody,
      caseTitle: `${TAG} events`,
    });
    const matterId = ((await json(created))['data'] as { matter: { matterId: string } }).matter
      .matterId;

    const key = newKey();
    const body = { eventDate: '2026-09-20', eventType: 'order', notes: `${TAG} one event` };
    const first = await post(`/matters/${matterId}/events`, alice.token, body, key);
    const retry = await post(`/matters/${matterId}/events`, alice.token, body, key);
    assert.equal(first.status, 201);
    assert.equal(retry.status, 201);
    assert.deepEqual((await json(retry))['data'], (await json(first))['data']);

    const n = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matter_events WHERE matter_id = ${matterId}::uuid`,
    );
    assert.equal(n, 1);
  });

  it('data requests · replay returns the original request and opens one clock', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const advocate = await seedAdvocate('dr');
    const key = newKey();

    const first = await post('/me/data-requests', advocate.token, { kind: 'correction' }, key);
    const retry = await post('/me/data-requests', advocate.token, { kind: 'correction' }, key);
    assert.equal(first.status, 201);
    assert.equal(retry.status, 201, 'the ORIGINAL 201, not the 200 the open-kind path returns');
    assert.deepEqual((await json(retry))['data'], (await json(first))['data']);

    const n = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM data_requests
      WHERE user_id = ${advocate.userId}::uuid AND kind = 'correction'`,
    );
    assert.equal(n, 1);
  });

  it('training consent · replay returns the original grant and appends one consent event', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const advocate = await seedAdvocate('tc');
    const key = newKey();
    const body = { version: 'training-v1' };

    const first = await post('/me/training-consent', advocate.token, body, key);
    const firstBody = await json(first);
    assert.equal(first.status, 200, `grant failed: ${JSON.stringify(firstBody)}`);
    const retry = await post('/me/training-consent', advocate.token, body, key);
    assert.equal(retry.status, 200);
    assert.deepEqual((await json(retry))['data'], firstBody['data']);

    // The handler opens its own transaction — under a key that becomes a
    // SAVEPOINT inside the wrapper's. If that had not been handled, the first
    // call would have thrown `sql.begin is not a function`.
    const n = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM training_consent_events
      WHERE user_id = ${advocate.userId}::uuid AND action = 'granted'`,
    );
    assert.equal(n, 1);
  });

  it('annotations · replay returns the original note and saves it once', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    if (!judgmentId) {
      t.skip('no judgment in this database — the corpus is not loaded here');
      return;
    }
    const key = newKey();
    const body = { paragraphNumber: 12, paragraphIndex: 11, quote: `${TAG} quote`, note: 'n' };

    const first = await post(`/judgments/${judgmentId}/annotations`, alice.token, body, key);
    const firstBody = await json(first);
    assert.equal(first.status, 200, `create failed: ${JSON.stringify(firstBody)}`);
    const retry = await post(`/judgments/${judgmentId}/annotations`, alice.token, body, key);
    assert.deepEqual((await json(retry))['data'], firstBody['data']);

    const n = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM judgment_annotations
      WHERE user_id = ${alice.userId}::uuid AND quote = ${`${TAG} quote`}`,
    );
    assert.equal(n, 1);
  });

  it('verify confirm · replay returns the original confirmation and caches one check', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    if (!judgmentId) {
      t.skip('no judgment in this database — the corpus is not loaded here');
      return;
    }
    const key = newKey();
    const citationText = `${TAG} (2019) 4 SCC 221`;
    const body = { citationText, judgmentId };

    const first = await post('/verify/confirm', alice.token, body, key);
    const firstBody = await json(first);
    assert.equal(first.status, 200, `confirm failed: ${JSON.stringify(firstBody)}`);
    const retry = await post('/verify/confirm', alice.token, body, key);
    assert.deepEqual((await json(retry))['data'], firstBody['data']);

    const n = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM citation_checks WHERE citation_claimed = ${citationText}`,
    );
    assert.equal(n, 1, 'Tier 3 caches ONE permanent human vouch, not one per retry');
  });

  it('annotations · a business refusal replays as the refusal and creates nothing', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const key = newKey();
    // A judgment id that does not exist: a deterministic refusal AFTER validation.
    const missing = crypto.randomUUID();
    const body = { paragraphNumber: 1, paragraphIndex: 0, quote: `${TAG} refused` };

    const first = await post(`/judgments/${missing}/annotations`, alice.token, body, key);
    assert.equal(first.status, 404);
    const retry = await post(`/judgments/${missing}/annotations`, alice.token, body, key);
    assert.equal(retry.status, 404, 'the same request replays the same refusal');
    assert.deepEqual((await json(retry))['error'], (await json(first))['error']);

    // A refusal is recorded, so a DIFFERENT request under that key still conflicts.
    const clash = await post(
      `/judgments/${missing}/annotations`,
      alice.token,
      { ...body, quote: `${TAG} refused differently` },
      key,
    );
    assert.equal(clash.status, 409);
    assert.equal(
      ((await json(clash))['error'] as { code: string }).code,
      'IDEMPOTENCY_KEY_REUSE_MISMATCH',
    );

    const n = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM judgment_annotations
      WHERE user_id = ${alice.userId}::uuid AND quote LIKE ${`${TAG} refused%`}`,
    );
    assert.equal(n, 0, 'a refusal creates no resource');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * B AND G · THE TWO ROWS OF §5 A REAL ROUTE CANNOT REACH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * "Server failure before durable mutation" needs a handler that dies AFTER
 * writing and BEFORE committing, and "concurrent duplicate" needs one that is
 * still executing when its rival arrives. Neither is a thing a production
 * handler can be asked to do on demand.
 *
 * So the probe app below is the REAL wrapper around a REAL `matters` insert,
 * with one extra instruction — sleep, or throw. Nothing about the mechanism is
 * mocked: the transaction, the unique index, the blocking insert and the
 * deferred completion trigger are all the production ones, which is the point.
 */
describe('R16 atomicity and concurrency', () => {
  let advocate: Advocate;

  const probe = new Hono();
  probe.post('/probe/:mode', async (c) => {
    const mode = c.req.param('mode');
    const userId = c.req.header('x-probe-user');
    const title = c.req.header('x-probe-title') ?? 'probe';
    return withIdempotency(
      c,
      sql,
      { userId, route: '/probe/:mode', params: { mode }, body: { title } },
      async (tx) => {
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO matters (user_id, case_title, court, case_type, parties, client_name,
                               our_side, status, source)
          VALUES (${userId!}::uuid, ${title}, 'Delhi High Court', 'criminal',
                  ${sql.json({ petitioner: 'p', respondent: 'r' })}, 'c', 'accused',
                  'active', 'manual')
          RETURNING id`;
        if (mode === 'throw') throw new Error('probe: died before commit');
        if (mode === 'slow') await tx`SELECT pg_sleep(0.6)`;
        return ok(c, { matterId: row!.id }, 201);
      },
    );
  });

  const hit = (mode: string, key: string, title: string) =>
    probe.request(`/probe/${mode}`, {
      method: 'POST',
      headers: {
        [IDEMPOTENCY_HEADER]: key,
        'x-probe-user': advocate.userId,
        'x-probe-title': title,
      },
    });

  before(async () => {
    advocate = await seedAdvocate('probe');
  });

  after(async () => {
    await cleanup();
    await sql.end();
  });

  it('G · a handler that dies before commit leaves no mutation, no record, and a usable key', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const key = newKey();
    const title = `${TAG} G died`;

    // Hono converts a thrown handler into a 500 response rather than rejecting,
    // which is exactly the "server failure before mutation" row of §5.
    const died = await hit('throw', key, title);
    assert.equal(died.status, 500);

    const matters = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matters WHERE case_title = ${title}`,
    );
    assert.equal(matters, 0, 'the insert rolled back with the claim');
    const records = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM api_idempotency_records
      WHERE user_id = ${advocate.userId}::uuid AND idempotency_key = ${key}`,
    );
    assert.equal(records, 0, 'no failed result is cached, and no claim is stranded');

    // "A retry may become the executor." No reaper ran; nothing expired.
    const retry = await hit('ok', key, title);
    assert.equal(retry.status, 201);
    const after = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matters WHERE case_title = ${title}`,
    );
    assert.equal(after, 1);
  });

  it('B · two genuinely concurrent requests under one key produce ONE mutation', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const key = newKey();
    const title = `${TAG} B concurrent`;

    // The executor holds its transaction open for 600 ms — comfortably inside
    // the 2 s wait budget, so the follower is expected to WAIT and replay
    // rather than to be told to come back.
    assert.ok(IDEMPOTENCY_WAIT_BUDGET_MS > 600);
    const [one, two] = await Promise.all([hit('slow', key, title), hit('slow', key, title)]);

    const statuses = [one.status, two.status].sort();
    assert.deepEqual(statuses, [201, 201], `got ${JSON.stringify(statuses)}`);
    const bodies = [
      ((await json(one))['data'] as { matterId: string }).matterId,
      ((await json(two))['data'] as { matterId: string }).matterId,
    ];
    assert.equal(bodies[0], bodies[1], 'the follower replayed the executor result');

    const n = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matters WHERE case_title = ${title}`,
    );
    assert.equal(n, 1, 'one executor, chosen by the database');

    const records = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM api_idempotency_records
      WHERE user_id = ${advocate.userId}::uuid AND idempotency_key = ${key}`,
    );
    assert.equal(records, 1);
  });

  it('B2 · six concurrent duplicates still produce ONE mutation and one record', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const key = newKey();
    const title = `${TAG} B2 six ways`;

    const results = await Promise.all(
      Array.from({ length: 6 }, async () => (await hit('ok', key, title)).status),
    );
    // Every answer is either the result or the retryable 409. Never a second create.
    for (const status of results) assert.ok([201, 409].includes(status), `unexpected ${status}`);

    const n = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matters WHERE case_title = ${title}`,
    );
    assert.equal(n, 1);
  });

  it('a follower that cannot wait out the budget gets 409 IDEMPOTENCY_IN_PROGRESS and Retry-After: 1', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    const key = newKey();
    const title = `${TAG} in progress`;

    /**
     * B2 tolerates either answer because real contention is a race. This one is
     * deterministic: the test itself holds an UNCOMMITTED claim on the key, so
     * the request below cannot win the insert and cannot see a committed result
     * either. It must wait out `IDEMPOTENCY_WAIT_BUDGET_MS` and then answer —
     * never hang, and never execute.
     */
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = sql
      .begin(async (tx) => {
        await tx`
          INSERT INTO api_idempotency_records
            (user_id, method, route, idempotency_key, request_fingerprint,
             outcome, response_status, response_body, completed_at)
          VALUES (${advocate.userId}::uuid, 'POST', '/probe/:mode', ${key},
                  repeat('0', 64), 'success', 201, ${sql.json({ held: true })}, now())`;
        await held;
      })
      .catch(() => {});

    // Let the blocker's INSERT land before the request races it.
    await new Promise((r) => setTimeout(r, 100));
    const started = Date.now();
    const res = await hit('ok', key, title);
    const waited = Date.now() - started;

    assert.equal(res.status, 409);
    assert.equal(((await json(res))['error'] as { code: string }).code, 'IDEMPOTENCY_IN_PROGRESS');
    assert.equal(res.headers.get('Retry-After'), '1');
    assert.ok(waited >= IDEMPOTENCY_WAIT_BUDGET_MS - 250, `gave up after only ${waited} ms`);

    const created = countOf(
      await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM matters WHERE case_title = ${title}`,
    );
    assert.equal(created, 0, 'the follower executed nothing');

    release();
    await blocker;
  });

  it('the database refuses a record that would commit without its result', async (t) => {
    if (!(await skipUnlessMigrated(t))) return;
    // The claim-without-completion the wrapper never performs. If a future
    // writer does, the deferred trigger stops it AT COMMIT — which is exactly
    // when the domain write it was meant to be coupled to would have landed.
    await assert.rejects(
      () =>
        sql.begin(async (tx) => {
          await tx`
            INSERT INTO api_idempotency_records
              (user_id, method, route, idempotency_key, request_fingerprint)
            VALUES (${advocate.userId}::uuid, 'POST', '/probe/:mode',
                    ${newKey()}, repeat('f', 64))`;
        }),
      /committed without a completed result/,
    );
  });
});
