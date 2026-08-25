/**
 * THE RETRIEVAL OUTCOME — one server-authoritative answer to "did we look, and
 * can anything downstream speak confidently about what we found".
 *
 * R7 §7.1. Every consumer of retrieval — normal search, counterarguments,
 * briefings, research helpers, the drafting backend — derives its confidence
 * from THIS, and from nothing it computes for itself.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SINGLE STATE, WHEN THE SIGNALS ALREADY EXIST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The response already carries `degraded`, `emptyBecause`,
 * `unpopulatedCourtCategories` and `ambiguous`. Each is correct and each was
 * added for a real defect. Together they are still not enough, and RCC said so
 * exactly (bus 1128): **the client cannot tell "there is no law on this" from
 * "we could not search".**
 *
 * That is not a rendering problem. It is a problem about who is allowed to
 * decide. Four separate optional fields mean four consumers each writing their
 * own rule for what they add up to, and the moment two of them differ, one
 * surface is confidently wrong about the law. NEW3 found the live version of
 * this (bus 1141): `anticipatory bail` returns an **empty 200 by design**, and
 * an empty 200 renders as "no law found" on a phone. The server knew it had
 * declined to run the lexical ranker. Nothing in the response said so in a form
 * a consumer had to honour.
 *
 * So the rule is: the signals stay (they are the evidence), and one derived
 * state sits beside them (it is the verdict). The verdict is computed HERE,
 * once.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ARRAY LENGTH IS NEVER CONFIDENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * R7 says it in those words and it is the load-bearing rule in this file, in
 * both directions:
 *
 *   - **Zero results is not "no law".** If an arm refused or timed out, zero is
 *     the number of things we ranked, not the number that exist.
 *   - **Non-zero results is not "answered".** Five results from a dense arm
 *     while the sparse arm timed out is five of an unknown number, and a
 *     briefing built on them omits authorities that exist. `CITATION_HARNESS.md`
 *     holds silent-drop rate to a threshold of zero; a recall loss leaves no
 *     trace at all unless the server leaves one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * No copy. Not one string an advocate reads. NEW3 owns that, and the states here
 * are the facts the copy must be written FROM. `CITATION_HARNESS.md` is explicit
 * that "we could not confirm this exists" and "verification failed" are
 * different sentences with the same underlying fact, and choosing between them
 * is not the server's call.
 *
 * It also does not gate `exactIdentityUsable` on any of this. An exact citation
 * or case-number lookup is a SQL predicate against an identity index; it does
 * not care that the semantic arm is cold. R7 §8: "exact identity remains usable
 * independently." Collapsing the two would make a working feature unavailable
 * because an unrelated one is degraded.
 */

/**
 * R7 §7.1, verbatim. Ordered by how much a consumer may rely on it, most first.
 */
export type RetrievalOutcomeState =
  /** We searched, the arms we needed ran, and the results are what we found. */
  | 'answered'
  /**
   * We searched properly and are declining to offer these results as an answer.
   * An HONEST empty: the rankers ran and nothing cleared the bar.
   *
   * Distinct from `coverage_unknown` in the one way that matters to an advocate:
   * here we looked.
   */
  | 'abstained'
  /**
   * We answered, and the answer is incomplete in a way we can name. Results are
   * real and usable; the SET is not known to be complete.
   */
  | 'degraded'
  /**
   * We did not look, or could not look properly, and we do not know what is out
   * there. **This may never render as "no results".**
   */
  | 'coverage_unknown'
  /**
   * A human has to choose before anything downstream may proceed — most often
   * because the query names more than one distinct authority.
   */
  | 'review_required';

/**
 * R7 §7.1's reason list. A state without a reason is not actionable, and a
 * reason without a state is what we already had four of.
 */
export type RetrievalOutcomeReason =
  /** The lexical arm refused to rank because the match set was unbounded. */
  | 'sparse_unbounded'
  /** The semantic arm could not run, or does not cover this query's targets. */
  | 'semantic_index_insufficient'
  /** Candidates were withheld because their body text is not safe to quote. */
  | 'unsafe_body'
  /** The rankers ran and nothing cleared the relevance bar. */
  | 'low_relevance'
  /** The query names more than one distinct authority. */
  | 'ambiguous_identity'
  /** An arm exceeded its statement budget. */
  | 'timeout'
  /** A date this answer depends on is suspect or unknown. */
  | 'date_unreliable'
  /** The source behind this answer has not refreshed inside its expected band. */
  | 'source_stale';

export type RetrievalOutcome = {
  state: RetrievalOutcomeState;
  /** Every reason that applies, most specific first. Never empty unless `answered`. */
  reasons: RetrievalOutcomeReason[];
  /**
   * May a semantic-dependent consumer — counterarguments, briefings, drafting —
   * speak confidently from these results?
   *
   * True ONLY for `answered`. R7 §8: "semantic-dependent workflow cannot
   * confidently answer when retrieval says abstain/review/coverage unknown."
   * `degraded` is deliberately false too: a partial result set is fine to SHOW
   * and unsafe to ARGUE FROM, because the authority that would have changed the
   * argument is exactly the one that did not get ranked.
   */
  safeForGeneration: boolean;
  /**
   * May exact-identity features still be used? Almost always yes — they do not
   * depend on the semantic path at all. False only when identity itself is the
   * thing in doubt.
   */
  exactIdentityUsable: boolean;
  /**
   * How many results this page carries. Present as a FACT, next to a state that
   * says what it means. It is never the confidence signal.
   */
  resultCount: number;
  /**
   * The measured cause behind a `sparse_unbounded` reason, when there is one:
   * the document frequency of the rarest lexeme the lexical arm kept.
   *
   * A number rather than a category, and that is NEW1's correction (bus 1222)
   * made structural. A server that decided "short query, therefore degraded"
   * would mislabel a twelve-word anticipatory-bail sentence as answerable
   * (rarestDf 0.0564, refused) and a five-term arbitration query as degraded.
   * Length is not the driver; `min(df)` is, and it is already computed in the
   * same statement that refuses.
   *
   * Absent when the lexical arm did not run. Never invented.
   */
  rarestDf?: number | undefined;
  /** Bumped when the meaning of a state changes, never when one is added. */
  contractVersion: 1;
};

/**
 * Everything the derivation is allowed to look at. If a caller cannot supply a
 * field it says so with `undefined` — never with a plausible default, because a
 * default here is a confident answer nobody measured.
 */
export type RetrievalOutcomeInput = {
  resultCount: number;
  /** Arms that ran out of budget or refused. `services/api/src/search/retrieve.ts`. */
  degradedArms: readonly string[];
  /**
   * Did the semantic arm have a query vector at all? `false` means the embedder
   * was cold, past its budget, or past its failure limit — the search ran
   * lexical-only and does not know it missed anything.
   */
  semanticAvailable: boolean;
  /**
   * Does the semantic index cover this kind of query well enough to be relied
   * on? Until NEW1's G3 thresholds pass this is `false` for every semantic-
   * dependent consumer — R7 §8: "until NEW1 thresholds pass, semantic-dependent
   * routes default conservatively."
   */
  semanticIndexSufficient: boolean;
  /** How many distinct judgments an exact title lookup matched. */
  exactTitleCandidates?: number | undefined;
  /** Candidates withheld because their body text failed the safety screen. */
  withheldUnsafeBody?: number | undefined;
  /** A date driving this answer is suspect or unknown. */
  dateUnreliable?: boolean | undefined;
  /** The rarest-lexeme document frequency the sparse arm measured, if it ran. */
  rarestDf?: number | undefined;
  /** The adapter behind this answer is outside its expected freshness band. */
  sourceStale?: boolean | undefined;
  /**
   * Did this query need the semantic arm at all?
   *
   * An exact citation lookup does not, and reporting `semantic_index_insufficient`
   * on `(2019) 5 SCC 1` would be true and useless — it would put a whole class of
   * working queries into `coverage_unknown` and teach every consumer to ignore
   * the field. Defaults to `true` because the conservative direction is to assume
   * a query IS semantic-dependent unless the caller knows better.
   */
  semanticDependent?: boolean | undefined;
};

const TIMEOUT_ARMS = new Set(['sparse_timeout', 'dense_timeout', 'pin_timeout']);

/**
 * The one derivation. Every consumer calls this; nobody re-implements it.
 *
 * Order matters and is not arbitrary — the checks run from "a human must decide"
 * down to "everything worked", so the most restrictive true statement wins. A
 * search that is BOTH ambiguous and degraded is `review_required`: the advocate
 * has to pick an authority before the incompleteness of the ranking is even
 * their next problem.
 */
export function deriveRetrievalOutcome(input: RetrievalOutcomeInput): RetrievalOutcome {
  const reasons: RetrievalOutcomeReason[] = [];
  const timedOut = input.degradedArms.some((a) => TIMEOUT_ARMS.has(a));
  const sparseRefused = input.degradedArms.includes('sparse_unbounded');
  const semanticDependent = input.semanticDependent ?? true;
  const semanticMissing =
    semanticDependent && (!input.semanticAvailable || !input.semanticIndexSufficient);

  // ── 1. Identity in doubt. A human chooses; we do not pick for them. ──
  //
  // NEW1 measured 74 of 229 real case-title queries naming 2-16 different cases.
  // Ranking one of them first and saying nothing is how an advocate cites the
  // wrong Sharma v. State.
  if ((input.exactTitleCandidates ?? 0) > 1) {
    reasons.push('ambiguous_identity');
    if (timedOut) reasons.push('timeout');
    if (sparseRefused) reasons.push('sparse_unbounded');
    return {
      state: 'review_required',
      reasons,
      safeForGeneration: false,
      // The one case where exact identity is NOT usable — identity is the doubt.
      exactIdentityUsable: false,
      resultCount: input.resultCount,
      ...(input.rarestDf === undefined ? {} : { rarestDf: input.rarestDf }),
      contractVersion: 1,
    };
  }

  // ── 2. Everything that makes coverage unknown, gathered before it is judged ──
  if (sparseRefused) reasons.push('sparse_unbounded');
  if (timedOut) reasons.push('timeout');
  if (semanticMissing) reasons.push('semantic_index_insufficient');
  if ((input.withheldUnsafeBody ?? 0) > 0) reasons.push('unsafe_body');
  if (input.dateUnreliable) reasons.push('date_unreliable');
  if (input.sourceStale) reasons.push('source_stale');

  const couldNotLookProperly = sparseRefused || timedOut || semanticMissing;

  // ── 3. Zero results ──
  //
  // The whole point of the file. Zero with a reason is COVERAGE UNKNOWN, and it
  // may never render as "no law on this". Zero with no reason is an honest
  // abstention: the rankers ran, nothing cleared the bar.
  if (input.resultCount === 0) {
    if (couldNotLookProperly) {
      return {
        state: 'coverage_unknown',
        reasons,
        safeForGeneration: false,
        exactIdentityUsable: true,
        resultCount: 0,
        ...(input.rarestDf === undefined ? {} : { rarestDf: input.rarestDf }),
        contractVersion: 1,
      };
    }
    reasons.push('low_relevance');
    return {
      state: 'abstained',
      reasons,
      safeForGeneration: false,
      exactIdentityUsable: true,
      resultCount: 0,
      ...(input.rarestDf === undefined ? {} : { rarestDf: input.rarestDf }),
      contractVersion: 1,
    };
  }

  // ── 4. Results, but the set is not known to be complete ──
  if (couldNotLookProperly || reasons.length > 0) {
    return {
      state: 'degraded',
      reasons,
      // Deliberately false. See `safeForGeneration` above: a partial set is safe
      // to show and unsafe to argue from.
      safeForGeneration: false,
      exactIdentityUsable: true,
      resultCount: input.resultCount,
      ...(input.rarestDf === undefined ? {} : { rarestDf: input.rarestDf }),
      contractVersion: 1,
    };
  }

  // ── 5. Everything ran ──
  return {
    state: 'answered',
    reasons: [],
    safeForGeneration: true,
    exactIdentityUsable: true,
    resultCount: input.resultCount,
    ...(input.rarestDf === undefined ? {} : { rarestDf: input.rarestDf }),
    contractVersion: 1,
  };
}

/**
 * The guard a semantic-dependent consumer calls instead of reasoning about
 * states for itself.
 *
 * It exists so that "may I write confident prose about this?" has exactly one
 * answer in the codebase. A counterargument generator that checks
 * `outcome.state === 'answered' || outcome.state === 'degraded'` because
 * degraded "still has results" is the bug this prevents, and it is an easy bug
 * to write — `degraded` sounds like a warning rather than a refusal.
 */
export function mayGenerateFrom(outcome: RetrievalOutcome): boolean {
  return outcome.safeForGeneration;
}

/**
 * Until NEW1's G3 thresholds pass, semantic coverage is NOT sufficient and the
 * server must say so rather than assume it.
 *
 * R7 §8 requires semantic-dependent routes to "default conservatively" until
 * then, and this is where that default lives — one constant rather than a
 * judgement call repeated at five call sites.
 *
 * The evidence it encodes, so that flipping it is a decision and not a tidy-up
 * (NEW1, bus 1162/1163, and 1203):
 *
 *   - end-to-end retrieval is **24.4%**, not the 37.8% conditional figure —
 *     38% of posed targets are not in the index at all
 *   - `adverse_authority` and `statute` score **0** for every representation arm
 *     tested so far
 *   - held-out abstention will cover **6 of 8** posed classes
 *
 * Flip it when NEW1 publishes an accepted candidate retrieval path and Fifth
 * reviews it. Not before, and not because a demo looked good.
 */
export const SEMANTIC_INDEX_SUFFICIENT = false;

/**
 * Which query shapes are answered by an identity predicate rather than by
 * similarity, and therefore do not depend on the semantic arm at all.
 *
 * `citation` and `section` resolve through an index on a normalised key — the
 * dense arm being cold changes nothing about them. `case_name` is deliberately
 * NOT here: the lexical ranker is strong on it but it is still a ranking, not a
 * lookup, and NEW1 measured 74 of 229 real case-title queries naming 2-16
 * different cases.
 *
 * Kept beside the outcome rather than in `query-shape.ts` because it encodes a
 * fact about CONFIDENCE, not about parsing, and the two want to change for
 * different reasons.
 */
export function isExactIdentityShape(queryClass: string): boolean {
  return queryClass === 'citation' || queryClass === 'section';
}
