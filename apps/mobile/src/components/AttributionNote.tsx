import { StyleSheet, View } from 'react-native';

import { Text } from './Text';
import type { TreatmentAttribution } from '../api/contract';
import { attributionLine } from '../citation/treatmentAttribution';
import { color, space } from '../theme/tokens';

/**
 * WHO SAID THE LAW MOVED — one line, beneath the mark that says it moved.
 * OD-14 layer 4, NEW3 R16 `R16-RCC-01`.
 *
 * ── IT IS A SEPARATE CONCEPT AND IT LOOKS LIKE ONE ──────────────────────────
 *
 * NEW3 R16 requires citation state, evidence, treatment, currentness and
 * source/provenance to stay distinct. This renders BELOW the treatment it
 * qualifies, in muted ink, with no band, no icon and no chrome of its own —
 * so it reads as a footnote on the warning rather than as a second warning.
 *
 * ── NO AMBER, EVER ──────────────────────────────────────────────────────────
 *
 * Amber `#B4690E` means the law has moved. That claim is already made by the
 * band above this line. WHO said so is a fact about OUR evidence, and this
 * product renders its own uncertainty as neutral ink — the same rule
 * `SourceTrustBlock` follows for a suspect date.
 *
 * ── ABSENCE RENDERS NOTHING ─────────────────────────────────────────────────
 *
 * `attributionLine(undefined)` is `null` and this returns `null` with it. A
 * route that does not send the field gets no line, not an "unknown" line —
 * `citation/treatmentAttribution.ts` explains why the two are different.
 *
 * ── THE CALLER GATES ON THE TREATMENT, NOT ON THIS ──────────────────────────
 *
 * The server derives `UNKNOWN` from an empty edge list, so an authority nobody
 * has ever doubted arrives carrying `UNKNOWN`. Rendering this component there
 * would attach a note about adverse treatment to a judgment that has none.
 * Every call site is inside a branch that has already established a treatment.
 */
export function AttributionNote({
  attribution,
  tone = 'default',
}: {
  attribution: TreatmentAttribution | undefined;
  /**
   * `onDanger` ONLY for the set-aside band, whose ground is danger red and
   * whose own body text is already `color.card`. Muted ink on that ground is
   * unreadable, and an unreadable line about our evidence is worse than none.
   * It is a contrast choice, not a second emphasis: the wording is identical.
   */
  tone?: 'default' | 'onDanger';
}) {
  const line = attributionLine(attribution);
  if (line === null) return null;

  return (
    <View style={styles.row}>
      <Text variant="ui" style={tone === 'onDanger' ? styles.onDanger : styles.text}>
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingTop: space.xs },
  text: { color: color.inkMuted },
  onDanger: { color: color.card },
});
