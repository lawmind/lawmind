import { useEffect, useState } from 'react';
import { Check, CircleDot, X } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import type { CitationCheckDetail, JudgmentDetail } from '../../api/contract';
import { mockApi } from '../../api/mock';
import { citationRender, copy } from '../../citation/renderState';
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

const SOURCE_LABEL: Record<string, string> = {
  corpus: 'Our reported corpus',
  public_x2: 'Two public sources',
  ecourts: 'eCourts, confirmed by you',
  none: 'No source confirmed it',
};

export function VerificationSheet({
  judgment,
  visible,
  onDismiss,
}: {
  judgment: JudgmentDetail;
  visible: boolean;
  onDismiss: () => void;
}) {
  const { existence } = citationRender(judgment);
  const confirmed = existence.kind === 'silent';
  const [check, setCheck] = useState<CitationCheckDetail | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void mockApi.citationCheck(judgment.judgmentId).then((r) => {
      if (alive && r.ok) setCheck(r.data);
    });
    return () => {
      alive = false;
    };
  }, [judgment.judgmentId, visible]);

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
            Confirmed by: {SOURCE_LABEL[judgment.verifiedBySource] ?? judgment.verifiedBySource}
          </Text>
        ) : null}

        {check ? (
          <View style={styles.sources}>
            {check.sources.map((s) => {
              const Icon = s.outcome === 'found' ? Check : s.outcome === 'not_found' ? X : CircleDot;
              return (
                <View key={s.source} style={styles.row}>
                  <Icon
                    color={s.outcome === 'found' ? state.verified : color.inkFaint}
                    size={16}
                    strokeWidth={1.8}
                  />
                  <View style={styles.rowText}>
                    <Text variant="uiStrong">{s.source}</Text>
                    <Text variant="ui" style={styles.rowDetail}>
                      {s.detail}
                    </Text>
                  </View>
                  <Text opticalNudge variant="record">
                    {new Date(s.checkedAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                </View>
              );
            })}
          </View>
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
  promise: { color: color.inkFaint },
});
