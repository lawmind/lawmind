/**
 * Internal concordance — the SAFE half of `docs/ai/AUTHORITY_COVERAGE.md` §3a.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS, AND WHY IT IS DETERMINISTIC — NO MODEL, NO INFERX CALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * §3a measured whether an unresolved High Court citation target (`external_
 * citations` where `cited_judgment_id IS NULL`, almost all SCC/AIR — every
 * Supreme Court judgment we hold carries an S.C.R. citation and none carry SCC
 * or AIR, `AUTHORITY_COVERAGE.md` §1) can be joined using nothing but the case
 * name printed beside it in our own corpus: name + year, token-Jaccard against
 * Supreme Court titles.
 *
 * 357 of 1,277 targets matched (28.0%). Adversarial validation destroyed most
 * of it: 20 near-ties refused as ambiguous, 185 of the remainder resting on
 * thin evidence (≤3 distinguishing tokens or Jaccard < 0.45), and — read by
 * hand rather than counted — 17 genuine same-reporter collisions where two
 * DIFFERENT citations (a referral order and the main judgment sharing one
 * case name, e.g. `(2020) 3 SCC 216` and `(2020) 7 SCC 1` both "matching"
 * *Arjun Panditrao Khotkar*) were both confidently and wrongly resolved to
 * the same judgment. **Safe yield: ~155, 12.1%.**
 *
 * This module is that surviving discipline, written down rather than run once
 * from a throwaway script and discarded. It calls no model and touches no
 * network — every function here is pure over data the caller already fetched,
 * so it is testable without a corpus or a rate-limited free pool. The one
 * thing a reasoning model could add beyond this — resolving the 87.9% this
 * leaves unresolved — is deliberately NOT this module's job; that is
 * `concordance-adjudicate.ts`'s, a different pipeline with a different
 * (permanently-non-authoritative) write target.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE YEAR WINDOW IS ASYMMETRIC, UNLIKE `concordance-adjudicate.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * §3a: "restricted to the citation year and the year before (reporting lag)".
 * A citation printed in year Y refers to a judgment already decided — a
 * Supreme Court judgment dated AFTER the citing text can no more be its
 * subject than a book can cite a sequel. `concordance-adjudicate.ts`'s
 * `rankCandidates` uses a SYMMETRIC ±1 window (also accepting Y+1) because
 * that pipeline hands the result to a model that can read the surrounding
 * prose and reject a wrong year on its own steam; this module has no such
 * backstop; a candidate this module accepts is written to the corpus
 * unread by anyone. So this module does NOT reuse `rankCandidates` — it
 * reuses the tokenizing and scoring primitives underneath it
 * (`tokenizeName`, `jaccardSimilarity`) and applies the tighter, asymmetric
 * window §3a actually measured against.
 */
import { jaccardSimilarity, tokenizeName } from './concordance-adjudicate.ts';

export type PoolJudgment = {
  readonly id: string;
  readonly caseTitle: string;
  /** ISO date string. */
  readonly judgmentDate: string;
};

export type ScoredCandidate = {
  readonly judgmentId: string;
  readonly caseTitle: string;
  readonly judgmentDate: string;
  readonly jaccard: number;
  /** Token-set intersection size — how many words actually matched, not just their ratio. */
  readonly distinguishingTokens: number;
};

/** §3a's own measured thresholds. Not invented here — restated from the study, so a change to either is a change to the study, not a silent drift. */
export const MATCH_MIN_JACCARD = 0.34;
export const PROMOTION_MIN_JACCARD = 0.45;
/** "≤3 distinguishing tokens" is thin; safe requires MORE than 3. */
export const PROMOTION_MIN_DISTINGUISHING_TOKENS = 3;
/** A runner-up over 85% of the winner's score is a near-tie, not a decision. */
export const NEAR_TIE_RATIO = 0.85;
/**
 * `judgment_citation_aliases_corroborations_check` (migration 0027) enforces
 * `corroborations >= 2` at the database — one sighting could be a single OCR
 * slip. Restated here so a caller can filter before ever reaching the
 * database, not discover the floor as an insert failure.
 */
export const MIN_CORROBORATIONS = 2;

/**
 * Candidates from `pool` whose year is the citation's own year or the year
 * before it (reporting lag), ranked by token Jaccard against `name`, highest
 * first. Empty when the name tokenises to nothing or nothing scores above
 * zero — never padded to a fixed length, unlike `rankCandidates`'s top-5:
 * this module needs to know when there is only one candidate, not the best
 * five.
 */
export function rankCandidatesReportingLag(
  name: string,
  citationYear: number,
  pool: readonly PoolJudgment[],
): ScoredCandidate[] {
  const queryTokens = tokenizeName(name);
  if (queryTokens.length === 0) return [];
  const querySet = new Set(queryTokens);

  return pool
    .filter((j) => {
      const year = Number(j.judgmentDate.slice(0, 4));
      return Number.isFinite(year) && (year === citationYear || year === citationYear - 1);
    })
    .map((j): ScoredCandidate => {
      const candTokens = tokenizeName(j.caseTitle);
      const candSet = new Set(candTokens);
      let intersection = 0;
      for (const t of querySet) if (candSet.has(t)) intersection++;
      return {
        judgmentId: j.id,
        caseTitle: j.caseTitle,
        judgmentDate: j.judgmentDate,
        jaccard: jaccardSimilarity(queryTokens, candTokens),
        distinguishingTokens: intersection,
      };
    })
    .filter((c) => c.jaccard >= MATCH_MIN_JACCARD)
    .sort((a, b) => b.jaccard - a.jaccard);
}

export type MatchVerdict =
  | { readonly kind: 'no_candidate' }
  | {
      readonly kind: 'ambiguous';
      readonly top: ScoredCandidate;
      readonly runnerUp: ScoredCandidate;
    }
  | { readonly kind: 'thin'; readonly top: ScoredCandidate }
  | { readonly kind: 'safe'; readonly top: ScoredCandidate };

/**
 * Applies §3a's adversarial-validation discipline to an already-ranked
 * candidate list. This is per-target only — it cannot see the rest of the
 * batch, so it cannot catch the same-judgment-two-different-citations
 * collision (`detectCrossTargetCollisions` below does, over the whole run).
 * A `'safe'` verdict here is necessary, never sufficient, for promotion.
 */
export function classifyMatch(candidates: readonly ScoredCandidate[]): MatchVerdict {
  const top = candidates[0];
  if (!top) return { kind: 'no_candidate' };

  const runnerUp = candidates[1];
  if (runnerUp && runnerUp.jaccard > NEAR_TIE_RATIO * top.jaccard) {
    return { kind: 'ambiguous', top, runnerUp };
  }

  if (
    top.jaccard < PROMOTION_MIN_JACCARD ||
    top.distinguishingTokens <= PROMOTION_MIN_DISTINGUISHING_TOKENS
  ) {
    return { kind: 'thin', top };
  }

  return { kind: 'safe', top };
}

export type PromotionCandidate = {
  readonly citationKey: string;
  readonly citationText: string;
  readonly aliasReporter: 'AIR' | 'SCC';
  readonly targetJudgmentId: string;
  readonly targetCaseTitle: string;
  readonly jaccard: number;
  readonly corroborations: number;
  readonly evidence: string;
};

/**
 * §3a's hand-read finding, made mechanical: 17 of the accepted mappings were
 * ONE Supreme Court judgment claimed by TWO OR MORE DIFFERENT citation keys —
 * a referral order and the main judgment sharing a case name and year, or
 * repeat litigants, which a per-target Jaccard score cannot see because it
 * never looks at what else in the batch chose the same target.
 *
 * A cross-reporter pair (one AIR key and one SCC key landing on the same
 * judgment) is not automatically wrong — §3a found 18 of those were the
 * genuine SCC/AIR concordance this whole program wants. But the deterministic
 * signal here cannot tell that 18 from the 17 that are not (a roughly 51/49
 * split, worse than a coin flip), so **every judgment claimed by more than one
 * distinct citation key in this run is withheld from promotion, not guessed
 * at**. `AUTHORITY_COVERAGE.md` §3a's own rule: a wrong alias is worse than a
 * missing one.
 */
export function detectCrossTargetCollisions(candidates: readonly PromotionCandidate[]): {
  safe: PromotionCandidate[];
  collided: PromotionCandidate[];
} {
  const byTarget = new Map<string, PromotionCandidate[]>();
  for (const c of candidates) {
    const arr = byTarget.get(c.targetJudgmentId) ?? [];
    arr.push(c);
    byTarget.set(c.targetJudgmentId, arr);
  }

  const safe: PromotionCandidate[] = [];
  const collided: PromotionCandidate[] = [];
  for (const group of byTarget.values()) {
    const distinctKeys = new Set(group.map((c) => c.citationKey));
    if (distinctKeys.size > 1) collided.push(...group);
    else safe.push(...group);
  }
  return { safe, collided };
}

/** `AIR 1973 SC 1461` -> `AIR`; `(2019) 4 SCC 221` -> `SCC`; null otherwise. Matches `judgment_citation_aliases_alias_reporter_check`. */
export function reporterOf(citationText: string): 'AIR' | 'SCC' | null {
  if (/\bAIR\b/i.test(citationText)) return 'AIR';
  if (/\bSCC\b/i.test(citationText)) return 'SCC';
  return null;
}
