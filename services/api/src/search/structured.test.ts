/**
 * The no-blend rule, which is the whole safety property of structured search.
 *
 * The failure being prevented does not look like a failure. `judge:"Kania" AND
 * section:138` returning three cheque cases by other judges does not read as
 * *"we found nothing and guessed"* — it reads as *"these are the Kania cases"*,
 * and the advocate has no way to tell.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Sql } from 'postgres';

import { answerStructured } from './structured.ts';

/** Returns a fixed count then a fixed page, in the order `answerStructured` asks. */
function fakeSql(count: number, rows: unknown[] = []): { sql: Sql; queries: number } {
  const state = { queries: 0 };
  const sql = ((strings: TemplateStringsArray) => {
    state.queries++;
    const text = strings.join(' ');
    return Promise.resolve(text.includes('count(*)') ? [{ n: count }] : rows);
  }) as unknown as Sql;
  return {
    sql,
    get queries() {
      return state.queries;
    },
  };
}

test('ORDINARY PROSE IS NOT STRUCTURED, and never becomes a syntax error', async () => {
  // The common case. An advocate typing a sentence must get results, not a
  // parse error — which would be the worst possible first impression.
  const spy = fakeSql(0);
  for (const prose of [
    'bail granted after conviction',
    'whether anticipatory bail may be limited in point of time',
    'bail or parole',
    'क्या अग्रिम जमानत समय-सीमा में बांधी जा सकती है',
  ]) {
    const out = await answerStructured(spy.sql, prose, 5);
    assert.equal(out.kind, 'not_structured', `prose was treated as structured: ${prose}`);
  }
  assert.equal(spy.queries, 0, 'prose reached the database through the structured path');
});

test('a structured query that matches returns ONLY those rows, with the interpretation', async () => {
  const spy = fakeSql(214, [{ id: 'a', case_title: 'X versus Y', reporter_citations: [] }]);
  const out = await answerStructured(spy.sql, 'judge:"CHANDRACHUD" AND type:criminal', 5);
  assert.equal(out.kind, 'matched');
  if (out.kind !== 'matched') return;
  assert.equal(out.total, 214);
  assert.match(out.parsed, /decided by a judge matching/);
  assert.match(out.parsed, /criminal side/);
});

test('ZERO MATCHES RETURNS no_match — NOT a fallback to semantic search', async () => {
  /**
   * The rule this file exists for. Falling back here would show an advocate
   * results that do not satisfy the query they typed, presented as though they
   * did.
   */
  const spy = fakeSql(0);
  const out = await answerStructured(spy.sql, 'judge:"NOBODY AT ALL"', 5);
  assert.equal(out.kind, 'no_match');
  if (out.kind !== 'no_match') return;
  assert.match(out.parsed, /NOBODY AT ALL/, 'the advocate must see what was searched for');
});

test('no_match and not_structured are DIFFERENT ANSWERS', async () => {
  // Collapsing them would let "the corpus has no such judgment" be rendered
  // identically to "we ran a different search instead".
  const a = await answerStructured(fakeSql(0).sql, 'judge:"NOBODY"', 5);
  const b = await answerStructured(fakeSql(0).sql, 'some ordinary prose here', 5);
  assert.notEqual(a.kind, b.kind);
});

test('a malformed query is INVALID, carrying the offset of the mistake', async () => {
  const spy = fakeSql(0);
  const out = await answerStructured(spy.sql, 'judge:"Kania" AND (court:"SC"', 5);
  assert.equal(out.kind, 'invalid');
  if (out.kind !== 'invalid') return;
  assert.match(out.message, /Unclosed "\("/);
  assert.equal(out.offset, 18);
  assert.equal(spy.queries, 0, 'a malformed query still hit the database');
});

test('an unknown field lists the valid ones, so the typo is fixable', async () => {
  const out = await answerStructured(fakeSql(0).sql, 'judgw:"Kania"', 5);
  assert.equal(out.kind, 'invalid');
  if (out.kind !== 'invalid') return;
  assert.ok(out.validFields?.includes('judge'));
});

test('a pure negation is refused rather than answered with 38,000 rows', async () => {
  const out = await answerStructured(fakeSql(0).sql, 'NOT section:302', 5);
  assert.equal(out.kind, 'invalid');
});

test('the count is independent of the page, so "214 results" is not "5 results"', async () => {
  // An advocate deciding whether to narrow a search needs the total, and a page
  // length reported as a total would make every search look equally broad.
  const out = await answerStructured(fakeSql(1237, [{ id: 'a' }]).sql, 'section:482 act:"CrPC"', 5);
  assert.equal(out.kind, 'matched');
  if (out.kind !== 'matched') return;
  assert.equal(out.total, 1237);
});
