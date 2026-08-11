import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { EnrolmentBand } from '../../components/EnrolmentBand';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import type { Alert } from '../../api/contract';
import { alertNarrative } from '../../citation/alertNarrative';
import { useAlerts } from '../../state/alerts';
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
  parseCivilDate,
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

  const alerts = useAlerts((s) => s.alerts);
  const fetchAlerts = useAlerts((s) => s.fetch);
  const markAlertRead = useAlerts((s) => s.markRead);

  useEffect(() => {
    if (status === 'signed_in') void hydrate();
  }, [status, hydrate]);

  /**
   * ONCE ON MOUNT, NEVER POLLED. PD-6: batched, arrives with the briefing —
   * this is not a feed, and there is no re-fetch interval to accidentally
   * turn it into one.
   */
  useEffect(() => {
    if (status === 'signed_in') void fetchAlerts();
  }, [status, fetchAlerts]);

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * IMMEDIATE ALERTS ARE RENDERED HERE TOO — corrected 11 Aug 2026.
   * ─────────────────────────────────────────────────────────────────────────
   *
   * This block used to filter `severity === 'batched'` and drop the rest, on
   * the stated reasoning that an immediate alert "already reached the advocate
   * as a push, so showing it again would be the same event twice."
   *
   * THE PREMISE IS FALSE IN THE CODE THAT PRODUCES THEM.
   * `services/api/src/citations/fanout.ts` pushes only
   * `if (highSeverity === 'immediate' && row.expo_push_token)`. An advocate who
   * declined notifications, or who has not registered a token yet, gets NO
   * push — and the alert row exists in the API, rendered by nothing.
   *
   * What is dropped is the most severe alert in the product: an authority the
   * advocate has FILED OR COPIED going `set_aside` or `partly_set_aside`.
   * Silent-drop rate carries a zero threshold, and this was a silent drop of
   * exactly the class the threshold exists for.
   *
   * They are drawn ABOVE "since yesterday" and under their own heading rather
   * than merged into it — PD-6 keeps the batched block as the evening digest,
   * and folding a filed-citation emergency into a digest is what the severity
   * split exists to prevent. A duplicate of a push the advocate did receive is
   * a far smaller cost than an alert they never see.
   */
  const immediate = useMemo(() => alerts.filter((a) => a.severity === 'immediate'), [alerts]);
  const batched = useMemo(() => alerts.filter((a) => a.severity === 'batched'), [alerts]);

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
    () => week.filter((m) => m.daysAway === 1).map((m) => m.matter.matterId),
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
      {profile?.enrolmentStatus === 'unverified' ? (
        <EnrolmentBand barEnrolmentNumber={profile.barEnrolmentNumber} />
      ) : null}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.headRow}>
          <Text variant="eyebrow">
            {weekdayName(today).toUpperCase()}, {formatGutter(today)}
          </Text>
          <Pressable
            accessibilityLabel="Profile"
            accessibilityRole="button"
            onPress={() => router.push('/profile' as never)}
            style={styles.avatar}
          >
            <Text variant="uiStrong" style={styles.avatarLabel}>
              {initials(profile?.fullName)}
            </Text>
          </Pressable>
        </View>
        <Text variant="uiStrong" scale="title" style={styles.greeting}>
          {greeting}
        </Text>

        {/* 1 · listed today */}
        {listed.length > 0 ? (
          <View style={styles.block}>
            <SectionRule label={listed.length === 1 ? 'Listed today' : `Listed today · ${listed.length}`} accent />
            {listed.map((row) => (
              <HearingRow key={row.matter.matterId} row={row} onPress={() => router.push({ pathname: '/matter/[id]', params: { id: row.matter.matterId } })} />
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

            {/*
              THE CASE NAME FROM THE MATTER, which is where it lives. This read
              `ready.briefing.subject` first — a field the briefing index has
              never sent — so the `||` fallback was carrying the line every
              time, and the "real" value was fiction.
            */}
            <Text variant="uiStrong">Tomorrow — {ready.matter.caseTitle}</Text>
            <Text variant="ui" style={styles.muted}>
              {ready.matter.court}
            </Text>

            {/*
              AN UNCONFIRMED LISTING IS NEVER PRESENTED AS CONFIRMED — the same
              rule as a citation. `dateConfidence` has three states and only one
              of them deserves a caution: `never_checked` means no cause list was
              consulted, which is NORMAL for a date the advocate typed (PD-12).
            */}
            {ready.briefing.dateConfidence.state === 'not_confirmed' ? (
              <Text variant="ui" style={styles.notConfirmed}>
                We could not confirm this listing against the cause list. The date is the one you
                recorded.
              </Text>
            ) : null}

            <View style={styles.briefingRule} />

            {/*
              NO COUNT OF AUTHORITIES OR CHECKLIST ITEMS HERE, because this card
              is built from the briefing INDEX and the index carries neither.
              `route.ts` says why it does not: re-reading every authority of
              every briefing to render a list of dates is a lot of work to
              produce something nobody reads.

              The line that stood here read `.authorities.length` and
              `.checklist.length` off a row that has neither — `undefined.length`,
              which throws. It never fired only because a second defect kept
              this whole card from rendering: `tomorrowsBriefing` compared a
              `matterId` the index does not send, so it always returned null.
              One bug was hiding the other.
            */}
            <Text variant="ui" style={styles.muted}>
              Prepared {formatGutter(parseCivilDate(ready.briefing.generatedAt.slice(0, 10)) ?? today)}
            </Text>

            <Button
              label="Open briefing"
              onPress={() =>
                router.push({
                  pathname: '/briefing/[id]',
                  params: { id: ready.briefing.briefingId },
                })
              }
              style={styles.briefingAction}
            />
            <Text variant="ui" style={styles.savedLine}>
              Saved for offline · {describeCacheAge(ready.cachedAt)}
            </Text>
          </Card>
        ) : loading && matters.length === 0 ? (
          <SkeletonCard />
        ) : null}

        {/*
          AN AUTHORITY YOU HAVE ALREADY USED HAS MOVED.

          Drawn above the digest and above the week, because it is the only
          thing on this screen that concerns a document already filed. It is
          NOT amber-banded as a group: amber belongs to the individual
          authority's status, which each row states in its own words, and a
          coloured container around a list would spend the reserved colour on
          our own sense of urgency.
        */}
        {immediate.length > 0 ? (
          <Card style={styles.alertsCard}>
            <Text variant="eyebrow" style={styles.immediateEyebrow}>
              An authority you have used has moved
            </Text>
            {immediate.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onPress={() => {
                  markAlertRead(alert.id);
                  router.push({ pathname: '/judgment/[id]', params: { id: alert.judgmentId } });
                }}
              />
            ))}
          </Card>
        ) : null}

        {/* Since yesterday — PD-6, batched with the briefing, never a notifications tab. */}
        {batched.length > 0 ? (
          <Card style={styles.alertsCard}>
            <Text variant="eyebrow">Since yesterday</Text>
            {batched.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onPress={() => {
                  markAlertRead(alert.id);
                  router.push({ pathname: '/judgment/[id]', params: { id: alert.judgmentId } });
                }}
              />
            ))}
          </Card>
        ) : null}

        {/* 3 · the rest of the week */}
        {week.length > 0 ? (
          <View style={styles.block}>
            <SectionRule label="Also this week" />
            {week.map((row) => (
              <HearingRow key={row.matter.matterId} row={row} onPress={() => router.push({ pathname: '/matter/[id]', params: { id: row.matter.matterId } })} />
            ))}
          </View>
        ) : null}

        {/* 4 · dates that have passed */}
        {missed.length > 0 ? (
          <View style={styles.block}>
            <SectionRule label="No next date recorded" />
            {missed.map((row) => (
              <Pressable
                key={row.matter.matterId}
                onPress={() => router.push({ pathname: '/adjournment/[id]', params: { id: row.matter.matterId } })}
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
            actions={[{ label: 'Add a matter', onPress: () => router.push('/matter/new' as never) }]}
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

/**
 * Only the two `kind`s that actually exist on the wire — see `contract.ts`'s
 * `Alert` type note. Copy mirrors the alert-settings labels so the same
 * event reads the same way in both places.
 */
/**
 * ONE ALERT. The narrative comes from `citation/alertNarrative.ts` — an alert
 * is a report of a CHANGE, and this row used to render only the current status,
 * which dropped the movement, dropped the paragraphs, and rendered a corpus
 * reading of `none` as "good law again" — a claim that a court restored the
 * authority, which nothing in the data says.
 */
function AlertRow({ alert, onPress }: { alert: Alert; onPress: () => void }) {
  const { headline, movement, sinceThen } = alertNarrative(alert);

  return (
    <Pressable onPress={onPress} style={styles.alertRow}>
      <Text variant="ui" style={alert.readAt === null ? styles.alertUnread : styles.muted}>
        {headline}
      </Text>
      <Text variant="ui" style={styles.muted}>
        {movement}
      </Text>
      {/*
        THE CORPUS HAS MOVED AGAIN SINCE THIS ALERT FIRED. Said, never used to
        silently replace the alert's own subject — the advocate is the one who
        has to decide which reading they act on, and they cannot do that if we
        show them only one.
      */}
      {sinceThen ? (
        <Text variant="ui" style={styles.alertSince}>
          {sinceThen}
        </Text>
      ) : null}
    </Pressable>
  );
}

function initials(name: string | undefined): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
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
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: { color: color.card },
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

  alertsCard: { gap: space.xs },
  alertRow: { paddingVertical: space.xs },
  /** Neutral ink, never amber — amber means the law moved on a CITATION surface; this is a summary line about it. */
  alertSince: { color: color.ink },
  immediateEyebrow: { color: color.oxblood },
  alertUnread: { color: color.ink },
});
