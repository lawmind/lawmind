import { StyleSheet, View } from 'react-native';
import { Clock } from 'lucide-react-native';

import { Pressable } from '../../components/Pressable';
import { Text } from '../../components/Text';
import type { SearchResult } from '../../api/contract';
import { color, radius, space } from '../../theme/tokens';

/**
 * PRECEDENT SUGGESTED WHILE DRAFTING — `FEATURE_PARITY.md` §2.7.
 *
 * A SUGGESTION CAN NEVER INTRODUCE AN UNVERIFIED CITATION. That is the whole
 * rule, and it is enforced twice on purpose:
 *
 *   1. HERE, by filtering to `verificationState === 'verified'` before anything
 *      is drawn. An authority we could not confirm is not a suggestion; it is a
 *      liability offered to someone in a hurry.
 *   2. ON THE SERVER, because `POST /documents/:id/citations` takes a
 *      `judgmentId` and re-runs the verification tiers. The client filter is
 *      presentation; presentation is not enforcement, and a replayed request or
 *      a stale build bypasses it entirely.
 *
 * `set_aside` authorities are excluded outright rather than shown with a
 * warning. Everywhere else in the product an overruled authority is displayed
 * with its status, because the advocate asked for it. Here nobody asked — we
 * are the ones proposing it — and proposing law that has been set aside is not
 * a caution to render, it is a suggestion not to make.
 */
export function PrecedentPanel({
  suggestions,
  onInsert,
}: {
  suggestions: SearchResult[];
  /** Routes through `POST /documents/:id/citations`, which re-verifies. */
  onInsert: (judgmentId: string) => void;
}) {
  const offerable = suggestions.filter(
    (s) => s.verificationState === 'verified' && s.overruledStatus !== 'set_aside'
  );

  if (!offerable.length) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Clock color={color.oxblood} size={15} strokeWidth={2} />
        <Text variant="eyebrow" style={styles.headerLabel}>
          SUGGESTED AS YOU WRITE
        </Text>
      </View>

      {offerable.map((s, i) => (
        <Pressable
          accessibilityLabel={`Insert ${s.caseTitle}`}
          accessibilityRole="button"
          key={s.judgmentId}
          onPress={() => onInsert(s.judgmentId)}
          style={[styles.row, i < offerable.length - 1 && styles.rowDivided]}
        >
          <Text variant="legal" scale="holding" style={styles.title}>
            {s.caseTitle}
          </Text>
          {/*
            The holding is empty until summarisation is wired, and an empty
            holding must not look broken — the row is the case name, and the
            line below it is extra when it exists.
          */}
          {s.holding ? (
            <Text variant="ui" style={styles.holding}>
              {s.holding}
            </Text>
          ) : null}

          {/*
            An authority that is still good law but has been doubted or partly
            set aside CAN be suggested — it is binding — but never silently.
            The advocate is told before they rely on it, not after.
          */}
          {s.overruledStatus !== 'none' ? (
            <Text variant="ui" style={styles.moved}>
              {s.overruledStatus === 'partly_set_aside'
                ? 'Part of this judgment has been set aside.'
                : 'This judgment has been doubted.'}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.oxblood,
    borderRadius: radius.base,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.rule,
  },
  headerLabel: { color: color.oxblood },
  row: { paddingHorizontal: space.sm, paddingVertical: space.xs, gap: 4 },
  rowDivided: { borderBottomWidth: 1, borderBottomColor: color.hairline },
  title: { color: color.ink },
  holding: { color: color.inkMuted },
  moved: { color: color.inkMuted },
});
