/**
 * NEW1 — the leakage contract for retrieval evaluation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * The reranker baseline reported +21.5 points and the gain was the BENCHMARK, not
 * the ranking: all 278 gold authorities were inbound-cited, the reranker had an
 * inbound-citation feature, and the feature was reading back the way the gold had
 * been constructed. Interaction-only features bought 0.69 points. Nothing about
 * that experiment was salvageable by tuning it.
 *
 * The defect was not a bad feature. It was that "how this gold was made" lived in
 * a paragraph of a report and "which features the scorer used" lived in code, and
 * nothing connected them. This module connects them, mechanically:
 *
 *   every eval row carries its provenance
 *   every provenance names the feature families it PROHIBITS
 *   a scorer that reads a prohibited family throws
 *
 * A rule that is only written down is a rule that gets forgotten under deadline.
 * `assertFeatureAllowed` is the whole point of the file.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE, STATED ONCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Do not evaluate a feature that directly recreates how the gold was constructed.
 *
 * If an authority is gold BECAUSE a judge cited it, then "was this authority
 * cited" is not a retrieval signal — it is the answer key. If an authority is gold
 * because the query IS its own case title, then title matching is not a retrieval
 * signal either. Neither feature is bad. Both are unmeasurable ON THAT GOLD.
 */

/** How an authority came to be gold for a query. Not how the QUERY was made. */
export type GoldProvenanceType =
  /** A judge cited it. The edge is the evidence. */
  | 'citation_edge'
  /** The query is the authority's own neutral citation string. */
  | 'own_citation_string'
  /** The query is the authority's own case title. */
  | 'own_case_title'
  /** The query is a claim extracted from the authority's own text (LCC legal objects). */
  | 'legal_object_claim'
  /** A person read the query and the authority and judged the pairing. */
  | 'human_adjudicated'
  /** A canonical status field says so — set_aside, overruled, and the like. */
  | 'canonical_status';

/**
 * Feature families a candidate scorer may read.
 *
 * Families, not individual features: the question "does this recreate the gold"
 * is answered at the level of the SIGNAL, and splitting `bm25_title` from
 * `bm25_body` would let a prohibited signal in through the half nobody listed.
 */
export type FeatureFamily =
  | 'dense_similarity'
  | 'sparse_lexical'
  | 'exact_citation_match'
  | 'title_match'
  | 'inbound_citation_graph'
  | 'court_and_date'
  | 'verified_legal_object_match'
  | 'treatment_and_currentness';

export const ALL_FEATURE_FAMILIES: readonly FeatureFamily[] = [
  'dense_similarity',
  'sparse_lexical',
  'exact_citation_match',
  'title_match',
  'inbound_citation_graph',
  'court_and_date',
  'verified_legal_object_match',
  'treatment_and_currentness',
];

/**
 * What each provenance forbids, and WHY in one sentence each — because the next
 * person to hit a thrown assertion needs the reason, not just the rule.
 */
const PROHIBITED: Record<GoldProvenanceType, { family: FeatureFamily; why: string }[]> = {
  citation_edge: [
    {
      family: 'inbound_citation_graph',
      why: 'the authority is gold BECAUSE it was cited — an inbound-citation feature reads the answer key',
    },
  ],
  own_citation_string: [
    {
      family: 'exact_citation_match',
      why: 'the query IS the authority’s citation string, so exact-citation match is identity, not retrieval',
    },
  ],
  own_case_title: [
    {
      family: 'title_match',
      why: 'the query IS the authority’s title, so title match is identity, not retrieval',
    },
  ],
  legal_object_claim: [
    {
      family: 'verified_legal_object_match',
      why: 'the query was extracted FROM the indexed object — matching it back is the extraction, not retrieval',
    },
  ],
  human_adjudicated: [],
  canonical_status: [
    {
      family: 'treatment_and_currentness',
      why: 'the authority is gold BECAUSE of its treatment status — reading that status back is circular',
    },
  ],
};

/**
 * Additional prohibitions that do not follow from provenance but from how the
 * QUERY text was produced. Kept separate because they compose: a citation-edge
 * gold whose query still contains the citation string leaks through a different
 * door than the edge itself.
 */
export type QueryConstruction =
  /** Passage lifted from the citing judgment with the target's identifiers redacted. */
  | 'redacted_passage'
  /** Passage lifted with NOTHING removed. */
  | 'raw_passage'
  /** The authority's own identifier, handed back verbatim. */
  | 'own_identifier'
  /** Written by a person, or by a model that never saw the target. */
  | 'independent';

const CONSTRUCTION_PROHIBITED: Record<QueryConstruction, { family: FeatureFamily; why: string }[]> = {
  redacted_passage: [],
  raw_passage: [
    {
      family: 'exact_citation_match',
      why: 'the query still contains the target’s own citation, so an exact match is a copy of the input',
    },
    {
      family: 'title_match',
      why: 'the query still contains the target’s own title',
    },
  ],
  own_identifier: [],
  independent: [],
};

/** One evaluation row. Every field here is load-bearing; none is decoration. */
export type EvalRow = {
  queryId: string;
  /** What KIND of question this is. Never pooled across kinds into one metric. */
  queryType: string;
  query: string;
  /** The authority this query is looking for. */
  goldAuthorityId: string;
  goldProvenanceType: GoldProvenanceType;
  queryConstruction: QueryConstruction;
  /**
   * The evidence for the gold, in whatever shape the provenance produces — the
   * citing judgment id for an edge, the annotator and date for a human call.
   * Free-form ON PURPOSE: forcing one schema across six provenances would either
   * lose detail or invent fields.
   */
  goldEvidence: Record<string, unknown>;
  /**
   * Rows sharing a family must land in the SAME split.
   *
   * Three rows built from one authority — its proposition, its citation string,
   * its title — are not three independent measurements. Splitting them across
   * train and test lets a model memorise the authority in one and be scored on it
   * in the other, which is the quiet version of the same leak this file exists to
   * prevent.
   */
  caseFamily: string;
};

/**
 * A negative is a (query, candidate) PAIR, never a document.
 *
 * An authority that was set aside is a bad answer to "what supports proposition X"
 * and the RIGHT answer to "what authority is there against X". A globally negative
 * id would teach a ranker to bury exactly the document a advocate arguing the
 * other side most needs. There is no such thing as a negative authority; there are
 * only wrong answers to particular questions.
 */
export type Negative = {
  queryId: string;
  candidateId: string;
  /** Why this candidate is wrong FOR THIS QUERY. Free text; it is read by people. */
  negativeReason: string;
};

export type FeaturePolicy = {
  allowed: FeatureFamily[];
  prohibited: { family: FeatureFamily; why: string }[];
};

/** What a scorer may read for one row. Provenance and construction compose. */
export function featurePolicy(row: Pick<EvalRow, 'goldProvenanceType' | 'queryConstruction'>): FeaturePolicy {
  const prohibited = [...PROHIBITED[row.goldProvenanceType], ...CONSTRUCTION_PROHIBITED[row.queryConstruction]];
  // Deduplicated by family, keeping the first reason: two doors to the same leak
  // is still one leak, and reporting it twice reads as two problems.
  const seen = new Set<FeatureFamily>();
  const unique = prohibited.filter((p) => (seen.has(p.family) ? false : (seen.add(p.family), true)));
  const banned = new Set(unique.map((p) => p.family));
  return { allowed: ALL_FEATURE_FAMILIES.filter((f) => !banned.has(f)), prohibited: unique };
}

export class LeakageError extends Error {
  constructor(
    readonly queryId: string,
    readonly family: FeatureFamily,
    readonly why: string,
  ) {
    super(`LEAKAGE: ${queryId} may not be scored with ${family} — ${why}`);
    this.name = 'LeakageError';
  }
}

/**
 * Throw rather than return false.
 *
 * A boolean gets ignored. The contaminated reranker experiment ran to completion
 * and produced a publishable-looking number; nothing anywhere refused. An
 * exception cannot be skimmed past.
 */
export function assertFeatureAllowed(row: EvalRow, family: FeatureFamily): void {
  const hit = featurePolicy(row).prohibited.find((p) => p.family === family);
  if (hit) throw new LeakageError(row.queryId, family, hit.why);
}

/** Every family a set of rows agrees on. The intersection, so one row's ban binds the run. */
export function allowedAcross(rows: EvalRow[]): FeatureFamily[] {
  const banned = new Set<FeatureFamily>();
  for (const r of rows) for (const p of featurePolicy(r).prohibited) banned.add(p.family);
  return ALL_FEATURE_FAMILIES.filter((f) => !banned.has(f));
}

/**
 * Split by FAMILY, never by row.
 *
 * Deterministic from the family string so the same gold produces the same split
 * on every machine and in every rerun — a split that moves makes two runs
 * incomparable for a reason nobody will find.
 */
export function splitByFamily(rows: EvalRow[], holdoutFraction = 0.3): { train: EvalRow[]; test: EvalRow[] } {
  const families = [...new Set(rows.map((r) => r.caseFamily))].sort();
  const hash = (s: string): number => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  };
  const held = new Set(families.filter((f) => hash(f) < holdoutFraction));
  return {
    train: rows.filter((r) => !held.has(r.caseFamily)),
    test: rows.filter((r) => held.has(r.caseFamily)),
  };
}
