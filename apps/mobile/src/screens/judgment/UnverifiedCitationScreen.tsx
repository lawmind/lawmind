import { useEffect, useState, type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
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
import { runAttempt } from '../../api/attempt';
import { api } from '../../api/client';
import { useAttempt } from '../../hooks/useAttempt';
import type {
  CitationCheck,
  CitationTier,
  EcourtsPath,
  JudgmentDetail,
} from '../../api/contract';
import { citationDisplay } from '../../citation/citationDisplay';
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
  /**
   * The citation slot and the string we actually hold — one helper, same
   * semantics as every other surface. `stored` is what an API may be handed;
   * `text` is what a person may be shown. They are never the same variable.
   */
  const citation = citationDisplay(judgment);
  const citationStored = citation.stored;

  const [check, setCheck] = useState<CitationCheck | null>(null);
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * `confirmed` NOW MEANS THE SERVER SAID SO. IT USED TO MEAN THE ADVOCATE
   * TAPPED.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The button did `setConfirmed(true)` and then `void api.verifyConfirm(...)`,
   * discarding the promise. `verifyConfirm` was also sending no bearer token
   * (fixed in `client.ts`, 2 September 2026), so the server answered
   * `AUTH_REQUIRED` and wrote nothing — every single time. The screen said "You
   * confirmed this" and no `citation_checks` row existed.
   *
   * That is the shape of failure this product exists to refuse. Tier 3 IS the
   * advocate's own vouch, kept permanently so nobody in their chamber checks the
   * same citation twice; a vouch we did not record is a vouch the next person in
   * that chamber will have to make again, believing it was already done.
   *
   * So there are three states and the screen renders all three honestly:
   * untouched, in flight, and confirmed — plus a failure that says what happened
   * in our own terms and leaves the button usable.
   */
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  /**
   * ONE VOUCH, ONE KEY. `POST /verify/confirm` appends a permanent
   * `citation_checks` row per request — R16 §2 — so a retried tap without a key
   * appends a second. The latch is synchronous because a double tap is.
   */
  const attempt = useAttempt();
  const [unavailable, setUnavailable] = useState(false);
  /** The path itself, kept so the string to paste stays on screen after the tap. */
  const [ecourts, setEcourts] = useState<EcourtsPath | null>(null);
  const [ecourtsError, setEcourtsError] = useState(false);

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

  /**
   * THE VOUCH. Awaited, and the UI moves ONLY on the server's own success.
   *
   * `runAttempt` retries `IDEMPOTENCY_IN_PROGRESS` with the SAME key and
   * nothing else: a `409 IDEMPOTENCY_KEY_REUSE_MISMATCH` is a bug on this side
   * and is surfaced rather than resubmitted, and an ordinary failure leaves the
   * button live with the key intact so the deliberate retry cannot append a
   * second permanent row.
   */
  async function confirm() {
    const attemptKey = attempt.begin();
    if (attemptKey === null) return;
    /*
      The button only renders inside the `citationStored ?` branch, so this is
      unreachable in practice — it is here because `confirm()` is a function and
      not a closure inside that branch, and a vouch for a citation string we do
      not hold would be a vouch for nothing.
    */
    if (!citationStored) {
      attempt.settle();
      return;
    }

    setConfirming(true);
    setConfirmError(null);
    const res = await runAttempt(attemptKey, (key) =>
      api.verifyConfirm(citationStored, judgment.judgmentId, key),
    );
    setConfirming(false);

    if (!res.ok) {
      /*
        NOT CONFIRMED, AND SAID SO. Turning a server refusal into a local
        success is the exact defect this round was opened on: a permanent Tier 3
        record that does not exist, presented to the advocate as one that does.
      */
      attempt.settle();
      setConfirmError(res.error.message);
      return;
    }

    attempt.complete();
    setConfirmed(true);
  }

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
        <Text
          opticalNudge
          variant="record"
          style={[styles.record, !citation.stored && styles.recordAbsent]}
        >
          {citation.text}
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
            {/*
              THE ECOURTS ROUTE NEEDS A CITATION TO SEARCH FOR, so it is offered
              only when we hold one. Before 11 Aug 2026 these two calls took
              `judgment.neutralCitation` straight, which was typed `string` while
              the server had always sent `string | null` — a citationless row
              would have sent `null` to the verification endpoint and shown the
              advocate a route that could not work.

              A judgment with no citation is not a dead end, it is a different
              question: there is nothing to look up, and saying so is the honest
              answer rather than a button that fails on tap.
            */}
            {citationStored ? (
              <>
                <Button
                  label={confirmed ? 'Marked as confirmed' : 'Open eCourts — about a minute'}
                  onPress={() => {
                    setEcourtsError(false);
                    void api.verifyEcourts(citationStored).then(async (r) => {
                      if (!r.ok) {
                        setEcourtsError(true);
                        return;
                      }
                      setEcourts(r.data);
                      /*
                        THE SEARCH STRING GOES ON THE CLIPBOARD BEFORE THE
                        BROWSER OPENS, and this is the whole reason the endpoint
                        returns it. eCourts exposes no query parameter we may
                        rely on, so opening the URL alone lands the advocate on
                        an EMPTY search box — outside our app, in a court
                        building, retyping a citation from memory. We fetched
                        the paste-ready string and threw it away until 11 Aug
                        2026.

                        It is written straight to the clipboard and NOT through
                        `useCopyCitation`. That helper also enqueues a
                        `citation_copies` row, which exists to catch an advocate
                        who took an authority OUT of the app and into a filing
                        so the fan-out can warn them if it moves. Pasting a
                        search string into eCourts to check whether the thing
                        exists at all is the opposite act, and recording it as a
                        copy would inflate the count that metric is measured
                        against.
                      */
                      await Clipboard.setStringAsync(r.data.prefilledQuery);
                      void Linking.openURL(r.data.ecourtsUrl);
                    });
                  }}
                  variant="secondary"
                />

                {/*
                  WHAT TO PASTE, AND WHOSE SENTENCE SAYS SO.

                  `instructions` is the server's copy and it carries the rule —
                  "We never solve it for you." Rendering our own wording here
                  would let the two drift, and this is the one screen where the
                  Tier 3 distinction is visible to a person: the registrar's
                  grant permits a CAPTCHA bypass for BULK cause-list harvesting
                  and expressly not for per-citation confirmation, which is a
                  human solving it and vouching.

                  Shown after the tap rather than before it. Before, it is
                  instructions for something the advocate has not chosen to do.
                */}
                {ecourts ? (
                  <View style={styles.ecourts}>
                    <Text variant="ui">{ecourts.instructions}</Text>
                    <Text opticalNudge variant="record" style={styles.ecourtsQuery}>
                      {ecourts.prefilledQuery}
                    </Text>
                    <Text variant="ui" style={styles.muted}>
                      Copied. Paste it into the eCourts search box.
                    </Text>
                  </View>
                ) : null}

                {/*
                  A FAILED LOOKUP USED TO RENDER NOTHING AT ALL. It set
                  `unavailable`, which is only read when the citation-check
                  panel is absent — and here it is present, so the advocate
                  tapped a button and watched the screen do nothing. Its own
                  state, and a sentence that does not turn our outage into a
                  finding about their citation.
                */}
                {ecourtsError ? (
                  <Text variant="ui" style={styles.muted}>
                    We could not build the eCourts link just now. That is us failing to answer, not
                    anything about this citation — the search is
                    {' '}
                    <Text variant="record">{citationStored}</Text>, and eCourts is at
                    judgments.ecourts.gov.in.
                  </Text>
                ) : null}

                <Button
                  disabled={confirmed || confirming}
                  label={
                    confirmed
                      ? 'You confirmed this'
                      : confirming
                        ? 'Recording your check…'
                        : 'I verified it — mark it'
                  }
                  onPress={() => void confirm()}
                />
                {/*
                  OUR FAILURE, IN OUR OWN TERMS. Never "verification failed" —
                  the advocate DID verify it; we failed to write it down. The
                  button stays live so the deliberate retry is one tap, and it
                  reuses the same attempt key so a lost response cannot leave two
                  permanent rows behind.
                */}
                {confirmError ? (
                  <Text variant="ui" style={styles.muted}>
                    We could not record your check just now. Nothing was saved — tap again when you
                    have a moment, and it will not be recorded twice.
                  </Text>
                ) : null}
                <Text variant="ui" style={styles.muted}>
                  Marking it records that you checked it yourself. We keep that permanently, so
                  nobody in your chamber has to check it twice.
                </Text>
              </>
            ) : (
              <Text variant="ui" style={styles.muted}>
                {citation.note}
              </Text>
            )}
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
  /** A fact about the record, not our uncertainty: no amber, no dashed edge. */
  recordAbsent: { fontStyle: 'italic' },
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
  /**
   * NEUTRAL INK, NO WASH, NO AMBER. This is a set of directions, not a state —
   * and never our uncertainty either. Amber is spent only on the law moving.
   */
  ecourts: {
    borderLeftWidth: 2,
    borderLeftColor: color.rule,
    paddingLeft: space.sm,
    paddingVertical: space.xs,
    gap: space.xs,
  },
  /** The string itself, in the record face. It is a citation, so it is set as one. */
  ecourtsQuery: { color: color.ink },
});
