import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FolderOpen } from 'lucide-react-native';

import { EmptyState } from '../../components/EmptyState';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { Text } from '../../components/Text';
import type { Matter } from '../../api/contract';
import { describeCacheAge } from '../../state/offlineCache';
import { overdue, upcoming, usePractice } from '../../state/practice';
import { useSession } from '../../state/session';
import { describeHearingDate, formatGutter, todayCivil } from '../../theme/hearingDate';
import { color, space } from '../../theme/tokens';

/**
 * MATTERS — the workspace list. Inventory row 24.
 *
 * SORTED BY WHEN THE COURT NEXT WANTS THEM, not alphabetically and not by when
 * they were created. An advocate's list of cases is a queue with a clock on it;
 * ordering it by name would be ordering a diary by the alphabet.
 *
 * Matters with no next date sit at the bottom under their own rule rather than
 * being hidden or sorted to the top. They are real work — a matter awaiting an
 * order has no date and has not gone anywhere.
 */
export function MattersScreen({
  onOpenMatter,
}: {
  /**
   * THE SAME SEAM `SearchScreen.onOpenJudgment` USES — `MatterWorkspace.tsx`,
   * the desktop pane pairing. Absent on the phone, where this screen pushes
   * a route exactly as it always has.
   */
  onOpenMatter?: (matterId: string) => void;
} = {}) {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const matters = usePractice((s) => s.matters);
  const freshness = usePractice((s) => s.freshness);
  const loading = usePractice((s) => s.loading);
  const hydrate = usePractice((s) => s.hydrate);

  useEffect(() => {
    if (status === 'signed_in') void hydrate();
  }, [status, hydrate]);

  const today = useMemo(() => todayCivil(), []);
  const listed = useMemo(() => upcoming(matters, today), [matters, today]);
  const missed = useMemo(() => overdue(matters, today), [matters, today]);
  const undated = useMemo(() => matters.filter((m) => !m.nextHearingDate), [matters]);

  /**
   * `identity_only` — signed in, onboarding abandoned before a `users` row
   * existed. Not `signed_out`: sent to `/onboarding`, not `/sign-in`, the
   * same distinction `TodayScreen` makes and for the same reason.
   */
  if (status === 'identity_only') {
    return (
      <Screen topInset>
        <EmptyState
          icon={FolderOpen}
          title="Finish setting up your account"
          body="You're signed in — a name and enrolment number are all that's left before your matters are here."
          actions={[{ label: 'Finish setup', onPress: () => router.push('/onboarding' as never) }]}
        />
      </Screen>
    );
  }

  if (status !== 'signed_in') {
    return (
      <Screen topInset>
        <EmptyState
          icon={FolderOpen}
          title="Sign in to see your matters"
          body="Your research and hearing history live behind your account."
          actions={[{ label: 'Sign in', onPress: () => router.push('/sign-in' as never) }]}
        />
      </Screen>
    );
  }

  const open = (id: string) =>
    onOpenMatter ? onOpenMatter(id) : router.push({ pathname: '/matter/[id]', params: { id } });

  return (
    <Screen topInset>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <View>
            <Text variant="eyebrow">Your practice</Text>
            <Text variant="uiStrong" scale="title">
              Matters
            </Text>
          </View>
          <Pressable onPress={() => router.push('/matter/new' as never)} style={styles.addLink}>
            <Text variant="ui" style={styles.link}>
              + Add
            </Text>
          </Pressable>
        </View>

        {matters.length === 0 && !loading ? (
          <EmptyState
            icon={FolderOpen}
            title="No matters yet"
            body="Add a case to keep its hearing dates and authorities together."
            actions={[
              { label: 'Add a matter', onPress: () => router.push('/matter/new' as never) },
            ]}
          />
        ) : null}

        {listed.length > 0 ? (
          <View style={styles.block}>
            <SectionRule label="Listed" />
            {listed.map(({ matter, date }) => (
              <Row
                key={matter.matterId}
                gutter={formatGutter(date)}
                matter={matter}
                onPress={() => open(matter.matterId)}
                subtitle={`${describeHearingDate(matter.nextHearingDate!, today)} · ${matter.court}`}
              />
            ))}
          </View>
        ) : null}

        {missed.length > 0 ? (
          <View style={styles.block}>
            <SectionRule label="No next date recorded" />
            {missed.map(({ matter, date }) => (
              <Row
                key={matter.matterId}
                gutter={formatGutter(date)}
                matter={matter}
                onPress={() => open(matter.matterId)}
                subtitle="The recorded date has passed — record the next one"
              />
            ))}
          </View>
        ) : null}

        {undated.length > 0 ? (
          <View style={styles.block}>
            <SectionRule label="Awaiting a date" />
            {undated.map((matter) => (
              <Row
                key={matter.matterId}
                gutter="—"
                matter={matter}
                onPress={() => open(matter.matterId)}
                subtitle={matter.court}
              />
            ))}
          </View>
        ) : null}

        {freshness.kind === 'cached' ? (
          <Text variant="ui" style={styles.freshness}>
            Showing what is saved on this phone · {describeCacheAge(freshness.cachedAt)}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Row({
  gutter,
  matter,
  subtitle,
  onPress,
}: {
  gutter: string;
  matter: Matter;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text variant="record" style={styles.gutter}>
        {gutter}
      </Text>
      <View style={styles.rowBody}>
        <Text variant="uiStrong">{matter.caseTitle}</Text>
        <Text variant="ui" style={styles.muted}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.md, paddingBottom: space.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  addLink: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.oxblood },
  block: { gap: space.xs },
  row: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs },
  gutter: { width: 62, paddingTop: 3 },
  rowBody: { flex: 1, gap: 2 },
  muted: { color: color.inkMuted },
  freshness: { color: color.inkMuted },
});
