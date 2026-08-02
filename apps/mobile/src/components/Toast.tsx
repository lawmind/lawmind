import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

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
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    Animated.timing(opacity, {
      toValue: 1,
      duration: duration.fade,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: duration.fade,
        useNativeDriver: true,
      }).start(onDone);
    }, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, onDone, opacity]);

  if (!message) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.host, { opacity }]}>
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
