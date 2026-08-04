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
  withTiming: identity,
  withSpring: identity,
  withDelay: (_delay, value) => value,
  withRepeat: (value) => value,
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  Easing: { linear: (t) => t, inOut: (fn) => fn, ease: (t) => t },
};
