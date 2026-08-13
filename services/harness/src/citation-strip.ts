/**
 * Q1.45 — strip residual citation-shaped spans from a query before sparse
 * ranking. `docs/CURRENT_PLAN.md` Q1.45: `build-queries.ts` already redacts
 * the GOLD judgment's own citation out of every query, so a citation span
 * still present is never the answer — always an incidental one the passage
 * mentions. Hypothesis: those spans are `ts_rank` noise (digits and reporter
 * abbreviations diluting weight away from the legally meaningful vocabulary
 * the true match shares with the query), not a missed-boost problem.
 *
 * Reuses `extractCitations` (`@lawmind/ingest/citations`) rather than a new
 * pattern set — its own docstring states the guarantee this experiment
 * depends on: "each pattern anchors on a reporter abbreviation that only
 * appears in a citation, so ordinary prose cannot match." `citation-strip.
 * test.ts` verifies that guarantee empirically against real adversarial
 * inputs rather than trusting the docstring.
 *
 * Deliberately NOT wired into `retrieve.ts` or any production path — an
 * experiment lives in the harness until measured, per this lane's own
 * standing rule against tuning ranking without a controlled result.
 */
import { extractCitations } from '@lawmind/ingest/citations';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes every citation-shaped span `extractCitations` finds, collapses
 * the resulting whitespace, and returns the stripped query. A no-op
 * (returns the input unchanged, same reference not required) when the
 * query carries no citation span — the negative-control population in
 * Q1.45's measurement plan depends on this being a true no-op, not an
 * approximate one.
 */
export function stripResidualCitations(query: string): string {
  const citations = extractCitations(query);
  if (citations.length === 0) return query;

  let out = query;
  for (const c of citations) {
    // Global replace, not just the first occurrence -- extractCitations
    // de-duplicates by normalised form (one entry per UNIQUE citation), so
    // a citation appearing twice in one passage must still have both
    // occurrences removed here.
    out = out.replace(new RegExp(escapeRe(c.raw), 'g'), ' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}
