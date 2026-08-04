import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Glass } from './Glass';
import { Text } from './Text';
import { color, duration, radius, space } from '../theme/tokens';

/** 2.4s, then gone. Long enough to read one line, short enough not to be dismissed. */
const TOAST_MS = 2400;
/** Clear of the tab bar. */
const TOAST_BOTTOM = 104;

/**
 * The one ink glass in the product — it has to read against paper cards, which
 * is the whole reason it is not paper-tinted like every other piece of chrome.
 *
 * ONE LINE MAX. A toast that needs two lines is a message that belongs on the
 * screen, not floating over it. 2px radius: it was a 10px pill in v1 and the
 * spacing rule governs.
 */
export function Toast({ message, onDone }: { message: string | null; onDone?: () => void }) {
  const opacity = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    if (!message) return;
    opacity.value = withTiming(1, { duration: duration.fade });
    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: duration.fade });
      onDone?.();
    }, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, onDone, opacity]);

  if (!message) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.host, animatedStyle]}>
      <Glass edge="none" ink style={styles.bar}>
        <Text numberOfLines={1} variant="ui" style={styles.label}>
          {message}
        </Text>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.sm, right: space.sm, bottom: TOAST_BOTTOM },
  bar: { borderRadius: radius.base, paddingHorizontal: space.sm, paddingVertical: space.xs },
  label: { color: color.parchment },
});
