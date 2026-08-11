/**
 * The probe's own grading logic, tested against fixed HTTP responses rather
 * than a live network call — a live call is what `pnpm test` must never do
 * (slow, flaky, and it would silently start depending on production being up
 * to keep `test` green). `deployed-safety-cli.ts` and CI exercise the network
 * path for real; this file proves the grading is right once a response
 * arrives.
 *
 * **Criterion 4 of the task packet, in miniature**: the same fixtures used to
 * state the P0 (`docs/ai/tasks/001-p0-citation-query-safety.md` §CURRENT
 * STATE) must fail this grader, and the corrected shape must pass it. A probe
 * that always passes is not a probe.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PROBE_CASES, runDeployedSafetyProbe } from './deployed-safety.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Each of these is a FACTORY, not a fixed value — a `Response` body can only be
 * read once, and every probe run reads it exactly once per case, but the test
 * fixtures below reuse the same shape across several probe runs.
 */

/** The exact shape production returned on 11 Aug 2026 — no `parsed`, five plausible rows. */
const productionBrokenResponse = () =>
  jsonResponse({
    ok: true,
    data: {
      results: [
        { judgmentId: 'x', caseTitle: 'KAUSHAL KISHOR versus STATE OF UTTAR PRADESH & ORS.' },
        { judgmentId: 'y', caseTitle: 'VIJAY MADANLAL CHOUDHARY & ORS. versus UNION OF INDIA & ORS.' },
      ],
      unverifiedReferences: [],
      searchId: null,
      // no `parsed` field — this is the tell
    },
  });

const correctedZeroResponse = () =>
  jsonResponse({
    ok: true,
    data: { results: [], unverifiedReferences: [], searchId: null, parsed: 'Judgments reported as "(9999) 99 SCC 999".', total: 0 },
  });

const correctedMatchResponse = () =>
  jsonResponse({
    ok: true,
    data: {
      results: [{ judgmentId: 'a66596f5', caseTitle: 'S.R. BOMMAI versus UNION OF INDIA AND ORS.' }],
      unverifiedReferences: [],
      searchId: null,
      parsed: 'Judgments reported as "(1994) 3 SCC 1".',
      total: 1,
    },
  });

const correctedAmbiguousResponse = () =>
  jsonResponse({
    ok: true,
    data: {
      results: [
        { judgmentId: 'ee64c180', caseTitle: 'SOBHA HIBISCUS CONDOMINIUM versus MANAGING DIRECTOR...' },
        { judgmentId: 'baef360d', caseTitle: 'MONU KUMAR & ORS. versus M/S. METROMAX INFRASTRUCTURE PVT. LTD.' },
        { judgmentId: 'c7ff7a4e', caseTitle: 'SUBHECHHA WELFARE SOCIETY versus M/S. EARTH INFRASTRUCTURE PVT. LTD.' },
      ],
      unverifiedReferences: [],
      searchId: null,
      parsed: 'Judgments reported as "2020 INSC 189".',
      total: 3,
      ambiguous: true,
    },
  });

test('THE PRODUCTION P0 FAILS THE PROBE — the exact regression must be caught', async () => {
  const fetchImpl = (async () => productionBrokenResponse()) as unknown as typeof fetch;
  const report = await runDeployedSafetyProbe('http://fake', PROBE_CASES, fetchImpl);
  assert.equal(report.passed, false, 'the P0 shape must not pass');
  for (const c of report.cases) {
    assert.equal(c.passed, false, `${c.id} must fail — no parsed field, plausible-wrong results`);
    assert.match(c.reason, /parsed/);
  }
});

test('a corrected deployment PASSES — zero, exact-match, and ambiguity all handled correctly', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (_url: unknown, init: unknown) => {
    const body = JSON.parse((init as { body: string }).body) as { query: string };
    calls.push(body.query);
    if (body.query.includes('9999')) return correctedZeroResponse();
    if (body.query.includes('INSC 189')) return correctedAmbiguousResponse();
    return correctedMatchResponse();
  }) as unknown as typeof fetch;

  const report = await runDeployedSafetyProbe('http://fake', PROBE_CASES, fetchImpl);
  assert.equal(report.passed, true, report.cases.map((c) => c.reason).join(' | '));
  assert.equal(calls.length, 3, 'every case must be sent as its own request');
});

test('a citation that cannot exist returning even one result FAILS, however plausible', async () => {
  const fetchImpl = (async () =>
    jsonResponse({
      ok: true,
      data: { results: [{ judgmentId: 'z', caseTitle: 'ANY REAL CASE AT ALL' }], parsed: 'Judgments reported as "x".', total: 1 },
    })) as unknown as typeof fetch;

  const report = await runDeployedSafetyProbe(
    'http://fake',
    [PROBE_CASES[0]!],
    fetchImpl,
  );
  assert.equal(report.passed, false);
  assert.match(report.cases[0]!.reason, /cannot exist/);
});

test('a resolving citation returning a DIFFERENT case FAILS, never treated as close enough', async () => {
  const fetchImpl = (async () =>
    jsonResponse({
      ok: true,
      data: {
        results: [{ judgmentId: 'w', caseTitle: 'KAUSHAL KISHOR versus STATE OF UTTAR PRADESH & ORS.' }],
        parsed: 'Judgments reported as "(1994) 3 SCC 1".',
        total: 1,
      },
    })) as unknown as typeof fetch;

  const report = await runDeployedSafetyProbe(
    'http://fake',
    [PROBE_CASES[1]!],
    fetchImpl,
  );
  assert.equal(report.passed, false);
  assert.match(report.cases[0]!.reason, /different case/);
});

test('multiple real results with NO ambiguous flag FAILS — the exact forbidden shape', async () => {
  // The tell of a citation-shaped query falling through to semantic search:
  // several plausible rows, presented as an ordinary answer.
  const fetchImpl = (async () =>
    jsonResponse({
      ok: true,
      data: {
        results: [
          { judgmentId: 'a', caseTitle: 'CASE A' },
          { judgmentId: 'b', caseTitle: 'CASE B' },
        ],
        parsed: 'Judgments reported as "2020 INSC 189".',
        total: 2,
        // no `ambiguous` flag
      },
    })) as unknown as typeof fetch;

  const report = await runDeployedSafetyProbe('http://fake', [PROBE_CASES[2]!], fetchImpl);
  assert.equal(report.passed, false);
  assert.match(report.cases[0]!.reason, /NO `ambiguous: true` flag/);
});

test('only one result where ambiguity was expected FAILS loudly rather than silently passing', async () => {
  // If the source data is ever corrected (the collision de-duplicated), this
  // probe must say so explicitly rather than pass by accident — the fixture
  // needs updating, not silent tolerance.
  const fetchImpl = (async () =>
    jsonResponse({
      ok: true,
      data: {
        results: [{ judgmentId: 'a', caseTitle: 'CASE A' }],
        parsed: 'Judgments reported as "2020 INSC 189".',
        total: 1,
      },
    })) as unknown as typeof fetch;

  const report = await runDeployedSafetyProbe('http://fake', [PROBE_CASES[2]!], fetchImpl);
  assert.equal(report.passed, false);
  assert.match(report.cases[0]!.reason, /source data was corrected/);
});

test('an explicit not-found for a real citation PASSES — honesty, not omniscience, is required', async () => {
  const fetchImpl = (async () => correctedZeroResponse()) as unknown as typeof fetch;
  const report = await runDeployedSafetyProbe(
    'http://fake',
    [PROBE_CASES[1]!],
    fetchImpl,
  );
  assert.equal(report.passed, true);
});

test('an error envelope (e.g. INVALID_QUERY) FAILS rather than being read as a pass', async () => {
  const fetchImpl = (async () =>
    jsonResponse({ ok: false, error: { code: 'INVALID_QUERY', message: 'boom' } }, 400)) as unknown as typeof fetch;
  const report = await runDeployedSafetyProbe('http://fake', PROBE_CASES, fetchImpl);
  assert.equal(report.passed, false);
});

test('a network failure FAILS the case rather than throwing out of the probe', async () => {
  const fetchImpl = (async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;
  const report = await runDeployedSafetyProbe('http://fake', PROBE_CASES, fetchImpl);
  assert.equal(report.passed, false);
  assert.match(report.cases[0]!.reason, /ECONNREFUSED/);
});
