import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { SkeletonCard } from '../../components/SkeletonCard';
import { StaggerIn } from '../../components/StaggerIn';
import { Text } from '../../components/Text';
import type { Statute, StatuteCoverage } from '../../api/contract';
import { api } from '../../api/client';
import { formatJudgmentDate } from '../../theme/judgmentDate';
import { color, space } from '../../theme/tokens';

/**
 * BARE ACTS — inventory row 105, `renders/72-bare-acts@2x.png` panel 1.
 *
 * The three new criminal codes sit above everything, under an oxblood rule,
 * because every criminal practitioner in India is currently working across two
 * regimes. "What is 302 now" is the single most common lookup of this decade.
 *
 * NO CITATION UI APPEARS ON THIS SCREEN. A statute has no citation, no
 * verification state and no overruled status — there is nothing to mark safe to
 * file and nothing to mark as moved.
 *
 * BUT SILENCE HERE DOES NOT MEAN "IN FORCE". We do not yet store amendment,
 * substitution or repeal status for sections. So this screen states what it
 * knows — the Act's enforcement date, which is a fact we hold — and says
 * plainly that section-level currency is not tracked. An advocate who read our
 * silence as a guarantee, on a section substituted last year, would be failed
 * by a door the citation harness does not watch.
 */
export function BareActsScreen({ onOpenAct }: { onOpenAct: (statuteId: string) => void }) {
  const [statutes, setStatutes] = useState<Statute[] | null>(null);
  const [coverage, setCoverage] = useState<StatuteCoverage | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    void api.statutes().then((r) => {
      if (!alive) return;
      if (r.ok) {
        setStatutes(r.data.statutes);
        setCoverage(r.data.coverage);
      }
      // WHEN WE CANNOT REACH THE CODES, SAY SO. Never an empty list dressed as
      // "no acts" — an advocate would conclude we do not hold the BNS.
      else setFailed(r.error.message);
    });
    return () => {
      alive = false;
    };
  }, []);

  const shown = (statutes ?? []).filter((s) =>
    query.trim()
      ? s.shortTitle.toLowerCase().includes(query.trim().toLowerCase()) ||
        (s.hindiTitle ?? '').includes(query.trim())
      : true
  );

  return (
    <Screen>
      <View style={styles.head}>
        <Text variant="uiStrong" scale="title">
          Bare acts
        </Text>
        <Input
          label="Find an act"
          onChangeText={setQuery}
          /**
           * SHORT ENOUGH TO SURVIVE 2.0x TEXT.
           *
           * A single-line input cannot wrap its placeholder, so a long hint is
           * cut mid-word once the reader raises their system text size — and
           * the reader who raised it is the one least able to guess the rest.
           * The label above carries the full meaning; this is the hint.
           */
          placeholder="Act or section"
          value={query}
        />
      </View>

      {failed ? (
        <View style={styles.list}>
          <Text variant="uiStrong">We could not load the codes</Text>
          <Text variant="ui" style={styles.actMeta}>
            {failed}
          </Text>
        </View>
      ) : statutes === null ? (
        <View style={styles.list}>
          <SkeletonCard index={0} />
          <SkeletonCard index={1} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={shown}
          keyExtractor={(s) => s.statuteId}
          ListHeaderComponent={<SectionRule accent label="The new criminal codes" />}
          ListFooterComponent={
            /*
              STATED ONCE, PLAINLY, AND NOT DRESSED AS A WARNING. This is a fact
              about our coverage, so it is neutral ink — never amber, which
              means the law has moved and nothing else.
            */
            <>
              {/*
                WHAT WE HOLD, SAID IN NUMBERS — `GET /statutes` has always sent
                `coverage` and nothing read it until 11 Aug 2026, so this list
                was presented with no statement of what was missing from it.
                `CoverageScreen` breaks the same silence for judgments and gives
                the reason: an advocate who searches and finds nothing needs to
                know whether there was nothing to find or whether we simply do
                not hold it.

                THREE RULES, ALL FROM THE ROUTE'S OWN COMMENTS:
                  · `complete` decides. Never `held === sourceTotal` — an ingest
                    can equal that count transiently mid-run.
                  · `sourceTotal: null` means never enumerated, NOT zero, so it
                    is never printed as a denominator.
                  · The two gaps stay two numbers. Acts we could not fetch and
                    Acts we hold whose sections never parsed are different
                    facts, and one number would hide the other.
              */}
              {coverage && !coverage.complete ? (
                <Text variant="ui" style={styles.currency}>
                  {coverage.sourceTotal === null
                    ? `We hold ${coverage.held} Acts. We have not counted how many exist at the source, so we cannot tell you how much of it that is.`
                    : `We hold ${coverage.held} of ${coverage.sourceTotal} Acts.`}
                  {coverage.failedCount > 0
                    ? ` ${coverage.failedCount} could not be read from the source.`
                    : ''}
                  {coverage.sectionlessCount > 0
                    ? ` ${coverage.sectionlessCount} more are listed but have no sections yet, so searching will not find them.`
                    : ''}
                </Text>
              ) : null}

              <Text variant="ui" style={styles.currency}>
                We hold each Act as published, with the date it came into force. We do not yet
                track whether an individual section has since been amended, substituted or
                repealed — check the source before you rely on one.
              </Text>
            </>
          }
          renderItem={({ index, item }) => (
            <StaggerIn index={index}>
              <Pressable accessibilityRole="button" onPress={() => onOpenAct(item.statuteId)}>
                <Card style={styles.act}>
                  <View style={styles.actHead}>
                    {/* `shortTitle` already carries the year — "The Bharatiya
                        Nyaya Sanhita, 2023". Appending `actYear` would print it
                        twice. Government text is rendered as issued. */}
                    <Text variant="legal" scale="cardTitle" style={styles.actTitle}>
                      {item.shortTitle}
                    </Text>
                  </View>
                  {item.hindiTitle ? (
                    <Text lang="hi" variant="legal">
                      {item.hindiTitle}
                    </Text>
                  ) : null}
                  <Text variant="ui" style={styles.actMeta}>
                    {item.sectionCount} sections
                    {item.enforcementDate
                      ? ` · in force from ${formatJudgmentDate(item.enforcementDate)}`
                      : ''}
                  </Text>
                </Card>
              </Pressable>
            </StaggerIn>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { padding: space.sm, gap: space.xs },
  list: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  act: { gap: space.xs },
  actHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  actTitle: { flex: 1 },
  actMeta: { color: color.inkMuted },
  currency: { color: color.inkMuted, paddingTop: space.sm },
});
