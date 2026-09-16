import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Pressable } from '../../components/Pressable';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import type { Matter } from '../../api/contract';
import { usePendingSave, type PendingSaveIntent } from '../../state/pendingSave';
import { usePractice, type Freshness } from '../../state/practice';
import { color, space } from '../../theme/tokens';

export type PickerView = 'list' | 'empty' | 'resolving' | 'unavailable';

/** What the picker may truthfully say, from Practice's own fields. */
export function pickerView(p: {
  matters: readonly unknown[];
  freshness: Freshness;
  loading: boolean;
  refreshError: string | null;
}): PickerView {
  if (p.matters.length > 0) return 'list';
  if (p.freshness.kind === 'live') return 'empty';
  if (p.loading) return 'resolving';
  if (p.refreshError !== null) return 'unavailable';
  return 'resolving';
}

/**
 * "Save to matter" needs to ask WHICH matter — the reading view previously
 * saved a highlight with no `matterId` at all, which is why nothing an
 * advocate saved could ever show up on the matter it belonged to. A picker
 * over the app-wide Practice store — no store or API client of its own.
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
 *
 * ── AN UNLOADED STORE IS NOT AN EMPTY CASELOAD, RCC R29 ──────────────────────
 *
 * `matters.length === 0` used to be read as "no matters". On a cold deep link
 * straight to a judgment nothing had hydrated Practice — only the tabs call
 * `hydrate()` — so an advocate with two matters was told they had none and
 * offered "Create a matter". The sheet now asks the store's own `hydrate()` /
 * `refresh()` when it opens, and says "no matters" only once a LIVE read
 * returned none. A failed read is not an empty caseload either.
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
  const freshness = usePractice((s) => s.freshness);
  const loading = usePractice((s) => s.loading);
  const refreshError = usePractice((s) => s.refreshError);
  const view = pickerView({ matters, freshness, loading, refreshError });
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

  /**
   * OPENING THE SHEET ESTABLISHES THE TRUTH IT IS ABOUT TO STATE. Never read:
   * `hydrate()` (cache, then network). Read but not live: `refresh()`, which
   * no-ops while one is already in flight and never empties a cached list.
   */
  useEffect(() => {
    if (!visible) return;
    const p = usePractice.getState();
    if (p.freshness.kind === 'unknown') void p.hydrate();
    else if (p.freshness.kind !== 'live') void p.refresh();
  }, [visible]);

  return (
    <Sheet onDismiss={onDismiss} visible={visible}>
      <Text variant="eyebrow" style={styles.title}>
        Save to which matter?
      </Text>
      {view === 'resolving' ? (
        <View style={styles.emptyBlock} testID="matter-picker-resolving">
          <Text variant="ui" style={styles.empty}>
            Loading your matters…
          </Text>
        </View>
      ) : view === 'unavailable' ? (
        <View style={styles.emptyBlock} testID="matter-picker-unavailable">
          <Text variant="ui" style={styles.empty}>
            Your matters could not be loaded. Check your connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void usePractice.getState().refresh()}
            style={styles.create}
          >
            <Text variant="uiStrong">Try again</Text>
          </Pressable>
        </View>
      ) : view === 'empty' ? (
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
