import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, radius, space } from '../theme/tokens';

/**
 * OPAQUE. NO SHADOW. 1px `rule` edge.
 *
 * Structure is carried by hairlines and by spacing, the way it is on a printed
 * page. Shadow appears only on genuinely floating cases — never on a resting
 * card, button or header.
 *
 * Glass never goes behind a card. A judgment is read in sunlight and a draft is
 * filed in court; translucency behind either is a correctness failure, not a
 * taste one.
 */
export function Card({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: color.rule,
    padding: space.sm,
  },
});
