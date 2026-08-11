import { fireEvent, render, screen } from '@testing-library/react-native';

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
  api: { search: jest.fn() },
}));

const search = api.search as jest.MockedFunction<typeof api.search>;
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
 * THE EMPTY STATE MUST NOT BLAME FILTERS THAT WERE NEVER APPLIED.
 *
 * `hasActiveFilters` counted `courts` and `subjects`, and neither reaches the
 * search: `searchRequest` accepts `court`/`dateFrom`/`dateTo`/`caseType` and
 * nothing else, `serverFilters` sends only date and case type, and this screen
 * applies only the two reliability filters locally. So an advocate who selected
 * a court and got nothing was told to clear filters that had not narrowed
 * anything — a remedy that could not have changed the result.
 *
 * The dead controls are now disabled in `FiltersSheet`, so the state they set
 * is no longer reachable at all. What is pinned here is the other half: with no
 * settable filter applied, an empty result must not offer a filter remedy.
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
   * The three dead groups are drawn and untappable rather than removed — the
   * design and PD-10 both name them, and the shapes stay in the contract for
   * the day the server accepts them.
   */
  it('draws the court chips as disabled, so the state cannot be set', async () => {
    search.mockResolvedValue({ ok: true, data: response() });
    await render(<SearchScreen />);
    await runSearch('anything');
    await fireEvent.press(screen.getByLabelText('Filters'));

    const chip = await screen.findByText('Supreme Court');
    expect(screen.getByText('Court and bench do not narrow a search yet. Everything below does.')).toBeTruthy();
    expect(chip).toBeTruthy();
  });
});
