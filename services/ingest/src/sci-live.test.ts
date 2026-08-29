import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { neutralCitation, officialSciRole, parseSciJudgmentFeed } from './sci-live.ts';

const judgment = `
<a href="https://www.sci.gov.in/view-pdf/?diary_no=280632026&type=j&order_date=2026-08-25&from=latest_judgements_order">
  MS TATA STEEL LIMITED VS. UNION OF INDIA - C.A. No. 12020/2026 - Diary Number 28063 / 2026 -
  <span>25-Aug-2026</span><div>(Uploaded On 25-08-2026 19:16:50)</div>
</a>`;

const order = `<a href="https://www.sci.gov.in/view-pdf/?diary_no=1&type=o&order_date=2026-08-25&from=latest_judgements_order">Interim order</a>`;

describe('SCI official live feed boundary', () => {
  it('parses a type=j judgment with source identity', () => {
    const rows = parseSciJudgmentFeed(judgment);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.caseTitle, 'MS TATA STEEL LIMITED VS. UNION OF INDIA');
    assert.equal(rows[0]?.caseNumber, 'C.A. No. 12020/2026');
    assert.equal(rows[0]?.judgmentDate, '2026-08-25');
    assert.equal(rows[0]?.uploadedAt, '2026-08-25T19:16:50+05:30');
    assert.match(rows[0]?.pdfUrl ?? '', /sci-get-pdf/);
  });

  it('does not admit type=o orders to the judgment feed', () => {
    assert.equal(parseSciJudgmentFeed(order).length, 0);
    assert.equal(officialSciRole('https://www.sci.gov.in/view-pdf/?type=o'), 'order_pdf');
  });

  it('treats Landmark Judgment Summaries as editorial, never judgments', () => {
    assert.equal(
      officialSciRole('https://www.sci.gov.in/landmark-judgment-summaries/', 'Judgment Summary'),
      'editorial_summary',
    );
  });

  it('extracts an intact neutral citation but abstains on a page-number concatenation', () => {
    assert.equal(neutralCitation('2026 INSC 920Page 1 of 10\nIN THE SUPREME COURT'), '2026 INSC 920');
    assert.equal(neutralCitation('2026 INSC 9191\nREPORTABLE\nIN THE SUPREME COURT'), null);
  });
});
