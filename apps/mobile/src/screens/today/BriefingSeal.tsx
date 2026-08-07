import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ShieldCheck } from 'lucide-react-native';

import { easing } from '../../theme/easing';
import { haptics } from '../../theme/haptics';
import { gilt, color } from '../../theme/tokens';

/**
 * THE SEAL — one of exactly two gilt placements in the product.
 *
 * `DESIGN_SYSTEM.md` §Gilt: gilt never carries information. Remove it and ask
 * whether anything became unknowable; here the answer is no — the words
 * "BRIEFING READY" carry the fact, and the ring is the ceremony around it. That
 * is the test it has to pass to be allowed to exist at all.
 *
 * `PRODUCT_BRIEF.md`: "Everything quiet, one moment of theatre: the briefing
 * seal stamping when tomorrow's brief is ready." This is that moment and the
 * only one, which is why the ritual haptic is reserved for it
 * (`theme/haptics.ts`) and why nothing else in the app presses.
 *
 * 620ms with ONE HAPTIC AT CONTACT — `SPRINT_3.md` RCC task 4. The haptic fires
 * when the ring meets the paper, not when the animation starts and not when it
 * settles: a stamp is felt at the moment of contact or it is not a stamp.
 *
 * REDUCE MOTION: the seal still stamps, without scale. Dropping the moment
 * entirely would take the one piece of ceremony away from the readers most
 * likely to need the reassurance; dropping the transform keeps the promise made
 * in `DESIGN_SYSTEM.md` §Motion.
 */
const PRESS_MS = 620;
/** The frame the ring meets the paper — where the haptic belongs. */
const CONTACT_MS = 380;

export function BriefingSeal({ size = 44, animate = true }: { size?: number; animate?: boolean }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(animate && !reduced ? 1.55 : 1);
  const opacity = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;

    opacity.value = withTiming(1, { duration: 180, easing: easing.out });

    if (reduced) return;
    // Falls, meets the paper, and settles a hair back — the physical shape of a
    // stamp. `withSequence` rather than a spring because a stamp does not
    // oscillate; it lands and stops.
    scale.value = withSequence(
      withTiming(0.94, { duration: CONTACT_MS, easing: easing.out }),
      withTiming(1, { duration: PRESS_MS - CONTACT_MS, easing: easing.out })
    );

    const timer = setTimeout(() => haptics.ritual(), CONTACT_MS);
    return () => clearTimeout(timer);
  }, [animate, reduced, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
      testID="briefing-seal"
    >
      <View style={styles.inner}>
        <ShieldCheck color={gilt} size={size * 0.44} strokeWidth={1.5} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /**
   * A DOUBLE RING, as drawn in `renders/31-today@2x.png`: a 2px gilt outer and a
   * 1px inner sitting a little inside it. One ring reads as a badge; two read as
   * an impression pressed into paper.
   */
  ring: {
    borderWidth: 2,
    borderColor: gilt,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.card,
  },
  inner: {
    ...StyleSheet.absoluteFill,
    margin: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: gilt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
