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
  /**
   * A bare run of party names with no `v` — `SATENDER KUMAR ANTIL`.
   *
   * Separate from {@link QueryShape} `case_name` because it is recognised on
   * DIFFERENT evidence and is allowed to be wrong more often: `case_name` has
   * an explicit separator announcing the advocate's intent, this one infers it
   * from shape alone. Both route to the same title probe, so the extra value
   * buys a routing decision and not a second retrieval path.
   */
  | 'party_name'
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
 * ─────────────────────────────────────────────────────────────────────────────
 * A PARTY NAME WITH NO `v` — AB-1, AND WHY FREQUENCY CANNOT DECIDE IT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 measured `SATENDER KUMAR ANTIL` — an authority we hold, and the
 * most-cited node in the sampled citation graph — returning **zero results**.
 * `retrieve.ts` has had a party-name trigram probe since R8 and it is not
 * broken; the request never reached it. {@link CASE_NAME_RE} requires a literal
 * `v`/`vs`/`versus`, so a bare run of party names classified as `concept` and
 * went to the body-text ranker, which ranks the judgments CITING the authority
 * above the authority itself, or runs out of clock trying.
 *
 * **The obvious gate was measured and rejected.** The first design read
 * `lexeme_document_frequency` and treated a corpus-common token as evidence of
 * a concept query. Measured on this corpus, 30 August 2026:
 *
 * | token | df | what it actually is |
 * | --- | --- | --- |
 * | `kumar` | 0.44229 | a party name in a very large share of Indian titles |
 * | `ram` | 0.09759 | a party name |
 * | `anticipatori` | 0.06902 | a legal concept |
 * | `injunct` | 0.01685 | a legal concept |
 *
 * Frequency orders these **exactly backwards**: it would send `Ram Kumar` to
 * the concept pipeline and `interim injunction` to the party probe. Indian
 * personal names are among the most frequent tokens in this corpus precisely
 * BECAUSE they are party names. So the gate is structural, plus a small
 * explicit vocabulary of legal terms — domain knowledge, which is what
 * `DOMAIN_TRUTH.md` exists to hold, rather than a statistic that measures the
 * opposite of what it appears to.
 *
 * **Erring towards `false` is free.** A party name we fail to recognise gets
 * today's behaviour exactly. A concept query we wrongly recognise pays
 * `CASE_TITLE_BUDGET_MS` and then falls through — and cannot return a wrong
 * case, because the probe pins nothing below `word_similarity` 0.65.
 */
const LEGAL_CONCEPT_WORDS = new Set(
  [
    // Procedure and relief — what an advocate asks a court FOR.
    'bail', 'anticipatory', 'interim', 'injunction', 'stay', 'quash', 'quashing',
    'quashed', 'appeal', 'appellate', 'revision', 'review', 'writ', 'petition',
    'petitioner', 'respondent', 'application', 'suit', 'plaint', 'decree',
    'execution', 'remand', 'discharge', 'acquittal', 'conviction', 'sentence',
    'compensation', 'damages', 'maintenance', 'custody', 'divorce', 'probate',
    'arbitration', 'award', 'contempt', 'mandamus', 'certiorari', 'habeas',
    'corpus', 'caveat', 'injunctive', 'interlocutory', 'ex', 'parte',
    // Institutions and instruments.
    'court', 'tribunal', 'bench', 'judge', 'justice', 'judgment', 'judgement',
    'order', 'section', 'sections', 'act', 'rule', 'rules', 'article',
    'schedule', 'clause', 'proviso', 'statute', 'ordinance', 'notification',
    'fir', 'chargesheet', 'charge', 'complaint', 'summons', 'warrant', 'notice',
    'affidavit', 'evidence', 'witness', 'testimony', 'cognizance', 'trial',
    // Doctrine.
    'law', 'legal', 'liability', 'negligence', 'jurisdiction', 'limitation',
    'precedent', 'ratio', 'obiter', 'estoppel', 'res', 'judicata', 'mens',
    'rea', 'actus', 'reus', 'burden', 'proof', 'presumption', 'natural',
    'justice', 'fundamental', 'rights', 'constitutional', 'ultra', 'vires',
    // Interrogatives and function words — a question is never a party name.
    'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'how',
    'whether', 'can', 'may', 'must', 'should', 'would', 'could', 'does', 'do',
    'did', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have',
    'had', 'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that',
    'this', 'these', 'those', 'for', 'from', 'with', 'without', 'under', 'over',
    'into', 'onto', 'about', 'against', 'between', 'during', 'after', 'before',
    'above', 'below', 'to', 'of', 'in', 'on', 'at', 'by', 'as', 'not', 'no',
    'any', 'all', 'some', 'each', 'every', 'other', 'such', 'same', 'case',
    'cases', 'grant', 'granted', 'refuse', 'refused', 'allow', 'allowed',
    'dismiss', 'dismissed', 'held', 'hold', 'holding', 'apply', 'applied',
  ].map((w) => w.toLowerCase()),
);

/**
 * How many tokens a bare party name may carry.
 *
 * The floor is 2 because a single token is hopeless — `Antil` alone is a
 * surname, a village and a company, and one token is also what a one-word
 * concept search looks like. The ceiling is 6 because Indian cause titles run
 * long but an advocate typing SIX proper nouns with no separator and no legal
 * vocabulary has left concept-query territory entirely. Beyond it the query is
 * prose and belongs to the ranker.
 */
const PARTY_NAME_MIN_TOKENS = 2;
const PARTY_NAME_MAX_TOKENS = 6;

/**
 * Is this a bare run of party names?
 *
 * Exported so the rule can be tested directly rather than inferred from a
 * classification, the same way {@link citationIsTheQuery} is.
 *
 * **This does not build a person. It routes to CASES.** There is no
 * person entity, no dossier and no profile anywhere behind it — an ambiguous
 * party term returns every case whose title carries it, which is the same
 * answer `exactCitation` gives when a lookup is not unique.
 */
export function looksLikePartyName(text: string): boolean {
  const trimmed = text.trim();
  // A digit is a citation, a section, a year or a case number — never a name.
  if (/\d/.test(trimmed)) return false;
  const tokens = trimmed
    .split(/[\s,]+/)
    .map((t) => t.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
    .filter((t) => t.length > 0);
  if (tokens.length < PARTY_NAME_MIN_TOKENS || tokens.length > PARTY_NAME_MAX_TOKENS) return false;
  // Every token must be alphabetic. `@` and `.` are stripped above because
  // Indian titles carry `ANKIT @ SHETTY` and `M/S`, which are name furniture.
  if (!tokens.every((t) => /^\p{L}+$/u.test(t))) return false;
  if (tokens.some((t) => LEGAL_CONCEPT_WORDS.has(t.toLowerCase()))) return false;
  // At least two tokens of real length, so `of the` and initials-only cannot
  // reach the probe.
  return tokens.filter((t) => t.length >= 3).length >= PARTY_NAME_MIN_TOKENS;
}

/**
 * How much non-citation text a query may carry and still be a citation LOOKUP.
 *
 * 80 characters is comfortably more than any natural wrapper an advocate puts
 * around a citation — *"what did the Supreme Court hold in"* is 34 — and far
 * below the 200-character floor `harness/build-queries.ts` puts on a passage of
 * reasoning. The gap between those two numbers is wide enough that the exact
 * threshold is not load-bearing.
 */
const MAX_NON_CITATION_CHARS = 80;

/**
 * Is this citation what the query is ABOUT, rather than something it mentions?
 *
 * Exported so the rule that stopped 37 wrong pins can be tested directly rather
 * than inferred from a classification.
 */
export function citationIsTheQuery(text: string, citationRaw: string): boolean {
  const remainder = text.replace(citationRaw, '').trim();
  return remainder.length <= MAX_NON_CITATION_CHARS;
}

/**
 * **CONTAINING a citation is not BEING a citation lookup.**
 *
 * Measured 9 August 2026, and it had been wrong since this file was written.
 * Of the 283 evaluation queries — every one a passage of judicial reasoning
 * 200–900 characters long — **140 classified as `citation`** because a residual
 * citation survived redaction somewhere in the prose. 46 of those resolved to
 * exactly one judgment and were therefore **pinned at rank 1**, and **37 of the
 * pins were the wrong case**: 13.1% of the whole set, in *both arms of every
 * A/B this project has run*.
 *
 * {@link warrantsExactLookup} already said which way to err — *"a missed
 * citation is a slower correct answer, while a wrongly-claimed citation would
 * pin the wrong judgment at rank 1"*. The classifier simply was not strict
 * enough to honour it.
 *
 * So a citation must be **what the query is about**, not merely present in it.
 * The test is the length of what remains once the citation is removed: `what
 * did the court hold in (2019) 4 SCC 221` leaves 26 characters and is plainly a
 * lookup; a paragraph discussing a doctrine that happens to cite an authority
 * leaves hundreds and is plainly not.
 *
 * Among citation lookups the old precedence still holds and still
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
  if (citations.length > 0 && citationIsTheQuery(text, citations[0]!.raw)) {
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
  /**
   * A case name BEATS a section token that sits inside it — NEW1 bus 1021, F3.
   *
   * Measured on one of 229 gold titles, and it is a pure routing accident
   * rather than a ranking failure:
   *
   *     DR. MITHILESH KUMAR PANDEY AND 3 OTHERS Vs STATE OF U.P. THRU.
   *     PRIN.SECY. LEGISLATIVE SECTION 1 GOVT
   *
   * `SECTION 1` is part of a RESPONDENT'S NAME — a department of the Uttar
   * Pradesh government — and matching it first sent an exact case title to the
   * statute-reference lookup, which has no answer for it.
   *
   * The precedence is the right way round on the evidence available: a query
   * containing `X v Y` announces itself as an identity lookup, and an identity
   * lookup has an exact index behind it. A section number inside a party string
   * is a coincidence of vocabulary; a `v` between two parties is not.
   *
   * **Narrow: the section branch is unchanged for every query that is NOT also
   * a case name.** `section 302 IPC` and `s.138 NI Act` route exactly as they
   * did — `CASE_NAME_RE` requires `v`/`vs`/`versus` between two tokens, which
   * neither has.
   */
  const looksLikeCaseName = CASE_NAME_RE.test(text);
  if (section && !looksLikeCaseName) {
    return {
      shape: 'section',
      citation: null,
      section: section[1]!.toUpperCase(),
      act: section[2] ? section[2].replace(/\s+/g, ' ').toUpperCase() : null,
    };
  }

  if (looksLikeCaseName) {
    return { shape: 'case_name', citation: null, section: null, act: null };
  }

  /**
   * **Last before the concept floor, and that order is the whole safety
   * argument.** Every identifier-shaped route above has already had its chance:
   * a citation, a section with a named act, and an explicit `X v Y` all win
   * before a bare name is even considered. `party_name` therefore never takes a
   * query away from an exact lookup — it only takes one away from `concept`,
   * which is where AB-1's queries were going to die anyway.
   */
  if (looksLikePartyName(text)) {
    return { shape: 'party_name', citation: null, section: null, act: null };
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

/**
 * Whether a section-shaped query should be answered from the statute index
 * BEFORE the full-text ranker runs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS SEPARATE FROM THE CLASSIFIER, AND WHY IT IS STRICT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `classifyQuery` returns `section` for anything containing a section
 * reference, including a 900-character passage of reasoning that mentions one
 * in passing — the exact looseness that put **37 wrong judgments at rank 1**
 * when citations were pinned on mere presence (see {@link citationIsTheQuery}).
 * Nothing routed on `section` until now, so the looseness was harmless. Pinning
 * on it would make it the same bug a second time.
 *
 * So the same test is applied: the section reference must be what the query is
 * ABOUT. `section 302 IPC` leaves nothing behind and is a lookup; a paragraph
 * arguing about mens rea that cites s.302 leaves hundreds of characters and is
 * a concept query that the hybrid pipeline already handles well.
 *
 * **An act must be named.** `sections.ts` states the rule this side of the
 * index obeys too — *no act, no record* — because a bare `section 5` is as
 * likely to be a clause of a contract or the judgment's own numbering. Without
 * an act there is nothing to look up and guessing one returns the wrong statute
 * with total confidence.
 *
 * Erring towards `false` costs a slower correct answer. Erring towards `true`
 * puts judgments on the wrong provision at the top of the page.
 */
export function warrantsSectionLookup(q: ClassifiedQuery, raw: string): boolean {
  if (q.shape !== 'section' || q.section === null || q.act === null) return false;
  const match = SECTION_RE.exec(raw.trim());
  if (!match) return false;
  return raw.trim().replace(match[0], '').trim().length <= MAX_NON_CITATION_CHARS;
}
