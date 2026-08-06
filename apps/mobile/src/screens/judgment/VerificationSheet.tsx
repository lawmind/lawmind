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
import { coverageLine, sourceLabel, tierMark } from '../../citation/tiers';
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
 * a judge. The sources come second, and the last line is the promise that
 * matters: this is re-checked nightly, and a change reaches them before the
 * hearing.
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
                    {mark.at ? (
                      <Text opticalNudge variant="record">
                        {new Date(mark.at).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                        })}
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
          Verification is permanent; good-law status is not. The re-check is the
          promise that matters, and it is why `overruled_status` is read live at
          render on every surface and never cached.
        */}
        <Text variant="ui" style={styles.promise}>
          Re-checked every night. If this changes before your hearing, you will be told.
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
