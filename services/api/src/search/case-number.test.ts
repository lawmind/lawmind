/**
 * Case-number and CNR parsing.
 *
 * Every accepted spelling here was read off a real order or off
 * `judgments.case_number` — nothing is invented, because a parser tested against
 * shapes nobody types is a parser that passes and does not work. The rejections
 * matter more than the acceptances: this function decides whether an ordinary
 * search gets hijacked into an identity lookup.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  caseNumberSuffixPattern,
  isCnr,
  normaliseTypeToken,
  parseCaseNumber,
} from './case-number.ts';

describe('parseCaseNumber', () => {
  it('reads the stored eCourts form', () => {
    // Exactly as `judgments.case_number` holds it.
    assert.deepEqual(parseCaseNumber('CWJC/2231/2006'), {
      typeToken: 'CWJC',
      serial: '2231',
      year: '2006',
    });
    assert.deepEqual(parseCaseNumber('WP(C)/4097/2009'), {
      typeToken: 'WP(C)',
      serial: '4097',
      year: '2009',
    });
  });

  it('reads the form printed on an order, which is the one advocates type', () => {
    // 10.3% of these found their own judgment before this parser existed.
    for (const typed of [
      'CWJC 2231 of 2006',
      'CWJC 2231/2006',
      'CWJC-2231-2006',
      'cwjc 2231 OF 2006',
    ]) {
      assert.deepEqual(
        parseCaseNumber(typed),
        { typeToken: 'CWJC', serial: '2231', year: '2006' },
        typed,
      );
    }
  });

  it('keeps a type token that contains spaces, dots or hyphens', () => {
    /**
     * The stored token is NOT punctuation-normalised — Patna holds
     * `CR. MISC./606/2011` with its dots and space intact. Stripping them here
     * would make the parsed token unable to match the row it came from.
     */
    assert.deepEqual(parseCaseNumber('CR. MISC./606/2011'), {
      typeToken: 'CR. MISC.',
      serial: '606',
      year: '2011',
    });
    assert.deepEqual(parseCaseNumber('CRM-M/22875/2013'), {
      typeToken: 'CRM-M',
      serial: '22875',
      year: '2013',
    });
    assert.deepEqual(parseCaseNumber('Crl.M.C. 999/2021'), {
      typeToken: 'CRL.M.C.',
      serial: '999',
      year: '2021',
    });
  });

  it('accepts the corpus rows whose type token is missing', () => {
    // `/12521/2023` and `/206/2024` are real. A corpus defect is not a reason
    // to refuse to look the case up.
    assert.deepEqual(parseCaseNumber('/12521/2023'), {
      typeToken: null,
      serial: '12521',
      year: '2023',
    });
  });

  it('refuses shapes that are not case numbers', () => {
    /**
     * The load-bearing half. Every rejection below would otherwise hijack an
     * ordinary search into an identity lookup, and two of them are queries an
     * advocate really types.
     */
    for (const notOne of [
      '1234/2019', // no type token — also a date, a fraction, a page range
      '12/3456/2019', // three numbers; reading the first as a registry code invents one
      'anticipatory bail 2019', // prose that happens to end in a year
      'section 138 of 1881', // a statute reference
      '2023:AHC:170543', // a neutral citation — the citation route owns this
      '', // empty
      'CWJC/2231/20', // not a four-digit year
      'CWJC/2231/1799', // not a plausible year
    ]) {
      assert.equal(parseCaseNumber(notOne), null, JSON.stringify(notOne));
    }
  });

  it('anchors the pattern on serial and year', () => {
    // Anchored so `judgments_case_number_trgm` can serve it: measured 256-389ms
    // against the live corpus, versus 917ms p50 for the unanchored `%value%`.
    assert.equal(
      caseNumberSuffixPattern({ typeToken: 'CWJC', serial: '2231', year: '2006' }),
      '%/2231/2006',
    );
  });
});

describe('normaliseTypeToken', () => {
  it('collapses the spellings one act has across registries', () => {
    // Applied to BOTH sides of the comparison, never written back to the row.
    assert.equal(normaliseTypeToken('Cr. Misc.'), 'CRMISC');
    assert.equal(normaliseTypeToken('CR. MISC.'), 'CRMISC');
    assert.equal(normaliseTypeToken('CRMISC'), 'CRMISC');
    assert.equal(normaliseTypeToken('CRM-M'), 'CRMM');
    assert.equal(normaliseTypeToken('WP(C)'), 'WPC');
  });

  it('does NOT collapse two different registry codes into one', () => {
    // The rule is punctuation-insensitivity, not fuzziness.
    assert.notEqual(normaliseTypeToken('CRLMC'), normaliseTypeToken('CRLA'));
    assert.notEqual(normaliseTypeToken('WP(C)'), normaliseTypeToken('WP(CRL)'));
  });
});

describe('isCnr', () => {
  it('accepts the real shapes in the corpus', () => {
    // Read off `judgments.cnr`, not off documentation.
    for (const cnr of [
      'BRHC010328902006',
      'UPHC020901162023',
      'HCMD011280772011',
      'WBCHCA0592612024',
    ]) {
      assert.ok(isCnr(cnr), cnr);
    }
    assert.ok(isCnr(' brhc010328902006 '), 'trimmed and case-insensitive');
  });

  it('refuses anything that is not exactly sixteen characters', () => {
    for (const notOne of [
      'BRHC01032890200', // fifteen
      'BRHC0103289020067', // seventeen
      'CWJC/2231/2006', // a case number
      '2023:AHC:170543', // a neutral citation
      'BRHCABCDEFGHIJKL', // no digits
      '0123456789012345', // no court prefix
    ]) {
      assert.equal(isCnr(notOne), false, notOne);
    }
  });
});
