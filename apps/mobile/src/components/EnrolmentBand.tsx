import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { color, space, state } from '../theme/tokens';

/**
 * "ENROLMENT VERIFICATION PENDING" — SPRINT_5 item 3, PD-2.
 * `renders/58-signin-otp@2x.png` right panel.
 *
 * A BAND ABOVE THE HEADER, NOT A CARD IN THE FLOW — so it never competes
 * with the briefing and disappears the instant `enrolmentStatus` flips to
 * `verified`, per the render's own caption. Caution amber, not danger:
 * nothing is wrong. PD-2 — this withholds NOTHING; it is a credential note,
 * never a gate, and every screen behind it works identically either way.
 */
export function EnrolmentBand({ barEnrolmentNumber }: { barEnrolmentNumber: string | null }) {
  return (
    <View style={styles.band}>
      <Text variant="uiStrong" style={styles.title}>
        Enrolment{barEnrolmentNumber ? ` ${barEnrolmentNumber}` : ''} is being verified
      </Text>
      <Text variant="ui" style={styles.body}>
        Usually two working days. Everything works meanwhile — this banner is the only
        difference.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: state.cautionWash,
    borderBottomWidth: 1,
    borderBottomColor: state.caution,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    gap: 2,
  },
  title: { color: state.cautionText },
  body: { color: color.inkMuted },
});
