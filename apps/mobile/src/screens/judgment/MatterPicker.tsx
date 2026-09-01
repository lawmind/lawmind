import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Pressable } from '../../components/Pressable';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import type { Matter } from '../../api/contract';
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
 */
export function MatterPicker({
  visible,
  onDismiss,
  onPick,
}: {
  visible: boolean;
  onDismiss: () => void;
  onPick: (matterId: string) => void;
}) {
  const matters = usePractice((s) => s.matters);
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
            No matters yet. A saved authority belongs to a matter, so there is one to make
            first.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
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
