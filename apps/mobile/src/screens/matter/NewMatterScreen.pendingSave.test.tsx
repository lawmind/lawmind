import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { NewMatterScreen } from './NewMatterScreen';
import { api } from '../../api/client';
import { usePendingSave } from '../../state/pendingSave';
import { usePractice } from '../../state/practice';

/*
  NO LOCAL AsyncStorage MOCK. `jest/async-storage.js` already provides one for
  the whole suite, and a local factory that returns a bare object has no DEFAULT
  export — so `import AsyncStorage from …` resolves to undefined, every write
  throws inside a floating promise nobody awaits, and the REST of the file fails
  on queries that have nothing to do with storage. That is how three unrelated
  assertions here failed while the code under test was correct.
*/
jest.mock('../../api/client', () => ({
  api: {
    createMatter: jest.fn(),
    addAuthorityToMatter: jest.fn(),
    createAnnotation: jest.fn(),
    /*
      `submit()` fires `usePractice.refresh()` on the way past, which calls
      this. It is not what these tests are about, but leaving it off the mock
      throws inside an unawaited promise and takes the whole file down with it.
    */
    matters: jest.fn(async () => ({ ok: true as const, data: { matters: [], asOf: '' } })),
  },
}));

const createMatter = api.createMatter as jest.MockedFunction<typeof api.createMatter>;
const addAuthority = api.addAuthorityToMatter as jest.MockedFunction<typeof api.addAuthorityToMatter>;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WHOLE FLOW — authority → save → no matter → create → the authority is on
 * the new matter. NEW3 R16 §8, `R16-RCC-04`, founder design fpass 24.
 *
 * The defect being closed: this form used to create the matter and DROP the
 * save, silently, for the one population that must use this path — an advocate
 * with no matters yet.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MATTER = {
  matterId: 'mat_new',
  caseTitle: 'New v. Matter',
  cnrNumber: null,
  court: 'Patna High Court',
  caseType: 'criminal' as const,
  parties: { description: '' },
  clientName: 'Client',
  ourSide: 'petitioner' as const,
  nextHearingDate: null,
};

/**
 * FILL THE THREE REQUIRED FIELDS AND SUBMIT, ALL INSIDE ONE act SCOPE.
 *
 * Every keystroke and the submit are settled together. Interleaving them with
 * `findBy*` waits opens a second act scope while the first is still on the
 * stack — React reports "overlapping act() calls", DISABLES the act environment
 * for the whole FILE, and every later render in it is detached from
 * `screen`. That is how two tests below failed on queries that had nothing to
 * do with what they were testing.
 */
async function fillTheFormAndSubmit() {
  await act(async () => {
    fireEvent.changeText(screen.getByPlaceholderText('State v. Ramesh Kumar'), 'New v. Matter');
    fireEvent.changeText(screen.getByPlaceholderText('Delhi High Court'), 'Patna High Court');
    fireEvent.changeText(screen.getByPlaceholderText('Who you act for'), 'Client');
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Add matter'));
  });
}

beforeEach(() => {
  createMatter.mockReset();
  addAuthority.mockReset();
  createMatter.mockResolvedValue({ ok: true, data: { matter: MATTER } });
  usePendingSave.setState({ held: null, hydrated: true, running: false });
  /*
    A NO-OP REFRESH. `submit()` fires `usePractice.refresh()` and does not
    await it, so the real one lands its state update AFTER the test has ended
    and RNTL has unmounted — which detaches `screen` and made the next two
    tests in this file fail on queries that had nothing to do with them. The
    caseload refresh is not what these tests are about; `state/practice` has
    its own suite for it.
  */
  usePractice.setState({ matters: [], refresh: async () => {} });
});

describe('a form reached with nothing held', () => {
  /** The ordinary path from Matters is unchanged: create, then open. */
  it('creates and opens the matter, saving nothing', async () => {
    const onCreated = jest.fn();
    await render(<NewMatterScreen onBack={() => {}} onCreated={onCreated} />);
    await fillTheFormAndSubmit();

    expect(onCreated).toHaveBeenCalledWith('mat_new');
    expect(addAuthority).not.toHaveBeenCalled();
  });
});

describe('a form reached from the empty MatterPicker', () => {
  beforeEach(() => {
    usePendingSave.getState().capture({
      kind: 'authority',
      judgmentId: 'jdg_1',
      caseTitle: 'Mock Bench v. Mock State',
      citationCheckId: 'chk_1',
    });
  });

  it('says what is waiting on the form', async () => {
    await render(<NewMatterScreen onBack={() => {}} onCreated={() => {}} />);

    expect(screen.getByText(/Mock Bench v\. Mock State will be saved to this matter/)).toBeTruthy();
  });

  it('saves the held authority to the matter it just created, then opens it', async () => {
    addAuthority.mockResolvedValue({ ok: true, data: { authority: {} as never } });
    const onCreated = jest.fn();
    await render(<NewMatterScreen onBack={() => {}} onCreated={onCreated} />);
    await fillTheFormAndSubmit();

    expect(onCreated).toHaveBeenCalledWith('mat_new');
    expect(addAuthority).toHaveBeenCalledWith({
      matterId: 'mat_new',
      judgmentId: 'jdg_1',
      citationCheckId: 'chk_1',
    });
    expect(usePendingSave.getState().held).toBeNull();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PARTIAL RESULT — NEW3 R16 §8 criterion 3, and the one that matters most.
 *
 * "A created matter plus failed save must be shown as that partial result with
 * an explicit retry; it must never claim the authority was saved."
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('when the matter is created but the save is not', () => {
  beforeEach(() => {
    usePendingSave.getState().capture({
      kind: 'authority',
      judgmentId: 'jdg_1',
      caseTitle: 'Mock Bench v. Mock State',
    });
    addAuthority.mockResolvedValue({ ok: false, error: { code: 'network', message: 'offline' } });
  });

  it('states both halves and does not open the matter', async () => {
    const onCreated = jest.fn();
    await render(<NewMatterScreen onBack={() => {}} onCreated={onCreated} />);

    await fillTheFormAndSubmit();

    expect(screen.getByText(/The matter was created\./)).toBeTruthy();
    expect(screen.getByText('offline')).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
  });

  /** The intent survives, so the retry has something to save. */
  it('keeps the held intent for the retry', async () => {
    await render(<NewMatterScreen onBack={() => {}} onCreated={() => {}} />);

    await fillTheFormAndSubmit();

    expect(usePendingSave.getState().held).not.toBeNull();
  });

  /**
   * RETRY SAVES, IT DOES NOT CREATE A SECOND MATTER. The obvious wrong repair
   * for "the matter was created but…" is to press Add matter again.
   */
  it('retries the save against the same matter, creating no second one', async () => {
    const onCreated = jest.fn();
    await render(<NewMatterScreen onBack={() => {}} onCreated={onCreated} />);

    await fillTheFormAndSubmit();
    addAuthority.mockResolvedValue({ ok: true, data: { authority: {} as never } });
    await act(async () => {
      fireEvent.press(screen.getByText('Try saving it again'));
    });

    expect(createMatter).toHaveBeenCalledTimes(1);
    expect(addAuthority).toHaveBeenLastCalledWith({ matterId: 'mat_new', judgmentId: 'jdg_1' });
    expect(onCreated).toHaveBeenCalledWith('mat_new');
  });

  /**
   * ABANDONING IS EXPLICIT. The advocate opens the matter that does exist, and
   * the intent is cleared HERE rather than on navigation — so backing out by
   * any other route leaves it held and retryable.
   */
  it('clears the intent only when the advocate opens the matter without it', async () => {
    const onCreated = jest.fn();
    await render(<NewMatterScreen onBack={() => {}} onCreated={onCreated} />);

    await fillTheFormAndSubmit();
    await act(async () => {
      fireEvent.press(screen.getByText('Open the matter without it'));
    });

    expect(usePendingSave.getState().held).toBeNull();
    expect(onCreated).toHaveBeenCalledWith('mat_new');
  });

  /** Nowhere in this state may the screen suggest the authority is on the file. */
  it('never claims the authority was saved', async () => {
    const view = await render(<NewMatterScreen onBack={() => {}} onCreated={() => {}} />);

    await fillTheFormAndSubmit();

    const text = JSON.stringify(view.toJSON());
    expect(text).toMatch(/was not saved to it/);
    expect(text).not.toMatch(/saved to this matter\.|added to the matter|Saved\b/);
  });
});
