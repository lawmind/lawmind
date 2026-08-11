import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SearchScreen } from './SearchScreen';
import { api } from '../../api/client';
import { MOCK_RESULTS } from '../../api/fixtures';
import type { SearchResponse } from '../../api/contract';

/**
 * THE RULE UNDER TEST — R2, `docs/RCC_CONTINUATION_PROMPT.md` §3: structured
 * search's `parsed` echo must always be shown, and a zero-match structured
 * query must never read as "try different wording" — that advice belongs to
 * the semantic path and is wrong for a query the server understood exactly.
 * A2.7: structure decides, semantics fills, never blended.
 */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../api/client', () => ({
  api: { search: jest.fn(), addAuthorityToMatter: jest.fn() },
}));

jest.mock('../../state/practice', () => ({
  usePractice: (selector: (s: unknown) => unknown) =>
    selector({
      matters: [
        {
          matterId: 'mat_1',
          caseTitle: 'Mock Client v. Mock Opponent',
          court: 'Mock High Court',
          nextHearingDate: null,
        },
      ],
    }),
}));

const search = api.search as jest.MockedFunction<typeof api.search>;
const addAuthority = api.addAuthorityToMatter as jest.MockedFunction<
  typeof api.addAuthorityToMatter
>;
const PLACEHOLDER = 'Ask in plain language, or paste a citation';

function response(over: Partial<SearchResponse> = {}): SearchResponse {
  return {
    results: [],
    unverifiedReferences: [],
    searchId: null,
    ...over,
  };
}

/** `fireEvent` is async in this RNTL version — an unawaited call bleeds into the next test. */
async function runSearch(query: string) {
  const input = screen.getByPlaceholderText(PLACEHOLDER);
  await fireEvent.changeText(input, query);
  await fireEvent(input, 'submitEditing');
}

describe('SearchScreen — structured search (R2)', () => {
  beforeEach(() => {
    search.mockReset();
    mockPush.mockReset();
  });

  it('shows the parsed interpretation when results are found', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({
        results: [MOCK_RESULTS[0]!],
        parsed: 'Judgments decided by a judge matching "Kania", and referring to section 138.',
        total: 214,
      }),
    });
    await render(<SearchScreen />);
    await runSearch('judge:"Kania" AND section:138');

    expect(
      await screen.findByText('Judgments decided by a judge matching "Kania", and referring to section 138.')
    ).toBeTruthy();
    // total > results shown — the count states both, not just the page length.
    expect(screen.getByText('1 of 214 judgments')).toBeTruthy();
  });

  it('renders zero structured matches as a trusted zero, never as "try different wording"', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({ results: [], parsed: 'Judgments citing "(2099) 9 SCC 9999".', total: 0 }),
    });
    await render(<SearchScreen />);
    await runSearch('cite:"(2099) 9 SCC 9999"');

    expect(await screen.findByText('Judgments citing "(2099) 9 SCC 9999".')).toBeTruthy();
    expect(
      screen.getByText(
        'No judgment in the corpus matches this. The query was understood correctly — this is not a search problem.'
      )
    ).toBeTruthy();
    // The semantic-path copy, which implies the corpus was merely not tried
    // hard enough, must not appear for an understood structured query.
    expect(screen.queryByText(/matches the words in a judgment rather than their meaning/)).toBeNull();
  });

  it('never offers "Clear the filters" on a structured zero-match — filters are not applied to a structured query', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({ results: [], parsed: 'Judgments citing "(2099) 9 SCC 9999".', total: 0 }),
    });
    await render(<SearchScreen />);
    await runSearch('cite:"(2099) 9 SCC 9999"');

    await screen.findByText('Judgments citing "(2099) 9 SCC 9999".');
    expect(screen.queryByText('Clear the filters')).toBeNull();
  });

  it('carries no parsed field for an ordinary prose query, and shows nothing where it would go', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({ results: [MOCK_RESULTS[0]!] }),
    });
    await render(<SearchScreen />);
    await runSearch('bail after cooperating with investigation');

    expect(await screen.findByText('1 judgment')).toBeTruthy();
    expect(screen.queryByText(/Judgments decided by/)).toBeNull();
  });
});

describe('SearchScreen — zero results always offers the coverage screen (R3)', () => {
  beforeEach(() => {
    search.mockReset();
    mockPush.mockReset();
  });

  it('offers "See what we hold" on an ordinary empty result, and it routes to /coverage', async () => {
    search.mockResolvedValue({ ok: true, data: response({ results: [] }) });
    await render(<SearchScreen />);
    await runSearch('a query the corpus does not contain');

    const action = await screen.findByText('See what we hold');
    await fireEvent.press(action);

    expect(mockPush).toHaveBeenCalledWith('/coverage');
  });

  it('offers it on a structured zero-match too, alongside the trusted-zero copy', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({ results: [], parsed: 'Judgments citing "(2099) 9 SCC 9999".', total: 0 }),
    });
    await render(<SearchScreen />);
    await runSearch('cite:"(2099) 9 SCC 9999"');

    await screen.findByText('Judgments citing "(2099) 9 SCC 9999".');
    expect(screen.getByText('See what we hold')).toBeTruthy();
  });
});

/**
 * THE EVIDENCE PASSAGE OPENS WHERE IT CAME FROM.
 *
 * PD-9 makes paragraph anchors linkable rather than local state — `?read=1&
 * para=N` — so tapping the operative paragraph on a result must land the
 * advocate ON that paragraph, not at the top of a judgment they then have to
 * re-find it in. Asserted through the router because the wiring is the feature:
 * the card can render the passage perfectly and still drop the anchor here.
 */
describe('SearchScreen — the operative paragraph is a route, not just text', () => {
  const withParagraph = {
    ...MOCK_RESULTS[0]!,
    operativeParagraph: 'The considered view of this Court is as follows.',
    operativeParagraphNumber: 17,
  };

  beforeEach(() => {
    search.mockReset();
    mockPush.mockReset();
  });

  it('opens the reading view at the paragraph the passage came from', async () => {
    search.mockResolvedValue({ ok: true, data: response({ results: [withParagraph] }) });
    await render(<SearchScreen />);
    await runSearch('considered view');

    await fireEvent.press(await screen.findByLabelText('Read paragraph 17 in full'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/judgment/[id]',
      params: expect.objectContaining({
        id: withParagraph.judgmentId,
        read: '1',
        para: '17',
      }),
    });
  });

  it('opening the card itself still lands on the judgment, with no anchor', async () => {
    search.mockResolvedValue({ ok: true, data: response({ results: [withParagraph] }) });
    await render(<SearchScreen />);
    await runSearch('considered view');

    await fireEvent.press(await screen.findByText(withParagraph.caseTitle));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/judgment/[id]',
      params: expect.not.objectContaining({ para: expect.anything() }),
    });
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EMPTY STATE MUST NOT BLAME A FILTER THAT WAS NEVER APPLIED, OR HIDE ONE
 * THAT WAS.
 *
 * Court went live 11 Aug 2026 (bus 0046, LCC `1cefe6c`) — `filters.courts` now
 * reaches the server, so it belongs in `hasActiveFilters` and its chip is
 * tappable. Bench and subject are still dead, still disabled, and still
 * excluded from `hasActiveFilters`: offering "Clear the filters" for a state
 * the advocate could never have set would point at the wrong remedy.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('why a search came back empty', () => {
  beforeEach(() => {
    search.mockReset();
    mockPush.mockReset();
  });

  it('does not offer to clear filters when none that narrow are set', async () => {
    search.mockResolvedValue({ ok: true, data: response() });
    await render(<SearchScreen />);
    await runSearch('a query matching nothing');

    expect(await screen.findByText(/Nothing matched/)).toBeTruthy();
    expect(screen.queryByText('Clear the filters')).toBeNull();
  });

  /**
   * Bench is still drawn and untappable — the design and PD-10 both name it,
   * and the shape stays in the contract against a judge-count column that
   * does not exist yet (bus 0046).
   */
  it('draws the bench chips as disabled, so the state cannot be set', async () => {
    search.mockResolvedValue({ ok: true, data: response() });
    await render(<SearchScreen />);
    await runSearch('anything');
    await fireEvent.press(screen.getByLabelText('Filters'));

    const chip = await screen.findByText('Constitution Bench');
    expect(
      screen.getByText('Bench does not narrow a search yet. Everything else does.')
    ).toBeTruthy();
    expect(chip).toBeTruthy();
  });

  it('lets a court chip be selected and sends the category to the search', async () => {
    search.mockResolvedValue({ ok: true, data: response() });
    await render(<SearchScreen />);
    await runSearch('anything');
    await fireEvent.press(screen.getByLabelText('Filters'));

    await fireEvent.press(await screen.findByText('Supreme Court'));
    // A search has already run, so the button counts rather than reads "Apply".
    await fireEvent.press(screen.getByText('Show 0 judgments'));

    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        'anything',
        'en',
        expect.objectContaining({ courts: ['sc'] })
      )
    );
  });

  /**
   * Bus 0046 — an empty result from a category the corpus holds nothing in
   * must not read as "your query matched nothing". Correcting the mirror
   * defect this same session found: a category that quietly returned zero
   * results, wearing the same face as a real empty search.
   */
  it('says which court category the corpus holds nothing in, rather than blaming the query', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({ unpopulatedCourtCategories: ['district'] }),
    });
    await render(<SearchScreen />);
    await fireEvent.press(screen.getByLabelText('Filters'));
    await fireEvent.press(await screen.findByText('District'));
    await fireEvent.press(screen.getByText('Apply these filters'));

    await runSearch('anything');

    expect(await screen.findByText(/We hold no district court judgments yet/)).toBeTruthy();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SAVING AN AUTHORITY WITHOUT LEAVING THE RESULTS.
 *
 * `ResultCard` has drawn "Add to a matter" since 11 Aug 2026 and search never
 * passed the prop, so the action rendered on no surface at all — built and
 * unreachable. An advocate had to open the judgment to keep an authority, which
 * is three taps and a lost place in the list for the thing a search is FOR.
 *
 * A picker is asked here and not on the briefing, because a judgment found by
 * search belongs to no matter yet while a briefing belongs to exactly one.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('saving a result to a matter', () => {
  const withResult = () =>
    search.mockResolvedValue({
      ok: true,
      data: response({ results: [MOCK_RESULTS[0]!] }),
    });

  beforeEach(() => {
    search.mockReset();
    mockPush.mockReset();
    addAuthority.mockReset();
    addAuthority.mockResolvedValue({
      ok: true,
      data: {
        authority: {
          authorityId: 'auth_1',
          judgmentId: MOCK_RESULTS[0]!.judgmentId,
          caseTitle: MOCK_RESULTS[0]!.caseTitle,
          neutralCitation: MOCK_RESULTS[0]!.neutralCitation,
          reporterCitations: MOCK_RESULTS[0]!.reporterCitations,
          addedBy: 'usr_1',
          addedAt: '2026-08-11T00:00:00.000Z',
          removedAt: null,
          verificationState: 'verified',
          verifiedBySource: 'corpus',
          overruledStatus: 'none',
          overruledByJudgmentId: null,
          overruledByTitle: null,
          overruledParas: null,
          overruledNote: null,
        },
      },
    });
  });

  it('offers the action on a result, and asks which matter', async () => {
    withResult();
    await render(<SearchScreen />);
    await runSearch('anything');

    await fireEvent.press(await screen.findByLabelText('Add to a matter'));

    expect(await screen.findByText('Save to which matter?')).toBeTruthy();
  });

  it('saves the chosen judgment into the chosen matter', async () => {
    withResult();
    await render(<SearchScreen />);
    await runSearch('anything');

    await fireEvent.press(await screen.findByLabelText('Add to a matter'));
    await fireEvent.press(await screen.findByText('Mock Client v. Mock Opponent'));

    expect(addAuthority).toHaveBeenCalledWith(
      expect.objectContaining({ matterId: 'mat_1', judgmentId: MOCK_RESULTS[0]!.judgmentId })
    );
  });

  /**
   * The server's message verbatim — on `set_aside` the 409 names the
   * replacement judgment, which is the actionable half of the refusal.
   */
  it('shows the server’s refusal rather than a message of our own', async () => {
    withResult();
    addAuthority.mockResolvedValue({
      ok: false,
      error: {
        code: 'AUTHORITY_SET_ASIDE',
        message: 'That authority has been set aside. Cite Mock Later Bench instead.',
      },
    });

    await render(<SearchScreen />);
    await runSearch('anything');
    await fireEvent.press(await screen.findByLabelText('Add to a matter'));
    await fireEvent.press(await screen.findByText('Mock Client v. Mock Opponent'));

    expect(
      await screen.findByText('That authority has been set aside. Cite Mock Later Bench instead.')
    ).toBeTruthy();
  });
});
