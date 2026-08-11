import { render, screen } from '@testing-library/react-native';

import { ResultCard } from './ResultCard';
import type { SearchResult } from '../api/contract';

/**
 * THE ABSENCE TEST.
 *
 * `sprints/SPRINT_2.md` §RCC DONE: "A verified result renders NO MARK — assert
 * the absence in a test, so a regression that reintroduces badges is caught."
 *
 * The pure-function tests in `src/citation/renderState.test.ts` prove the
 * DECISION is right. This file proves the COMPONENT obeys it. They are not the
 * same thing: someone adding a reassuring green tick to this card because a
 * screen "looked empty" would pass every test in the other file.
 */

const base: SearchResult = {
  judgmentId: 'jdg_test',
  citationCheckId: null,
  caseTitle: 'Mock Party v. Mock State',
  neutralCitation: 'MOCK 2026 EXAMPLE 1',
  reporterCitations: [],
  court: 'Mock SC · 2026',
  judgmentDate: '2026-01-01',
  holding: 'Fixture holding.',
  operativeParagraph: 'Fixture operative paragraph.',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
  asOf: '2026-08-06T00:00:00.000Z',
};

/** Every string the two rendered marks can produce. None may appear on a clean row. */
const MARK_STRINGS = [
  'Do not file this without checking it',
  'Confirm it on eCourts — about a minute',
  'Overruled',
  'Doubted · referred',
  'set aside',
  'Verified',
  'VERIFIED',
  'Safe to file',
];

describe('a verified, good-law result renders no mark at all', () => {
  it.each(['corpus', 'public_x2', 'ecourts', 'ecourts_bulk'] as const)(
    'renders nothing for verified via %s',
    async (verifiedBySource) => {
      await render(
        <ResultCard result={{ ...base, verifiedBySource }} />
      );
      for (const mark of MARK_STRINGS) {
        expect(screen.queryByText(mark)).toBeNull();
      }
    }
  );

  it('still renders the citation, the case name and the holding', async () => {
    await render(<ResultCard result={base} />);
    expect(screen.getByText('MOCK 2026 EXAMPLE 1')).toBeTruthy();
    expect(screen.getByText('Fixture holding.')).toBeTruthy();
  });
});

describe('unverified and failed are unmissable', () => {
  it.each(['unverified', 'failed'] as const)('marks %s and offers the eCourts path', async (verificationState) => {
    await render(
      <ResultCard result={{ ...base, verificationState, verifiedBySource: 'none' }} />
    );
    expect(screen.getByText('Do not file this without checking it')).toBeTruthy();
    expect(screen.getByText('Confirm it on eCourts — about a minute')).toBeTruthy();
  });

  it('shows the server-supplied reason rather than a generic line', async () => {
    await render(
      <ResultCard
        result={{
          ...base,
          verificationState: 'unverified',
          verifiedBySource: 'none',
          unconfirmedReason: 'The Mock High Court portal has no record.',
        }}
      />
    );
    expect(screen.getByText('The Mock High Court portal has no record.')).toBeTruthy();
  });

  /** An unverified citation is ALWAYS shown. Silence never stands for removal. */
  it('renders the judgment itself, not just the warning', async () => {
    await render(
      <ResultCard result={{ ...base, verificationState: 'unverified', verifiedBySource: 'none' }} />
    );
    expect(screen.getByText('Mock Party v. Mock State')).toBeTruthy();
  });
});

describe('the law has moved — all three states are legible in a list', () => {
  it('marks set_aside and strikes the title through', async () => {
    await render(
      <ResultCard result={{ ...base, overruledStatus: 'set_aside' }} />
    );
    expect(screen.getByText('Overruled')).toBeTruthy();

    const title = screen.getByText('Mock Party v. Mock State');
    const flattened = ([] as unknown[])
      .concat(title.props.style)
      .filter(Boolean) as { textDecorationLine?: string }[];
    expect(flattened.some((s) => s?.textDecorationLine === 'line-through')).toBe(true);
  });

  it('names the affected paragraphs for partly_set_aside and states what still stands first', async () => {
    await render(
      <ResultCard
        result={{
          ...base,
          overruledStatus: 'partly_set_aside',
          overruledParas: [19, 20],
          overruledNote: 'The observations on misuse still stand.',
        }}
      />
    );
    expect(screen.getByText('Paras 19–20 set aside')).toBeTruthy();
    expect(screen.getByText('The observations on misuse still stand.')).toBeTruthy();
  });

  it('marks doubted with a chip and no band — it still binds', async () => {
    await render(<ResultCard result={{ ...base, overruledStatus: 'doubted' }} />);
    expect(screen.getByText('Doubted · referred')).toBeTruthy();
  });

  /** A judgment can be verified AND set aside. Both facts render. */
  it('marks a verified judgment that has been set aside', async () => {
    await render(
      <ResultCard result={{ ...base, verificationState: 'verified', overruledStatus: 'set_aside' }} />
    );
    expect(screen.getByText('Overruled')).toBeTruthy();
    expect(screen.queryByText('Do not file this without checking it')).toBeNull();
  });

  it('never presents a status read earlier as current', async () => {
    await render(
      <ResultCard
        result={{ ...base, overruledStatus: 'doubted' }}
        statusAsOf="2 August 2026"
      />
    );
    expect(screen.getByText('Good-law status as of 2 August 2026')).toBeTruthy();
  });
});
