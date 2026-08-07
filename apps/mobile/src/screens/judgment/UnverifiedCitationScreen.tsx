import { useEffect, useState, type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Check, ChevronLeft, CircleDot, Clock, X } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '../../components/Button';
import { CitationMark } from '../../components/CitationMark';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { CitationCheck, CitationTier, JudgmentDetail } from '../../api/contract';
import {
  coverageLine,
  isoFromServerTimestamp,
  nothingIndependentRan,
  tierMark,
} from '../../citation/tiers';
import { easing } from '../../theme/easing';
import { haptics } from '../../theme/haptics';
import { color, radius, space, state } from '../../theme/tokens';

/**
 * THE UNVERIFIED CITATION DETAIL — canvas `10i`, inventory row 22,
 * `renders/49-unverified-citation@2x.png`.
 *
 * Four sources, each with its own result and a timestamp. NO RED, NO TRIANGLE,
 * NO "FAILED" — the language throughout is what we did and did not manage. The
 * eCourts captcha is stated as OUR limitation, not the advocate's problem, and
 * the navigation path is given so checking takes a minute rather than ten.
 *
 * This screen is the reason an unverified citation can be shown at all. Without
 * it the mark is an unexplained warning; with it the advocate can finish the
 * job in sixty seconds and mark the citation themselves — which is Tier 3.
 */
export function UnverifiedCitationScreen({
  judgment,
  citationCheckId,
  onBack,
}: {
  judgment: JudgmentDetail;
  /** From the search result that led here. Absent on a cold open. */
  citationCheckId?: string;
  onBack: () => void;
}) {
  const [check, setCheck] = useState<CitationCheck | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!citationCheckId) {
      setUnavailable(true);
      return;
    }
    let alive = true;
    void api.citationCheck(citationCheckId).then((r) => {
      if (!alive) return;
      if (r.ok) setCheck(r.data);
      else setUnavailable(true);
    });
    return () => {
      alive = false;
    };
  }, [citationCheckId]);

  return (
    // Rendered from JudgmentScreen, which is a `headerShown: false` route, so
    // the nav here is the top of the screen and nothing above it clears the
    // status bar.
    <Screen topInset>
      <View style={styles.nav}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack}>
          <ChevronLeft color={color.ink} size={22} strokeWidth={1.5} />
        </Pressable>
        <Text variant="uiStrong" style={styles.navTitle}>
          Citation
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/*
          THE HIGHEST-LEVERAGE MOMENT IN THE PRODUCT, and until now it changed
          a label and disabled a button.

          The advocate solved a captcha we are not allowed to bypass, read the
          cause list themselves, and PERSONALLY VOUCHED for this authority. That
          is Tier 3, it is cached permanently, and nobody in their chamber ever
          has to do it again. It is rare and it is high-emotion, which is
          exactly what earns a delight budget — the four-question gate that
          rejects animation on a result card passes it here on frequency alone.

          IT FADES OUT — IT DOES NOT SOLIDIFY. The audit proposed transitioning
          the dashed edge to solid, and that collides with two settled rules.
          Verified is silent: a confirmed citation carries no badge, and turning
          our mark into a solid one would be decorating verification. Worse,
          SOLID NEUTRAL IS ALREADY TAKEN — `moved-quiet` is a solid neutral mark
          meaning "doubted · referred". A confirmed citation and a doubted one
          would become the same shape in greyscale, which is the one
          discriminator `CitationMark.test.tsx` exists to protect.

          So the dashed edge stops being dashed by ceasing to exist. 260ms
          `easing.out`, with the `commit` haptic on the same frame — the mark
          the advocate has been looking at lifts off, and what is left is a
          citation with nothing on it. Silence is the reward.
        */}
        <FadeOut gone={confirmed} onGone={haptics.commit}>
          <CitationMark label="Not confirmed" tone="unconfirmed" />
        </FadeOut>

        <Text variant="legal" scale="caseName">
          {judgment.caseTitle}
        </Text>
        <Text opticalNudge variant="record" style={styles.record}>
          {judgment.neutralCitation}
        </Text>
        <Text opticalNudge variant="record" style={styles.record}>
          {judgment.court}
        </Text>

        <View style={styles.rule} />

        {check ? (
          <>
            {/*
              "WHAT WE FOUND" IS NOW THE HONEST HEADLINE, AND IN S1 IT IS
              USUALLY NOT A FAILURE.

              Two of the three tiers have not shipped. An unverified citation
              has therefore, in almost every case, NOT been checked against an
              independent source and failed — it has not been checked at all.
              Saying "we could not confirm this" without saying that sends the
              advocate hunting a problem that does not exist, and it lets the
              harness compute a confirmation rate over checks that never ran.
            */}
            <View style={styles.found}>
              <Text variant="eyebrow">What we found</Text>
              <Text variant="legal">
                {nothingIndependentRan(check)
                  ? 'We hold no independent confirmation of this citation, because the sources that would give it have not shipped yet. It has not failed a check — no check has run.'
                  : 'We queried the sources below and none of them held a record of this citation.'}
              </Text>
              <Text variant="ui" style={styles.muted}>
                {coverageLine(check.coverage)}
              </Text>
            </View>

            <SectionRule label="Where we looked" />
            {check.tiers.map((tier) => (
              <SourceRow key={tier.tier} tier={tier} />
            ))}

            {/*
              NEVER BYPASS THE CAPTCHA. This opens eCourts with the search
              pre-filled; the advocate solves it. Their confirmation is Tier 3
              and caches permanently.

              THE URL IS FETCHED ON TAP, NEVER CONSTRUCTED HERE. An eCourts path
              assembled client-side would be a guess at another service's routing
              — and a wrong one lands the advocate on a search for a different
              case, which is worse than no link.
            */}
            <Button
              label={confirmed ? 'Marked as confirmed' : 'Open eCourts — about a minute'}
              onPress={() => {
                void api.verifyEcourts(judgment.neutralCitation).then((r) => {
                  if (r.ok) void Linking.openURL(r.data.ecourtsUrl);
                  else setUnavailable(true);
                });
              }}
              variant="secondary"
            />
            <Button
              disabled={confirmed}
              label={confirmed ? 'You confirmed this' : 'I verified it — mark it'}
              onPress={() => {
                setConfirmed(true);
                void api.verifyConfirm(judgment.neutralCitation, judgment.judgmentId);
              }}
            />
            <Text variant="ui" style={styles.muted}>
              Marking it records that you checked it yourself. We keep that permanently, so nobody
              in your chamber has to check it twice.
            </Text>
          </>
        ) : unavailable ? (
          /*
            The verification record is a separate row from the citation. Failing
            to read it says nothing about the citation, and the screen says so
            rather than leaving a skeleton that never resolves.
          */
          <Text variant="ui" style={styles.muted}>
            We could not open the record of where we looked. That is our record failing to load, not
            a finding about this citation.
          </Text>
        ) : (
          <SkeletonCard index={0} />
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * The mark lifting off once the advocate has vouched for the citation.
 *
 * IT KEEPS ITS SPACE. Opacity only, no layout change — the reasons, the source
 * rows and the buttons below it are what the advocate is reading, and reflowing
 * the page under them to reclaim 20px would be moving content for style.
 *
 * The haptic fires in the same synchronous block as the animation, so the
 * confirmation is felt on the frame the mark starts to go. Split them by even a
 * tick and it stops reading as one event.
 */
function FadeOut({
  gone,
  onGone,
  children,
}: {
  gone: boolean;
  onGone?: () => void;
  children: ReactNode;
}) {
  const progress = useSharedValue(1);

  useEffect(() => {
    if (!gone) return;
    onGone?.();
    progress.value = withTiming(0, { duration: 260, easing: easing.out });
  }, [gone, onGone, progress]);

  const style = useAnimatedStyle(() => ({ opacity: progress.value }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function SourceRow({ tier }: { tier: CitationTier }) {
  const mark = tierMark(tier);

  /**
   * OUR OWN LIMITATIONS ARE NEUTRAL INK, NOT AMBER.
   *
   * FLAGGED: `renders/49-unverified-citation@2x.png` draws this row's glyph in
   * amber. `design/DESIGN_SYSTEM.md` §3a reserves `#B4690E` for "the law has
   * moved, and nothing else — never on drafts, OCR, or anything about our own
   * confidence", and a captcha we cannot solve, or a tier we have not shipped,
   * is exactly our own limitation. Following the reserve rule, because diluting
   * amber costs more than a design nit: an advocate who learns amber sometimes
   * means "us" will read past it when it means the law moved.
   *
   * A CLOCK, NOT A CROSS, FOR A TIER THAT HAS NOT SHIPPED. The cross says an
   * independent source was asked and had nothing. Giving both the cross is the
   * collapse this screen exists to prevent.
   */
  const Icon =
    mark.tone === 'found' ? Check : mark.tone === 'absent' ? X : mark.isCoverageGap ? Clock : CircleDot;
  const tint = mark.tone === 'found' ? state.verified : color.inkFaint;

  return (
    <View style={styles.sourceRow}>
      <Icon color={tint} size={18} strokeWidth={1.8} />
      <View style={styles.sourceText}>
        <Text variant="uiStrong">{mark.label}</Text>
        <Text variant="ui" style={styles.muted}>
          {/*
            A TIME ONLY WHERE A CHECK RAN. "Checked 4 minutes ago" beside a tier
            that never executed is asserting diligence we did not perform.
          */}
          {mark.detail}
          {mark.at && relativeTime(mark.at) ? ` ${relativeTime(mark.at)}` : ''}
        </Text>
      </View>
    </View>
  );
}

/**
 * "Checked 4 minutes ago". A timestamp an advocate has to decode is not a
 * timestamp.
 *
 * RETURNS NULL RATHER THAN ARITHMETIC ON A BAD DATE. The server sends a
 * Postgres timestamp that Hermes cannot parse, and `Date.now() - NaN` propagates
 * all the way to "Checked NaN hours ago." — see `isoFromServerTimestamp`.
 */
function relativeTime(at: string): string | null {
  const iso = isoFromServerTimestamp(at);
  if (!iso) return null;

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return 'Checked just now.';
  if (minutes === 1) return 'Checked a minute ago.';
  if (minutes < 60) return `Checked ${minutes} minutes ago.`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'Checked an hour ago.' : `Checked ${hours} hours ago.`;
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  navTitle: { flex: 1 },
  body: { padding: space.sm, gap: space.xs, paddingBottom: space.xxl },
  record: { color: color.inkFaint },
  rule: { height: 1, backgroundColor: color.ink, marginVertical: space.xs },
  found: {
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    backgroundColor: color.card,
    padding: space.sm,
    gap: space.xs,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: space.xs,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  sourceText: { flex: 1, gap: 2 },
  muted: { color: color.inkMuted },
});
