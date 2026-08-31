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
const PLACEHOLDER = 'Ask, or enter a CNR, case number, or citation';

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
      await screen.findByText(
        'Judgments decided by a judge matching "Kania", and referring to section 138.',
      ),
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
        'No judgment in the corpus matches this. The query was understood correctly — this is not a search problem.',
      ),
    ).toBeTruthy();
    // The semantic-path copy, which implies the corpus was merely not tried
    // hard enough, must not appear for an understood structured query.
    expect(
      screen.queryByText(/matches the words in a judgment rather than their meaning/),
    ).toBeNull();
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
      screen.getByText('Bench does not narrow a search yet. Everything else does.'),
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
        expect.objectContaining({ courts: ['sc'] }),
      ),
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
      expect.objectContaining({ matterId: 'mat_1', judgmentId: MOCK_RESULTS[0]!.judgmentId }),
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
      await screen.findByText('That authority has been set aside. Cite Mock Later Bench instead.'),
    ).toBeTruthy();
  });
});

describe('SearchScreen — a degraded ranker is never "no law found"', () => {
  beforeEach(() => {
    search.mockReset();
  });

  it('shows a restrained partial-results banner alongside real results, never suppressing them', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({ results: [MOCK_RESULTS[0]!], degraded: ['sparse_timeout'] }),
    });
    await render(<SearchScreen />);
    await runSearch('anticipatory bail under BNSS');

    expect(
      await screen.findByText(
        'Showing partial results — one search method could not complete in time.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(MOCK_RESULTS[0]!.caseTitle)).toBeTruthy();
  });

  it('never renders "No judgments matched" when the ranker timed out with zero rows — that is an unproven zero, not a confirmed one', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({ results: [], degraded: ['sparse_timeout', 'dense_timeout'] }),
    });
    await render(<SearchScreen />);
    await runSearch('anticipatory bail under BNSS');

    expect(await screen.findByText('This search did not finish')).toBeTruthy();
    expect(screen.queryByText('No judgments matched')).toBeNull();
  });
});

describe('SearchScreen — an ambiguous identifier is a disambiguation, not an ordinary ranking', () => {
  beforeEach(() => {
    search.mockReset();
  });

  it('states the true count and that the page cannot show all of them', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({
        results: [MOCK_RESULTS[0]!],
        ambiguous: true,
        total: 15,
        parsed: 'The judgment cited as "2026:PHHC:027747-DB".',
      }),
    });
    await render(<SearchScreen />);
    await runSearch('cite:"2026:PHHC:027747-DB"');

    expect(
      await screen.findByText(
        'This identifier matches 15 judgments — showing 1. Pick the one you meant, or add a court or date to narrow it further.',
      ),
    ).toBeTruthy();
  });

  it.each([
    ['CNR', 'DLHC010123452026'],
    ['case number', 'CRL.A. 221/2018'],
  ])(
    'sends a bare %s unchanged so the server can use its exact identity path',
    async (_kind, identifier) => {
      search.mockResolvedValue({ ok: true, data: response() });
      await render(<SearchScreen />);
      await runSearch(identifier);

      expect(search).toHaveBeenCalledWith(identifier, 'en', expect.anything());
    },
  );
});

describe('SearchScreen — the 500-character query cap is enforced before the request is sent', () => {
  beforeEach(() => {
    search.mockReset();
  });

  it('refuses to call the server over the limit, and says why', async () => {
    await render(<SearchScreen />);
    await runSearch('x'.repeat(501));

    expect(
      await screen.findByText(
        'This search is too long for the current research mode (501 of 500 characters). ' +
          'Shorten it, or search for the key facts rather than pasting the whole passage.',
      ),
    ).toBeTruthy();
    expect(search).not.toHaveBeenCalled();
  });
});

describe('SearchScreen — a reachability failure reads differently from a server answer', () => {
  beforeEach(() => {
    search.mockReset();
  });

  it('tells the advocate they are offline when the request never reached the server', async () => {
    search.mockResolvedValue({
      ok: false,
      error: { code: 'network', message: 'We could not reach Lawmind. You may be offline.' },
    });
    await render(<SearchScreen />);
    await runSearch('anything');

    expect(await screen.findByText('You appear to be offline')).toBeTruthy();
  });

  /**
   * THE MIDDLE CASE, and the one that was missing while the bug shipped.
   *
   * This suite tested `network` and it tested `INVALID_QUERY`, so both ends
   * were pinned and `timeout` — which sat between them and was folded in with
   * `network` — was asserted by nobody.
   *
   * Reproduced on a physical Galaxy S24, 31 Aug 2026: the API answered
   * `POST /search` with `status 200` in 15,334ms against the client's own
   * 15,000ms budget, and the phone — on full WiFi, with `/me` and `/matters`
   * succeeding either side of it — told the advocate they were offline. The
   * request reached the server and the server answered it.
   */
  it('does not claim offline when the deadline was ours rather than the network', async () => {
    search.mockResolvedValue({
      ok: false,
      error: {
        code: 'timeout',
        message: 'The search took longer than we wait for. It may still be running.',
      },
    });
    await render(<SearchScreen />);
    await runSearch('anything');

    expect(await screen.findByText('This search could not complete')).toBeTruthy();
    expect(screen.queryByText('You appear to be offline')).toBeNull();
  });

  it('does not claim offline for a real answer the server gave', async () => {
    search.mockResolvedValue({
      ok: false,
      error: { code: 'INVALID_QUERY', message: 'Unbalanced quote in the query.' },
    });
    await render(<SearchScreen />);
    await runSearch('judge:"unterminated');

    expect(await screen.findByText('This search could not complete')).toBeTruthy();
    expect(screen.queryByText('You appear to be offline')).toBeNull();
  });

  it.each([
    [
      'RATE_LIMITED',
      'Too many searches were started in a short time. Wait a moment and try again.',
    ],
    ['SEARCH_BUSY', 'Search is busy completing other research. Wait a moment and try again.'],
  ])(
    'renders %s as a retryable server state, never as an empty corpus answer',
    async (code, message) => {
      search.mockResolvedValue({ ok: false, error: { code, message } });
      await render(<SearchScreen />);
      await runSearch('anticipatory bail');

      expect(await screen.findByText('This search could not complete')).toBeTruthy();
      const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(screen.getByText(new RegExp(escaped))).toBeTruthy();
      expect(screen.getByText('Try again')).toBeTruthy();
      expect(screen.queryByText(/Nothing matched/)).toBeNull();
    },
  );
});

describe('SearchScreen — pagination: result #6+ is reachable', () => {
  beforeEach(() => {
    search.mockReset();
  });

  it('does not offer "Show more results" when the server says there is no further page', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({
        results: [MOCK_RESULTS[0]!],
        page: { page: 1, pageSize: 5, hasMore: false },
      }),
    });
    await render(<SearchScreen />);
    await runSearch('anticipatory bail');

    await screen.findByText('1 judgment');
    expect(screen.queryByText('Show more results')).toBeNull();
  });

  it('offers "Show more results" when the server says a further page exists, tapping it appends page 2, and it asks for page 2 of the SAME query', async () => {
    search.mockResolvedValueOnce({
      ok: true,
      data: response({
        results: MOCK_RESULTS.slice(0, 5),
        page: { page: 1, pageSize: 5, hasMore: true },
      }),
    });
    search.mockResolvedValueOnce({
      ok: true,
      data: response({
        results: MOCK_RESULTS.slice(5, 8),
        page: { page: 2, pageSize: 5, hasMore: false },
      }),
    });
    await render(<SearchScreen />);
    await runSearch('anticipatory bail');

    const button = await screen.findByText('Show more results');
    expect(await screen.findByText('Mock Petitioner v. Mock State')).toBeTruthy();
    expect(screen.queryByText('Mock Interim v. Mock Registrar')).toBeNull();

    await fireEvent.press(button);

    // The 6th–8th results now appear alongside the original 5, not replacing them.
    expect(await screen.findByText('Mock Interim v. Mock Registrar')).toBeTruthy();
    expect(screen.getByText('Mock Petitioner v. Mock State')).toBeTruthy();
    // The button itself follows the server's page-2 hasMore, so it disappears
    // once the last page has been fetched — never left dangling.
    expect(screen.queryByText('Show more results')).toBeNull();

    expect(search).toHaveBeenNthCalledWith(2, 'anticipatory bail', 'en', expect.anything(), 2);
  });

  it('a fresh search resets pagination — the load-more button from a previous query does not carry over', async () => {
    search.mockResolvedValueOnce({
      ok: true,
      data: response({
        results: [MOCK_RESULTS[0]!],
        page: { page: 1, pageSize: 5, hasMore: true },
      }),
    });
    await render(<SearchScreen />);
    await runSearch('first query');
    await screen.findByText('Show more results');

    search.mockResolvedValueOnce({
      ok: true,
      data: response({
        results: [MOCK_RESULTS[1]!],
        page: { page: 1, pageSize: 5, hasMore: false },
      }),
    });
    await runSearch('second query');

    await screen.findByText('Mock Applicant v. Mock Respondent');
    expect(screen.queryByText('Show more results')).toBeNull();
  });

  it('keeps page 1 visible and offers an explicit retry when page 2 fails offline', async () => {
    search.mockResolvedValueOnce({
      ok: true,
      data: response({
        results: MOCK_RESULTS.slice(0, 5),
        page: { page: 1, pageSize: 5, hasMore: true },
      }),
    });
    search.mockResolvedValueOnce({
      ok: false,
      error: { code: 'network', message: 'We could not reach Lawmind. You may be offline.' },
    });
    search.mockResolvedValueOnce({
      ok: true,
      data: response({
        results: MOCK_RESULTS.slice(5, 8),
        page: { page: 2, pageSize: 5, hasMore: false },
      }),
    });

    await render(<SearchScreen />);
    await runSearch('anticipatory bail');
    await fireEvent.press(await screen.findByText('Show more results'));

    expect(await screen.findByText(/The results already shown are still available/)).toBeTruthy();
    expect(screen.getByText('Mock Petitioner v. Mock State')).toBeTruthy();

    await fireEvent.press(screen.getByText('Try loading more again'));
    expect(await screen.findByText('Mock Interim v. Mock Registrar')).toBeTruthy();
    expect(search).toHaveBeenNthCalledWith(3, 'anticipatory bail', 'en', expect.anything(), 2);
  });

  it('renders distinct judgments with duplicate titles and never deduplicates by title', async () => {
    const duplicateTitle = 'Mock Same Name v. Mock State';
    search.mockResolvedValue({
      ok: true,
      data: response({
        results: [
          { ...MOCK_RESULTS[0]!, judgmentId: 'jdg_same_1', caseTitle: duplicateTitle },
          { ...MOCK_RESULTS[1]!, judgmentId: 'jdg_same_2', caseTitle: duplicateTitle },
        ],
      }),
    });

    await render(<SearchScreen />);
    await runSearch(duplicateTitle);

    expect(await screen.findAllByText(duplicateTitle)).toHaveLength(2);
  });

  it('keeps appended results mounted after opening a judgment, so stack back returns to the same list', async () => {
    const onOpenJudgment = jest.fn();
    search.mockResolvedValueOnce({
      ok: true,
      data: response({
        results: MOCK_RESULTS.slice(0, 5),
        page: { page: 1, pageSize: 5, hasMore: true },
      }),
    });
    search.mockResolvedValueOnce({
      ok: true,
      data: response({
        results: MOCK_RESULTS.slice(5, 8),
        page: { page: 2, pageSize: 5, hasMore: false },
      }),
    });

    await render(<SearchScreen onOpenJudgment={onOpenJudgment} />);
    await runSearch('anticipatory bail');
    await fireEvent.press(await screen.findByText('Show more results'));
    await fireEvent.press(await screen.findByText('Mock Interim v. Mock Registrar'));

    expect(onOpenJudgment).toHaveBeenCalled();
    expect(screen.getByText('Mock Petitioner v. Mock State')).toBeTruthy();
    expect(screen.getByText('Mock Interim v. Mock Registrar')).toBeTruthy();
  });
});
