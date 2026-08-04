import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../theme/haptics';
import { easing } from '../theme/easing';
import { color, control, duration, radius, state } from '../theme/tokens';

/**
 * ONE GEOMETRY, used on every screen and in the admin desk.
 *
 * The knob is ABSOLUTELY POSITIONED and moved with a transform — never by
 * switching `justify-content`, which cannot animate and drifts off centre.
 * That drift is what made the v1 toggles look wrong.
 *
 * Track 46×28, inset 3, knob 22×22. On = `oxblood` in the app, `verified` green
 * for an admin kill switch; off = the neutral `switchOff`, or `danger` where
 * off means a service is down.
 */
export type SwitchTone = 'app' | 'kill-switch' | 'service';

export function Switch({
  value,
  onValueChange,
  disabled,
  tone = 'app',
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange?: (next: boolean) => void;
  disabled?: boolean;
  tone?: SwitchTone;
  accessibilityLabel?: string;
}) {
  const progress = useSharedValue(value ? 1 : 0);
  const trackProgress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    const to = value ? 1 : 0;
    /**
     * Knob 200ms, track 180ms — the colour lands first and the knob settles
     * into it.
     *
     * `ReduceMotion.System` on the KNOB only. The knob travelling is a position
     * change, so under Reduce Motion it jumps to the end state; the track
     * colour still crosses, because that fade is what tells a user with reduced
     * motion that the switch responded at all.
     */
    progress.value = withTiming(to, {
      duration: 200,
      easing: easing.out,
      reduceMotion: ReduceMotion.System,
    });
    trackProgress.value = withTiming(to, { duration: duration.fade, easing: easing.out });
  }, [progress, trackProgress, value]);

  const onColor = tone === 'kill-switch' ? state.verified : color.oxblood;
  const offColor = tone === 'service' ? state.danger : control.switchOff;

  const trackStyle = useAnimatedStyle(() => ({ opacity: trackProgress.value }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -control.switchKnob / 2 },
      { translateX: progress.value * control.switchTravel },
    ],
  }));

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.shift();
        onValueChange?.(!value);
      }}
    >
      <View style={[styles.track, disabled ? styles.disabled : null]}>
        <View style={[StyleSheet.absoluteFill, styles.trackFill, { backgroundColor: offColor }]} />
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.trackFill,
            { backgroundColor: onColor },
            trackStyle,
          ]}
        />
        <Animated.View style={[styles.knob, knobStyle]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: control.switchTrack.width,
    height: control.switchTrack.height,
    borderRadius: control.switchTrack.radius,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  trackFill: { borderRadius: control.switchTrack.radius },
  knob: {
    position: 'absolute',
    top: '50%',
    left: control.switchInset,
    width: control.switchKnob,
    height: control.switchKnob,
    borderRadius: radius.circle,
    backgroundColor: color.card,
    shadowColor: control.switchKnobShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: control.switchKnobEdge,
  },
  disabled: { opacity: 0.5 },
});
