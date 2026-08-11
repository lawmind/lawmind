/**
 * Pure-function tests for the SCI adapter. No network: `readYearMetadata` and
 * `fetchPdfText` talk to AWS Open Data and are exercised by real runs, not here.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseCaseNumber,
  pdfUrl,
  SCI_BUCKET,
  sourceUrlFor,
  toCaseType,
  toIsoDate,
  toJudgment,
  type SciMetadataRow,
} from './sci.ts';
import { stripUnstorable } from './text.ts';

/** A row shaped exactly like the published parquet schema. */
function row(overrides: Partial<SciMetadataRow> = {}): SciMetadataRow {
  return {
    title: 'SRI RANGA NILAYAM RAMA KRISHNA RAO  versus KANDOKOLU CHELLA Y AMMA',
    petitioner: 'SRI RANGA NILAYAM RAMA KRISHNA RAO',
    respondent: 'KANDOKOLU CHELLA Y AMMA',
    description: '',
    judge: 'BIJAN KUMAR MUKHERJEA',
    author_judge: null,
    citation: '[1950] 1 S.C.R. 806',
    case_id: '1950 INSC 25',
    cnr: 'ESCR010000301950',
    decision_date: '17-10-1950',
    disposal_nature: 'Appeal(s) allowed',
    court: 'Supreme Court of India',
    available_languages: 'ENG,HIN,PUN',
    path: '1950_1_806_821',
    nc_display: '1950INSC25',
    year: '1950',
    ...overrides,
  };
}

describe('toIsoDate', () => {
  it('converts DD-MM-YYYY to ISO', () => {
    assert.equal(toIsoDate('17-10-1950'), '1950-10-17');
    assert.equal(toIsoDate('01-01-2024'), '2024-01-01');
  });

  it('tolerates surrounding whitespace', () => {
    assert.equal(toIsoDate('  17-10-1950 '), '1950-10-17');
  });

  it('throws rather than guessing at an unrecognised shape', () => {
    // A judgment filed under a wrongly parsed date is worse than one that fails
    // to load loudly.
    for (const bad of ['1950-10-17', '17/10/1950', '17-10-50', '', 'yesterday']) {
      assert.throws(() => toIsoDate(bad), /unrecognised decision_date/, `accepted ${bad!}`);
    }
  });

  it('throws on a well-shaped but impossible date', () => {
    assert.throws(() => toIsoDate('32-13-1950'), /impossible decision_date/);
  });
});

describe('pdfUrl', () => {
  it('builds the verified key layout, including the _EN suffix', () => {
    assert.equal(
      pdfUrl(1950, '1950_1_806_821'),
      `${SCI_BUCKET}/data/pdf/year=1950/english/1950_1_806_821_EN.pdf`,
    );
  });
});

describe('sourceUrlFor — identity', () => {
  it('keys off the row year, NOT the partition it was read from', () => {
    // Regression: 694 of 1,804 rows across 1950-1960 carry a row.year different
    // from their partition. Fetching under one and recording the other made
    // provenance depend on read order and broke --resume, which matches on the
    // stored value.
    const r = row({ year: '1951', path: '1951_1_1_51' });
    assert.equal(sourceUrlFor(r), pdfUrl(1951, '1951_1_1_51'));
    assert.notEqual(sourceUrlFor(r), pdfUrl(1950, '1951_1_1_51'));
  });

  it('is what toJudgment stores, so fetch and provenance cannot diverge', () => {
    const r = row({ year: '1951', path: '1951_1_1_51' });
    assert.equal(toJudgment(r, 'text').sourceUrl, sourceUrlFor(r));
  });

  it('is stable for the same row', () => {
    const r = row();
    assert.equal(sourceUrlFor(r), sourceUrlFor(r));
  });
});

describe('toJudgment', () => {
  it('maps the parquet columns onto the judgments shape', () => {
    const j = toJudgment(row(), 'FULL TEXT');
    assert.equal(j.caseTitle, 'SRI RANGA NILAYAM RAMA KRISHNA RAO versus KANDOKOLU CHELLA Y AMMA');
    assert.equal(j.neutralCitation, '1950 INSC 25');
    assert.deepEqual(j.reporterCitations, ['[1950] 1 S.C.R. 806']);
    assert.equal(j.court, 'Supreme Court of India');
    assert.equal(j.bench, 'BIJAN KUMAR MUKHERJEA');
    assert.equal(j.judgmentDate, '1950-10-17');
    assert.equal(j.fullText, 'FULL TEXT');
    assert.equal(j.language, 'en');
    assert.equal(j.cnr, 'ESCR010000301950');
  });

  it('records a missing cnr as null, never an empty string — found dropped entirely until migration 0034', () => {
    for (const blank of ['', '   ']) {
      assert.equal(toJudgment(row({ cnr: blank }), 't').cnr, null);
    }
  });

  it('collapses runs of whitespace in the title', () => {
    assert.equal(toJudgment(row({ title: 'A   v.\n B' }), 't').caseTitle, 'A v. B');
  });

  it('records a missing neutral citation as null, never an empty string', () => {
    // 22 of 1,281 ingested rows have no neutral citation. Null is the honest
    // value; '' would read as a citation that exists and is blank.
    for (const blank of ['', '   ']) {
      assert.equal(toJudgment(row({ case_id: blank }), 't').neutralCitation, null);
    }
  });

  it('records a missing reporter citation as an empty array', () => {
    assert.deepEqual(toJudgment(row({ citation: '' }), 't').reporterCitations, []);
  });

  it('records a missing bench as null', () => {
    assert.equal(toJudgment(row({ judge: '  ' }), 't').bench, null);
  });

  it('always marks language en — the English PDF is what is fetched', () => {
    // available_languages often lists more (ENG,HIN,PUN), but judgments.language
    // is a two-value enum and this row IS the English document.
    assert.equal(toJudgment(row({ available_languages: 'ENG,HIN,PUN' }), 't').language, 'en');
  });

  it('propagates a bad date as a throw rather than a bad row', () => {
    assert.throws(() => toJudgment(row({ decision_date: 'n/a' }), 't'), /decision_date/);
  });
});

describe('case type — read off the official case number', () => {
  it('reads criminal and civil from the printed case number', () => {
    assert.equal(toCaseType('CRIMINAL APPEAL No. 19/1955'), 'criminal');
    assert.equal(toCaseType('CIVIL APPEAL No. 213/1953'), 'civil');
  });

  it('reads the side out of a parenthesised category', () => {
    // These are the cases a naive prefix check gets wrong.
    assert.equal(toCaseType('WRIT PETITION (CRIMINAL) No. 55/1954'), 'criminal');
    assert.equal(toCaseType('WRIT PETITION (CIVIL) No. 189/1955'), 'civil');
    assert.equal(toCaseType('SPECIAL LEAVE PETITION (CRIMINAL) No. 554/1975'), 'criminal');
    assert.equal(toCaseType('SPECIAL LEAVE PETITION (CIVIL) No. 19963/1994'), 'civil');
    assert.equal(toCaseType('CONTEMPT PETITION (CIVIL) No. 357/1993'), 'civil');
  });

  it('returns null where the case number states no side', () => {
    // Guessing one of these into criminal or civil would mis-sort a matter.
    for (const n of [
      'ARBITRATION PETITION No. 5/2008',
      'MISCELLANEOUS APPLICATION No. 3/2009',
      'No. 7298/2022',
      '',
    ]) {
      assert.equal(toCaseType(n), null, `guessed a side for ${JSON.stringify(n)}`);
    }
    assert.equal(toCaseType(null), null);
  });

  it('pulls the case number out of the scraped markup', () => {
    const html =
      `<strong>Decision Date :</strong><font color='green'> 03-10-2024</font>` +
      `<span style='color:#212F3D'> Case No :</span><font color='green'> CRIMINAL APPEAL No. 2623/2014</font>`;
    assert.equal(parseCaseNumber(html), 'CRIMINAL APPEAL No. 2623/2014');
    assert.equal(parseCaseNumber(undefined), null);
    assert.equal(parseCaseNumber('<p>no case number here</p>'), null);
  });

  it('puts both the number and the derived side on the judgment', () => {
    const j = toJudgment(
      row({ raw_html: `Case No :</span><font> CRIMINAL APPEAL No. 7/1955</font>` }),
      't',
    );
    assert.equal(j.caseNumber, 'CRIMINAL APPEAL No. 7/1955');
    assert.equal(j.caseType, 'criminal');
  });

  it('leaves both null when the markup carries no case number', () => {
    const j = toJudgment(row({ raw_html: '<p>nothing</p>' }), 't');
    assert.equal(j.caseNumber, null);
    assert.equal(j.caseType, null);
  });
});

describe('stripUnstorable', () => {
  it('removes NUL, which Postgres rejects outright', () => {
    assert.equal(stripUnstorable('Ramesh\0v.\0State'), 'Rameshv.State');
  });

  it('removes unpaired surrogates from broken PDF font encodings', () => {
    assert.equal(stripUnstorable('bail \uD800granted'), 'bail granted');
    assert.equal(stripUnstorable('bail \uDC00granted'), 'bail granted');
  });

  it('keeps valid surrogate pairs and Devanagari intact', () => {
    // Dropping these would corrupt Hindi judgments, which is the whole point of
    // being surgical rather than filtering to ASCII.
    assert.equal(stripUnstorable('जमानत'), 'जमानत');
    assert.equal(stripUnstorable('emoji \u{1F600} kept'), 'emoji \u{1F600} kept');
  });

  it('leaves ordinary text untouched', () => {
    assert.equal(stripUnstorable('Section 302 IPC'), 'Section 302 IPC');
  });
});
