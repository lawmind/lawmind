import { citationDisplay, NO_CITATION } from './citationDisplay';
import { MOCK_JUDGMENTS } from '../api/fixtures';
import type { JudgmentDetail } from '../api/contract';

/**
 * THE IDENTIFIERS A JUDGMENT KEEPS WHEN IT HAS NO CITATION.
 *
 * `CITATION_HARNESS.md` §"The fourth concern" is explicit that citability
 * changes what is RENDERED, never what is retrieved, and that an uncitable
 * judgment keeps everything else it has: *"preserve case number, parties,
 * court, date, source URL and paragraph information where available."*
 *
 * The server has sent `case_number` and `source_url` on every judgment since
 * S1 — `services/api/src/judgments/route.ts` selects and returns both, and
 * `source_url` is `notNull` in `packages/db/src/schema.ts:313`. Neither was
 * declared on `JudgmentDetail` until 11 Aug 2026, so for the 40,980 High Court
 * judgments carrying no citation the screen had nothing to identify the case
 * with at all.
 *
 * These are contract-level assertions: the fields must stay declared and the
 * fixtures must keep exercising them, so the renderer cannot silently lose a
 * judgment's only handle again.
 */

const judgments = Object.values(MOCK_JUDGMENTS) as JudgmentDetail[];

describe('every judgment carries the identifiers the harness requires', () => {
  it('has a source URL, because the schema says it is never null', () => {
    for (const j of judgments) {
      expect(typeof j.sourceUrl).toBe('string');
      expect(j.sourceUrl.length).toBeGreaterThan(0);
    }
  });

  it('carries the court, the date and the parties regardless of citation', () => {
    for (const j of judgments) {
      expect(j.caseTitle.length).toBeGreaterThan(0);
      expect(j.court.length).toBeGreaterThan(0);
      expect(j.judgmentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('keeps its paragraphs — citability changes rendering, never retrieval', () => {
    for (const j of judgments) {
      expect(Array.isArray(j.paragraphs)).toBe(true);
      expect(j.paragraphs.length).toBeGreaterThan(0);
    }
  });
});

describe('a case number is an identifier, never a citation', () => {
  /**
   * The distinction is the whole point. A case number identifies a proceeding
   * on a court's register; a citation identifies a reported judgment. Feeding
   * one into the citation slot would be fabrication by a longer route — which
   * is why `citationDisplay` never consults it.
   */
  it('is not used to fill an empty citation slot', () => {
    const uncitable = citationDisplay({
      neutralCitation: null,
      reporterCitations: [],
    });

    expect(uncitable.text).toBe(NO_CITATION);
    expect(uncitable.citable).toBe(false);
  });

  it('does not leak a case number into the copied string', () => {
    const withNumber = judgments.find((j) => j.caseNumber);
    expect(withNumber).toBeDefined();

    const display = citationDisplay({
      neutralCitation: null,
      reporterCitations: [],
    });
    expect(display.stored).toBeUndefined();
    expect(display.text).not.toContain(withNumber!.caseNumber!);
  });
});
