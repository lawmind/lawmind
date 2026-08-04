import { useEffect } from 'react';
import { type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { easing } from '../theme/easing';

/**
 * A single element arriving: fade in, rise 8px.
 *
 * `StaggerIn` is for a LIST, and carries the index arithmetic and the cap to
 * prove it. This is for the one thing that appears as a CONSEQUENCE of
 * something else — a reason under a button that just disabled itself, a card
 * naming what a search did not show.
 *
 * THE DELAY IS THE POINT, not politeness. Appearing on the same frame as the
 * thing that caused it makes the two read as one event and the eye has to
 * choose; 60–80ms later, cause and consequence read in the right order and the
 * eye lands on the cause first. It is below the threshold where anyone would
 * call it slow.
 *
 * 8px, not 18: `motion.listRise` is a card landing in a list. This is a
 * paragraph settling into place, and the same distance would read as a swoop.
 *
 * Reduce Motion: keep the fade, drop the rise. The fade is what says "this is
 * new" and it is exactly what should survive.
 */
const RISE = 8;

export function FadeRise({
  delay = 0,
  duration: durationMs = 200,
  children,
  ...rest
}: ViewProps & { delay?: number; duration?: number }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: durationMs, easing: easing.out }));
  }, [delay, durationMs, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduceMotion ? 0 : RISE * (1 - progress.value) }],
  }));

  return (
    <Animated.View {...rest} style={[animatedStyle, rest.style]}>
      {children}
    </Animated.View>
  );
}
