import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';

import { useMotionPreferences } from '../hooks/useMotionPreferences';
import { color, glass } from '../theme/tokens';

/**
 * GLASS GOES ON FLOATING CHROME ONLY.
 *
 * Tab bar · nav bar · sticky headers · bottom sheets and modals · toasts · a
 * search field floating over results · any toolbar over scrolling content.
 *
 * IT NEVER TOUCHES CONTENT. Not behind judgment text, not behind a draft, not
 * behind a citation, a badge, a holding, an order quote or a matter card.
 * Content is fully opaque on paper, always — a draft is filed in court and a
 * judgment is read in sunlight. Translucency behind either is a correctness
 * failure, not a taste one.
 *
 * The tint is 94%, NOT 70%. At 30% screen brightness a heavier glass collapses
 * into the list beneath it and chrome stops reading as chrome.
 *
 * The hairline sits on the LEADING EDGE ONLY, so it catches light on one edge
 * like a real bevel. It is a GLASS placement, not a gilt one, and does not
 * count against the one-mark-per-screen gilt budget.
 *
 * REDUCE TRANSPARENCY REMOVES THE BLUR ENTIRELY.
 *
 * Not "reduces" it — removes it, and the tint goes fully opaque. Because the
 * tint is already 94%, that is a six-percent visual change and a total change
 * in legibility for the person who asked for it. The hairline stays: it is
 * structure, telling the eye where chrome ends and content begins, and that
 * question does not go away when the translucency does.
 */
export type GlassEdge = 'top' | 'topLeft' | 'none';

export type GlassProps = ViewProps & {
  children?: ReactNode;
  edge?: GlassEdge;
  /** Sheets blur harder — 24 rather than 16. */
  sheet?: boolean;
  /** The toast is the one ink glass in the product: it must read against paper cards. */
  ink?: boolean;
};

export const Glass = forwardRef<View, GlassProps>(function Glass(
  { children, edge = 'top', sheet = false, ink = false, style, ...rest },
  ref
) {
  const { reduceTransparency } = useMotionPreferences();

  /** The 94% tints go to their fully opaque equivalents — same hue, no see-through. */
  const fill = reduceTransparency
    ? ink
      ? color.ink
      : color.paper
    : ink
      ? glass.inkTint
      : glass.tint;

  return (
    <View {...rest} ref={ref} style={[styles.host, style]}>
      {reduceTransparency ? null : (
        <BlurView
          intensity={sheet ? glass.sheetBlurIntensity : glass.blurIntensity}
          tint={ink ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      {edge !== 'none' ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={styles.edgeTop} />
          {edge === 'topLeft' ? <View style={styles.edgeLeft} /> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  host: { overflow: 'hidden' },
  edgeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: glass.hairline },
  edgeLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, backgroundColor: glass.hairline },
});
