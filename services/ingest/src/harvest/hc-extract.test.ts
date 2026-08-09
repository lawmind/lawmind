import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OCR_CHARS_PER_PAGE_FLOOR, percentile, projectCompletion } from './hc-extract.ts';
import { pdfUrlFor } from './hc-metadata.ts';

describe('pdfUrlFor', () => {
  const partitions = { year: 2024, courtCode: '10_8', bench: 'patnahcucisdb94' };

  it('takes only the BASENAME of a plain-variant pdf_link', () => {
    // Verified against the bucket: this exact derivation returns HTTP 200.
    // The pdf_link is a path on the court's own site, not a key in the bucket.
    const url = pdfUrlFor(
      partitions,
      'court/cnrorders/patnahcucisdb94/orders/BRHC011164592023_1_2024-05-03.pdf',
    );
    assert.equal(
      url,
      'https://indian-high-court-judgments.s3.ap-south-1.amazonaws.com/data/pdf/year=2024/court=10_8/bench=patnahcucisdb94/BRHC011164592023_1_2024-05-03.pdf',
    );
  });

  it('handles a mobile-variant pdf_link, which is already a bare filename', () => {
    const url = pdfUrlFor(
      { year: 2024, courtCode: '23_23', bench: 'mphc_db_gwl' },
      'orders_2024_206300000742024_1.pdf',
    );
    assert.ok(url.endsWith('/bench=mphc_db_gwl/orders_2024_206300000742024_1.pdf'));
  });
});

describe('percentile', () => {
  it('returns 0 for an empty series rather than NaN', () => {
    assert.equal(percentile([], 95), 0);
  });

  it('does not mutate the caller’s array', () => {
    const values = [5, 1, 3];
    percentile(values, 50);
    assert.deepEqual(values, [5, 1, 3]);
  });

  it('reads the expected order statistic', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    assert.equal(percentile(values, 50), 51);
    assert.equal(percentile(values, 95), 96);
    assert.equal(percentile(values, 100), 100);
  });
});

describe('projectCompletion', () => {
  it('divides by workers and reports the single-worker cost alongside', () => {
    const p = projectCompletion({ documents: 3_600_000, msPerDocument: 100, workers: 10 });
    // 3.6M × 100 ms = 360,000 s = 100 h on one worker, 10 h on ten.
    assert.equal(p.perWorkerHours, 100);
    assert.equal(p.hours, 10);
    assert.ok(Math.abs(p.days - 10 / 24) < 1e-9);
  });

  it('scales linearly in documents — the projection is a multiplication and says so', () => {
    const one = projectCompletion({ documents: 1_000, msPerDocument: 50, workers: 1 });
    const ten = projectCompletion({ documents: 10_000, msPerDocument: 50, workers: 1 });
    assert.ok(Math.abs(ten.hours - one.hours * 10) < 1e-9);
  });
});

describe('the OCR floor', () => {
  it('is per PAGE, so document length does not decide it', () => {
    // A 40-page scan yielding 39 chars/page and a 1-page scan yielding the same
    // must classify identically; only the ratio matters.
    const needsOcr = (characters: number, pages: number) =>
      characters / pages < OCR_CHARS_PER_PAGE_FLOOR;
    assert.equal(needsOcr(40 * 39, 40), true);
    assert.equal(needsOcr(39, 1), true);
    // A short but genuinely typed order is NOT an OCR case.
    assert.equal(needsOcr(900, 1), false);
  });
});
