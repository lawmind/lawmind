import { render, screen } from '@testing-library/react-native';

import { CoverageScreen } from './CoverageScreen';
import { api } from '../../api/client';
import type { CorpusCoverage } from '../../api/contract';

/**
 * THE RULE UNDER TEST — R3, `docs/RCC_CONTINUATION_PROMPT.md` §3: coverage is
 * OUR uncertainty and must never be dressed as a judgment count or as the law
 * having moved. Three checks pinned here because they are the three the
 * contract calls out as not cosmetic.
 */

jest.mock('../../api/client', () => ({
  api: { corpusCoverage: jest.fn() },
}));

const corpusCoverage = api.corpusCoverage as jest.MockedFunction<typeof api.corpusCoverage>;

function coverage(over: Partial<CorpusCoverage> = {}): CorpusCoverage {
  return {
    supremeCourt: { courtName: 'Supreme Court of India', held: 38_341, sourceDocuments: null },
    highCourts: [
      {
        courtName: 'Allahabad High Court',
        courtCode: 'allahabad',
        sourceDocuments: 3_493_695,
        held: 0,
        firstYear: 2016,
        lastYear: 2026,
      },
      {
        courtName: 'Bombay High Court',
        courtCode: 'bombay',
        sourceDocuments: 1_200_000,
        held: 0,
        firstYear: 2016,
        lastYear: 2026,
      },
    ],
    judgmentShareUnknown: true,
    judgmentShareRange: [0.0075, 0.1864],
    enumeratedAt: '2026-08-10T00:00:00.000Z',
    ...over,
  };
}

describe('CoverageScreen', () => {
  beforeEach(() => {
    corpusCoverage.mockReset();
  });

  it('never labels the High Court figure "judgments" — only "documents"', async () => {
    corpusCoverage.mockResolvedValue({ ok: true, data: coverage() });
    await render(<CoverageScreen onBack={() => {}} />);

    expect(await screen.findByText(/of 34,93,695 documents held/)).toBeTruthy();
    expect(screen.queryByText(/34,93,695 judgments/)).toBeNull();
  });

  it('shows the Supreme Court total as a real judgment count, complete', async () => {
    corpusCoverage.mockResolvedValue({ ok: true, data: coverage() });
    await render(<CoverageScreen onBack={() => {}} />);

    expect(await screen.findByText(/38,341 judgments held\. Complete/)).toBeTruthy();
  });

  it('states the judgment-share range once, up front, rather than per row', async () => {
    corpusCoverage.mockResolvedValue({ ok: true, data: coverage() });
    await render(<CoverageScreen onBack={() => {}} />);

    expect(
      await screen.findByText(/somewhere between 0\.75% and 18\.64% of each number/)
    ).toBeTruthy();
  });

  it('sorts worst-gap-first, exactly as the server sent it — never re-sorted client-side', async () => {
    corpusCoverage.mockResolvedValue({ ok: true, data: coverage() });
    await render(<CoverageScreen onBack={() => {}} />);

    const names = (await screen.findAllByText(/High Court$/)).map((n) => n.props.children);
    expect(names).toEqual(['Allahabad High Court', 'Bombay High Court']);
  });
});
