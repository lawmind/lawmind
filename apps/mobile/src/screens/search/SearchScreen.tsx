import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CircleAlert, SlidersHorizontal } from 'lucide-react-native';

import { EmptyState } from '../../components/EmptyState';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { ResultCard } from '../../components/ResultCard';
import { Screen } from '../../components/Screen';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import { StaggerIn } from '../../components/StaggerIn';
import type { HiddenResult, SearchFilters, SearchResult } from '../../api/contract';
import { api } from '../../api/client';
import { DEFAULT_FILTERS } from '../../api/mock';
import { attentionCount } from '../../citation/renderState';
import { useLanguage, useLanguageStore } from '../../state/language';
import { color, radius, space } from '../../theme/tokens';
import { FiltersSheet } from './FiltersSheet';

/**
 * Search — the first of the four core features.
 *
 * NEVER A BARE SPINNER. Loading is a skeleton that keeps the screen's shape, so
 * results land into a layout the eye has already settled on.
 *
 * THE HEADER COUNTS WHAT NEEDS ATTENTION, NOT WHAT PASSED. "5 judgments · 2
 * need your attention", never "3 verified" — pre-announcing the tally of what
 * passed leaves the list nothing to tell you.
 *
 * Rows 10, 15, 16, 17, 86, 87 of the inventory.
 * `renders/64-verified-silent@2x.png`, `renders/63-search-filters@2x.png`.
 */

type Phase = 'idle' | 'loading' | 'done' | 'failed';

/** Only the filters that can actually narrow a search — used to word the empty state honestly. */
const hasActiveFilters = (f: SearchFilters): boolean =>
  Boolean(f.caseType) ||
  f.date !== 'any' ||
  f.courts.length > 0 ||
  f.subjects.length > 0 ||
  f.onlyVerified ||
  f.excludeSetAsideOrDoubted;

export function SearchScreen() {
  const router = useRouter();
  const language = useLanguage();
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hidden, setHidden] = useState<HiddenResult[]>([]);
  const [unverifiedRefs, setUnverifiedRefs] = useState<{ citationClaimed: string; reason: string }[]>(
    []
  );
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const run = useCallback(
    async (nextFilters: SearchFilters = filters, nextQuery: string = query) => {
      if (!nextQuery.trim()) return;
      setPhase('loading');
      setFailure(null);

      const response = await api.search(nextQuery, language, nextFilters);

      /**
       * A REACHABILITY FAILURE IS NOT AN EMPTY RESULT.
       *
       * "No judgments matched" tells an advocate the corpus does not have their
       * authority. If we simply could not reach the corpus, that sentence is a
       * lie with real consequences — they would stop looking. The two states are
       * kept apart deliberately.
       */
      if (!response.ok) {
        setFailure(response.error.message);
        setPhase('failed');
        return;
      }

      /**
       * The reliability filters run here, against the three citation fields the
       * server sends on every row — and every removal is NAMED. See
       * `serverFilters` in the client for why these two do not go to the server.
       */
      const kept: SearchResult[] = [];
      const removed: HiddenResult[] = [];
      for (const r of response.data.results) {
        if (nextFilters.onlyVerified && r.verificationState !== 'verified') {
          removed.push({ result: r, hiddenBy: '"only verified authorities"' });
        } else if (nextFilters.excludeSetAsideOrDoubted && r.overruledStatus !== 'none') {
          removed.push({ result: r, hiddenBy: '"good law only"' });
        } else {
          kept.push(r);
        }
      }

      setResults(kept);
      setHidden(removed);
      setUnverifiedRefs(response.data.unverifiedReferences);
      setPhase('done');
    },
    [filters, language, query]
  );

  /**
   * The full candidate set for this query — what is shown PLUS what the current
   * filters removed. Counting against only the visible rows would make the
   * sheet's button count the filter it is about to replace.
   */
  const candidates = useMemo(
    () => [...results, ...hidden.map((h) => h.result)],
    [results, hidden]
  );

  /** Counts against a draft so the sheet's button is honest before commit. */
  const countFor = useCallback(
    (draft: SearchFilters) =>
      candidates.filter((r) => {
        if (draft.onlyVerified && r.verificationState !== 'verified') return false;
        if (draft.excludeSetAsideOrDoubted && r.overruledStatus !== 'none') return false;
        return true;
      }).length,
    [candidates]
  );

  const attention = attentionCount(results);

  return (
    <Screen>
      <View style={styles.head}>
        <Input
          label="Search"
          onChangeText={setQuery}
          onSubmitEditing={() => run()}
          placeholder={
            language === 'hi' ? 'सवाल हिन्दी में पूछें' : 'Ask in plain language, or paste a citation'
          }
          returnKeyType="search"
          value={query}
        />
        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setLanguage(language === 'hi' ? 'en' : 'hi')}
          >
            <View style={styles.langToggle}>
              <Text variant="ui" style={styles.langLabel}>
                {language === 'hi' ? 'हिन्दी' : 'English'}
              </Text>
            </View>
          </Pressable>
          <Pressable accessibilityLabel="Filters" accessibilityRole="button" onPress={() => setFiltersOpen(true)}>
            <View style={styles.filterButton}>
              <SlidersHorizontal color={color.ink} size={18} strokeWidth={1.5} />
              <Text variant="ui" style={styles.filterLabel}>
                Filters
              </Text>
            </View>
          </Pressable>
        </View>

        {phase === 'done' && results.length > 0 ? (
          <Text variant="ui" style={styles.count}>
            {results.length === 1 ? '1 judgment' : `${results.length} judgments`}
            {attention > 0
              ? ` · ${attention === 1 ? '1 needs your attention' : `${attention} need your attention`}`
              : ''}
          </Text>
        ) : null}
      </View>

      {phase === 'loading' ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard index={i} key={i} />
          ))}
        </View>
      ) : phase === 'failed' ? (
        <View style={styles.list}>
          <EmptyState
            actions={[{ label: 'Try again', onPress: () => void run() }]}
            body={`${failure ?? 'Something went wrong.'} Your saved matters and anything you have already opened stay readable.`}
            title="We could not reach the corpus"
          />
        </View>
      ) : phase === 'idle' ? (
        <View style={styles.list}>
          <EmptyState
            body="Ask the way you would ask a junior. Every citation you get back has been checked against the reported record before you see it."
            title="Search the corpus"
          />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.list}>
          <EmptyState
            actions={
              hasActiveFilters(filters)
                ? [
                    {
                      label: 'Clear the filters',
                      onPress: () => {
                        setFilters(DEFAULT_FILTERS);
                        void run(DEFAULT_FILTERS);
                      },
                    },
                  ]
                : []
            }
            body={
              hasActiveFilters(filters)
                ? `Nothing matched “${query}” with these filters. Clearing them searches all 38,341 judgments.`
                : `Nothing matched “${query}”. Search currently matches the words in a judgment rather than their meaning, so exact legal terms find more than a paraphrase does.`
            }
            title="No judgments matched"
          />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={results}
          keyExtractor={(r) => r.judgmentId}
          ListFooterComponent={
            <View style={styles.footer}>
              {/*
                A FILTER NEVER HIDES SOMETHING SILENTLY. The excluded result is
                named, with a one-tap escape. The advocate always knows what
                they are not seeing.
              */}
              {hidden.length > 0 ? (
                <View style={styles.hiddenCard}>
                  <View style={styles.hiddenHead}>
                    <CircleAlert color={color.ink} size={18} strokeWidth={1.5} />
                    <Text variant="uiStrong" style={styles.hiddenTitle}>
                      {hidden.length === 1
                        ? 'One result hidden'
                        : `${hidden.length} results hidden`}
                    </Text>
                  </View>
                  {hidden.map((h) => (
                    <Text key={h.result.judgmentId} variant="ui" style={styles.hiddenLine}>
                      {h.result.caseTitle} — hidden by {h.hiddenBy}
                    </Text>
                  ))}
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => {
                      setFilters(DEFAULT_FILTERS);
                      void run(DEFAULT_FILTERS);
                    }}
                  >
                    <Text variant="uiStrong" style={styles.hiddenAction}>
                      Show them anyway
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/*
                `unverifiedReferences` is never empty by omission. Anything the
                model referenced that no tier confirmed is shown here rather
                than dropped. Silent-drop rate has a zero threshold.
              */}
              {unverifiedRefs.length > 0 ? (
                <View style={styles.hiddenCard}>
                  <View style={styles.hiddenHead}>
                    <CircleAlert color={color.ink} size={18} strokeWidth={1.5} />
                    <Text variant="uiStrong" style={styles.hiddenTitle}>
                      Also referenced, not confirmed
                    </Text>
                  </View>
                  {unverifiedRefs.map((u) => (
                    <View key={u.citationClaimed} style={styles.refRow}>
                      <Text opticalNudge variant="record">
                        {u.citationClaimed}
                      </Text>
                      <Text variant="ui" style={styles.hiddenLine}>
                        {u.reason}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          }
          renderItem={({ index, item }) => (
            <StaggerIn index={index}>
              <ResultCard
                onPress={() => router.push(`/judgment/${item.judgmentId}`)}
                result={item}
              />
            </StaggerIn>
          )}
        />
      )}

      <FiltersSheet
        filters={filters}
        hasSearched={phase === 'done'}
        onApply={(next) => {
          setFilters(next);
          setFiltersOpen(false);
          void run(next);
        }}
        onDismiss={() => setFiltersOpen(false)}
        resultCount={countFor}
        visible={filtersOpen}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { padding: space.sm, gap: space.xs },
  controls: { flexDirection: 'row', gap: space.xs, alignItems: 'center' },
  langToggle: {
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    backgroundColor: color.card,
  },
  langLabel: { color: color.ink },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    backgroundColor: color.card,
  },
  filterLabel: { color: color.ink },
  count: { color: color.inkMuted },
  list: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  footer: { gap: space.sm, paddingTop: space.sm },
  hiddenCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
  hiddenHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  hiddenTitle: { flex: 1, color: color.ink },
  hiddenLine: { color: color.inkMuted },
  hiddenAction: { color: color.oxblood },
  refRow: { gap: 2 },
});
