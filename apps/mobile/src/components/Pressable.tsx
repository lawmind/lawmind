import { forwardRef, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  StyleSheet,
  type View,
  type ViewStyle,
} from 'react-native';

import { haptics } from '../theme/haptics';
import { duration, motion, size } from '../theme/tokens';

/**
 * The press feel, in one place.
 *
 * Every tappable in Lawmind scales to 0.965 with −3% brightness and a light
 * haptic — ON PRESS-IN, because the press is felt and not the release. A
 * pressable that writes its own `onPressIn` animation is drifting from the rest
 * of the product.
 *
 * Minimum target 44×44, enforced here rather than remembered per screen.
 *
 * Reduce Motion: drop every transform, keep opacity. The veil stays; the scale
 * goes. React Native has no brightness filter, so −3% is an ink veil at 3%.
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
  const scale = useRef(new Animated.Value(1)).current;
  const veil = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) reduceMotion.current = on;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      reduceMotion.current = on;
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const animate = (toScale: number, toVeil: number) =>
    Animated.parallel([
      Animated.timing(scale, {
        toValue: reduceMotion.current ? 1 : toScale,
        duration: duration.press,
        useNativeDriver: true,
      }),
      Animated.timing(veil, { toValue: toVeil, duration: duration.press, useNativeDriver: true }),
    ]).start();

  return (
    <RNPressable
      {...rest}
      onPressIn={(e) => {
        if (haptic) haptics.tap();
        animate(motion.pressScale, 1);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animate(1, 0);
        onPressOut?.(e);
      }}
      ref={ref}
      style={styles.target}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children as React.ReactNode}
        <Animated.View pointerEvents="none" style={[styles.veil, { opacity: veil }]} />
      </Animated.View>
    </RNPressable>
  );
});

const styles = StyleSheet.create({
  target: { minWidth: size.touch, minHeight: size.touch, justifyContent: 'center' },
  veil: { ...StyleSheet.absoluteFill, backgroundColor: motion.pressVeil },
});
