/**
 * `sc` / `hc` / `district` / `tribunal` → the strings `judgments.court` holds.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE EXPANSION IS ON THE SERVER — RCC BUS 0046
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * RCC asked for the call and named the three ways to make it. The client's chips
 * are CATEGORIES; `filters.court` was an exact match on a court NAME, so the two
 * never met and the filter narrowed nothing against the real API.
 *
 * Option 3 — the client hardcodes a name mapping — is the one RCC refused, and
 * refused correctly: **a wrong string returns zero results silently**, and a
 * search that reports "nothing matched" when it never asked is the same failure
 * as a filter that does nothing, wearing a more convincing face. The column is
 * ours; the strings in it are ours; the mapping is therefore ours.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLASSIFIED FROM THE PRINTED NAME, AND NEVER FROM A LIST WE MAINTAIN BY HAND
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A hardcoded list of 19 court names would be correct today and silently wrong
 * the first time an ingest lands a twentieth — the new court would fall into no
 * category and vanish from every filtered search, which is the *exact* silent
 * zero-result failure this module exists to prevent, moved from the client to
 * here.
 *
 * So the rule reads the name. Measured against production 11 Aug 2026, all 19
 * distinct values:
 *
 *     Supreme Court of India                   38,342
 *     Patna High Court                         39,445    ← name-first
 *     High Court of Gujarat                       497    ← name-last
 *     High Court  for State of Telangana           21    ← double space
 *     High Court Of Chhattisgarh                    4    ← capital "Of"
 *
 * Spacing and capitalisation are unreliable in this corpus, so matching is
 * case-insensitive on whitespace-collapsed text and never on an exact string.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `district` AND `tribunal` MATCH NOTHING TODAY, AND THAT IS REPORTED, NOT HIDDEN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The corpus holds Supreme Court and High Court rows and nothing else. A chip
 * for a category we hold none of returns an empty result that looks identical
 * to "your query matched nothing" — the advocate concludes we have no case on
 * their point when we were never asked. `unpopulatedCategories` lets the search
 * response say which categories the corpus cannot answer, so the client can
 * state it instead of implying it.
 *
 * The categories are NOT removed. They are real divisions of Indian litigation
 * and they will be populated; a category that disappears from the contract is a
 * client change on the day the data lands, and an empty one is not.
 */
import type { Sql } from 'postgres';

export const COURT_CATEGORIES = ['sc', 'hc', 'district', 'tribunal'] as const;
export type CourtCategory = (typeof COURT_CATEGORIES)[number];

const collapse = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Which category a printed court name falls in, or `null` for one no rule
 * claims.
 *
 * **Null is a real answer and must stay one.** Guessing a category for an
 * unfamiliar court would put a judgment behind a filter it does not belong to,
 * and a filtered search that returns the wrong court is worse than one that
 * returns less — the advocate cannot see what was wrongly included.
 *
 * Exhaustive over `CourtCategory` by construction: adding a category to the
 * union without deciding how a name reaches it is caught by
 * `court-category.test.ts`, which asserts every category is either derivable or
 * listed as unpopulated.
 */
export function categoryOf(courtName: string): CourtCategory | null {
  const name = collapse(courtName);
  if (name === 'supreme court of india') return 'sc';
  // Both printed orders occur — `Patna High Court` and `High Court of Gujarat`.
  if (name.includes('high court')) return 'hc';
  // Neither appears in the corpus today. The rules are written from how these
  // courts print their own names, so the category works the day rows land
  // rather than needing this file edited then.
  if (/\b(district|sessions|civil judge|magistrate)\b/.test(name)) return 'district';
  if (/\b(tribunal|nclt|nclat|itat|cestat|appellate authority|commission)\b/.test(name)) {
    return 'tribunal';
  }
  return null;
}

/**
 * The court names in the corpus that fall under the requested categories.
 *
 * Read from the column each request rather than cached: an ingest landing a new
 * court must become filterable without a deploy, and the distinct-court list is
 * 19 rows over an indexed column — cheap enough that caching it would be
 * trading correctness for nothing.
 */
export async function expandCategories(
  sql: Sql,
  categories: readonly CourtCategory[],
): Promise<string[]> {
  if (categories.length === 0) return [];
  const rows = await sql<{ court: string }[]>`SELECT DISTINCT court FROM judgments`;
  const wanted = new Set(categories);
  return rows.map((r) => r.court).filter((c) => {
    const cat = categoryOf(c);
    return cat !== null && wanted.has(cat);
  });
}

/**
 * Categories the corpus currently holds no judgment for.
 *
 * Sent on the search response so a client can say "we hold no district court
 * judgments yet" instead of rendering an empty result list that reads as "your
 * query found nothing". `docs/CITATION_HARNESS.md`'s silent-drop reasoning
 * applied to a filter: absence must state itself.
 */
export async function unpopulatedCategories(sql: Sql): Promise<CourtCategory[]> {
  const rows = await sql<{ court: string }[]>`SELECT DISTINCT court FROM judgments`;
  const present = new Set(rows.map((r) => categoryOf(r.court)).filter((c) => c !== null));
  return COURT_CATEGORIES.filter((c) => !present.has(c));
}

/**
 * Court names in the corpus that no rule classifies.
 *
 * Zero today. Non-zero means an ingest landed a court whose name none of the
 * rules above recognise, and those judgments are invisible to every category
 * filter — the silent failure this module exists to prevent, so it is queryable
 * rather than something anybody has to think to look for.
 */
export async function unclassifiedCourts(sql: Sql): Promise<string[]> {
  const rows = await sql<{ court: string }[]>`SELECT DISTINCT court FROM judgments`;
  return rows.map((r) => r.court).filter((c) => categoryOf(c) === null);
}
