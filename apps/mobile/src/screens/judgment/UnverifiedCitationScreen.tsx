import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Check, ChevronLeft, CircleDot, X } from 'lucide-react-native';

import { Button } from '../../components/Button';
import { CitationMark } from '../../components/CitationMark';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import type { CitationCheckDetail, JudgmentDetail, SourceCheck } from '../../api/contract';
import { mockApi } from '../../api/mock';
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
  onBack,
}: {
  judgment: JudgmentDetail;
  onBack: () => void;
}) {
  const [check, setCheck] = useState<CitationCheckDetail | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let alive = true;
    void mockApi.citationCheck(judgment.judgmentId).then((r) => {
      if (alive && r.ok) setCheck(r.data);
    });
    return () => {
      alive = false;
    };
  }, [judgment.judgmentId]);

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack}>
          <ChevronLeft color={color.ink} size={22} strokeWidth={1.5} />
        </Pressable>
        <Text variant="uiStrong" style={styles.navTitle}>
          Citation
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <CitationMark label="Not confirmed" tone="unconfirmed" />

        <Text variant="legal" scale="caseName">
          {judgment.caseTitle}
        </Text>
        <Text opticalNudge variant="record" style={styles.record}>
          {judgment.neutralCitation}
        </Text>
        <Text opticalNudge variant="record" style={styles.record}>
          {judgment.court}
        </Text>

        <View style={styles.rule} />

        {check ? (
          <>
            <View style={styles.found}>
              <Text variant="eyebrow">What we found</Text>
              <Text variant="legal">{check.whatWeFound}</Text>
            </View>

            <SectionRule label="Where we looked" />
            {check.sources.map((source) => (
              <SourceRow key={source.source} source={source} />
            ))}

            {/*
              NEVER BYPASS THE CAPTCHA. This opens eCourts with the search
              pre-filled; the advocate solves it. Their confirmation is Tier 3
              and caches permanently.
            */}
            <Button
              label={confirmed ? 'Marked as confirmed' : 'Open eCourts — about a minute'}
              onPress={() => {
                void Linking.openURL(check.ecourtsUrl);
              }}
              variant="secondary"
            />
            <Button
              disabled={confirmed}
              label={confirmed ? 'You confirmed this' : 'I verified it — mark it'}
              onPress={() => {
                setConfirmed(true);
                void mockApi.confirmVerified(judgment.judgmentId);
              }}
            />
            <Text variant="ui" style={styles.muted}>
              Marking it records that you checked it yourself. We keep that permanently, so nobody
              in your chamber has to check it twice.
            </Text>
          </>
        ) : (
          <SkeletonCard index={0} />
        )}
      </ScrollView>
    </Screen>
  );
}

function SourceRow({ source }: { source: SourceCheck }) {
  /**
   * `needs_you` is NEUTRAL INK, not amber.
   *
   * FLAGGED: `renders/49-unverified-citation@2x.png` draws this row's glyph in
   * amber. `design/DESIGN_SYSTEM.md` §3a reserves `#B4690E` for "the law has
   * moved, and nothing else — never on drafts, OCR, or anything about our own
   * confidence", and a captcha we cannot solve is exactly our own limitation.
   * Following the reserve rule, because diluting amber costs more than a design
   * nit: an advocate who learns amber sometimes means "us" will read past it
   * when it means the law moved.
   */
  const Icon =
    source.outcome === 'found' ? Check : source.outcome === 'not_found' ? X : CircleDot;
  const tint = source.outcome === 'found' ? state.verified : color.inkFaint;

  return (
    <View style={styles.sourceRow}>
      <Icon color={tint} size={18} strokeWidth={1.8} />
      <View style={styles.sourceText}>
        <Text variant="uiStrong">{source.source}</Text>
        <Text variant="ui" style={styles.muted}>
          {source.detail} {relativeTime(source.checkedAt)}
        </Text>
      </View>
    </View>
  );
}

/** "Checked 4 minutes ago". A timestamp an advocate has to decode is not a timestamp. */
function relativeTime(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
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
});
