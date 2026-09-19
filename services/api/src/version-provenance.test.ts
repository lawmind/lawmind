/**
 * ─────────────────────────────────────────────────────────────────────────────
 * N-5 AND N-2 — DEPLOYMENT IDENTITY, FROM ONE PLACE, WITHOUT INVENTING ANY OF IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * N-5, as Gate C observed it: `/version` reported `environment: "production"`
 * while `/ready` reported `servingEnv: "staging"` on the same box at the same sha.
 * "One label is lying, and it misroutes an incident."
 *
 * Neither was lying. They read different variables — `/version` took
 * `RAILWAY_ENVIRONMENT ?? NODE_ENV`, `/ready` took the serving contract. The fix
 * is not to correct one value; it is to leave only one function that can answer,
 * which is what these tests hold in place.
 *
 * N-2: `/version` answered `imageDigest: null` because the route contained the
 * literal `null`, so no deploy could populate it however carefully it built. The
 * mechanism now exists. These tests assert it stays honest in BOTH directions —
 * populated when the deployer proves an artifact, and absent, never a placeholder,
 * when it cannot.
 *
 * `NODE_ENV` gets a test of its own because reading it is the specific mistake
 * that produced N-5, and a fix nobody tests for is a fix that comes back.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createApp, type ReadinessReport } from './app.ts';
import { resolveServingEnv } from './ops/serving-contract.ts';

const APP_SOURCE = readFileSync(new URL('./app.ts', import.meta.url), 'utf8');

/** `/version` and `/ready` from one app instance, so the comparison is fair. */
async function bothLabels(readiness: () => Promise<ReadinessReport>) {
  const app = createApp({ ping: async () => {}, readiness });
  const version = (await (await app.request('/version')).json()) as {
    ok: boolean;
    data: {
      environment: string;
      gitSha: string;
      deployedAt: string | null;
      imageDigest: string | null;
    };
  };
  const ready = (await (await app.request('/ready')).json()) as {
    data: { servingEnv: string };
  };
  return { version: version.data, ready: ready.data };
}

/**
 * Exactly what `index.ts` does, and the fidelity matters.
 *
 * `index.ts` builds its readiness report with `servingEnv:
 * servingContract.servingEnv`, and that contract is
 * `evaluateServingContract(process.env)` — i.e. `resolveServingEnv(process.env)`.
 * Passing a hand-written string instead would test that two values I chose are
 * equal, which proves nothing about the product. Reading the same resolver from
 * the same `process.env` is the whole claim under test: ONE source.
 */
const readinessLikeIndex = async (): Promise<ReadinessReport> => ({
  corpusReachable: true,
  userReachable: true,
  splitMode: 'single',
  rolesDistinct: null,
  servingEnv: resolveServingEnv(process.env),
});

/** Set the declaration, build a fresh app, restore. `environment` is read at createApp. */
async function underServingEnv(declared: string | undefined) {
  const before = process.env['LAWMIND_SERVING_ENV'];
  if (declared === undefined) delete process.env['LAWMIND_SERVING_ENV'];
  else process.env['LAWMIND_SERVING_ENV'] = declared;
  try {
    return await bothLabels(readinessLikeIndex);
  } finally {
    if (before === undefined) delete process.env['LAWMIND_SERVING_ENV'];
    else process.env['LAWMIND_SERVING_ENV'] = before;
  }
}

describe('N-5 · /version and /ready answer the environment question from one source', () => {
  it('agrees with /ready for every value the serving contract can hold', async () => {
    /**
     * All three, plus undeclared. The Gate-C mismatch was
     * production-vs-staging, and a test that only checked that pair would miss a
     * fix that special-cased it.
     */
    for (const env of ['development', 'staging', 'production', undefined] as const) {
      const { version, ready } = await underServingEnv(env);
      assert.equal(
        version.environment,
        ready.servingEnv,
        `declared ${String(env)}: /version said ${version.environment}, /ready said ${ready.servingEnv}`,
      );
    }
  });

  it('a staging box running NODE_ENV=production reports staging on BOTH — the Gate-C case', async () => {
    const beforeNode = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const { version, ready } = await underServingEnv('staging');
      assert.equal(
        version.environment,
        'staging',
        '/version claimed production on a staging box again',
      );
      assert.equal(ready.servingEnv, 'staging');
    } finally {
      if (beforeNode === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = beforeNode;
    }
  });

  it('reads LAWMIND_SERVING_ENV and NOT NODE_ENV — the exact source of the defect', () => {
    /**
     * The resolver directly, as the unit under the two tests above.
     * `NODE_ENV=production` with a staging declaration is precisely the
     * configuration that produced the Gate-C mismatch, and
     * `ops/serving-contract.ts` explains why it is legitimate: every bundler and
     * process manager sets `NODE_ENV=production` for reasons unrelated to who the
     * audience is.
     */
    assert.equal(
      resolveServingEnv({ LAWMIND_SERVING_ENV: 'staging', NODE_ENV: 'production' }),
      'staging',
    );
    assert.equal(resolveServingEnv({ NODE_ENV: 'production' }), 'development');
    assert.equal(resolveServingEnv({}), 'development');
  });

  it('no longer consults RAILWAY_ENVIRONMENT or NODE_ENV anywhere near /version', () => {
    /**
     * A source assertion, because the behavioural test above cannot see a
     * fallback that only fires when `LAWMIND_SERVING_ENV` is unset AND
     * `RAILWAY_ENVIRONMENT` is set — a combination no test process has. Railway
     * production is HISTORICAL / RETIRED, so that branch could only ever have
     * been dead or wrong.
     */
    const versionAt = APP_SOURCE.indexOf("app.get('/version'");
    assert.notEqual(versionAt, -1, 'the /version route has moved');
    const routeBody = APP_SOURCE.slice(versionAt, versionAt + 1200);
    assert.ok(
      !/process\.env\['RAILWAY_ENVIRONMENT'\]/.test(routeBody),
      'RAILWAY_ENVIRONMENT is back in the /version route — it outranked the real source once already',
    );
    assert.ok(
      !/process\.env\['NODE_ENV'\]/.test(routeBody),
      'NODE_ENV is back in the /version route — this is exactly how N-5 happened',
    );
  });
});

describe('N-2 · deployment provenance is a mechanism, and it never invents a value', () => {
  it('imageDigest is no longer a hardcoded null that a deploy could not populate', () => {
    const versionAt = APP_SOURCE.indexOf("app.get('/version'");
    const routeBody = APP_SOURCE.slice(versionAt, versionAt + 1200);
    assert.ok(
      !/imageDigest:\s*null/.test(routeBody),
      'imageDigest is hardcoded null again — no deployer can populate it, which was N-2',
    );
    assert.ok(
      /imageDigest:\s*artifactDigest/.test(routeBody),
      'imageDigest must come from build-info so the deploy action can set it',
    );
  });

  it('reports absence as null rather than as a placeholder, locally and in CI', async () => {
    const { version } = await underServingEnv('development');
    /**
     * This suite runs with no artifact, so `null` is the CORRECT answer and the
     * assertion is that nothing fabricated one. A string like "unknown",
     * "local" or "" here would be worse than null: it reads as a value, and an
     * operator comparing two deployments would find them equal.
     */
    assert.equal(version.imageDigest, null);
    assert.equal(version.deployedAt, null);
  });

  it('carries the four fields that identify a deployment, and no invented fifth', async () => {
    const { version } = await underServingEnv('production');
    /**
     * gitSha · deployedAt · imageDigest · environment. A `releaseId` is
     * deliberately NOT here: it would carry nothing the first three lack, and
     * adding a field to /version is an additive contract amendment requiring a
     * CCR under roadmap §3.7 — not a quiet extra key.
     */
    for (const field of ['gitSha', 'deployedAt', 'imageDigest', 'environment'] as const) {
      assert.ok(field in version, `/version lost ${field}`);
    }
    assert.ok(!('releaseId' in version), 'releaseId was added to /version without a CCR');
    assert.equal(typeof version.gitSha, 'string');
    assert.ok(
      version.gitSha.length > 0,
      'gitSha must never be empty; "unknown" is the honest floor',
    );
  });
});
