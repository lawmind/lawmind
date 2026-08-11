import { fireEvent, render, screen } from '@testing-library/react-native';

import { ResultCard } from './ResultCard';
import type { SearchResult } from '../api/contract';

/**
 * THE EVIDENCE PASSAGE — the court's own words, in the list.
 *
 * Until 11 Aug 2026 a result card drew a citation, a court and a case name and
 * nothing else. `holding` is the only prose it rendered, and the server sets
 * `holding: ''` on every row (`services/api/src/search/route.ts`) because
 * summarisation is not wired — so an advocate opened every result to read a
 * single word of any judgment, while `operativeParagraph` had been arriving on
 * every row the whole time.
 *
 * TWO RULES THIS FILE EXISTS TO HOLD:
 *
 *   1. THE GATE. The passage renders only when the server also names a
 *      paragraph number. Unnumbered, the field is ~2,600 characters of raw OCR
 *      and we have text without a position — which cannot be quoted or checked.
 *      `JudgmentScreen` gates it the same way for the same reason.
 *   2. VERBATIM. Truncation is `numberOfLines`, a DISPLAY bound. The string
 *      handed to the card is the string rendered, uncut and unedited. A client
 *      that trimmed, cleaned or summarised this would be putting words in a
 *      court's mouth on the surface most likely to be quoted from.
 */

/** Long enough that a card must elide it, and verbatim OCR furniture included. */
const PASSAGE =
  'The appellant having been convicted under Section 138 of the Negotiable ' +
  'Instruments Act, 1881, we are of the considered view that the sen- tence ' +
  'awarded is disproportionate to the gravity of the offence alleged, and the ' +
  'High Court ought to have adverted to the settled position that a cheque ' +
  'bounce matter is quasi-criminal in character. 14 We accordingly set aside ' +
  'the sentence and remit the matter for fresh consideration in accordance ' +
  'with law, keeping all contentions open to both sides.';

const base: SearchResult = {
  judgmentId: 'jdg_test',
  citationCheckId: null,
  caseTitle: 'Mock Party v. Mock State',
  neutralCitation: 'MOCK 2026 EXAMPLE 1',
  reporterCitations: [],
  court: 'Mock SC · 2026',
  judgmentDate: '2026-01-01',
  holding: '',
  operativeParagraph: PASSAGE,
  operativeParagraphNumber: 13,
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
  asOf: '2026-08-06T00:00:00.000Z',
};

/**
 * The exact string the renderer was handed. `props.children` on a `Text` is an
 * array, so comparing it to the source directly passes or fails for the wrong
 * reason — this joins it back before asserting anything about the value.
 */
const renderedText = (match: string): string =>
  ([] as unknown[]).concat(screen.getByText(match).props.children).join('');

/**
 * Every word, in order.
 *
 * "VERBATIM" HERE MEANS THE WORDS, NOT THE BYTES, and the distinction is real:
 * `variant="legal"` runs `theme/legalText.ts`, which is the app's one sanctioned
 * transform of a judgment string — curly quotes, en and em dashes, and
 * non-breaking spaces for widow control, mandated by `DESIGN_SYSTEM.md`
 * §Micro-typography rules 1, 4, 5 and 6. `JudgmentScreen` renders THIS SAME
 * FIELD through the same variant, so the card matching it is consistency rather
 * than a second opinion about the court's words.
 *
 * What must never happen is a word added, removed, reordered or replaced —
 * which is what this compares, and what "do not summarise or paraphrase" means
 * once typography is accounted for.
 */
const words = (s: string): string[] => s.match(/\p{L}+/gu) ?? [];

describe('the passage renders only when the server located it', () => {
  it('draws the passage, labelled with the number the court printed', async () => {
    await render(<ResultCard result={base} />);

    expect(screen.getByText('Operative paragraph · 13')).toBeTruthy();
    expect(screen.getByText(PASSAGE)).toBeTruthy();
  });

  /**
   * THE OCR GATE. Text with no number is the pre-1990s scan case: we hold the
   * words but cannot say where in the judgment they sit.
   */
  it.each([undefined, null] as const)(
    'draws nothing at all when the number is %s, even though the text is there',
    async (operativeParagraphNumber) => {
      await render(<ResultCard result={{ ...base, operativeParagraphNumber }} />);

      expect(screen.queryByText(PASSAGE)).toBeNull();
      expect(screen.queryByText(/Operative paragraph/)).toBeNull();
      expect(screen.queryByText(/Read ¶/)).toBeNull();
    }
  );

  it('draws nothing when there is a number but no passage', async () => {
    await render(<ResultCard result={{ ...base, operativeParagraph: '' }} />);

    expect(screen.queryByText(/Operative paragraph/)).toBeNull();
  });

  it('still renders the rest of the card when the passage is gated out', async () => {
    await render(<ResultCard result={{ ...base, operativeParagraphNumber: null }} />);

    expect(screen.getByText('MOCK 2026 EXAMPLE 1')).toBeTruthy();
    expect(screen.getByText('Mock Party v. Mock State')).toBeTruthy();
  });
});

describe('the passage is verbatim, and truncation never touches it', () => {
  it('adds, drops and reorders no word of the court’s text', async () => {
    await render(<ResultCard result={base} />);

    expect(words(renderedText(PASSAGE))).toEqual(words(PASSAGE));
  });

  it('hands the whole passage to the renderer — no slice, no spliced ellipsis', async () => {
    await render(<ResultCard result={base} />);

    const rendered = renderedText(PASSAGE);
    expect(rendered).not.toContain('…');
    expect(rendered.length).toBeGreaterThanOrEqual(PASSAGE.length);
    // The source's LAST words survive, so nothing was cut off in the DATA.
    // Compared as words: widow control puts a non-breaking space between the
    // final two, which is typography, not a missing sentence.
    expect(words(rendered).slice(-4)).toEqual(['open', 'to', 'both', 'sides']);
  });

  it('elides by line count, which is the platform eliding the display only', async () => {
    await render(<ResultCard result={base} />);

    const node = screen.getByText(PASSAGE);
    expect(node.props.numberOfLines).toBe(4);
    expect(node.props.ellipsizeMode).toBe('tail');
  });

  it('preserves OCR artefacts rather than quietly repairing them', async () => {
    await render(<ResultCard result={base} />);

    // "sen- tence" is a real hyphenated line break out of the scan. Rejoining it
    // would be editing a court's words on a guess about what the scan meant.
    expect(words(renderedText(PASSAGE))).toContain('sen');
    expect(words(renderedText(PASSAGE))).toContain('tence');
  });
});

describe('the passage opens the judgment where it came from', () => {
  it('calls onOpenParagraph with the number the court printed', async () => {
    const onOpenParagraph = jest.fn();
    await render(<ResultCard onOpenParagraph={onOpenParagraph} result={base} />);

    await fireEvent.press(screen.getByLabelText('Read paragraph 13 in full'));

    expect(onOpenParagraph).toHaveBeenCalledWith(13);
  });

  it('offers the route in words, not only as a tap target', async () => {
    await render(<ResultCard result={base} />);

    expect(screen.getByText('Read ¶ 13 in full')).toBeTruthy();
  });

  /** A surface that has not wired the anchor must still open the judgment. */
  it('falls back to the card action rather than swallowing the tap', async () => {
    const onPress = jest.fn();
    await render(<ResultCard onPress={onPress} result={base} />);

    await fireEvent.press(screen.getByLabelText('Read paragraph 13 in full'));

    expect(onPress).toHaveBeenCalled();
  });
});

describe('the evidence block changes nothing about verification', () => {
  /**
   * VERIFIED IS STILL SILENT. The passage is the court's words, not a claim
   * about whether we checked them — adding it must not have added a mark.
   */
  it('draws no verification mark on a verified, good-law card carrying a passage', async () => {
    await render(<ResultCard result={base} />);

    for (const mark of [
      'Do not file this without checking it',
      'Safe to file',
      'Verified',
      'Overruled',
      'Doubted · referred',
    ]) {
      expect(screen.queryByText(mark)).toBeNull();
    }
  });

  it('keeps the unconfirmed mark above the passage on an unconfirmed row', async () => {
    await render(
      <ResultCard result={{ ...base, verificationState: 'unverified', verifiedBySource: 'none' }} />
    );

    expect(screen.getByText('Do not file this without checking it')).toBeTruthy();
    expect(screen.getByText(PASSAGE)).toBeTruthy();
  });

  it('still marks an overruled row that also carries a passage', async () => {
    await render(<ResultCard result={{ ...base, overruledStatus: 'set_aside' }} />);

    expect(screen.getByText('Overruled')).toBeTruthy();
    expect(screen.getByText(PASSAGE)).toBeTruthy();
  });
});
