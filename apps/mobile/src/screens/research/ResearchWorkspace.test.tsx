import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform, useWindowDimensions } from 'react-native';

import { ResearchWorkspace } from './ResearchWorkspace';
import { api } from '../../api/client';
import { MOCK_JUDGMENTS, MOCK_RESULTS } from '../../api/fixtures';
import { size } from '../../theme/tokens';
import type { SearchResponse } from '../../api/contract';

/**
 * THE LOCAL DESKTOP RESEARCH WORKSPACE — Master Roadmap v7.1.
 *
 * Two guarantees are under test and the FIRST ONE MATTERS MOST:
 *
 *   1. BELOW THE BREAKPOINT NOTHING CHANGED. PD-15 says mobile is not
 *      redesigned around desktop, and the only way that survives a year of
 *      edits is a test that fails the moment the phone starts rendering a pane.
 *   2. Above it, the results survive opening a judgment — which is the single
 *      thing a phone cannot do and the whole reason the layout exists.
 */

const mockPush = jest.fn();
const mockSetParams = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    replace: jest.fn(),
    setParams: (...args: unknown[]) => mockSetParams(...args),
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('../../api/client', () => ({
  api: {
    search: jest.fn(),
    addAuthorityToMatter: jest.fn(),
    judgment: jest.fn(() => new Promise(() => {})),
    authorities: jest.fn(() => new Promise(() => {})),
    treatment: jest.fn(() => new Promise(() => {})),
    annotations: jest.fn(() => new Promise(() => {})),
  },
}));

jest.mock('../../state/practice', () => {
  // A live, empty caseload: the picker (RCC R29) reads freshness, not just length.
  const state = { matters: [], freshness: { kind: 'live' }, loading: false, refreshError: null };
  return {
    ...jest.requireActual('../../state/practice'),
    // The snapshot below is already live, so there is nothing to load.
    ensureLive: () => {},
    usePractice: Object.assign((selector: (s: unknown) => unknown) => selector(state), {
      getState: () => state,
    }),
  };
});

/**
 * The width is the only switch between the two layouts, so it is the only thing
 * mocked. Everything else is the real component tree.
 */
jest.mock('react-native/Libraries/Utilities/useWindowDimensions');
const dimensions = useWindowDimensions as unknown as jest.Mock;
const atWidth = (width: number) =>
  dimensions.mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 });

const search = api.search as jest.MockedFunction<typeof api.search>;
const PLACEHOLDER = 'Ask, or enter a CNR, case number, or citation';
const PHONE = 390;
const DESKTOP = 1400;

function response(over: Partial<SearchResponse> = {}): SearchResponse {
  return { results: [], unverifiedReferences: [], searchId: null, ...over };
}

async function runSearch(query = 'bail') {
  const input = screen.getByPlaceholderText(PLACEHOLDER);
  await fireEvent.changeText(input, query);
  await fireEvent(input, 'submitEditing');
}

const judgment = api.judgment as jest.MockedFunction<typeof api.judgment>;

beforeEach(() => {
  jest.clearAllMocks();
  search.mockResolvedValue({ ok: true, data: response({ results: MOCK_RESULTS.slice(0, 2) }) });
  judgment.mockImplementation((id: string) => {
    const detail = MOCK_JUDGMENTS[id];
    return Promise.resolve(
      detail
        ? ({ ok: true, data: detail } as Awaited<ReturnType<typeof api.judgment>>)
        : ({
            ok: false,
            error: { code: 'NOT_FOUND', message: 'no judgment with that id' },
          } as Awaited<ReturnType<typeof api.judgment>>),
    );
  });
});

describe('below the breakpoint — the phone must be untouched', () => {
  beforeEach(() => atWidth(PHONE));

  it('renders the search screen and no pane', async () => {
    await render(<ResearchWorkspace />);

    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeTruthy();
    expect(screen.queryByText(/Open a judgment to read it here/)).toBeNull();
  });

  it('opens a result by PUSHING a route, exactly as it always has', async () => {
    await render(<ResearchWorkspace />);
    await runSearch();

    const first = MOCK_RESULTS[0]!;
    await fireEvent.press(await screen.findByText(first.caseTitle));

    /*
      The phone path does not know the workspace exists. If this ever asserts a
      pane instead, PD-15's "mobile is not redesigned around desktop" has been
      broken.
    */
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/judgment/[id]' }));
    expect(screen.getByText(first.caseTitle)).toBeTruthy();
  });

  it('is single-pane on an iPad in portrait, which is deliberate', async () => {
    atWidth(834);
    await render(<ResearchWorkspace />);

    expect(screen.queryByText(/Open a judgment to read it here/)).toBeNull();
  });
});

describe('at desktop width', () => {
  beforeEach(() => atWidth(DESKTOP));

  it('says why the right half is empty, without selling the feature', async () => {
    await render(<ResearchWorkspace />);

    expect(screen.getByText(/Open a judgment to read it here/)).toBeTruthy();
  });

  it('opens a result IN THE PANE and the results survive it', async () => {
    await render(<ResearchWorkspace />);
    await runSearch();

    const first = MOCK_RESULTS[0]!;
    const second = MOCK_RESULTS[1]!;
    await fireEvent.press(await screen.findByText(first.caseTitle));

    /*
      THE ONE ASSERTION THE WHOLE LAYOUT EXISTS FOR. A phone covers the list;
      here the second result is still on screen after the first was opened, so
      the advocate has not lost their place.
    */
    await waitFor(() => expect(screen.queryByText(/Open a judgment to read it here/)).toBeNull());
    expect(screen.getByText(second.caseTitle)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();

    /*
      And the pane really loaded the judgment rather than merely clearing the
      empty state — the bench comes from `GET /judgments/:id`, not from the
      result row, so it can only be on screen if the reader mounted and fetched.
    */
    expect(await screen.findByText(MOCK_JUDGMENTS[first.judgmentId]!.bench!)).toBeTruthy();
    expect(screen.getAllByText(first.caseTitle).length).toBeGreaterThan(1);
  });

  it('never leaves the workspace to open a judgment', async () => {
    await render(<ResearchWorkspace />);
    await runSearch();

    await fireEvent.press(await screen.findByText(MOCK_RESULTS[0]!.caseTitle));

    // Routing away would take the search results with it — the failure this
    // layout exists to prevent.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('the breakpoint is the only switch, and it is the token', async () => {
    /*
      Pinned so the two layouts cannot drift apart by someone hard-coding a
      second width somewhere. One comparison, one token, one branch to remove.
    */
    atWidth(size.researchTwoPane);
    await render(<ResearchWorkspace />);
    expect(screen.getByText(/Open a judgment to read it here/)).toBeTruthy();
  });

  it('one pixel below it, the phone layout', async () => {
    atWidth(size.researchTwoPane - 1);
    await render(<ResearchWorkspace />);
    expect(screen.queryByText(/Open a judgment to read it here/)).toBeNull();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * KEYBOARD — NEW3 R16 `R16-RCC-06`.
 *
 * Escape backs out of ONE authority. The layout exists so the results survive
 * the read, and the commonest desktop reflex for "close what I just opened" is
 * Escape; without it the only way out of a pane is a mouse trip to a back link,
 * which is the hand movement the two-pane layout was built to remove.
 *
 * ── WHY THE LISTENER IS CAPTURED RATHER THAN THE EVENT DISPATCHED ───────────
 *
 * The React Native jest environment has a `window` object but no
 * `KeyboardEvent` and no `dispatchEvent` — it is not jsdom. So the test spies
 * on the registration, takes the handler the component installed, and calls it.
 * That is a weaker instrument than a real event and it is worth saying so: it
 * proves the handler is registered, keyed on Escape, and pops one level. It
 * cannot prove the browser delivers the event, and only a physical desktop pass
 * can.
 *
 * ── AND WHY `Platform.OS` IS FORCED ─────────────────────────────────────────
 *
 * The gate in the component is `Platform.OS === 'web'`, which is the correct
 * gate — there is no `window` to listen on elsewhere, and a wide tablet has no
 * Escape key. Under jest-expo `Platform.OS` is `'ios'`, so without this the
 * listener is never installed and a test asserting its absence would pass for
 * the wrong reason.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('the keyboard, at desktop width', () => {
  const originalOS = Platform.OS;
  let handlers: ((e: { key: string }) => void)[] = [];

  /*
    `window` EXISTS IN THIS ENVIRONMENT BUT CARRIES NO EVENT API — it is the
    React Native environment, not jsdom, so there is nothing to spy ON and the
    two methods are installed rather than mocked. Removed again afterwards so a
    later file cannot accidentally depend on them being here.
  */
  const target = window as unknown as Record<string, unknown>;

  beforeEach(() => {
    atWidth(DESKTOP);
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    handlers = [];
    target.addEventListener = (type: string, handler: unknown) => {
      if (type === 'keydown') handlers.push(handler as (e: { key: string }) => void);
    };
    target.removeEventListener = (type: string, handler: unknown) => {
      if (type === 'keydown') handlers = handlers.filter((h) => h !== handler);
    };
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    /*
      LEFT AS NO-OPS, NOT DELETED. React Native Testing Library's automatic
      cleanup is registered at the top level, so it unmounts AFTER this hook —
      and the effect's teardown calls `removeEventListener` on the way out.
      Deleting it here made the unmount throw, which failed the test that had
      already passed its assertions.
    */
    target.addEventListener = () => {};
    target.removeEventListener = () => {};
  });

  afterAll(() => {
    delete target.addEventListener;
    delete target.removeEventListener;
  });

  const pressEscape = () => {
    for (const h of handlers) h({ key: 'Escape' });
  };

  it('closes the open authority and leaves the results untouched', async () => {
    await render(<ResearchWorkspace />);
    await runSearch();

    const first = MOCK_RESULTS[0]!;
    await fireEvent.press(await screen.findByText(first.caseTitle));
    await waitFor(() => expect(screen.queryByText(/Open a judgment to read it here/)).toBeNull());
    expect(handlers.length).toBeGreaterThan(0);

    await waitFor(() => {
      pressEscape();
    });

    // The pane is empty again…
    expect(await screen.findByText(/Open a judgment to read it here/)).toBeTruthy();
    // …and the results never moved, which is the property the whole layout is for.
    expect(screen.getByText(first.caseTitle)).toBeTruthy();
    // Never out of the workspace — that is what a back BUTTON would have to avoid too.
    expect(mockPush).not.toHaveBeenCalled();
  });

  /**
   * NOTHING OPEN, NOTHING BOUND. A listener that swallowed Escape with nothing
   * to close would be a keyboard dead end for whatever sits above this surface
   * — the command palette binds its own Escape, and a sheet binds its own.
   */
  it('binds no key handler while the pane is empty', async () => {
    await render(<ResearchWorkspace />);
    await runSearch();

    expect(screen.getByText(/Open a judgment to read it here/)).toBeTruthy();
    expect(handlers).toHaveLength(0);
  });

  /** A key that is not Escape is ignored rather than treated as a back. */
  it('ignores every other key', async () => {
    await render(<ResearchWorkspace />);
    await runSearch();

    const first = MOCK_RESULTS[0]!;
    await fireEvent.press(await screen.findByText(first.caseTitle));
    await waitFor(() => expect(screen.queryByText(/Open a judgment to read it here/)).toBeNull());

    for (const h of handlers) h({ key: 'k' });

    expect(screen.queryByText(/Open a judgment to read it here/)).toBeNull();
  });
});
