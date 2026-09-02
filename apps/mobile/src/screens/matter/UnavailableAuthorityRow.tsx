import { StyleSheet, View } from 'react-native';

import { Pressable } from '../../components/Pressable';
import { Text } from '../../components/Text';
import type { MatterAuthorityUnavailable } from '../../api/contract';
import { formatLong } from '../../theme/hearingDate';
import { color, radius, space } from '../../theme/tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A SAVED AUTHORITY THE SELECTED CORPUS RELEASE DOES NOT CARRY — R17 §1.
 *
 * WHAT THIS ROW MAY SAY is fixed by the contract, and the list of things it may
 * NOT say is longer than the list of things it may: not that the judgment does
 * not exist, not that it was removed from the law, not that it is unverified,
 * not that it is still good law, and not that anything is broken upstream.
 * `corpus_unavailable` is not `SOURCE_UNAVAILABLE`; it is the narrow fact that
 * the active corpus generation does not contain this immutable target.
 *
 * SO THE ROW DRAWS ONLY WHAT THE USER OWNS. The date they saved it, and the
 * state. There is no case title here because the server sent none, and this
 * client will not supply one from a previous read: a remembered title on this
 * row would be a citation surface asserting a fact the server has just declined
 * to assert, and it would keep asserting it as the law moved underneath.
 *
 * THE SAVED DATE IS THE ONLY HANDLE THE ADVOCATE HAS, which is exactly why it
 * is drawn first and in full. It is a poor identifier and it is the honest one.
 *
 * NOT PRESSABLE. Opening `/judgment/:id` would land on a screen that must then
 * explain the same absence twice, after a navigation that promised law at the
 * end of it. The one action that still works is the one that only touches the
 * user's own database — removal — and it stays, because an advocate must not
 * have to wait for a corpus generation to take their own saved reference back
 * out of their own matter.
 *
 * NEUTRAL INK, DASHED EDGE — the house treatment for OUR uncertainty, and never
 * amber. Amber is reserved for LAW MOVED and this is not a statement about the
 * law at all.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function UnavailableAuthorityRow({
  authority,
  canRemove,
  onRemove,
  removing,
}: {
  authority: MatterAuthorityUnavailable;
  /** Owner-only, exactly as the resolved row's control is. */
  canRemove: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  const saved = savedOn(authority.addedAt);

  return (
    <View style={styles.unavailable} testID={`unavailable-authority-${authority.authorityId}`}>
      <Text variant="uiStrong">Saved, and not in this corpus release</Text>

      {saved ? (
        <Text variant="record" style={styles.muted}>
          {`Saved to this matter on ${saved}.`}
        </Text>
      ) : null}

      {/*
        Two sentences, and the second one is the one that stops the first being
        read as a verdict. "We cannot show it" and "it is not good law" are a
        short slip apart in a hurry outside a courtroom.
      */}
      <Text variant="ui" style={styles.muted}>
        The corpus release this app is reading does not contain it, so nothing about the judgment is
        shown here.
      </Text>
      <Text variant="ui" style={styles.muted}>
        This says nothing about the judgment itself. It stays in your matter.
      </Text>

      {canRemove ? (
        <Pressable
          accessibilityLabel="Remove this saved authority from this matter"
          disabled={removing}
          onPress={onRemove}
          style={styles.removeAuthority}
        >
          <Text variant="ui" style={styles.removeAuthorityLabel}>
            {removing ? 'Removing…' : 'Remove from this matter'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The device's LOCAL calendar day, for the same reason `todayCivil` uses local
 * accessors: an advocate who saved an authority at 00:30 in Delhi saved it
 * today in Delhi, and slicing the UTC prefix off the timestamp would tell them
 * yesterday. Null — and no line at all — for anything unparseable, because a
 * guessed date on the only identifying field this row has is worse than none.
 */
function savedOn(addedAt: string): string | null {
  const at = new Date(addedAt);
  if (Number.isNaN(at.getTime())) return null;
  return formatLong({ year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate() });
}

const styles = StyleSheet.create({
  /** Our own uncertainty: neutral ink, dashed edge, never amber. */
  unavailable: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    borderRadius: radius.base,
    padding: space.sm,
    gap: 4,
  },
  muted: { color: color.inkMuted },
  removeAuthority: { alignSelf: 'flex-start', marginTop: 4 },
  removeAuthorityLabel: { color: color.oxblood },
});
