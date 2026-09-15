import { render, screen } from '@testing-library/react-native';

import { JudgmentScreen } from './JudgmentScreen';
import { api } from '../../api/client';
import { CORPUS_ABSENT_COPY } from '../../api/corpusAbsence';

/**
 * THE READER'S FAILURE STATE USED TO ASSERT TWO THINGS IT COULD NOT KNOW.
 *
 * Until this round the one failure screen said: *"It is in the corpus — search
 * found it. Something went wrong on our side fetching the full text. The search
 * result is still accurate."*
 *
 * Both claims are unsupportable. The reader is reached from a deep link, a saved
 * authority, the authorities panel, a briefing and a matter, so there may have
 * been no search at all and no result to be accurate; and after LCC R28
 * `GET /judgments/:id` reads the CORPUS role (bus 1758), so a `NOT_FOUND` can
 * mean the release does not carry it — which makes "it is in the corpus" false
 * exactly when an advocate most needs it to be true.
 *
 * These tests pin the two states apart and pin what neither may say.
 */

jest.mock('../../api/client', () => ({
  api: {
    judgment: jest.fn(),
    // `useAuthorities` mounts alongside the reader and is not what is under
    // test; it answers with an empty panel so the failure branch is the only
    // thing on screen.
    authorities: jest.fn(async () => ({ ok: false, error: { code: 'network', message: 'offline' } })),
  },
}));

jest.mock('../../state/offlineCache', () => ({
  judgmentCacheKey: (id: string) => `judgment:${id}`,
  readCache: jest.fn(async () => null),
  writeCache: jest.fn(async () => {}),
}));

jest.mock('../../state/recentItems', () => ({
  useRecentItems: (selector: (s: { record: () => void }) => unknown) =>
    selector({ record: () => {} }),
}));

const judgment = api.judgment as jest.MockedFunction<typeof api.judgment>;

const reader = () => (
  <JudgmentScreen
    judgmentId="j1"
    onBack={() => {}}
    onOpenJudgment={() => {}}
    onOpenTreatment={() => {}}
    onSetReading={() => {}}
    reading={false}
  />
);

beforeEach(() => {
  judgment.mockReset();
});

it('a corpus-absent read names the release, never the judgment', async () => {
  // The R29 wire, as `api/corpusAbsence.ts` has already folded it by the time a
  // screen sees it: LCC's code, this client's sentence.
  judgment.mockResolvedValue({
    ok: false,
    error: { code: 'CORPUS_TARGET_UNAVAILABLE', message: CORPUS_ABSENT_COPY },
  });

  await render(reader());

  expect(await screen.findByText(CORPUS_ABSENT_COPY)).toBeTruthy();
  expect(screen.queryByText(/It is in the corpus/i)).toBeNull();
  expect(screen.queryByText(/search found it/i)).toBeNull();
  expect(screen.queryByText(/does not exist/i)).toBeNull();
});

it('a transport failure states our limitation and claims nothing about the corpus', async () => {
  judgment.mockResolvedValue({
    ok: false,
    error: { code: 'network', message: 'We could not reach Lawmind. You may be offline.' },
  });

  await render(reader());

  expect(await screen.findByText('We could not open this judgment')).toBeTruthy();
  expect(screen.queryByText(/It is in the corpus/i)).toBeNull();
  expect(screen.queryByText(/The search result is still accurate/i)).toBeNull();
  // And it must not borrow the corpus sentence either — nothing here says the
  // release does not carry it, because nothing observed said so.
  expect(screen.queryByText(CORPUS_ABSENT_COPY)).toBeNull();
});

it('offers a back control that does not claim the advocate arrived from a search', async () => {
  judgment.mockResolvedValue({
    ok: false,
    error: { code: 'network', message: 'offline' },
  });

  await render(reader());

  expect(await screen.findByText('Back')).toBeTruthy();
  expect(screen.queryByText('Back to results')).toBeNull();
});
