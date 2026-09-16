import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Glass } from './Glass';
import { Text } from './Text';
import { easing } from '../theme/easing';
import { color, duration, radius, space } from '../theme/tokens';

/** 2.4s, then gone. Long enough to read one line, short enough not to be dismissed. */
const TOAST_MS = 2400;
/** Clear of the tab bar. */
const TOAST_BOTTOM = 104;
/**
 * The toast rises 8px as it fades in.
 *
 * A bar that fades in place has no origin — it is simply somewhere it was not
 * before. 8px is enough to say it came UP from the bottom edge, and small
 * enough that nobody consciously sees it move.
 */
const TOAST_RISE = 8;

/**
 * The one ink glass in the product — it has to read against paper cards, which
 * is the whole reason it is not paper-tinted like every other piece of chrome.
 *
 * ONE LINE MAX. A toast that needs two lines is a message that belongs on the
 * screen, not floating over it. 2px radius: it was a 10px pill in v1 and the
 * spacing rule governs.
 */
export function Toast({ message, onDone }: { message: string | null; onDone?: () => void }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  /** Reduce Motion: keep the fade, drop the rise. */
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduceMotion ? 0 : TOAST_RISE * (1 - progress.value) }],
  }));

  useEffect(() => {
    if (!message) return;
    // `easing.out` BOTH DIRECTIONS. The exit is as watched as the entry — a
    // toast that eases out slowly at the start reads as reluctant to leave.
    //
    // `ReduceMotion.Never`: the fade is not motion, and the default (`System`)
    // skipped it — on the S24 with reduced motion on, 16 Sep 2026, the toast
    // stayed at opacity 0 and a refused save said nothing on screen.
    progress.value = withTiming(1, {
      duration: duration.fade,
      easing: easing.out,
      reduceMotion: ReduceMotion.Never,
    });
    const timer = setTimeout(() => {
      progress.value = withTiming(0, {
        duration: duration.fade,
        easing: easing.out,
        reduceMotion: ReduceMotion.Never,
      });
      onDone?.();
    }, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, onDone, progress]);

  if (!message) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.host, animatedStyle]}>
      <Glass edge="none" ink style={styles.bar}>
        <Text numberOfLines={1} variant="ui" style={styles.label}>
          {message}
        </Text>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.sm, right: space.sm, bottom: TOAST_BOTTOM },
  bar: { borderRadius: radius.base, paddingHorizontal: space.sm, paddingVertical: space.xs },
  label: { color: color.parchment },
});
