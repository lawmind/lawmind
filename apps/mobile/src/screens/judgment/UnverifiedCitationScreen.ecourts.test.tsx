import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { UnverifiedCitationScreen } from './UnverifiedCitationScreen';
import type { CitationCheck, JudgmentDetail } from '../../api/contract';
import { api } from '../../api/client';

/**
 * THE TIER 3 PATH — the only way out of an unverified citation, and until
 * 11 Aug 2026 it handed the advocate half of what the server sent.
 *
 * `POST /verify/ecourts` returns four fields. The client declared two, used
 * ONE, and dropped `prefilledQuery` — the paste-ready search string the server
 * builds with care, stripping reporter punctuation that eCourts matches poorly
 * while never touching digits or their order, because `(2019) 4 SCC 221` and
 * `(2019) 4 SCC 212` are different cases.
 *
 * What that cost: the advocate tapped through to eCourts and arrived at an
 * EMPTY search box, outside our app, in a court building, holding a citation
 * they now had to retype. The string to type was already in the response.
 */

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

jest.mock('../../api/client', () => ({
  api: {
    citationCheck: jest.fn(),
    verifyEcourts: jest.fn(),
    verifyConfirm: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
  },
}));

const setString = Clipboard.setStringAsync as jest.MockedFunction<typeof Clipboard.setStringAsync>;
const citationCheck = api.citationCheck as jest.MockedFunction<typeof api.citationCheck>;
const verifyEcourts = api.verifyEcourts as jest.MockedFunction<typeof api.verifyEcourts>;

const judgment: JudgmentDetail = {
  judgmentId: 'jdg_1',
  caseTitle: 'Mock Appellant v. Union of India',
  neutralCitation: '(2019) 4 SCC 221',
  reporterCitations: [],
  court: 'Mock Supreme Court',
  judgmentDate: '2019-04-02',
  bench: 'Mock J.',
  sourceUrl: 'https://example.invalid/j/1',
  paragraphs: [],
  numberedShare: 1,
  verificationState: 'unverified',
  verifiedBySource: 'none',
  overruledStatus: 'none',
  asOf: '2026-08-11T00:00:00.000Z',
};

const check: CitationCheck = {
  citationCheckId: 'chk_1',
  citationClaimed: '(2019) 4 SCC 221',
  checkedAt: '2026-08-11T00:00:00.000Z',
  surface: 'search',
  shownToUser: true,
  verificationState: 'unverified',
  verifiedBySource: 'none',
  overruledStatus: 'none',
  overruledStatusShown: false,
  matchConfidence: null,
  judgment: null,
  tiers: [
    { tier: 1, source: 'corpus', status: 'miss', detail: 'Not in the corpus.', at: null },
  ],
  coverage: { tiersImplemented: 1, tiersDefined: 3, note: 'One of three tiers has shipped.' },
  asOf: '2026-08-11T00:00:00.000Z',
};

const ecourtsResponse = {
  ok: true as const,
  data: {
    ecourtsUrl: 'https://judgments.ecourts.gov.in/pdfsearch/index.php',
    prefilledQuery: '2019 4 SCC 221',
    captchaRequired: true,
    instructions:
      'Open eCourts, paste the citation into the search box and solve the CAPTCHA. ' +
      'We never solve it for you. Confirm the match here and we will remember it.',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  citationCheck.mockResolvedValue({ ok: true, data: check });
  verifyEcourts.mockResolvedValue(ecourtsResponse);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

/** `render` and `fireEvent` are awaited here — this RNTL returns promises. */
async function openEcourts() {
  await render(
    <UnverifiedCitationScreen citationCheckId="chk_1" judgment={judgment} onBack={() => {}} />,
  );
  await screen.findByText('Where we looked');
  await fireEvent.press(screen.getByText('Open eCourts — about a minute'));
}

describe('the eCourts route', () => {
  it('puts the search string on the clipboard, not just the URL in a browser', async () => {
    await openEcourts();

    // The assertion that fails against the old code: it opened the URL and
    // never touched the clipboard, so this call count was 0.
    await waitFor(() => expect(setString).toHaveBeenCalledWith('2019 4 SCC 221'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://judgments.ecourts.gov.in/pdfsearch/index.php',
    );
  });

  it('shows the string to paste, so it survives leaving the app', async () => {
    await openEcourts();

    // Not the raw citation — the SERVER'S query, punctuation stripped. If this
    // ever renders `(2019) 4 SCC 221` the client has started building the
    // search itself, which is the thing `verify.ts` exists to prevent.
    expect(await screen.findByText('2019 4 SCC 221')).toBeTruthy();
    expect(screen.getByText(/Paste it into the eCourts search box/)).toBeTruthy();
  });

  it("renders the server's instructions verbatim, including that we never solve the CAPTCHA", async () => {
    await openEcourts();

    /*
      THE SENTENCE IS THE SERVER'S AND IT CARRIES THE RULE. `CLAUDE.md` §6
      permits a CAPTCHA bypass ONLY for bulk cause-list harvesting under the
      registrar's grant, and expressly not for per-citation confirmation —
      Tier 3 is a human solving it and vouching. Re-typing this copy on the
      client is how the two drift apart, so the test pins that it came from
      the response.
    */
    expect(await screen.findByText(ecourtsResponse.data.instructions)).toBeTruthy();
  });

  it('nothing is shown before the advocate asks for it', async () => {
    await render(
      <UnverifiedCitationScreen citationCheckId="chk_1" judgment={judgment} onBack={() => {}} />,
    );
    await screen.findByText('Where we looked');

    expect(screen.queryByText('2019 4 SCC 221')).toBeNull();
    expect(verifyEcourts).not.toHaveBeenCalled();
  });

  it('a failed lookup says so, instead of a button that does nothing', async () => {
    verifyEcourts.mockResolvedValue({
      ok: false,
      error: { code: 'UPSTREAM', message: 'nope' },
    } as Awaited<ReturnType<typeof api.verifyEcourts>>);

    await openEcourts();

    /*
      The old code set `unavailable`, which is only read when the citation-check
      panel is ABSENT — and here it is present. So the advocate tapped and
      watched the screen do nothing at all.
    */
    expect(
      await screen.findByText(/could not build the eCourts link/),
    ).toBeTruthy();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
