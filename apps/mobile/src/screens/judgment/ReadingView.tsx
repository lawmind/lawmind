import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
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
import type { JudgmentDetail, JudgmentParagraph } from '../../api/contract';
import { useHighlightsFor, useReadingStore } from '../../state/reading';
import { easing } from '../../theme/easing';
import { haptics } from '../../theme/haptics';
import { color, radius, space, state } from '../../theme/tokens';
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
  const listRef = useRef<FlatList<JudgmentParagraph>>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState('');
  const [hitIndex, setHitIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

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
  const [current, setCurrent] = useState(
    openParagraph ?? progress?.paragraphNumber ?? judgment.paragraphs[0]?.number ?? 1
  );

  /**
   * IN-TEXT SEARCH JUMPS BETWEEN PARAGRAPHS, NOT SCROLL POSITIONS. An advocate
   * looking for a word wants the next paragraph that argues it, not the next
   * pixel offset where the string happens to appear.
   */
  const hits = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return judgment.paragraphs.filter((p) => p.text.toLowerCase().includes(q));
  }, [judgment.paragraphs, term]);

  const indexOfParagraph = useCallback(
    (n: number) => judgment.paragraphs.findIndex((p) => p.number === n),
    [judgment.paragraphs]
  );

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
  const offsets = useRef(new Map<number, number>());
  /** A jump that had to use the estimate, waiting for its row to be measured. */
  const pendingJump = useRef<number | null>(null);

  const measure = useCallback((paragraphNumber: number, y: number) => {
    offsets.current.set(paragraphNumber, y);
    // The row the advocate asked for has now been measured — land on it exactly.
    if (pendingJump.current === paragraphNumber) {
      pendingJump.current = null;
      listRef.current?.scrollToOffset({ offset: y, animated: false });
    }
  }, []);

  const jumpTo = useCallback(
    (paragraphNumber: number) => {
      const index = indexOfParagraph(paragraphNumber);
      if (index < 0) return;
      jumpTarget.current = paragraphNumber;

      /**
       * SCROLL BY MEASURED OFFSET, NOT BY INDEX.
       *
       * `scrollToIndex` on variable-height rows without `getItemLayout` is
       * computed from an average, so it lands a row short and the advocate who
       * asked for ¶ 17 gets ¶ 16 — in the header, in the URL and in the saved
       * position. Retrying it just re-runs the same estimate.
       *
       * Every row reports its own offset through `onLayout`, so once a row has
       * been laid out its position is a fact rather than an estimate. Where the
       * fact exists we use it; where it does not — a jump far down a judgment
       * the list has never rendered — we fall back to the estimate to get
       * close, and the `onLayout` that follows corrects it.
       */
      const offset = offsets.current.get(paragraphNumber);
      if (offset !== undefined) {
        listRef.current?.scrollToOffset({ offset, animated: true });
      } else {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
        pendingJump.current = paragraphNumber;
      }
      setCurrent(paragraphNumber);
      setProgress(judgment.judgmentId, paragraphNumber);
      onParagraphChange(paragraphNumber);
    },
    [indexOfParagraph, judgment.judgmentId, onParagraphChange, setProgress]
  );

  /** Keeps the stable callback below pointed at the current judgment. */
  const setProgressRef = useRef((n: number) => setProgress(judgment.judgmentId, n));
  setProgressRef.current = (n: number) => setProgress(judgment.judgmentId, n);

  /**
   * FlatList captures this callback once, so it must not be recreated between
   * renders. It reads live values through refs rather than closing over state.
   */
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { item: JudgmentParagraph }[] }) => {
      const visible = viewableItems.map((v) => v.item?.number).filter((n) => n !== undefined);
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
    const first = judgment.paragraphs[0]?.number;
    if (target && target !== first) jumpTo(target);
  }, [hydrated, judgment.judgmentId, judgment.paragraphs, jumpTo, openParagraph]);

  const step = (delta: number) => {
    if (!hits.length) return;
    const next = (hitIndex + delta + hits.length) % hits.length;
    const hit = hits[next];
    if (!hit) return;
    setHitIndex(next);
    haptics.shift();
    jumpTo(hit.number);
  };

  const readIndex = indexOfParagraph(current);
  const readRatio = judgment.paragraphs.length
    ? (readIndex + 1) / judgment.paragraphs.length
    : 0;

  return (
    <Screen>
      {searching ? (
        <View style={styles.searchBar}>
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
            <Text variant="ui" style={styles.hitCount}>
              {hits.length === 0
                ? term.trim()
                  ? 'Not in this judgment'
                  : ''
                : `${hitIndex + 1} of ${hits.length} in this judgment`}
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
        <View style={styles.nav}>
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
        <Text opticalNudge variant="record">
          ¶ {current} of {judgment.paragraphs.length}
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
        keyExtractor={(p) => String(p.number)}
        onScrollToIndexFailed={({ index }) => {
          // A judgment is long and rows are variable height; retry once the
          // list has measured rather than dropping the jump on the floor.
          setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 60);
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        ref={listRef}
        renderItem={({ item }) => (
          <Paragraph
            dimmed={
              // Non-matching paragraphs stay at 50% so the eye lands on the hit.
              (term.trim().length > 0 && !hits.includes(item)) || (!term && item.number !== current)
            }
            highlighted={highlighted.has(item.number)}
            isCurrentHit={hits[hitIndex] === item}
            onMeasure={measure}
            onLink={() => {
              haptics.commit();
              setSelected(item.number);
              // Tapping the anchor puts it in the URL. That IS the link.
              onParagraphChange(item.number);
            }}
            onOpenCited={
              item.citesJudgmentId ? () => onOpenJudgment(item.citesJudgmentId!) : undefined
            }
            onSaveToMatter={() => {
              haptics.commit();
              addHighlight({
                judgmentId: judgment.judgmentId,
                paragraphNumber: item.number,
                text: item.text,
                savedAt: new Date().toISOString(),
              });
            }}
            paragraph={item}
            selected={selected === item.number}
            textSize={textSize}
          />
        )}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        />
      </Animated.View>

      <Text variant="ui" style={styles.hint}>
        Paragraph numbers are anchors — tap one to link it.
      </Text>

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
  onOpenCited,
  onMeasure,
}: {
  paragraph: JudgmentParagraph;
  textSize: number;
  dimmed: boolean;
  selected: boolean;
  highlighted: boolean;
  isCurrentHit: boolean;
  onLink: () => void;
  onSaveToMatter: () => void;
  onOpenCited?: () => void;
  /** Reports this row's real y offset once the list has laid it out. */
  onMeasure: (paragraphNumber: number, y: number) => void;
}) {
  return (
    <View
      onLayout={(e) => onMeasure(paragraph.number, e.nativeEvent.layout.y)}
      style={styles.paragraphRow}
    >
      {/* The anchor. Fixed 22px gutter — see the note at the top of this file. */}
      <Pressable accessibilityLabel={`Paragraph ${paragraph.number}`} accessibilityRole="button" onPress={onLink}>
        <View style={styles.gutter}>
          <Text opticalNudge variant="record" style={styles.anchor}>
            {paragraph.number}
          </Text>
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
            <Pressable accessibilityRole="button" onPress={onSaveToMatter}>
              <View style={styles.actionSolid}>
                <Text variant="ui">Save to matter</Text>
              </View>
            </Pressable>
            <View style={styles.actionGhost}>
              <Text variant="ui">Copy ¶ {paragraph.number}</Text>
            </View>
            <View style={styles.actionGhost}>
              <Text variant="ui">Link</Text>
            </View>
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
});
