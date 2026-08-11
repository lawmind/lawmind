import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { ReadingView } from './ReadingView';
import { MOCK_JUDGMENTS } from '../../api/fixtures';
import type { JudgmentDetail } from '../../api/contract';

/**
 * THE READER'S TWO REFERENCES: THE PARAGRAPH NUMBER AND THE CITED JUDGMENT.
 *
 * Both are nullable, both are common, and both feed things an advocate pastes
 * into a document.
 *
 * `paragraphNumber` is null on the headnote of every judgment and on every
 * pre-1990s scan whose numbering did not survive OCR — the contract says so and
 * `numberedShare` exists precisely because it happens often enough to hide the
 * anchor gutter. Until 11 Aug 2026 the action row printed "Copy ¶ null" on
 * those rows and the "Link" action put "<case> ¶ null" ON THE CLIPBOARD: the
 * same defect as the citation copy, on the same screen.
 *
 * `citesJudgmentId` went live the same day. The server omits it when the
 * citation resolves to zero judgments, to MORE than one, or to the judgment
 * already open — so absence is a deliberate refusal to guess, and the client
 * must render no link rather than fall back to a search.
 */

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

/**
 * The reader offers Hindi read-aloud, which probes the device's installed
 * voices on mount. There is no speech engine under jest, and the hook is not
 * what these tests are about.
 */
jest.mock('expo-speech', () => ({
  getAvailableVoicesAsync: jest.fn(() => Promise.resolve([])),
  speak: jest.fn(),
  stop: jest.fn(),
  isSpeakingAsync: jest.fn(() => Promise.resolve(false)),
}));

const setString = Clipboard.setStringAsync as jest.MockedFunction<
  typeof Clipboard.setStringAsync
>;

const base = Object.values(MOCK_JUDGMENTS)[0] as JudgmentDetail;

const judgmentWith = (paragraphs: JudgmentDetail['paragraphs']): JudgmentDetail => ({
  ...base,
  caseTitle: 'Mock Petitioner v. Mock State',
  paragraphs,
  numberedShare: 1,
});

const numbered = { paragraphIndex: 1, paragraphNumber: 7, text: 'A numbered paragraph.' };
const unnumbered = { paragraphIndex: 0, paragraphNumber: null, text: 'The headnote.' };

const draw = async (judgment: JudgmentDetail, onOpenJudgment = jest.fn()) => {
  const view = await render(
    <ReadingView
      judgment={judgment}
      onBack={() => {}}
      onOpenJudgment={onOpenJudgment}
      onParagraphChange={() => {}}
    />
  );
  return { view, onOpenJudgment };
};

beforeEach(() => setString.mockClear());

describe('a paragraph the court never numbered', () => {
  it('does not offer "Link", because there is no n to refer to', async () => {
    await draw(judgmentWith([unnumbered]));

    await fireEvent.press(screen.getByText('The headnote.'));

    expect(screen.queryByText('Link')).toBeNull();
  });

  it('never prints the word null in the copy label', async () => {
    await draw(judgmentWith([unnumbered]));

    await fireEvent.press(screen.getByText('The headnote.'));

    expect(screen.queryByText(/¶ null/)).toBeNull();
    expect(screen.getByText('Copy paragraph')).toBeTruthy();
  });

  it('still copies the text — the reference is withheld, not the passage', async () => {
    await draw(judgmentWith([unnumbered]));

    await fireEvent.press(screen.getByText('The headnote.'));
    await fireEvent.press(screen.getByText('Copy paragraph'));

    expect(setString).toHaveBeenCalledWith('The headnote.');
  });
});

describe('a paragraph the court numbered', () => {
  it('names the number in the label', async () => {
    await draw(judgmentWith([numbered]));

    await fireEvent.press(screen.getByText('A numbered paragraph.'));

    expect(screen.getByText('Copy ¶ 7')).toBeTruthy();
  });

  it('offers "Link" and copies a reference that can be cited back', async () => {
    await draw(judgmentWith([numbered]));

    await fireEvent.press(screen.getByText('A numbered paragraph.'));
    await fireEvent.press(screen.getByText('Link'));

    expect(setString).toHaveBeenCalledWith('Mock Petitioner v. Mock State ¶ 7');
    expect(String(setString.mock.calls[0]?.[0])).not.toContain('null');
  });
});

describe('citation navigation — live 11 Aug 2026', () => {
  it('offers the jump only where the server resolved the citation', async () => {
    await draw(judgmentWith([{ ...numbered, citesJudgmentId: 'jdg_cited' }]));

    expect(screen.getByText('Open the judgment cited here')).toBeTruthy();
  });

  it('opens exactly the judgment the server named, never a search', async () => {
    const { onOpenJudgment } = await draw(
      judgmentWith([{ ...numbered, citesJudgmentId: 'jdg_cited' }])
    );

    await fireEvent.press(await screen.findByText('Open the judgment cited here'));

    expect(onOpenJudgment).toHaveBeenCalledWith('jdg_cited');
  });

  /**
   * ABSENCE IS A REFUSAL, NOT A GAP. The server withholds the field on an
   * ambiguous citation — one identifying two judgments identifies neither. A
   * client that fell back to a search here would convert that refusal into a
   * guess the advocate cannot see.
   */
  it('offers nothing when the server withheld the resolution', async () => {
    await draw(judgmentWith([numbered]));

    expect(screen.queryByText('Open the judgment cited here')).toBeNull();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SAVING A PASSAGE THE COURT NEVER NUMBERED.
 *
 * Both save actions were `undefined` on an unnumbered paragraph until
 * 11 August 2026, so both did nothing at all — no toast, no reason. The
 * reasoning given was that a highlight is a citation and needs a citable "¶ n".
 *
 * PD-9 says *"highlight and save a passage to a matter"* and requires no
 * number; `annotationBody` types `paragraphNumber` `.nullable()` on both paths
 * and its module note says blocking a save "would teach them the product is
 * broken rather than careful". Nothing interpolates the number, so nothing
 * fabricates one.
 *
 * These tests pin the ACTIONS. `state/reading.test.ts` pins what reaches the
 * server.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('saving a passage from an unnumbered judgment', () => {
  it('offers "Save to matter" on it, like any other paragraph', async () => {
    await draw(judgmentWith([unnumbered]));

    await fireEvent.press(screen.getByText('The headnote.'));

    expect(screen.getByText('Save to matter')).toBeTruthy();
  });

  /**
   * The number and the passage are different facts. "Link" stays withheld
   * because there is no n to link to — that refusal is correct and unchanged —
   * while the passage itself is perfectly saveable.
   */
  it('still withholds "Link", which is a different question', async () => {
    await draw(judgmentWith([unnumbered]));

    await fireEvent.press(screen.getByText('The headnote.'));

    expect(screen.getByText('Save to matter')).toBeTruthy();
    expect(screen.queryByText('Link')).toBeNull();
  });

  it('offers it on a numbered paragraph too — nothing narrowed', async () => {
    await draw(judgmentWith([numbered]));

    await fireEvent.press(screen.getByText('A numbered paragraph.'));

    expect(screen.getByText('Save to matter')).toBeTruthy();
  });
});
