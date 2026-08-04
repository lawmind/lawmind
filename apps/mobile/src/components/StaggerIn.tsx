import { useEffect } from 'react';
import { type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { duration, motion } from '../theme/tokens';

/**
 * List entry — fade up, staggered `index × 55ms`, CAPPED AT INDEX 7.
 *
 * The cap is the whole point. Uncapped, the twentieth card waits 1.1 seconds
 * and the list reads as slow rather than considered; past the seventh row
 * nobody is watching the choreography anyway.
 *
 * Reduce Motion: drop the transform, keep the opacity. `design/DESIGN_SYSTEM.md`
 * §Motion.
 */
export function StaggerIn({
  index = 0,
  children,
  ...rest
}: ViewProps & { index?: number }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    progress.value = withDelay(
      Math.min(index, motion.staggerCap) * motion.staggerStep,
      withTiming(1, { duration: duration.push })
    );
  }, [index, progress]);

  /** Reduce Motion: drop the rise, keep the fade. */
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduceMotion ? 0 : motion.listRise * (1 - progress.value) }],
  }));

  return (
    <Animated.View
      {...rest}
      style={[animatedStyle, rest.style]}
    >
      {children}
    </Animated.View>
  );
}
