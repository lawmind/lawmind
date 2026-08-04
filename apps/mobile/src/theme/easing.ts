import { Easing } from 'react-native-reanimated';

import { easingCurve } from './tokens';

/**
 * THE EASING CURVES, as React Native easing functions.
 *
 * They live here rather than in `tokens.ts` because that file imports nothing,
 * by rule: `apps/admin` and `app.config.ts` consume the same tokens and neither
 * can resolve a React Native import. So the control points are data there, and
 * this file is the only place they become functions.
 *
 * WHY THIS FILE EXISTS AT ALL. Before it, not one animation in the product
 * named a curve, which means every one of them ran on React Native's default —
 * `ease-in-out`. An ease-in-out ENTRANCE starts slow. The frame the user is
 * actually watching, the one where the thing appears, is the frame that gets
 * delayed. That single default is why the motion read as sluggish rather than
 * wrong: nothing was visibly broken, everything was just late.
 *
 * Reanimated re-exports RN's `Easing`, and these are worklet-safe: an `Easing`
 * function may be passed straight into a `withTiming` config inside a worklet.
 */
export const easing = {
  /** ENTERING AND EXITING. The default; reach for this unless you can say why not. */
  out: Easing.bezier(...easingCurve.out),
  /** Moving or morphing something already on screen — a rule sliding between tabs. */
  inOut: Easing.bezier(...easingCurve.inOut),
  /** Sheets. Flatter tail than `out`, so a large surface does not appear to stall. */
  drawer: Easing.bezier(...easingCurve.drawer),
  /**
   * CONSTANT MOTION ONLY — the shimmer, and nothing else.
   *
   * A looping sweep on an eased curve pulses: it slows at each end of the loop,
   * so a skeleton reads as a heartbeat rather than as a surface catching light.
   * Anything that repeats forever is linear.
   */
  linear: Easing.linear,
} as const;
