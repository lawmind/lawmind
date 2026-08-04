import { useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { Pressable } from '../../components/Pressable';
import { SectionRule } from '../../components/SectionRule';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import type { JudgmentDetail } from '../../api/contract';
import {
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  useReadingStore,
  wordsPerScreen,
} from '../../state/reading';
import { color, radius, space } from '../../theme/tokens';

/**
 * Size, structure and progress in ONE sheet.
 *
 * Three separate controls would be three taps and three places to look. The
 * advocate opening this at 11pm wants to know how big the text is, where the
 * holding is, and where they stopped — those are one question about a judgment,
 * not three about an app.
 *
 * `renders/62-judgment-reading@2x.png` panel 2, inventory row 84.
 */
export function ReadingSheet({
  judgment,
  visible,
  onDismiss,
  onJumpToParagraph,
  highlightCount,
}: {
  judgment: JudgmentDetail;
  visible: boolean;
  onDismiss: () => void;
  onJumpToParagraph: (paragraphNumber: number) => void;
  highlightCount: number;
}) {
  const textSize = useReadingStore((s) => s.textSize);
  const setTextSize = useReadingStore((s) => s.setTextSize);
  const progress = useReadingStore((s) => s.progress[judgment.judgmentId]);

  return (
    <Sheet onDismiss={onDismiss} visible={visible}>
      <View style={styles.body}>
        <Text variant="uiStrong" scale="title">
          Reading
        </Text>

        <SectionRule label="Text size" />
        <TextSizeSlider onChange={setTextSize} value={textSize} />
        {/*
          WORDS PER SCREEN, NOT A POINT VALUE. "17px" means nothing at 11pm;
          "about 620 words a screen" is the number an advocate actually cares
          about, because it says how often they will move their thumb.
        */}
        <Text variant="ui" style={styles.sizeCaption}>
          {textSize}px · about {wordsPerScreen(textSize)} words a screen
        </Text>

        <SectionRule label="In this judgment" />
        <JumpRow
          label="Holding"
          onPress={() => onJumpToParagraph(judgment.holdingParagraphNumber)}
          value={`¶ ${judgment.holdingParagraphNumber}`}
        />
        <JumpRow
          label="Operative paragraph"
          onPress={() => onJumpToParagraph(judgment.operativeParagraphNumber)}
          value={`¶ ${judgment.operativeParagraphNumber}`}
        />
        <JumpRow label="Authorities relied on" value={String(judgment.reliedOn.length)} />
        <JumpRow label="Your highlights" value={String(highlightCount)} />

        {progress ? (
          <View style={styles.progressCard}>
            <Text variant="ui" style={styles.progressText}>
              You last read to ¶ {progress.paragraphNumber} on{' '}
              {new Date(progress.at).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
              })}
              . We keep your place per judgment, including offline.
            </Text>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

function JumpRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress}>
      <View style={styles.jumpRow}>
        <Text variant="ui" style={styles.jumpLabel}>
          {label}
        </Text>
        <Text opticalNudge variant="record">
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * A slider from React Native core, not from a package.
 *
 * The ladder: there is no platform slider on React Native, nothing installed
 * ships one, and the whole control is a track, a knob and a drag. Adding a
 * dependency to move a circle along a line is rung one of the ladder answered
 * wrongly. `PanResponder` is core and does exactly this.
 *
 * The `A` at each end is the entire label — a number here would be the point
 * value we deliberately do not lead with.
 */
function TextSizeSlider({ value, onChange }: { value: number; onChange: (px: number) => void }) {
  const width = useRef(0);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => emit(e.nativeEvent.locationX),
      onPanResponderMove: (e) => emit(e.nativeEvent.locationX),
    })
  ).current;

  function emit(x: number) {
    if (!width.current) return;
    const ratio = Math.min(1, Math.max(0, x / width.current));
    onChange(TEXT_SIZE_MIN + ratio * (TEXT_SIZE_MAX - TEXT_SIZE_MIN));
  }

  const ratio = (value - TEXT_SIZE_MIN) / (TEXT_SIZE_MAX - TEXT_SIZE_MIN);

  return (
    <View style={styles.sliderRow}>
      <Text variant="ui" style={styles.sliderEndSmall}>
        A
      </Text>
      <View
        {...responder.panHandlers}
        onLayout={(e) => {
          width.current = e.nativeEvent.layout.width;
        }}
        style={styles.sliderTrackHost}
      >
        <View style={styles.sliderTrack} />
        <View style={[styles.sliderKnob, { left: `${ratio * 100}%` }]} />
      </View>
      <Text variant="ui" style={styles.sliderEndLarge}>
        A
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm },
  sizeCaption: { color: color.inkFaint },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sliderEndSmall: { fontSize: 16 },
  sliderEndLarge: { fontSize: 24, lineHeight: 30 },
  sliderTrackHost: { flex: 1, height: 44, justifyContent: 'center' },
  sliderTrack: { height: 2, backgroundColor: color.ink },
  sliderKnob: {
    position: 'absolute',
    width: 24,
    height: 24,
    marginLeft: -12,
    borderRadius: 12,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.ink,
  },
  jumpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  jumpLabel: { flex: 1 },
  progressCard: {
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    backgroundColor: color.card,
    padding: space.sm,
  },
  progressText: { color: color.inkMuted },
});
