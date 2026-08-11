import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Pressable } from '../../components/Pressable';
import { SectionRule } from '../../components/SectionRule';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import { citationDisplay } from '../../citation/citationDisplay';
import { api } from '../../api/client';
import type { AuthoritiesResponse, PointInTimeAuthority } from '../../api/contract';
import { citationRender } from '../../citation/renderState';
import { standingCopy, standingCounts, standingOf, type StandingRender } from '../../citation/standing';
import { formatJudgmentDate } from '../../theme/judgmentDate';
import { color, radius, space, state } from '../../theme/tokens';

/**
 * WHAT THIS JUDGMENT RELIED ON — a panel on judgment detail, never its own screen.
 *
 * ── WHY IT IS A PANEL ───────────────────────────────────────────────────────
 *
 * `deliveredOn` is what makes any of this coherent, and it only means something
 * next to the judgment it belongs to. "Relied on Kanhaiyalal, already set aside
 * 1,058 days earlier" is a statement about THIS bench's reasoning at ITS moment.
 * Lifted onto its own screen it becomes a free-floating verdict on a judgment —
 * the precise shape of the thing we are declining to build.
 *
 * So it sits under the heading that already existed. "Relied on" previously
 * listed authorities with no temporal claim at all; this is the same list with
 * one more column of truth, in the one place where that truth is anchored.
 *
 * ── WHAT IT SAYS AND DOES NOT SAY ───────────────────────────────────────────
 *
 * Every row is a fact with a named bench and a date behind it. No rating, no
 * score, no colour meaning "this judgment is weak" — the reasoning and the
 * enforcing tests are in `citation/standing.ts`.
 *
 * GOOD LAW THEN RENDERS SILENT, the same discipline as a verified citation. A
 * column of green ticks is a column the eye learns to skip, and the row that
 * matters is in it.
 *
 * ── ONE ROUND TRIP, SINCE 7 AUG 2026 ────────────────────────────────────────
 *
 * This panel used to fetch every moved authority's overruling judgment, purely
 * to have a case name to print — an id can never reach a screen. The endpoint
 * now sends `overruledByCaseTitle` and `overruledOn`, so that fan-out is gone.
 * The ids are still carried, for the tap target only.
 */
export function useAuthorities(judgmentId: string) {
  const [data, setData] = useState<AuthoritiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);

    void api.authorities(judgmentId).then((res) => {
      if (!alive) return;
      if (res.ok) setData(res.data);
      else setError(res.error.message);
    });

    return () => {
      alive = false;
    };
  }, [judgmentId]);

  return { data, error };
}

export function AuthoritiesPanel({
  data,
  error,
  onOpenJudgment,
}: {
  data: AuthoritiesResponse | null;
  error: string | null;
  onOpenJudgment: (judgmentId: string) => void;
}) {
  if (error) {
    return (
      <View>
        <SectionRule label={standingCopy.panelTitle} />
        {/*
          OUR SENTENCE IS OURS; THE SERVER'S IS THE SERVER'S. Never interpolated
          into one line — that produced "something went wrong Anything you have
          already opened stays readable." on a Galaxy S24.
        */}
        <Text variant="ui" style={styles.muted}>
          We could not load the authorities this judgment relied on. The rest of the judgment is
          unaffected.
        </Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View>
        <SectionRule label={standingCopy.panelTitle} />
        <SkeletonCard index={0} />
      </View>
    );
  }

  const rows = data.authorities.map((authority) => ({
    authority,
    standing: standingOf(authority),
  }));

  const counts = standingCounts(rows.map((r) => r.standing));

  return (
    <View>
      <SectionRule label={standingCopy.panelTitle} />

      {/*
        THE HEADLINE EXISTS ONLY WHEN THERE IS SOMETHING TO SAY.
        One sentence, one number, and only for the state that changes what an
        advocate does. A five-tile dashboard here would read as a scorecard on
        the judgment, which is the thing this panel refuses to be — and it would
        put `overruled_here`, which is not a problem at all, on the same shelf.
      */}
      {counts.already_moved > 0 ? (
        <View style={styles.headline}>
          <Text variant="uiStrong" style={styles.headlineText}>
            {counts.already_moved === 1
              ? 'One authority had already been set aside when this bench relied on it'
              : `${counts.already_moved} authorities had already been set aside when this bench relied on them`}
          </Text>
        </View>
      ) : null}

      {rows.length === 0 ? (
        /*
          NOT "this judgment cited nothing" — it almost certainly cited a great
          deal. We matched none of it. Stating our limit rather than implying a
          gap in the bench's reasoning is the same rule the missing-judgment
          screen follows.
        */
        <Text variant="ui" style={styles.muted}>
          We could not match any of the authorities this judgment cites to a judgment we hold.
        </Text>
      ) : null}

      {rows.map(({ authority, standing }) => (
        <AuthorityRow
          authority={authority}
          key={authority.judgmentId}
          onOpenJudgment={onOpenJudgment}
          standing={standing}
        />
      ))}

      {rows.length > 0 ? (
        <Text variant="ui" style={styles.resolvedNote}>
          {standingCopy.resolvedNote(data.resolvedAuthorities)}
        </Text>
      ) : null}
    </View>
  );
}

function AuthorityRow({
  authority,
  standing,
  onOpenJudgment,
}: {
  authority: PointInTimeAuthority;
  standing: StandingRender;
  onOpenJudgment: (judgmentId: string) => void;
}) {
  /**
   * The three citation fields are passed explicitly rather than spreading the
   * row. `PointInTimeAuthority` carries `standingWhenRelied` and
   * `statusRecordedAt`, neither of which belongs to the citation render — and
   * the second of which must never reach a sentence. Naming the inputs is what
   * stops one arriving by accident.
   */
  const { moved } = citationRender({
    verificationState: authority.verificationState,
    verifiedBySource: authority.verifiedBySource,
    overruledStatus: authority.overruledStatus,
  });

  const movedAmber = standing.kind === 'already_moved' || standing.kind === 'moved_since';

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={`Open ${authority.caseTitle}`}
        accessibilityRole="button"
        onPress={() => onOpenJudgment(authority.judgmentId)}
      >
        <Text
          variant="legal"
          style={moved.kind === 'moved' && moved.strikeTitle ? styles.struck : undefined}
        >
          {authority.caseTitle}
        </Text>
        <View style={styles.citationLine}>
          <Text opticalNudge variant="record">
            {citationDisplay(authority).text}
          </Text>
          <Text variant="ui" style={styles.faint}>
            {formatJudgmentDate(authority.judgmentDate)}
          </Text>
        </View>
      </Pressable>

      {/*
        THE LIST-SURFACE CHIP, unchanged from every other list. "The state is
        legible from the list without opening anything" — including `doubted`,
        whose chip is neutral. This says what the authority's status is TODAY;
        the block underneath says when it changed relative to THIS judgment. Two
        different questions, kept apart on purpose.
      */}
      {moved.kind === 'moved' ? (
        <View style={styles.chip}>
          <Text variant="ui" style={styles.chipText}>
            {moved.chipLabel}
          </Text>
        </View>
      ) : null}

      {/* `good_law_then` DRAWS NOTHING AT ALL. Not a tick, not a word. */}
      {movedAmber ? (
        <View style={styles.standing}>
          <Text variant="uiStrong" style={styles.standingHeadline}>
            {standing.headline}
          </Text>
          <Text variant="ui" style={styles.standingDetail}>
            {standing.detail}
          </Text>
          {authority.overruledByJudgmentId ? (
            <Pressable
              accessibilityLabel="Read the judgment that set it aside"
              accessibilityRole="button"
              onPress={() => onOpenJudgment(authority.overruledByJudgmentId!)}
            >
              <Text variant="uiStrong" style={styles.link}>
                Read the judgment that set it aside
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/*
        `overruled_here` IS NEUTRAL INK. NO AMBER, NO BAND.

        Amber means the law has moved under someone. Here the law moved BECAUSE
        of this judgment — Tofan Singh reciting Kanhaiyalal — and an advocate
        reading a landmark should not meet a caution block telling them the
        bench relied on dead law. It is a plain line saying what this bench did.
      */}
      {standing.kind === 'overruled_here' ? (
        <View style={styles.here}>
          <Text variant="uiStrong" style={styles.hereHeadline}>
            {standing.headline}
          </Text>
          <Text variant="ui" style={styles.muted}>
            {standing.detail}
          </Text>
        </View>
      ) : null}

      {/*
        UNKNOWN IS NEUTRAL INK WITH A DASHED EDGE, NEVER AMBER.
        Amber means the law has moved — a statement about the authority. This is
        a statement about what WE could not establish, and our own limits are
        never amber.
      */}
      {standing.kind === 'unknown' ? (
        <View style={styles.unknown}>
          <Text variant="uiStrong">{standing.headline}</Text>
          <Text variant="ui" style={styles.muted}>
            {standing.detail}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: space.xs,
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  citationLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs, flexWrap: 'wrap' },
  faint: { color: color.inkFaint },
  muted: { color: color.inkMuted },
  struck: { textDecorationLine: 'line-through', color: color.inkMuted },

  headline: {
    backgroundColor: state.cautionWash,
    borderLeftWidth: 2,
    borderLeftColor: state.caution,
    borderRadius: radius.base,
    padding: space.sm,
  },
  headlineText: { color: state.cautionText },

  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    paddingHorizontal: space.xs,
    paddingVertical: 2,
  },
  chipText: { color: color.inkMuted },

  standing: {
    backgroundColor: state.cautionWash,
    borderWidth: 1,
    borderColor: state.caution,
    borderRadius: radius.base,
    padding: space.sm,
    gap: 4,
  },
  standingHeadline: { color: state.cautionText },
  standingDetail: { color: color.inkMuted },
  link: { color: color.oxblood },

  /** Neutral. A left rule, no wash, no border — this is information, not a state. */
  here: { borderLeftWidth: 2, borderLeftColor: color.rule, paddingLeft: space.sm, gap: 4 },
  hereHeadline: { color: color.ink },

  unknown: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    borderRadius: radius.base,
    padding: space.xs,
    gap: 4,
  },

  resolvedNote: { color: color.inkFaint, paddingTop: space.xs },
});
