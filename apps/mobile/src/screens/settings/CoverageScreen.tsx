import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { CorpusCoverage } from '../../api/contract';
import {
  describeCompleteness,
  describeDate,
  describeDays,
  describeMonth,
  freshnessStatement,
  upstreamStatement,
  type FreshnessStatement,
  type UpstreamStatement,
} from './corpusFreshness';
import { color, space } from '../../theme/tokens';

/**
 * WHAT WE HOLD — R3, `docs/RCC_CONTINUATION_PROMPT.md` §3,
 * `docs/API_CONTRACTS.md` §Search `GET /corpus/coverage`.
 *
 * WHY THIS SCREEN EXISTS. `SELECT court, count(*) FROM judgments` returns one
 * row — Supreme Court of India, 38,341. An advocate practising in a High
 * Court searches, gets a confident-looking empty result, and is told nothing
 * about the fact that we hold 0 of 3,493,695 Allahabad documents. `CLAUDE.md`:
 * silence about a gap does the same damage as a fabricated citation — both let
 * an advocate rely on something that is not there.
 *
 * THREE RULES CARRIED FROM THE CONTRACT, NOT COSMETIC:
 *
 * 1. The High Court numbers are DOCUMENTS, never "judgments" — the measured
 *    judgment share is a RANGE (0.75%-18.64%), stated once, up front, rather
 *    than attached to every row where it would read as noise.
 * 2. The Supreme Court's document total is withheld (`null`), never shown as
 *    zero — that bucket was never enumerated per year, and "we have not
 *    counted this" is a different fact from "there is nothing to count".
 * 3. THIS IS OUR OWN UNCERTAINTY, NEVER THE LAW HAVING MOVED. Amber
 *    (`#B4690E`) is reserved for `overruledStatus` and nothing else — every
 *    colour on this screen is neutral ink, even for a court we hold none of.
 *
 * ── FRESHNESS JOINED COVERAGE HERE, 1 September 2026 ────────────────────────
 *
 * Founder design D-5; NEW3 R16 `R16-RCC-03`. `GET /corpus/freshness` and
 * `GET /corpus/freshness/object` had been mounted and consumed by nothing.
 *
 * IT BELONGS ON THIS SCREEN AND NOWHERE ELSE, because it answers the
 * neighbouring half of one question. An advocate who gets nothing back from
 * their own High Court needs to learn which of two things happened: we hold
 * none of that court (coverage), or we hold it but not yet for the month they
 * are asking about (freshness). D-5: "a coverage gap is not a search failure."
 *
 * THREE REQUESTS, THREE INDEPENDENT FAILURES. Coverage, freshness and the
 * upstream observation are separate calls and each renders its own absence. One
 * failing must not blank the other two, and must never leave the screen looking
 * as though the missing half was fine.
 */
export function CoverageScreen({ onBack }: { onBack: () => void }) {
  const [coverage, setCoverage] = useState<CorpusCoverage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * Null means "not answered yet"; a `kind: 'unavailable'` statement means the
   * route answered with a failure. The screen renders those differently — a
   * loading line is not a gap, and a gap is not a loading line.
   */
  const [freshness, setFreshness] = useState<FreshnessStatement | null>(null);
  const [upstream, setUpstream] = useState<UpstreamStatement | null>(null);

  useEffect(() => {
    void api.corpusCoverage().then((r) => {
      if (r.ok) setCoverage(r.data);
      else setLoadError(r.error.message);
    });

    /*
      SEPARATE CALLS, SEPARATE FAILURES. Not `Promise.all` — one route being
      down would then take the other two with it, and a screen whose whole job
      is to state a gap honestly cannot answer a partial outage with a blank.
    */
    void api.corpusFreshness().then((r) => {
      setFreshness(r.ok ? freshnessStatement(r.data) : { kind: 'unavailable', reason: r.error.message });
    });

    void api.corpusFreshnessObject().then((r) => {
      setUpstream(r.ok ? upstreamStatement(r.data) : { kind: 'unavailable', reason: r.error.message });
    });
  }, []);

  return (
    <Screen topInset>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text variant="ui" style={styles.link}>
            ‹ Settings
          </Text>
        </Pressable>

        <Text variant="eyebrow">Coverage</Text>
        <Text variant="uiStrong" scale="title">
          What we hold
        </Text>
        <Text variant="ui" style={styles.muted}>
          Every judgment in Lawmind today is from the Supreme Court of India. Search finds nothing
          from a High Court not because there is nothing to find, but because we do not hold it
          yet — and that is worth knowing before you rely on an empty result.
        </Text>

        {loadError ? (
          <Text variant="ui" style={styles.error}>
            {loadError}
          </Text>
        ) : null}

        <FreshnessBlock statement={freshness} upstream={upstream} />

        {coverage ? (
          <>
            <View style={styles.card}>
              <Text variant="uiStrong">Supreme Court of India</Text>
              <Text variant="ui" style={styles.muted}>
                {formatCount(coverage.supremeCourt.held)} judgments held. Complete — this is the
                whole corpus for this court.
              </Text>
            </View>

            {/*
              THE JUDGMENT-SHARE CAVEAT, STATED ONCE. Repeating it on every High
              Court row below would read as noise and get skipped past by the
              third repetition; stated once, up front, it is read.
            */}
            {coverage.judgmentShareUnknown ? (
              <Text variant="ui" style={styles.caveat}>
                The High Court figures below count documents, not judgments — court websites do
                not yet let us tell the two apart in every record. The true judgment share is
                somewhere between {formatPercent(coverage.judgmentShareRange[0])} and{' '}
                {formatPercent(coverage.judgmentShareRange[1])} of each number.
              </Text>
            ) : null}

            <Text variant="eyebrow" style={styles.sectionLabel}>
              High Courts — largest gap first
            </Text>

            {coverage.highCourts.map((court) => (
              <View key={court.courtCode} style={styles.card}>
                <Text variant="uiStrong">{court.courtName}</Text>
                <Text variant="ui" style={styles.muted}>
                  {formatCount(court.held)} of {formatCount(court.sourceDocuments)} documents held
                  ({court.firstYear}–{court.lastYear}).
                </Text>
              </View>
            ))}

            {coverage.enumeratedAt ? (
              <Text variant="ui" style={styles.enumeratedAt}>
                Document counts as of {formatWhen(coverage.enumeratedAt)}.
              </Text>
            ) : null}
          </>
        ) : loadError ? null : (
          <Text variant="ui" style={styles.muted}>
            Loading…
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}


/**
 * HOW CURRENT THE LAW WE HOLD IS — founder design D-5, NEW3 R16 `R16-RCC-03`.
 *
 * ── THE TWO LAGS RENDER TOGETHER OR NOT AT ALL ──────────────────────────────
 *
 * `freshnessStatement()` has already enforced that; this component cannot
 * reach a number without its pair because the pair arrives as one object. That
 * is the reason the rule lives in the derivation and not here: a screen with two
 * nullable numbers in scope is a screen where somebody eventually renders one.
 *
 * ── THE NAIVE NUMBER IS SHOWN LOSING ────────────────────────────────────────
 *
 * It is stated SECOND, in fainter ink, with what is wrong with it attached.
 * Hiding it would leave an advocate to compute "newest judgment minus today" for
 * themselves — which is one query, and which anybody would believe.
 *
 * ── NO SLA ANYWHERE ─────────────────────────────────────────────────────────
 *
 * Not a cadence, not an expected time, not a direction of travel. D-5: "A
 * freshness observation is not a promise about tomorrow, and must not be shaped
 * like one."
 */
function FreshnessBlock({
  statement,
  upstream,
}: {
  statement: FreshnessStatement | null;
  upstream: UpstreamStatement | null;
}) {
  return (
    <View style={styles.freshness}>
      <Text variant="eyebrow">How current this is</Text>

      {statement === null ? (
        <Text variant="ui" style={styles.muted}>
          Checking how current this is…
        </Text>
      ) : statement.kind === 'both' ? (
        <>
          {/*
            THE HONEST READING, FIRST AND IN FULL INK. A completeness ratio
            against a trailing baseline, never a maximum — the newest month we
            can actually search, rather than the newest row we happen to hold.
          */}
          <Text variant="ui">
            Search reaches reliably up to{' '}
            {statement.frontierMonth === null
              ? 'no complete month'
              : describeMonth(statement.frontierMonth)}
            {statement.currencyAsOf === null ? '' : ` (to ${describeDate(statement.currencyAsOf)})`} —{' '}
            {describeDays(statement.currencyLagDays)} behind today.
          </Text>

          {/*
            AND THE NUMBER THAT LOOKS BETTER, WITH WHAT IS WRONG WITH IT. On
            25 August 2026 these two read 8 and 56: August held 480 judgments
            against a 117,332/month baseline, so the corpus had a newest date
            and no coverage.
          */}
          <Text variant="ui" style={styles.caveat}>
            Our newest single judgment is{' '}
            {statement.naiveNewestDate === null
              ? 'undated'
              : describeDate(statement.naiveNewestDate)}
            , {describeDays(statement.naiveLagDays)} ago — but one recent judgment is not a
            complete month, so that is not how current the corpus is.
          </Text>
        </>
      ) : statement.kind === 'unmeasured' ? (
        <>
          {/*
            NEITHER LAG. Not a silence and not a reassurance — this states that
            we cannot say, which is the fact.
          */}
          <Text variant="ui">{statement.why}</Text>
          {statement.naiveNewestDate === null ? null : (
            <Text variant="ui" style={styles.caveat}>
              Our newest single judgment is {describeDate(statement.naiveNewestDate)}. On its own
              that says nothing about how much of any month we hold.
            </Text>
          )}
        </>
      ) : (
        /*
          THE ROUTE DID NOT ANSWER. A failure to observe is never rendered as
          "up to date" — NEW3 R16, and the reason this branch says what it does
          not know instead of falling back to the coverage numbers above it.
        */
        <Text variant="ui" style={styles.caveat}>
          We could not check how current this is just now, so this page cannot tell you.
        </Text>
      )}

      {/*
        HOW FAR BEHIND THE SOURCE WE ARE — a different question, from the
        published upstream walk, and separately fallible. Nothing computed from
        our own rows can answer it.
      */}
      {upstream === null ? null : upstream.kind === 'measured' ? (
        <Text variant="ui" style={styles.caveat}>
          Against the source, measured {describeDate(upstream.measuredAt)}:{' '}
          {upstream.sourceLagDays === null
            ? 'the lag behind the source was not stated'
            : `we were ${describeDays(upstream.sourceLagDays)} behind it`}
          {upstream.completeness === null
            ? ''
            : `, holding ${describeCompleteness(upstream.completeness)} of what it listed`}.{' '}
          {formatCount(upstream.sourceUnavailableCount)} documents the source itself would not
          serve are counted separately — that gap is not ours to close.
        </Text>
      ) : (
        <Text variant="ui" style={styles.caveat}>
          The comparison against the source is unavailable just now.
        </Text>
      )}
    </View>
  );
}

/** Indian-grouped — "34,93,695", not "3,493,695". Matches `standing.ts`'s day count. */
function formatCount(n: number): string {
  return n.toLocaleString('en-IN');
}

/** "0.75%" — one decimal place, never a bare fraction an advocate has to convert. */
function formatPercent(share: number): string {
  return `${(share * 100).toFixed(2)}%`;
}

/** "6 August 2026." Never a raw ISO timestamp on screen. */
function formatWhen(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.xs, paddingBottom: space.xxl },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.oxblood },

  card: {
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: 2,
    padding: space.sm,
    gap: space.xs,
    marginTop: space.xs,
  },

  sectionLabel: { marginTop: space.sm },
  /**
   * A ruled block, no card and no colour. Our own uncertainty renders as neutral
   * ink — amber is reserved for LAW MOVED and appears nowhere on this screen.
   */
  freshness: {
    gap: space.xs,
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.rule,
  },
  caveat: { color: color.inkFaint, marginTop: space.xs },
  enumeratedAt: { color: color.inkFaint, marginTop: space.sm },
  muted: { color: color.inkMuted },
  error: { color: color.oxblood },
});
