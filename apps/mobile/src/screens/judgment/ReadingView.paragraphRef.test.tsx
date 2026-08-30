import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { paragraphIndexForNumber, paragraphNumberForIndex, ReadingView } from './ReadingView';
import { MOCK_JUDGMENTS } from '../../api/fixtures';
import { useReadingStore } from '../../state/reading';
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

const setString = Clipboard.setStringAsync as jest.MockedFunction<typeof Clipboard.setStringAsync>;

const base = Object.values(MOCK_JUDGMENTS)[0] as JudgmentDetail;

const judgmentWith = (paragraphs: JudgmentDetail['paragraphs']): JudgmentDetail => ({
  ...base,
  caseTitle: 'Mock Petitioner v. Mock State',
  paragraphs,
  numberedShare: 1,
});

const numbered = { paragraphIndex: 1, paragraphNumber: 7, text: 'A numbered paragraph.' };
const unnumbered = { paragraphIndex: 0, paragraphNumber: null, text: 'The headnote.' };

const draw = async (
  judgment: JudgmentDetail,
  onOpenJudgment = jest.fn(),
  openParagraph?: number,
) => {
  const view = await render(
    <ReadingView
      judgment={judgment}
      onBack={() => {}}
      onOpenJudgment={onOpenJudgment}
      openParagraph={openParagraph}
      onParagraphChange={() => {}}
    />,
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
      judgmentWith([{ ...numbered, citesJudgmentId: 'jdg_cited' }]),
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TAKING A HIGHLIGHT BACK OFF.
 *
 * `DELETE /annotations/:annotationId` had no caller and there was no local
 * remove either, so a highlight was permanent once made — an advocate who
 * marked the wrong paragraph had no way back.
 *
 * The action REPLACES "Save to matter" rather than sitting beside it: a
 * paragraph is either marked or it is not, and offering both at once asks the
 * advocate to work out which one applies.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('the highlight actions on a selected paragraph', () => {
  beforeEach(() => {
    useReadingStore.setState({ highlights: [], progress: {}, hydrated: true });
  });

  it('offers "Save to matter" while the paragraph is not highlighted', async () => {
    await draw(judgmentWith([numbered]));

    await fireEvent.press(screen.getByText('A numbered paragraph.'));

    expect(screen.getByText('Save to matter')).toBeTruthy();
    expect(screen.queryByText('Remove highlight')).toBeNull();
  });

  it('offers "Remove highlight" once it is, and not both at once', async () => {
    useReadingStore.setState({
      highlights: [
        {
          judgmentId: base.judgmentId,
          paragraphIndex: 1,
          paragraphNumber: 7,
          text: 'A numbered paragraph.',
          savedAt: '2026-08-11T00:00:00.000Z',
          annotationId: 'ann-1',
        },
      ],
    });

    await draw(judgmentWith([numbered]));
    await fireEvent.press(screen.getByText('A numbered paragraph.'));

    expect(screen.getByText('Remove highlight')).toBeTruthy();
    expect(screen.queryByText('Save to matter')).toBeNull();
  });

  /** Matched by index, the only key that is unique on an unnumbered judgment. */
  it('offers removal on an unnumbered paragraph too', async () => {
    useReadingStore.setState({
      highlights: [
        {
          judgmentId: base.judgmentId,
          paragraphIndex: 0,
          paragraphNumber: null,
          text: 'The headnote.',
          savedAt: '2026-08-11T00:00:00.000Z',
          annotationId: 'ann-2',
        },
      ],
    });

    await draw(judgmentWith([unnumbered]));
    await fireEvent.press(screen.getByText('The headnote.'));

    expect(screen.getByText('Remove highlight')).toBeTruthy();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHEET'S JUMP ROWS: A PRINTED NUMBER IS NOT AN ARRAY INDEX.
 *
 * `ReadingView` states the rule itself — "IDENTITY IS THE INDEX. THE PRINTED
 * NUMBER IS FOR CITING… the number is converted back at the two boundaries that
 * genuinely need something citable." The sheet is a third boundary and was
 * missed: `onJumpToParagraph` handed `n` straight to `jumpTo`, which takes an
 * index. "Holding · ¶ 47" scrolled to array index 47 — a different paragraph,
 * silently, and a headnote alone is enough to shift every one.
 *
 * DORMANT WHEN FOUND, NOT HARMLESS: `judgments/route.ts` sends neither
 * `holdingParagraphNumber` nor `operativeParagraphNumber`, so neither row draws
 * and the bug cannot fire — until the day that field lands, on a screen nobody
 * would think to re-test. These tests supply the field the server does not, so
 * the conversion is pinned before it matters.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('jumping from the reading sheet', () => {
  /**
   * Numbering that does not equal the index is the ordinary case, not a corner
   * one: paragraph ¶ 7 sits at index 1 here because the headnote is index 0 and
   * carries no number at all.
   */
  const offsetJudgment = (): JudgmentDetail => ({
    ...judgmentWith([unnumbered, numbered]),
    holdingParagraphNumber: 7,
  });

  /**
   * THE COUNTER IS THE OBSERVABLE, not the rendered text — both paragraphs
   * render either way in a two-row judgment, so asserting on the prose would
   * pass whether or not the jump landed.
   *
   * ¶ 7 sits at INDEX 1: the headnote is index 0 and carries no number. So a
   * correct conversion moves `current` to 1 and the counter reads "¶ 7 of 2".
   * The raw pass-through set `current` to 7, `paragraphs[7]` is undefined, and
   * the counter fell to its unnumbered branch — "8 of 2", a position outside
   * the document.
   */
  it('scrolls to the paragraph the number names, not to that array index', async () => {
    await draw(offsetJudgment());

    await fireEvent.press(screen.getByLabelText('Reading options'));
    await fireEvent.press(await screen.findByText('Holding'));

    expect(await screen.findByText('¶ 7 of 2')).toBeTruthy();
    expect(screen.queryByText('8 of 2')).toBeNull();
  });

  it('refuses a number the judgment does not contain rather than scrolling to -1', async () => {
    await draw({ ...judgmentWith([unnumbered, numbered]), holdingParagraphNumber: 999 });

    await fireEvent.press(screen.getByLabelText('Reading options'));
    await fireEvent.press(await screen.findByText('Holding'));

    // The sheet stays open — nothing was jumped to, and nothing crashed.
    expect(screen.getByText('Holding')).toBeTruthy();
  });
});

describe('deep links and reading progress keep printed numbers separate from indexes', () => {
  const offsetJudgment = () => judgmentWith([unnumbered, numbered]);

  beforeEach(() => {
    useReadingStore.setState({ highlights: [], progress: {}, hydrated: true });
  });

  it('opens a deep link on the paragraph the printed number names', async () => {
    await draw(offsetJudgment(), jest.fn(), 7);
    expect(screen.getByText('¶ 7 of 2')).toBeTruthy();
  });

  it('converts a printed number to its actual navigation index', () => {
    expect(paragraphIndexForNumber(offsetJudgment().paragraphs, 7)).toBe(1);
    expect(paragraphIndexForNumber(offsetJudgment().paragraphs, 999)).toBe(-1);
  });

  it('persists the printed number for a numbered index and nothing for an unnumbered one', () => {
    expect(paragraphNumberForIndex(offsetJudgment().paragraphs, 1)).toBe(7);
    expect(paragraphNumberForIndex(offsetJudgment().paragraphs, 0)).toBeNull();
    expect(paragraphNumberForIndex(offsetJudgment().paragraphs, 99)).toBeNull();
  });
});

/**
 * "Your highlights" drew unconditionally — including "0" — and had no onPress,
 * the one dead row in a block whose own rule is "a number we do not have is a
 * row we do not draw". Nothing to jump to is the same case.
 */
describe('the highlights row in the reading sheet', () => {
  beforeEach(() => {
    useReadingStore.setState({ highlights: [], progress: {}, hydrated: true });
  });

  it('is not drawn when there is nothing to go to', async () => {
    await draw(judgmentWith([numbered]));

    await fireEvent.press(screen.getByLabelText('Reading options'));

    expect(screen.queryByText('Your highlights')).toBeNull();
  });

  it('is drawn once there is, and counts the merged list', async () => {
    useReadingStore.setState({
      highlights: [
        {
          judgmentId: base.judgmentId,
          paragraphIndex: 0,
          paragraphNumber: null,
          text: 'The headnote.',
          savedAt: '2026-08-11T00:00:00.000Z',
          annotationId: 'ann-1',
        },
      ],
    });

    await draw(judgmentWith([unnumbered, numbered]));
    await fireEvent.press(screen.getByLabelText('Reading options'));

    expect(await screen.findByText('Your highlights')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });
});
