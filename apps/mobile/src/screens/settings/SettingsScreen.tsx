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
 */
export function SettingsScreen({
  onOpenAlerts,
  onSignedOut,
}: {
  onOpenAlerts: () => void;
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
