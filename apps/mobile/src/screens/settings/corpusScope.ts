import type { CorpusCoverage } from '../../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE COVERAGE SCREEN IS ALLOWED TO SAY IT HOLDS.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The screen opened with a hard-coded sentence: "Every judgment in Lawmind
 * today is from the Supreme Court of India." It was true when it was written
 * and the same screen already contradicted it below the fold — the High Court
 * rows render `held` straight from the response, so the first High Court to
 * reach a single row made the lede false while the table beside it stayed
 * right. A page whose entire purpose is to state a gap honestly cannot carry a
 * completeness claim that nothing re-derives.
 *
 * SO THE CLAIM IS DERIVED, AND THE DERIVATION HAS THREE OUTCOMES, NOT TWO.
 *
 * The third is the one that matters. `unknown` — the route has not answered, or
 * answered with a failure — is NOT the same as "we hold only the Supreme
 * Court", and it must never be rendered as one. An outage that reads as a
 * statement about the corpus is the same defect as an unverified citation shown
 * as confirmed: the advocate acts on a claim nothing checked. When we cannot
 * say, the page says it cannot say.
 *
 * NOTHING HERE IS COLOURED. This is our own uncertainty, and amber (`#B4690E`)
 * means the law has moved and nothing else. `CLAUDE.md` §6.
 */
export type CorpusScope =
  /**
   * The response is in and every High Court row holds zero. The Supreme
   * Court-only claim is TRUE OF THIS RESPONSE and may be made.
   */
  | { kind: 'supreme_court_only' }
  /**
   * At least one High Court holds rows. The claim is retired for good — what
   * replaces it names how many courts have something and keeps the warning that
   * an empty result is not an absence of law.
   */
  | { kind: 'mixed'; highCourtsWithHoldings: number; highCourtsTotal: number }
  /** Not answered yet, or answered with a failure. No claim of any kind. */
  | { kind: 'unknown' };

export function corpusScope(coverage: CorpusCoverage | null): CorpusScope {
  if (coverage === null) return { kind: 'unknown' };

  const withHoldings = coverage.highCourts.filter((c) => c.held > 0).length;
  if (withHoldings === 0) return { kind: 'supreme_court_only' };
  return {
    kind: 'mixed',
    highCourtsWithHoldings: withHoldings,
    highCourtsTotal: coverage.highCourts.length,
  };
}

/**
 * The sentence itself, so the copy is asserted rather than eyeballed.
 *
 * EVERY BRANCH KEEPS THE WARNING. The reason this screen exists is that an
 * empty search result looks identical to "there is no such judgment", and that
 * is true whether we hold one court or twenty-six. Only the claim about scope
 * changes; the thing an advocate could be harmed by not knowing does not.
 */
export function describeScope(scope: CorpusScope): string {
  if (scope.kind === 'supreme_court_only') {
    return (
      'Every judgment in Lawmind today is from the Supreme Court of India. Search finds nothing ' +
      'from a High Court not because there is nothing to find, but because we do not hold it ' +
      'yet — and that is worth knowing before you rely on an empty result.'
    );
  }

  if (scope.kind === 'mixed') {
    const { highCourtsWithHoldings: held, highCourtsTotal: total } = scope;
    const courts = held === 1 ? '1 High Court' : `${held} High Courts`;
    return (
      `Alongside the Supreme Court of India we hold part of ${courts} of ${total}. Coverage is ` +
      'uneven and no High Court is complete, so an empty result may mean we do not hold that ' +
      'court or that year yet — not that there is nothing to find.'
    );
  }

  return (
    'We could not read what we hold just now, so this page cannot tell you which courts are ' +
    'covered. Until it can, treat an empty search result as unanswered rather than as an ' +
    'absence of law.'
  );
}
