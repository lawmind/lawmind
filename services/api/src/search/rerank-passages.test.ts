/**
 * The rule that stopped the reranker scoring 37.6% of candidates against an
 * empty string.
 *
 * The paths that matter here are the ones that DO NOT touch the database: a
 * defect that only appears when every candidate already has a passage would be
 * invisible in an integration test against a healthy corpus, and this is
 * precisely a defect about the unhealthy ones.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Sql } from 'postgres';

import { type RetrievedJudgment, passagesForRerank } from './retrieve.ts';

function candidate(
  id: string,
  operativeParagraph: string,
  evidenceWithheld = false,
): RetrievedJudgment {
  return {
    judgmentId: id,
    caseTitle: `case ${id}`,
    neutralCitation: null,
    reporterCitations: [],
    court: 'SC',
    judgmentDate: '2020-01-01',
    overruledStatus: 'none',
    overruledStatusStored: 'none',
    precedentialEffect: 'none',
    canAddToMatter: true,
    unappliedTreatment: null,
    treatmentAttribution: 'UNKNOWN' as const,
    overruledByJudgmentId: null,
    overruledParas: null,
    overruledNote: null,
    operativeParagraph,
    operativeParagraphNumber: null,
    operativeParagraphVerified: false,
    exactSpan: null,
    bodyText: { state: 'TEXT_UNKNOWN', grade: 'NONE', evidenceWithheld },
  };
}

/** Records whether the database was reached at all. */
function spySql(rows: { judgment_id: string; chunk_text: string }[]): {
  sql: Sql;
  calls: number;
} {
  const state = { calls: 0 };
  /**
   * Only a QUERY is counted, not a fragment.
   *
   * `postgres.js` uses the same tagged template for both: a SELECT is executed,
   * an `AND (...)` fragment interpolated into another template is not.
   * `passagesForRerank` builds one of each — the second through
   * `andBodyTextSafe` — so a double that counted every template call reported
   * two round trips where the code makes one, and the assertion that this
   * function does not query per candidate would have failed for the wrong
   * reason.
   *
   * `SELECT` is the discriminator because it is the thing being counted: a
   * statement that reads. It is a property of the string the caller wrote, not
   * a guess about intent.
   */
  const fn = (s: TemplateStringsArray, ..._v: unknown[]) => {
    if (s.join(' ').includes('SELECT')) state.calls++;
    return Promise.resolve(rows);
  };
  /**
   * `sql.unsafe` is part of the double because the code under test reaches it.
   *
   * `passagesForRerank` interpolates `andBodyTextSafe(sql)`, which calls
   * `sql.unsafe(...)` to name a column — and a bare tagged-template function has
   * no such method, so five tests in this file were failing with
   * `TypeError: sql.unsafe is not a function` rather than with an assertion.
   * A double that is missing a method the real object has does not test less,
   * it tests nothing, and the failure looks like a bug in the code.
   *
   * It returns a template-literal-shaped fragment because that is all the
   * caller does with it: interpolate it into another tagged template.
   */
  const sql = Object.assign(fn, {
    unsafe: (text: string) => text,
  }) as unknown as Sql;
  return {
    sql,
    get calls() {
      return state.calls;
    },
  };
}

const REAL =
  'The protection granted under Section 438 would not ordinarily be limited to a fixed period, ' +
  'and the accused remains entitled to its benefit until the trial concludes.';

test('NO DATABASE QUERY when every candidate already has a passage', () => {
  // The common case must stay free. A per-search round trip to fix nothing
  // would be a latency cost against a 3,000 ms budget.
  const spy = spySql([]);
  return passagesForRerank(spy.sql, [candidate('a', REAL), candidate('b', REAL)], 'v').then((p) => {
    assert.deepEqual(p, [REAL, REAL]);
    assert.equal(spy.calls, 0, 'the database was queried with nothing to fill');
  });
});

test('AN EMPTY PASSAGE IS FILLED — this is the whole defect', async () => {
  // 188 of 500 real candidates, measured 9 Aug 2026. A cross-encoder scoring a
  // query against "" ranks it last, every time.
  const spy = spySql([{ judgment_id: 'b', chunk_text: REAL }]);
  const out = await passagesForRerank(spy.sql, [candidate('a', REAL), candidate('b', '')], 'v');
  assert.equal(out[0], REAL, 'a candidate that had a passage was altered');
  assert.ok((out[1] ?? '').length > 0, 'the empty passage was left empty');
  assert.equal(spy.calls, 1);
});

test('whitespace counts as empty — a blank line is not a passage', async () => {
  const spy = spySql([{ judgment_id: 'a', chunk_text: REAL }]);
  const out = await passagesForRerank(spy.sql, [candidate('a', '   \n  ')], 'v');
  assert.ok((out[0] ?? '').trim().length > 0);
});

test('POSITIONS ARE PRESERVED — passage i must belong to candidate i', async () => {
  /**
   * The failure that would be invisible: scores come back as an array and are
   * zipped by index, so a misaligned fill would attach every score to the wrong
   * judgment and still produce a plausible-looking ranking.
   */
  const spy = spySql([
    { judgment_id: 'c', chunk_text: 'CCC filled' },
    { judgment_id: 'a', chunk_text: 'AAA filled' },
  ]);
  const out = await passagesForRerank(
    spy.sql,
    [candidate('a', ''), candidate('b', REAL), candidate('c', '')],
    'v',
  );
  assert.ok((out[0] ?? '').includes('AAA'), 'candidate a got the wrong passage');
  assert.equal(out[1], REAL, 'candidate b was disturbed');
  assert.ok((out[2] ?? '').includes('CCC'), 'candidate c got the wrong passage');
});

test('a judgment with no embedded chunk stays empty rather than borrowing a title', async () => {
  // It should not have been retrievable at all. Papering over it with the case
  // title would hide an ingest defect behind a plausible passage.
  const spy = spySql([]);
  const out = await passagesForRerank(spy.sql, [candidate('a', '')], 'v');
  assert.equal(out[0], '');
});

test('a cold embedder still fills, by chunk order rather than by distance', async () => {
  // Weak, but a cause title beats an empty string, and returning nothing here
  // would silently keep the defect this function exists to remove.
  const spy = spySql([{ judgment_id: 'a', chunk_text: REAL }]);
  const out = await passagesForRerank(spy.sql, [candidate('a', '')], null);
  assert.ok((out[0] ?? '').length > 0);
  assert.equal(spy.calls, 1);
});

test('an empty candidate list is not an error', async () => {
  const spy = spySql([]);
  assert.deepEqual(await passagesForRerank(spy.sql, [], 'v'), []);
  assert.equal(spy.calls, 0);
});
