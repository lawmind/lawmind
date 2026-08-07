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
export function MattersScreen() {
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

  if (status !== 'signed_in') {
    return (
      <Screen topInset>
        <EmptyState
          icon={FolderOpen}
          title="Sign in to see your matters"
          body="Six months of research, drafts and hearing history live behind your account."
          actions={[{ label: 'Sign in', onPress: () => router.push('/sign-in' as never) }]}
        />
      </Screen>
    );
  }

  const open = (id: string) => router.push({ pathname: '/matter/[id]', params: { id } });

  return (
    <Screen topInset>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="eyebrow">Your practice</Text>
        <Text variant="uiStrong" scale="title">
          Matters
        </Text>

        {matters.length === 0 && !loading ? (
          <EmptyState
            icon={FolderOpen}
            title="No matters yet"
            body="Add a case and Lawmind prepares you the night before every hearing."
          />
        ) : null}

        {listed.length > 0 ? (
          <View style={styles.block}>
            <SectionRule label="Listed" />
            {listed.map(({ matter, date }) => (
              <Row
                key={matter.id}
                gutter={formatGutter(date)}
                matter={matter}
                onPress={() => open(matter.id)}
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
                key={matter.id}
                gutter={formatGutter(date)}
                matter={matter}
                onPress={() => open(matter.id)}
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
                key={matter.id}
                gutter="—"
                matter={matter}
                onPress={() => open(matter.id)}
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
  block: { gap: space.xs },
  row: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs },
  gutter: { width: 62, paddingTop: 3 },
  rowBody: { flex: 1, gap: 2 },
  muted: { color: color.inkMuted },
  freshness: { color: color.inkMuted },
});
