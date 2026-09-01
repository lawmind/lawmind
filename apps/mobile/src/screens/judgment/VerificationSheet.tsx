import { useEffect, useState } from 'react';
import { Check, CircleDot, Clock, X } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { CitationCheck, JudgmentDetail } from '../../api/contract';
import { citationRender, copy } from '../../citation/renderState';
import { coverageLine, sourceLabel, tierDateLabel, tierMark } from '../../citation/tiers';
import { color, space, state } from '../../theme/tokens';

/**
 * ON TAP — THE ONE PLACE "VERIFIED" IS SAID ALOUD.
 *
 * This is the user asking, not the product telling. That distinction is what
 * makes it acceptable to show at all: verified renders nothing on the card, and
 * a small info glyph beside the citation is the only trace until it is tapped.
 *
 * It opens with SAFE TO FILE, not with our process. The advocate does not care
 * how many tiers we ran; they care whether the thing is safe to put in front of
 * a judge. The sources come second, and the last line says only what the tiers
 * above established and why the sheet is worth re-opening. It promises no
 * cadence, no notification and no continuing standing — see the closing comment.
 *
 * `verified_by_source` surfaces HERE and in the admin monitor, and nowhere else.
 * It no longer qualifies a badge, because there is no badge to qualify.
 *
 * EVERY TIMESTAMP IS READ, NEVER WRITTEN HERE. A verification surface that
 * states a check time which never happened is asserting confidence we do not
 * have — the same class of error as a badge on unverified law, and harder to
 * notice because it looks like diligence.
 *
 * `renders/65-judgment-quiet@2x.png` panel 2.
 */

export function VerificationSheet({
  judgment,
  citationCheckId,
  visible,
  onDismiss,
}: {
  judgment: JudgmentDetail;
  /** From the search result that led here. Absent on a cold open. */
  citationCheckId?: string;
  visible: boolean;
  onDismiss: () => void;
}) {
  const { existence } = citationRender(judgment);
  const confirmed = existence.kind === 'silent';
  const [check, setCheck] = useState<CitationCheck | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  /**
   * FETCHED ONLY WHEN THE SHEET IS OPEN. This is the user pulling; a
   * verification record read on every judgment render would be the product
   * telling, on a screen whose entire discipline is that verified stays silent.
   */
  useEffect(() => {
    if (!visible || !citationCheckId) return;
    let alive = true;
    setUnavailable(false);
    void api.citationCheck(citationCheckId).then((r) => {
      if (!alive) return;
      if (r.ok) setCheck(r.data);
      else setUnavailable(true);
    });
    return () => {
      alive = false;
    };
  }, [citationCheckId, visible]);

  return (
    <Sheet onDismiss={onDismiss} visible={visible}>
      <View style={styles.body}>
        <View style={styles.headRow}>
          {confirmed ? <Check color={state.verified} size={20} strokeWidth={2} /> : null}
          <Text variant="uiStrong" scale="title">
            {confirmed ? copy.safeToFile : copy.unconfirmedHeadline}
          </Text>
        </View>

        <Text variant="ui" style={styles.lede}>
          {confirmed
            ? 'This citation was checked against the reported record. If a court asks, this is what we relied on.'
            : existence.kind === 'unconfirmed'
              ? existence.reason
              : ''}
        </Text>

        {/*
          Which TIER resolved it — `verified_by_source`, and the one place this
          field surfaces in the app. Labelled, because bare it reads as a
          repeat of the first source row below rather than a different fact.
        */}
        {confirmed ? (
          <Text variant="ui" style={styles.source}>
            Confirmed by: {sourceLabel(judgment.verifiedBySource)}
          </Text>
        ) : null}

        {check ? (
          <>
            <View style={styles.sources}>
              {check.tiers.map((tier) => {
                const mark = tierMark(tier);
                /**
                 * FOUR STATUSES, THREE ICONS, AND `not_implemented` GETS ITS OWN.
                 * A clock says "has not happened yet"; a cross says "was asked
                 * and had nothing". Giving both the cross is the collapse this
                 * screen exists to avoid.
                 */
                const Icon =
                  mark.tone === 'found' ? Check : mark.tone === 'absent' ? X : mark.isCoverageGap ? Clock : CircleDot;

                return (
                  <View key={tier.tier} style={styles.row}>
                    <Icon
                      color={mark.tone === 'found' ? state.verified : color.inkFaint}
                      size={16}
                      strokeWidth={1.8}
                    />
                    <View style={styles.rowText}>
                      <Text variant="uiStrong">{mark.label}</Text>
                      <Text variant="ui" style={styles.rowDetail}>
                        {mark.detail}
                      </Text>
                    </View>
                    {/*
                      A TIMESTAMP ONLY WHERE A CHECK ACTUALLY RAN. Printing a
                      date beside a tier that never executed is asserting
                      diligence we did not perform — the same class of error as
                      a badge on unverified law, and harder to notice because it
                      looks like care.
                    */}
                    {tierDateLabel(mark.at) ? (
                      <Text opticalNudge variant="record">
                        {tierDateLabel(mark.at)}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {/*
              COVERAGE IS STATED, NOT INFERRED FROM THE ROWS ABOVE. Without this
              line "safe to file" reads as "confirmed by everything we have",
              which is a promise we do not keep until the other two tiers ship.
            */}
            <Text variant="ui" style={styles.coverage}>
              {coverageLine(check.coverage)} {check.coverage.note}
            </Text>
          </>
        ) : !citationCheckId ? (
          /*
            NOT AN ERROR AT ALL, AND NOT THE SAME AS A FAILED READ.

            A verification record belongs to a citation as it was SHOWN — which
            result, on which search, at which moment. A judgment opened from a
            link or from another judgment's authorities has no such moment
            behind it, so there is nothing to fetch. Saying "we could not open
            it" there would describe a failure that did not occur, and would
            make the harness look flakier than it is.
          */
          <Text variant="ui" style={styles.rowDetail}>
            We have no record of where we looked for this one — it was opened directly rather than
            from a search. The status above is read live either way.
          </Text>
        ) : unavailable ? (
          /*
            The verification record is a separate row from the citation. Failing
            to read it says nothing about the citation, and the three fields
            above are unaffected.
          */
          <Text variant="ui" style={styles.rowDetail}>
            We could not open the record of where we looked. The status above is unaffected.
          </Text>
        ) : (
          <SkeletonCard index={0} />
        )}

        {/*
          NO CADENCE PROMISE LIVES HERE, AND THAT IS THE POINT.

          Until 1 Sep 2026 this line read "Re-checked every night. If this
          changes before your hearing, you will be told." NEW3 R17 adjudicated
          it STATIC_NIGHTLY_COPY = REQUIRES_RUNTIME_EVIDENCE (bus 1692): a
          committed cron schedule proves CONFIGURATION, not a deployed
          successful execution, not a check of THIS authority, and not alert
          eligibility for THIS viewer. Three separate facts, none of them in
          evidence, all of them implied by one sentence.

          NO REPLACEMENT TIMESTAMP EITHER. The contract serves no citator
          `lastCheckedAt`, and `asOf`, the citation-existence `checkedAt`, build
          time and the cron file are all forbidden substitutes — each answers a
          different question and would read as the answer to this one. So the
          sentence carries only what is true without a runtime read: the reason
          the status above is worth re-opening, and no undertaking to reach out.
          When a recheck timestamp is contracted from the deployed scheduler
          this becomes `Last checked {lastCheckedAt}.`, and only then.

          IT ALSO MAKES NO FORWARD GOOD-LAW CLAIM. The first draft of this
          replacement said "whether this is still good law is not", and
          `routeGates.test.ts` rejected it — `treatment.good_law_claim` is
          DISABLED_NOT_READY, so a sentence about an authority's continuing
          standing is exactly the claim that gate exists to stop. What is said
          instead is what the tiers above actually establish (the judgment
          exists and says what it says) and the reason to look again (a later
          court can change its standing), neither of which asserts the current
          answer.

          `overruled_status` is still read live at render on every surface and
          never cached. That rule is unchanged; what changed is that we no
          longer claim a schedule on top of it.
        */}
        <Text variant="ui" style={styles.promise}>
          What we confirmed is that this judgment exists and says what it says. A later court can
          change its standing at any time, so open this again before you file.
        </Text>

        <Button label="Close" onPress={onDismiss} variant="secondary" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  lede: { color: color.inkMuted },
  source: { color: color.inkFaint },
  sources: { borderWidth: 1, borderColor: color.rule, borderRadius: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    padding: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  rowText: { flex: 1, gap: 2 },
  rowDetail: { color: color.inkMuted },
  coverage: { color: color.inkMuted },
  promise: { color: color.inkFaint },
});
