/**
 * What KIND of question is this? — the routing decision the search pipeline
 * never made.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A CITATION SHOULD NOT GO THROUGH AN EMBEDDING MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Today every query runs the same pipeline: sparse, dense, fuse. That is right
 * for *"can anticipatory bail continue indefinitely"* and **wrong for
 * `(2019) 4 SCC 221`**.
 *
 * A citation is an **exact-match problem**. There is exactly one correct answer,
 * we hold the normalised form of it in a column with an index on it, and a
 * nearest-neighbour search over 1024-dimensional vectors is both slower and
 * *less* accurate at finding it — embedding models are notoriously poor at
 * digits, and `(2019) 4 SCC 221` and `(2019) 4 SCC 212` are different cases
 * that sit almost on top of each other in vector space.
 *
 * An advocate who types a citation expects **that case, first, every time.**
 * Anything else reads as the product not knowing the law.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE IS AND IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It is a **pure classifier over the query string**. It touches no database,
 * makes no model call, and decides nothing about ranking. It answers one
 * question — *what shape is this query* — so a caller can route it.
 *
 * **The citation patterns are NOT redefined here.** They live in
 * `@lawmind/ingest/citations`, they are already narrow enough that ordinary
 * prose cannot match them, and `CLAUDE.md` forbids inventing a citation format.
 * A second copy would drift, and the drift would be silent.
 */
import { extractCitations, normaliseCitation } from '@lawmind/ingest/citations';

/**
 * Deliberately four values and not more.
 *
 * Each one exists because it implies a **different first move**, which is the
 * only justification for a category. A fifth that routed identically to a
 * fourth would be a taxonomy, not a routing decision.
 */
export type QueryShape =
  /** A reporter or neutral citation. Exact lookup wins; similarity is noise. */
  | 'citation'
  /** A statutory provision — `s. 302 IPC`, `Section 138`, `BNS 103`. */
  | 'section'
  /** `X v Y` — a case by name, where the lexical ranker is already strong. */
  | 'case_name'
  /** A question about law. The existing hybrid pipeline is correct for this. */
  | 'concept';

export type ClassifiedQuery = {
  shape: QueryShape;
  /**
   * The normalised citation, when `shape` is `citation`. **This is what an
   * exact lookup should use** — never the raw text, which varies by typesetting.
   */
  citation: string | null;
  /** The section number as printed, when `shape` is `section`. Never normalised. */
  section: string | null;
  /** Which Act the section belongs to, when the query names one. */
  act: string | null;
};

/**
 * A statutory reference.
 *
 * Requires the word `section`/`s.`/`sec` before the number: a bare `302` is
 * hopeless — it is a year, a page, a paragraph or a section depending entirely
 * on context, and guessing is how a search for a page number returns a murder
 * provision.
 *
 * The Act is optional because advocates constantly omit it in conversation, and
 * a section with no Act is still a far better routing decision than treating
 * `Section 138` as a sentence about a concept.
 */
/**
 * **Longer alternatives first, and this is not cosmetic.** JS regex alternation
 * takes the LEFTMOST match that succeeds, not the longest — so with
 * `BNS|BNSS`, the query `section 103 BNSS` captures `BNS` and silently reports
 * the wrong Act. A test caught it. `BNSS` and `BNS` are different codes
 * governing different things (procedure against offences), and answering one
 * for the other is the kind of error `DOMAIN_TRUTH.md` exists to prevent.
 */
const SECTION_RE =
  /\b(?:section|sec|s)\.?\s*(\d{1,3}[A-Z]{0,3})\b(?:\s*(?:of\s+(?:the\s+)?)?\s*(BNSS|BNS|BSA|CrPC|CPC|IPC|NI\s+Act|Evidence\s+Act|Companies\s+Act|Arbitration\s+Act))?\b/i;

/**
 * `X v Y` / `X vs. Y` / `X versus Y`.
 *
 * The separator must be a standalone token with something either side, so
 * "v" inside a word cannot fire and a dangling "v" with nothing after it is not
 * a case name.
 */
const CASE_NAME_RE = /\S+\s+(?:v|vs|versus)\.?\s+\S+/i;

/**
 * **A citation beats everything.** It is the most specific thing a query can
 * contain and the one with a single right answer, so it is tested first and
 * short-circuits — `Kesavananda Bharati (1973) 4 SCC 225` is a citation query
 * that happens to name a case, not a case-name query that happens to cite.
 *
 * Then sections, then case names, then concept as the floor. Concept is
 * **never** an error state: it is the common case and the existing pipeline
 * handles it well.
 */
export function classifyQuery(raw: string): ClassifiedQuery {
  const text = raw.trim();
  const empty: ClassifiedQuery = { shape: 'concept', citation: null, section: null, act: null };
  if (text.length === 0) return empty;

  const citations = extractCitations(text);
  if (citations.length > 0) {
    return {
      shape: 'citation',
      // The FIRST citation, by document order. A query carrying two is a
      // comparison, and the first is the one the advocate led with.
      citation: normaliseCitation(citations[0]!.raw),
      section: null,
      act: null,
    };
  }

  const section = SECTION_RE.exec(text);
  if (section) {
    return {
      shape: 'section',
      citation: null,
      section: section[1]!.toUpperCase(),
      act: section[2] ? section[2].replace(/\s+/g, ' ').toUpperCase() : null,
    };
  }

  if (CASE_NAME_RE.test(text)) {
    return { shape: 'case_name', citation: null, section: null, act: null };
  }

  return empty;
}

/**
 * The comparison key for an exact citation lookup.
 *
 * **Deliberately cruder than `normaliseCitation`, and symmetric by
 * construction:** everything that is not a letter or a digit is removed, on
 * both sides of the comparison. `(2019) 4 S.C.C. 221`, `[2019] 4 SCC 221` and
 * `(2019)4 SCC  221` all collapse to `20194SCC221`.
 *
 * **Why not reuse `normaliseCitation` here.** That function's rules — bracket
 * conversion, whitespace collapsing, spacing after a closing paren — would have
 * to be re-implemented in SQL to compare against a stored column, and a second
 * implementation of a citation rule is exactly the drift `CLAUDE.md` forbids.
 * One rule, expressible identically in JS and in Postgres, cannot drift.
 *
 * **Being more permissive is safe here and only here**, because the caller
 * pins a result only when the lookup returns EXACTLY ONE row. A looser key that
 * matches two judgments pins neither.
 *
 * Digits are untouched, so `221` and `212` remain different cases.
 */
export function citationLookupKey(citation: string): string {
  return citation.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Whether an exact lookup should be attempted BEFORE the hybrid pipeline runs.
 *
 * **A false answer here costs nothing** — the query falls through to the
 * pipeline that handles it today. That asymmetry is why the classifier is
 * allowed to be strict: a missed citation is a slower correct answer, while a
 * wrongly-claimed citation would pin the wrong judgment at rank 1.
 */
export function warrantsExactLookup(q: ClassifiedQuery): boolean {
  return q.shape === 'citation' && q.citation !== null;
}
