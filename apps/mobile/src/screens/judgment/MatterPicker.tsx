import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Pressable } from '../../components/Pressable';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import type { Matter } from '../../api/contract';
import { usePendingSave, type PendingSaveIntent } from '../../state/pendingSave';
import { usePractice } from '../../state/practice';
import { color, space } from '../../theme/tokens';

/**
 * "Save to matter" needs to ask WHICH matter — the reading view previously
 * saved a highlight with no `matterId` at all, which is why nothing an
 * advocate saved could ever show up on the matter it belonged to. A picker
 * over the matters already loaded app-wide, nothing fetched fresh.
 *
 * THERE IS NO "SAVE WITHOUT A MATTER" HERE, and that is a decision rather than
 * an omission. Saved authorities are matter-scoped for real, at the server:
 * `matter.saved_authorities` hangs off a matter and the three citation fields
 * are joined per matter on every read. A general saved list would be a store
 * nothing writes and nothing reads, and offering to save into it would be the
 * kind of promise this product exists not to make.
 *
 * ── THE EMPTY CASE CARRIES THE SAVE ACROSS, 1 September 2026 ────────────────
 *
 * NEW3 R16 §8, `R16-RCC-04`: `CREATE_THEN_AUTO_SAVE_PENDING_AUTHORITY`.
 *
 * "Create a matter" used to push `/matter/new` and DROP the thing being saved.
 * An advocate saving their first authority — the population with no matters, by
 * definition — followed the only route this sheet offered and lost the save
 * silently. The intent is now held (`state/pendingSave.ts`) and performed
 * against the new matter's id.
 *
 * STILL NOT A GLOBAL SAVED LIST. What is held is an INTENT, on this device, for
 * minutes, destroyed the moment it is performed or abandoned. `intent` is
 * optional so a caller that has not adopted it behaves exactly as before —
 * pushing the form and holding nothing.
 */
export function MatterPicker({
  visible,
  onDismiss,
  onPick,
  intent,
}: {
  visible: boolean;
  onDismiss: () => void;
  onPick: (matterId: string) => void;
  /**
   * WHAT THIS SHEET WAS OPENED TO SAVE, for the empty case only.
   *
   * Captured when — and only when — the advocate leaves for the create form, so
   * a picker that is opened and dismissed holds nothing. Omit it and "Create a
   * matter" behaves exactly as it did before: a push, and no held intent.
   */
  intent?: PendingSaveIntent;
}) {
  const matters = usePractice((s) => s.matters);
  const capture = usePendingSave((s) => s.capture);
  /**
   * THE PICKER OWNS THIS DESTINATION RATHER THAN TAKING IT AS A PROP.
   *
   * Three screens mount this sheet — the judgment, the reading view and search
   * — and two of them navigate entirely through callback props supplied by
   * their route file. Threading a fourth callback through both of those, and
   * through the two route files above them, to reach one fixed route would be
   * five files changed to say `/matter/new` once.
   */
  const router = useRouter();

  return (
    <Sheet onDismiss={onDismiss} visible={visible}>
      <Text variant="eyebrow" style={styles.title}>
        Save to which matter?
      </Text>
      {matters.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text variant="ui" style={styles.empty}>
            {intent
              ? 'No matters yet. A saved authority belongs to a matter — make one and this will be saved to it.'
              : 'No matters yet. A saved authority belongs to a matter, so there is one to make first.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              /*
                CAPTURED HERE, not when the sheet opened. Opening a picker and
                changing your mind must leave nothing behind; leaving for the
                create form is the moment the intent becomes real.
              */
              if (intent) capture(intent);
              onDismiss();
              router.push('/matter/new' as never);
            }}
            style={styles.create}
          >
            <Text variant="uiStrong">Create a matter</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={styles.list}>
          {matters.map((m) => (
            <MatterRow
              key={m.matterId}
              matter={m}
              onPress={() => {
                onPick(m.matterId);
                onDismiss();
              }}
            />
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

function MatterRow({ matter, onPress }: { matter: Matter; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <Text variant="uiStrong">{matter.caseTitle}</Text>
      <Text variant="ui" style={styles.rowSub}>
        {matter.court}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: space.sm, paddingTop: space.xs },
  emptyBlock: { padding: space.sm, gap: space.xs },
  empty: { color: color.inkMuted },
  create: {
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.ink,
    backgroundColor: color.card,
  },
  list: { maxHeight: 360 },
  row: {
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  rowSub: { color: color.inkMuted },
});
