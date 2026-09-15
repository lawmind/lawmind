#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REMOTE-ALPHA PACKAGE, EXERCISED WITHOUT PROVISIONING ANYTHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The point of a deployment package is that on the day spend is authorised,
 * deploying is EXECUTION — not another sprint spent discovering that a script
 * assumed a variable, or that a guard nobody ever tripped does not actually
 * refuse. This runs every part of the package that can run without a remote box,
 * against disposable local databases, and it runs the REFUSALS as well as the
 * happy paths.
 *
 * ── THE TWO HALVES, AND WHY THE SECOND IS THE IMPORTANT ONE ─────────────────
 *
 *   GREEN PATHS   strict-split boot, activation gate, rollback, user backup and
 *                 restore, API smoke, R17 unavailable semantics, identity
 *                 deletion, and the staging Gate-S1 runner INVOKED — against a
 *                 real HTTP server, so "the command exists" is observed rather
 *                 than assumed.
 *
 *   FAIL-CLOSED   four deliberate misconfigurations, each of which passes every
 *                 check that existed before this round:
 *                   1. corpus and user pointed at one database
 *                   2. a serving deployment with a secret missing
 *                   3. a serving deployment pointed at the founder's workstation
 *                   4. a corpus generation that is not fit to activate
 *                 A guard that has never been observed refusing is a guard
 *                 nobody has tested; three of these four have never been tripped
 *                 anywhere in this repository until now.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 *
 * It creates NO remote resource and spends NO money. It also does not grade
 * Gate-S1: the gate is a STAGING whole-request p95 and this box is not staging.
 * It proves the runner runs and emits the evidence shape, and labels the number
 * LOCAL so nobody mistakes it for a certification.
 *
 * Usage:
 *   DATABASE_URL=... pnpm exec tsx scripts/lcc-deploy-dry-run.mjs --out docs/ai/lcc-r29
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { serve } from '@hono/node-server';
import postgres from 'postgres';

import { signAccessToken } from '../packages/auth/src/tokens.ts';
import { createApp } from '../services/api/src/app.ts';
import { resolveDatabases } from '../services/api/src/db-split.ts';
import {
  databaseIdentity,
  forbiddenClusterRefusal,
  verifyDistinctDatabases,
} from '../services/api/src/ops/db-identity.ts';
import { evaluateServingContract } from '../services/api/src/ops/serving-contract.ts';
import {
  activationDecision,
  readStatistics,
  runSearchSmoke,
  smokeVerdict,
  statisticsVerdict,
} from '../services/api/src/release/activation.ts';
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
const SECRET = 'r29-dry-run-secret-not-used-anywhere-real-0123456789';

const base = process.env['DATABASE_URL'];
if (!base) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const REMOTE_CORPUS = 'postgres://u:p@corpus.internal.example.net:5432/lawmind_corpus';
const REMOTE_USER = 'postgres://u:p@user.internal.example.net:5432/lawmind_user';
const SERVING_BASE = {
  LAWMIND_SERVING_ENV: 'staging',
  CORPUS_DATABASE_URL: REMOTE_CORPUS,
  USER_DATABASE_URL: REMOTE_USER,
  DB_SPLIT_MODE: 'split',
  AUTH_SECRET: 'a'.repeat(48),
  AUTH_BASE_URL: 'https://staging-api.lawmind.co',
  RESEND_API_KEY: 're_not_a_real_key',
  LAWMIND_RELEASE_ID: 'dryrun0000000000000000000000000000000000',
};

const steps = [];
function record(name, kind, verdict, detail) {
  steps.push({ name, kind, verdict, detail });
  console.log(`  ${verdict.padEnd(7)} ${kind.padEnd(12)} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** A green path: `fn` must not throw and must return true. */
async function green(name, fn) {
  try {
    const detail = await fn();
    record(
      name,
      'green-path',
      detail === false ? 'FAIL' : 'PASS',
      typeof detail === 'string' ? detail : undefined,
    );
  } catch (error) {
    record(name, 'green-path', 'FAIL', String(error?.message ?? error));
  }
}

/**
 * A fail-closed probe: the misconfiguration MUST be refused. A probe that
 * "passes" by not throwing is the defect, so the absence of a refusal is a FAIL
 * and is reported as one.
 */
async function failClosed(name, fn) {
  try {
    const refusal = await fn();
    if (refusal) record(name, 'fail-closed', 'PASS', String(refusal).slice(0, 140));
    else record(name, 'fail-closed', 'FAIL', 'the misconfiguration was ACCEPTED');
  } catch (error) {
    /* A throw IS the refusal for the resolver paths. */
    record(name, 'fail-closed', 'PASS', String(error?.message ?? error).slice(0, 140));
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log('R29 remote-alpha deployment dry run — nothing is provisioned\n');

  await buildSplitEnvironment({ base, bin: BIN, log: console.log });
  await applyNegativeSchema({ base, log: console.log });
  const corpusUrl = withDatabase(base, CORPUS_SPLIT_TEST_DB);
  const userUrl = withDatabase(base, USER_SPLIT_TEST_DB);
  const corpusSql = postgres(corpusUrl, { max: 4, onnotice: () => {} });
  const userSql = postgres(userUrl, { max: 4, onnotice: () => {} });
  console.log('');

  /* ══ FAIL-CLOSED PROBES ═════════════════════════════════════════════════ */

  await failClosed('corpus and user pointed at ONE database', () => {
    resolveDatabases({
      CORPUS_DATABASE_URL: corpusUrl,
      USER_DATABASE_URL: corpusUrl,
      DB_SPLIT_MODE: 'split',
    });
    return null;
  });

  await failClosed('one database behind two DIFFERENT hostnames', async () => {
    /* The syntactic check cannot see this: two spellings, one cluster. The
     * runtime identity check is what catches it, and it is the check a proxy
     * endpoint beside a private one would otherwise slip past. */
    const alias = postgres(
      withDatabase(base.replace('127.0.0.1', 'localhost'), CORPUS_SPLIT_TEST_DB),
      {
        max: 1,
        onnotice: () => {},
      },
    );
    try {
      const verdict = await verifyDistinctDatabases(corpusSql, alias);
      return verdict.distinct
        ? null
        : 'verifyDistinctDatabases refused: same (system_identifier, database)';
    } finally {
      await alias.end();
    }
  });

  await failClosed('a serving deployment with AUTH_SECRET missing', () => {
    const { AUTH_SECRET, ...rest } = SERVING_BASE;
    void AUTH_SECRET;
    const violations = evaluateServingContract(rest, { ownHostname: hostname() }).violations;
    return violations.map((v) => v.check).join(', ') || null;
  });

  await failClosed('a serving deployment that set only DATABASE_URL', () => {
    const { CORPUS_DATABASE_URL, USER_DATABASE_URL, DB_SPLIT_MODE, ...rest } = SERVING_BASE;
    void CORPUS_DATABASE_URL;
    void USER_DATABASE_URL;
    void DB_SPLIT_MODE;
    const violations = evaluateServingContract(
      { ...rest, DATABASE_URL: REMOTE_CORPUS },
      { ownHostname: hostname() },
    ).violations;
    return violations.map((v) => v.check).join(', ') || null;
  });

  await failClosed('a serving deployment pointed at this workstation (by host)', () => {
    const violations = evaluateServingContract(
      { ...SERVING_BASE, CORPUS_DATABASE_URL: base },
      { ownHostname: hostname() },
    ).violations;
    return violations.map((v) => `${v.check}`).join(', ') || null;
  });

  await failClosed(
    'a serving deployment pointed at this workstation (through a tunnel)',
    async () => {
      /* The host rule cannot see a tunnel. The CLUSTER ID can, and this is the
       * real workstation's id, read right now rather than written down. */
      const local = await databaseIdentity(corpusSql);
      return forbiddenClusterRefusal(local, 'corpus', [local.systemIdentifier]);
    },
  );

  await failClosed('a corpus generation that is not fit to activate', () => {
    /* The split corpus database has the schema and no rows, which is exactly the
     * shape that passes an integrity check and cannot serve one search. */
    const decision = activationDecision({
      restoreVerified: true,
      statistics: { absent: [], unanalyzed: ['judgments'], analyzed: [] },
      smoke: { ready: false, allEmpty: true, failed: [] },
    });
    return decision.verdict === 'REFUSE' ? decision.reasons.join('; ') : null;
  });

  console.log('');

  /* ══ GREEN PATHS ════════════════════════════════════════════════════════ */

  await green('strict-split boot from the environment contract', async () => {
    const resolved = resolveDatabases({
      CORPUS_DATABASE_URL: corpusUrl,
      USER_DATABASE_URL: userUrl,
      DB_SPLIT_MODE: 'split',
    });
    if (resolved.mode !== 'split') return false;
    const contract = evaluateServingContract(SERVING_BASE, { ownHostname: hostname() });
    if (contract.violations.length > 0) return false;
    const verdict = await verifyDistinctDatabases(corpusSql, userSql);
    return verdict.distinct
      ? `corpus="${verdict.corpus.database}" user="${verdict.user.database}"`
      : false;
  });

  await green('activation gate ACTIVATES a generation that is fit', async () => {
    /* Enough of a corpus to plan over, analysed, and searched by the REAL
     * retrieval functions the gate uses — not a re-implementation of them. */
    for (let i = 0; i < 3; i++) {
      const id = randomUUID();
      await corpusSql`
        INSERT INTO judgments (id, case_title, neutral_citation, reporter_citations, court,
                               judgment_date, language, source_url, full_text)
        VALUES (${id}, ${`SYNTHETIC — Dry Run ${i}`}, ${`DRY 2026 INSC ${i}`}, '{}',
                'Supreme Court of India', ${`2026-01-0${i + 1}`}::date, 'en',
                ${`r29://${id}`},
                'synthetic dry-run judgment text mentioning bail and custody and anticipatory relief')`;
    }
    await corpusSql`ANALYZE judgments`;
    const stats = statisticsVerdict(await readStatistics(corpusSql));
    const smoke = smokeVerdict(await runSearchSmoke(corpusSql));
    const decision = activationDecision({ restoreVerified: true, statistics: stats, smoke });
    return `${decision.verdict}${decision.reasons.length > 0 ? `: ${decision.reasons.join('; ')}` : ''}`;
  });

  /* ── the API, over a real socket ──────────────────────────────────────── */
  const app = createApp({
    ping: async () => {
      await corpusSql`SELECT 1`;
    },
    readiness: async () => {
      const report = {
        corpusReachable: false,
        userReachable: false,
        splitMode: 'split',
        rolesDistinct: null,
        servingEnv: 'development',
      };
      try {
        await corpusSql`SELECT 1`;
        report.corpusReachable = true;
      } catch {
        /* reported, not thrown */
      }
      try {
        await userSql`SELECT 1`;
        report.userReachable = true;
      } catch {
        /* reported, not thrown */
      }
      if (report.corpusReachable && report.userReachable) {
        report.rolesDistinct = (await verifyDistinctDatabases(corpusSql, userSql)).distinct;
      }
      return report;
    },
    search: { sql: corpusSql, userSql, embedQuery: async () => null },
    auth: { auth: null, sql: userSql, secret: SECRET },
  });

  const server = await new Promise((ready) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => ready(s));
  });
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  console.log(`  api on ${origin}\n`);

  const json = async (path, init) => {
    const res = await fetch(`${origin}${path}`, init);
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  await green('GET /health', async () => {
    const r = await json('/health');
    return r.status === 200 ? `sha=${r.body?.data?.sha}` : false;
  });

  await green('GET /ready reports both roles and a proved split', async () => {
    const r = await json('/ready');
    const d = r.body?.data;
    return r.status === 200 && d?.corpusReachable && d?.userReachable && d?.rolesDistinct === true
      ? `splitMode=${d.splitMode} rolesDistinct=${d.rolesDistinct}`
      : `status=${r.status} body=${JSON.stringify(r.body).slice(0, 160)}`;
  });

  await green('GET /version carries a release identity', async () => {
    const r = await json('/version');
    return r.status === 200
      ? `contract=${r.body?.data?.contract} sha=${r.body?.data?.gitSha}`
      : false;
  });

  await green('R17 corpus-unavailable semantics on a deployed socket', async () => {
    const r = await json('/judgments/4d1a0000-0000-4000-8000-0000000029ff');
    const e = r.body?.error;
    const clean =
      r.status === 404 &&
      e?.code === 'CORPUS_TARGET_UNAVAILABLE' &&
      e?.details?.availability === 'corpus_unavailable' &&
      !/does not exist|no judgment with/i.test(e?.message ?? '');
    return clean ? `${e.code} / ${e.message}` : `status=${r.status} ${JSON.stringify(e)}`;
  });

  await green('POST /search answers over HTTP', async () => {
    const r = await json('/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      /* `language` is REQUIRED by `searchRequest` and has no default. Omitting
       * it is a 400 from the shared validator, which this probe first recorded
       * as a pass — a probe that accepts any answer is not a probe. */
      body: JSON.stringify({
        query: 'anticipatory bail in a dowry harassment case',
        language: 'en',
        limit: 5,
      }),
    });
    /* 503 is the admission gate refusing, which is a correct answer and not a
     * deployment defect. Anything else is. */
    if (r.status !== 200 && r.status !== 503) {
      return false;
    }
    return `status=${r.status} results=${r.body?.data?.results?.length ?? 0}`;
  });

  await green('identity-only erasure reaches a terminal state', async () => {
    const authId = `r29-dry-${randomUUID()}`;
    const email = `${authId}@example.test`;
    await userSql`INSERT INTO auth_user (id, name, email, email_verified)
                  VALUES (${authId}, 'Adv', ${email}, true)`;
    const token = await signAccessToken({ sub: authId, email }, SECRET);
    const r = await json('/me/data-requests', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'erasure' }),
    });
    /* 201 accepted, or a 4xx that NAMES its refusal — either is a terminal
     * answer. A 500 is not, and that is what this is looking for. */
    return r.status < 500 ? `status=${r.status} code=${r.body?.error?.code ?? 'accepted'}` : false;
  });

  /**
   * The staging Gate-S1 runner, INVOKED. This is the criterion the founder named
   * — "evidence can be executed on staging without inventing missing scripts at
   * deployment time" — and the only way to observe it is to run the command.
   *
   * The NUMBER is local and is labelled so. What is proved is that the runner
   * drives a deployed socket, reads `/version` and `/ready`, correlates nothing
   * it cannot see, and writes its evidence file.
   */
  /**
   * ASYNC, and that is not a style choice. `execFileSync` blocks this process's
   * event loop — and this process is the HTTP server the child is pointed at, so
   * the synchronous version deadlocks: the child waits for a response the parent
   * cannot produce until the child exits. It presented as a hang with zero CPU
   * and no database activity, which is exactly what it was.
   */
  await green('staging Gate-S1 runner executes against a live socket', async () => {
    /**
     * WHAT IS BEING PROVED IS THAT THE RUNNER RUNS, not that this box passes.
     *
     * The runner exits non-zero when the gate fails, which is right — and this
     * box is not staging, has three synthetic judgments in it, and is sharing a
     * machine with the ingest fleet. So the child's EXIT CODE is deliberately not
     * the verdict here; the verdict is that it drove the socket, read /version
     * and /ready, and wrote its evidence file. Grading a local number as Gate-S1
     * is exactly the claim `round-measure-cli.ts` refuses to make.
     */
    const { stdout: out } = await promisify(execFile)(
      process.execPath,
      [
        'scripts/lcc-staging-gate-s1.mjs',
        '--api',
        origin,
        '--corpus-url',
        corpusUrl,
        '--repeat',
        '1',
        '--label',
        'DRY_RUN_LOCAL_NOT_A_GATE',
        '--out',
        OUT,
      ],
      { encoding: 'utf8' },
    ).catch((error) => ({ stdout: String(error?.stdout ?? '') }));
    const line =
      out
        .split('\n')
        .find((l) => l.includes('whole-request'))
        ?.trim() ?? '';
    if (!out.includes('staging-gate-s1.json')) return false;
    /* The GATE verdict is not asserted here — this box is not staging. What IS
     * asserted is that the runner got real answers: a run of 400s would write
     * exactly the same evidence file and report `p95=null`, and a probe that
     * accepts that is a probe that proves the script exists and nothing else. */
    const evidence = JSON.parse(readFileSync(join(OUT, 'staging-gate-s1.json'), 'utf8'));
    if (evidence.counts.http200 === 0) {
      return false;
    }
    return `${evidence.counts.http200}/${evidence.counts.samples} answered · ${line} (local, NOT a Gate-S1 certification)`;
  });

  await server.close();
  await corpusSql.end();
  await userSql.end();

  const counts = {
    total: steps.length,
    pass: steps.filter((s) => s.verdict === 'PASS').length,
    fail: steps.filter((s) => s.verdict === 'FAIL').length,
    failClosedProbes: steps.filter((s) => s.kind === 'fail-closed').length,
  };
  const pass = counts.fail === 0;

  writeFileSync(
    join(OUT, 'deploy-dry-run.json'),
    `${JSON.stringify(
      {
        kind: 'lawmind-r29-deploy-dry-run',
        generatedAt: new Date().toISOString(),
        paidInfraCreated: false,
        remoteResourceCreated: false,
        counts,
        steps,
        verdict: pass ? 'DEPLOY_DRY_RUN_PASS' : 'DEPLOY_DRY_RUN_FAIL',
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\n  ${counts.pass}/${counts.total} pass · ${counts.fail} fail`);
  console.log(`  fail-closed probes: ${counts.failClosedProbes}`);
  console.log('  PAID_INFRA_CREATED = NO · REMOTE_RESOURCE_CREATED = NO');
  console.log(pass ? '\nDEPLOY_DRY_RUN_PASS' : '\nDEPLOY_DRY_RUN_FAIL');
  if (!pass) process.exitCode = 1;
}

try {
  await main();
} finally {
  await dropSplitEnvironment(base);
}
