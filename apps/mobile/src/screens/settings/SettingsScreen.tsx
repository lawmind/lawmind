import { StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { useSession } from '../../state/session';
import { color, space } from '../../theme/tokens';

/**
 * SETTINGS — inventory row 41, `renders/20-settings-switches.png` right
 * panel.
 *
 * THE RENDER DRAWS SEVEN CONTROLS — four notification toggles ("Briefing
 * ready", "Briefing time", "Cause list confirmation", "Date changes") plus a
 * Data-and-offline section (keep briefings offline, download matters,
 * export my data). **None of the seven has a backing endpoint or field.**
 * The three real notification settings live on `AlertSettings`
 * (`savedAuthorityMoved`/`ownMatterJudgment`/`unknownListing`, wired in
 * `AlertSettingsScreen.tsx`) and use different names and different meanings
 * than the render's four. "Export my data" would need an advocate-facing
 * `POST /data-requests` — checked `docs/API_CONTRACTS.md`, only the
 * ADMIN-side processing endpoints exist (`GET/POST /admin/data-requests`),
 * nothing an advocate can call to originate one. Building any of the seven
 * would mean inventing either the field or the request. This screen is
 * therefore small and real rather than large and illustrative.
 *
 * "Training data" — added 10 Aug 2026 — is real for the same reason the
 * seven above are not: `GET/POST/DELETE /me/training-consent` exists
 * (`TrainingConsentScreen.tsx`, DPDP Act s. 6), separate from the PD-8
 * onboarding terms this screen does not otherwise touch.
 *
 * "Coverage" — added 11 Aug 2026 — R3. `GET /corpus/coverage` answers a
 * question search itself cannot: an advocate who gets nothing from their own
 * High Court needs to know that is a gap in the corpus, not a failed search.
 *
 * "Delete account" — added 23 Aug 2026. `POST /me/data-requests` was real and
 * unreached: this comment previously said no advocate-facing endpoint
 * existed, checked once against the contract doc rather than the live route
 * table (`services/api/src/app.ts:318-321`). `DeleteAccountScreen.tsx`.
 */
export function SettingsScreen({
  onOpenAlerts,
  onOpenCoverage,
  onOpenTrainingConsent,
  onOpenDeleteAccount,
  onSignedOut,
}: {
  onOpenAlerts: () => void;
  onOpenCoverage: () => void;
  onOpenTrainingConsent: () => void;
  onOpenDeleteAccount: () => void;
  onSignedOut: () => void;
}) {
  const signOut = useSession((s) => s.signOut);

  return (
    <Screen>
      <View style={styles.body}>
        <Text variant="eyebrow" style={styles.title}>
          Settings
        </Text>

        <Pressable onPress={onOpenAlerts} style={styles.row}>
          <Text variant="uiStrong">Alerts</Text>
          <ChevronRight color={color.inkMuted} size={18} strokeWidth={1.5} />
        </Pressable>

        <Pressable onPress={onOpenCoverage} style={styles.row}>
          <Text variant="uiStrong">Coverage — what we hold</Text>
          <ChevronRight color={color.inkMuted} size={18} strokeWidth={1.5} />
        </Pressable>

        {/* DPDP s. 6 — separate from the onboarding terms. `TrainingConsentScreen`. */}
        <Pressable onPress={onOpenTrainingConsent} style={styles.row}>
          <Text variant="uiStrong">Training data</Text>
          <ChevronRight color={color.inkMuted} size={18} strokeWidth={1.5} />
        </Pressable>

        <Pressable
          onPress={() => {
            void signOut().then(onSignedOut);
          }}
          style={styles.row}
        >
          <Text variant="uiStrong" style={styles.signOut}>
            Sign out
          </Text>
        </Pressable>

        <Pressable onPress={onOpenDeleteAccount} style={styles.row}>
          <Text variant="uiStrong" style={styles.signOut}>
            Delete account
          </Text>
          <ChevronRight color={color.inkMuted} size={18} strokeWidth={1.5} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: 0 },
  title: { paddingBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  signOut: { color: color.oxblood },
});
