import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { CorpusCoverage } from '../../api/contract';
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
 */
export function CoverageScreen({ onBack }: { onBack: () => void }) {
  const [coverage, setCoverage] = useState<CorpusCoverage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void api.corpusCoverage().then((r) => {
      if (r.ok) setCoverage(r.data);
      else setLoadError(r.error.message);
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
  caveat: { color: color.inkFaint, marginTop: space.xs },
  enumeratedAt: { color: color.inkFaint, marginTop: space.sm },
  muted: { color: color.inkMuted },
  error: { color: color.oxblood },
});
