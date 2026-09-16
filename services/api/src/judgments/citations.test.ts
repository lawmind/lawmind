/**
 * `attachCitesJudgmentId` — never guesses on an ambiguous or self-referencing
 * match, resolves once per distinct citation rather than once per paragraph.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Sql } from 'postgres';

import { attachCitesJudgmentId } from './citations.ts';
import type { JudgmentParagraph } from './paragraphs.ts';

/**
 * The resolver runs its lookups inside one transaction that first sets
 * `plan_cache_mode` (LCC R30). A fake pool therefore needs `begin`, and answers
 * that one `SET LOCAL` itself so each fake below only describes lookups.
 */
function transactional(fake: (strings: TemplateStringsArray, ...values: unknown[]) => unknown): Sql {
  const tx = (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.join(' ').includes('plan_cache_mode') ? Promise.resolve([]) : fake(strings, ...values);
  return Object.assign(tx, { begin: (fn: (t: unknown) => unknown) => fn(tx) }) as unknown as Sql;
}

function paragraph(paragraphIndex: number, text: string, paragraphNumber: number | null = paragraphIndex + 1): JudgmentParagraph {
  return { paragraphNumber, paragraphIndex, text };
}

test('a paragraph with no citation is untouched', async () => {
  const paragraphs = [paragraph(0, 'The court held that the appeal fails.')];
  const out = await attachCitesJudgmentId(fakeSqlThatAlwaysResolvesTo('bommai-id'), paragraphs, 'own-id');
  assert.deepEqual(out, paragraphs);
  assert.equal('citesJudgmentId' in out[0]!, false);
});

test('a citation resolving to exactly one other judgment is attached', async () => {
  const paragraphs = [paragraph(0, 'As held in (1994) 3 SCC 1, the appeal fails.')];
  const out = await attachCitesJudgmentId(fakeSqlThatAlwaysResolvesTo('bommai-id'), paragraphs, 'own-id');
  assert.equal(out[0]?.citesJudgmentId, 'bommai-id');
});

/**
 * Resolves any key to exactly one id — isolates "does attachment happen" from
 * "is the normalisation right" (covered separately by `citationLookupKey`'s
 * own tests). `citationMatchFragment` (inner) and the outer
 * `SELECT j.id FROM judgments` query are both `sql` tagged-template calls;
 * the inner one always fires synchronously just before the outer one within
 * a single `resolveOne` call, so a plain boolean flag set on the inner call
 * and read on the outer one is safe across `Promise.all`'s parallel dispatch
 * — each `resolveOne` invocation's synchronous prefix completes before the
 * next one starts; only the `await` suspends.
 */
function fakeSqlThatAlwaysResolvesTo(id: string): Sql {
  let sawFragment = false;
  return transactional((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(' ');
    if (text.includes('regexp_replace')) {
      sawFragment = true;
      return 'fragment-placeholder';
    }
    if (text.includes('FROM judgments')) {
      const ownId = String(values[1]);
      return Promise.resolve(sawFragment && id !== ownId ? [{ id }] : []);
    }
    throw new Error(`fakeSql: unrecognised query — ${text}`);
  });
}

test('a citation resolving to more than one judgment is dropped, never guessed', async () => {
  const paragraphs = [paragraph(0, 'As held in (1994) 3 SCC 1, the appeal fails.')];
  const sql = transactional((strings: TemplateStringsArray) => {
    const text = strings.join(' ');
    if (text.includes('regexp_replace')) return 'fragment-placeholder';
    if (text.includes('FROM judgments')) return Promise.resolve([{ id: 'a' }, { id: 'b' }]);
    throw new Error(`unrecognised query — ${text}`);
  });

  const out = await attachCitesJudgmentId(sql, paragraphs, 'own-id');
  assert.equal('citesJudgmentId' in out[0]!, false);
});

test('a self-citation is excluded, not linked back to the same page', async () => {
  const paragraphs = [paragraph(0, 'As held in (1994) 3 SCC 1, the appeal fails.')];
  const out = await attachCitesJudgmentId(fakeSqlThatAlwaysResolvesTo('own-id'), paragraphs, 'own-id');
  assert.equal('citesJudgmentId' in out[0]!, false);
});

test('the same citation repeated across paragraphs resolves once, not per paragraph', async () => {
  const paragraphs = [
    paragraph(0, 'As held in (1994) 3 SCC 1, the appeal fails.'),
    paragraph(1, 'Reaffirming (1994) 3 SCC 1 once more.'),
  ];
  let fragmentCalls = 0;
  const sql = transactional((strings: TemplateStringsArray) => {
    const text = strings.join(' ');
    if (text.includes('regexp_replace')) {
      fragmentCalls++;
      return 'fragment-placeholder';
    }
    if (text.includes('FROM judgments')) return Promise.resolve([{ id: 'bommai-id' }]);
    throw new Error(`unrecognised query — ${text}`);
  });

  const out = await attachCitesJudgmentId(sql, paragraphs, 'own-id');
  assert.equal(out[0]?.citesJudgmentId, 'bommai-id');
  assert.equal(out[1]?.citesJudgmentId, 'bommai-id');
  // One resolution for the one distinct citation, not one per paragraph it appears in.
  assert.equal(fragmentCalls, 1);
});
