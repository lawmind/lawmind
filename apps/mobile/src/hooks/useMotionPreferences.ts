import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * THE TWO OS SETTINGS THE PRODUCT MUST HONOUR, in one place.
 *
 * Lawmind's users are frequently over fifty and read in daylight, standing in a
 * court corridor, on a mid-range Android. A meaningful number of them have
 * already turned these settings on — years ago, system-wide — and until now the
 * app ignored both. An accessibility setting the user has already enabled and
 * that does nothing is worse than one we never offered: they asked, and we
 * quietly declined.
 *
 * `reduceMotion` DELEGATES to Reanimated's `useReducedMotion` so there is one
 * source of truth. Reanimated needs its own copy internally anyway (it gates
 * `ReduceMotion.System` inside worklets), and two independent listeners on the
 * same OS flag can disagree for a frame during a settings change.
 *
 * REDUCE MOTION IS NOT ZERO MOTION. It means fewer, gentler animations. Opacity
 * that explains where something came from stays; position changes, overshoot and
 * anything that scales or flies stop. Freezing the interface is its own failure
 * — the advocate then cannot tell whether the app is working.
 *
 * Prefer `ReduceMotion.System` in a `withTiming`/`withSpring` config where the
 * whole animation should simply not run. Use this hook where the DECISION
 * differs — a different style, a skipped blur, a static tint.
 */
export function useMotionPreferences(): {
  reduceMotion: boolean;
  reduceTransparency: boolean;
} {
  const reduceMotion = useReducedMotion();
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let alive = true;

    // `isReduceTransparencyEnabled` resolves false on Android, which has no
    // such setting — the initial read is still correct, not an error path.
    void AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (alive) setReduceTransparency(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency
    );

    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  return { reduceMotion, reduceTransparency };
}
