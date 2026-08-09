/**
 * The concordance — teaching the corpus the names advocates actually use.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROBLEM, MEASURED 9 AUGUST 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every judgment we hold carries exactly one reporter citation and it is always
 * **S.C.R.** Across all 38,341 rows: **AIR 0, SCC 0.** So an advocate searching
 * `AIR 1973 SC 1461` — the ordinary way to cite *Kesavananda* — gets nothing,
 * and a zero result reads as *"no such case"*, which is the worst failure
 * available to a product whose promise is that a citation is real.
 *
 * Meanwhile **41,010 distinct AIR and SCC strings sit in our own judgment text
 * and resolve to nothing**: 16,848 AIR edges and 76,387 SCC edges. Many point at
 * judgments we already hold. `AIR 1952 SC 343` is cited 59 times; it is a 1952
 * Supreme Court judgment and we have every Supreme Court judgment from 1950.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SOURCE: COURTS PRINT BOTH CITATIONS THEMSELVES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Read off the corpus rather than imagined:
 *
 *     AIR 1999 SC 3734: 1999 (2) Suppl.. SCR 490
 *     1968 SCR 363 = AIR 1968 SC 1113
 *     AIR 1980 SC 791 : [1980] 2 SCR 1067
 *
 * **That adjacency is a concordance the court asserted.** We are keyed on SCR,
 * so an AIR-beside-SCR pairing resolves straight to a judgment id — no fuzzy
 * name matching, no similarity score, no model.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE YEAR GUARD, AND WHY IT IS THE WHOLE DIFFERENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first measurement of this idea was wrong and **its own samples said so**:
 * it paired `AIR 1955 SC 807` with `[1998] 3 SCR 280`. A 1955 judgment is not
 * reported in the 1998 SCR — the window had run into the *next* case in a list
 * of authorities, which is exactly how these citations appear.
 *
 * A parallel citation is one judgment in two reporters, so **the years agree or
 * differ by one** (delivered late in one year, reported early the next —
 * `AIR 1965 SC 430 = (1964) 6 SCR 727` is real). Anything else is two different
 * cases printed side by side. With the guard: **31.7% of AIR citations pair**,
 * and 57 false pairs in 6,000 were rejected on year alone.
 *
 * **A wrong alias is worse than a missing one.** An advocate who searches
 * `AIR 1952 SC 343`, receives the wrong judgment and cites it has been harmed by
 * this product in the exact way it exists to prevent. Every rule below chooses
 * silence over a guess.
 */

/** How far apart two reporters may date the same judgment. */
export const MAX_YEAR_GAP = 1;

/** `AIR 1973 SC 1461`. Tolerant of the newline this corpus's OCR inserts. */
const AIR = /\bAIR\s+(\d{4})\s+SC\s+(\d{1,5})\b/i;

/** `(2019) 4 SCC 221`. */
const SCC = /\(\s*(\d{4})\s*\)\s*(\d{1,3})\s+SCC\s+(\d{1,5})\b/i;

/**
 * Every SCR shape this corpus actually prints, collected by reading it:
 *
 *     [1980] 2 SCR 1067          brackets
 *     (1969) 1 SCR 430           parentheses
 *     [1975) 1 SCR 890           MISMATCHED brackets, from the scan
 *     1999 (2) Suppl.. SCR 490   NO brackets, volume first, doubled stop
 *     [2005] Supp. 4 SCR 253     supplement between year and volume
 *     1968 SCR 363               bare year, no volume at all
 *
 * **Brackets are optional and the middle is a free mix**, because those five
 * variations are one reporter's citation typeset five ways and rejecting any of
 * them discards real pairings for a defect in the scanner rather than in the
 * law. What keeps this from over-matching is not the shape of the prefix but the
 * two constraints around it: the literal `SCR` must follow within a few tokens,
 * and {@link MAX_YEAR_GAP} then has to hold.
 */
const SCR =
  /[[(]?\s*(\d{4})\s*[\])]?\s*(?:(?:\(\s*\d{1,2}\s*\)|SUPPL?\.{0,2}|\d{1,2})\s*){0,3}S\.?\s?C\.?\s?R\.?\s+(\d{1,5})\b/i;

/**
 * Where an authority ends. A semicolon, or the start of another case name.
 *
 * Without this the search runs past the end of one authority and pairs a
 * citation with the next case's reporter — which is the bug the year guard
 * caught, approached from the other side. Both are kept: one stops the search,
 * the other rejects what slips through.
 */
const AUTHORITY_END = /;|\bv\.?\s+\p{Lu}/u;

/** How far after a citation a parallel reference may sit. */
const PARALLEL_WINDOW = 55;

export type ParallelPair = {
  /** The alias an advocate would type — `AIR 1973 SC 1461`. */
  readonly alias: string;
  /** Which reporter the alias belongs to. */
  readonly aliasReporter: 'AIR' | 'SCC';
  /** The SCR citation printed beside it, which our corpus is keyed on. */
  readonly scr: string;
  /** Kept so a human can see why the pairing was made. */
  readonly evidence: string;
};

/**
 * Find a parallel citation printed immediately after `citation` in `following`.
 *
 * `following` is the text starting AT the citation. Returns null far more often
 * than not, and that is the intended behaviour: two thirds of citations are
 * printed alone, and inventing a pairing for them is precisely the failure this
 * module is built to avoid.
 */
export function findParallel(citation: string, following: string): ParallelPair | null {
  const flat = following.replace(/\s+/g, ' ');
  const cite = citation.replace(/\s+/g, ' ').trim();

  const air = AIR.exec(cite);
  const scc = SCC.exec(cite);
  if (!air && !scc) return null;

  const aliasYear = Number(air ? air[1] : scc![1]);
  const aliasReporter: 'AIR' | 'SCC' = air ? 'AIR' : 'SCC';
  const alias = (air ?? scc!)[0];

  // Only the span between this citation and the end of this authority.
  const after = flat.slice(alias.length, alias.length + PARALLEL_WINDOW);
  const stop = after.search(AUTHORITY_END);
  const span = stop >= 0 ? after.slice(0, stop) : after;

  const scr = SCR.exec(span);
  if (!scr) return null;

  /**
   * **The guard.** Years agree, or differ by one. Everything else is two cases
   * standing next to each other in a list of authorities.
   */
  if (Math.abs(Number(scr[1]) - aliasYear) > MAX_YEAR_GAP) return null;

  return {
    alias,
    aliasReporter,
    scr: scr[0].trim(),
    evidence: `${alias}${span.slice(0, scr.index + scr[0].length)}`.trim(),
  };
}

/**
 * The comparison key, identical in rule to `citationLookupKey` in
 * `services/api/src/search/query-shape.ts` and to the SQL expression migration
 * 0026 indexes: upper-case, and everything that is not a letter or a digit
 * removed.
 *
 * Stated here rather than imported because `@lawmind/api` depends on this
 * package's citation module and importing back would be a cycle. **Three
 * expressions of one rule is already one too many** — the live test against the
 * real corpus is what keeps them honest.
 */
export function aliasKey(citation: string): string {
  return citation.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type AliasCandidate = {
  readonly aliasKey: string;
  readonly alias: string;
  readonly aliasReporter: 'AIR' | 'SCC';
  readonly scrKey: string;
  /** How many separate citing judgments printed this pairing. */
  readonly corroborations: number;
  readonly evidence: string;
};

/**
 * Fold many sightings into candidates, and **drop every alias that was seen
 * pointing at more than one judgment.**
 *
 * A citation string means exactly one judgment. If our extraction produced two
 * different SCR targets for the same AIR number, at least one is wrong and we
 * cannot tell which — so neither is recorded. This is the same rule
 * `exactCitation` already applies when a citation resolves to two rows, and the
 * reason is the same: guessing which one the advocate meant is the confident
 * wrong answer this product cannot afford.
 */
export function reconcile(sightings: readonly ParallelPair[]): AliasCandidate[] {
  const byAlias = new Map<string, Map<string, { n: number; pair: ParallelPair }>>();

  for (const p of sightings) {
    const ak = aliasKey(p.alias);
    const sk = aliasKey(p.scr);
    const targets = byAlias.get(ak) ?? new Map();
    const seen = targets.get(sk);
    targets.set(sk, { n: (seen?.n ?? 0) + 1, pair: seen?.pair ?? p });
    byAlias.set(ak, targets);
  }

  const out: AliasCandidate[] = [];
  for (const [ak, targets] of byAlias) {
    // Contradiction: one alias, two judgments. Record nothing.
    if (targets.size !== 1) continue;
    const only = [...targets][0];
    if (!only) continue;
    const [sk, { n, pair }] = only;
    out.push({
      aliasKey: ak,
      alias: pair.alias,
      aliasReporter: pair.aliasReporter,
      scrKey: sk,
      corroborations: n,
      evidence: pair.evidence,
    });
  }
  return out;
}
