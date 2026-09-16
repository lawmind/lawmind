/**
 * `citesJudgmentId` — the paragraph-level citation navigation contract RCC's
 * client has had a dormant UI waiting on since bus 0028 ("citation navigation
 * is dormant, the field it needs isn't there"). REB §14 and V2 §39.3 both put
 * citation navigation in the reader.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS REUSES `citationMatchFragment` RATHER THAN A NEW QUERY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `compile.ts`'s own header calls a second implementation of the citation
 * match rule "the failure mode worth guarding against" — `preflight.ts`
 * exists specifically to catch one instance of that drift (JS vs SQL
 * normalisation). Writing a third citation-matching query here, even a
 * correct one today, is exactly the risk those two files warn about. This
 * resolves each paragraph's citation through the same three-source match
 * (`neutral_citation`, `reporter_citations`, the alias concordance) that
 * `cite:` search itself uses.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY AMBIGUOUS AND SELF-REFERENCING MATCHES ARE DROPPED, NOT GUESSED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The same rule `structured.ts`'s `ambiguous` outcome enforces for `cite:`
 * search applies here: a citation that resolves to more than one judgment
 * identifies none of them, and attaching the first match anyway would be a
 * confident, wrong link — worse than no link. A paragraph citing "this Court
 * in [itself]" is excluded too; a link back to the page already open is not
 * navigation.
 *
 * One citation per paragraph, matching the contract RCC recorded
 * (`citesJudgmentId?: string`, singular) — the first citation-shaped span
 * `@lawmind/ingest/citations`' extractor finds in that paragraph's text.
 */
import type { Sql, TransactionSql } from 'postgres';

import { extractCitations } from '@lawmind/ingest/citations';

import { citationMatchFragment } from '../search/qlang/compile.ts';
import { citationLookupKey } from '../search/query-shape.ts';
import { atomically } from '../transaction.ts';
import type { JudgmentParagraph } from './paragraphs.ts';

export type ParagraphWithCitation = JudgmentParagraph & {
  readonly citesJudgmentId?: string;
};

/**
 * Resolves one normalised citation key to a judgment id, excluding
 * `ownJudgmentId` — a self-citation is not navigation. Returns `null` on
 * zero or on more than one match; never guesses.
 */
async function resolveOne(sql: Sql, key: string, ownJudgmentId: string): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    SELECT j.id FROM judgments j
     WHERE ${citationMatchFragment(sql, key)} AND j.id != ${ownJudgmentId}
     LIMIT 2`;
  return rows.length === 1 ? (rows[0]?.id ?? null) : null;
}

/**
 * Runs one resolution per DISTINCT citation key found across all paragraphs —
 * not per paragraph, since a judgment routinely cites the same authority
 * several times — in parallel over the connection pool.
 */
export async function attachCitesJudgmentId(
  sql: Sql,
  paragraphs: readonly JudgmentParagraph[],
  ownJudgmentId: string,
): Promise<readonly ParagraphWithCitation[]> {
  const keyByParagraphIndex = new Map<number, string>();
  const uniqueKeys = new Set<string>();

  for (const p of paragraphs) {
    const [first] = extractCitations(p.text);
    if (!first) continue;
    const key = citationLookupKey(first.raw);
    keyByParagraphIndex.set(p.paragraphIndex, key);
    uniqueKeys.add(key);
  }

  if (uniqueKeys.size === 0) return paragraphs;

  const keys = [...uniqueKeys];
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * ONE TRANSACTION, CUSTOM PLANS ONLY — LCC R30
   * ───────────────────────────────────────────────────────────────────────────
   *
   * `resolveOne` is one prepared statement, and after five executions on a
   * connection PostgreSQL may switch it to its GENERIC plan. For this statement
   * that plan is `Limit → Seq Scan on judgments`: with the key unknown, the
   * planner estimates ~100k matches, so `LIMIT 2` makes reading the table in
   * order look like it stops almost at once. A citation that matches at most one
   * judgment then reads all 18.7 million rows. Measured on `2022 INSC 690`: the
   * custom plan answers in 1.5 ms, the generic plan runs into the 10 s statement
   * timeout, and the reader answered 503 five times out of five on a quiet box.
   *
   * `SET LOCAL plan_cache_mode = force_custom_plan` plans each execution with
   * its real key, for this transaction and nothing else — no timeout moved, no
   * server setting touched. Running the lookups inside one transaction also
   * keeps them on ONE connection: the old fan-out took up to eight pool
   * connections per read and, when one timed out, left the others still
   * running behind a request that had already answered.
   */
  const resolved = await atomically(sql, async (tx: TransactionSql) => {
    await tx`SET LOCAL plan_cache_mode = force_custom_plan`;
    // A transaction handle serves the tagged template this needs; `Sql` is the
    // type `citationMatchFragment` is written against.
    const handle = tx as unknown as Sql;
    return Promise.all(keys.map((key) => resolveOne(handle, key, ownJudgmentId)));
  });
  const judgmentIdByKey = new Map<string, string>();
  keys.forEach((key, i) => {
    const id = resolved[i];
    if (id) judgmentIdByKey.set(key, id);
  });

  if (judgmentIdByKey.size === 0) return paragraphs;

  return paragraphs.map((p) => {
    const key = keyByParagraphIndex.get(p.paragraphIndex);
    const citesJudgmentId = key ? judgmentIdByKey.get(key) : undefined;
    return citesJudgmentId ? { ...p, citesJudgmentId } : p;
  });
}
