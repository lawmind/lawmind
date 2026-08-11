import { render, screen } from '@testing-library/react-native';

import { ResultCard } from './ResultCard';
import { NO_CITATION } from '../citation/citationDisplay';
import type { SearchResult } from '../api/contract';

/**
 * REGRESSION — A CITATIONLESS JUDGMENT ON A SEARCH CARD.
 *
 * `citationDisplay` being correct does not prove this card calls it. Before
 * 11 Aug 2026 the card interpolated `result.neutralCitation` raw, and against
 * the 40,980 High Court rows now in the corpus it rendered an EMPTY citation
 * slot — which reads as the product failing to show something it holds, and is
 * indistinguishable at a glance from a Supreme Court row that has one.
 *
 * The rule under test is the client contract §7: a citationless judgment is a
 * real judgment that cannot be cited, and must look like neither an invalid one
 * nor a cited one.
 */

const patna: SearchResult = {
  judgmentId: 'jdg_hc',
  citationCheckId: null,
  caseTitle: 'Mock Petitioner v. State of Bihar',
  neutralCitation: null,
  reporterCitations: [],
  court: 'Patna High Court · 2019',
  judgmentDate: '2019-04-11',
  holding: '',
  operativeParagraph: '',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
  asOf: '2026-08-11T00:00:00.000Z',
};

const reported: SearchResult = {
  ...patna,
  judgmentId: 'jdg_sc',
  caseTitle: 'Mock Appellant v. Union of India',
  neutralCitation: 'MOCK 2026 EXAMPLE 1',
  court: 'Mock SC · 2026',
};

describe('a judgment with no citation', () => {
  it('says so, rather than leaving the slot empty', async () => {
    await render(<ResultCard result={patna} />);

    expect(screen.getByText(NO_CITATION)).toBeTruthy();
  });

  it('never renders the literal null or undefined', async () => {
    await render(<ResultCard result={patna} />);

    expect(screen.queryByText('null')).toBeNull();
    expect(screen.queryByText('undefined')).toBeNull();
    expect(screen.queryByText(/,\s*null/)).toBeNull();
  });

  it('still shows the case, the court and the route in — it is not an invalid judgment', async () => {
    await render(<ResultCard result={patna} />);

    expect(screen.getByText('Mock Petitioner v. State of Bihar')).toBeTruthy();
    expect(screen.getByText('Patna High Court · 2019')).toBeTruthy();
  });

  /**
   * VERIFIED IS STILL SILENT, and "no citation" is NOT the unverified state.
   * This row was confirmed against the corpus — we hold the judgment. What we
   * do not hold is a citation, which is a different fact with a different
   * remedy, and it must not borrow the unverified mark's copy.
   */
  it('does not borrow the unverified mark, which answers a different question', async () => {
    await render(<ResultCard result={patna} />);

    expect(screen.queryByText('Do not file this without checking it')).toBeNull();
    expect(screen.queryByText('Confirm it on eCourts — about a minute')).toBeNull();
  });

  it('adds no verification badge either — verified stays silent', async () => {
    await render(<ResultCard result={patna} />);

    for (const mark of ['Verified', 'Safe to file', 'Verified Primary Source']) {
      expect(screen.queryByText(mark)).toBeNull();
    }
  });
});

describe('a judgment that does carry a citation is unchanged', () => {
  it('renders the citation and never the absent-citation line', async () => {
    await render(<ResultCard result={reported} />);

    expect(screen.getByText('MOCK 2026 EXAMPLE 1')).toBeTruthy();
    expect(screen.queryByText(NO_CITATION)).toBeNull();
  });

  it('falls back to a reporter citation when the neutral one is missing', async () => {
    await render(
      <ResultCard result={{ ...patna, reporterCitations: ['(2019) 4 PLJR 221'] }} />
    );

    expect(screen.getByText('(2019) 4 PLJR 221')).toBeTruthy();
    expect(screen.queryByText(NO_CITATION)).toBeNull();
  });
});

describe('the citation slot survives the overruled branch', () => {
  /**
   * When the law has moved the chip takes the record row and the citation moves
   * below it — a second render site, and therefore a second chance to
   * reintroduce the raw field.
   */
  it('still says "no citation" on an overruled row with none', async () => {
    await render(<ResultCard result={{ ...patna, overruledStatus: 'set_aside' }} />);

    expect(screen.getByText('Overruled')).toBeTruthy();
    expect(screen.getByText(NO_CITATION)).toBeTruthy();
    expect(screen.queryByText('null')).toBeNull();
  });

  it('renders the real citation there when the row has one', async () => {
    await render(<ResultCard result={{ ...reported, overruledStatus: 'set_aside' }} />);

    expect(screen.getByText('MOCK 2026 EXAMPLE 1')).toBeTruthy();
    expect(screen.queryByText(NO_CITATION)).toBeNull();
  });
});
