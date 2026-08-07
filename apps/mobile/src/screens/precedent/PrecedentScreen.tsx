import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';

import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { PrecedentGraph, TreatmentResponse } from '../../api/contract';
import { color, radius, space } from '../../theme/tokens';
import { PrecedentSpine } from './PrecedentSpine';
import { TreatmentCard } from './TreatmentCard';

/**
 * HOW LATER COURTS TREATED THIS AUTHORITY.
 *
 * THE RANKED LIST IS THE DEFAULT AND THE GRAPH IS ON DEMAND, which is the
 * opposite of how a citation network is usually sold. Three reasons, in order:
 *
 *   1. A phone is 390px wide and held in one hand. A node-and-edge diagram at
 *      that size is a diagram of a diagram.
 *   2. The list is scannable in the order that matters — what happened to this
 *      authority — while a graph makes you find that by looking.
 *   3. The list degrades honestly. A truncated graph looks like a small network;
 *      a truncated list says "showing 40 of 312" on a line the eye lands on.
 *
 * `FEATURE_PARITY.md` §2.6 calls this our best-in-market opportunity, and the
 * reason is the third point applied to overruling: every node carries live
 * overruled status, read at render and never cached, so a set-aside authority
 * cannot sit in the network looking like any other node.
 */

type View_ = 'list' | 'graph';

export function PrecedentScreen({
  judgmentId,
  caseTitle,
  neutralCitation,
  onBack,
  onOpenJudgment,
}: {
  judgmentId: string;
  caseTitle: string;
  neutralCitation: string;
  onBack: () => void;
  onOpenJudgment: (judgmentId: string) => void;
}) {
  /**
   * Android's gesture bar sits over the bottom of the screen and its height
   * differs per device, so a fixed footer padding puts the view toggle
   * underneath it — observed on a Galaxy S24 with the reading controls, and
   * repeated here before the same lesson had to be learned twice.
   */
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<View_>('list');
  const [treatment, setTreatment] = useState<TreatmentResponse | null>(null);
  const [graph, setGraph] = useState<PrecedentGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void api.treatment(judgmentId).then((res) => {
      if (!alive) return;
      if (res.ok) setTreatment(res.data);
      else setError(res.error.message);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [judgmentId]);

  /**
   * The graph is fetched only when asked for. It is a second request against a
   * corpus read, and an advocate who never opens it should never pay for it.
   */
  const showGraph = useCallback(() => {
    setView('graph');
    if (graph) return;
    void api.precedentGraph(judgmentId).then((res) => {
      if (res.ok) setGraph(res.data);
      else setError(res.error.message);
    });
  }, [graph, judgmentId]);

  const header = (
    <View style={styles.header}>
      <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack}>
        <ChevronLeft color={color.ink} size={22} strokeWidth={1.5} />
      </Pressable>
      <Text variant="ui" style={styles.headerLabel}>
        {view === 'list' ? 'Cited by' : 'Graph view'}
      </Text>
    </View>
  );

  if (error) {
    return (
      <Screen topInset>
        {header}
        <View style={styles.centred}>
          <Text variant="legal" scale="cardTitle">
            We could not reach the corpus
          </Text>
          {/*
            OUR SENTENCE IS OURS; THE SERVER'S IS THE SERVER'S.
            Interpolating a raw error into a sentence produced "something went
            wrong Anything you have already opened stays readable." on a Galaxy
            S24 — no separator, no capital, two voices in one line. Copy is
            licence protection here, so the reassurance is written by us and the
            technical detail sits underneath it as detail.
          */}
          <Text variant="ui" style={styles.muted}>
            Anything you have already opened stays readable.
          </Text>
          {error ? (
            <Text variant="record" style={styles.errorDetail}>
              {error}
            </Text>
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    // `app/precedent/[id].tsx` sets `headerShown: false`, so this screen owns
    // its status-bar clearance — the same reason JudgmentScreen insets its nav.
    <Screen topInset>
      {header}

      <View style={styles.root}>
        <Text opticalNudge variant="record">
          {neutralCitation}
        </Text>
        <Text variant="legal" scale="cardTitle" style={styles.rootTitle}>
          {caseTitle}
        </Text>
        {treatment ? (
          <Text variant="ui" style={styles.muted}>
            {treatment.total} later {treatment.total === 1 ? 'judgment' : 'judgments'}
          </Text>
        ) : null}
      </View>

      {treatment && view === 'list' ? (
        <View style={styles.counts}>
          <Text variant="eyebrow">HOW COURTS HAVE TREATED THIS</Text>
          <View style={styles.countRow}>
            <Count label="Followed" n={treatment.counts.followed} />
            <Count label="Distinguished" n={treatment.counts.distinguished} />
            <Count label="Doubted" n={treatment.counts.doubted} />
            <Count label="Overruled" n={treatment.counts.overruled} />
          </View>
          {/*
            THE LINE THAT KEEPS THIS OUT OF PREDICTION.
            `FEATURE_PARITY.md` §4 declines outcome prediction outright: it
            cannot be sourced to a primary record, cannot be verified by any
            tier, and invites exactly the reliance the Supreme Court is
            sanctioning. Four numbers next to each other look like a forecast
            unless something says they are not, so something does.
          */}
          <Text variant="ui" style={styles.muted}>
            This states what courts have done. It is not a forecast of what a court will do.
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : view === 'graph' ? (
        <PrecedentSpine
          graph={graph}
          onOpenJudgment={onOpenJudgment}
          rootTitle={caseTitle}
          rootCitation={neutralCitation}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={treatment?.treatments ?? []}
          keyExtractor={(t) => t.judgmentId}
          ListFooterComponent={
            <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
              {/*
                TRUNCATION IS STATED, NEVER IMPLIED BY A SHORT LIST.
                A citation network rendered as complete when it is not misstates
                how much law bears on the authority — an advocate reading five
                rows would conclude five judgments have considered it.
              */}
              {treatment?.truncated ? (
                <Text variant="ui" style={styles.muted}>
                  Showing {treatment.returned} of {treatment.total}.
                </Text>
              ) : null}

              <Pressable
                accessibilityLabel="View the citation network as a graph"
                accessibilityRole="button"
                onPress={showGraph}
              >
                <Text variant="uiStrong" style={styles.link}>
                  View as graph
                </Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <TreatmentCard onOpen={() => onOpenJudgment(item.judgmentId)} treatment={item} />
          )}
        />
      )}

      {view === 'graph' ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
          <Pressable
            accessibilityLabel="Back to the ranked list"
            accessibilityRole="button"
            onPress={() => setView('list')}
          >
            <Text variant="uiStrong" style={styles.link}>
              List view
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

/**
 * A single tally. Tabular figures so the four sit on one optical line and do
 * not jitter as the digits change — micro-typography rule 3.
 */
function Count({ label, n }: { label: string; n: number }) {
  return (
    <View style={styles.count}>
      <Text opticalNudge variant="record" style={styles.countN}>
        {n}
      </Text>
      <Text variant="ui" style={styles.countLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xs, padding: space.sm },
  counts: { paddingHorizontal: space.sm, paddingTop: space.sm, gap: space.xs },
  /**
   * TWO BY TWO, NOT FOUR ACROSS.
   *
   * Four tiles across 390px leaves ~85px each, and "Distinguished" at the
   * enforced 16px body minimum does not fit — observed on a Galaxy S24, where
   * it broke mid-word as "Distinguishe / d". The alternatives were shrinking
   * below the minimum, which `Text` throws on and which fails the sunlight
   * gate, or abbreviating a legal term of art. Half-width tiles cost one row of
   * height and keep both.
   */
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  count: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    backgroundColor: color.card,
    paddingVertical: space.xs,
    alignItems: 'center',
    gap: 4,
  },
  countN: { color: color.ink },
  countLabel: { color: color.inkMuted, textAlign: 'center' },
  headerLabel: { color: color.inkMuted },
  root: { paddingHorizontal: space.sm, gap: space.xs },
  rootTitle: { color: color.ink },
  muted: { color: color.inkFaint },
  list: { padding: space.sm, gap: space.xs },
  footer: { paddingVertical: space.sm, alignItems: 'center', gap: space.xs },
  link: { color: color.oxblood },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md, gap: space.xs },
  errorDetail: { color: color.inkFaint, textAlign: 'center' },
});
