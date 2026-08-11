/**
 * DeepSeek-adjudicated candidate resolution for citations the deterministic
 * concordance (`concordance.ts`) cannot join — `docs/ai/
 * CITATION_CONCORDANCE_PROGRAM.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND WHY IT IS SEPARATE FROM `concordance.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `concordance.ts` joins an AIR/SCC citation to an SCR judgment when a court
 * prints both side by side — no fuzzy matching, no model, no risk. That
 * signal is exhausted: `docs/ai/AUTHORITY_COVERAGE.md` §3 measured **3 of
 * 1,404** SCR keys resolvable that way from the High Court corpus, because
 * bail orders cite SCC/AIR but rarely print the SCR equivalent beside them.
 *
 * The next signal is weaker and needs judgment, not string matching: the case
 * NAME printed beside the citation (`L. Hirday Narain v. ITO [(1970) 2 SCC
 * 355: AIR 1971 SC 33]`), matched by tokens against Supreme Court titles
 * within a year window. §3a of the same document measured this deterministic
 * approach at **28.0% match, 12.1% surviving adversarial validation** — real
 * failures included two SAME-REPORTER citations resolving to two different
 * judgments (a referral order and the main judgment sharing one case name),
 * which pure Jaccard-over-tokens cannot distinguish because it has no way to
 * read WHAT the surrounding text is actually claiming.
 *
 * **That is exactly the class of judgment a reasoning model is good at and a
 * string metric is not.** So the shape here is: deterministic candidate
 * generation (this module, cheap, narrows the field) → DeepSeek adjudication
 * (chooses among the narrowed candidates, or refuses). Never the reverse —
 * sending the whole corpus to the model per citation would be expensive and
 * would not fix the underlying problem, which is ambiguity the model still has
 * to resolve from the same evidence a human would need.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It does not call a model and it does not touch a database — every function
 * here is pure, so the candidate generator, the prompt and the response
 * parser are each testable without a network or a corpus.
 * `concordance-adjudicate-cli.ts` is the only place that calls InferX or
 * writes a row, and it never writes to `judgment_citation_aliases` — only to
 * `citation_concordance_resolutions`, an adjudication aid the harness does not
 * read. A wrong deterministic match or a wrong model opinion must not be able
 * to reach a citation an advocate sees; promotion is a separate, explicit step.
 */
import { createHash } from 'node:crypto';

/* ------------------------------------------------------------- tokenizing -- */

/**
 * Legal-filing stopwords that would otherwise inflate the token overlap
 * between two UNRELATED case names — "State of X v. Y" and "State of Z v. W"
 * share three tokens (`state`, `of`, `v`) that say nothing about identity.
 * Sourced from `docs/ai/AUTHORITY_COVERAGE.md` §3a's own list, which was
 * built by reading real corpus titles rather than guessed.
 */
const STOPWORDS = new Set([
  'state', 'union', 'india', 'ors', 'anr', 'anrs', 'and', 'the', 'of', 'v',
  'vs', 'versus', 'ltd', 'pvt', 'govt', 'government', 'others', 'etc', 'smt',
  'shri', 'mr', 'mrs', 'no', 'through', 'represented', 'by', 'its',
  'secretary', 'co', 'ii', 'iii', 'iv', 'anrothers', 'anr.', 'ors.',
]);

/** Upper-cased, punctuation stripped, stopwords removed. Order does not matter — Jaccard is set-based. */
export function tokenizeName(raw: string): string[] {
  return raw
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t.toLowerCase()));
}

/** Jaccard similarity over token sets. 0 when either side is empty — an empty query matches nothing, not everything. */
export function jaccardSimilarity(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection++;
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/* --------------------------------------------------------- name extraction -- */

/**
 * The case name printed immediately before a citation — `context` is the
 * bounded span ending exactly at the citation's start.
 *
 * Matches `X v. Y`, `X vs. Y`, `X versus Y`, anchored at the END of the
 * string (`$`) because the name sits directly against the citation with
 * nothing between them. Returns null far more often than not — most windows
 * do not end in a case name, and that is correct: inventing one from
 * unrelated preceding text is the exact failure the year guard in
 * `concordance.ts` exists to prevent for the SCR-pairing case, and this
 * function applies the same discipline to name matching.
 */
export function nameBeforeCitation(context: string): string | null {
  const flat = context.replace(/\s+/g, ' ').trim();
  const m =
    /([A-Z][A-Za-z.&,'()\s-]{2,120}?)\s+(?:v\.?|vs\.?|versus)\s+([A-Za-z.&,'()\s-]{2,120})\s*$/.exec(
      flat,
    );
  if (!m) return null;
  const petitioner = m[1]!.trim();
  const respondent = m[2]!.trim();
  if (petitioner.length === 0 || respondent.length === 0) return null;
  return `${petitioner} v. ${respondent}`;
}

/* --------------------------------------------------- candidate generation -- */

export type CandidateSource = {
  readonly id: string;
  readonly caseTitle: string;
  /** ISO date string. */
  readonly judgmentDate: string;
};

export type Candidate = {
  readonly judgmentId: string;
  readonly caseTitle: string;
  readonly judgmentDate: string;
  readonly jaccard: number;
};

/**
 * A parallel citation is one judgment reported in two years at most — the
 * same guard `concordance.ts`'s `MAX_YEAR_GAP` applies to SCR/AIR pairing,
 * reused here for name matching for the identical reason: a name match
 * against a judgment reported in a wildly different year is matching the
 * wrong case with the right name (repeat litigants are common in Indian
 * public-law litigation, per §3a's own finding).
 */
export const CANDIDATE_YEAR_WINDOW = 1;

/** Top-5 ranked candidates by token Jaccard, restricted to the citation's year window. Empty when the name has no usable tokens or nothing is close enough. */
export function rankCandidates(
  name: string,
  citationYear: number,
  pool: readonly CandidateSource[],
): Candidate[] {
  const queryTokens = tokenizeName(name);
  if (queryTokens.length === 0) return [];
  return pool
    .filter((j) => {
      const year = Number(j.judgmentDate.slice(0, 4));
      return Number.isFinite(year) && Math.abs(year - citationYear) <= CANDIDATE_YEAR_WINDOW;
    })
    .map(
      (j): Candidate => ({
        judgmentId: j.id,
        caseTitle: j.caseTitle,
        judgmentDate: j.judgmentDate,
        jaccard: jaccardSimilarity(queryTokens, tokenizeName(j.caseTitle)),
      }),
    )
    .filter((c) => c.jaccard > 0)
    .sort((a, b) => b.jaccard - a.jaccard)
    .slice(0, 5);
}

/**
 * `AIR 1973 SC 1461` → 1973; `(2019) 4 SCC 221` → 2019; `[1983] 2 S.C.R. 936`
 * → 1983. Null when nothing matches — a citation with no readable year is
 * skipped, never guessed at, because the year window is the guard that stops a
 * repeat litigant matching the wrong decade.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WIDENED 12 Aug 2026, AND THE ORIGINAL GAP WAS MEASURED, NOT SUSPECTED
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The first two patterns accepted `AIR YYYY SC` and `(YYYY) N SCC` and nothing
 * else. **They had no S.C.R. pattern at all** — and S.C.R. is the form every
 * one of our 38,342 Supreme Court judgments carries (`AUTHORITY_COVERAGE.md`
 * §1). Measured over 600 real resolved citations: **65.2% returned no year**,
 * and 321 of those 391 failures were ordinary S.C.R. citations.
 *
 * The consequence was not a crash but a silently narrowed funnel — every one of
 * those citations was dropped before reaching candidate generation, and the
 * gold evaluation read that as a 22.0% "reach ceiling" for the whole pipeline.
 * On the actual target population (`external_citations`, which is SCC/AIR) the
 * same function already parsed **98.4%**, so that ceiling was an artefact of
 * the evaluation population, not a property of the pipeline.
 * `CITATION_CONCORDANCE_EVALUATION.md` §2 carries the correction.
 *
 * **These are the same blind spots `Q1.0c` already found and fixed in
 * `citations.ts`'s extractor** — square brackets, the reports' year-first house
 * style, OCR-mismatched bracket pairs. This is a second, independently written
 * copy of the same idea that reproduced them, which is the argument for the
 * shapes below being derived from a frequency count over real corpus text
 * rather than from what a citation is supposed to look like.
 */
/** `SCC` · `SCR` · `S.C.C.` · `S.C.R.` · `SCALE`, however the OCR spaced or dotted it. */
const REPORTER = String.raw`(?:S\s*\.?\s*C\s*\.?\s*[CR]\s*\.?|SCALE)`;
/** An optional volume number between the year and the reporter — `(1957) SCR 605` has none. */
const VOLUME = String.raw`\s*\d{0,3}\s*`;
/**
 * Brackets are deliberately NOT required to match. `[1972) 4 SCC 600` and
 * `(2004] 3 SCR 982` are both real rows in this corpus — a scanner misreading
 * one delimiter is not a reason to drop an otherwise perfectly legible citation.
 */
const OPEN = String.raw`[[(]`;
const CLOSE = String.raw`[\])]`;

const YEAR_PATTERNS = [
  /** `AIR 1973 SC 1461` — the year sits inside the citation, not in brackets. */
  /\bAIR\s+(\d{4})\s+SC\b/i,
  /** `(2019) 4 SCC 221` · `[1983] 2 S.C.R. 936` · `(1957) SCR 605` · `[2018] 12 SCR 362` */
  new RegExp(`${OPEN}\\s*(\\d{4})\\s*${CLOSE}${VOLUME}${REPORTER}`, 'i'),
  /** The reports' own house style, year first: `1996 (4) SCC 362` · `2012 (1) SCR 779` */
  new RegExp(`\\b(\\d{4})\\s*${OPEN}\\s*\\d{1,3}\\s*${CLOSE}\\s*${REPORTER}`, 'i'),
] as const;

export function yearFromCitationText(citationText: string): number | null {
  const flat = citationText.replace(/\s+/g, ' ');
  for (const p of YEAR_PATTERNS) {
    const m = p.exec(flat);
    if (m) return Number(m[1]);
  }
  return null;
}

/* --------------------------------------------------------------- the call -- */

export type AdjudicationInput = {
  readonly citationText: string;
  readonly citationKey: string;
  readonly contextEvidence: string;
  readonly candidates: readonly Candidate[];
};

/**
 * Structured, tightly scoped — Phase 4 of the founder's directive. The model
 * is asked to choose among candidates it is GIVEN, never to recall a judgment
 * from its own weights (`MODEL_STRATEGY.md` §1: closed-book recall is a
 * fabrication risk this product cannot survive). `impossible_to_determine`
 * and `none_of_candidates` are both first-class answers, not failures — a
 * model that never says either is a model whose "high confidence" cannot be
 * trusted.
 */
export function buildAdjudicationPrompt(input: AdjudicationInput): string {
  const candidateList = input.candidates
    .map(
      (c, i) =>
        `  [${i}] id=${c.judgmentId}\n` +
        `      case_title: ${c.caseTitle}\n` +
        `      judgment_date: ${c.judgmentDate}\n` +
        `      deterministic_name_similarity: ${c.jaccard.toFixed(3)}`,
    )
    .join('\n');

  return `You are checking a citation found in an Indian court judgment against a short
list of Supreme Court judgments that might be the case it refers to. You are
NOT being asked to recall the citation from memory — every candidate you may
choose is listed below, with its actual case title and date. If the true
answer is not in this list, or you cannot tell, you must say so rather than
guess.

SOURCE CITATION (as printed): ${input.citationText}
NORMALISED KEY: ${input.citationKey}

TEXT PRINTED IMMEDIATELY BEFORE THE CITATION (the evidence — read it
carefully; it may or may not name a case):
"""
${input.contextEvidence}
"""

CANDIDATES:
${candidateList}

Decide whether the source citation refers to one of these candidates, to a
judgment not among the candidates, or cannot be determined from the evidence
given. A wrong confident answer is worse than an honest "cannot determine" —
this decision may end up shown to a practising advocate as a resolved
citation, and pointing them at the wrong case is the one failure this system
exists to prevent.

Respond with ONLY a single JSON object, no markdown fences, no commentary
outside it, matching exactly this shape:

{
  "decision": "candidate_selected" | "none_of_candidates" | "impossible_to_determine",
  "candidate_index": <integer index into the candidate list above, or null>,
  "confidence": "high" | "medium" | "low",
  "evidence": "<the specific words in the evidence text that support your decision, quoted>",
  "contradictions": "<anything in the evidence that argues AGAINST your own decision, or null if none>",
  "signals_used": ["<short strings naming which signals you relied on, e.g. 'party_name_match', 'year_match', 'context_too_short'>"],
  "needs_human_review": <true|false — true if a human should double-check this before it is trusted>,
  "reason": "<one or two sentences explaining the decision>"
}`;
}

export type AdjudicationDecision = {
  readonly decision: 'candidate_selected' | 'none_of_candidates' | 'impossible_to_determine';
  readonly candidateId: string | null;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly evidence: string;
  readonly contradictions: string | null;
  readonly signalsUsed: readonly string[];
  readonly needsHumanReview: boolean;
  readonly reason: string;
};

const DECISIONS = new Set(['candidate_selected', 'none_of_candidates', 'impossible_to_determine']);
const CONFIDENCES = new Set(['high', 'medium', 'low']);

/**
 * Parses and VALIDATES the model's response against the candidate set it was
 * actually given. Returns null on anything malformed — a response this
 * module cannot verify is treated exactly like a refusal, never guessed into
 * shape. `candidate_index` is checked against `candidates.length`, because an
 * out-of-range or hallucinated index pointing at a candidate that was never
 * offered is a worse failure than no answer.
 */
export function parseAdjudicationResponse(
  raw: string,
  candidates: readonly Candidate[],
): AdjudicationDecision | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const p = parsed as Record<string, unknown>;

  if (typeof p['decision'] !== 'string' || !DECISIONS.has(p['decision'])) return null;
  if (typeof p['confidence'] !== 'string' || !CONFIDENCES.has(p['confidence'])) return null;
  if (typeof p['evidence'] !== 'string') return null;
  if (typeof p['reason'] !== 'string') return null;
  if (typeof p['needs_human_review'] !== 'boolean') return null;

  const decision = p['decision'] as AdjudicationDecision['decision'];

  let candidateId: string | null = null;
  if (decision === 'candidate_selected') {
    const idx = p['candidate_index'];
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
      // Claims a selection but points nowhere real, or nowhere at all — refuse rather than guess which one was meant.
      return null;
    }
    candidateId = candidates[idx]!.judgmentId;
  } else if (p['candidate_index'] !== null && p['candidate_index'] !== undefined) {
    // A non-selection decision must not also carry a candidate — an internally contradictory response is not trustworthy.
    return null;
  }

  const contradictions =
    typeof p['contradictions'] === 'string' && p['contradictions'].trim().length > 0
      ? p['contradictions']
      : null;

  const signalsUsed = Array.isArray(p['signals_used'])
    ? p['signals_used'].filter((s): s is string => typeof s === 'string')
    : [];

  return {
    decision,
    candidateId,
    confidence: p['confidence'] as AdjudicationDecision['confidence'],
    evidence: p['evidence'],
    contradictions,
    signalsUsed,
    needsHumanReview: p['needs_human_review'],
    reason: p['reason'],
  };
}

/* --------------------------------------------------------- confidence tier -- */

export type ConfidenceTier = 'high' | 'medium' | 'low' | 'ambiguous' | 'unresolved';

/**
 * Combines the model's own decision with the deterministic ranking that
 * generated the candidates it was shown — Phase 5H of the founder's
 * directive: "adversarially checking deterministic matches" is itself a use
 * of the model, not a formality.
 *
 * **These thresholds are a starting hypothesis, not a measured result.**
 * `docs/ai/CITATION_CONCORDANCE_EVALUATION.md` runs this function against a
 * gold set drawn from the corpus's own already-corroborated aliases and
 * reports the ACTUAL precision per tier this policy produces — Phase 8 of the
 * directive forbids treating an unmeasured threshold as final, and this
 * comment is the record that these numbers have not yet been through that
 * measurement when first written. Change them only after re-running the gold
 * evaluation, and record the new measured precision beside the change.
 */
export function resolveConfidenceTier(
  model: AdjudicationDecision,
  candidates: readonly Candidate[],
): ConfidenceTier {
  if (model.decision === 'none_of_candidates' || model.decision === 'impossible_to_determine') {
    return 'unresolved';
  }
  if (model.candidateId === null) return 'unresolved';

  const top = candidates[0];
  const runnerUp = candidates[1];
  if (!top) return 'unresolved';

  const gap = runnerUp ? top.jaccard - runnerUp.jaccard : top.jaccard;
  const deterministicAgrees = top.judgmentId === model.candidateId;

  if (model.contradictions !== null) return 'ambiguous';
  if (!deterministicAgrees) return 'low';
  if (model.confidence === 'high' && gap >= 0.15) return 'high';
  if (model.confidence === 'low') return 'low';
  return 'medium';
}

/* -------------------------------------------------------------- hashing -- */

/** The cache/idempotency key: same citation, same evidence, same candidate SET → same call, never repeated. */
export function adjudicationInputHash(input: AdjudicationInput): string {
  const candidateKey = [...input.candidates]
    .map((c) => c.judgmentId)
    .sort()
    .join(',');
  return createHash('sha256')
    .update(`${input.citationKey}|${input.contextEvidence}|${candidateKey}`)
    .digest('hex');
}

export function adjudicationOutputHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
