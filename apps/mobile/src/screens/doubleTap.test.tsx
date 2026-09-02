import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { ATTEMPT_KEY_PATTERN } from '../api/attempt';
import { api } from '../api/client';
import { AddEventSheet } from './matter/AddEventSheet';
import { DeleteAccountScreen } from './settings/DeleteAccountScreen';
import { NewMatterScreen } from './matter/NewMatterScreen';
import { TrainingConsentScreen } from './settings/TrainingConsentScreen';
import { UnverifiedCitationScreen } from './judgment/UnverifiedCitationScreen';
import type { CitationCheck, JudgmentDetail } from '../api/contract';
import { useSession } from '../state/session';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO SYNCHRONOUS TAPS ARE ONE LOGICAL MUTATION. ON EVERY CREATE SURFACE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHY `setSaving(true)` WAS NEVER A GUARD. A React state commit is asynchronous:
 * the flag is scheduled, committed on a later tick, and the button re-renders
 * after that. Two presses landing before the commit both read the OLD value,
 * both pass the check, and both fire the request. `disabled` is downstream of
 * the same commit and is equally late.
 *
 * That is what these tests reproduce. `fireEvent.press` twice inside ONE `act`
 * scope is exactly the shape of the defect — no `await` between them, so React
 * has had no opportunity to commit anything, which is a court corridor on a
 * mid-range Android rather than a contrived case.
 *
 * `AddEventSheet` is the worst of them and had NO protection at all: not a ref,
 * not state, not even a `disabled` prop. Two taps appended two events to the
 * matter timeline, and the timeline is the one authoritative record of what the
 * court did.
 *
 * WHAT IS ASSERTED IS THE REQUEST COUNT, never the button's appearance. A
 * screen that greys out its button and still sends two requests has failed at
 * the only thing that matters.
 */

jest.mock('../api/client', () => ({
  /*
    `state/session.ts` calls `registerAuthBridge` at module scope, and
    `DeleteAccountScreen` imports it. A mock factory that omits the export makes
    the whole file fail to load with a message about a function that has nothing
    to do with what is being tested.
  */
  registerAuthBridge: jest.fn(),
  api: {
    createMatter: jest.fn(),
    addMatterEvent: jest.fn(),
    createDataRequest: jest.fn(),
    listDataRequests: jest.fn(),
    grantTrainingConsent: jest.fn(),
    trainingConsent: jest.fn(),
    withdrawTrainingConsent: jest.fn(),
    verifyConfirm: jest.fn(),
    citationCheck: jest.fn(),
    verifyEcourts: jest.fn(),
    addAuthorityToMatter: jest.fn(),
    createAnnotation: jest.fn(),
    matters: jest.fn(async () => ({ ok: true as const, data: { matters: [], asOf: '' } })),
  },
}));

const mocked = <T extends keyof typeof api>(name: T) =>
  api[name] as jest.MockedFunction<(typeof api)[T]>;

/** A promise that never settles: the request is in flight for the whole test. */
const neverSettles = () => new Promise<never>(() => {});

/*
  TYPED FROM THE COMPONENT'S OWN PROP, not from the implementation. A bare
  `jest.fn(async () => true)` infers a zero-argument signature, so `mock.calls[0][1]`
  is a type error and — worse — an assertion about the attempt key would be
  unwriteable. `tsc` is the real gate here; Jest would have run this either way.
*/
type Submit = ComponentProps<typeof AddEventSheet>['onSubmit'];
const submitMock = (impl: Submit) => jest.fn<Promise<boolean>, Parameters<Submit>>(impl);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AddEventSheet — the one with no in-flight protection at all', () => {
  const draft = async (visible = true, onSubmit = submitMock(async () => true)) => {
    await render(<AddEventSheet onDismiss={() => {}} onSubmit={onSubmit} visible={visible} />);
    return onSubmit;
  };

  async function fillAndDoubleTap(onSubmit: ReturnType<typeof submitMock>) {
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText("The court's own words"), 'Adjourned.');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
      fireEvent.press(screen.getByText('Save'));
    });
    return onSubmit;
  }

  it('two synchronous taps produce exactly ONE event', async () => {
    const onSubmit = await draft(true, submitMock(async () => neverSettles()));
    await fillAndDoubleTap(onSubmit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('the one request carries an attempt key inside the grammar', async () => {
    const onSubmit = await draft();
    await fillAndDoubleTap(onSubmit);
    expect(ATTEMPT_KEY_PATTERN.test(onSubmit.mock.calls[0]![1] as string)).toBe(true);
  });

  /**
   * A FAILED SAVE KEEPS THE KEY AND KEEPS THE TEXT. Pressing Save again is the
   * SAME intentional event — the court said one thing once — so the retry must
   * present the same key or a lost response becomes two timeline entries.
   */
  it('a retry after failure reuses the same key', async () => {
    const onSubmit = submitMock(async () => false);
    await render(<AddEventSheet onDismiss={() => {}} onSubmit={onSubmit} visible />);

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText("The court's own words"), 'Adjourned.');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[0]![1]).toBe(onSubmit.mock.calls[1]![1]);
    // and the court's own words were not thrown away with the failure
    expect(screen.getByPlaceholderText("The court's own words").props.value).toBe('Adjourned.');
  });

  /**
   * A NEW INTENTIONAL EVENT GETS A NEW KEY, even when every field is identical.
   * The server does not deduplicate by content and never will: two deliberate
   * entries are two rows, by design.
   */
  it('a second deliberate save after a success gets a NEW key', async () => {
    const onSubmit = submitMock(async () => true);
    await render(<AddEventSheet onDismiss={() => {}} onSubmit={onSubmit} visible />);

    for (const text of ['Adjourned.', 'Adjourned.']) {
      await act(async () => {
        fireEvent.changeText(screen.getByPlaceholderText("The court's own words"), text);
      });
      await act(async () => {
        fireEvent.press(screen.getByText('Save'));
      });
    }

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[0]![1]).not.toBe(onSubmit.mock.calls[1]![1]);
  });

  /**
   * A VALIDATION REFUSAL RELEASES THE LATCH AND KEEPS THE KEY (R16 §5: a
   * validation failure does not consume it). If the latch were not released the
   * advocate would be locked out of their own form by one bad date.
   */
  it('a validation refusal does not send, and does not lock the form', async () => {
    const onSubmit = submitMock(async () => true);
    await render(<AddEventSheet onDismiss={() => {}} onSubmit={onSubmit} visible />);

    await act(async () => {
      fireEvent.press(screen.getByText('Save')); // empty text
    });
    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText("The court's own words"), 'Adjourned.');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('NewMatterScreen', () => {
  async function fillAndDoubleTap() {
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('State v. Ramesh Kumar'), 'New v. Matter');
      fireEvent.changeText(screen.getByPlaceholderText('Delhi High Court'), 'Patna High Court');
      fireEvent.changeText(screen.getByPlaceholderText('Who you act for'), 'Client');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Add matter'));
      fireEvent.press(screen.getByText('Add matter'));
    });
  }

  it('two synchronous taps create exactly ONE matter', async () => {
    mocked('createMatter').mockImplementation(neverSettles as never);
    await render(<NewMatterScreen onBack={() => {}} onCreated={() => {}} />);
    await fillAndDoubleTap();
    expect(mocked('createMatter')).toHaveBeenCalledTimes(1);
    expect(ATTEMPT_KEY_PATTERN.test(mocked('createMatter').mock.calls[0]![1] as string)).toBe(true);
  });
});

describe('DeleteAccountScreen', () => {
  beforeEach(() => {
    mocked('listDataRequests').mockResolvedValue({ ok: true, data: { requests: [] } } as never);
    useSession.setState({
      profile: { email: 'advocate@example.com' },
    } as never);
  });

  it('two synchronous taps raise exactly ONE erasure request', async () => {
    mocked('createDataRequest').mockImplementation(neverSettles as never);
    await render(<DeleteAccountScreen onBack={() => {}} />);

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('advocate@example.com'),
        'advocate@example.com',
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Request account deletion'));
      fireEvent.press(screen.getByText('Request account deletion'));
    });

    expect(mocked('createDataRequest')).toHaveBeenCalledTimes(1);
  });
});

describe('TrainingConsentScreen', () => {
  const consent = {
    granted: false,
    grantedAt: null,
    version: null,
    currentVersion: 'training-v7',
    isCurrent: false,
  };

  it('two synchronous taps record exactly ONE grant', async () => {
    mocked('trainingConsent').mockResolvedValue({ ok: true, data: consent } as never);
    mocked('grantTrainingConsent').mockImplementation(neverSettles as never);
    await render(<TrainingConsentScreen onBack={() => {}} />);

    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByText('Agree'));
      fireEvent.press(screen.getByText('Agree'));
    });

    expect(mocked('grantTrainingConsent')).toHaveBeenCalledTimes(1);
  });

  /**
   * GRANT → WITHDRAW → GRANT IS THREE INTENTIONAL ACTS, not one repeated. The
   * route appends a consent audit event per call and that trail is the point, so
   * the second grant must NOT replay the first grant's key.
   */
  it('a grant after a withdrawal is a new intentional write with a new key', async () => {
    mocked('trainingConsent').mockResolvedValue({ ok: true, data: consent } as never);
    mocked('grantTrainingConsent').mockResolvedValue({
      ok: true,
      data: { ...consent, granted: true, isCurrent: true, version: 'training-v7' },
    } as never);
    mocked('withdrawTrainingConsent').mockResolvedValue({ ok: true, data: consent } as never);

    await render(<TrainingConsentScreen onBack={() => {}} />);
    await act(async () => {});

    await act(async () => {
      fireEvent.press(screen.getByText('Agree'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Withdraw'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Agree'));
    });

    const calls = mocked('grantTrainingConsent').mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![1]).not.toBe(calls[1]![1]);
  });
});

describe('UnverifiedCitationScreen — the vouch', () => {
  /*
    THE SAME SHAPE `UnverifiedCitationScreen.ecourts.test.tsx` USES. The screen
    renders the confirm button only inside `{check ? …}` and only when it holds a
    citation string, and `coverageLine(check.coverage)` reads fields a trimmed
    fixture does not have — a short fixture renders nothing and the failure looks
    like a missing button rather than a missing field.
  */
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
    asOf: '2026-09-02T00:00:00.000Z',
  };

  const check: CitationCheck = {
    citationCheckId: 'chk_1',
    citationClaimed: '(2019) 4 SCC 221',
    checkedAt: '2026-09-02T00:00:00.000Z',
    surface: 'search',
    shownToUser: true,
    verificationState: 'unverified',
    verifiedBySource: 'none',
    overruledStatus: 'none',
    overruledStatusShown: false,
    matchConfidence: null,
    judgment: null,
    tiers: [{ tier: 1, source: 'corpus', status: 'miss', detail: 'Not in the corpus.', at: null }],
    coverage: { tiersImplemented: 1, tiersDefined: 3, note: 'One of three tiers has shipped.' },
    asOf: '2026-09-02T00:00:00.000Z',
  };

  async function mount() {
    mocked('citationCheck').mockResolvedValue({ ok: true, data: check } as never);
    await render(
      <UnverifiedCitationScreen citationCheckId="chk_1" judgment={judgment} onBack={() => {}} />,
    );
    await screen.findByText('Where we looked');
  }

  it('two synchronous taps record exactly ONE confirmation', async () => {
    mocked('verifyConfirm').mockImplementation(neverSettles as never);
    await mount();

    await act(async () => {
      fireEvent.press(screen.getByText('I verified it — mark it'));
      fireEvent.press(screen.getByText('I verified it — mark it'));
    });

    expect(mocked('verifyConfirm')).toHaveBeenCalledTimes(1);
    expect(ATTEMPT_KEY_PATTERN.test(mocked('verifyConfirm').mock.calls[0]![2] as string)).toBe(true);
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE FALSE-SUCCESS DEFECT, PINNED.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The button used to `setConfirmed(true)` and then discard the promise. With
   * `verifyConfirm` sending no bearer token, EVERY confirm answered
   * `AUTH_REQUIRED` and wrote nothing — while the screen said "You confirmed
   * this". A permanent Tier 3 record that does not exist, shown as one that
   * does.
   */
  it('does NOT claim a confirmation the server refused', async () => {
    mocked('verifyConfirm').mockResolvedValue({
      ok: false,
      error: { code: 'AUTH_REQUIRED', message: 'no' },
    } as never);
    await mount();

    await act(async () => {
      fireEvent.press(screen.getByText('I verified it — mark it'));
    });

    expect(screen.queryByText('You confirmed this')).toBeNull();
    expect(screen.getByText(/could not record your check/i)).toBeTruthy();
  });

  it('the failure leaves the button usable, and the retry reuses the key', async () => {
    mocked('verifyConfirm').mockResolvedValueOnce({
      ok: false,
      error: { code: 'network', message: 'no' },
    } as never);
    mocked('verifyConfirm').mockResolvedValue({ ok: true, data: {} } as never);
    await mount();

    await act(async () => {
      fireEvent.press(screen.getByText('I verified it — mark it'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('I verified it — mark it'));
    });

    const calls = mocked('verifyConfirm').mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![2]).toBe(calls[1]![2]);
    expect(screen.getByText('You confirmed this')).toBeTruthy();
  });

  it('confirms only after the server actually said yes', async () => {
    mocked('verifyConfirm').mockResolvedValue({ ok: true, data: {} } as never);
    await mount();

    await act(async () => {
      fireEvent.press(screen.getByText('I verified it — mark it'));
    });

    expect(screen.getByText('You confirmed this')).toBeTruthy();
    expect(screen.queryByText(/could not record your check/i)).toBeNull();
  });
});
