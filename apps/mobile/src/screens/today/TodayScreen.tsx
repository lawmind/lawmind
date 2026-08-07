import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import { describeCacheAge } from '../../state/offlineCache';
import { useSession } from '../../state/session';
import {
  alsoThisWeek,
  listedToday,
  overdue,
  tomorrowsBriefing,
  usePractice,
  type ListedMatter,
} from '../../state/practice';
import {
  describeHearingDate,
  formatGutter,
  todayCivil,
  weekdayName,
} from '../../theme/hearingDate';
import { color, space } from '../../theme/tokens';
import { BriefingSeal } from './BriefingSeal';

/**
 * TODAY — inventory row 7, canvas `6a`, `renders/31-today@2x.png`.
 *
 * The first screen of the daily loop and the reason the app is opened at all.
 * `PRODUCT_BRIEF.md`: "the loop creates the habit; the library only prevents a
 * feature-comparison loss."
 *
 * THE ORDER ON THIS SCREEN IS THE ORDER OF A MORNING, and it is not negotiable:
 *
 *   1. anything listed TODAY — the advocate is about to leave for court;
 *   2. tomorrow's briefing, if it is ready — the wedge;
 *   3. the rest of the week — planning, not action;
 *   4. matters whose recorded date has PASSED — an adjournment was never
 *      recorded, and this is the only place that is visible.
 *
 * (4) is last deliberately. It is a correction, not a plan, and putting a
 * correction above a hearing that starts in an hour is how a screen gets ignored.
 *
 * NO VERIFIED BADGE ANYWHERE ON THIS SCREEN. Verified is silent.
 */
export function TodayScreen() {
  const router = useRouter();
  const profile = useSession((s) => s.profile);
  const status = useSession((s) => s.status);

  const matters = usePractice((s) => s.matters);
  const briefings = usePractice((s) => s.briefings);
  const freshness = usePractice((s) => s.freshness);
  const loading = usePractice((s) => s.loading);
  const hydrate = usePractice((s) => s.hydrate);
  const loadBriefings = usePractice((s) => s.loadBriefings);

  useEffect(() => {
    if (status === 'signed_in') void hydrate();
  }, [status, hydrate]);

  const today = useMemo(() => todayCivil(), []);
  const listed = useMemo(() => listedToday(matters, today), [matters, today]);
  const week = useMemo(() => alsoThisWeek(matters, today), [matters, today]);
  const missed = useMemo(() => overdue(matters, today), [matters, today]);

  /**
   * Only tomorrow's matters are asked for a briefing. Pulling every matter's
   * briefings to find one is a request per case on a court-corridor connection,
   * and the screen only ever shows the 24-hour one.
   */
  const tomorrowIds = useMemo(
    () => week.filter((m) => m.daysAway === 1).map((m) => m.matter.id),
    [week]
  );
  useEffect(() => {
    for (const id of tomorrowIds) void loadBriefings(id);
  }, [tomorrowIds, loadBriefings]);

  const ready = useMemo(
    () => tomorrowsBriefing(matters, briefings, today),
    [matters, briefings, today]
  );

  if (status !== 'signed_in') {
    return (
      <Screen topInset>
        <EmptyState
          icon={CalendarDays}
          title="Sign in to see your day"
          body="Your matters, tomorrow's briefing and today's listings live behind your account."
          actions={[{ label: 'Sign in', onPress: () => router.push('/sign-in' as never) }]}
        />
      </Screen>
    );
  }

  const greeting = profile?.fullName ? `Good morning,\n${profile.fullName}` : 'Good morning';

  return (
    <Screen topInset>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="eyebrow">
          {weekdayName(today).toUpperCase()}, {formatGutter(today)}
        </Text>
        <Text variant="uiStrong" scale="title" style={styles.greeting}>
          {greeting}
        </Text>

        {/* 1 · listed today */}
        {listed.length > 0 ? (
          <View style={styles.block}>
            <SectionRule label={listed.length === 1 ? 'Listed today' : `Listed today · ${listed.length}`} accent />
            {listed.map((row) => (
              <HearingRow key={row.matter.id} row={row} onPress={() => router.push({ pathname: '/matter/[id]', params: { id: row.matter.id } })} />
            ))}
            <Pressable onPress={() => router.push('/cause-list' as never)} style={styles.causeListLink}>
              <Text variant="ui" style={styles.link}>
                Open the cause list
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* 2 · tomorrow's briefing */}
        {ready ? (
          <Card style={styles.briefingCard}>
            <View style={styles.briefingHead}>
              <BriefingSeal />
              <View style={styles.briefingHeadText}>
                <Text variant="eyebrow" style={styles.briefingEyebrow}>
                  Briefing ready
                </Text>
                <Text variant="record">{formatGutter(today)}</Text>
              </View>
            </View>

            <Text variant="uiStrong">
              Tomorrow — {ready.briefing.subject || ready.matter.caseTitle}
            </Text>
            <Text variant="ui" style={styles.muted}>
              {ready.matter.caseTitle} · {ready.matter.court}
            </Text>

            {/*
              AN UNCONFIRMED LISTING IS NEVER PRESENTED AS CONFIRMED — the same
              rule as a citation. `dateConfidence` has three states and only one
              of them deserves a caution: `never_checked` means no cause list was
              consulted, which is NORMAL for a date the advocate typed (PD-12).
            */}
            {ready.briefing.datesNotConfirmed ? (
              <Text variant="ui" style={styles.notConfirmed}>
                We could not confirm this listing against the cause list. The date is the one you
                recorded.
              </Text>
            ) : null}

            <View style={styles.briefingRule} />

            <Text variant="ui" style={styles.muted}>
              {ready.briefing.authorities.length}{' '}
              {ready.briefing.authorities.length === 1 ? 'authority' : 'authorities'} ·{' '}
              {ready.briefing.checklist.length} to prepare
            </Text>

            <Button
              label="Open briefing"
              onPress={() => router.push({ pathname: '/briefing/[id]', params: { id: ready.briefing.id } })}
              style={styles.briefingAction}
            />
            <Text variant="ui" style={styles.savedLine}>
              Saved for offline · {describeCacheAge(ready.cachedAt)}
            </Text>
          </Card>
        ) : loading && matters.length === 0 ? (
          <SkeletonCard />
        ) : null}

        {/* 3 · the rest of the week */}
        {week.length > 0 ? (
          <View style={styles.block}>
            <SectionRule label="Also this week" />
            {week.map((row) => (
              <HearingRow key={row.matter.id} row={row} onPress={() => router.push({ pathname: '/matter/[id]', params: { id: row.matter.id } })} />
            ))}
          </View>
        ) : null}

        {/* 4 · dates that have passed */}
        {missed.length > 0 ? (
          <View style={styles.block}>
            <SectionRule label="No next date recorded" />
            {missed.map((row) => (
              <Pressable
                key={row.matter.id}
                onPress={() => router.push({ pathname: '/adjournment/[id]', params: { id: row.matter.id } })}
                style={styles.row}
              >
                <Text variant="record" style={styles.gutter}>
                  {formatGutter(row.date)}
                </Text>
                <View style={styles.rowBody}>
                  <Text variant="uiStrong">{row.matter.caseTitle}</Text>
                  <Text variant="ui" style={styles.muted}>
                    Heard {describeHearingDate(row.matter.nextHearingDate!, today).toLowerCase()} ·
                    record the next date
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {matters.length === 0 && !loading ? (
          <EmptyState
            icon={CalendarDays}
            title="No matters yet"
            body="Add a case and Lawmind prepares you the night before every hearing."
            actions={[{ label: 'Add a matter', onPress: () => router.push('/matters' as never) }]}
          />
        ) : null}

        {/*
          THE AGE OF WHAT IS ON SCREEN, SAID PLAINLY.
          Offline reads are not live reads, and a screen that hides its own age
          lets a stale listing read as this morning's.
        */}
        {freshness.kind === 'cached' ? (
          <Text variant="ui" style={styles.freshness}>
            Showing what is saved on this phone · {describeCacheAge(freshness.cachedAt)}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function HearingRow({ row, onPress }: { row: ListedMatter; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text variant="record" style={styles.gutter}>
        {formatGutter(row.date)}
      </Text>
      <View style={styles.rowBody}>
        <Text variant="uiStrong">{row.matter.caseTitle}</Text>
        <Text variant="ui" style={styles.muted}>
          {describeHearingDate(row.matter.nextHearingDate!, todayCivil())} · {row.matter.court}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.md, paddingBottom: space.xxl },
  greeting: { marginTop: space.xs },
  block: { gap: space.xs },

  briefingCard: { gap: space.xs, borderTopWidth: 2, borderTopColor: color.oxblood },
  briefingHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  briefingHeadText: { gap: 2 },
  briefingEyebrow: { color: color.oxblood },
  briefingRule: { height: 1, backgroundColor: color.hairline, marginVertical: space.xs },
  briefingAction: { marginTop: space.xs },
  savedLine: { color: color.inkMuted, textAlign: 'center', paddingTop: space.xs },

  row: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs, alignItems: 'flex-start' },
  gutter: { width: 62, paddingTop: 3 },
  rowBody: { flex: 1, gap: 2 },

  muted: { color: color.inkMuted },
  link: { color: color.oxblood },
  causeListLink: { paddingVertical: space.xs },
  /**
   * NEUTRAL INK, NOT AMBER. Amber `#B4690E` means THE LAW HAS MOVED and nothing
   * else — never our own confidence about a listing.
   */
  notConfirmed: { color: color.inkMuted },
  freshness: { color: color.inkMuted, paddingTop: space.sm },
});
