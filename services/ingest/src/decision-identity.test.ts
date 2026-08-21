/**
 * The property this module lives or dies on: **the two promotable strengths
 * cannot produce a false positive.** Everything else is a convenience.
 *
 * So the tests are weighted toward refusals — a common order across 200
 * petitions, two petitions with the same caption on the same day, a shared
 * case-number format across different courts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  candidate,
  isPromotable,
  normaliseCaption,
  normaliseCaseNumber,
  type IdentityRow,
} from './decision-identity.ts';

const row = (patch: Partial<IdentityRow>): IdentityRow => ({
  id: 'a',
  court: 'Bombay High Court',
  caseNumber: 'WP/1234/2021',
  judgmentDate: '2021-06-14',
  caseTitle: 'CHIPADE Vs STATE OF MAHARASHTRA',
  cnr: null,
  neutralCitation: null,
  contentHash: 'h1',
  sourceUrl: 'https://x/court=1_12/y.json',
  ...patch,
});

describe('the Chipade shape — one decision, two rows, two hashes', () => {
  it('links two rows that differ ONLY in OCR and source partition', () => {
    const a = row({ id: 'a', cnr: 'MHAU010012342021', contentHash: 'h1' });
    const b = row({
      id: 'b',
      cnr: 'MHAU010012342021',
      contentHash: 'h2',
      sourceUrl: 'https://x/court=1_13/y.json',
    });
    const c = candidate(a, b);
    assert.ok(c);
    assert.equal(c.strength, 'CNR_EXACT');
    assert.equal(c.hashesDiffer, true);
    assert.equal(c.sourcesDiffer, true);
    assert.equal(isPromotable(c), true);
  });

  it('a shared neutral citation is promotable on its own', () => {
    const c = candidate(
      row({ id: 'a', neutralCitation: '2021:BHC-AS:12345' }),
      row({ id: 'b', neutralCitation: '2021:BHC-AS:12345', caseNumber: 'W.P. No. 1234 of 2021' }),
    );
    assert.equal(c?.strength, 'CITATION_EXACT');
    assert.equal(isPromotable(c!), true);
  });
});

describe('a common order is NOT one decision, and this is the refusal that matters', () => {
  it('same court, same day, same caption, DIFFERENT case numbers is CAPTION_WEAK', () => {
    const c = candidate(
      row({ id: 'a', caseNumber: 'WP/1234/2021' }),
      row({ id: 'b', caseNumber: 'WP/9999/2021' }),
    );
    assert.equal(c?.strength, 'CAPTION_WEAK');
    assert.equal(isPromotable(c!), false);
  });

  it('REGISTRY_STRONG is not promotable either — one court can issue a number twice', () => {
    const c = candidate(
      row({ id: 'a', caseTitle: 'A Vs B' }),
      row({ id: 'b', caseTitle: 'C Vs D' }),
    );
    assert.equal(c?.strength, 'REGISTRY_STRONG');
    assert.equal(isPromotable(c!), false);
  });
});

describe('a decision is one court on one day', () => {
  it('different courts never link, however identical everything else is', () => {
    assert.equal(
      candidate(row({ id: 'a' }), row({ id: 'b', court: 'Delhi High Court' })),
      null,
    );
  });

  it('different dates never link', () => {
    assert.equal(
      candidate(row({ id: 'a' }), row({ id: 'b', judgmentDate: '2021-06-15' })),
      null,
    );
  });

  it('a CNR match overrides court and date, because a CNR IS the case', () => {
    const c = candidate(
      row({ id: 'a', cnr: 'MHAU010012342021' }),
      row({
        id: 'b',
        cnr: 'MHAU010012342021',
        court: 'Bombay High Court Aurangabad Bench',
        judgmentDate: '2021-06-15',
      }),
    );
    assert.equal(c?.strength, 'CNR_EXACT');
  });

  it('a row never links to itself', () => {
    assert.equal(candidate(row({ id: 'a' }), row({ id: 'a' })), null);
  });
});

describe('normalisation is narrow, and narrow is the point', () => {
  it('the same number printed by three registries normalises to one string', () => {
    const forms = ['W.P.(C) No. 1234 of 2021', 'WP(C)/1234/2021', 'W P C 1234 2021'];
    const [first, ...rest] = forms.map(normaliseCaseNumber);
    for (const r of rest) assert.equal(r, first);
  });

  it('DIFFERENT case types are never folded together', () => {
    assert.notEqual(normaliseCaseNumber('CRLA/12/2020'), normaliseCaseNumber('CRLMA/12/2020'));
    assert.notEqual(normaliseCaseNumber('WP/12/2020'), normaliseCaseNumber('WP/12/2021'));
    assert.notEqual(normaliseCaseNumber('WP/12/2020'), normaliseCaseNumber('WP/120/2020'));
  });

  it('expands only pure formatting, and only as a whole prefix', () => {
    assert.equal(normaliseCaseNumber('Criminal Appeal No. 19 of 1955'), 'CRLA191955');
    assert.equal(normaliseCaseNumber('CRLA/19/1955'), 'CRLA191955');
  });

  it('captions fold registry decoration and nothing else', () => {
    assert.equal(
      normaliseCaption('M/s. ACME Ltd. and Ors. Versus State of Maharashtra & Anr.'),
      normaliseCaption('ACME LTD V STATE OF MAHARASHTRA'),
    );
    assert.notEqual(
      normaliseCaption('ACME Ltd V State of Maharashtra'),
      normaliseCaption('ACME Pvt V State of Maharashtra'),
    );
  });

  it('a caption too short to identify anything is refused rather than matched', () => {
    assert.equal(normaliseCaption('A V B'), null);
    assert.equal(normaliseCaption(null), null);
    assert.equal(normaliseCaseNumber(null), null);
    assert.equal(normaliseCaseNumber('...'), null);
  });
});

describe('nothing here merges anything', () => {
  it('every candidate carries both ids and neither is marked as surviving', () => {
    const c = candidate(
      row({ id: 'a', cnr: 'X' }),
      row({ id: 'b', cnr: 'X' }),
    )!;
    assert.equal(c.aId, 'a');
    assert.equal(c.bId, 'b');
    assert.ok(!('winner' in c) && !('survivor' in c) && !('mergeInto' in c));
  });
});
