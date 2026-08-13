import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  caseTypeFrom,
  isTestFixture,
  neutralCitationFrom,
  splitTitle,
  toIsoDate,
  toJudgmentRecord,
} from './hc-load.ts';

/**
 * **Every string in this file was sampled out of the AWS bucket on 11 Aug 2026**,
 * not invented. `CONTINUATION_PROMPT.md` §1: every extractor in this repository
 * was written against sampled text and every one had a bug the samples exposed.
 */
const PATNA = {
  title: 'CR. MISC./83783/2023 of LAXMI KUMAR DAS @ LAXMI DAS Vs THE STATE OF BIHAR',
  judge: 'MR. JUSTICE PRABHAT KUMAR SINGH',
  decision_date: 'Fri May 03 2024 04:00:00 GMT+0400 (Gulf Standard Time)',
  court: 'Patna High Court',
  cnr: 'BRHC011164592023',
  pdf_link: 'court/cnrorders/patnahcucisdb94/orders/BRHC011164592023_1_2024-05-03.pdf',
  disposal_nature: 'DISMISS FOR NON-PROSECUTION',
};
const PARTS = { year: 2024, courtCode: '10_8', bench: 'patnahcucisdb94' };
const URL = 'https://example.invalid/x.pdf';

describe('toIsoDate', () => {
  it('reads the real decision_date format as a UTC calendar date', () => {
    // The +0400 offset belongs to the machine that WROTE the metadata, and the
    // instant is midnight UTC. Reading it locally would report 2 May on any
    // machine west of Greenwich — a judgment dated a day early is wrong in a
    // limitation calculation.
    assert.equal(toIsoDate(PATNA.decision_date), '2024-05-03');
  });

  it('accepts the mobile variant’s plain ISO form too', () => {
    assert.equal(toIsoDate('2024-05-10'), '2024-05-10');
  });

  it('refuses rather than guessing', () => {
    assert.equal(toIsoDate(null), null);
    assert.equal(toIsoDate(undefined), null);
    assert.equal(toIsoDate(''), null);
    assert.equal(toIsoDate('not a date'), null);
  });

  it('rejects a corrupt year instead of sorting it to the top of every list', () => {
    assert.equal(toIsoDate('0001-01-01'), null);
    assert.equal(toIsoDate('2999-01-01'), null);
  });
});

describe('splitTitle', () => {
  it('splits the real title into a case number and the parties', () => {
    assert.deepEqual(splitTitle(PATNA.title), {
      caseNumber: 'CR. MISC./83783/2023',
      caseTitle: 'LAXMI KUMAR DAS @ LAXMI DAS Vs THE STATE OF BIHAR',
    });
  });

  it('does NOT cut at "OF" inside a party name — the whole reason the split is case-sensitive', () => {
    // "THE STATE OF BIHAR" contains " OF ". A case-insensitive split would make
    // the case number "CR. MISC./83783/2023 of LAXMI ... Vs THE STATE".
    const { caseTitle } = splitTitle(PATNA.title);
    assert.ok(caseTitle.includes('THE STATE OF BIHAR'), caseTitle);
  });

  it('keeps the whole title when there is no separator — a wrong number is worse than none', () => {
    assert.deepEqual(splitTitle('SOME UNSTRUCTURED TITLE'), {
      caseTitle: 'SOME UNSTRUCTURED TITLE',
      caseNumber: null,
    });
  });

  it('collapses the whitespace the bucket carries', () => {
    assert.equal(splitTitle('  AA/74/2024   of   X Vs Y  ').caseTitle, 'X Vs Y');
  });
});

describe('caseTypeFrom', () => {
  /**
   * **Every case number here came out of the Patna 2024 dry run.** The first
   * version of this function returned null for `CWJC` and `L.P.A` and its tests
   * still passed, because the tests were written from the same assumption as the
   * code. Reading five mapped records caught it; no test could have.
   */
  it('reads the dotted and compound prefixes the corpus actually writes', () => {
    assert.equal(caseTypeFrom('CR. MISC./83783/2023'), 'criminal');
    assert.equal(caseTypeFrom('CR. WJC/64/2024'), 'criminal');
    assert.equal(caseTypeFrom('CWJC/19122/2015'), 'civil');
    assert.equal(caseTypeFrom('L.P.A/1614/2018'), 'civil');
  });

  it('does NOT read CRP as criminal — it is a Civil Revision Petition', () => {
    // The trap in the obvious implementation. A `startsWith('CR')` rule labels
    // every civil revision in India as a criminal matter.
    assert.equal(caseTypeFrom('CRP/100/2024'), 'civil');
  });

  it('reads any CRL-compound as criminal — verified against real Rajasthan/Karnataka text, 12 Aug 2026', () => {
    // Every one of these prints "Criminal Miscellaneous Bail Application" or
    // "Criminal Writ Petition" in its own header. `CRL` is three letters, not
    // the two-letter `CR` the CRP test above exists to guard against.
    assert.equal(caseTypeFrom('CRLMB/6292/2026'), 'criminal');
    assert.equal(caseTypeFrom('CRLMP/6916/2025'), 'criminal');
    assert.equal(caseTypeFrom('CRLW/1015/2025'), 'criminal');
    assert.equal(caseTypeFrom('CRLRP/220/2024'), 'criminal');
    // Still not `CR` alone, and still not CRP — the substring rule does not
    // widen the trap the exact-match set already guards against.
    assert.equal(caseTypeFrom('CRP/100/2024'), 'civil');
  });

  it('returns null rather than guessing an unknown or ambiguous abbreviation', () => {
    // Indian High Courts use hundreds of these and do not agree between courts.
    // A writ petition may be either side. Mislabelling a matter is worse than
    // claiming no side, which is what null renders as.
    assert.equal(caseTypeFrom('AA/74/2024'), null);
    assert.equal(caseTypeFrom('WP/1234/2024'), null);
    assert.equal(caseTypeFrom(null), null);
    assert.equal(caseTypeFrom('/123/2024'), null);
  });
});

describe('neutralCitationFrom', () => {
  it('takes the document’s own neutral citation from the header', () => {
    assert.equal(neutralCitationFrom('IN THE HIGH COURT\n2023:DHC:2720\nJUDGMENT', 2023), '2023:DHC:2720');
    assert.equal(neutralCitationFrom('2023:DHC:2073-DB before the bench', 2023), '2023:DHC:2073-DB');
    assert.equal(neutralCitationFrom('Neutral Citation 2023:KHC-D:1', 2023), '2023:KHC-D:1');
  });

  it('accepts the previous year — a January judgment can carry the prior series', () => {
    assert.equal(neutralCitationFrom('2023:DHC:2720', 2024), '2023:DHC:2720');
  });

  it('REFUSES a cited authority’s citation as the document’s own', () => {
    // A judgment prints the neutral citations of the authorities it relies on.
    // Taking one would file this document under another court's citation.
    assert.equal(neutralCitationFrom('relying on 2019:DHC:1 the court held', 2024), null);
  });

  it('returns null before 2023, honestly', () => {
    assert.equal(neutralCitationFrom('IN THE HIGH COURT OF PATNA\nJUDGMENT', 2016), null);
  });

  it('does not read a citation buried deep in the body as the header one', () => {
    const deep = 'x'.repeat(4000) + ' 2024:DHC:99 ';
    assert.equal(neutralCitationFrom(deep, 2024), null);
  });
});

describe('toJudgmentRecord', () => {
  const text = 'IN THE HIGH COURT OF JUDICATURE AT PATNA\nCRIMINAL MISCELLANEOUS No.83783 of 2023\n…';

  it('maps the real Patna row', () => {
    const out = toJudgmentRecord(PATNA, PARTS, text, URL);
    assert.ok(out.ok, JSON.stringify(out));
    const r = out.record;
    assert.equal(r.caseTitle, 'LAXMI KUMAR DAS @ LAXMI DAS Vs THE STATE OF BIHAR');
    assert.equal(r.caseNumber, 'CR. MISC./83783/2023');
    assert.equal(r.caseType, 'criminal');
    assert.equal(r.court, 'Patna High Court');
    // The partition key is provenance, NOT the coram. This assertion used to
    // read `r.bench === 'patnahcucisdb94'` and it passed for exactly as long as
    // the bug lived — the test encoded the same mistake as the code, which is
    // why 40,980 rows reached production showing a database slug where the
    // judges belong. Migration 0040. This variant publishes no judge field, so
    // `bench` is null and the source's code is kept as what it is.
    assert.equal(r.bench, null, 'a court code is never a bench');
    assert.equal(r.sourceBenchCode, 'patnahcucisdb94');
    assert.equal(r.judgmentDate, '2024-05-03');
    assert.equal(r.sourceUrl, URL);
    assert.equal(r.language, 'en');
    assert.equal(r.cnr, 'BRHC011164592023');
    // nativeText omitted here — defaults to null, asserted below.
    assert.equal(r.nativeText, null);
  });

  it('is null, not undefined, when the row carries no cnr — found dropped entirely until migration 0034', () => {
    const out = toJudgmentRecord({ ...PATNA, cnr: null }, PARTS, text, URL);
    assert.ok(out.ok);
    assert.equal(out.record.cnr, null);
  });

  it('carries nativeText through when the caller supplies it', () => {
    const withNative = toJudgmentRecord(PATNA, PARTS, text, URL, true);
    assert.ok(withNative.ok);
    assert.equal(withNative.record.nativeText, true);
    const withoutNative = toJudgmentRecord(PATNA, PARTS, text, URL, false);
    assert.ok(withoutNative.ok);
    assert.equal(withoutNative.record.nativeText, false);
  });

  it('NEVER synthesises a reporter citation', () => {
    // The bucket has no citation column. An invented one is the exact failure
    // this product exists to prevent.
    const out = toJudgmentRecord(PATNA, PARTS, text, URL);
    assert.ok(out.ok);
    assert.deepEqual(out.record.reporterCitations, []);
    assert.equal(out.record.neutralCitation, null, 'a 2024 Patna order carries none');
  });

  it('skips the testcase bench — it is a fixture publishing ~16,000 rows a year', () => {
    const out = toJudgmentRecord(PATNA, { ...PARTS, bench: 'testcase' }, text, URL);
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.reason, 'test_fixture_bench');
  });

  it('skips rather than writing a hole, and says which hole', () => {
    const cases: [Partial<Record<keyof typeof PATNA, string | null>>, string, string][] = [
      [{ decision_date: null }, text, 'no_decision_date'],
      [{ decision_date: 'rubbish' }, text, 'unparseable_date'],
      [{ title: '   ' }, text, 'no_title'],
      [{ pdf_link: null }, text, 'no_pdf_link'],
      [{}, '   ', 'no_text'],
    ];
    for (const [patch, body, reason] of cases) {
      const out = toJudgmentRecord({ ...PATNA, ...patch }, PARTS, body, URL);
      assert.equal(out.ok, false, reason);
      assert.equal(out.ok === false && out.reason, reason);
    }
  });

  it('falls back to the court code when the row names no court', () => {
    const out = toJudgmentRecord({ ...PATNA, court: null }, PARTS, text, URL);
    assert.ok(out.ok);
    assert.equal(out.record.court, '10_8');
  });

  it('passes order_type through verbatim — mobile variant only, never classified', () => {
    const out = toJudgmentRecord({ ...PATNA, order_type: 'View Judgement/Order' }, PARTS, text, URL);
    assert.ok(out.ok);
    // Stored exactly as the source wrote it, including the ambiguous form —
    // resolving "judgment or order" needs the PDF text, which this function
    // does not read. `docs/SCHEMA_TRUTH.md` §judgments `source_document_type`.
    assert.equal(out.record.sourceDocumentType, 'View Judgement/Order');
  });

  it('is null, not undefined, when the plain variant carries no order_type', () => {
    // The plain variant (21 of 25 courts) never sets this field at all.
    const out = toJudgmentRecord(PATNA, PARTS, text, URL);
    assert.ok(out.ok);
    assert.equal(out.record.sourceDocumentType, null);
  });
});

describe('isTestFixture', () => {
  it('catches the bench however it is cased', () => {
    assert.equal(isTestFixture({ bench: 'testcase' }), true);
    assert.equal(isTestFixture({ bench: 'bombay_TESTCASE_db' }), true);
    assert.equal(isTestFixture({ bench: 'patnahcucisdb94' }), false);
  });
});
