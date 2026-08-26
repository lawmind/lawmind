/**
 * `judgment_date_quality` — the one place the API decides what a doubted date
 * may and may not be used for.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SHARED MODULE AND NOT A JOIN IN EACH ROUTE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW2 published four distinct facts (migration `0072`, method
 * `date-quality-v1.1`) and a fifth-agent forensic pass found the API had **zero
 * consumers of any of them**. `as-at.ts` became the first, and wrote its own
 * rule in a comment. A second route writing the same rule in a second comment is
 * how the two drift, and the one that drifts is the one that keeps asserting a
 * chronology on a date a witness contradicts.
 *
 * The four states, and the distinction that matters most:
 *
 *   `DATE_VERIFIED`  the document itself prints the stored date. Normal use.
 *   `DATE_SUSPECT`   an independent witness CONTRADICTS the stored date.
 *   `DATE_UNKNOWN`   we looked and found no independent witness.
 *   `null`           NOT_ANALYSED — nothing has ever looked at this judgment.
 *
 * **`DATE_UNKNOWN` and `null` are not the same fact and must never be merged.**
 * One is a measurement with a null result; the other is the absence of a
 * measurement. Merging them is how a coverage gap gets reported as a quality
 * problem, and how a quality problem gets hidden inside a coverage gap. NEW2
 * kept them apart in the table; the wire keeps them apart too — the state is a
 * string or it is `null`, never a fourth string.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A SUSPECT DATE DOES AND DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It does NOT remove a judgment from search, from a treatment list, or from any
 * other surface. **The problem is derived legal certainty, not discoverability.**
 * An advocate looking for a judgment must find it; 4.68% of the corpus reads
 * SUSPECT and hiding that population would be a far larger defect than any
 * ordering error it could cause.
 *
 * What it does is stop a CLAIM. A claim is legally material when the ordering of
 * two dates is the proposition itself:
 *
 *   "this bench relied on an authority that had already been overruled"
 *   "this is the LATEST word on this authority"
 *   "as of today, no later court has adversely treated it"
 *
 * Each of those is a subtraction between two dates. Where either side is
 * contradicted, `chronologyClaim()` returns `date_unreliable` and the caller
 * states that instead of the claim. **Silence is not contradiction**, so
 * `DATE_UNKNOWN` and `null` do NOT refuse — refusing on them would refuse a
 * quarter of the corpus on the strength of nobody having checked, which is the
 * `is_bail_order` NULL failure this repository has already paid for once.
 *
 * `judgments.judgment_date` is never rewritten by anything here. The state is
 * published beside it and the derived claim steps aside.
 */
import type { Sql } from 'postgres';

/** The three measured states. `null` — NOT_ANALYSED — is deliberately not one of them. */
export type DateState = 'DATE_VERIFIED' | 'DATE_SUSPECT' | 'DATE_UNKNOWN';

/**
 * What a surface puts on the wire: one of the three states, or `null` meaning
 * nothing has looked. Four values, and the client can tell all four apart.
 */
export type DateQuality = DateState | null;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SAME FOUR FACTS, NAMED — R8.3 §5.5, FIFTH bus 1322
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `DateQuality` above keeps the four facts distinct, which was the whole point,
 * and it does it by making the fourth one `null`. That is correct in TypeScript
 * and it is ambiguous on the wire: `null` is also what a client sees when a
 * route never joined the table, when a field was dropped by a proxy, and when a
 * response predates the field existing. FIFTH read `dateQuality: null` off the
 * live reader and could not tell "nothing has looked at this judgment" from
 * "this route does not carry the fact" — and 96.19% of the corpus is in that
 * state, so the ambiguity covers almost everything.
 *
 * R8.3 §5.5 requires the four to stay distinct AND requires `DATE_UNCHECKED` to
 * be one of the named states. So the fourth fact gets a name.
 *
 * **This does not merge anything.** `DATE_UNCHECKED` is exactly the population
 * that was `null`; `DATE_UNKNOWN` — we looked, we found no witness — is
 * untouched and still a different string. The refusal predicate is unchanged:
 * only `DATE_SUSPECT` refuses, because silence is not contradiction.
 *
 * Both fields go on the wire. `dateQuality` keeps its existing four-value
 * shape so a client reading it today behaves exactly as it does today;
 * `dateQualityState` is the additive, never-null one that a new client reads.
 */
export type DateQualityState = DateState | 'DATE_UNCHECKED';

/** `null` -> the named state. The only place that mapping is written. */
export function dateQualityState(q: DateQuality | undefined): DateQualityState {
  return q ?? 'DATE_UNCHECKED';
}

/**
 * The ONLY predicate that refuses. Deliberately not `!== 'DATE_VERIFIED'`:
 * that would sweep in the two silences and refuse most of the corpus.
 */
export function isDateContradicted(state: DateQuality | undefined): boolean {
  return state === 'DATE_SUSPECT';
}

/**
 * Can a claim whose whole content is the ORDER of these dates be made?
 *
 * `usable` — make the claim. `date_unreliable` — state that instead; never a
 * hedge in prose the client may not render, and never the claim with a footnote.
 */
export function chronologyClaim(...states: (DateQuality | undefined)[]): 'usable' | 'date_unreliable' {
  return states.some(isDateContradicted) ? 'date_unreliable' : 'usable';
}

/**
 * States for a set of judgment ids, one indexed read on the primary key.
 *
 * Returns a Map holding ONLY judgments that have a row. A caller asking for a
 * missing id gets `undefined`, which it must put on the wire as `null` —
 * `??  null`, never `?? 'DATE_UNKNOWN'`.
 */
export async function dateQualityFor(sql: Sql, ids: readonly string[]): Promise<Map<string, DateState>> {
  const unique = [...new Set(ids.filter((id) => id))];
  if (unique.length === 0) return new Map();
  const rows = await sql<{ judgment_id: string; state: DateState }[]>`
    SELECT judgment_id, state FROM judgment_date_quality
     WHERE judgment_id = ANY(${unique}::uuid[])
  `;
  return new Map(rows.map((r) => [r.judgment_id, r.state]));
}

/** One judgment. Same rule: absent means `null`, not a state. */
export async function dateQualityOf(sql: Sql, id: string): Promise<DateQuality> {
  const [row] = await sql<{ state: DateState }[]>`
    SELECT state FROM judgment_date_quality WHERE judgment_id = ${id}
  `;
  return row?.state ?? null;
}
