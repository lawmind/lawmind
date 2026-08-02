import { type ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, type ButtonVariant } from './Button';
import { Text } from './Text';
import { color, radius, space } from '../theme/tokens';

/**
 * NEVER "nothing here". An empty state names the next thing to do, and where
 * that next thing has a cost — a CNR lookup, a scan, an evening's wait for the
 * first briefing — it says so.
 *
 * Title is the `cardTitle` row of the scale. `IMPLEMENTATION.md` §Component
 * inventory says 19–20px, which is not a row in `design/DESIGN_SYSTEM.md` §Type;
 * the ten-row scale is the token authority, so this reads at 23.
 */
export type EmptyStateAction = { label: string; onPress?: () => void; variant?: ButtonVariant };

export function EmptyState({
  icon: Icon,
  title,
  body,
  actions = [],
}: {
  icon?: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  title: string;
  body: string;
  actions?: EmptyStateAction[];
}) {
  return (
    <View style={styles.host}>
      {Icon ? (
        <View style={styles.iconCircle}>
          <Icon color={color.inkFaint} size={22} strokeWidth={1.5} />
        </View>
      ) : null}
      <Text variant="legal" scale="cardTitle" style={styles.title}>
        {title}
      </Text>
      <Text variant="ui" style={styles.body}>
        {body}
      </Text>
      {actions.map((action) => (
        <Button
          key={action.label}
          label={action.label}
          onPress={action.onPress}
          style={styles.action}
          variant={action.variant ?? 'secondary'}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.xl, gap: space.sm },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.circle,
    borderWidth: 1,
    borderColor: color.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center' },
  body: { color: color.inkMuted, textAlign: 'center', maxWidth: 340 },
  action: { alignSelf: 'stretch' },
});
