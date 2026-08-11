/**
 * Most of these test what the pool REFUSES to do, because with two or three
 * accounts the dangerous failure is not a crash — it is quietly working. A pool
 * that rotates past a 403 is ban-evasion that looks like resilience in the logs.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUTHORISATION,
  BHARATLAW_USER_AGENT,
  type BharatLawAccount,
  type BharatLawConsent,
  MAX_AUTH_ATTEMPTS,
  PRO_MONTHLY_CREDITS,
  accountsFromEnv,
  benchmarkPermitted,
  consentPermits,
  createBharatLawPool,
  extractionPermitted,
} from './bharatlaw.ts';

const ACCOUNTS: BharatLawAccount[] = [
  { label: 'a', username: 'a@example.com', password: 'x' },
  { label: 'b', username: 'b@example.com', password: 'y' },
  { label: 'c', username: 'c@example.com', password: 'z' },
];

/** A consent exactly as narrow as FQ-BL1 asks for: benchmark yes, extraction no. */
const GRANTED: BharatLawConsent = {
  grantedAt: '2026-08-01T00:00:00.000Z',
  expiresAt: '2027-08-01T00:00:00.000Z',
  grantedBy: 'legal@bharat.law',
  benchmarkPermitted: true,
  extractionPermitted: false,
  maxAccounts: 3,
};

/** A pool with a fixture consent, so the rules BELOW the gate can be exercised. */
function consented(
  fetchImpl: typeof fetch,
  overrides: Partial<Parameters<typeof createBharatLawPool>[0]> = {},
) {
  return createBharatLawPool({
    accounts: ACCOUNTS,
    fetchImpl,
    maxPoolRequestsPerDay: 100,
    consent: GRANTED,
    now: () => new Date('2026-08-09T00:00:00.000Z'),
    ...overrides,
  });
}

function respond(status: number, body = 'ok'): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

/* ------------------------------------------------------- the authorisation -- */

test('THE LIVE GRANT IS OPEN, and it permits BENCHMARKING ONLY', () => {
  /**
   * Opened 9 Aug 2026 on the founder's authority: Lawmind holds a licence, and
   * the written-consent clause in the public Evaluation Terms binds parties
   * WITHOUT one.
   *
   * This test changed from `assert.equal(AUTHORISATION, null)` and the change is
   * the point — it was guarding the closed state and it caught the opening,
   * which is what such a test is for. What it guards now is narrower and more
   * important: that opening the platform did NOT open extraction.
   */
  assert.notEqual(AUTHORISATION, null);
  assert.equal(AUTHORISATION?.benchmarkPermitted, true);
  assert.equal(AUTHORISATION?.extractionPermitted, false);
});

test('EXTRACTION STAYS SHUT on the live grant, and no permission can open it', () => {
  // BHARAT_LAW_OFFER.md §5 and §8: what we would take is either free elsewhere
  // or a machine's opinion about law, which DATASETS.md forbids as training
  // input REGARDLESS of who permits it. A licence to use a platform is not a
  // reason to take its output into our corpus.
  assert.equal(benchmarkPermitted(), true);
  assert.equal(extractionPermitted(), false);
});

test('the live grant carries an END DATE — a consent nobody revisits cannot be confirmed', () => {
  assert.ok(AUTHORISATION?.expiresAt, 'a grant with no expiry is a grant nobody rechecks');
  assert.ok(
    Date.parse(AUTHORISATION!.expiresAt) > Date.parse(AUTHORISATION!.grantedAt),
    'the window must run forwards',
  );
});

test('a NULL consent still refuses BEFORE it complains about credentials', async () => {
  // The mechanism, tested with a fixture now that the live constant is set.
  // Order matters: a configured-but-unconsented pool must say "not authorised",
  // never "not configured" — the second reads as a missing key somebody can fix.
  const pool = createBharatLawPool({ accounts: [], consent: null, fetchImpl: respond(200) });
  const out = await pool.get('/api/search');
  assert.equal(out.ok, false);
  assert.equal(out.halted, 'not_authorised');
  assert.match(out.reason, /prior written consent|written consent/i);
});

test('the refusal names the contract, not a vague policy', async () => {
  const pool = createBharatLawPool({ accounts: ACCOUNTS, consent: null, fetchImpl: respond(200) });
  const out = await pool.get('/api/search');
  assert.equal(out.ok, false);
  assert.match(out.reason, /Evaluation Terms/);
  assert.match(out.reason, /verbal yes is not/i);
});

test('a consent that has expired permits nothing, on its own', () => {
  const expired: BharatLawConsent = {
    ...GRANTED,
    grantedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-02-01T00:00:00.000Z',
  };
  const after = new Date('2026-08-09T00:00:00.000Z');
  assert.equal(consentPermits(expired, 'benchmarkPermitted', after), false);
  // It must expire on its own, the way the eCourts grant does — never because
  // somebody remembered to switch it off.
  const during = new Date('2026-01-15T00:00:00.000Z');
  assert.equal(consentPermits(expired, 'benchmarkPermitted', during), true);
});

test('a consent is not yet in force before it was granted', () => {
  const before = new Date('2026-07-01T00:00:00.000Z');
  assert.equal(consentPermits(GRANTED, 'benchmarkPermitted', before), false);
});

test('an expired consent shuts the POOL, not just the predicate', async () => {
  const pool = consented(respond(200), {
    consent: { ...GRANTED, expiresAt: '2026-08-05T00:00:00.000Z' },
  });
  const out = await pool.get('/api/search');
  assert.equal(out.ok, false);
  assert.equal(out.halted, 'not_authorised');
  assert.equal(pool.authorised, false);
});

test('extraction stays separate from benchmarking — two permissions, never one flag', () => {
  // BHARAT_LAW_OFFER.md §5: what we would take is either free elsewhere or is a
  // machine's opinion we may not train on. A consent to benchmark must not
  // silently become a consent to extract.
  const at = new Date('2026-08-09T00:00:00.000Z');
  assert.equal(consentPermits(GRANTED, 'benchmarkPermitted', at), true);
  assert.equal(consentPermits(GRANTED, 'extractionPermitted', at), false);
});

test('the live grant permits benchmarking and refuses extraction', () => {
  // Two permissions, never one flag — the distinction the whole file exists for.
  assert.equal(benchmarkPermitted(), true);
  assert.equal(extractionPermitted(), false);
});

test('more accounts than the consent covers refuses the whole pool', async () => {
  // Buying a fourth account does not extend a consent written for three, and
  // quietly using only the covered three would hide the discrepancy.
  const pool = consented(respond(200), { consent: { ...GRANTED, maxAccounts: 2 } });
  const out = await pool.get('/api/search');
  assert.equal(out.ok, false);
  assert.equal(out.halted, 'not_authorised');
  assert.match(out.reason, /3 accounts configured but the written consent covers 2/);
});

/* ----------------------------------------------------------- the accounts -- */

test('accounts parse from a label:username:password triple', () => {
  const parsed = accountsFromEnv('one:a@x.com:pw1\ntwo:b@x.com:pw2');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]!.label, 'one');
  assert.equal(parsed[1]!.username, 'b@x.com');
});

test('a malformed account line is dropped, never guessed at', () => {
  // A half-parsed credential that silently becomes a login attempt is how an
  // account gets locked. The second argument is passed explicitly so the
  // single-account fallback cannot answer for the environment the test runs in.
  const none = {};
  assert.deepEqual(accountsFromEnv('broken-line', none), []);
  assert.deepEqual(accountsFromEnv('', none), []);
  assert.deepEqual(accountsFromEnv(undefined, none), []);
});

test('a single BHARATLAW_EMAIL/PASSWORD pair is read as one account', () => {
  /**
   * Found 11 Aug 2026: the founder had provisioned `BHARATLAW_EMAIL` and
   * `BHARATLAW_PASSWORD` — the obvious names for one account — and **nothing in
   * the repository read either name.** The pool refused for want of
   * `BHARATLAW_ACCOUNTS` and refused identically whether the credentials were
   * absent or merely named differently, so a real account sat dormant while
   * looking exactly like an unprovisioned one.
   */
  const parsed = accountsFromEnv(undefined, { email: 'a@x.com', password: 'pw' });
  assert.deepEqual(parsed, [{ label: 'primary', username: 'a@x.com', password: 'pw' }]);
});

test('half a pair is not an account', () => {
  assert.deepEqual(accountsFromEnv(undefined, { email: 'a@x.com' }), []);
  assert.deepEqual(accountsFromEnv(undefined, { password: 'pw' }), []);
  assert.deepEqual(accountsFromEnv(undefined, { email: '  ', password: 'pw' }), []);
});

test('BHARATLAW_ACCOUNTS wins, so a real pool is never reduced to one', () => {
  // Otherwise a stale single credential left in the environment would silently
  // shrink a three-account pool, and the pacing budget would be wrong for the
  // rest of the run.
  const parsed = accountsFromEnv('one:a@x.com:pw1\ntwo:b@x.com:pw2', {
    email: 'stale@x.com',
    password: 'pw',
  });
  assert.equal(parsed.length, 2);
  assert.ok(!parsed.some((a) => a.username === 'stale@x.com'));
});

test('the default entitlement is their published Pro credit meter', () => {
  assert.equal(PRO_MONTHLY_CREDITS, 10_000);
});

test('one authentication attempt per account, and that is the limit', () => {
  assert.equal(MAX_AUTH_ATTEMPTS, 1);
});

test('the user agent names us and carries a contact', () => {
  assert.match(BHARATLAW_USER_AGENT, /Lawmind/);
  assert.match(BHARATLAW_USER_AGENT, /contact:/);
  assert.doesNotMatch(BHARATLAW_USER_AGENT, /Mozilla|Chrome/, 'the client is disguised');
});

/* ------------------------------------------- the rules that need a consent -- */
/**
 * THE MOST IMPORTANT TESTS IN THIS FILE. They run the real request path with a
 * fixture consent, because these rules must already be correct on the day a
 * written consent lands — not discovered against their live service.
 */

test('a 403 on ONE account halts the whole POOL', async () => {
  // The rule that keeps three accounts from being ban-evasion. Answering a
  // refusal with the next credential is circumventing an access control.
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response('no', { status: 403 });
  }) as unknown as typeof fetch;

  const pool = consented(fetchImpl);
  const first = await pool.get('/api/search');
  assert.equal(first.ok, false);
  assert.equal(first.halted, 'forbidden');
  assert.match(first.reason, /THE WHOLE POOL/);

  // Every subsequent call must refuse WITHOUT touching the network again.
  for (let i = 0; i < 5; i++) await pool.get('/api/search');
  assert.equal(calls, 1, 'the pool retried after a 403 — that is ban-evasion');
  assert.equal(pool.state().halted, 'forbidden');
});

test('a 401 on one account halts the pool and does not try the next credential', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response('no', { status: 401 });
  }) as unknown as typeof fetch;

  const pool = consented(fetchImpl);
  const out = await pool.get('/api/search');
  assert.equal(out.ok, false);
  assert.equal(out.halted, 'auth_rejected');
  await pool.get('/api/search');
  await pool.get('/api/search');
  assert.equal(calls, 1, 'a second credential was tried after a refusal');
});

test('a halt is sticky — a later call does not quietly resume on another account', async () => {
  const pool = consented(respond(200));
  pool.halt('operator_stop');
  for (let i = 0; i < 3; i++) {
    const out = await pool.get('/api/search');
    assert.equal(out.ok, false);
    assert.equal(out.halted, 'operator_stop');
  }
  assert.equal(pool.state().totalRequests, 0, 'a halted pool still sent traffic');
});

test('requests rotate across accounts rather than hammering the first', async () => {
  const pool = consented(respond(200));
  await pool.get('/api/search');
  await pool.get('/api/search');
  await pool.get('/api/search');
  const perAccount = pool.state().accounts.map((a) => a.requests);
  assert.deepEqual(perAccount, [1, 1, 1], 'rotation did not spread the work');
});

test('the POOL ceiling stops the run even with credits left on every account', async () => {
  // The point of a separate pool ceiling: adding an account must not silently
  // multiply our traffic against their service.
  const pool = consented(respond(200), { maxPoolRequestsPerDay: 4 });
  for (let i = 0; i < 4; i++) assert.equal((await pool.get('/api/search')).ok, true);

  const out = await pool.get('/api/search');
  assert.equal(out.ok, false);
  assert.equal(out.halted, 'budget_spent');
  assert.match(out.reason, /lower than the sum of the per-account budgets/);
  assert.ok(
    pool.state().accounts.every((a) => a.creditsSpent < a.monthlyCredits),
    'the fixture did not actually leave credits unspent, so it proves nothing',
  );
});

test('when every account has spent its entitlement the pool stops, never wraps', async () => {
  const pool = createBharatLawPool({
    accounts: ACCOUNTS.map((a) => ({ ...a, monthlyCredits: 1 })),
    fetchImpl: respond(200),
    consent: GRANTED,
    now: () => new Date('2026-08-09T00:00:00.000Z'),
    maxPoolRequestsPerDay: 100,
  });
  for (let i = 0; i < 3; i++) assert.equal((await pool.get('/api/search')).ok, true);

  const out = await pool.get('/api/search');
  assert.equal(out.ok, false);
  assert.equal(out.halted, 'pool_exhausted');
  assert.match(out.reason, /exceeding entitlements purchased/);
});

test('credits are charged per call at the stated cost, not per request', async () => {
  // Their meter is credits, not HTTP calls. An expensive query must not be
  // counted as one cheap unit.
  const pool = consented(respond(200));
  await pool.get('/api/research', 50);
  const spent = pool.state().accounts.reduce((n, a) => n + a.creditsSpent, 0);
  assert.equal(spent, 50);
});

test('every request identifies us — no request goes out unattributed', async () => {
  const seen: string[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    seen.push((init.headers as Record<string, string>)['user-agent'] ?? '');
    return new Response('ok', { status: 200 });
  }) as unknown as typeof fetch;

  const pool = consented(fetchImpl);
  await pool.get('/api/search');
  await pool.get('/api/search');
  assert.equal(seen.length, 2);
  assert.ok(
    seen.every((ua) => ua === BHARATLAW_USER_AGENT),
    'a request went out without our attribution',
  );
});

test('a 500 is retryable and does NOT halt the pool', async () => {
  // A transient server error is not a refusal. Conflating the two would stop
  // a legitimate run on a blip, and teach an operator to override halts.
  const pool = consented(respond(500));
  const out = await pool.get('/api/search');
  assert.equal(out.ok, false);
  assert.equal(out.halted, null);
  assert.equal(pool.state().halted, null, 'a 500 halted the pool');
});

test('an operator stop is a halt like any other', async () => {
  const pool = consented(respond(200));
  pool.halt('operator_stop');
  assert.equal(pool.state().halted, 'operator_stop');
  assert.equal(pool.waitMs(), null, 'a halted pool still reported a delay');
});

test('waitMs is null once halted — null means STOP, never "no delay"', async () => {
  const pool = consented(respond(200));
  assert.equal(typeof pool.waitMs(), 'number');
  pool.halt('budget_spent');
  assert.equal(pool.waitMs(), null);
});

test('the pool starts unhalted with every account unspent', () => {
  const pool = consented(respond(200));
  const s = pool.state();
  assert.equal(s.halted, null);
  assert.equal(s.accounts.length, 3);
  assert.ok(
    s.accounts.every((a) => a.creditsSpent === 0 && !a.exhausted),
    'an account started already spent',
  );
});

test('configured and authorised are different questions', () => {
  // Having accounts is not having permission. Collapsing these two into one
  // boolean is how a credential quietly becomes a licence.
  // `consent: null` is passed EXPLICITLY now that the live grant is open —
  // otherwise this would silently test the granted case twice and stop
  // distinguishing the two questions it exists to distinguish.
  const unconsented = createBharatLawPool({
    accounts: ACCOUNTS,
    consent: null,
    fetchImpl: respond(200),
  });
  assert.equal(unconsented.configured, true, 'accounts were supplied');
  assert.equal(unconsented.authorised, false, 'no consent was given');

  const granted = consented(respond(200));
  assert.equal(granted.configured, true);
  assert.equal(granted.authorised, true);

  // Consent without credentials is still not a working integration.
  const noAccounts = createBharatLawPool({ accounts: [], fetchImpl: respond(200) });
  assert.equal(noAccounts.configured, false, 'no accounts were supplied');
  assert.equal(noAccounts.authorised, true, 'but the live grant IS in force');

  const neither = createBharatLawPool({ accounts: [], consent: null, fetchImpl: respond(200) });
  assert.equal(neither.configured, false);
  assert.equal(neither.authorised, false);
});

test('a consented pool with NO accounts still refuses, and says which is missing', async () => {
  const pool = consented(respond(200), { accounts: [] });
  const out = await pool.get('/api/search');
  assert.equal(out.ok, false);
  assert.equal(out.halted, 'not_configured');
  assert.match(out.reason, /BHARATLAW_ACCOUNTS/);
});

test('login refuses an unknown account label rather than picking one', async () => {
  const pool = consented(respond(200));
  const out = await pool.login('nonexistent');
  assert.equal(out.ok, false);
  assert.match(out.reason, /no account labelled/);
});
