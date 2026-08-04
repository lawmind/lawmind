import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Glass } from './Glass';
import { easing } from '../theme/easing';
import { color, duration, radius, shadow, space, spring } from '../theme/tokens';

/**
 * Bottom sheet. 12px radius, TOP CORNERS ONLY — one of the two exceptions to
 * the 2px rule, alongside genuinely circular elements.
 *
 * The sheet is chrome, so it takes glass at `sheetBlurIntensity`. What sits
 * underneath it is content and stays opaque: the judgment beneath never becomes
 * translucent itself.
 *
 * Shadow is permitted here — a modal sheet is one of the three genuinely
 * floating cases.
 *
 * THIS USED TO BE `<Modal animationType="slide">`, WHICH IS THE OS's ANIMATION.
 *
 * Not ours: a fixed curve, a fixed duration, no relationship to the finger —
 * and `duration.sheet` was declared in the tokens and never reached. What
 * replaces it is a gesture the animation CONTINUES rather than replaces. Four
 * properties do that work, and they are the difference between a sheet that
 * feels like an object and one that feels like a screen transition someone
 * attached a drag to:
 *
 *   1. 1:1 TRACKING FROM THE GRAB POINT. The sheet does not re-centre under the
 *      thumb; where it was grabbed is where it stays held.
 *   2. VELOCITY HANDOFF. The spring starts at the speed the finger was already
 *      moving, so release is not a new motion — it is the same motion
 *      continuing. This is the one that is felt and never consciously noticed.
 *   3. MOMENTUM PROJECTION, not nearest-snap. Where the sheet WOULD come to
 *      rest decides where it goes. A fast short flick dismisses; a slow long
 *      drag does not. Nearest-snap ignores the flick, which is exactly why a
 *      position-only sheet feels like it is arguing with you.
 *   4. NEVER LOCKED. The gesture stays live while the spring runs, so the sheet
 *      is catchable mid-flight and re-grabbing it does not jump.
 *
 * `Modal` is kept for the two things it is genuinely good at — z-order above
 * everything, and the Android hardware back button — with `animationType="none"`
 * so the OS contributes no motion of its own.
 */

/** Movement before the drag commits, so a tap on a control inside is never a drag. */
const DRAG_THRESHOLD = 10;
/**
 * iOS's deceleration rate, used for the standard projection of where momentum
 * comes to rest: `projected = current + (v / 1000) * d / (1 - d)`.
 */
const DECELERATION = 0.998;
/** Rubber-band constant. Lower is stiffer; 0.55 is the familiar iOS resistance. */
const RUBBER_BAND = 0.55;

export function Sheet({
  visible,
  onDismiss,
  children,
}: {
  visible: boolean;
  onDismiss: () => void;
  children?: ReactNode;
}) {
  const { height: screenHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  /**
   * The `Modal` unmounts only AFTER the sheet has animated out, or the exit is
   * never visible: driving `visible` straight into `Modal` removes the view on
   * the first frame of its own dismissal.
   */
  const [mounted, setMounted] = useState(visible);

  /** Distance below resting position, in px. 0 is open, `height` is gone. */
  const translateY = useSharedValue(0);
  /** Reduce Motion only: the cross-fade that replaces the slide. */
  const opacity = useSharedValue(0);
  /** The sheet's real height, once laid out. The screen height until then. */
  const height = useSharedValue(screenHeight);
  /** Where the sheet was when this drag began — what makes tracking 1:1. */
  const startY = useSharedValue(0);

  const finishClose = useCallback(() => {
    setMounted(false);
    onDismiss();
  }, [onDismiss]);

  /**
   * Has this sheet ever been open? A closed sheet mounts with `visible` false,
   * and without this the exit branch below would run on first render — playing
   * a dismissal for something that was never on screen. A ref rather than
   * `mounted` because reading that would put the effect's own state in its
   * dependencies and re-run the exit in response to itself.
   */
  const everOpened = useRef(visible);

  useEffect(() => {
    if (visible) {
      everOpened.current = true;
      setMounted(true);
      if (reduceMotion) {
        translateY.value = 0;
        opacity.value = withTiming(1, { duration: duration.fade, easing: easing.out });
      } else {
        translateY.value = height.value;
        opacity.value = 1;
        translateY.value = withSpring(0, spring.drawer);
      }
      return;
    }

    if (!everOpened.current) return;

    /**
     * Dismissed from OUTSIDE the gesture — a backdrop tap, a Cancel button. The
     * exit is a timed `easing.drawer` rather than a spring, because there is no
     * velocity to hand off: nothing was thrown, so nothing should overshoot.
     */
    if (reduceMotion) {
      opacity.value = withTiming(0, { duration: duration.fade }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    } else {
      translateY.value = withTiming(
        height.value,
        { duration: duration.sheet, easing: easing.drawer },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        }
      );
    }
  }, [visible, reduceMotion, translateY, opacity, height]);

  /**
   * THE GESTURE IS NEVER DISABLED MID-FLIGHT — not while the spring runs, not
   * during the exit. `onBegin` reads the live value, so catching a moving sheet
   * continues from where it actually is on screen rather than snapping to
   * wherever the animation believed it was.
   *
   * It IS disabled under Reduce Motion, where the sheet has no position to drag
   * to: it cross-fades in place, and the backdrop tap dismisses it.
   */
  const pan = Gesture.Pan()
    .enabled(!reduceMotion)
    .activeOffsetY([-DRAG_THRESHOLD, DRAG_THRESHOLD])
    .onBegin(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const next = startY.value + event.translationY;
      if (next >= 0) {
        translateY.value = next;
        return;
      }
      /**
       * RUBBER-BANDING above the open position. The sheet still moves — a hard
       * stop reads as a broken gesture, not as a limit — but every further
       * pixel of pull yields less than the one before it, which is how a
       * boundary says "this is as far as it goes" without a message.
       */
      const overshoot = -next;
      const dim = height.value;
      translateY.value = -((overshoot * dim * RUBBER_BAND) / (dim + RUBBER_BAND * overshoot));
    })
    .onEnd((event) => {
      /**
       * PROJECTION, NOT POSITION — where the sheet would come to rest if
       * nothing caught it. That, not the pixel it was released at, is what the
       * advocate's flick meant.
       */
      const projected =
        translateY.value + (event.velocityY / 1000) * (DECELERATION / (1 - DECELERATION));

      /** Two detents: 0 (open) and `height` (gone). Nearest the PROJECTION wins. */
      const dismissing = projected > height.value / 2;

      /**
       * VELOCITY HANDOFF. `velocity` seeds the spring at the speed the finger
       * was already travelling, so there is no seam between drag and animation.
       * `spring.momentum` and not `spring.drawer` because this settle genuinely
       * carries momentum — the one case where a little overshoot is physics
       * rather than decoration.
       */
      translateY.value = withSpring(
        dismissing ? height.value : 0,
        { ...spring.momentum, velocity: event.velocityY },
        (finished) => {
          if (finished && dismissing) runOnJS(finishClose)();
        }
      );
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: reduceMotion ? opacity.value : 1,
  }));

  if (!mounted) return null;

  return (
    <Modal animationType="none" onRequestClose={onDismiss} transparent visible>
      <View style={styles.backdrop}>
        <View accessible={false} onTouchEnd={onDismiss} style={styles.backdropTap} />
        <GestureDetector gesture={pan}>
          <Animated.View
            onLayout={(e) => {
              height.value = e.nativeEvent.layout.height;
            }}
            style={sheetStyle}
          >
            <Glass edge="topLeft" sheet style={styles.sheet}>
              <View style={styles.grabberRow}>
                <View style={styles.grabber} />
              </View>
              {children}
            </Glass>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingBottom: space.lg,
    shadowColor: shadow.modalSheet.color,
    shadowOffset: { width: shadow.modalSheet.offset[0], height: shadow.modalSheet.offset[1] },
    shadowRadius: shadow.modalSheet.radius,
    shadowOpacity: 1,
  },
  grabberRow: { alignItems: 'center', paddingVertical: space.xs },
  grabber: { width: 36, height: 4, borderRadius: radius.circle, backgroundColor: color.rule },
});
