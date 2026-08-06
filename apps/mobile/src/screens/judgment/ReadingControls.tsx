import { StyleSheet, View } from 'react-native';
import { ALargeSmall, Highlighter, Pause, Volume2 } from 'lucide-react-native';

import { Glass } from '../../components/Glass';
import { Pressable } from '../../components/Pressable';
import { Text } from '../../components/Text';
import { color, radius, space } from '../../theme/tokens';
import type { SpeechAvailability } from '../../hooks/useJudgmentSpeech';

/**
 * THE READING CONTROL BAR — listen, annotate, language, text size.
 *
 * Floating chrome over scrolling content, which is an explicitly sanctioned
 * glass placement. Primary actions sit in the bottom third: this is read
 * one-handed, standing, holding a physical file.
 *
 * ---------------------------------------------------------------------------
 * DIVERGES FROM `design/screens/09-reading-view-controls.dc.html`, DELIBERATELY.
 *
 * The render draws this bar as a dark pill: `rgba(20,27,45,.92)`,
 * `border-radius:9999`, icons stroked `#F5EDDC`. Three separate rules say
 * otherwise, so it is built to the rules and the divergence is flagged rather
 * than silently resolved either way:
 *
 *   1. `DESIGN_SYSTEM.md` L228 — "The toast is the one ink glass in the
 *      product". `Glass`'s own `ink` prop repeats it. A second ink glass is a
 *      decision, not an implementation detail.
 *   2. Radii are 2px, 3px maximum, excepting sheets and genuinely circular
 *      elements. A pill bar is neither.
 *   3. `#F5EDDC` is not in the palette — parchment is `#F2EFE8` — and
 *      `check-hex.mjs` rejects any colour outside `tokens.ts`, correctly.
 *
 * If the founder rules the pill is a second sanctioned ink glass, this is a
 * one-file change: `ink` on the Glass, `radius.circle`, and a parchment token.
 * ---------------------------------------------------------------------------
 */

export function ReadingControls({
  speaking,
  speechAvailability,
  language,
  onToggleListen,
  onAnnotate,
  onToggleLanguage,
  onTextSize,
}: {
  speaking: boolean;
  speechAvailability: SpeechAvailability;
  language: 'en' | 'hi';
  onToggleListen: () => void;
  /** Absent where the current paragraph has no printed number to save under. */
  onAnnotate?: () => void;
  onToggleLanguage: () => void;
  onTextSize: () => void;
}) {
  /**
   * NO HINDI VOICE IS SAID PLAINLY, NOT HIDDEN BEHIND A DEAD BUTTON.
   *
   * A listen control that does nothing when tapped is worse than one that is
   * absent, and reading Devanagari through an English voice is unintelligible
   * rather than merely poor. Same rule as an AI outage: say so, do not serve a
   * degraded substitute.
   */
  const noHindiVoice = speechAvailability === 'no-hindi-voice';

  return (
    <Glass edge="top" style={styles.bar}>
      <View style={styles.row}>
        <Pressable
          accessibilityLabel={speaking ? 'Stop reading aloud' : 'Read this judgment aloud'}
          accessibilityRole="button"
          accessibilityState={{ disabled: noHindiVoice }}
          onPress={noHindiVoice ? undefined : onToggleListen}
          style={styles.control}
        >
          {speaking ? (
            <Pause color={color.ink} size={20} strokeWidth={1.5} />
          ) : (
            <Volume2 color={noHindiVoice ? color.inkFaint : color.ink} size={20} strokeWidth={1.5} />
          )}
        </Pressable>

        <Pressable
          accessibilityLabel="Highlight and annotate"
          accessibilityRole="button"
          accessibilityState={{ disabled: onAnnotate === undefined }}
          onPress={onAnnotate}
          style={styles.control}
        >
          <Highlighter
            color={onAnnotate === undefined ? color.inkFaint : color.ink}
            size={20}
            strokeWidth={1.5}
          />
        </Pressable>

        {/*
          The language pair is TEXT, not an icon, because "EN" and "हिं" are the
          two things it switches between and an icon would be a guess at both.
          `Text` resolves the Devanagari run itself — face, size and leading —
          so this never hard-codes a font the way the render does.
        */}
        <Pressable
          accessibilityLabel={language === 'en' ? 'Switch to Hindi' : 'Switch to English'}
          accessibilityRole="button"
          onPress={onToggleLanguage}
          style={styles.control}
        >
          <View style={styles.languagePair}>
            <Text lang="en" variant={language === 'en' ? 'uiStrong' : 'ui'} style={language === 'en' ? undefined : styles.inactive}>
              EN
            </Text>
            <Text lang="hi" variant={language === 'hi' ? 'uiStrong' : 'ui'} style={language === 'hi' ? undefined : styles.inactive}>
              हिं
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityLabel="Text size"
          accessibilityRole="button"
          onPress={onTextSize}
          style={styles.control}
        >
          <ALargeSmall color={color.ink} size={20} strokeWidth={1.5} />
        </Pressable>
      </View>

      {noHindiVoice ? (
        <Text variant="ui" style={styles.unavailable}>
          This device has no Hindi voice installed, so this judgment cannot be read aloud.
        </Text>
      ) : null}
    </Glass>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: radius.base },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  control: { paddingHorizontal: space.sm },
  languagePair: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  inactive: { color: color.inkFaint },
  unavailable: { color: color.inkMuted, paddingHorizontal: space.md, paddingBottom: space.sm },
});
