/**
 * The serving contract, and the four misconfigurations it exists to refuse.
 *
 * Each of these passes every check that existed before it: `resolveDatabases`
 * returns happily, `runPreflight` finds a healthy schema, `/health` answers 200.
 * That is the point — none of them is a bug in the code, all of them are a
 * deployment that is quietly not the deployment everything downstream assumes.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Hono } from 'hono';

import { forbiddenClusterRefusal } from './db-identity.ts';
import {
  evaluateServingContract,
  localServingRefusal,
  resolveServingEnv,
  servingContractRefusal,
} from './serving-contract.ts';

const REMOTE_CORPUS = 'postgres://u:p@corpus.internal.example.net:5432/lawmind_corpus';
const REMOTE_USER = 'postgres://u:p@user.internal.example.net:5432/lawmind_user';

/** A serving deployment with nothing wrong with it. */
const GOOD = {
  LAWMIND_SERVING_ENV: 'staging',
  NODE_ENV: 'production',
  CORPUS_DATABASE_URL: REMOTE_CORPUS,
  USER_DATABASE_URL: REMOTE_USER,
  DB_SPLIT_MODE: 'split',
  AUTH_SECRET: 'a'.repeat(48),
  AUTH_BASE_URL: 'https://staging-api.lawmind.co',
  RESEND_API_KEY: 're_not_a_real_key',
  LAWMIND_RELEASE_ID: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
};

const OPTS = { ownHostname: 'XC' };
const checks = (source: Record<string, string | undefined>) =>
  evaluateServingContract(source, OPTS).violations.map((v) => v.check);

describe('serving contract', () => {
  it('a correctly configured staging deployment has nothing to say', () => {
    const contract = evaluateServingContract(GOOD, OPTS);
    assert.equal(contract.servingEnv, 'staging');
    assert.equal(contract.serving, true);
    assert.deepEqual(contract.violations, []);
  });

  /**
   * `NODE_ENV=production` is set by bundlers, process managers and Railway for
   * reasons that have nothing to do with who the audience is. Inferring the
   * audience from it would fail-close a developer's `NODE_ENV=production pnpm
   * start` and would still not catch a staging box that forgot to say so.
   */
  it('does not infer the audience from NODE_ENV', () => {
    const contract = evaluateServingContract({ NODE_ENV: 'production' }, OPTS);
    assert.equal(contract.servingEnv, 'development');
    assert.equal(contract.serving, false);
    assert.deepEqual(contract.violations, []);
  });

  it('leaves development alone entirely', () => {
    assert.deepEqual(resolveServingEnv({}), 'development');
    assert.deepEqual(
      evaluateServingContract({ DATABASE_URL: 'postgres://x@127.0.0.1/y' }, OPTS).violations,
      [],
    );
  });

  /* ── the four fail-closed probes ───────────────────────────────────────── */

  /**
   * THE ONE THAT PASSES EVERYTHING ELSE. Both roles fall back to
   * `DATABASE_URL`, `DB_SPLIT_MODE` infers `single`, `index.ts` skips the
   * runtime identity verification because the mode is not `split`, and the
   * deployment serves production on one database — where a corpus restore's
   * `TRUNCATE ... CASCADE` empties `matter_authorities` with the corpus.
   */
  it('refuses a serving deployment that set only DATABASE_URL', () => {
    const { CORPUS_DATABASE_URL, USER_DATABASE_URL, DB_SPLIT_MODE, ...rest } = GOOD;
    void CORPUS_DATABASE_URL;
    void USER_DATABASE_URL;
    void DB_SPLIT_MODE;
    const found = checks({ ...rest, DATABASE_URL: REMOTE_CORPUS });
    assert.ok(found.includes('env:role-urls'), found.join(','));
    assert.ok(found.includes('env:db-split-mode'), found.join(','));
  });

  it('refuses the same physical database behind two variables', () => {
    /* The identity comparison itself lives in `db-split.ts` and is exercised by
     * its own suite; what this asserts is that a serving deployment can no
     * longer reach that check by NOT declaring the split. */
    const found = checks({ ...GOOD, DB_SPLIT_MODE: 'single' });
    assert.ok(found.includes('env:db-split-mode'), found.join(','));
  });

  it('refuses the founder workstation as the serving database', () => {
    for (const host of ['127.0.0.1', 'localhost', 'XC', 'xc.local', '192.168.1.42']) {
      const url = `postgres://u:p@${host}:5432/lawmind`;
      const found = checks({ ...GOOD, CORPUS_DATABASE_URL: url });
      assert.ok(
        found.includes('db-target:CORPUS_DATABASE_URL'),
        `${host} was accepted as a serving database`,
      );
    }
  });

  it('refuses a serving deployment with no release identity', () => {
    const { LAWMIND_RELEASE_ID, ...rest } = GOOD;
    void LAWMIND_RELEASE_ID;
    assert.ok(checks(rest).includes('env:release-identity'));
  });

  /* ── what it must NOT refuse ───────────────────────────────────────────── */

  /**
   * `postgres.railway.internal` is a provider's private DNS and is exactly where
   * a correctly configured deployment points. A rule that treated every private
   * name as a laptop would refuse the intended topology, which is how a
   * fail-closed guard gets switched off.
   */
  it('accepts a provider private hostname', () => {
    assert.equal(
      localServingRefusal('postgres://u:p@postgres.railway.internal:5432/railway', {
        ownHostname: 'XC',
        allowPrivate: false,
      }),
      null,
    );
  });

  it('accepts a private-range literal only when the operator states the topology', () => {
    const url = 'postgres://u:p@10.0.3.7:5432/lawmind_corpus';
    assert.notEqual(localServingRefusal(url, { ownHostname: 'XC', allowPrivate: false }), null);
    assert.equal(localServingRefusal(url, { ownHostname: 'XC', allowPrivate: true }), null);
  });

  /**
   * "Cannot be shown to be remote" is not "is remote". An unparseable URL proves
   * nothing, and the question this function answers is whether the target has
   * been PROVEN acceptable.
   */
  it('refuses a URL it cannot parse rather than passing it', () => {
    assert.notEqual(
      localServingRefusal('not a url', { ownHostname: 'XC', allowPrivate: true }),
      null,
    );
  });

  it('names every violation at once, not the first', () => {
    const message = servingContractRefusal(
      evaluateServingContract({ LAWMIND_SERVING_ENV: 'production' }, OPTS),
    );
    for (const expected of ['env:role-urls', 'env:AUTH_SECRET', 'env:release-identity']) {
      assert.ok(message.includes(expected), `refusal did not name ${expected}`);
    }
  });
});

describe('forbidden serving cluster', () => {
  const identity = {
    systemIdentifier: '7412345678901234567',
    database: 'lawmind',
    serverVersion: '16.4',
  };

  /**
   * The tunnel case. Every host rule in `serving-contract.ts` passes a
   * `cloudflared` hostname in front of a laptop; the cluster id does not change.
   */
  it('refuses the configured workstation cluster whatever the URL said', () => {
    const refusal = forbiddenClusterRefusal(identity, 'corpus', [identity.systemIdentifier]);
    assert.ok(refusal);
    assert.match(refusal, /7412345678901234567/);
  });

  it('is silent when the cluster is not on the list', () => {
    assert.equal(forbiddenClusterRefusal(identity, 'user', ['999']), null);
  });

  /** An empty list is no check. Stated, so it is never mistaken for a guarantee. */
  it('is silent when unconfigured, which is why the host rules still exist', () => {
    assert.equal(forbiddenClusterRefusal(identity, 'user', []), null);
  });
});

describe('GET /ready', () => {
  const app = (readiness: Parameters<typeof makeApp>[0]) => makeApp(readiness);
  function makeApp(readiness: (() => Promise<Record<string, unknown>>) | undefined) {
    const inner = new Hono();
    /* A local stand-in for the route's shape: the real one is exercised end to
     * end by `lcc-deploy-dry-run.mjs`, which boots the actual app. */
    inner.get('/ready', async (c) => {
      if (!readiness)
        return c.json({ ok: false, error: { code: 'READINESS_NOT_CONFIGURED' } }, 503);
      const r = (await readiness()) as {
        corpusReachable: boolean;
        userReachable: boolean;
        splitMode: string;
        rolesDistinct: boolean | null;
      };
      const ready =
        r.corpusReachable &&
        r.userReachable &&
        (r.splitMode === 'single' || r.rolesDistinct === true);
      return c.json(
        { ok: ready, ...(ready ? { data: r } : { error: { code: 'NOT_READY' } }) },
        ready ? 200 : 503,
      );
    });
    return inner;
  }

  /**
   * The failure `/health` cannot see: the corpus answers, so liveness is green
   * and the deployment stays in rotation, while every matter, annotation and
   * sign-in route 500s.
   */
  it('is 503 when the USER role is unreachable and the corpus is fine', async () => {
    const res = await app(async () => ({
      corpusReachable: true,
      userReachable: false,
      splitMode: 'split',
      rolesDistinct: null,
    })).request('/ready');
    assert.equal(res.status, 503);
  });

  it('is 503 when a declared split is really one database', async () => {
    const res = await app(async () => ({
      corpusReachable: true,
      userReachable: true,
      splitMode: 'split',
      rolesDistinct: false,
    })).request('/ready');
    assert.equal(res.status, 503);
  });

  it('is 200 when both roles answer and the split is proved', async () => {
    const res = await app(async () => ({
      corpusReachable: true,
      userReachable: true,
      splitMode: 'split',
      rolesDistinct: true,
    })).request('/ready');
    assert.equal(res.status, 200);
  });

  it('says so rather than inventing a verdict when no probe was supplied', async () => {
    assert.equal((await app(undefined).request('/ready')).status, 503);
  });
});
