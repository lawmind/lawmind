/**
 * G-3 — WHY A CITATION GRAPH MUST DECLARE THAT IT IS PARTIAL
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CLAIM THE OLD RESPONSE MADE BY OMISSION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `GET /judgments/:id/graph` returned `rootId`, `asOf`, `nodes`, `edges`,
 * `totalNodes`, `returned` and `truncated`. `truncated` says *"this PAGE is
 * short"*. Nothing said *"this GRAPH is 0.56% complete"*, and NEW3 blocked the
 * citation-graph screen on exactly that: an advocate shown an empty graph cannot
 * tell "this judgment cites nothing" from "we have not resolved its citations",
 * and those are opposite facts about an authority.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR NUMBERS, AND ONLY ONE OF THEM IS COVERAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured 30 August 2026 on the live corpus:
 *
 *     judgment_citations rows                       22,406,483
 *     of which BLANK SENTINELS                      16,127,190   71.98%
 *     real reference strings                         6,279,293
 *     resolved rows                                    227,517    3.6233% of real
 *     distinct resolved edges                          200,761
 *     judgments with >=1 resolved outgoing             105,024    0.55987% of corpus
 *     judgments cited >=once by a resolved edge          35,153    0.18740% of corpus
 *     corpus                                        18,758,460
 *
 * **"Every judgment has its citations mapped" is arithmetically true of row
 * presence and completely false in meaning**, because 71.98% of those rows are
 * the sentinel that means *we looked and found nothing*. Coverage is defined on
 * RESOLVED EDGES and on nothing else. That sentence is the reason this module
 * exists rather than a `hasEdges` boolean.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A COMMITTED ARTIFACT AND NOT A LIVE COUNT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The measurement above takes 3.6 s. That is fine once and impossible per
 * request, so it follows the pattern `corpus/freshness-publication.ts` already
 * established: a committed artifact, read at request time, carrying its own
 * `measuredAt` so a reader can see how old the statement is.
 *
 * **It goes stale in the SAFE direction.** NEW2's resolver only ever adds edges,
 * so a figure measured today understates tomorrow's coverage. An understated
 * partiality declaration is a conservative one; the failure that matters is
 * declaring more coverage than exists, and monotonic growth makes that
 * unreachable without a deletion.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

export const GRAPH_COVERAGE_PATH = join(
  REPO_ROOT,
  'docs/ai/lcc-r12/citation-graph-coverage.json',
);

export type GraphCoverageArtifact = {
  artifact: string;
  measuredAt: string;
  basis: string;
  totalCitationRows: number;
  blankSentinelRows: number;
  realReferenceStrings: number;
  resolvedRows: number;
  resolvedEdgesInCorpus: number;
  judgmentsWithAnyResolvedOutgoing: number;
  judgmentsCitedByAnyResolvedEdge: number;
  corpusDenominator: number;
};

/** The wire shape. Additive — a client that ignores it behaves exactly as before. */
export type GraphCoverage = {
  basis: string;
  resolvedEdgesInCorpus: number;
  judgmentsWithAnyResolvedOutgoing: number;
  corpusDenominator: number;
  /**
   * **Always true, and it is a constant on purpose.** There is no coverage level
   * at which this graph becomes a complete statement about Indian citation
   * practice, and a field that could read `false` would eventually read `false`
   * because somebody moved a threshold. When the graph is genuinely complete
   * this field is removed, deliberately, rather than flipped.
   */
  declaredPartial: true;
  /** Share of the corpus with at least one resolved outgoing citation. */
  outgoingCoverageShare: number;
  measuredAt: string;
  /**
   * The sentence a client may render verbatim. Kept on the server because the
   * distinction it draws is the one an advocate must not get wrong, and three
   * clients paraphrasing it will produce three different claims.
   */
  note: string;
};

let cached: GraphCoverage | null = null;

/**
 * Read once per process. The artifact is committed and immutable between
 * deploys, so re-reading it per request buys nothing.
 *
 * **Throws when the artifact is missing or malformed**, and that is deliberate:
 * the alternative is serving a graph with no partiality declaration, which is
 * the exact defect G-3 names. Failing closed is the same choice
 * `GET /corpus/freshness/object` makes.
 */
export function graphCoverage(): GraphCoverage {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(GRAPH_COVERAGE_PATH, 'utf8')) as GraphCoverageArtifact;
  if (raw.artifact !== 'LCC_CITATION_GRAPH_COVERAGE_V1') {
    throw new Error(`unexpected graph coverage artifact: ${raw.artifact}`);
  }
  if (!Number.isFinite(raw.corpusDenominator) || raw.corpusDenominator <= 0) {
    throw new Error('graph coverage artifact has no usable corpus denominator');
  }
  cached = {
    basis: raw.basis,
    resolvedEdgesInCorpus: raw.resolvedEdgesInCorpus,
    judgmentsWithAnyResolvedOutgoing: raw.judgmentsWithAnyResolvedOutgoing,
    corpusDenominator: raw.corpusDenominator,
    declaredPartial: true,
    outgoingCoverageShare: raw.judgmentsWithAnyResolvedOutgoing / raw.corpusDenominator,
    measuredAt: raw.measuredAt,
    note:
      'This citation graph is PARTIAL. An edge we do not hold is not evidence that the ' +
      'judgment does not cite the authority — most citations in the corpus have not been ' +
      'resolved to a judgment we hold. Absence of an edge is never absence of a citation.',
  };
  return cached;
}
