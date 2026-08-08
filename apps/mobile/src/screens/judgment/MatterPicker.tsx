import { ScrollView, StyleSheet, View } from 'react-native';

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

  return (
    <Sheet onDismiss={onDismiss} visible={visible}>
      <Text variant="eyebrow" style={styles.title}>
        Save to which matter?
      </Text>
      {matters.length === 0 ? (
        <Text variant="ui" style={styles.empty}>
          No matters yet.
        </Text>
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
  empty: { color: color.inkMuted, padding: space.sm },
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
