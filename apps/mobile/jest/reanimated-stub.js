/**
 * Reanimated, stubbed for tests — OUR stub, not the library's.
 *
 * `react-native-reanimated@4.5.1` cannot load in Node at all, and neither can
 * the mock it ships. There are two native guards in the load path and the
 * second is fatal:
 *
 *   1. `react-native-worklets/debug/checkCppVersion` compares its JS version
 *      against `globalThis._WORKLETS_VERSION_CPP`, set by the native module.
 *      Absent in Node, so `undefined` reaches semver: "Invalid version".
 *   2. past that, the worklets runtime reaches for `loadUnpackers` on a bundle
 *      that only exists on a device.
 *
 * `react-native-reanimated/mock.js` re-enters the same path, so it does not
 * help. This is a library constraint, not a configuration mistake — six
 * attempts at module mappers could never have fixed it.
 *
 * So we stub the FIVE APIs the app actually uses. Same pattern as
 * `lucide-stub.js`, and the same reasoning: the assertions in this suite are on
 * text and on style — "no mark on a verified citation", "the title is struck
 * through" — and none of them can pass because a spring was mocked.
 *
 * WHAT THIS COSTS, STATED PLAINLY: the 60fps floor, interruptibility and the
 * worklet-on-UI-thread guarantee are DEVICE checks, not test checks. They were
 * never test checks, before or after the migration.
 */
const React = require('react');
const { View, Text, ScrollView, Image } = require('react-native');

const useSharedValue = (initial) => ({ value: initial });
const useAnimatedStyle = (factory) => {
  try {
    return factory();
  } catch {
    return {};
  }
};
const useReducedMotion = () => false;
const identity = (toValue) => toValue;

/**
 * `ReduceMotion`, mirroring the real enum's string values.
 *
 * It reaches the stub as a plain config key on `withTiming`/`withSpring`, which
 * ignore their config here — but it must EXIST, because a component reading
 * `ReduceMotion.System` off `undefined` throws at import time and takes the
 * whole suite down with a module error rather than a useful failure.
 */
const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' };

const Animated = {
  View,
  Text,
  ScrollView,
  Image,
  createAnimatedComponent: (Component) => Component,
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useAnimatedRef: () => ({ current: null }),
  /**
   * `useEvent` IS FOR GESTURE-HANDLER, NOT FOR US.
   *
   * Nothing in the app calls it. `GestureDetector` does — it reaches into
   * reanimated through its own wrapper — so the moment the Sheet became a real
   * gesture the stub had to answer for a second consumer. Returning a no-op
   * handler is enough: there are no touches in Node to dispatch into it.
   */
  useEvent: () => () => {},
  useHandler: () => ({ context: {}, doDependenciesDiffer: false, useWeb: false }),
  withTiming: identity,
  withSpring: identity,
  withDelay: (_delay, value) => value,
  withRepeat: (value) => value,
  /** The last value in a sequence is where it ends up, which is all a style assertion can see. */
  withSequence: (...values) => values[values.length - 1],
  cancelAnimation: () => {},
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  ReduceMotion,
  /**
   * `bezier` RETURNS A FUNCTION, because that is what the real one returns and
   * what `theme/easing.ts` stores at module scope. Returning an object — which
   * is what the library's own mock does — passes import but fails the moment
   * anything treats the result as callable.
   *
   * The curve is not evaluated: no assertion in this suite reads an
   * intermediate frame. What the stub must protect is that naming a curve does
   * not crash a screen.
   */
  Easing: {
    linear: (t) => t,
    inOut: (fn) => fn,
    out: (fn) => fn,
    in: (fn) => fn,
    ease: (t) => t,
    bezier: () => (t) => t,
    bezierFn: () => (t) => t,
  },
};
