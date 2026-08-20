/**
 * COMMON ORDERS — one decision, many cases, and neither fact allowed to erase
 * the other.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUESTION THIS ANSWERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Indian courts routinely dispose of dozens of petitions by one order. The
 * corpus stores that as it is: one `judgments` row per petition, each with its
 * own case number, caption and citations, all sharing byte-identical text. The
 * largest observed is a Madras common order shared by **7,118 writ petitions**,
 * and 301,531 Tier-A texts have more than one row.
 *
 * An advocate asking about one of those petitions needs to be told *"this
 * decision also disposed of A, B and C"* — and must NOT be told that A, B and C
 * are the same case. They are different cases with the same decision.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GROUPING IS BYTE-IDENTICAL TEXT, AND NOTHING ELSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `content_hash` — no fuzzy matching, no near-duplicate merging, no similarity
 * threshold. `docs/ai/` records what fuzzy grouping cost when it was tried:
 * two DIFFERENT citations sharing one case name were confidently resolved to the
 * same judgment, 17 times, in a population small enough to read by hand.
 *
 * The ~2,000 genuine citation conflicts and the OCR-variance population are NOT
 * touched by this and must not be: same-looking is not same-text.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS PRESERVED, EXPLICITLY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every member keeps its own `id`, `caseTitle`, `caseNumber`, `neutralCitation`,
 * `reporterCitations`, `court` and `judgmentDate`. The representative is the one
 * the embedding pipeline vectorised — it is a REPRESENTATION choice, not a claim
 * that the other petitions matter less, and this module says so rather than
 * hiding it behind a "canonical" label.
 */
import type { Sql } from 'postgres';

export type CommonDecisionMember = {
  id: string;
  caseTitle: string;
  caseNumber: string | null;
  neutralCitation: string | null;
  reporterCitations: readonly string[];
  court: string | null;
  judgmentDate: string | null;
  /** True for the row the embedding pipeline chose to represent this text. */
  isRepresentative: boolean;
};

export type CommonDecision = {
  /** The shared text's hash. The grouping key, exposed so a caller can re-derive the set. */
  contentHash: string | null;
  /** How many judgment rows share this exact text, INCLUDING the one asked about. */
  memberCount: number;
  /** True when this decision disposed of more than one case. */
  isCommonOrder: boolean;
  members: CommonDecisionMember[];
  /**
   * True when `members` was cut short by `limit`. A truncated list that does not
   * say so reads as a complete one, and "this decision disposed of 40 cases,
   * here are 40 of 7,118" is a different sentence from "here are all of them".
   */
  truncated: boolean;
};

/** A common order shared by thousands of petitions must not become a thousand-row response. */
const DEFAULT_LIMIT = 50;

type Row = {
  id: string;
  case_title: string;
  case_number: string | null;
  neutral_citation: string | null;
  reporter_citations: string[] | null;
  court: string | null;
  judgment_date: string | null;
  content_hash: string | null;
  representative_judgment_id: string | null;
};

/**
 * The decision that disposed of this case, and every other case it disposed of.
 *
 * Two indexed reads: the judgment by primary key, then its siblings by
 * `judgments_content_hash_idx`. Never a scan.
 *
 * A judgment with a NULL `content_hash` — never hashed, not "unique" — returns a
 * single-member group with `isCommonOrder` false and `contentHash` null. The
 * caller can tell the two apart; a bare count could not.
 */
export async function commonDecisionFor(
  sql: Sql,
  judgmentId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<CommonDecision | null> {
  const [self] = await sql<{ content_hash: string | null }[]>`
    SELECT content_hash FROM judgments WHERE id = ${judgmentId}`;
  if (!self) return null;

  if (self.content_hash === null) {
    const [row] = await sql<Row[]>`
      SELECT j.id, j.case_title, j.case_number, j.neutral_citation, j.reporter_citations,
             j.court, j.judgment_date::text, j.content_hash, NULL AS representative_judgment_id
        FROM judgments j WHERE j.id = ${judgmentId}`;
    return {
      contentHash: null,
      memberCount: 1,
      isCommonOrder: false,
      members: row ? [toMember(row, judgmentId)] : [],
      truncated: false,
    };
  }

  const [counted] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM judgments WHERE content_hash = ${self.content_hash}`;
  const memberCount = Number(counted?.n ?? 1);

  const rows = await sql<Row[]>`
    SELECT j.id, j.case_title, j.case_number, j.neutral_citation, j.reporter_citations,
           j.court, j.judgment_date::text, j.content_hash,
           r.representative_judgment_id
      FROM judgments j
      LEFT JOIN embedding_content_representative r ON r.content_hash = j.content_hash
     WHERE j.content_hash = ${self.content_hash}
     ORDER BY (j.id = ${judgmentId}) DESC, j.judgment_date NULLS LAST, j.id
     LIMIT ${limit}`;

  return {
    contentHash: self.content_hash,
    memberCount,
    isCommonOrder: memberCount > 1,
    members: rows.map((r) => toMember(r, r.representative_judgment_id ?? '')),
    truncated: memberCount > rows.length,
  };
}

function toMember(row: Row, representativeId: string): CommonDecisionMember {
  return {
    id: row.id,
    caseTitle: row.case_title,
    caseNumber: row.case_number,
    neutralCitation: row.neutral_citation,
    reporterCitations: row.reporter_citations ?? [],
    court: row.court,
    judgmentDate: row.judgment_date,
    isRepresentative: row.id === representativeId,
  };
}

/**
 * The sentence a surface may show, built from the numbers rather than from a
 * template with a plural bug. Returns null when there is nothing to say — a
 * decision that disposed of one case is the ordinary case and needs no note.
 *
 * The wording is deliberate. "disposed of" is what the court did; "the same
 * case" is what these are NOT.
 */
export function commonDecisionNote(decision: CommonDecision): string | null {
  if (!decision.isCommonOrder) return null;
  const others = decision.memberCount - 1;
  return others === 1
    ? 'This decision also disposed of 1 other case.'
    : `This decision also disposed of ${others.toLocaleString('en-IN')} other cases.`;
}
