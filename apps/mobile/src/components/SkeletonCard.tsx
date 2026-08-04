import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Card } from './Card';
import { color, motion, radius, space } from '../theme/tokens';

/**
 * LOADING IS A SHIMMER, NEVER A SPINNER — and never a bare spinner on search.
 * The skeleton keeps the screen's shape, so results land into a layout the eye
 * has already settled on rather than replacing a void.
 *
 * The geometry mirrors a judgment card exactly, INCLUDING the footer strip. A
 * skeleton whose shape differs from what arrives is worse than none: the layout
 * jumps at the moment the user starts reading.
 *
 * Reduce Motion: the sweep becomes a static tint.
 */
export function SkeletonCard({ index = 0, reduceMotion = false }: { index?: number; reduceMotion?: boolean }) {
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    /**
     * Siblings are offset rather than synchronised, so a column of skeletons
     * reads as a surface catching light rather than as three bars blinking in
     * lockstep. `-1` repeats forever; the loop lives on the UI thread, so it
     * keeps sweeping while the search request it is waiting for lands.
     */
    sweep.value = withDelay(
      index * motion.shimmerSiblingOffset,
      withRepeat(
        withTiming(1, { duration: motion.shimmerLoop, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, [index, reduceMotion, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -240 + sweep.value * 480 }],
  }));

  return (
    <Card style={styles.card}>
      <View style={[styles.bar, styles.citation]} />
      <View style={[styles.bar, styles.title]} />
      <View style={[styles.bar, styles.line]} />
      <View style={[styles.bar, styles.lineShort]} />
      <View style={styles.footerRule} />
      <View style={[styles.bar, styles.footer]} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sweep,
          reduceMotion ? styles.sweepStatic : sweepStyle,
        ]}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', gap: space.xs },
  bar: { backgroundColor: color.hairline, borderRadius: radius.base },
  citation: { height: 12, width: '42%' },
  title: { height: 23, width: '78%' },
  line: { height: 17, width: '100%' },
  lineShort: { height: 17, width: '64%' },
  footerRule: { height: 1, backgroundColor: color.hairline, marginTop: space.xs },
  footer: { height: 12, width: '52%' },
  sweep: {
    ...StyleSheet.absoluteFill,
    backgroundColor: motion.shimmerTint,
    opacity: 0.6,
    width: 120,
  },
  sweepStatic: { opacity: 0.25, width: '100%' },
});
