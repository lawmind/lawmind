import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SearchScreen } from './SearchScreen';
import { api } from '../../api/client';
import type { SearchResponse } from '../../api/contract';

/**
 * THE RULE UNDER TEST — R14 A4.9: A SWITCHED-OFF ARM IS NOT A SLOW ONE.
 *
 * `search.party_name` is a dedicated row in the served capability registry, so
 * the iOS party-search kill switch is a server-side config change rather than an
 * App Store release. When it is flipped, `/search` keeps answering 200 and says
 * what it did NOT do: `degraded: ['party_name_disabled']`.
 *
 * WHY THIS FILE EXISTS AT ALL. Before it, the client typed four degraded arms
 * and treated any fifth as one of them: an unknown arm fell through to the
 * timeout branch, so a capability the operator had deliberately switched off
 * rendered as "one search method could not complete in time" over a `Try again`
 * button that could never change the answer. Nothing timed out. Nothing failed.
 * The screen would have stated a cause that was not the cause, on a switch that
 * can now be flipped without shipping a build — which is precisely why the
 * client's own protection had to stop depending on nobody flipping it.
 *
 * The four sentences this state may never say are each true somewhere else on
 * this screen, which is what makes the mistake easy and the test necessary:
 * "could not finish in time" (a timeout), "could not complete" (a failure),
 * "No judgments matched" (an honest empty), and `Try again` (a retryable cost).
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

jest.mock('../../state/practice', () => {
  // A live, empty caseload: the picker (RCC R29) reads freshness, not just length.
  const state = { matters: [], freshness: { kind: 'live' }, loading: false, refreshError: null };
  return {
    usePractice: Object.assign((selector: (s: unknown) => unknown) => selector(state), {
      getState: () => state,
    }),
  };
});

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

/** Every sentence this state is forbidden from saying, asserted as one block. */
function expectsNoFalseCause() {
  expect(screen.queryByText(/could not finish in time/i)).toBeNull();
  expect(screen.queryByText(/could not complete in time/i)).toBeNull();
  expect(screen.queryByText(/This search did not finish/i)).toBeNull();
  expect(screen.queryByText(/This search could not complete/i)).toBeNull();
  expect(screen.queryByText(/timed out/i)).toBeNull();
  expect(screen.queryByText('No judgments matched')).toBeNull();
  expect(screen.queryByText('Try again')).toBeNull();
}

describe('SearchScreen — party-name search disabled by platform capability', () => {
  beforeEach(() => {
    search.mockReset();
    mockPush.mockReset();
  });

  /**
   * THE FAILURE-FIRST FIXTURE. Zero results and the disabled arm, which is the
   * exact shape the server sends when an advocate on the narrowed platform types
   * a bare party name.
   */
  it('explains the platform restriction, and never a timeout, failure, empty or retry', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({ degraded: ['party_name_disabled'] }),
    });
    await render(<SearchScreen />);
    await runSearch('SATENDER KUMAR ANTIL');

    await waitFor(() => {
      expect(screen.getByText('Party-name search is unavailable here')).toBeTruthy();
    });
    expectsNoFalseCause();
  });

  /**
   * THE DEGRADE HAS TO POINT SOMEWHERE THAT WORKS. Exact identity is a separate
   * capability the switch does not touch — asserted server-side — so these are
   * real paths and not consolation.
   */
  it('names the exact-identity alternatives that still work', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({ degraded: ['party_name_disabled'] }),
    });
    await render(<SearchScreen />);
    await runSearch('SATENDER KUMAR ANTIL');

    // The BODY, not the banner — both now say the restriction, and only the
    // body carries the alternatives.
    const body = await screen.findByText(/Searching by a party.s name alone/);
    const text = String((body as unknown as { props: { children: unknown } }).props.children);
    for (const path of ['case number', 'CNR', 'citation', 'cause title']) {
      expect(text).toContain(path);
    }
  });

  /**
   * CASE-FIRST, AND THERE IS NOTHING ELSE ON THE OTHER SIDE OF IT. A name is how
   * an advocate names a CASE. This product has no person profile, no history and
   * no dossier, and a screen about party names is the one place that could drift.
   */
  it('offers no person profile, history or dossier', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({ degraded: ['party_name_disabled'] }),
    });
    await render(<SearchScreen />);
    await runSearch('SATENDER KUMAR ANTIL');

    await screen.findByText('Party-name search is unavailable here');
    expect(screen.queryByText(/profile/i)).toBeNull();
    expect(screen.queryByText(/dossier/i)).toBeNull();
    expect(screen.queryByText(/history of this person/i)).toBeNull();
    expect(screen.queryByText(/background/i)).toBeNull();
  });

  /**
   * THE COMBINATION THE SERVER CAN ACTUALLY SEND. A bare party name whose own
   * arm is off falls through to the generic lexical path, which then refuses it
   * as too broad — so both arms arrive together. Reading the refusal first would
   * tell an advocate who typed a person's full name to add more words to it.
   */
  it('the disabled arm outranks a refusal that arrived with it', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({
        degraded: ['party_name_disabled', 'sparse_unbounded'],
        emptyBecause: { reason: 'query_too_broad_to_rank', remedy: 'add_more_terms' },
      }),
    });
    await render(<SearchScreen />);
    await runSearch('SANJAY KUMAR MISHRA');

    await waitFor(() => {
      expect(screen.getByText('Party-name search is unavailable here')).toBeTruthy();
    });
    expect(screen.queryByText('This search was too broad to run')).toBeNull();
    expectsNoFalseCause();
  });

  /**
   * THE BANNER IS PART OF THE DEGRADE, NOT A SUBSTITUTE FOR IT. When other arms
   * did return rows, the list still renders — and the banner still has to say
   * WHY the set is short, without claiming a timeout.
   */
  it('shows the results it has, with a truthful banner rather than a timeout one', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({
        results: [
          {
            judgmentId: 'j1',
            citationId: null,
            caseTitle: 'Mock Appellant v. State',
            court: 'Supreme Court of India',
            judgmentDate: '2022-07-11',
            neutralCitation: '2022 INSC 690',
            reporterCitations: [],
            holding: '',
            verificationState: 'verified',
            verifiedBySource: 'corpus',
            overruledStatus: 'none',
          },
        ] as unknown as SearchResponse['results'],
        degraded: ['party_name_disabled'],
      }),
    });
    await render(<SearchScreen />);
    await runSearch('SATENDER KUMAR ANTIL');

    await waitFor(() => {
      expect(screen.getByText(/Searching by party name alone is turned off/)).toBeTruthy();
    });
    expect(screen.getByText('Mock Appellant v. State')).toBeTruthy();
    expect(screen.queryByText(/could not complete in time/i)).toBeNull();
  });

  /**
   * THE REGRESSION GUARD IN THE OTHER DIRECTION. A real timeout must still say
   * so — this change may not turn every degraded response into the party state.
   */
  it('a genuine timeout still reads as a timeout', async () => {
    search.mockResolvedValue({
      ok: true,
      data: response({ degraded: ['sparse_timeout'] }),
    });
    await render(<SearchScreen />);
    await runSearch('anticipatory bail cheque dishonour');

    await waitFor(() => {
      expect(screen.getByText('This search did not finish')).toBeTruthy();
    });
    expect(screen.queryByText('Party-name search is unavailable here')).toBeNull();
  });
});
