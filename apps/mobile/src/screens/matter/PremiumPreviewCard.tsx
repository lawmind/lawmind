import { StyleSheet, View } from 'react-native';

import type { PremiumPreview } from '../../api/contract';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Text } from '../../components/Text';
import { color, radius, space } from '../../theme/tokens';

/**
 * The cheap, truthful half of Matter Intelligence.
 *
 * Every number is already-held matter state. The card never blurs a legal
 * fact, never invents a supporting/contrary split, and never hides adverse
 * treatment behind its CTA. The server capability flag decides whether this
 * component exists for a user at all; it is OFF by default.
 */
export function PremiumPreviewCard({
  preview,
  onOpenPlans,
}: {
  preview: PremiumPreview;
  onOpenPlans: () => void;
}) {
  return (
    <Card style={styles.card}>
      <Text variant="eyebrow">Matter intelligence preview</Text>

      <View style={styles.facts}>
        <Text variant="uiStrong">
          {preview.authorityCount === 1
            ? '1 authority saved'
            : `${preview.authorityCount} authorities saved`}
        </Text>
        <Text variant="ui" style={styles.muted}>
          {preview.eventCount === 1 ? '1 matter event' : `${preview.eventCount} matter events`}
          {' · '}
          {preview.unresolvedFilings === 1
            ? '1 unresolved filing'
            : `${preview.unresolvedFilings} unresolved filings`}
        </Text>
      </View>

      {preview.adverseAuthorities > 0 ? (
        <View accessibilityRole="alert" style={styles.adverse}>
          <Text variant="uiStrong" style={styles.adverseLabel}>
            LAW MOVED
          </Text>
          <Text variant="ui">
            {preview.adverseAuthorities === 1
              ? '1 saved authority has adverse treatment. This remains visible without Pro.'
              : `${preview.adverseAuthorities} saved authorities have adverse treatment. This remains visible without Pro.`}
          </Text>
        </View>
      ) : null}

      <View style={styles.locked}>
        <Text variant="uiStrong">See which help and which hurt</Text>
        {preview.stanceNotComputed ? (
          <Text variant="ui" style={styles.muted}>
            LawMind has not classified which authorities help or hurt. That analysis has not been
            generated.
          </Text>
        ) : null}
        <Button label="View Pro plans" onPress={onOpenPlans} variant="secondary" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  facts: { gap: 4 },
  muted: { color: color.inkMuted },
  adverse: {
    borderLeftWidth: 2,
    borderLeftColor: color.ink,
    paddingLeft: space.xs,
    gap: 4,
  },
  adverseLabel: { color: color.ink },
  locked: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
});
