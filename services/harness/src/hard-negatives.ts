/**
 * Hard negatives — citations that look real and are not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS SHAPE FIRST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Both architecture documents name the same seven failure shapes
 * (`docs/RETRIEVAL_ARCHITECTURE.md` §4). Six of them need a model to produce a
 * claim before anything can be judged. **This one does not**, which makes it the
 * only one buildable today — and it happens to be the most dangerous:
 *
 * > *"A citation that exists in form but not in fact."*
 *
 * An advocate cannot tell `(2019) 4 SCC 221` from `(2019) 4 SCC 212` by eye.
 * Both are well-formed. One is a real authority; the other may be nothing at
 * all. **A system that resolves the second to the first has handed them the
 * wrong case under a citation they will paste into a filing.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ASSERTION THAT MATTERS, AND THE ONE THAT WOULD BE WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The tempting test is *"a near-miss citation must resolve to nothing"*. **That
 * is wrong**, and writing it would produce a test that fails for a good reason:
 * perturbing `(2019) 4 SCC 221` can land on `(2019) 4 SCC 212`, which may be a
 * perfectly real judgment. Resolving it is correct behaviour.
 *
 * **The real rule is narrower: a perturbed citation must never resolve back to
 * the judgment whose citation was perturbed.** That is the failure with
 * consequences — the advocate typed a citation one digit off and was handed the
 * case they did not ask for, silently, as an exact match.
 */

/** A generated near-miss, carrying what it came from so a failure is legible. */
export type NearMiss = {
  /** The citation as it appears on a real judgment in our corpus. */
  readonly original: string;
  /** The perturbed form — well-formed, one digit different. */
  readonly nearMiss: string;
  /** Which judgment the original belongs to. The near-miss must NOT resolve here. */
  readonly originalJudgmentId: string;
  /** How it was perturbed, so a failing case names its own cause. */
  readonly method: 'last-digit' | 'transpose' | 'volume';
};

/** The trailing page/serial number — the part that distinguishes two cases in one volume. */
const TRAILING_NUMBER = /(\d+)(\D*)$/;

/**
 * Change the final number by one.
 *
 * The smallest possible edit, and the one a human actually makes: a mistyped or
 * misremembered page number. `221` → `222`.
 */
export function perturbLastDigit(citation: string): string | null {
  const m = TRAILING_NUMBER.exec(citation);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(n)) return null;
  // +1 rather than -1 so a citation ending in a low number cannot go negative
  // or collide with a shorter, differently-shaped number.
  const changed = String(n + 1);
  return citation.slice(0, m.index) + changed + m[2];
}

/**
 * Swap the last two digits — `221` → `212`.
 *
 * The transposition a person makes reading from a printed report, and the one
 * an embedding model is least able to tell apart, since both strings share
 * every token.
 */
export function transposeLastDigits(citation: string): string | null {
  const m = TRAILING_NUMBER.exec(citation);
  if (!m) return null;
  const digits = m[1]!;
  if (digits.length < 2) return null;
  const swapped = digits.slice(0, -2) + digits.at(-1)! + digits.at(-2)!;
  if (swapped === digits) return null; // e.g. "22" — a swap that changes nothing
  return citation.slice(0, m.index) + swapped + m[2];
}

/**
 * Build the near-miss set for one judgment's citation.
 *
 * Returns only perturbations that actually changed the string. A "near miss"
 * identical to the original is not a negative at all, and silently keeping one
 * would make the whole set weaker while the count looked healthy.
 */
export function nearMissesFor(citation: string, originalJudgmentId: string): NearMiss[] {
  const out: NearMiss[] = [];
  const candidates: [string | null, NearMiss['method']][] = [
    [perturbLastDigit(citation), 'last-digit'],
    [transposeLastDigits(citation), 'transpose'],
  ];
  for (const [nearMiss, method] of candidates) {
    if (nearMiss === null || nearMiss === citation) continue;
    out.push({ original: citation, nearMiss, originalJudgmentId, method });
  }
  return out;
}
