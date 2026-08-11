import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { color, space } from '../theme/tokens';

/**
 * "ENROLMENT VERIFICATION PENDING" — SPRINT_5 item 3, PD-2.
 * `renders/58-signin-otp@2x.png` right panel.
 *
 * A BAND ABOVE THE HEADER, NOT A CARD IN THE FLOW — so it never competes
 * with the briefing and disappears the instant `enrolmentStatus` flips to
 * `verified`, per the render's own caption. PD-2 — this withholds NOTHING;
 * it is a credential note, never a gate, and every screen behind it works
 * identically either way.
 *
 * NEUTRAL INK, NOT AMBER — fixed 11 Aug 2026, `check-amber-reservation.mjs`.
 * The render drew this in caution amber, and amber is reserved for exactly
 * one fact: the law has moved. Whether a bar number has been checked is a
 * fact about US, not about the law, so it takes the same dashed-edge
 * treatment as every other expression of our own uncertainty —
 * `CitationMark`'s `unconfirmed` tone, `ResultCard.cardUnconfirmed`.
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
    backgroundColor: color.paper,
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderBottomColor: color.inkFaint,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    gap: 2,
  },
  title: { color: color.ink },
  body: { color: color.inkMuted },
});
