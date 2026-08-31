import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Text } from '../../components/Text';
import { MatterScreen } from './MatterScreen';
import { MattersScreen } from './MattersScreen';
import { color, size, space } from '../../theme/tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOCAL V1 — Master Roadmap v7.1 governs and restores the advocate research
 * workstation to v1 scope. NEW3 R14 still records public advocate web as
 * `DISABLED_NOT_READY`; this is the local Expo web shell only. See the matching
 * boundary at the top of `ResearchWorkspace.tsx`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE DESKTOP MATTER WORKSPACE — same pattern as `ResearchWorkspace.tsx`,
 * applied to the matter list. PD-15's reasoning carries over unchanged: a
 * phone gives a matter the whole screen because a 390px screen is right to;
 * a 1440px one wastes most of itself doing the same thing.
 *
 * REVERSIBLE BY CONSTRUCTION, identically. Below `size.researchTwoPane` this
 * renders `<MattersScreen />` and nothing else — byte-for-byte the tab's
 * previous behaviour. One width comparison is the whole switch.
 *
 * NOT A REDESIGN. `MattersScreen` and `MatterScreen` are mounted here
 * UNCHANGED, with the props they already take. The only new seam is
 * `MattersScreen`'s optional `onOpenMatter`, mirroring `SearchScreen`'s
 * `onOpenJudgment` — without it the list pushes a route exactly as before.
 *
 * NO STACK. Research's pane holds a trail because reading one authority leads
 * to another it relied on — a matter detail does not lead to a second matter
 * detail the same way, so there is nothing here to keep a back-stack of.
 * Everything a matter detail opens (a briefing, counter-arguments, a
 * judgment, an adjournment, a client update, sharing) pushes the ordinary
 * phone route, exactly as `app/matter/[id].tsx` already does — this surface
 * is the list-plus-detail pairing, not a second navigation system.
 *
 * NO BACKEND WORK. Same `GET /matters`, same `GET /matters/:id`. No endpoint,
 * parameter or field added.
 */
export function MatterWorkspace() {
  const { width } = useWindowDimensions();
  const twoPane = width >= size.researchTwoPane;
  const router = useRouter();

  const [selected, setSelected] = useState<string | null>(null);

  if (!twoPane) return <MattersScreen />;

  return (
    <View style={styles.root}>
      <View style={styles.listPane}>
        <MattersScreen onOpenMatter={setSelected} />
      </View>

      <View style={styles.divider} />

      <View style={styles.detailPane}>
        {selected ? (
          <MatterScreen
            matterId={selected}
            onBack={() => setSelected(null)}
            onOpenBriefing={(briefingId) =>
              router.push({ pathname: '/briefing/[id]', params: { id: briefingId } })
            }
            onOpenCounterArguments={() =>
              router.push({ pathname: '/counter-arguments', params: { matterId: selected } } as never)
            }
            onOpenJudgment={(judgmentId) =>
              router.push({ pathname: '/judgment/[id]', params: { id: judgmentId } })
            }
            onRecordAdjournment={() =>
              router.push({ pathname: '/adjournment/[id]', params: { id: selected } })
            }
            onSendClientUpdate={() =>
              router.push({ pathname: '/client-update/[id]', params: { id: selected } })
            }
            onShare={() =>
              router.push({ pathname: '/matter-sharing/[id]', params: { id: selected } } as never)
            }
          />
        ) : (
          <EmptyPane />
        )}
      </View>
    </View>
  );
}

/** The right pane before a matter is selected — states what's missing, sells nothing. */
function EmptyPane() {
  return (
    <View style={styles.empty}>
      <Text variant="ui" style={styles.emptyText}>
        Open a matter to see its timeline here. The list stays where it is.
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

export default MatterWorkspace;
