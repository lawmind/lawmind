import { forwardRef } from 'react';
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  StyleSheet,
  type View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../theme/haptics';
import { easing } from '../theme/easing';
import { duration, motion, size } from '../theme/tokens';

/**
 * The press feel, in one place.
 *
 * Every tappable in Lawmind scales to 0.965 with a light haptic — ON PRESS-IN,
 * because the press is felt and not the release. A pressable that writes its
 * own `onPressIn` animation is drifting from the rest of the product.
 *
 * Minimum target 44x44, enforced here rather than remembered per screen.
 *
 * REANIMATED, NOT `Animated`. The value lives on the UI thread as a shared
 * value and the style is computed in a worklet, so a press stays smooth while
 * JavaScript is busy — and JavaScript is busiest exactly when a list of
 * judgments is arriving, which is exactly when an advocate is tapping. RN's
 * `Animated` hands work to native only after JS schedules it; under load the
 * scheduling is what stutters, on the mid-range Android this is built for.
 *
 * `useReducedMotion` also replaces the per-instance `AccessibilityInfo`
 * listener the old implementation registered — one subscription per pressable,
 * on screens carrying forty of them.
 *
 * Reduce Motion: drop the transform, keep the veil. React Native has no
 * brightness filter, so the darkening is an ink veil at 3%.
 */
export type PressableProps = Omit<RNPressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Set false on a control that carries its own haptic — a Switch, a tab. */
  haptic?: boolean;
};

export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  { style, haptic = true, onPressIn, onPressOut, children, ...rest },
  ref
) {
  const pressed = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * (1 - motion.pressScale) }],
  }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: pressed.value }));

  return (
    <RNPressable
      {...rest}
      onPressIn={(e) => {
        // The haptic and the animation dispatch in the SAME synchronous block,
        // so the tap is felt on the frame the scale starts. Split them and the
        // press stops feeling like one event.
        if (haptic) haptics.tap();
        pressed.value = withTiming(1, { duration: duration.press, easing: easing.out });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        // ASYMMETRIC, DELIBERATELY. Press-in snaps at 110ms because pressing is
        // a decision; the release settles over 180ms because it is the finger
        // leaving, not a second decision. Matching the two — which is what the
        // component did — is what makes a button feel rubbery.
        pressed.value = withTiming(0, { duration: duration.release, easing: easing.out });
        onPressOut?.(e);
      }}
      ref={ref}
      style={styles.target}
    >
      <Animated.View style={[style, animatedStyle]}>
        {children as React.ReactNode}
        <Animated.View pointerEvents="none" style={[styles.veil, veilStyle]} />
      </Animated.View>
    </RNPressable>
  );
});

const styles = StyleSheet.create({
  target: { minWidth: size.touch, minHeight: size.touch, justifyContent: 'center' },
  veil: { ...StyleSheet.absoluteFill, backgroundColor: motion.pressVeil },
});
