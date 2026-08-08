import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { ChevronLeft, Search, SlidersHorizontal, X } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Toast } from '../../components/Toast';
import type { JudgmentDetail, JudgmentParagraph } from '../../api/contract';
import { useJudgmentSpeech } from '../../hooks/useJudgmentSpeech';
import { useHighlightsFor, useReadingStore, type Highlight } from '../../state/reading';
import { useLanguageStore } from '../../state/language';
import { easing } from '../../theme/easing';
import { haptics } from '../../theme/haptics';
import { color, radius, space, state } from '../../theme/tokens';
import { findInJudgment, matchLabel, stepMatch } from './findInJudgment';
import { MatterPicker } from './MatterPicker';
import { ReadingControls } from './ReadingControls';
import { ReadingSheet } from './ReadingSheet';

/**
 * THE JUDGMENT READING VIEW — PD-9, all six, in priority order.
 *
 *   1. paragraph anchors, tappable and linkable, in a FIXED 22px GUTTER
 *   2. jump to any paragraph cited elsewhere
 *   3. highlight and save a passage to a matter
 *   4. in-text search that jumps between PARAGRAPHS, not scroll positions
 *   5. adjustable text size expressed as WORDS PER SCREEN
 *   6. reading progress across sessions, INCLUDING OFFLINE
 *
 * Paragraph anchors are first because advocates cite by paragraph. Without them
 * the reading view is decorative.
 *
 * The gutter is fixed so THE TEXT EDGE STAYS TRUE as numbers go from 9 to 10 to
 * 100. A gutter that grows with the number makes the column of prose wander,
 * which is exactly the kind of thing that reads as amateur on a page an
 * advocate is comparing against a printed reporter.
 *
 * `renders/62-judgment-reading@2x.png`, canvas `11e`. Inventory rows 83–85.
 */

/**
 * The control bar's own height: one 44px target plus the glass padding above
 * and below it. Declared rather than measured because it is reserved BEFORE the
 * bar lays out — content that reflows once the bar appears is the jump this
 * clearance exists to prevent.
 */
const CONTROL_BAR_HEIGHT = 60;

/**
 * Below this share of numbered paragraphs the gutter is hidden entirely rather
 * than shown half-empty. 0.5 is where LCC's measurement across 1964–2023 put
 * the break: 11 of 15 judgments were above it, and numbering was monotonic in
 * every one of those.
 */
const NUMBERED_SHARE_FLOOR = 0.5;

type Props = {
  judgment: JudgmentDetail;
  onBack: () => void;
  onOpenJudgment: (judgmentId: string) => void;
  /** `?para=` — the anchor an advocate was sent, or came back to. */
  openParagraph?: number;
  onParagraphChange: (paragraphNumber: number) => void;
};

export function ReadingView({
  judgment,
  onBack,
  onOpenJudgment,
  openParagraph,
  onParagraphChange,
}: Props) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<JudgmentParagraph>>(null);

  /**
   * Room reserved at the foot of the screen for the floating control bar.
   * One control height plus its glass padding — the last paragraph and the
   * anchor hint must both clear it, or the bar hides the thing it sits over.
   */
  const controlsClearance = CONTROL_BAR_HEIGHT + insets.bottom + space.md;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState('');
  const [hitIndex, setHitIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [pickerFor, setPickerFor] = useState<JudgmentParagraph | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const textSize = useReadingStore((s) => s.textSize);
  const setProgress = useReadingStore((s) => s.setProgress);
  const addHighlight = useReadingStore((s) => s.addHighlight);
  const progress = useReadingStore((s) => s.progress[judgment.judgmentId]);
  const highlights = useHighlightsFor(judgment.judgmentId);
  const highlighted = useMemo(
    () => new Set(highlights.map((h) => h.paragraphNumber)),
    [highlights]
  );

  /**
   * ONE PATH FOR EVERY SAVE, WHETHER OR NOT A MATTER WAS PICKED.
   *
   * `matterId` absent is always allowed — saving the passage on its own,
   * `services/api/src/judgments/annotations.ts`'s own module note: "an
   * advocate has every reason to highlight the paragraph that was set
   * aside, and blocking that would teach them the product is broken rather
   * than careful." Only the matter ATTACH can be refused, and the store
   * reports that refusal here rather than swallowing it.
   */
  const saveHighlight = useCallback(
    async (paragraph: JudgmentParagraph, matterId?: string) => {
      if (paragraph.paragraphNumber === null) return;
      haptics.commit();
      const highlight: Highlight = {
        judgmentId: judgment.judgmentId,
        paragraphIndex: paragraph.paragraphIndex,
        paragraphNumber: paragraph.paragraphNumber,
        text: paragraph.text,
        savedAt: new Date().toISOString(),
        matterId,
      };
      const result = await addHighlight(highlight);
      if (!result.ok) setToastMessage(result.message);
    },
    [addHighlight, judgment.judgmentId]
  );

  /**
   * The text-size dip — down over 120ms, back over 160ms.
   *
   * ASYMMETRIC ON PURPOSE, and the longer half is the return: going dim is the
   * cost of the change and should be paid quickly, coming back is the advocate
   * getting their judgment returned to them at the new size.
   *
   * Skipped on first render, or every judgment would open by fading in from
   * half — the text size did not change, the screen did.
   */
  const dip = useSharedValue(1);
  const knownTextSize = useRef(textSize);

  useEffect(() => {
    if (knownTextSize.current === textSize) return;
    knownTextSize.current = textSize;
    dip.value = withSequence(
      withTiming(0.5, { duration: 120, easing: easing.out }),
      withTiming(1, { duration: 160, easing: easing.out })
    );
  }, [textSize, dip]);

  const dipStyle = useAnimatedStyle(() => ({ opacity: dip.value }));

  /**
   * A LINK WINS OVER A SAVED POSITION. If an advocate was sent "¶ 17 of this
   * judgment" they are opening it to read ¶ 17, not to resume where they were
   * last week — and the saved position is still there when they come back
   * without the anchor.
   */
  /**
   * IDENTITY IS THE INDEX. THE PRINTED NUMBER IS FOR CITING.
   *
   * A printed paragraph number is nullable — a judgment's header block has
   * none, and older OCR'd reports lose their numbering entirely. Keying the
   * reading position on it means the view cannot address the rows that have no
   * number, which includes the first row of every judgment the server returns.
   *
   * So everything internal — reading position, scroll target, progress, speech
   * — runs on `index`, which is always present. The number is converted back at
   * the two boundaries that genuinely need something citable: the URL anchor
   * and a saved highlight.
   */
  const indexOfNumber = useCallback(
    (n: number) => judgment.paragraphs.findIndex((p) => p.paragraphNumber === n),
    [judgment.paragraphs]
  );

  const [current, setCurrent] = useState(() => {
    // A link wins over a saved position: an advocate sent "¶ 17" is opening it
    // to read ¶ 17, not to resume last week. The saved position survives for
    // when they return without the anchor.
    if (openParagraph !== undefined) {
      const i = judgment.paragraphs.findIndex((p) => p.paragraphNumber === openParagraph);
      if (i >= 0) return i;
    }
    if (progress?.paragraphNumber !== undefined) {
      const i = judgment.paragraphs.findIndex((p) => p.paragraphNumber === progress.paragraphNumber);
      if (i >= 0) return i;
    }
    return 0;
  });

  /** The printed number of the row being read, or null where it has none. */
  const currentNumber = judgment.paragraphs[current]?.paragraphNumber ?? null;

  /**
   * IN-TEXT SEARCH JUMPS BETWEEN PARAGRAPHS, NOT SCROLL POSITIONS. An advocate
   * looking for a word wants the next paragraph that argues it, not the next
   * pixel offset where the string happens to appear.
   *
   * The matching moved to `findInJudgment.ts` — a pure module — for three
   * reasons the inline version got wrong:
   *
   *   · IT COUNTED PARAGRAPHS AND CALLED THEM MATCHES. A paragraph naming an
   *     authority four times counted once, so "3 of 12" understated the
   *     judgment and stepping skipped occurrences the advocate could see on
   *     screen.
   *   · A ONE-CHARACTER QUERY MATCHED ALMOST EVERY PARAGRAPH, dimmed nothing,
   *     and offered a step through the alphabet.
   *   · `.toLowerCase()` on the haystack is not length-preserving for every
   *     input, so any future highlight built on those offsets would slice the
   *     wrong characters — and in Devanagari, mid-grapheme.
   */
  const found = useMemo(() => findInJudgment(judgment.paragraphs, term), [judgment.paragraphs, term]);

  /** Distinct paragraphs containing a match — what the dimming reads. */
  const hitParagraphs = useMemo(() => new Set(found.paragraphIndexes), [found.paragraphIndexes]);
  const currentHitParagraph = found.matches[hitIndex]?.paragraphIndex ?? null;


  /**
   * An explicit jump OUTRANKS the scroll position it causes.
   *
   * Without this, `onViewableItemsChanged` fires mid-scroll and overwrites the
   * target with whatever happened to be at the top — so asking for ¶ 17 leaves
   * the header, the URL and the saved position all reading ¶ 10. The guard
   * holds until the target is genuinely on screen.
   */
  const jumpTarget = useRef<number | null>(null);

  /**
   * paragraph number → its measured y offset in the list.
   *
   * Filled by each row as it lays out. This is the only source of truth for
   * where a paragraph actually is; everything else is an average pretending to
   * be a position.
   */
  const heights = useRef(new Map<number, number>());
  /** A jump that had to use the estimate, waiting for its row to be measured. */
  const pendingJump = useRef<number | null>(null);

  /**
   * ROW HEIGHTS, NOT ROW POSITIONS.
   *
   * `onLayout`'s `y` is measured against the view's PARENT, and inside a
   * FlatList every row's parent is its own cell — so `y` is ~0 for every
   * paragraph in the judgment. Storing it as a list offset made
   * `scrollToOffset` a no-op that always scrolled to the top, which is why
   * speech could reach ¶ 18 with the screen still showing ¶ 1.
   *
   * `height` is parent-independent and therefore correct. Offsets are the
   * running sum of the heights before a row, which is exact for every row
   * whose predecessors have all been laid out, and honestly absent otherwise.
   */
  const measure = useCallback((index: number, height: number) => {
    heights.current.set(index, height);
    if (pendingJump.current === index) {
      pendingJump.current = null;
    }
  }, []);

  /**
   * Sums the heights of the rows before `index`. Returns undefined if any row in
   * front of it has not been laid out — a partial sum would be a confident
   * wrong number, which is what the previous implementation shipped.
   */
  const offsetOf = useCallback((index: number): number | undefined => {
    let total = 0;
    for (let i = 0; i < index; i += 1) {
      const h = heights.current.get(i);
      if (h === undefined) return undefined;
      total += h;
    }
    return total;
  }, []);

  /**
   * Moves the reading position to a row.
   *
   * `fromTap` distinguishes an advocate choosing a paragraph from speech
   * walking through them: only the former writes the anchor into the URL, and
   * only a row that HAS a printed number can be written there at all — an
   * unnumbered header is not a citable location.
   */
  const goTo = useCallback(
    (index: number, { fromTap }: { fromTap: boolean }) => {
      const paragraph = judgment.paragraphs[index];
      if (!paragraph) return;
      jumpTarget.current = index;

      /**
       * SCROLL BY SUMMED HEIGHT WHERE IT IS KNOWN, BY INDEX WHERE IT IS NOT.
       *
       * The summed height is exact. `scrollToIndex` is computed from an average
       * and lands close, and `onScrollToIndexFailed` widens the window so it can
       * land at all — see the handler on the list.
       */
      const offset = offsetOf(index);
      if (offset !== undefined) {
        listRef.current?.scrollToOffset({ offset, animated: true });
      } else {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
        pendingJump.current = index;
      }

      setCurrent(index);
      if (paragraph.paragraphNumber !== null) setProgress(judgment.judgmentId, paragraph.paragraphNumber);
      if (fromTap && paragraph.paragraphNumber !== null) onParagraphChange(paragraph.paragraphNumber);
    },
    [judgment.paragraphs, judgment.judgmentId, offsetOf, onParagraphChange, setProgress]
  );

  const jumpTo = useCallback((index: number) => goTo(index, { fromTap: true }), [goTo]);

  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  /**
   * SPEECH FOLLOWS THE READER THROUGH THE SAME MACHINERY AS EVERYTHING ELSE.
   *
   * It moves `current`, scrolls by measured offset and saves progress — so the
   * reading position, the dimming, the "¶ 11 of 28" counter and the resume
   * point are all one state rather than a second highlight running alongside.
   *
   * IT DELIBERATELY DOES NOT CALL `onParagraphChange`. That writes the anchor
   * into the URL, which is right for a tap — an advocate choosing a paragraph
   * to link — and wrong for speech, which would rewrite the route dozens of
   * times during one listen and bury the anchor they actually chose.
   */
  const followSpeech = useCallback((index: number) => goTo(index, { fromTap: false }), [goTo]);

  const speech = useJudgmentSpeech({
    paragraphs: judgment.paragraphs,
    onParagraph: followSpeech,
  });

  /** Keeps the stable callback below pointed at the current judgment. */
  const setProgressRef = useRef((n: number) => setProgress(judgment.judgmentId, n));
  setProgressRef.current = (n: number) => setProgress(judgment.judgmentId, n);

  /**
   * FlatList captures this callback once, so it must not be recreated between
   * renders. It reads live values through refs rather than closing over state.
   */
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { item: JudgmentParagraph }[] }) => {
      // Indices, not printed numbers — an unnumbered header is still a row the
      // reading position has to be able to sit on.
      const visible = viewableItems.map((v) => v.item?.paragraphIndex).filter((n) => n !== undefined);
      if (!visible.length) return;

      const target = jumpTarget.current;
      if (target !== null) {
        // Still travelling. Once the target is on screen the jump is done and
        // ordinary scrolling takes over again.
        if (visible.includes(target)) jumpTarget.current = null;
        return;
      }

      const first = visible[0];
      if (first === undefined) return;
      setCurrent(first);
      setProgressRef.current(first);
    }
  ).current;

  /**
   * RESTORING THE PLACE IS A JUMP, NOT AN INITIAL VALUE.
   *
   * Seeding `current` from storage is not enough: the list still mounts at the
   * top, and the first viewability event then overwrites the saved paragraph
   * with ¶ 1 — so the place is lost precisely by opening the judgment to use
   * it. Scrolling there sets the jump guard as a side effect, which is what
   * keeps it.
   *
   * It waits for `hydrated` because the read is asynchronous; on a cold start
   * the store is empty at first render.
   */
  const hydrated = useReadingStore((s) => s.hydrated);
  const restored = useRef(false);

  useEffect(() => {
    if (!hydrated || restored.current) return;
    restored.current = true;
    const saved = useReadingStore.getState().progress[judgment.judgmentId]?.paragraphNumber;
    const target = openParagraph ?? saved;
    const first = judgment.paragraphs[0]?.paragraphNumber;
    if (target && target !== first) jumpTo(target);
  }, [hydrated, judgment.judgmentId, judgment.paragraphs, jumpTo, openParagraph]);

  /**
   * Steps to the next OCCURRENCE and jumps to the PARAGRAPH holding it.
   *
   * Two occurrences in one paragraph are two steps that land on the same row —
   * correct, and the counter is what tells the advocate they moved. Stepping by
   * paragraph instead would silently skip the second mention of an authority in
   * the paragraph that discusses it most, which is the paragraph they were
   * looking for.
   */
  const step = (delta: 1 | -1) => {
    const total = found.matches.length;
    if (!total) return;
    const next = stepMatch(total, hitIndex, delta);
    const match = found.matches[next];
    if (!match) return;
    setHitIndex(next);
    haptics.shift();
    jumpTo(match.paragraphIndex);
  };

  const readRatio = judgment.paragraphs.length
    ? (current + 1) / judgment.paragraphs.length
    : 0;

  /**
   * ANCHORS ARE HIDDEN WHOLESALE WHEN THE JUDGMENT IS MOSTLY UNNUMBERED.
   *
   * A gutter of mostly-blank anchor slots reads as a rendering fault, and the
   * few numbers that do survive invite citing by position — which is the exact
   * error the nullable number exists to prevent. Below the threshold the
   * judgment is still perfectly readable; it simply has nothing citable to
   * offer, and saying so by omission is honest.
   *
   * Measured across 1964–2023, 11 of 15 judgments sat above 0.5.
   */
  const showAnchors = judgment.numberedShare >= NUMBERED_SHARE_FLOOR;

  return (
    <Screen>
      {/*
        THE TOP CHROME CLEARS THE STATUS BAR, AND NOTHING WAS MAKING IT.
        Observed on a Galaxy S24 on the judgment screen's loading state: the
        app draws edge to edge, and a bar with only its own padding sits under
        the clock. Same fix here, on both the nav row and the find bar, before
        the same lesson has to be learned a fourth time.
      */}
      {searching ? (
        <View style={[styles.searchBar, { paddingTop: insets.top + space.xs }]}>
          <View style={styles.searchField}>
            <Input
              autoFocus
              label="Find in judgment"
              onChangeText={(t) => {
                setTerm(t);
                setHitIndex(0);
              }}
              placeholder="Find in this judgment"
              value={term}
            />
          </View>
          <View style={styles.searchControls}>
            {/*
              "NOT IN THIS JUDGMENT" IS A CLAIM ABOUT THE JUDGMENT, and it must
              not be made about a query we declined to run. A single character
              matches thousands of times in a judgment of this length, so it is
              rejected rather than searched — and saying "not in this judgment"
              there would be a false statement about the text in front of the
              advocate.
            */}
            <Text variant="ui" style={styles.hitCount}>
              {found.tooShort
                ? term.trim()
                  ? 'Keep typing'
                  : ''
                : found.matches.length === 0
                  ? 'Not in this judgment'
                  : `${matchLabel(hitIndex, found.matches.length)} in this judgment`}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => step(-1)}>
              <Text variant="uiStrong" style={styles.stepLabel}>
                Previous
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => step(1)}>
              <Text variant="uiStrong" style={styles.stepLabel}>
                Next
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Close find"
              accessibilityRole="button"
              onPress={() => {
                setSearching(false);
                setTerm('');
              }}
            >
              <X color={color.ink} size={20} strokeWidth={1.5} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.nav, { paddingTop: insets.top + space.xs }]}>
          <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack}>
            <ChevronLeft color={color.ink} size={22} strokeWidth={1.5} />
          </Pressable>
          <Text variant="legal" style={styles.navTitle}>
            {judgment.caseTitle}
          </Text>
          <Pressable
            accessibilityLabel="Find in judgment"
            accessibilityRole="button"
            onPress={() => setSearching(true)}
          >
            <Search color={color.ink} size={20} strokeWidth={1.5} />
          </Pressable>
          <Pressable
            accessibilityLabel="Reading options"
            accessibilityRole="button"
            onPress={() => setSheetOpen(true)}
          >
            <SlidersHorizontal color={color.ink} size={20} strokeWidth={1.5} />
          </Pressable>
        </View>
      )}

      {/* Progress: a 2px oxblood rule, the one accent this screen spends. */}
      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(readRatio * 100)}%` }]} />
        </View>
        {/*
          THE PILCROW IS A CLAIM, SO IT ONLY APPEARS WITH A REAL NUMBER.
          `¶ 0` is not a paragraph an advocate can cite or find — it was the
          index leaking into a field that means "printed number". On an
          unnumbered row the counter falls back to plain position, which is
          honest about being a place in the document rather than a citation.
        */}
        <Text opticalNudge variant="record">
          {currentNumber === null
            ? `${current + 1} of ${judgment.paragraphs.length}`
            : `¶ ${currentNumber} of ${judgment.paragraphs.length}`}
        </Text>
      </View>

      {/*
        THE TEXT-SIZE DIP.

        `fontSize` is NOT animated, and must not be: it is neither a transform
        nor an opacity, every frame reflows the entire judgment, and on a Redmi
        that is a visible stutter through the one interaction whose whole
        purpose is comfort. Instead the list dips to half opacity, the new size
        lays out behind the dip where nobody can see it reflow, and it comes
        back up. The advocate perceives a settle rather than a jump — and never
        sees the text reflowing.

        KEPT UNDER REDUCE MOTION. It is pure opacity and it aids comprehension:
        without it the judgment silently changes size under the thumb, which is
        more disorienting, not less.
      */}
      <Animated.View style={[styles.listHost, dipStyle]}>
        <FlatList
        contentContainerStyle={styles.list}
        data={judgment.paragraphs}
        /**
         * KEYED ON THE INDEX, NOT THE PRINTED NUMBER.
         *
         * `String(p.paragraphNumber)` was correct while the number was required. It is
         * not now: every unnumbered row keys to the string "null", so a
         * judgment with two unnumbered paragraphs hands FlatList duplicate keys
         * — rows are dropped, reused against the wrong content, and the
         * measured heights `offsetOf` depends on are recorded against whichever
         * row won. At `numberedShare` 0.5 that is half the judgment.
         *
         * Introduced by the nullable-number change and caught while reworking
         * the search over the same rows. `index` is always present and unique,
         * which is the whole reason it exists.
         */
        keyExtractor={(p) => String(p.paragraphIndex)}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          /**
           * RETRYING THE SAME CALL CANNOT WORK, AND USED TO BE WHAT THIS DID.
           *
           * `scrollToIndex` fails when the row is outside the rendered window,
           * and a judgment is long enough that most of it always is. Retrying
           * fails identically, because nothing between the two attempts caused
           * the row to render — so the jump was silently dropped.
           *
           * Observed with speech, which is where it actually bites: the voice
           * reached ¶ 10 while the screen sat on ¶ 1, because each unrendered
           * row failed to scroll, so no further rows rendered, so no further
           * offsets were ever measured. A closed loop.
           *
           * `averageItemLength` is FlatList's own estimate at the moment of
           * failure. Jumping to it renders rows around the target, which lets
           * the exact `scrollToIndex` land on the retry — and `measure()` then
           * records the true offset for next time.
           */
          listRef.current?.scrollToOffset({
            offset: index * averageItemLength,
            animated: false,
          });
          setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 80);
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        ref={listRef}
        renderItem={({ item }) => (
          <Paragraph
            dimmed={
              // Non-matching paragraphs stay at 50% so the eye lands on the hit.
              // Compared by INDEX, never by object identity: a re-fetch of the
              // same judgment produces equal rows that are not the same objects,
              // and identity comparison would silently dim every paragraph.
              (!found.tooShort && found.matches.length > 0 && !hitParagraphs.has(item.paragraphIndex)) ||
              (!term && item.paragraphIndex !== current)
            }
            highlighted={item.paragraphNumber !== null && highlighted.has(item.paragraphNumber)}
            isCurrentHit={currentHitParagraph === item.paragraphIndex}
            onMeasure={measure}
            showAnchor={showAnchors && item.paragraphNumber !== null}
            onLink={() => {
              /**
               * ONLY A NUMBERED PARAGRAPH IS A LINK. An unnumbered header has
               * no citable location, so tapping it moves the reading position
               * without writing an anchor nobody could cite back.
               */
              haptics.commit();
              setSelected(item.paragraphIndex);
              if (item.paragraphNumber !== null) onParagraphChange(item.paragraphNumber);
            }}
            onOpenCited={
              item.citesJudgmentId ? () => onOpenJudgment(item.citesJudgmentId!) : undefined
            }
            onCopy={() => {
              void Clipboard.setStringAsync(item.text);
              setToastMessage('Copied.');
            }}
            onLinkCopy={() => {
              void Clipboard.setStringAsync(`${judgment.caseTitle} ¶ ${item.paragraphNumber}`);
              setToastMessage('Copied.');
            }}
            onPickMatter={item.paragraphNumber === null ? undefined : () => setPickerFor(item)}
            onSaveToMatter={
              /**
               * A HIGHLIGHT IS A CITATION, SO IT NEEDS A CITABLE PARAGRAPH.
               * PD-9 item 3 saves a passage to a matter, where it is quoted with
               * "¶ n". An unnumbered row has no n, and saving it under an index
               * would put a fabricated paragraph reference into a matter file.
               * The action is simply not offered there.
               *
               * NO MATTER ID HERE — this is the long-press shortcut, "save the
               * passage on its own." The action row's own "Save to matter"
               * button opens the picker (`onPickMatter`) instead.
               */
              item.paragraphNumber === null ? undefined : () => void saveHighlight(item)
            }
            paragraph={item}
            selected={selected === item.paragraphIndex}
            textSize={textSize}
          />
        )}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        />
      </Animated.View>

      <Text variant="ui" style={[styles.hint, { paddingBottom: controlsClearance }]}>
        Paragraph numbers are anchors — tap one to link it.
      </Text>

      {/*
        `box-none` so the host itself never swallows a tap meant for the
        judgment underneath — only the bar's own controls are targets. Floating
        chrome must not quietly steal a third of the reading surface.
      */}
      {/*
        THE BAR SITS ABOVE THE SYSTEM NAV BAR, NOT ON IT.
        A fixed bottom offset put the controls under Android's gesture/nav bar
        and on top of the anchor hint — observed on a Galaxy S24. The inset is
        the only honest source for how much room the system is taking, and it
        differs per device, which is exactly why it cannot be a constant.
      */}
      <View
        pointerEvents="box-none"
        style={[styles.controlsHost, { bottom: insets.bottom + space.md }]}
      >
        <ReadingControls
          language={language}
          onAnnotate={
            /**
             * Same rule as the row action: a highlight is quoted as "¶ n", so
             * an unnumbered row has nothing to save it under. The control is
             * disabled there rather than saving under a position.
             */
            currentNumber === null
              ? undefined
              : () => {
                  const paragraph = judgment.paragraphs[current];
                  if (paragraph) void saveHighlight(paragraph);
                }
          }
          onTextSize={() => setSheetOpen(true)}
          onToggleLanguage={() => setLanguage(language === 'en' ? 'hi' : 'en')}
          onToggleListen={() => speech.toggle(current)}
          speaking={speech.speaking}
          speechAvailability={speech.availability}
        />
      </View>

      <ReadingSheet
        highlightCount={highlights.length}
        judgment={judgment}
        onDismiss={() => setSheetOpen(false)}
        onJumpToParagraph={(n) => {
          setSheetOpen(false);
          jumpTo(n);
        }}
        visible={sheetOpen}
      />

      <MatterPicker
        onDismiss={() => setPickerFor(null)}
        onPick={(matterId) => {
          if (pickerFor) void saveHighlight(pickerFor, matterId);
        }}
        visible={pickerFor !== null}
      />

      <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
    </Screen>
  );
}

function Paragraph({
  paragraph,
  textSize,
  dimmed,
  selected,
  highlighted,
  isCurrentHit,
  onLink,
  onSaveToMatter,
  onPickMatter,
  onCopy,
  onLinkCopy,
  onOpenCited,
  onMeasure,
  showAnchor,
}: {
  paragraph: JudgmentParagraph;
  textSize: number;
  dimmed: boolean;
  selected: boolean;
  highlighted: boolean;
  isCurrentHit: boolean;
  onLink: () => void;
  /** Absent where the paragraph has no printed number to save it under. Saves WITHOUT a matter. */
  onSaveToMatter?: () => void;
  /** Opens the matter picker. Same nullability as `onSaveToMatter`. */
  onPickMatter?: () => void;
  onCopy: () => void;
  onLinkCopy: () => void;
  onOpenCited?: () => void;
  /** Reports this row's measured HEIGHT once the list has laid it out. */
  onMeasure: (index: number, height: number) => void;
  /** False for an unnumbered row, or for a judgment that is mostly unnumbered. */
  showAnchor: boolean;
}) {
  return (
    <View
      onLayout={(e) => onMeasure(paragraph.paragraphIndex, e.nativeEvent.layout.height)}
      style={styles.paragraphRow}
    >
      {/*
        The anchor. Fixed 22px gutter — see the note at the top of this file.
        THE GUTTER IS KEPT EVEN WHEN THE NUMBER IS NOT, so the text edge stays
        true down the page; only the number is withheld. A column that shifts
        left on unnumbered rows would wander exactly where a printed reporter
        does not.
      */}
      <Pressable
        accessibilityLabel={
          paragraph.paragraphNumber === null ? 'Paragraph' : `Paragraph ${paragraph.paragraphNumber}`
        }
        accessibilityRole="button"
        onPress={onLink}
      >
        <View style={styles.gutter}>
          {showAnchor ? (
            <Text opticalNudge variant="record" style={styles.anchor}>
              {paragraph.paragraphNumber}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.paragraphBody}>
        <Pressable accessibilityRole="button" onLongPress={onSaveToMatter} onPress={onLink}>
          <Text
            variant="legal"
            style={[
              { fontSize: textSize, lineHeight: textSize * 1.68 },
              dimmed && styles.dimmed,
              highlighted && styles.highlighted,
              isCurrentHit && styles.currentHit,
            ]}
          >
            {paragraph.text}
          </Text>
        </Pressable>

        {onOpenCited ? (
          <Pressable accessibilityRole="link" onPress={onOpenCited}>
            <Text variant="ui" style={styles.citedLink}>
              Open the judgment cited here
            </Text>
          </Pressable>
        ) : null}

        {selected ? (
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onPickMatter}>
              <View style={styles.actionSolid}>
                <Text variant="ui">Save to matter</Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onCopy}>
              <View style={styles.actionGhost}>
                <Text variant="ui">Copy ¶ {paragraph.paragraphNumber}</Text>
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onLinkCopy}>
              <View style={styles.actionGhost}>
                <Text variant="ui">Link</Text>
              </View>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  navTitle: { flex: 1 },
  searchBar: { paddingHorizontal: space.sm, paddingTop: space.xs, gap: space.xs },
  searchField: { flex: 1 },
  searchControls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  hitCount: { flex: 1, color: color.inkMuted },
  stepLabel: { color: color.oxblood },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingBottom: space.xs,
  },
  progressTrack: { flex: 1, height: 2, backgroundColor: color.hairline },
  progressFill: { height: 2, backgroundColor: color.oxblood },

  /** The dip host must fill, or wrapping the list in it collapses the list. */
  listHost: { flex: 1 },
  list: { paddingHorizontal: space.sm, paddingBottom: space.xxl },
  paragraphRow: {
    flexDirection: 'row',
    gap: space.xs,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  /** FIXED. Never sized to the number. */
  gutter: { width: 22, alignItems: 'flex-end' },
  anchor: { color: color.oxblood },
  paragraphBody: { flex: 1, gap: space.xs },
  /** Neighbours drop to 50% so the current paragraph is the one being read. */
  dimmed: { opacity: 0.5 },
  /**
   * Caution amber with a hard underline, per `renders/62-judgment-reading@2x.png`.
   * FLAGGED: `design/DESIGN_SYSTEM.md` §3a says amber is reserved for "the law
   * has moved, and nothing else". The render is newer and draws the highlight
   * in amber; the rule's own enumeration covers drafts, OCR and our confidence,
   * none of which a user's own highlight is. Following the render, flagged in
   * the gate report rather than silently picked.
   */
  highlighted: {
    backgroundColor: state.cautionWash,
    textDecorationLine: 'underline',
    textDecorationColor: state.caution,
  },
  /** The current search hit is inverted ink; the others keep the amber wash. */
  currentHit: { backgroundColor: color.ink, color: color.card },
  citedLink: { color: color.oxblood },
  actions: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  actionSolid: {
    borderWidth: 1,
    borderColor: color.ink,
    borderRadius: radius.base,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
  },
  actionGhost: {
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
  },
  hint: {
    color: color.inkFaint,
    textAlign: 'center',
    paddingHorizontal: space.sm,
    paddingBottom: space.xs,
  },
  /**
   * Floating chrome, bottom third — this is read one-handed while holding a
   * physical file. Inset rather than edge-to-edge so the judgment stays visible
   * behind it and the bar reads as floating above the page rather than as a
   * second footer attached to it.
   */
  /** `bottom` is applied per-render from the safe-area inset. */
  controlsHost: {
    position: 'absolute',
    left: space.md,
    right: space.md,
  },
});
