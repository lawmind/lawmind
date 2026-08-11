import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Text } from '../../components/Text';
import { DraftDetailScreen } from './DraftDetailScreen';
import { DraftsListScreen } from './DraftsListScreen';
import { color, size, space } from '../../theme/tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FROZEN — PD-15 REVERSED 12 AUG 2026, FOUNDER DIRECTION. See the identical
 * notice at the top of `ResearchWorkspace.tsx`. Left in place, inert below the
 * breakpoint on every phone; not extended further.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE DESKTOP DRAFTING WORKSPACE — same pattern as `ResearchWorkspace.tsx`
 * and `MatterWorkspace.tsx`. PD-15's reasoning again: a phone gives a draft
 * the whole screen because that is right at 390px; a desk-width screen does
 * not need to.
 *
 * REVERSIBLE BY CONSTRUCTION. Below `size.researchTwoPane` this renders
 * `<DraftsListScreen>` alone, wired exactly as `app/(tabs)/drafts.tsx` always
 * wired it — pushing `/document/[id]`. One width comparison is the switch.
 *
 * NOT A REDESIGN. `DraftsListScreen` already took an `onOpenDocument`
 * callback — built for the phone route, reused here unchanged to select a
 * pane instead. `DraftDetailScreen` is mounted with the exact props
 * `app/document/[id].tsx` already gives it.
 *
 * READ ONLY, SAME AS THE PHONE. `DraftDetailScreen` has no editing surface
 * yet (`docs/CURRENT_PLAN.md` Q1.9 — `PATCH /documents/:id` has no client
 * caller by design). This pane does not invent one.
 *
 * NO BACKEND WORK. Same `GET /documents`, same `GET /documents/:id`.
 */
export function DraftWorkspace() {
  const { width } = useWindowDimensions();
  const twoPane = width >= size.researchTwoPane;
  const router = useRouter();

  const [selected, setSelected] = useState<string | null>(null);

  if (!twoPane) {
    return (
      <DraftsListScreen
        onOpenDocument={(documentId) =>
          router.push({ pathname: '/document/[id]', params: { id: documentId } } as never)
        }
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.listPane}>
        <DraftsListScreen onOpenDocument={setSelected} />
      </View>

      <View style={styles.divider} />

      <View style={styles.detailPane}>
        {selected ? (
          <DraftDetailScreen
            documentId={selected}
            onBack={() => setSelected(null)}
            onOpenJudgment={(judgmentId, citationCheckId) =>
              router.push({
                pathname: '/judgment/[id]',
                params: { id: judgmentId, check: citationCheckId },
              })
            }
          />
        ) : (
          <EmptyPane />
        )}
      </View>
    </View>
  );
}

/** The right pane before a draft is selected — states what's missing, sells nothing. */
function EmptyPane() {
  return (
    <View style={styles.empty}>
      <Text variant="ui" style={styles.emptyText}>
        Open a draft to read it here. The list stays where it is.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  listPane: { width: size.researchListPane },
  divider: { width: 1, backgroundColor: color.rule },
  detailPane: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  emptyText: { color: color.inkFaint, textAlign: 'center' },
});

export default DraftWorkspace;
