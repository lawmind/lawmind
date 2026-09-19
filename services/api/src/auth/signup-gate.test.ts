/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE `signups` SWITCH — THE FOUR WAYS CONNECTING IT COULD HAVE GONE WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Until 19 Sep 2026 `platform_config.signups` was toggled by an audited admin
 * endpoint, recorded in `audit_log`, listed in `SCHEMA_TRUTH.md` — and read by
 * nothing. Connecting it is small; connecting it safely is the part with edges:
 *
 *   1. it must never lock out an identity that already exists;
 *   2. it must not become an oracle for the cohort's addresses;
 *   3. an unreadable config must refuse, not admit;
 *   4. it must not close signup on a workstation, where there is no public.
 *
 * `Sql` is faked throughout. What is under test is the decision, not Postgres.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Sql } from 'postgres';

import { decideSignup, signupsOpen } from './signup-gate.ts';

const SERVING = { LAWMIND_SERVING_ENV: 'production' } as NodeJS.ProcessEnv;
const STAGING = { LAWMIND_SERVING_ENV: 'staging' } as NodeJS.ProcessEnv;
const LOCAL = { LAWMIND_SERVING_ENV: 'development' } as NodeJS.ProcessEnv;

/**
 * Answers the two queries `decideSignup` can make, by shape rather than by call
 * order — the order is an implementation detail and a test that depended on it
 * would fail for the wrong reason the moment a short-circuit changed.
 */
function fakeSql(opts: {
  signupsRow?: { enabled: boolean } | undefined;
  identityExists?: boolean;
  throwOn?: 'config' | 'identity' | 'both';
}): { sql: Sql; queries: () => string[] } {
  const queries: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    const text = strings.join('?');
    queries.push(text);
    const isConfig = text.includes('platform_config');
    if (opts.throwOn === 'both' || (opts.throwOn === 'config' && isConfig)) {
      return Promise.reject(new Error('platform_config unreadable'));
    }
    if (opts.throwOn === 'identity' && !isConfig) {
      return Promise.reject(new Error('auth_user unreadable'));
    }
    if (isConfig) return Promise.resolve(opts.signupsRow ? [opts.signupsRow] : []);
    return Promise.resolve([{ exists: opts.identityExists === true }]);
  }) as unknown as Sql;
  return { sql, queries: () => queries };
}

describe('signupsOpen · the switch itself', () => {
  it('open only when a row says so explicitly', async () => {
    assert.equal(await signupsOpen(fakeSql({ signupsRow: { enabled: true } }).sql), true);
    assert.equal(await signupsOpen(fakeSql({ signupsRow: { enabled: false } }).sql), false);
  });

  it('a MISSING row reads closed — and a fresh database has no row', async () => {
    /**
     * Verified 19 Sep 2026: no migration seeds `signups`; `0013` only adds the
     * CHECK constraint on the key set. So S4-R1's fresh USER database arrives
     * with this row absent — which is why the default must be the safe one, and
     * is also why R1 cannot inherit the local row's `reason: "test cleanup"`.
     */
    assert.equal(await signupsOpen(fakeSql({ signupsRow: undefined }).sql), false);
  });

  it('an unreadable platform_config reads closed — not knowing is not permission', async () => {
    assert.equal(await signupsOpen(fakeSql({ throwOn: 'config' }).sql), false);
  });
});

describe('decideSignup · closed means NO NEW IDENTITY, never "nobody may sign in"', () => {
  it('lets an EXISTING identity through while signups are closed', async () => {
    /**
     * Property 1, and the one that matters most in practice. Closing signups
     * after Wave 2 must not lock out the hundred lawyers who joined during it —
     * and their first act on a new device is to ask for a link.
     */
    const d = await decideSignup(
      fakeSql({ signupsRow: { enabled: false }, identityExists: true }).sql,
      'invited@example.test',
      SERVING,
    );
    assert.deepEqual(d, { allow: true, reason: 'existing-identity' });
  });

  it('refuses an UNKNOWN address while signups are closed', async () => {
    const d = await decideSignup(
      fakeSql({ signupsRow: { enabled: false }, identityExists: false }).sql,
      'stranger@example.test',
      SERVING,
    );
    assert.deepEqual(d, { allow: false, reason: 'closed-to-new-identities' });
  });

  it('matches an existing address case-insensitively, because a case-sensitive check fails CLOSED', async () => {
    /**
     * The asymmetry that makes this worth a test of its own. Elsewhere in this
     * codebase a case-sensitive matcher fails OPEN and admits too much; HERE it
     * would fail CLOSED and lock out a real advocate who typed a capital letter.
     * Asserted on the SQL rather than the result, because a fake cannot decide
     * case-folding on our behalf.
     */
    const f = fakeSql({ signupsRow: { enabled: false }, identityExists: true });
    await decideSignup(f.sql, 'Invited@Example.Test', SERVING);
    const identityQuery = f.queries().find((q) => q.includes('auth_user'));
    assert.ok(identityQuery, 'no identity lookup was made');
    assert.match(
      identityQuery,
      /lower\(email\)\s*=\s*lower\(/,
      'the lookup must fold case on both sides',
    );
  });

  it('checks auth_user, not users — an identity_only advocate is still a member', async () => {
    /**
     * The profile row appears only at `PATCH /me`. Checking `users` would refuse
     * every advocate who verified their email and closed the app during
     * onboarding — people who ARE in the cohort.
     */
    const f = fakeSql({ signupsRow: { enabled: false }, identityExists: true });
    await decideSignup(f.sql, 'partial@example.test', SERVING);
    const identityQuery = f.queries().find((q) => !q.includes('platform_config'));
    assert.ok(identityQuery?.includes('auth_user'), 'the membership check must read auth_user');
  });

  it('open signups let anyone through without an identity lookup at all', async () => {
    const f = fakeSql({ signupsRow: { enabled: true } });
    const d = await decideSignup(f.sql, 'new@example.test', SERVING);
    assert.deepEqual(d, { allow: true, reason: 'open' });
    assert.ok(
      !f.queries().some((q) => q.includes('auth_user')),
      'an open server must not query membership — that is a lookup with no purpose',
    );
  });

  it('an unreadable auth_user refuses — a read failure is not a way in', async () => {
    const d = await decideSignup(
      fakeSql({ signupsRow: { enabled: false }, throwOn: 'identity' }).sql,
      'stranger@example.test',
      SERVING,
    );
    assert.deepEqual(d, { allow: false, reason: 'closed-to-new-identities' });
  });

  it('refuses on a MISSING row in both serving environments', async () => {
    for (const env of [SERVING, STAGING]) {
      const d = await decideSignup(
        fakeSql({ signupsRow: undefined, identityExists: false }).sql,
        'stranger@example.test',
        env,
      );
      assert.equal(
        d.allow,
        false,
        `${env['LAWMIND_SERVING_ENV']} admitted a stranger on a missing row`,
      );
    }
  });
});

describe('decideSignup · a workstation is not a serving deployment', () => {
  it('does not consult the switch in development, even when closed', async () => {
    const f = fakeSql({ signupsRow: { enabled: false }, identityExists: false });
    const d = await decideSignup(f.sql, 'anyone@example.test', LOCAL);
    assert.deepEqual(d, { allow: true, reason: 'not-serving' });
    assert.equal(f.queries().length, 0, 'a non-serving deployment must not query at all');
  });

  it('an UNDECLARED environment is development, so local work is never broken by this', async () => {
    const f = fakeSql({ signupsRow: undefined });
    const d = await decideSignup(f.sql, 'anyone@example.test', {} as NodeJS.ProcessEnv);
    assert.deepEqual(d, { allow: true, reason: 'not-serving' });
  });

  it('NODE_ENV=production alone does NOT make a box serving — one source, N-5', async () => {
    /**
     * The same trap N-5 was: every bundler and process manager sets
     * `NODE_ENV=production`. If that alone switched this gate on, a developer's
     * machine would start refusing signups the first time something set it.
     */
    const f = fakeSql({ signupsRow: undefined });
    const d = await decideSignup(f.sql, 'anyone@example.test', {
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);
    assert.deepEqual(d, { allow: true, reason: 'not-serving' });
  });
});
