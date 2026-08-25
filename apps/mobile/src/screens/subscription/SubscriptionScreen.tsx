import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '../../components/Card';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { useSession } from '../../state/session';
import { color, radius, space } from '../../theme/tokens';

/**
 * SUBSCRIPTION — SPRINT_5 item 4. Inventory rows 40/115.
 *
 * TWO RENDERS DISAGREE, AND `PRODUCT_DECISIONS.md` PD-13 SETTLES IT.
 * `renders/51-subscription@2x.png` names the tiers Starter/Professional —
 * **retired 2 Aug 2026**, PD-13: "the site names win, the docs move." Real
 * names/prices below. That render also says "no buy button, managed on
 * web" — but PD-13 + `docs/OPEN_DECISIONS.md` OD-10 ("launch on standard
 * store billing") require REAL native in-app purchase for the first three
 * tiers, App Store guideline 3.1.1. Neither is built: no vendor is chosen
 * (`docs/FOUNDER_QUEUE.md`, 8 Aug — RevenueCat researched and recommended,
 * needs a yes), no store products exist, no receipt-validation endpoint
 * exists. The purchase action is stubbed honestly rather than faked.
 */

const TIERS = [
  { key: 'practice', name: 'Practice', price: '₹799/mo', unit: 'One advocate, starting out' },
  { key: 'chamber', name: 'Chamber', price: '₹1,999/mo', unit: 'One advocate, full practice' },
  { key: 'expert', name: 'Expert', price: '₹3,499/mo', unit: 'One advocate, heavy volume' },
] as const;

export function SubscriptionScreen({ onBack }: { onBack: () => void }) {
  const profile = useSession((s) => s.profile);
  const current = profile?.subscriptionTier ?? 'none';

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable
          accessibilityLabel="Back to profile"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.back}
        >
          <Text variant="ui" style={styles.link}>
            ‹ Profile
          </Text>
        </Pressable>

        <Text variant="eyebrow">Plan</Text>
        <Text variant="uiStrong" scale="title">
          {current === 'none' ? 'You have no plan yet' : `You are on ${capitalise(current)}`}
        </Text>

        {TIERS.map((tier) => (
          <Card key={tier.key} style={tier.key === current ? styles.tierCurrent : styles.tier}>
            <View style={styles.tierHead}>
              <Text variant="uiStrong">{tier.name}</Text>
              <Text variant="uiStrong">{tier.price}</Text>
            </View>
            <Text variant="ui" style={styles.muted}>
              {tier.unit}
            </Text>
            {tier.key === current ? (
              <Text variant="ui" style={styles.currentLabel}>
                Current plan
              </Text>
            ) : (
              <View style={styles.pending}>
                <Text variant="ui" style={styles.pendingLabel}>
                  Purchase isn't available in the app yet
                </Text>
              </View>
            )}
          </Card>
        ))}

        <Card style={styles.tier}>
          <View style={styles.tierHead}>
            <Text variant="uiStrong">Firm</Text>
            <Text variant="uiStrong">Talk to us</Text>
          </View>
          <Text variant="ui" style={styles.muted}>
            5–10 advocates, shared matters
          </Text>
          <Pressable
            accessibilityLabel="Email LawMind about the Firm plan"
            accessibilityRole="link"
            onPress={() => void Linking.openURL('mailto:hello@lawmind.in?subject=Firm plan')}
            style={styles.talkToUs}
          >
            <Text variant="ui" style={styles.link}>
              Email us
            </Text>
          </Pressable>
        </Card>

        <Text variant="ui" style={styles.footnote}>
          Firm and Enterprise never show a price or a purchase link in the app — App Store guideline
          3.1.1. Enterprise is not shown here at all.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.oxblood },

  tier: { gap: space.xs, padding: space.sm },
  tierCurrent: { gap: space.xs, padding: space.sm, borderColor: color.oxblood, borderWidth: 2 },
  tierHead: { flexDirection: 'row', justifyContent: 'space-between' },
  muted: { color: color.inkMuted },
  currentLabel: { color: color.oxblood },

  pending: {
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    paddingVertical: 8,
    paddingHorizontal: space.sm,
    alignItems: 'center',
  },
  pendingLabel: { color: color.inkFaint },

  talkToUs: { paddingTop: space.xs },
  footnote: { color: color.inkFaint, marginTop: space.sm },
});
