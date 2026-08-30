import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SearchScreen } from './SearchScreen';
import { api } from '../../api/client';
import type { SearchResponse } from '../../api/contract';

/**
 * THE RULE UNDER TEST — R12 §4: a degraded or refused response may NEVER be
 * presented as zero results.
 *
 * The refusal is not hypothetical and it is not rare. "bail" restricted to the
 * High Courts over a single month comes back with `degraded: ['sparse_unbounded']`,
 * `emptyBecause: { query_too_broad_to_rank, add_more_terms }` and zero rows.
 * That is the daily-loop query. Rendering "No judgments matched" for it tells an
 * advocate the corpus holds no bail authority from their own High Court last
 * month.
 *
 * THE SECOND RULE, AND R14 A7 CORRECTED HALF OF IT. This file used to say the
 * remedy is more terms and NEVER a filter, because the gate was computed
 * corpus-wide and never saw them. That is false at HEAD: when the corpus-wide
 * gate refuses, the server checks for a narrowing filter, counts the eligible
 * population and admits the query if it is small enough to rank. What survives
 * the correction is WHICH narrowing — ONE NAMED COURT and a SHORTER DATE RANGE,
 * never a court CATEGORY, which leaves every High Court in the population.
 * Measured: one named court plus a month answers; `courts: ['hc']` plus a month
 * is refused. So "clear the filters" is still advice that cannot work, and the
 * screen must never name a threshold or predict admission.
 */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('../../api/client', () => ({
  api: { search: jest.fn(), addAuthorityToMatter: jest.fn() },
}));

jest.mock('../../state/practice', () => ({
  usePractice: (selector: (s: unknown) => unknown) => selector({ matters: [] }),
}));

const search = api.search as jest.MockedFunction<typeof api.search>;
const PLACEHOLDER = 'Ask, or enter a CNR, case number, or citation';

function response(over: Partial<SearchResponse> = {}): SearchResponse {
  return { results: [], unverifiedReferences: [], searchId: null, ...over };
}

async function runSearch(query: string) {
  const input = screen.getByPlaceholderText(PLACEHOLDER);
  await fireEvent.changeText(input, query);
  await fireEvent(input, 'submitEditing');
}

describe('SearchScreen — a refusal is not an empty result', () => {
  beforeEach(() => {
    search.mockReset();
    mockPush.mockReset();
  });

  it('renders the refusal, and never "No judgments matched"', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({
        degraded: ['sparse_unbounded'],
        emptyBecause: { reason: 'query_too_broad_to_rank', remedy: 'add_more_terms' },
        retrievalOutcome: {
          state: 'coverage_unknown',
          reasons: ['sparse_unbounded'],
          safeForGeneration: false,
          exactIdentityUsable: true,
          resultCount: 0,
          rarestDf: 0.2577,
          contractVersion: 1,
        },
      }),
    });
    await render(<SearchScreen />);
    await runSearch('bail');

    await waitFor(() => {
      expect(screen.getByText('This search was too broad to run')).toBeTruthy();
    });
    expect(screen.queryByText('No judgments matched')).toBeNull();
    // Both remedies, and the narrowing one names a COURT and a DATE RANGE.
    expect(screen.getByText(/Adding more of the words/)).toBeTruthy();
    expect(screen.getByText(/one named court and a shorter range of dates/)).toBeTruthy();
    expect(screen.queryByText('Clear the filters')).toBeNull();
  });

  /**
   * THE SENTENCE THIS ROUND DELETED, ASSERTED AS AN ABSENCE.
   *
   * "a court or date filter does not" was true under R12's stated mechanism and
   * is mechanically false at HEAD — it told an advocate that the second of the
   * two levers the server actually has does nothing. An absence is the only way
   * to catch it coming back, the same reason the citation harness asserts the
   * absence of a badge rather than the presence of one.
   */
  it('never tells the advocate that a court or date filter cannot help', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({
        degraded: ['sparse_unbounded'],
        emptyBecause: { reason: 'query_too_broad_to_rank', remedy: 'add_more_terms' },
      }),
    });
    await render(<SearchScreen />);
    await runSearch('bail');

    await screen.findByText('This search was too broad to run');
    expect(screen.queryByText(/a court or date filter does not/)).toBeNull();
    // And it must not have swung the other way into a promise or a number.
    expect(screen.queryByText(/20,000/)).toBeNull();
    expect(screen.queryByText(/will be admitted|guarantee/i)).toBeNull();
    // A category chip is a filter, never THE remedy for a refusal.
    expect(screen.queryByText(/All High Courts/i)).toBeNull();
  });

  /**
   * CASE-FIRST. A party name is how an advocate names a CASE. The screen asks
   * for the cause title, which resolves at rank 1 — and offers no person.
   */
  it('asks for the cause title when the query reads as a bare party name', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({
        degraded: ['sparse_unbounded'],
        emptyBecause: { reason: 'query_too_broad_to_rank', remedy: 'add_more_terms' },
      }),
    });
    await render(<SearchScreen />);
    await runSearch('SATENDER KUMAR ANTIL');

    await waitFor(() => {
      expect(screen.getByText(/type the full cause title/)).toBeTruthy();
    });
    // No person surface anywhere: no profile, no history, no dossier.
    expect(screen.queryByText(/profile/i)).toBeNull();
    expect(screen.queryByText(/history of this person/i)).toBeNull();
  });

  it('coverage_unknown never renders as no results either', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({
        retrievalOutcome: {
          state: 'coverage_unknown',
          reasons: ['semantic_index_insufficient'],
          safeForGeneration: false,
          exactIdentityUsable: true,
          resultCount: 0,
          contractVersion: 1,
        },
      }),
    });
    await render(<SearchScreen />);
    await runSearch('whether sanction is required for cognizance');

    await waitFor(() => {
      expect(screen.getByText('We could not search everything')).toBeTruthy();
    });
    expect(screen.queryByText('No judgments matched')).toBeNull();
  });

  /**
   * The honest empty must survive all of this. We looked, and there is nothing
   * — that is a real, useful answer and it still renders as one.
   */
  it('an honest empty still says so', async () => {
    search.mockResolvedValue({ ok: true, data: response({}) });
    await render(<SearchScreen />);
    await runSearch('a query that genuinely matches nothing at all');

    await waitFor(() => {
      expect(screen.getByText('No judgments matched')).toBeTruthy();
    });
  });

  /**
   * A remedy this build has never heard of is shown verbatim rather than
   * paraphrased. Paraphrasing an unknown instruction is inventing advice.
   */
  it('shows an unrecognised remedy verbatim', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({
        degraded: ['sparse_unbounded'],
        emptyBecause: { reason: 'shard_unavailable', remedy: 'retry_later' },
      }),
    });
    await render(<SearchScreen />);
    await runSearch('bail');

    await waitFor(() => {
      expect(screen.getByText(/shard_unavailable/)).toBeTruthy();
    });
    expect(screen.getByText(/retry_later/)).toBeTruthy();
  });
});
