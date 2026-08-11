/**
 * The judgment-detail probe's grading logic, tested against fixed HTTP
 * responses and a fake database — no live network call and no live database,
 * matching `deployed-safety.test.ts`'s own reasoning: `pnpm test` must never
 * depend on production or a real corpus being reachable to stay green.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Sql } from 'postgres';

import { runDeployedJudgmentSafetyProbe } from './deployed-judgment-safety.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type FakeDbConfig = {
  citationlessRow?: { id: string } | null;
  overruledRow?: { id: string; overruled_status: string } | null;
};

/** Dispatches on the query text, matching `preflight.test.ts`'s fakeSql. */
function fakeSql(config: FakeDbConfig = {}): Sql {
  const citationlessRow =
    config.citationlessRow === undefined ? { id: 'citationless-id' } : config.citationlessRow;
  const overruledRow =
    config.overruledRow === undefined ? { id: 'overruled-id', overruled_status: 'set_aside' } : config.overruledRow;

  const sql = ((strings: TemplateStringsArray) => {
    const text = strings.join(' ');
    if (text.includes('neutral_citation IS NULL')) {
      return Promise.resolve(citationlessRow ? [citationlessRow] : []);
    }
    if (text.includes("overruled_status != 'none'")) {
      return Promise.resolve(overruledRow ? [overruledRow] : []);
    }
    throw new Error(`fakeSql: unrecognised query — ${text}`);
  }) as unknown as Sql;
  return sql;
}

/** Routes by the requested path — the two probe cases hit different ids. */
function fakeFetch(responses: Record<string, Response | (() => Response)>): typeof fetch {
  return (async (input: string | URL) => {
    const url = String(input);
    for (const [id, response] of Object.entries(responses)) {
      if (url.endsWith(`/judgments/${id}`)) {
        return typeof response === 'function' ? response() : response;
      }
    }
    throw new Error(`fakeFetch: no fixture for ${url}`);
  }) as typeof fetch;
}

test('no citationless judgment in the corpus is a genuine pass, not a hidden skip', async () => {
  const sql = fakeSql({ citationlessRow: null });
  const fetchImpl = fakeFetch({
    'overruled-id': () => jsonResponse({ ok: true, data: { overruledStatus: 'set_aside' } }),
  });
  const report = await runDeployedJudgmentSafetyProbe('https://example.test', sql, fetchImpl);
  const c = report.cases.find((x) => x.id === 'citationless-judgment');
  assert.equal(c?.passed, true);
  assert.match(c?.reason ?? '', /nothing to probe/);
});

test('a citationless judgment round-tripping null/empty passes', async () => {
  const sql = fakeSql();
  const fetchImpl = fakeFetch({
    'citationless-id': () =>
      jsonResponse({ ok: true, data: { neutralCitation: null, reporterCitations: [] } }),
    'overruled-id': () => jsonResponse({ ok: true, data: { overruledStatus: 'set_aside' } }),
  });
  const report = await runDeployedJudgmentSafetyProbe('https://example.test', sql, fetchImpl);
  const c = report.cases.find((x) => x.id === 'citationless-judgment');
  assert.equal(c?.passed, true);
});

test('a fabricated citation on a citationless judgment fails, loudly', async () => {
  const sql = fakeSql();
  const fetchImpl = fakeFetch({
    'citationless-id': () =>
      jsonResponse({ ok: true, data: { neutralCitation: '(2019) 4 SCC 221', reporterCitations: [] } }),
    'overruled-id': () => jsonResponse({ ok: true, data: { overruledStatus: 'set_aside' } }),
  });
  const report = await runDeployedJudgmentSafetyProbe('https://example.test', sql, fetchImpl);
  const c = report.cases.find((x) => x.id === 'citationless-judgment');
  assert.equal(c?.passed, false);
  assert.match(c?.reason ?? '', /fabricated/);
});

test('overruledStatus matching the stored value passes', async () => {
  const sql = fakeSql();
  const fetchImpl = fakeFetch({
    'citationless-id': () => jsonResponse({ ok: true, data: { neutralCitation: null, reporterCitations: [] } }),
    'overruled-id': () => jsonResponse({ ok: true, data: { overruledStatus: 'set_aside' } }),
  });
  const report = await runDeployedJudgmentSafetyProbe('https://example.test', sql, fetchImpl);
  const c = report.cases.find((x) => x.id === 'overruled-metadata');
  assert.equal(c?.passed, true);
});

test('a stale "none" served for a set_aside row fails — the exact danger this probe exists for', async () => {
  const sql = fakeSql();
  const fetchImpl = fakeFetch({
    'citationless-id': () => jsonResponse({ ok: true, data: { neutralCitation: null, reporterCitations: [] } }),
    'overruled-id': () => jsonResponse({ ok: true, data: { overruledStatus: 'none' } }),
  });
  const report = await runDeployedJudgmentSafetyProbe('https://example.test', sql, fetchImpl);
  const c = report.cases.find((x) => x.id === 'overruled-metadata');
  assert.equal(c?.passed, false);
  assert.match(c?.reason ?? '', /stored value is "set_aside"/);
});

test('a non-200 response fails the case instead of throwing', async () => {
  const sql = fakeSql();
  const fetchImpl = fakeFetch({
    'citationless-id': () => jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'gone' } }, 404),
    'overruled-id': () => jsonResponse({ ok: true, data: { overruledStatus: 'set_aside' } }),
  });
  const report = await runDeployedJudgmentSafetyProbe('https://example.test', sql, fetchImpl);
  const c = report.cases.find((x) => x.id === 'citationless-judgment');
  assert.equal(c?.passed, false);
  assert.equal(c?.httpStatus, 404);
});
