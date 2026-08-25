import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CircleAlert, SlidersHorizontal } from 'lucide-react-native';

import { EmptyState } from '../../components/EmptyState';
import { FadeRise } from '../../components/FadeRise';
import { Input } from '../../components/Input';
import { Pressable } from '../../components/Pressable';
import { ResultCard } from '../../components/ResultCard';
import { Screen } from '../../components/Screen';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import { StaggerIn } from '../../components/StaggerIn';
import {
  SEARCH_QUERY_MAX_CHARS,
  type CourtCategory,
  type DegradedArm,
  type HiddenResult,
  type SearchFilters,
  type SearchResult,
} from '../../api/contract';
import { api } from '../../api/client';
import { DEFAULT_FILTERS } from '../../api/mock';
import { attentionCount } from '../../citation/renderState';
import { useLanguage, useLanguageStore } from '../../state/language';
import { color, radius, space } from '../../theme/tokens';
import { MatterPicker } from '../judgment/MatterPicker';
import { Toast } from '../../components/Toast';
import { haptics } from '../../theme/haptics';
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
 * STRUCTURED SEARCH — R2, 11 Aug 2026. `query` may parse as a field/Boolean/
 * citation/proximity/range expression (`judge:"Kania" AND section:138`); when
 * it does, the response carries `parsed` (the server's plain-English echo,
 * shown always, not only on zero) and `total` (the full match count, since
 * `results` is capped at five). ZERO STRUCTURED MATCHES RENDERS AS ZERO — a
 * trusted answer, never a cue to try different wording, and never silently
 * refilled from the semantic path. `docs/API_CONTRACTS.md` §Search, A2.7.
 *
 * Rows 10, 15, 16, 17, 86, 87 of the inventory.
 * `renders/64-verified-silent@2x.png`, `renders/63-search-filters@2x.png`.
 */

type Phase = 'idle' | 'loading' | 'done' | 'failed';

/**
 * The disclosure cards land ~80ms behind the first result.
 *
 * THESE TWO CARDS ARE THE ZERO-THRESHOLD SURFACES — the only places the product
 * says what it is NOT showing: results a filter hid, and citations the model
 * referenced that no tier confirmed. Silent-drop rate has a threshold of zero,
 * and these cards are how that promise is kept on screen.
 *
 * Arriving with the results makes them read as part of the result set. Arriving
 * just after makes them read as a CONSEQUENCE of the search — which is what
 * they are, and it is the reading that gets them noticed rather than scrolled
 * past. They are never conditional on the animation: the delay only affects
 * when they are seen, never whether they render.
 */
const DISCLOSURE_DELAY = 80;

/**
 * ONLY THE FILTERS THAT CAN ACTUALLY NARROW A SEARCH — which is what this
 * comment always said, and what the function stopped doing.
 *
 * It counted `courts` and `subjects`, and neither reaches the search:
 * `searchRequest` accepts `court`/`dateFrom`/`dateTo`/`caseType` and nothing
 * else, `serverFilters` sends only date and case type, and this screen applies
 * only the two reliability filters locally. So an advocate who selected a court
 * and got nothing was told "Nothing matched with these filters. Clearing them
 * searches all 38,341 judgments" — a causal story about filters that were never
 * applied, and a remedy that would not have changed the result.
 *
 * Blaming an empty result on the wrong cause is worse than not explaining it:
 * it sends the advocate to change the one thing that was not the problem.
 * Corrected 11 Aug 2026, alongside disabling those controls in `FiltersSheet`.
 */
/** Matches `FiltersSheet`'s `COURTS` labels — one name per category, in one place. */
const COURT_CATEGORY_LABEL: Record<CourtCategory, string> = {
  sc: 'Supreme Court',
  hc: 'High Court',
  district: 'district court',
  tribunal: 'tribunal',
};

const hasActiveFilters = (f: SearchFilters): boolean =>
  Boolean(f.caseType) ||
  f.date !== 'any' ||
  f.onlyVerified ||
  f.excludeSetAsideOrDoubted ||
  f.courts.length > 0;

/**
 * WHERE A RESULT SHOULD OPEN — the one seam the desktop workspace needs.
 *
 * On a phone a result opens by PUSHING a route, which covers the list. That is
 * right on a 390px screen and wrong on a 1400px one, where the whole point of
 * the width is that the list survives.
 *
 * So the screen asks to be told. Given nothing it pushes exactly as it always
 * has — the phone path is untouched and does not know the workspace exists.
 * PD-15: mobile is not redesigned around desktop.
 */
export type OpenJudgmentTarget = {
  judgmentId: string;
  /**
   * The verification handle from THIS result row. It travels for the same
   * reason it travels in the route: a verification record belongs to a citation
   * as it was shown, not to a judgment in the abstract.
   */
  citationCheckId?: string | null;
  /** Set when the advocate tapped the operative paragraph rather than the card. */
  paragraphNumber?: number;
  /**
   * CARRIED FROM THE ROW THE ADVOCATE TAPPED, so a pane can title itself
   * without a second request for a heading already on screen — the same
   * reasoning `app/precedent/[id].tsx` gives for passing them as params.
   * Nullable exactly as the row has them; never rebuilt, never guessed.
   */
  caseTitle: string;
  neutralCitation: string | null;
};

export function SearchScreen({
  onOpenJudgment,
}: {
  /** Absent on the phone; supplied by the desktop workspace. See above. */
  onOpenJudgment?: (target: OpenJudgmentTarget) => void;
} = {}) {
  const router = useRouter();
  const language = useLanguage();
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hidden, setHidden] = useState<HiddenResult[]>([]);
  const [unverifiedRefs, setUnverifiedRefs] = useState<
    { citationClaimed: string; reason: string }[]
  >([]);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * `network`/`timeout` from `api/client.ts` mean OFFLINE — no request reached
   * the server at all. Anything else (e.g. `INVALID_QUERY`) is a real answer
   * FROM the server and must not be told to the advocate as connectivity.
   */
  const [failureOffline, setFailureOffline] = useState(false);
  /**
   * Which ranker ran out of its statement budget, if any. NEVER treated as
   * "no results" — `results` on a degraded response is incomplete, not proven
   * empty, whatever its length. `docs/CURRENT_PLAN.md`, NEW1 bus 1010/1014.
   */
  const [degraded, setDegraded] = useState<DegradedArm[]>([]);
  /**
   * A citation that legitimately identifies more than one judgment. The
   * ordinary result list is repurposed as a disambiguation — every row real
   * and verified, `total` naming the true count even where it exceeds what a
   * capped page can show.
   */
  const [ambiguous, setAmbiguous] = useState(false);
  /**
   * PAGINATION — additive. `hasMore` and `pageNumber` come straight off the
   * server's `page` object (`docs/API_CONTRACTS.md` §Search); absent means
   * treat as "no further pages", so a response from before this field existed
   * behaves exactly as it always did. `loadingMore` is separate from `phase`
   * because appending a page must not swap the list back to a loading
   * skeleton — the five results already on screen stay visible while the
   * next five load in behind them.
   */
  const [hasMore, setHasMore] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  /**
   * A failed request for page 2+ must not disappear. Page 1 remains useful,
   * but swallowing the failure makes a dead connection look like the corpus
   * simply ended at result five. This state keeps the existing rows and gives
   * the advocate an explicit, manual retry.
   */
  const [loadMoreFailure, setLoadMoreFailure] = useState<string | null>(null);
  /** The row awaiting a matter choice. `null` closes the picker. */
  const [saveFor, setSaveFor] = useState<SearchResult | null>(null);
  /** The judgment just saved, so the toast can confirm it and then clear. */
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * STRUCTURED SEARCH — present only when `query` parsed as a field/Boolean/
   * citation query. `parsed` must be shown whenever it is set, not only on
   * zero results — a misparse produces results, not an error.
   */
  const [parsed, setParsed] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  /**
   * COURT CATEGORIES THE CORPUS HOLDS NOTHING IN — bus 0046. Absent on the
   * structured path, where it stays `[]`: this state exists to tell "your
   * query matched nothing" apart from "we hold none of this court", and a
   * structured zero-match is already the trusted former case (A2.7).
   */
  const [unpopulatedCourtCategories, setUnpopulatedCourtCategories] = useState<CourtCategory[]>([]);

  const run = useCallback(
    async (nextFilters: SearchFilters = filters, nextQuery: string = query) => {
      if (!nextQuery.trim()) return;
      // The server rejects this with a 400 before retrieval runs at all — refuse
      // it here instead, so a long paste gets guidance rather than a request
      // that was always going to fail. Never silently truncated: a shortened
      // legal passage is a different question and would return different law.
      if (nextQuery.length > SEARCH_QUERY_MAX_CHARS) return;
      setPhase('loading');
      setFailure(null);
      setFailureOffline(false);
      setDegraded([]);
      setAmbiguous(false);
      setHasMore(false);
      setPageNumber(1);
      setLoadMoreFailure(null);

      const response = await api.search(nextQuery, language, nextFilters);

      /**
       * A REACHABILITY FAILURE IS NOT AN EMPTY RESULT.
       *
       * "No judgments matched" tells an advocate the corpus does not have their
       * authority. If we simply could not reach the corpus, that sentence is a
       * lie with real consequences — they would stop looking. The two states are
       * kept apart deliberately.
       *
       * AND A REACHABILITY FAILURE IS NOT A VALIDATION FAILURE EITHER. `network`
       * and `timeout` (`api/client.ts`) mean no request reached the server;
       * anything else is a real answer the server gave, and telling the
       * advocate "we could not reach the corpus" about it would be false.
       */
      if (!response.ok) {
        setFailure(response.error.message);
        setFailureOffline(response.error.code === 'network' || response.error.code === 'timeout');
        setPhase('failed');
        return;
      }

      // Present only for a structured query. `?? null` rather than leaving the
      // previous search's value on screen — a prose query after a structured
      // one must not keep showing a stale interpretation.
      setParsed(response.data.parsed ?? null);
      setTotal(response.data.total ?? null);
      setUnpopulatedCourtCategories(response.data.unpopulatedCourtCategories ?? []);
      setDegraded(response.data.degraded ?? []);
      setAmbiguous(response.data.ambiguous ?? false);
      setHasMore(response.data.page?.hasMore ?? false);

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
    [filters, language, query],
  );

  /**
   * RESULT #6+, REACHABLE — the server has supported this since the P3/P5
   * pagination work; nothing on this screen asked for it until now.
   *
   * A manual "Show more" rather than `onEndReached` infinite scroll,
   * deliberately, matching this screen's existing rule for `degraded` (no
   * auto-retry): a further page is a further full-cost query against the
   * SAME ranking, and the advocate's own tap is what pays for it — not a
   * scroll gesture they may not have meant as a request for more.
   *
   * Appends rather than replaces, and re-applies the same two reliability
   * filters this screen already applies to page 1, so a second page cannot
   * silently skip the "only verified" / "good law only" rules the advocate
   * already chose.
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !query.trim()) return;
    setLoadingMore(true);
    setLoadMoreFailure(null);
    const nextPage = pageNumber + 1;
    const response = await api.search(query, language, filters, nextPage);
    setLoadingMore(false);
    if (!response.ok) {
      setLoadMoreFailure(response.error.message);
      return;
    }

    const kept: SearchResult[] = [];
    const removed: HiddenResult[] = [];
    for (const r of response.data.results) {
      if (filters.onlyVerified && r.verificationState !== 'verified') {
        removed.push({ result: r, hiddenBy: '"only verified authorities"' });
      } else if (filters.excludeSetAsideOrDoubted && r.overruledStatus !== 'none') {
        removed.push({ result: r, hiddenBy: '"good law only"' });
      } else {
        kept.push(r);
      }
    }
    setResults((prev) => [...prev, ...kept]);
    setHidden((prev) => [...prev, ...removed]);
    setPageNumber(nextPage);
    setHasMore(response.data.page?.hasMore ?? false);
  }, [hasMore, loadingMore, query, language, filters, pageNumber]);

  /**
   * The full candidate set for this query — what is shown PLUS what the current
   * filters removed. Counting against only the visible rows would make the
   * sheet's button count the filter it is about to replace.
   */
  const candidates = useMemo(() => [...results, ...hidden.map((h) => h.result)], [results, hidden]);

  /** Counts against a draft so the sheet's button is honest before commit. */
  const countFor = useCallback(
    (draft: SearchFilters) =>
      candidates.filter((r) => {
        if (draft.onlyVerified && r.verificationState !== 'verified') return false;
        if (draft.excludeSetAsideOrDoubted && r.overruledStatus !== 'none') return false;
        return true;
      }).length,
    [candidates],
  );

  const attention = attentionCount(results);

  return (
    // A tab route: `headerShown: false`, so the search field is the top of the
    // screen and clears the status bar itself.
    <Screen topInset>
      <View style={styles.head}>
        <Input
          /**
           * THE CAP IS A CURRENT SAFETY BOUND, NOT A PERMANENT PRODUCT VISION —
           * founder correction addendum, 22 Aug 2026. Today's lexical retrieval
           * cannot safely execute an arbitrarily long query (`SEARCH_QUERY_MAX_
           * CHARS`, mirroring the server's own cap), so this is deliberately
           * worded as a mode limit ("the current research mode") rather than a
           * ceiling on what an advocate may ever paste. When NEW1/LCC ship a
           * dedicated bounded passage/fact route, this message is REPLACED by
           * that real workflow, not extended with a bigger number.
           */
          error={
            query.length > SEARCH_QUERY_MAX_CHARS
              ? `This search is too long for the current research mode (${query.length} of ${SEARCH_QUERY_MAX_CHARS} characters). Shorten it, or search for the key facts rather than pasting the whole passage.`
              : undefined
          }
          label="Search"
          onChangeText={setQuery}
          onSubmitEditing={() => run()}
          placeholder={
            language === 'hi'
              ? 'सवाल, CNR, केस नंबर या citation डालें'
              : 'Ask, or enter a CNR, case number, or citation'
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
          <Pressable
            accessibilityLabel="Filters"
            accessibilityRole="button"
            onPress={() => setFiltersOpen(true)}
          >
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
            {/*
              AMBIGUOUS — an identifier (citation, CNR, case number or title)
              that legitimately identifies more than one judgment. The
              ordinary tally would read as an ordinary ranking; this must read
              as a disambiguation instead, and must say when the page cannot
              show every candidate (`RESULT_LIMIT` today).
            */}
            {ambiguous
              ? total !== null && total > results.length
                ? `This identifier matches ${total} judgments — showing ${results.length}. Pick the one you meant, or add a court or date to narrow it further.`
                : `This identifier matches ${results.length} judgments. Pick the one you meant.`
              : /*
                  `total` is the FULL match count, not the page length — a
                  structured query can match far more than the five rows in
                  `results` (`section:138 act:"NI Act"` → 359). Falling back to
                  `results.length` when `total` is absent covers the ordinary
                  semantic path, which never carries it.
                */
                (total !== null && total > results.length
                  ? `${results.length} of ${total} judgments`
                  : results.length === 1
                    ? '1 judgment'
                    : `${results.length} judgments`) +
                (attention > 0
                  ? ` · ${attention === 1 ? '1 needs your attention' : `${attention} need your attention`}`
                  : '')}
          </Text>
        ) : null}

        {/*
          `parsed` MUST BE SHOWN WHENEVER PRESENT, in both the zero-result and
          the has-results case — never only as an explanation for an empty
          list. A misparse produces real, plausible-looking results, so this is
          the only chance an advocate has to catch `a AND b OR c` being read as
          `a AND (b OR c)` before relying on what came back.
        */}
        {phase === 'done' && parsed ? (
          <Text variant="ui" style={styles.parsed}>
            {parsed}
          </Text>
        ) : null}

        {/*
          DEGRADED IS NEVER "NO LAW FOUND". A ranker running out of its budget
          means authorities the corpus holds were never ranked — shown whatever
          `results.length` is, in restrained neutral ink (system uncertainty
          about THIS search, never amber/red LAW MOVED styling, which is a
          legal-currentness fact about a judgment). No retry action here,
          deliberately: a retried timeout is a second full-cost query, not a
          cheap correction — `Try again` in the failed/empty states below is
          the advocate's own choice to pay that cost again.
        */}
        {phase === 'done' && degraded.length > 0 ? (
          <View style={styles.degradedBanner}>
            <CircleAlert color={color.ink} size={16} strokeWidth={1.5} />
            <Text variant="ui" style={styles.degradedText}>
              Showing partial results — one search method could not complete in time.
            </Text>
          </View>
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
            title={failureOffline ? 'You appear to be offline' : 'This search could not complete'}
          />
        </View>
      ) : phase === 'idle' ? (
        <View style={styles.list}>
          <EmptyState
            body="Ask the way you would ask a junior. Every citation you get back has been checked against the reported record before you see it."
            title="Search the corpus"
          />
        </View>
      ) : results.length === 0 && degraded.length > 0 ? (
        /**
         * PARTIAL_RESULTS WITH ZERO SHOWN IS NOT COMPLETE_NO_RESULTS. A ranker
         * ran out of its budget and returned nothing it could rank — the
         * corpus was never proven to hold no answer, so "No judgments
         * matched" would be the exact false claim `docs/CURRENT_PLAN.md`
         * warns against. Manual retry only — the advocate's own choice to pay
         * for a second full-cost query, never automatic.
         */
        <View style={styles.list}>
          <EmptyState
            actions={[{ label: 'Try again', onPress: () => void run() }]}
            body="One search method could not finish in time, so this is not a confirmed answer. Try again, or narrow the search — a citation, court or date filter usually completes faster."
            title="This search did not finish"
          />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.list}>
          <EmptyState
            actions={[
              /**
               * `filters` (court/date/caseType/subjects/onlyVerified/
               * excludeSetAsideOrDoubted) are never applied to a structured
               * query server-side — `answerStructured` runs before `filters`
               * enters the semantic path at all. Offering "Clear the filters"
               * on a structured zero-match would be a dead end: nothing was
               * filtered, so nothing would change.
               */
              ...(hasActiveFilters(filters) && !parsed
                ? [
                    {
                      label: 'Clear the filters',
                      onPress: () => {
                        setFilters(DEFAULT_FILTERS);
                        void run(DEFAULT_FILTERS);
                      },
                    },
                  ]
                : []),
              /**
               * R3 — `docs/RCC_CONTINUATION_PROMPT.md` §3. Every judgment in
               * the corpus today is Supreme Court. A zero result reads as "we
               * searched and found nothing" when the truer answer for a High
               * Court query is "we do not hold this court yet" — an
               * advocate cannot tell those apart from an empty list alone.
               * Always offered here, never conditioned on which court was
               * searched, because the app does not know which court the
               * advocate practises in.
               */
              {
                label: 'See what we hold',
                onPress: () => router.push('/coverage' as never),
                variant: 'secondary' as const,
              },
            ]}
            /**
             * A2.7 — STRUCTURE DECIDES, SEMANTICS FILLS, NEVER BLENDED. Zero
             * structured matches is a TRUSTED answer — the corpus does not
             * contain what was asked for — never a cue to suggest trying
             * different wording, which is advice for the semantic path and
             * would read as "we guessed and found nothing" about a query that
             * was actually understood exactly. `parsed` is shown above
             * regardless (it is set before this branch renders), so the
             * advocate can already see the interpretation was right.
             */
            body={
              parsed
                ? 'No judgment in the corpus matches this. The query was understood correctly — this is not a search problem.'
                : filters.courts.some((c) => unpopulatedCourtCategories.includes(c))
                  ? /**
                     * BUS 0046. A court-category filter matching nothing the
                     * corpus holds looks identical to a query that matched
                     * nothing — and it is not the same claim. "We hold no
                     * district court judgments yet" tells the truer story;
                     * saying "nothing matched" here would read as "we have no
                     * case on this point" when we were never asked.
                     */
                    `We hold no ${filters.courts
                      .filter((c) => unpopulatedCourtCategories.includes(c))
                      .map((c) => COURT_CATEGORY_LABEL[c])
                      .join(
                        ' or ',
                      )} judgments yet. Clearing that filter searches everything we hold.`
                  : hasActiveFilters(filters)
                    ? `Nothing matched “${query}” with these filters. Clearing them searches everything we hold.`
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
                RESULT #6+ — the server holds more than one page for most
                queries; this is the only control that reaches it. Absent
                when the current page is the last one, never a disabled
                greyed-out button pretending there is more to see.
              */}
              {hasMore ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={loadingMore}
                  onPress={() => void loadMore()}
                >
                  <View style={styles.loadMoreButton}>
                    <Text variant="uiStrong" style={styles.loadMoreLabel}>
                      {loadingMore ? 'Loading…' : 'Show more results'}
                    </Text>
                  </View>
                </Pressable>
              ) : null}

              {loadMoreFailure ? (
                <View style={styles.loadMoreFailure}>
                  <Text variant="ui" style={styles.loadMoreFailureText}>
                    {loadMoreFailure} The results already shown are still available.
                  </Text>
                  <Pressable accessibilityRole="button" onPress={() => void loadMore()}>
                    <Text variant="uiStrong" style={styles.hiddenAction}>
                      Try loading more again
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/*
                A FILTER NEVER HIDES SOMETHING SILENTLY. The excluded result is
                named, with a one-tap escape. The advocate always knows what
                they are not seeing.
              */}
              {hidden.length > 0 ? (
                <FadeRise delay={DISCLOSURE_DELAY} style={styles.hiddenCard}>
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
                </FadeRise>
              ) : null}

              {/*
                `unverifiedReferences` is never empty by omission. Anything the
                model referenced that no tier confirmed is shown here rather
                than dropped. Silent-drop rate has a zero threshold.
              */}
              {unverifiedRefs.length > 0 ? (
                <FadeRise delay={DISCLOSURE_DELAY} style={styles.hiddenCard}>
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
                </FadeRise>
              ) : null}
            </View>
          }
          renderItem={({ index, item }) => (
            <StaggerIn index={index}>
              <ResultCard
                /**
                 * THE VERIFICATION HANDLE TRAVELS WITH THE TAP.
                 *
                 * `citationCheckId` identifies the check behind THIS row on
                 * THIS search — `GET /judgments/:id` has no such handle and
                 * should not, because a verification record belongs to a
                 * citation as it was shown rather than to a judgment in the
                 * abstract. Carrying it in the route is what lets the
                 * verification sheet show where we looked; without it the sheet
                 * says it has no record rather than inventing a lookup.
                 */
                onOpenParagraph={(paragraphNumber) =>
                  onOpenJudgment
                    ? onOpenJudgment({
                        judgmentId: item.judgmentId,
                        citationCheckId: item.citationCheckId,
                        paragraphNumber,
                        caseTitle: item.caseTitle,
                        neutralCitation: item.neutralCitation,
                      })
                    : /**
                       * THE PASSAGE OPENS WHERE IT CAME FROM — `?read=1&para=N`.
                       *
                       * PD-9 makes paragraph anchors linkable rather than local
                       * state, so tapping the operative paragraph on a card lands
                       * the advocate on that paragraph in the reading view instead
                       * of at the top of a judgment they must then re-find it in.
                       * The verification handle still travels, for the same reason
                       * it does on the card tap.
                       */
                      router.push({
                        pathname: '/judgment/[id]',
                        params: {
                          id: item.judgmentId,
                          read: '1',
                          para: String(paragraphNumber),
                          ...(item.citationCheckId ? { check: item.citationCheckId } : {}),
                        },
                      })
                }
                /**
                 * SAVING AN AUTHORITY WITHOUT LEAVING THE RESULTS.
                 *
                 * `ResultCard` has drawn this action since 11 Aug 2026 and
                 * search never passed the prop, so it rendered on no surface at
                 * all — the action existed and was unreachable. An advocate had
                 * to open the judgment to keep it, which is three taps and a
                 * lost place in the list for the thing a search is FOR.
                 *
                 * A picker, because a judgment found by search belongs to no
                 * matter yet — the opposite of the briefing, which belongs to
                 * exactly one and needs no question asked.
                 *
                 * The card refuses `set_aside` itself, from
                 * `moved.blocksAddToMatter`, and the server refuses it again
                 * with a `409` naming the replacement. Both ends, because a
                 * stale build or a replayed request bypasses the client one.
                 */
                onAddToMatter={() => setSaveFor(item)}
                onPress={() =>
                  onOpenJudgment
                    ? onOpenJudgment({
                        judgmentId: item.judgmentId,
                        citationCheckId: item.citationCheckId,
                        caseTitle: item.caseTitle,
                        neutralCitation: item.neutralCitation,
                      })
                    : router.push({
                        pathname: '/judgment/[id]',
                        params: {
                          id: item.judgmentId,
                          ...(item.citationCheckId ? { check: item.citationCheckId } : {}),
                        },
                      })
                }
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

      {/*
        THE SAME PICKER THE READER AND THE JUDGMENT SCREEN USE. A judgment found
        by search belongs to no matter yet, so the question has to be asked —
        unlike the briefing, which belongs to exactly one and asks nothing.
      */}
      <MatterPicker
        onDismiss={() => setSaveFor(null)}
        onPick={(matterId) => {
          const target = saveFor;
          setSaveFor(null);
          if (!target) return;
          setSaveError(null);
          void api
            .addAuthorityToMatter({
              matterId,
              judgmentId: target.judgmentId,
              ...(target.citationCheckId ? { citationCheckId: target.citationCheckId } : {}),
            })
            .then((r) => {
              if (r.ok) {
                setSaved(target.judgmentId);
                haptics.commit();
              } else {
                /*
                  The server's message VERBATIM. On `set_aside` it names the
                  replacement judgment, which is the actionable half of the
                  refusal — rewording it would drop exactly that.
                */
                setSaveError(r.error.message);
              }
            });
        }}
        visible={saveFor !== null}
      />

      {/*
        Confirmation and refusal both land here rather than on the row: the list
        re-renders as results change, and a message pinned to a card the
        advocate has scrolled past is a message they never see.
      */}
      {saved || saveError ? (
        <Toast
          message={saveError ?? 'Saved to the matter'}
          onDone={() => {
            setSaved(null);
            setSaveError(null);
          }}
        />
      ) : null}
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
  parsed: { color: color.inkMuted, fontStyle: 'italic' },
  /**
   * RESTRAINED NEUTRAL, DELIBERATELY NOT `cardCaution`/`cardDanger`. Those
   * colours mean a legal-currentness fact about a judgment (LAW MOVED); this
   * is the app being honest that ONE OF ITS OWN SEARCH METHODS did not finish
   * — a different kind of uncertainty, and shouting the wrong one at the
   * advocate would teach them to ignore the real warning.
   */
  degradedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
  },
  degradedText: { flex: 1, color: color.inkMuted },
  list: { padding: space.sm, gap: space.sm, paddingBottom: space.xxl },
  footer: { gap: space.sm, paddingTop: space.sm },
  loadMoreButton: {
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    paddingVertical: space.sm,
    alignItems: 'center',
    backgroundColor: color.card,
  },
  loadMoreLabel: { color: color.ink },
  loadMoreFailure: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
  loadMoreFailureText: { color: color.inkMuted },
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
