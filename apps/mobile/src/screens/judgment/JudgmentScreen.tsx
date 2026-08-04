import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ChevronLeft, Clock, Info, X } from 'lucide-react-native';

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
import { UnverifiedCitationScreen } from './UnverifiedCitationScreen';
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
/**
 * Resolves `overruled_by_judgment_id` into a citable judgment.
 *
 * Kept as a hook rather than inlined because the set-aside card is the one
 * place where showing an unresolved value would be actively harmful — an
 * advocate reading "cite this instead: jdg_mock_7" has been told nothing and
 * shown our plumbing.
 */
function useReplacement(judgmentId: string | undefined) {
  const [replacement, setReplacement] = useState<JudgmentDetail | null>(null);

  useEffect(() => {
    if (!judgmentId) {
      setReplacement(null);
      return;
    }
    let alive = true;
    void mockApi.judgment(judgmentId).then((r) => {
      if (alive && r.ok) setReplacement(r.data);
    });
    return () => {
      alive = false;
    };
  }, [judgmentId]);

  return replacement;
}

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
  const [showCheck, setShowCheck] = useState(false);

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

  /**
   * The judgment that moved the law, RESOLVED — never described.
   *
   * `overruledByJudgmentId` is an internal id and must never reach a screen: an
   * advocate cannot cite `jdg_mock_7`. It is fetched like any other judgment so
   * the card carries a real case name and a real citation, both off the
   * database row. Until it arrives the card says what it does not have rather
   * than showing the id as a placeholder.
   *
   * CALLED BEFORE EVERY EARLY RETURN. Hooks may not sit behind a conditional —
   * placed after the loading branch it renders a different number of hooks on
   * the second pass and React tears the screen down to a blank page.
   */
  const replacement = useReplacement(judgment?.overruledByJudgmentId);

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

  if (showCheck) {
    return (
      <UnverifiedCitationScreen judgment={judgment} onBack={() => setShowCheck(false)} />
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

      {/*
        `set_aside` — THE DANGER BAND REPLACES THE HEADER. Danger red, not
        caution amber: amber means the law has moved and this is further than
        that — the authority is gone. It is the first thing on the screen
        because an advocate scanning for the holding must not reach it first.
      */}
      {moved.kind === 'moved' && moved.band === 'danger' ? (
        <View style={styles.dangerBand}>
          <View style={styles.dangerHead}>
            <X color={color.card} size={20} strokeWidth={2} />
            <Text variant="uiStrong" style={styles.dangerBandTitle}>
              {moved.headline}
            </Text>
          </View>
          <Text variant="ui" style={styles.dangerBandBody}>
            {judgment.overruledNote ?? 'This judgment has been set aside.'} Do not cite it for any
            proposition.
          </Text>
          {moved.asOf ? (
            <Text variant="ui" style={styles.dangerBandBody}>
              Good-law status as of {moved.asOf}
            </Text>
          ) : null}
          {replacement ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenJudgment(replacement.judgmentId)}
            >
              <View style={styles.dangerAction}>
                <Text variant="uiStrong" style={styles.dangerBandTitle}>
                  Read the judgment that overruled it
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : null}

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

        <Text
          variant="legal"
          scale="caseName"
          style={moved.kind === 'moved' && moved.strikeTitle ? styles.struck : undefined}
        >
          {judgment.caseTitle}
        </Text>
        <Text variant="ui" style={styles.bench}>
          {judgment.court} · {judgment.judgmentDate}
        </Text>
        <Text variant="ui" style={styles.bench}>
          {judgment.bench}
        </Text>

        {existence.kind === 'unconfirmed' ? (
          <Pressable accessibilityRole="button" onPress={() => setShowCheck(true)}>
            <View style={styles.unconfirmed}>
              <Text variant="uiStrong">{existence.headline}</Text>
              <Text variant="ui" style={styles.muted}>
                {existence.reason}
              </Text>
              <Text variant="uiStrong" style={styles.ecourts}>
                {existence.ecourtsAction}
              </Text>
            </View>
          </Pressable>
        ) : null}

        {/*
          `partly_set_aside` — the caution band names the affected paragraphs,
          and WHAT STILL STANDS IS STATED FIRST. What survives is what the
          advocate is about to rely on; leading with what fell buries it.
        */}
        {moved.kind === 'moved' && moved.band === 'caution' ? (
          <View style={[styles.moved, styles.movedCaution]}>
            {moved.whatStillStands ? (
              <Text variant="uiStrong" style={styles.cautionText}>
                What still stands — {moved.whatStillStands}
              </Text>
            ) : null}
            <Text variant="ui" style={styles.muted}>
              {moved.headline}
            </Text>
            {moved.asOf ? (
              <Text variant="ui" style={styles.asOf}>
                Good-law status as of {moved.asOf}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/*
          `doubted` — NO BAND AT ALL. One muted line under the title. The
          judgment is still binding, so shouting would be wrong; the advocate
          simply needs to know before they stand up.
        */}
        {moved.kind === 'moved' && moved.band === 'none' ? (
          <View style={styles.doubtedRow}>
            <Clock color={color.inkFaint} size={16} strokeWidth={1.5} />
            <Text variant="ui" style={styles.muted}>
              {moved.headline}
            </Text>
          </View>
        ) : null}

        {/*
          `set_aside` — of historical interest only. The eyebrow says so, and
          the holding drops to muted ink so it cannot be skim-read as live law.
        */}
        <SectionRule
          accent={moved.kind === 'moved' && moved.band === 'danger'}
          label={
            moved.kind === 'moved' && moved.band === 'danger'
              ? 'What it held — of historical interest only'
              : 'Holding'
          }
        />
        <Text
          variant="legal"
          style={moved.kind === 'moved' && moved.strikeTitle ? styles.muted : undefined}
        >
          {judgment.holding}
        </Text>

        {/*
          "CITE THIS INSTEAD" IS MANDATORY for a set-aside authority, not a
          nicety. Telling an advocate their authority is dead without telling
          them what replaced it leaves them worse off than before they looked.
        */}
        {moved.kind === 'moved' && moved.requiresReplacement ? (
          <View style={styles.replacement}>
            <Text variant="eyebrow">Cite this instead</Text>
            {replacement ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onOpenJudgment(replacement.judgmentId)}
              >
                <Text variant="legal">{replacement.caseTitle}</Text>
                <Text opticalNudge variant="record">
                  {replacement.neutralCitation}
                </Text>
              </Pressable>
            ) : (
              <Text variant="ui" style={styles.muted}>
                We do not yet have the judgment that replaced it. Do not cite this one meanwhile.
              </Text>
            )}
          </View>
        ) : null}

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

        {/*
          The label states the refusal rather than leaving a dead grey button
          the advocate taps twice before working out why nothing happened. This
          is the ONE case where Lawmind refuses to let an authority be used.
        */}
        <Button
          disabled={blocked}
          label={blocked ? 'Cannot be added to a matter' : 'Add to a matter'}
        />
        {blocked ? (
          <Text variant="ui" style={styles.blockedReason}>
            This judgment was set aside, so it cannot be saved to a matter or cited in a draft.
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
  cautionText: { color: state.cautionText },
  asOf: { color: color.inkFaint },
  struck: { textDecorationLine: 'line-through', color: color.inkMuted },
  doubtedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },

  /** Full-bleed, replacing the header. Danger red, never caution amber. */
  dangerBand: { backgroundColor: state.danger, padding: space.sm, gap: space.xs },
  dangerHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dangerBandTitle: { flex: 1, color: color.card },
  dangerBandBody: { color: color.card },
  dangerAction: {
    borderWidth: 1,
    borderColor: color.card,
    borderRadius: radius.base,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  replacement: {
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
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
