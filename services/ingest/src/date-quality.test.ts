/**
 * Fixtures are real rows from the 21 Aug 2026 measurement.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dateQuality, filenameDate, printedDates } from './date-quality.ts';

const URL_2024 =
  'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year=2024/court=3_22/bench=phhc/PHHC010329461999_1_2024-02-13.pdf';

describe('the witnesses', () => {
  it('reads the publisher date out of the filename, not the partition', () => {
    assert.equal(filenameDate(URL_2024), '2024-02-13');
  });

  it('reads an Indian order date day-first', () => {
    /* 13.02.2024 is 13 February. Reading it month-first would manufacture a
     * disagreement in exactly the documents this module adjudicates. */
    assert.ok(printedDates('Dated: 13.02.2024').has('2024-02-13'));
  });

  it('admits BOTH readings of an ambiguous pair rather than guessing', () => {
    const d = printedDates('order dated 03/04/2024');
    assert.ok(d.has('2024-04-03'));
    assert.ok(d.has('2024-03-04'));
  });
});

describe('dateQuality — VERIFIED needs the primary document', () => {
  it('verifies when the document prints the stored date', () => {
    const r = dateQuality({
      judgmentDate: '2024-02-13',
      sourceUrl: URL_2024,
      text: 'Reserved on 01.02.2024 and pronounced on 13.02.2024 by this Court.',
    });
    assert.equal(r.state, 'DATE_VERIFIED');
    assert.equal(r.filenameDeltaDays, 0);
  });

  /**
   * The measured case: 33 of 34 documents where the filename and the stored date
   * differ by a day print the FILENAME date. Agreeing with the publisher is not
   * evidence, so a filename match alone must never reach VERIFIED.
   */
  it('will not verify on the filename alone when the document is silent', () => {
    const r = dateQuality({ judgmentDate: '2024-02-13', sourceUrl: URL_2024, text: 'no dates here at all' });
    assert.equal(r.state, 'DATE_UNKNOWN');
  });
});

describe('dateQuality — SUSPECT needs a witness that actively disagrees', () => {
  it('flags the off-by-one and names it', () => {
    const url = URL_2024.replace('2024-02-13', '2025-03-07');
    const r = dateQuality({
      judgmentDate: '2025-03-06',
      sourceUrl: url,
      text: 'Order dated 07.03.2025',
    });
    assert.equal(r.state, 'DATE_SUSPECT');
    assert.equal(r.offByOneDay, true);
    assert.equal(r.filenameDeltaDays, -1);
  });

  it('flags a date wrong by more than a year', () => {
    const url = URL_2024.replace('2024-02-13', '2025-09-12');
    const r = dateQuality({ judgmentDate: '2023-03-17', sourceUrl: url, text: 'decided on 12.09.2025' });
    assert.equal(r.state, 'DATE_SUSPECT');
    assert.notEqual(r.filenameDeltaDays, null);
    assert.ok(r.filenameDeltaDays! < -366);
  });

  /**
   * A document with no extractable text prints no date. That is silence, and
   * treating it as contradiction would convict every one of the 1.6M
   * text-damaged documents of a date defect nothing measured.
   */
  it('does not convict a silent document', () => {
    const r = dateQuality({ judgmentDate: '2024-02-13', sourceUrl: null, text: '' });
    assert.equal(r.state, 'DATE_UNKNOWN');
  });
});

describe('dateQuality — UNKNOWN is a value', () => {
  it('returns UNKNOWN with no witnesses when there is nothing to ask', () => {
    const r = dateQuality({ judgmentDate: '2024-02-13', sourceUrl: null, text: null });
    assert.equal(r.state, 'DATE_UNKNOWN');
    assert.deepEqual(r.witnesses, []);
  });

  it('returns UNKNOWN, never SUSPECT, when the stored date is absent', () => {
    const r = dateQuality({ judgmentDate: null, sourceUrl: URL_2024, text: 'dated 13.02.2024' });
    assert.equal(r.state, 'DATE_UNKNOWN');
  });

  it('never rewrites or returns a corrected date', () => {
    const url = URL_2024.replace('2024-02-13', '2025-03-07');
    const r = dateQuality({ judgmentDate: '2025-03-06', sourceUrl: url, text: 'Order dated 07.03.2025' });
    assert.ok(!Object.keys(r).includes('correctedDate'));
    assert.equal(r.witnesses.find((w) => w.kind === 'source_filename')?.date, '2025-03-07');
  });
});
