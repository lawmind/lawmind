/**
 * API PARITY FOR THE SHARED CITATION EXTRACTOR.
 *
 * The semantic oracle belongs to NEW2 in `@lawmind/ingest/citations`. This test
 * owns one narrower question: does every API citation-input path canonicalise
 * the same token to the same key as the shared extractor does today?
 *
 * That distinction makes the harness durable across a parser correction. It
 * passes under the current shared semantics and keeps passing when NEW2 changes
 * those semantics, provided every API consumer changes with the shared result.
 * There is no copied citation regex and no independent expected citation here.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractCitations, normaliseCitation } from '@lawmind/ingest/citations';
import type { Sql } from 'postgres';

import { canonicalKeyFor } from '../citations/resolver.ts';
import { attachCitesJudgmentId } from '../judgments/citations.ts';
import { parse } from './qlang/parse.ts';
import { citationLookupKey, classifyQuery, warrantsExactLookup } from './query-shape.ts';
import { answerStructured } from './structured.ts';

type KeySpy = { readonly sql: Sql; readonly key: () => string | null };

/**
 * The structured and paragraph paths hand their key to the shared SQL fragment.
 * Capture that boundary without a database; query results are irrelevant to a
 * canonicalisation parity test.
 */
function keySpy(): KeySpy {
  let captured: string | null = null;
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const source = strings.join(' ');
    if (source.includes('upper(regexp_replace(coalesce(j.neutral_citation')) {
      captured = values.find((value): value is string => typeof value === 'string') ?? null;
      return { source, values };
    }
    if (source.includes('count(*)')) return Promise.resolve([{ n: 0 }]);
    return Promise.resolve([]);
  }) as unknown as Sql;
  return { sql, key: () => captured };
}

function sharedKey(text: string): string | null {
  const [first] = extractCitations(text);
  return first ? citationLookupKey(normaliseCitation(first.raw)) : null;
}

function classifierKey(text: string): string | null {
  const query = classifyQuery(text);
  return query.shape === 'citation' && query.citation !== null
    ? citationLookupKey(query.citation)
    : null;
}

async function structuredKey(text: string): Promise<string | null> {
  const spy = keySpy();
  await answerStructured(spy.sql, text, 5);
  return spy.key();
}

async function paragraphKey(text: string): Promise<string | null> {
  const spy = keySpy();
  await attachCitesJudgmentId(
    spy.sql,
    [{ paragraphIndex: 0, paragraphNumber: null, text }],
    '00000000-0000-4000-8000-000000000000',
  );
  return spy.key();
}

/**
 * LCC R17's frozen boundary controls, unchanged: ordinary forms, valid suffix
 * separators, glued suffixes, and tails that the shared parser may not absorb.
 */
const FROZEN_CONTROLS: readonly { readonly text: string; readonly why: string }[] = [
  { text: '2025:DHC:8491', why: 'plain' },
  { text: '2023:AHC:152051', why: 'plain, six-digit number' },
  { text: '2023:KHC-D:1', why: 'hyphenated COURT token — not a suffix' },
  { text: '2025:DHC:8491-DB', why: 'valid -DB, isolated' },
  { text: '2023:AHC:152051-FB', why: 'valid -FB, isolated' },
  { text: '2026:PHHC:027747-DB', why: '-DB on a zero-padded six-digit number' },
  { text: '2025:DHC:8491-DB.', why: '-DB then a full stop' },
  { text: '2025:DHC:8491-DB, and', why: '-DB then a comma' },
  { text: '(2025:DHC:8491-DB)', why: '-DB inside parentheses' },
  { text: '2025:DHC:8491-DB\nThis Court', why: '-DB then a line break' },
  { text: '2025:DHC:8491-DB\r\nHeld', why: '-DB then CRLF' },
  { text: '2025:DHC:8491-DB\tHeld', why: '-DB then a tab' },
  { text: 'Neutral Citation No. - 2023:AHC:152051-DB', why: 'the printed label form' },
  { text: '2025:DHC:8491-SB', why: 'negative: -SB is not a recognised suffix' },
  { text: '2025:DHC:8491-Crl.A.', why: 'negative: a case-type tail, not a suffix' },
  { text: '2025:DHC:8491-DBThis Court held', why: 'glued -DB boundary' },
  { text: '2023:AHC:111864-DBNeutral Citation', why: 'glued -DB label boundary' },
  { text: '2023:AHC:152051-FBOrder', why: 'glued -FB boundary' },
];

describe('neutral-citation boundary follows the shared parser', () => {
  for (const control of FROZEN_CONTROLS) {
    it(`classifyQuery parity: ${JSON.stringify(control.text)} — ${control.why}`, () => {
      const expected = sharedKey(control.text);
      assert.notEqual(expected, null, 'the frozen input no longer contains a shared citation');
      assert.equal(classifierKey(control.text), expected);
    });

    it(`bare structured parity: ${JSON.stringify(control.text)} — ${control.why}`, async () => {
      const expected = sharedKey(control.text);
      assert.notEqual(expected, null, 'the frozen input no longer contains a shared citation');
      assert.equal(await structuredKey(control.text), expected);
    });

    it(`paragraph navigation parity: ${JSON.stringify(control.text)} — ${control.why}`, async () => {
      const expected = sharedKey(control.text);
      assert.notEqual(expected, null, 'the frozen input no longer contains a shared citation');
      assert.equal(await paragraphKey(control.text), expected);
    });
  }

  /** `cite:` absorption is the fourth R17 API entry path and applies to spaced forms. */
  for (const text of ['1995 INSC 227', 'AIR 1973 SC 1461', '2020 INSC 189']) {
    it(`cite: parser parity: ${text}`, () => {
      const expected = sharedKey(text);
      assert.notEqual(expected, null, 'the shared parser found no citation');
      const node = parse(`cite:${text}`);
      assert.equal(node.kind, 'term');
      assert.equal(node.kind === 'term' ? node.field : null, 'cite');
      assert.equal(node.kind === 'term' ? citationLookupKey(node.value) : null, expected);
    });
  }

  it('two distinct citations remain an intentional layer difference', () => {
    const text = '2025:DHC:8491-DB and 2025:DHC:8492';
    assert.equal(extractCitations(text).length, 2, 'the API extractor must see both citations');
    const query = classifyQuery(text);
    assert.equal(query.shape, 'citation');
    assert.equal(warrantsExactLookup(query), true);
  });

  it('canonicalKeyFor is faithful to the shared token it is given', () => {
    for (const text of ['2025:DHC:8491-DB', '2025:DHC:8491']) {
      const [citation] = extractCitations(text);
      assert.ok(citation);
      const result = canonicalKeyFor(citation.raw);
      assert.equal(result.refused, false);
      assert.equal((result as { key: string }).key, sharedKey(text));
    }
  });

  it('a neutral citation is not a reporter citation, so it cannot be an alias', () => {
    for (const neutral of ['2025:DHC:8491-DB', '2023:AHC:111864', '2023:KHC-D:1']) {
      assert.equal(/\b(AIR|SCC)\b/.test(neutral), false, `${neutral} must not read as AIR/SCC`);
      assert.match(neutral, /^\d{4}:/);
    }
  });
});
