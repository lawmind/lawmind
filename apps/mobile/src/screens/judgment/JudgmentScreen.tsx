import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ChevronLeft, Info } from 'lucide-react-native';

import { Button } from '../../components/Button';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import type { JudgmentDetail } from '../../api/contract';
import { mockApi } from '../../api/mock';
import { citationRender } from '../../citation/renderState';
import { color, radius, space, state } from '../../theme/tokens';
import { ReadingView } from './ReadingView';
import { VerificationSheet } from './VerificationSheet';

/**
 * Judgment detail — inventory rows 18–22 and 89.
 *
 * THE ONLY TRACE OF VERIFICATION IS A SMALL INFO GLYPH beside the citation:
 * tappable, silent until asked. The header is the case name and the bench,
 * which is what an advocate reads first anyway.
 *
 * OVERRULED ALWAYS SHOWS ITS STATE, ON EVERY SURFACE, IN ALL THREE STATES, and
 * `overruled_status` is read live at render — never cached, never denormalised.
 * Verification is permanent; good law is not, and law moves under a saved
 * citation.
 *
 * `set_aside` DISABLES ADD-TO-MATTER — the one case where Lawmind refuses to
 * let an authority be used, with the reason visible rather than a dead button.
 *
 * `renders/65-judgment-quiet@2x.png`, `renders/19-overruled-three-states.png`.
 */
export function JudgmentScreen({
  judgmentId,
  onBack,
  onOpenJudgment,
  reading,
  openParagraph,
  onSetReading,
}: {
  judgmentId: string;
  onBack: () => void;
  onOpenJudgment: (id: string) => void;
  /** Held in the URL, not in state — see the note in `app/judgment/[id].tsx`. */
  reading: boolean;
  openParagraph?: number;
  onSetReading: (reading: boolean, paragraphNumber?: number) => void;
}) {
  const [judgment, setJudgment] = useState<JudgmentDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setJudgment(null);
    setMissing(false);
    void mockApi.judgment(judgmentId).then((r) => {
      if (!alive) return;
      if (r.ok) setJudgment(r.data);
      else setMissing(true);
    });
    return () => {
      alive = false;
    };
  }, [judgmentId]);

  if (missing) {
    return (
      <Screen>
        <View style={styles.body}>
          <Text variant="ui">That judgment is not in the corpus.</Text>
          <Button label="Back" onPress={onBack} variant="secondary" />
        </View>
      </Screen>
    );
  }

  if (!judgment) {
    return (
      <Screen>
        <View style={styles.body}>
          <SkeletonCard index={0} />
        </View>
      </Screen>
    );
  }

  if (reading) {
    return (
      <ReadingView
        judgment={judgment}
        onBack={() => onSetReading(false)}
        onOpenJudgment={onOpenJudgment}
        onParagraphChange={(n) => onSetReading(true, n)}
        openParagraph={openParagraph}
      />
    );
  }

  const { existence, moved } = citationRender(judgment);
  const blocked = moved.kind === 'moved' && moved.blocksAddToMatter;

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack}>
          <ChevronLeft color={color.ink} size={22} strokeWidth={1.5} />
        </Pressable>
        <Text variant="uiStrong" style={styles.navTitle}>
          Judgment
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.citationRow}>
          <Text opticalNudge variant="record">
            {judgment.neutralCitation}
          </Text>
          {/* Silent until asked. This is the user pulling, never us pushing. */}
          <Pressable
            accessibilityLabel="How this citation was checked"
            accessibilityRole="button"
            onPress={() => setSheetOpen(true)}
          >
            <Info color={color.inkFaint} size={16} strokeWidth={1.5} />
          </Pressable>
        </View>

        <Text variant="legal" scale="caseName">
          {judgment.caseTitle}
        </Text>
        <Text variant="ui" style={styles.bench}>
          {judgment.court} · {judgment.judgmentDate}
        </Text>
        <Text variant="ui" style={styles.bench}>
          {judgment.bench}
        </Text>

        {existence.kind === 'unconfirmed' ? (
          <View style={styles.unconfirmed}>
            <Text variant="uiStrong">{existence.headline}</Text>
            <Text variant="ui" style={styles.muted}>
              {existence.reason}
            </Text>
            <Text variant="uiStrong" style={styles.ecourts}>
              {existence.ecourtsAction}
            </Text>
          </View>
        ) : null}

        {moved.kind === 'moved' ? (
          <View
            style={[
              styles.moved,
              moved.band === 'danger' && styles.movedDanger,
              moved.band === 'caution' && styles.movedCaution,
            ]}
          >
            <Text
              variant="uiStrong"
              style={moved.band === 'danger' ? styles.dangerText : styles.cautionText}
            >
              {moved.headline}
            </Text>
            {judgment.overruledNote ? (
              <Text variant="ui" style={styles.muted}>
                {judgment.overruledNote}
              </Text>
            ) : null}
          </View>
        ) : null}

        <SectionRule label="Holding" />
        <Text variant="legal">{judgment.holding}</Text>

        <View style={styles.operative}>
          <Text variant="eyebrow">
            Operative paragraph · {judgment.operativeParagraphNumber}
          </Text>
          <Text variant="legal" style={styles.operativeQuote}>
            {judgment.operativeParagraph}
          </Text>
        </View>

        <SectionRule label="Relied on" />
        {judgment.reliedOn.map((r) => (
          <Pressable
            accessibilityRole="button"
            key={r.judgmentId}
            onPress={() => onOpenJudgment(r.judgmentId)}
          >
            <View style={styles.reliedRow}>
              <Text variant="legal">{r.caseTitle}</Text>
              <Text opticalNudge variant="record">
                {r.neutralCitation}
              </Text>
            </View>
          </Pressable>
        ))}

        <Button label="Read the judgment" onPress={() => onSetReading(true)} variant="secondary" />

        <Button disabled={blocked} label="Add to a matter" />
        {blocked ? (
          <Text variant="ui" style={styles.blockedReason}>
            This authority was set aside, so it cannot be added to a matter.
          </Text>
        ) : null}
      </ScrollView>

      <VerificationSheet
        judgment={judgment}
        onDismiss={() => setSheetOpen(false)}
        visible={sheetOpen}
      />
    </Screen>
  );
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
  body: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  citationRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  bench: { color: color.inkMuted },
  muted: { color: color.inkMuted },
  unconfirmed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
  ecourts: { color: color.oxblood },
  moved: { borderRadius: radius.base, padding: space.sm, gap: space.xs, borderWidth: 1 },
  movedCaution: { backgroundColor: state.cautionWash, borderColor: state.caution },
  movedDanger: { backgroundColor: color.card, borderColor: state.danger, borderLeftWidth: 2 },
  cautionText: { color: state.cautionText },
  dangerText: { color: state.danger },
  operative: {
    borderLeftWidth: 2,
    borderLeftColor: color.oxblood,
    paddingLeft: space.sm,
    gap: space.xs,
  },
  operativeQuote: { fontStyle: 'italic' },
  reliedRow: {
    gap: 2,
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  blockedReason: { color: color.inkMuted },
});
