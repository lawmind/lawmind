import { ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '../../components/Card';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { useSession } from '../../state/session';
import { color, space } from '../../theme/tokens';

/**
 * PROFILE — inventory row 39, `renders/20-settings-switches.png` left panel.
 *
 * THE RENDER DRAWS A "PRACTICE" SECTION — Courts, Practice areas, Language —
 * that has no backing field anywhere. Checked `docs/SCHEMA_TRUTH.md#users`
 * directly: `full_name, phone, email, bar_enrolment_number,
 * enrolment_status, preferred_language, subscription_tier,
 * terms_accepted_at, terms_version, expo_push_token`. No `courts`, no
 * `practice_areas` column, no endpoint that would supply either. Same class
 * of finding as the render's invented "usage this month" counter — not
 * built, rather than shown empty or fabricated. `preferredLanguage` alone
 * is real and shown.
 */
export function ProfileScreen({
  onOpenSubscription,
  onOpenSettings,
}: {
  onOpenSubscription: () => void;
  onOpenSettings: () => void;
}) {
  const profile = useSession((s) => s.profile);

  if (!profile) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Text variant="ui" style={styles.muted}>
            Loading…
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text variant="uiStrong" style={styles.avatarLabel}>
              {initials(profile.fullName)}
            </Text>
          </View>
          <View>
            <Text variant="uiStrong" scale="title" style={styles.headerName}>
              {profile.fullName}
            </Text>
            <Text variant="ui" style={styles.headerSub}>
              Advocate
            </Text>
          </View>
        </View>

        {profile.enrolmentStatus === 'unverified' ? (
          <Card style={styles.pendingCard}>
            <Text variant="uiStrong" style={styles.pendingTitle}>
              Enrolment verification pending
            </Text>
            <Text variant="ui" style={styles.pendingBody}>
              {profile.barEnrolmentNumber ?? 'No bar number on file'} · usually two working days
            </Text>
          </Card>
        ) : null}

        <View style={styles.section}>
          <Text variant="eyebrow">Contact</Text>
          <Row label="Email" value={profile.email} />
          <Row label="Phone" value={profile.phone} />
          <Row label="Bar enrolment number" value={profile.barEnrolmentNumber ?? 'Not provided'} />
          <Row label="Language" value={profile.preferredLanguage === 'hi' ? 'Hindi' : 'English'} />
        </View>

        <View style={styles.section}>
          <Text variant="eyebrow">Plan</Text>
          <Pressable onPress={onOpenSubscription} style={styles.planRow}>
            <Text variant="uiStrong">{planLabel(profile.subscriptionTier)}</Text>
            <Text variant="ui" style={styles.link}>
              Change
            </Text>
          </Pressable>
        </View>

        {profile.termsAcceptedAt ? (
          <View style={styles.section}>
            <Text variant="eyebrow">Consent</Text>
            <Text variant="ui" style={styles.muted}>
              Accepted {new Date(profile.termsAcceptedAt).toLocaleDateString('en-IN')}
              {profile.termsVersion ? ` · version ${profile.termsVersion}` : ''}
            </Text>
          </View>
        ) : null}

        <Pressable onPress={onOpenSettings} style={styles.settingsRow}>
          <Text variant="uiStrong">Settings</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="ui" style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="ui">{value}</Text>
    </View>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

function planLabel(tier: string): string {
  if (tier === 'none') return 'No plan yet';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: { color: color.card },
  headerName: {},
  headerSub: { color: color.inkMuted },

  /**
   * NEUTRAL INK, NOT AMBER — fixed 11 Aug 2026, `check-amber-reservation.mjs`.
   * Amber means the law has moved, and enrolment verification is a fact
   * about us, not about the law. Same dashed-edge treatment as
   * `EnrolmentBand.tsx` and `ResultCard.cardUnconfirmed`.
   */
  pendingCard: {
    backgroundColor: color.paper,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    gap: 2,
    padding: space.sm,
  },
  pendingTitle: { color: color.oxblood },
  pendingBody: { color: color.inkMuted },

  section: { gap: space.xs, marginTop: space.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  rowLabel: { color: color.inkMuted },

  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  link: { color: color.oxblood },
  muted: { color: color.inkMuted },
  settingsRow: {
    marginTop: space.md,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
});
