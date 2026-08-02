import * as Haptics from 'expo-haptics';

/**
 * Five semantic names. This is the entire public surface.
 *
 * NO SCREEN MAY CALL `expo-haptics` DIRECTLY, and no screen names an impact
 * weight — a screen that knows the difference between Light and Medium is a
 * screen that will drift from the rest of the product.
 *
 * One haptic per gesture. Never the only signal for anything. None on scroll,
 * and none on an incoming push — the app opens in courtrooms.
 */
export const haptics = {
  /** A press. Fires on press-IN: the press is felt, not the release. */
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  /** Something took effect — a result opened, a checklist item ticked. */
  commit: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  /** The seal. Reserved for the briefing stamping; nothing else earns it. */
  ritual: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  /** A change of place — tab change, segment change. */
  shift: () => Haptics.selectionAsync(),
  /** Refused, undone, or gone offline. */
  reject: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
};
