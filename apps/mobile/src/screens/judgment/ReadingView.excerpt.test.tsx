import { TextInput } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ReadingView } from './ReadingView';
import { api } from '../../api/client';
import { MOCK_JUDGMENTS } from '../../api/fixtures';
import type { JudgmentDetail, JudgmentParagraph } from '../../api/contract';
import { usePractice } from '../../state/practice';
import { useReadingStore } from '../../state/reading';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A PARAGRAPH OVER 4,000 CHARACTERS IS SAVED AS THE EXACT PASSAGE SELECTED.
 * RCC R28, B1 · NEW3 R24 `EXACT_USER_SELECTED_EXCERPT`.
 *
 * ¶ 2 of 2022 INSC 690 is ~5,458 characters. The reader sent it whole and the
 * server refused it (`quote` max 4,000). What is proven here: short paragraphs
 * keep the one-gesture save; long ones send nothing until a selection exists;
 * the payload is `text.slice(start, end)`; and the matter picker receives that
 * same excerpt, never the paragraph.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('expo-speech', () => ({
  getAvailableVoicesAsync: jest.fn(() => Promise.resolve([])),
  speak: jest.fn(),
  stop: jest.fn(),
  isSpeakingAsync: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const createAnnotation = jest.spyOn(api, 'createAnnotation');

const base = Object.values(MOCK_JUDGMENTS)[0] as JudgmentDetail;

/** Distinguishable characters, so a wrong offset is a wrong string, not the same run of 'a'. */
const textOf = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => String.fromCharCode(97 + ((i * 7) % 26))).join('').replace(/^.{4}/, tag);

const LONG = textOf(5458, 'LONG');
const EDGE = textOf(4000, 'EDGE');
const OVER = textOf(4001, 'OVER');

const para = (paragraphIndex: number, text: string): JudgmentParagraph => ({
  paragraphIndex,
  paragraphNumber: paragraphIndex + 1,
  text,
});

const draw = (paragraphs: JudgmentParagraph[]) =>
  render(
    <ReadingView
      judgment={{ ...base, judgmentId: 'jdg_long', caseTitle: 'Long v. State', paragraphs, numberedShare: 1 }}
      onBack={() => {}}
      onOpenJudgment={() => {}}
      onParagraphChange={() => {}}
    />,
  );

const select = (start: number, end: number) =>
  fireEvent(screen.getByTestId('excerpt-source'), 'selectionChange', {
    nativeEvent: { selection: { start, end } },
  });

const sheetButton = (label: string) => {
  const all = screen.getAllByText(label);
  return all[all.length - 1]!;
};

const sentQuotes = () => createAnnotation.mock.calls.map((c) => c[1].quote);

beforeEach(() => {
  createAnnotation.mockReset();
  createAnnotation.mockResolvedValue({
    ok: true,
    data: { annotation: { annotationId: 'ann-x' } },
  } as never);
  jest.spyOn(api, 'annotations').mockResolvedValue({ ok: false, error: { code: 'network', message: '' } } as never);
  useReadingStore.setState({ highlights: [], progress: {}, hydrated: true });
  usePractice.setState({
    matters: [{ matterId: 'mat-1', caseTitle: 'Client v. Other', court: 'Delhi HC' }] as never,
  });
});

describe('the fast path is untouched', () => {
  it.each([
    ['3,999', textOf(3999, 'NEAR')],
    ['4,000', EDGE],
  ])('a %s-character paragraph saves whole on long press, with no selector', async (_, text) => {
    await draw([para(0, text)]);

    await fireEvent(screen.getByText(text), 'longPress');

    expect(screen.queryByTestId('excerpt-source')).toBeNull();
    await waitFor(() => expect(sentQuotes()).toEqual([text]));
  });

  it('"Save to matter" on a short paragraph hands the picker the whole paragraph', async () => {
    await draw([para(0, EDGE)]);

    await fireEvent.press(screen.getByText(EDGE));
    await fireEvent.press(screen.getByText('Save to matter'));
    await fireEvent.press(await screen.findByText('Client v. Other'));

    await waitFor(() => expect(createAnnotation).toHaveBeenCalledTimes(1));
    expect(createAnnotation.mock.calls[0]?.[1]).toMatchObject({ quote: EDGE, matterId: 'mat-1' });
  });
});

describe('a paragraph over 4,000 characters', () => {
  it.each([
    ['4,001', OVER],
    ['5,458', LONG],
  ])('%s: long press opens the selector and sends nothing', async (_, text) => {
    await draw([para(1, text)]);

    await fireEvent(screen.getByText(text), 'longPress');

    expect(await screen.findByText('Select the exact passage you want to save.')).toBeTruthy();
    expect(screen.getByTestId('excerpt-count')).toHaveTextContent('0 / 4000');
    expect(createAnnotation).not.toHaveBeenCalled();
  });

  it('nothing is preselected: Save is disabled until a selection exists', async () => {
    await draw([para(1, LONG)]);
    await fireEvent(screen.getByText(LONG), 'longPress');
    await screen.findByTestId('excerpt-source');

    await fireEvent.press(sheetButton('Save passage'));

    expect(createAnnotation).not.toHaveBeenCalled();
    expect(sheetButton('Save passage')).toBeDisabled();
  });

  it.each([
    [1, 2],
    [100, 4100],
  ])('a %i..%i selection enables Save and sends exactly text.slice(start, end)', async (start, end) => {
    await draw([para(1, LONG)]);
    await fireEvent(screen.getByText(LONG), 'longPress');
    await screen.findByTestId('excerpt-source');

    await select(start, end);
    expect(screen.getByTestId('excerpt-count')).toHaveTextContent(`${end - start} / 4000`);
    expect(sheetButton('Save passage')).toBeEnabled();
    await fireEvent.press(sheetButton('Save passage'));

    await waitFor(() => expect(createAnnotation).toHaveBeenCalledTimes(1));
    const body = createAnnotation.mock.calls[0]![1];
    expect(body.quote).toBe(LONG.slice(start, end));
    expect(body.quote).not.toBe(LONG);
    expect(body).toMatchObject({ paragraphIndex: 1, paragraphNumber: 2 });
    expect(body.matterId).toBeUndefined();
  });

  it('a 4,001-character selection disables Save, says why in product copy, and sends nothing', async () => {
    await draw([para(1, LONG)]);
    await fireEvent(screen.getByText(LONG), 'longPress');
    await screen.findByTestId('excerpt-source');

    await select(10, 4011);
    await fireEvent.press(sheetButton('Save passage'));
    await fireEvent.press(sheetButton('Save to matter'));

    expect(sheetButton('Save passage')).toBeDisabled();
    expect(sheetButton('Save to matter')).toBeDisabled();
    expect(screen.getByText('Select up to 4,000 characters.')).toBeTruthy();
    expect(screen.queryByText(/String must contain|character\(s\)/)).toBeNull();
    expect(createAnnotation).not.toHaveBeenCalled();
    expect(useReadingStore.getState().highlights).toEqual([]);
  });

  it('an edit to the field clears the selection — typed text can never become the quote', async () => {
    await draw([para(1, LONG)]);
    await fireEvent(screen.getByText(LONG), 'longPress');
    await screen.findByTestId('excerpt-source');

    await select(5, 50);
    await fireEvent(screen.getByTestId('excerpt-source'), 'change', {
      nativeEvent: { text: 'typed words' },
    });

    expect(sheetButton('Save passage')).toBeDisabled();
    expect(screen.getByTestId('excerpt-source').props.value).toBe(LONG);
  });

  it('"Save to matter" from the action row: the picker receives the SAME excerpt, never the paragraph', async () => {
    await draw([para(1, LONG)]);
    await fireEvent.press(screen.getByText(LONG));
    await fireEvent.press(screen.getByText('Save to matter'));
    await screen.findByTestId('excerpt-source');

    await select(2000, 2600);
    await fireEvent.press(sheetButton('Save to matter'));
    await fireEvent.press(await screen.findByText('Client v. Other'));

    await waitFor(() => expect(createAnnotation).toHaveBeenCalledTimes(1));
    const body = createAnnotation.mock.calls[0]![1];
    expect(body).toMatchObject({
      quote: LONG.slice(2000, 2600),
      matterId: 'mat-1',
      paragraphIndex: 1,
      paragraphNumber: 2,
    });
    expect(sentQuotes()).not.toContain(LONG);
  });

  it('long press, then "Save to matter" inside the selector reaches the picker with the excerpt', async () => {
    await draw([para(1, LONG)]);
    await fireEvent(screen.getByText(LONG), 'longPress');
    await screen.findByTestId('excerpt-source');

    await select(4500, 5458);
    await fireEvent.press(sheetButton('Save to matter'));
    await fireEvent.press(await screen.findByText('Client v. Other'));

    await waitFor(() => expect(createAnnotation).toHaveBeenCalledTimes(1));
    expect(createAnnotation.mock.calls[0]![1]).toMatchObject({
      quote: LONG.slice(4500, 5458),
      matterId: 'mat-1',
    });
  });

  it('collapsing the selection to nothing disables Save again', async () => {
    await draw([para(1, LONG)]);
    await fireEvent(screen.getByText(LONG), 'longPress');
    await screen.findByTestId('excerpt-source');
    await select(0, 10);

    await fireEvent(screen.getByTestId('excerpt-source'), 'selectionChange', {
      nativeEvent: { selection: { start: 3, end: 3 } },
    });

    expect(sheetButton('Save passage')).toBeDisabled();
    expect(createAnnotation).not.toHaveBeenCalled();
  });
});

/**
 * RCC R29, defect 3. On the S24 the field opened on the paragraph's LAST lines,
 * and a reverted paste came back with tighter line spacing. Both are native
 * (RN 0.86 `ReactEditText.maybeSetText`), so what is provable here is the
 * mechanism: the field is put back at offset 0 without selecting anything, and
 * a native change rebuilds the input rather than patching it in place.
 */
describe('open position and revert', () => {
  /** The Jest TextInput mock omits `setSelection`; the RN 0.86 instance has it. */
  const setSelectionSpy = jest.fn();
  beforeEach(() => {
    setSelectionSpy.mockReset();
    (TextInput.prototype as unknown as { setSelection: jest.Mock }).setSelection = setSelectionSpy;
  });

  const textLaidOut = (node: ReturnType<typeof screen.getByTestId>) =>
    fireEvent(node, 'contentSizeChange', { nativeEvent: { contentSize: { width: 380, height: 4000 } } });

  it('positioning the caret once the text is laid out selects nothing: 0 / 4000 and Save disabled', async () => {
    await draw([para(1, LONG)]);
    await fireEvent(screen.getByText(LONG), 'longPress');
    const field = await screen.findByTestId('excerpt-source');

    await textLaidOut(field);
    await textLaidOut(field);
    expect(setSelectionSpy.mock.calls).toEqual([[0, 0]]);
    await select(0, 0);

    expect(screen.getByTestId('excerpt-count')).toHaveTextContent('0 / 4000');
    expect(sheetButton('Save passage')).toBeDisabled();
    expect(sheetButton('Save to matter')).toBeDisabled();
  });

  it('a native change remounts the field with the canonical source, and selection still works after', async () => {
    await draw([para(1, LONG)]);
    await fireEvent(screen.getByText(LONG), 'longPress');
    const before = await screen.findByTestId('excerpt-source');

    await select(5, 50);
    await fireEvent(before, 'change', { nativeEvent: { text: 'pasted words' } });

    const after = screen.getByTestId('excerpt-source');
    expect(after).not.toBe(before);
    await textLaidOut(after);
    expect(setSelectionSpy).toHaveBeenLastCalledWith(0, 0);
    expect(after.props.value).toBe(LONG);
    expect(sheetButton('Save passage')).toBeDisabled();

    await select(100, 200);
    await fireEvent.press(sheetButton('Save passage'));
    await waitFor(() => expect(createAnnotation).toHaveBeenCalledTimes(1));
    expect(sentQuotes()).toEqual([LONG.slice(100, 200)]);
  });
});
