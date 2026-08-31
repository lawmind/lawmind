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
    assert.equal(
      neutralCitationFrom('IN THE HIGH COURT\n2023:DHC:2720\nJUDGMENT', 2023),
      '2023:DHC:2720',
    );
    assert.equal(
      neutralCitationFrom('2023:DHC:2073-DB before the bench', 2023),
      '2023:DHC:2073-DB',
    );
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

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * NEW2 R17. THE ASSERTION BELOW USED TO READ THE OTHER WAY, AND IT WAS WRONG
   * ───────────────────────────────────────────────────────────────────────────
   *
   * It read: `neutralCitationFrom('x'.repeat(4000) + ' 2024:DHC:99 ', 2024)`
   * is `null` — "does not read a citation buried deep in the body as the header
   * one". That encoded the same assumption as the code it was testing, which is
   * why it passed for exactly as long as the bug lived.
   *
   * **Bombay does not print its citation in the masthead.** It stamps it in the
   * page furniture after the judge's signature, 500-800 characters into a
   * one-page order; so do Rajasthan and Karnataka, on every page. Measured on the
   * frozen population (`docs/ai/new2-r17/eval-population.json`): 45 of the 59
   * documents an identity-anchored adjudicator could not place are exactly this
   * form, and a rule that refuses them loses 51 of 203 true own citations.
   *
   * Depth is not the signal. What introduces the citation is.
   */
  it('takes a page-stamped citation that no citing phrase introduces, however deep', () => {
    const bombay =
      'IN THE HIGH COURT OF JUDICATURE AT BOMBAY, BENCH AT AURANGABAD. ' +
      'x'.repeat(500) +
      ' 2. Leave is granted. 3. The application stands disposed of as withdrawn. ' +
      '( MEHROZ K. PATHAN, J. ) Jhs/ 1/1 2025:BHC-AUG:34493';
    assert.equal(
      neutralCitationFrom(bombay, 2025, { caseNumber: 'ABA/1808/2025', cnr: 'HCBM030420052025' }),
      '2025:BHC-AUG:34493',
    );
  });

  it('REFUSES the citation of the judgment a short order says it follows', () => {
    // Measured: all 109 rows behind NEW2 R16's 30 extraction defects. This is the
    // Allahabad form, the commonest of them — a two-page order that prints no
    // citation of its own and names the judgment it is covered by.
    const follower =
      'HIGH COURT OF JUDICATURE AT ALLAHABAD Court No. 7 Case :- WRIT - A No. - 5678 of 2024 ' +
      'Heard learned counsel for the petitioner. The case at hand is squarely covered under the ' +
      'judgement dated 09.10.2023 passed by this Court in Writ A No. 7699 of 2023: ' +
      'Neutral Citation No.- 2023:AHC-LKO:65518-DB. The writ petition is disposed of.';
    assert.equal(
      neutralCitationFrom(follower, 2024, { caseNumber: 'WRIT-A/5678/2024', cnr: 'UPHC010000012024' }),
      null,
    );
  });

  it('takes THIS row’s masthead out of a PDF holding four connected petitions', () => {
    // `WPS/5687/2025`, Chhattisgarh: four writ petitions in one document, each
    // with its own cause title and its own citation. The old rule took the first
    // and filed this row under WPS 5593's number.
    // The 889 characters of party and respondent list between the two mastheads
    // are the real document's spacing, kept because it is load-bearing: a
    // compressed fixture puts the previous cause title inside the second
    // citation's 200-character context and the test then measures the fixture.
    const respondents =
      'The State of Chhattisgarh Through The Secretary School Education Department Mahanadi Bhawan ' +
      'Atal Nagar District Raipur Chhattisgarh, The Director Public Instruction Indravati Bhawan ' +
      'Atal Nagar District Raipur Chhattisgarh, The District Education Officer Raigarh District ' +
      'Raigarh Chhattisgarh, The Block Education Officer Dharamjaigarh District Raigarh ' +
      'Chhattisgarh, and the Sub Divisional Officer Revenue Dharamjaigarh District Raigarh ' +
      'Chhattisgarh, all of whom have been served through the office of the Advocate General ' +
      '--- Respondents ';
    const bundle =
      '1 2025:CGHC:26982 NAFR HIGH COURT OF CHHATTISGARH AT BILASPUR WPS No. 5593 of 2025 ' +
      'Thanda Ram Kumhar S/o Shri Vishram Kumhar aged about 42 years R/o Village Kondkel ' +
      'Tehsil Dharamjaigarh District Raigarh Chhattisgarh --- Petitioner ' +
      respondents +
      '2025:CGHC:26986 NAFR HIGH COURT OF CHHATTISGARH AT BILASPUR WPS No. 5687 of 2025 ' +
      'Madhu Bala --- Petitioner';
    assert.equal(
      neutralCitationFrom(bundle, 2025, { caseNumber: 'WPS/5687/2025', cnr: 'CGHC010237282025' }),
      '2025:CGHC:26986',
    );
  });

  it('answers NULL rather than choose between two citations it cannot separate', () => {
    // A missing citation is a recoverable gap. A wrong one files a document under
    // another matter's number.
    const twoAuthorities =
      'HIGH COURT OF JUDICATURE AT ALLAHABAD Case :- WRIT TAX No. - 5066 of 2025 ' +
      'This issue is covered by the judgements of this Court in the case of M/s Vijay Trading ' +
      'Company vs. Additional Commissioner; Neutral Citation No. - 2024:AHC:132878 and ' +
      'M/s PP Polyplast, Neutral Citation No. - 2024:AHC:121612.';
    assert.equal(
      neutralCitationFrom(twoAuthorities, 2025, { caseNumber: 'WTAX/5066/2025', cnr: 'UPHC010000022025' }),
      null,
    );
  });

  it('does not mistake a DATE for the case number beside a citation', () => {
    // `Judgment Reserved on : 09/12/2024` read as matter 12 of 2024 and made
    // `FA/69/2022` (Chhattisgarh) disown its own masthead citation.
    const withDate =
      '1 2025:CGHC:3148-DB NAFR HIGH COURT OF CHHATTISGARH, BILASPUR ' +
      'Judgment Reserved on : 09/12/2024 Judgment Delivered on : 17/01/2025 ' +
      'FA No. 69 of 2022 Ramesh --- Appellant';
    assert.equal(
      neutralCitationFrom(withDate, 2025, { caseNumber: 'FA/69/2022', cnr: 'CGHC010129822022' }),
      '2025:CGHC:3148-DB',
    );
  });

  it('REFUSES a footer inherited from a different order, which is printed once', () => {
    // `CWP/1220/2024`, Punjab & Haryana: another order's page stamp bled into
    // this document's text. A real page stamp recurs; this appears once.
    const bled =
      'IN THE HIGH COURT FOR THE STATES OF PUNJAB AND HARYANA AT CHANDIGARH CWP No. 1220 of 2024 ' +
      'The petitioner was therefore constrained to file the present petition. ' +
      'MOHIT GOYAL 2024.07.19 13:55 I attest to the accuracy and integrity of this document ' +
      'CWP-15861-2015 (O&M) 2023:PHHC:094498 Page 2 of 3 ' +
      'Per contra, learned counsel for the respondents submits';
    assert.equal(
      neutralCitationFrom(bled, 2024, { caseNumber: 'CWP/1220/2024', cnr: 'PHHC010000032024' }),
      null,
    );
  });

  it('REFUSES a connected matter’s citation carried in an order sheet with its CNR', () => {
    // `HABC/16/2023`, Uttarakhand. The one defect of the 109 that sat INSIDE the
    // old 250-character masthead window: position could never have caught it,
    // the foreign CNR beside it does.
    const orderSheet =
      'SL. No Date Office Notes, reports, orders or proceedings or directions and Registrar’s order ' +
      'with Signatures COURT’S OR JUDGES’S ORDERS D1- 23 UKHC010088392026 2026:UHC:4224-DB ' +
      'HABC No.16 of 2023 Jimdaar .....Petitioner';
    assert.equal(
      neutralCitationFrom(orderSheet, 2026, { caseNumber: 'HABC/16/2023', cnr: 'UKHC010012342023' }),
      null,
    );
  });

  it('still answers with no identity at all, on the citing phrase alone', () => {
    // A row whose title carries no parseable case number and no CNR. A signal
    // that cannot be evaluated is not evidence, so the case-number and CNR tests
    // switch off and the citing phrase carries the refusal on its own.
    assert.equal(neutralCitationFrom('IN THE HIGH COURT\n2023:DHC:2720\nJUDGMENT', 2023), '2023:DHC:2720');
    assert.equal(
      neutralCitationFrom('The court relied upon 2023:DHC:2720 in reaching this view.', 2023),
      null,
    );
  });
});

describe('toJudgmentRecord', () => {
  const text =
    'IN THE HIGH COURT OF JUDICATURE AT PATNA\nCRIMINAL MISCELLANEOUS No.83783 of 2023\n…';

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
    assert.equal(r.sourceId, 'aws_hc');
    assert.equal(r.sourceEdition, 'court_raw');
    assert.equal(r.authorizationBasis, 'aws_open_data');
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
    const out = toJudgmentRecord(
      { ...PATNA, order_type: 'View Judgement/Order' },
      PARTS,
      text,
      URL,
    );
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NEW2 R18. `-DB` GLUED TO THE NEXT WORD CHANGES THE CITATION KEY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R17 §7 recorded this and deliberately did not act on it, because it changes
 * the extracted VALUE rather than the ownership question that round was asked.
 * R18 measured it: `docs/ai/new2-r18/`.
 *
 * The shared regex ends its optional suffix in `\b`:
 *
 *     /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/
 *
 * On `2023:AHC:111864-DBNeutral Citation No. …` the `B|N` pair is not a word
 * boundary, so the `-DB` alternative fails, the group matches EMPTY, and the
 * `\b` after `111864` succeeds against the `-`. The regex does not fail — it
 * returns a DIFFERENT citation key, silently. `2023:AHC:111864` and
 * `2023:AHC:111864-DB` are two rows in `judgment_citation_keys`, so the same
 * judgment can be pinned under either and neither resolves to the other.
 *
 * Every string below was sampled out of the corpus, not invented.
 */
describe('neutralCitationFrom — the -DB token boundary', () => {
  it('keeps the -DB the page printed even when extraction glued it to the next word', () => {
    // Allahabad, judgment id cfd18fe3-c878-4640-b070-dcf66fcb181a. The page
    // prints the citation twice; the FIRST print is glued, the second is clean,
    // so the document itself corroborates that -DB is the true form.
    assert.equal(
      neutralCitationFrom(
        '2023:AHC:111864-DBNeutral Citation No. - 2023:AHC:111864-DB Reserved on 16.',
        2023,
      ),
      '2023:AHC:111864-DB',
    );
  });

  it('still reads a clean suffix, and still reads no suffix at all', () => {
    assert.equal(neutralCitationFrom('2023:DHC:2073-DB before the bench', 2023), '2023:DHC:2073-DB');
    assert.equal(neutralCitationFrom('IN THE HIGH COURT\n2023:DHC:2720\nJUDGMENT', 2023), '2023:DHC:2720');
    assert.equal(neutralCitationFrom('Neutral Citation 2023:KHC-D:1', 2023), '2023:KHC-D:1');
  });

  it('does NOT invent a suffix out of a hyphen that is not one', () => {
    // The negative control. Only -DB and -FB are suffixes; a hyphen followed by
    // anything else belongs to the next token and the citation ends at the
    // number, exactly as it does today.
    assert.equal(neutralCitationFrom('2023:DHC:2073-Crl.A. 55 of 2023', 2023), '2023:DHC:2073');
    assert.equal(neutralCitationFrom('2023:DHC:2073-SB before the bench', 2023), '2023:DHC:2073');
  });
});
