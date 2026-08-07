import { type ReactNode } from 'react';
import { ImageBackground, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color } from '../theme/tokens';

/**
 * The paper ground.
 *
 * Flat #FBFAF7 reads unfinished. `assets/paper-tooth.png` is a 21×21 tile
 * carrying the two-layer stipple at ~2% — a 3px grid at 2.2% and a 7px grid at
 * 1.6%, offset, which is the native form of the CSS in
 * `design/DESIGN_SYSTEM.md` §Material. 21 is LCM(3,7), so it repeats seamlessly.
 *
 * The test: a user must not be able to describe the texture, but a screenshot
 * should feel printed rather than rendered. It disappears under sunlight
 * washout — correct.
 *
 * `desk` is the draft view only: the ground behind a document sheet.
 *
 * ── `topInset` — OPT IN, AND OPT IN ONLY WHERE THE SCREEN DRAWS ITS OWN TOP ──
 *
 * Four surfaces run under `headerShown: false` and are therefore responsible
 * for their own status-bar clearance: the four tabs, and the judgment and
 * precedent routes. Everything else sits in the Stack, whose header already
 * consumes the inset — passing `topInset` there would pad it twice, which is
 * why this is a prop and not the default.
 *
 * The texture still runs edge to edge: the inset is applied to the CONTENT
 * view, not to the host, so the paper ground continues under the status bar
 * exactly as a printed page would. Insetting the host would band the top of
 * the screen in flat paper and make the tooth stop at a line.
 */
export function Screen({
  children,
  desk = false,
  style,
  topInset = false,
}: {
  children?: ReactNode;
  desk?: boolean;
  style?: StyleProp<ViewStyle>;
  topInset?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.host, desk ? styles.desk : styles.paper]}>
      <ImageBackground
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require('../../assets/paper-tooth.png')}
        resizeMode="repeat"
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[styles.content, topInset ? { paddingTop: insets.top } : null, style]}
        testID="screen-content"
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  paper: { backgroundColor: color.paper },
  desk: { backgroundColor: color.paperDesk },
  content: { flex: 1 },
});
