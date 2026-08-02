import { type ReactNode } from 'react';
import { ImageBackground, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

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
 */
export function Screen({
  children,
  desk = false,
  style,
}: {
  children?: ReactNode;
  desk?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.host, desk ? styles.desk : styles.paper]}>
      <ImageBackground
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require('../../assets/paper-tooth.png')}
        resizeMode="repeat"
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, style]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  paper: { backgroundColor: color.paper },
  desk: { backgroundColor: color.paperDesk },
  content: { flex: 1 },
});
