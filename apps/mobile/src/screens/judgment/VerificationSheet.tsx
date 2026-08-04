import { Check } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import type { JudgmentDetail } from '../../api/contract';
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
 * `renders/65-judgment-quiet@2x.png` panel 2.
 */

const SOURCE_LABEL: Record<string, string> = {
  corpus: 'Our corpus',
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

        <View style={styles.sources}>
          <Row
            detail={
              confirmed ? 'Citation resolves · case name matches' : 'No matching record found'
            }
            label={SOURCE_LABEL[judgment.verifiedBySource] ?? judgment.verifiedBySource}
            when="2 days ago"
          />
          <Row
            detail={
              judgment.overruledStatus === 'none'
                ? 'Not overruled, doubted or referred'
                : 'Status has moved — shown on the card'
            }
            label="Citator"
            when="today"
          />
        </View>

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

function Row({ label, detail, when }: { label: string; detail: string; when: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text variant="uiStrong">{label}</Text>
        <Text variant="ui" style={styles.rowDetail}>
          {detail}
        </Text>
      </View>
      <Text opticalNudge variant="record">
        {when}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.sm, gap: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  lede: { color: color.inkMuted },
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
