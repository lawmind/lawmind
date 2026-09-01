import { fireEvent, render, screen } from '@testing-library/react-native';

import { ManageMatterScreen } from './ManageMatterScreen';
import { api } from '../../api/client';
import type { Matter } from '../../api/contract';
import { usePractice } from '../../state/practice';

jest.mock('../../api/client', () => ({ api: { updateMatter: jest.fn() } }));
const updateMatter = api.updateMatter as jest.MockedFunction<typeof api.updateMatter>;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MANAGE A MATTER — founder design D-2, NEW3 R16 `R16-RCC-02`.
 *
 * The properties pinned here are the ones D-2 states as truth requirements, not
 * the layout: archive must not read as delete, a sharee must not be offered it,
 * archiving changes what the morning shows, and no control may exist for a
 * field the server cannot write.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MATTER: Matter = {
  matterId: 'mat_1',
  caseTitle: 'Mock Petitionr v. Mock State',
  cnrNumber: null,
  court: 'Patna High Court',
  caseType: 'criminal',
  parties: { description: 'Mock parties' },
  clientName: 'Mock Client',
  ourSide: 'petitioner',
  nextHearingDate: '2026-09-20',
  status: 'active',
  access: 'owner',
};

function seed(matter: Matter = MATTER) {
  usePractice.setState({ matters: [matter], freshness: { kind: 'live' }, loading: false });
}

beforeEach(() => {
  updateMatter.mockReset();
  /*
    A DEFAULT THE SUITE CANNOT BE POISONED BY. A bare `mockReset` leaves the
    mock returning `undefined`, so any unintended call reads `.ok` off it,
    throws inside a promise nobody awaits, and takes the REST of the file down
    with it — which is how four unrelated assertions failed while the two real
    defects hid behind them. Tests that care assert on the call itself.
  */
  updateMatter.mockResolvedValue({ ok: true, data: { matter: MATTER } });
  seed();
});

describe('editing the contracted fields', () => {
  it('sends the corrected title and reports success to the caller', async () => {
    updateMatter.mockResolvedValue({
      ok: true,
      data: { matter: { ...MATTER, caseTitle: 'Mock Petitioner v. Mock State' } },
    });
    const onDone = jest.fn();
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={onDone} />);

    fireEvent.changeText(
      screen.getByDisplayValue('Mock Petitionr v. Mock State'),
      'Mock Petitioner v. Mock State',
    );
    /*
      THE EDIT IS OBSERVED BEFORE IT IS SAVED. Without this the press ran
      against the render that was on screen before the keystroke and sent the
      OLD title — which is a real failure mode, not a test artefact: a save
      button reading a stale closure would silently discard the correction.
    */
    await screen.findByDisplayValue('Mock Petitioner v. Mock State');
    fireEvent.press(screen.getByText('Save changes'));

    expect(updateMatter).toHaveBeenCalledWith(
      'mat_1',
      expect.objectContaining({ caseTitle: 'Mock Petitioner v. Mock State' }),
    );
    await screen.findByText('Manage this matter');
    expect(onDone).toHaveBeenCalled();
  });

  /**
   * THE TWO FIELDS THE SERVER CANNOT WRITE. `patchMatterBody` has no `caseType`
   * and no `parties` key and the UPDATE writes neither column, so a control for
   * either would save successfully and change nothing — the advocate would
   * believe they had corrected it. The founder design lists both as editable.
   */
  it('offers no control for a field PATCH does not accept', async () => {
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={() => {}} />);

    expect(screen.queryByDisplayValue('Mock parties')).toBeNull();
    expect(screen.getByText(/Case type and parties are set when a matter is created/i)).toBeTruthy();
  });

  /** X02 — the design's three inventions, none of which the server has. */
  it('offers no On hold, no hard delete and no CNR re-sync', async () => {
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={() => {}} />);

    expect(screen.queryByText(/on hold/i)).toBeNull();
    expect(screen.queryByText(/delete this matter|delete matter/i)).toBeNull();
    expect(screen.queryByText(/re-?sync|last synced/i)).toBeNull();
  });

  it('refuses an empty title without calling the server', async () => {
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={() => {}} />);

    fireEvent.changeText(screen.getByDisplayValue('Mock Petitionr v. Mock State'), '   ');
    await screen.findByDisplayValue('   ');
    fireEvent.press(screen.getByText('Save changes'));

    expect(await screen.findByText('Give the matter a title.')).toBeTruthy();
    expect(updateMatter).not.toHaveBeenCalled();
  });

  it('refuses a malformed hearing date without calling the server', async () => {
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={() => {}} />);

    fireEvent.changeText(screen.getByDisplayValue('2026-09-20'), '20 September');
    await screen.findByDisplayValue('20 September');
    fireEvent.press(screen.getByText('Save changes'));

    expect(await screen.findByText(/YYYY-MM-DD/)).toBeTruthy();
    expect(updateMatter).not.toHaveBeenCalled();
  });

  /**
   * THE SERVER'S OWN WORDS, AND NO CLAIM OF SUCCESS. A failed write must not
   * leave the screen looking as though the edit landed — this is a correction
   * to our record and has no existence outside it.
   */
  it('shows the server message verbatim on failure and does not report done', async () => {
    updateMatter.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'no matter with that id' },
    });
    const onDone = jest.fn();
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={onDone} />);

    fireEvent.press(screen.getByText('Save changes'));

    expect(await screen.findByText('no matter with that id')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  /**
   * NO ACCIDENTAL DATA LOSS. An untouched form saves the values it was given
   * back, not blanks — every field is seeded from the matter and every one is
   * sent. A null here would CLEAR the column, which is a real instruction.
   */
  it('sends the existing values back unchanged when nothing was edited', async () => {
    updateMatter.mockResolvedValue({ ok: true, data: { matter: MATTER } });
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={() => {}} />);

    fireEvent.press(screen.getByText('Save changes'));

    expect(updateMatter).toHaveBeenCalledWith('mat_1', {
      caseTitle: 'Mock Petitionr v. Mock State',
      court: 'Patna High Court',
      clientName: 'Mock Client',
      ourSide: 'petitioner',
      cnrNumber: null,
      nextHearingDate: '2026-09-20',
    });
  });
});

describe('disposing and archiving', () => {
  /**
   * A matter can never be set to the state it is already in — the transitions
   * are rendered from the enum minus the current value. A no-op PATCH returns
   * 200 and looks as though it did something.
   */
  it('offers only the transitions away from the current state', async () => {
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={() => {}} />);

    expect(screen.getByText('Mark disposed')).toBeTruthy();
    expect(screen.getByText('Mark archived')).toBeTruthy();
    expect(screen.queryByText('Mark active')).toBeNull();
  });

  it('offers the way back from an archived matter, and only that', async () => {
    seed({ ...MATTER, status: 'archived' });
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={() => {}} />);

    expect(screen.getByText('Put back on your list')).toBeTruthy();
    expect(screen.queryByText('Mark archived')).toBeNull();
  });

  /**
   * D-2: "ARCHIVE MUST NOT LOOK LIKE DELETE. A matter carries saved
   * authorities, events, briefings and possibly a share. Nothing on this path
   * may read as destruction." The confirmation therefore says what SURVIVES and
   * names the way back — it does not warn, because nothing is lost.
   */
  it('confirms archiving by naming what survives, never what is lost', async () => {
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={() => {}} />);

    fireEvent.press(screen.getByText('Mark archived'));
    const body = await screen.findByText(/timeline, its saved authorities and anyone it is shared with/i);

    expect(String(body.props.children)).toMatch(/stay exactly as they are/i);
    expect(String(body.props.children)).toMatch(/put it back on your list/i);
    /*
      A CLAIM OF LOSS, NOT THE WORD. "nothing is deleted" contains "delete" and
      is the reassurance itself — an earlier version of this line banned the
      substring and failed on the copy it was written to protect. What may never
      appear is a statement that something goes.
    */
    expect(screen.queryByText(/permanently|cannot be undone|will be lost|deleted forever/i)).toBeNull();
  });

  it('sends the status and reports done', async () => {
    updateMatter.mockResolvedValue({
      ok: true,
      data: { matter: { ...MATTER, status: 'archived' } },
    });
    const onDone = jest.fn();
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={onDone} />);

    fireEvent.press(screen.getByText('Mark archived'));
    /*
      The confirmation says what the advocate is about to DO, so it is a
      different string from the row that opened it — deliberately, because two
      controls a tap apart carrying identical text is how somebody confirms
      something they did not mean to open.
    */
    fireEvent.press(await screen.findByText('Archive this matter'));

    await screen.findByText('Manage this matter');
    expect(updateMatter).toHaveBeenCalledWith('mat_1', { status: 'archived' });
    expect(onDone).toHaveBeenCalled();
  });

  /** Cancelling changes nothing at all — no write, no navigation. */
  it('writes nothing when the confirmation is cancelled', async () => {
    const onDone = jest.fn();
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={onDone} />);

    fireEvent.press(screen.getByText('Mark disposed'));
    fireEvent.press(await screen.findByText('Cancel'));

    expect(updateMatter).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  /** A failed status write says so and does not leave the screen. */
  it('shows a failed status write and does not report done', async () => {
    updateMatter.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'no matter with that id' },
    });
    const onDone = jest.fn();
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={onDone} />);

    fireEvent.press(screen.getByText('Mark disposed'));
    /*
      The confirmation says what the advocate is about to DO, so it is a
      different string from the row that opened it — deliberately, because two
      controls a tap apart carrying identical text is how somebody confirms
      something they did not mean to open.
    */
    fireEvent.press(await screen.findByText('Dispose of this matter'));

    expect(await screen.findByText('no matter with that id')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});

/**
 * A SHAREE MUST NOT BE OFFERED IT — D-2's own truth state. The server enforces
 * it regardless (`PATCH` carries `WHERE user_id = $me`, so a sharee's write
 * answers 404), but a control that can only fail is worse than no control.
 */
describe('a shared matter', () => {
  it('offers no edit or status control to a sharee, and says why', async () => {
    seed({ ...MATTER, access: 'shared' });
    await render(<ManageMatterScreen matterId="mat_1" onBack={() => {}} onDone={() => {}} />);

    expect(screen.getByText(/the advocate who owns it is the one who can change it/i)).toBeTruthy();
    expect(screen.queryByText('Save changes')).toBeNull();
    expect(screen.queryByText('Mark archived')).toBeNull();
  });
});
