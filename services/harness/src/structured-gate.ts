/**
 * The two deterministic Gate S2 metrics, measured against the live corpus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE REPLACED A PROBABILISTIC FLOOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `success@5 >= 0.70` was the gate and could not be passed: CLERC, the method
 * our evaluation set uses, publishes a **48.3% recall@1000** zero-shot ceiling
 * and reports that existing models *"struggle significantly"*.
 *
 * These two can be passed, and failing them is unambiguous:
 *
 * - **`structuredExactness`** — the citation an advocate types resolves to its
 *   judgment at rank 1. Either the index knows that name or it does not.
 * - **`fieldPrecision`** — a `judge:` query returns ONLY judgments with that
 *   judge on the bench. Verified by re-reading the rows, not by sampling.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FIXTURE IS DRAWN FROM THE CORPUS, AND THAT IS BOTH ITS STRENGTH AND ITS LIMIT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Citations are sampled from `judgment_citation_aliases` and from
 * `reporter_citations`, so the set can only test names the corpus holds. **It
 * cannot tell us about citations we have never heard of** — that is a coverage
 * question, answered by `corpus_coverage`, not by this metric. Stated because a
 * 1.0 here must not be read as "every citation an advocate types will resolve".
 */
import type { Sql } from 'postgres';

import { runStructured } from '@lawmind/api/search/qlang/compile';
import { parse } from '@lawmind/api/search/qlang/parse';

export type StructuredGateResult = {
  readonly structuredExactness: number | null;
  readonly fieldPrecision: number | null;
  /** Every failure, so a number below 1.0 is actionable rather than merely alarming. */
  readonly failures: string[];
  readonly citationsTested: number;
  readonly fieldQueriesTested: number;
};

/** Quote a value for the query language — the corpus is full of brackets and dots. */
const q = (v: string) => `"${v.replace(/"/g, '')}"`;

export async function measureStructuredGate(
  sql: Sql,
  sampleSize = 60,
): Promise<StructuredGateResult> {
  const failures: string[] = [];

  /* ── structuredExactness ──────────────────────────────────────────────── */

  const citations = await sql<{ judgment_id: string; alias: string }[]>`
    (SELECT judgment_id, alias FROM judgment_citation_aliases
      ORDER BY md5(id::text) LIMIT ${sampleSize})
    UNION ALL
    (SELECT id AS judgment_id, reporter_citations[1] AS alias
       FROM judgments
      WHERE array_length(reporter_citations, 1) >= 1
      ORDER BY md5(id::text) LIMIT ${sampleSize})`;

  let exact = 0;
  for (const c of citations) {
    const hits = await runStructured(sql, parse(`cite:${q(c.alias)}`), 2);
    /**
     * **Rank 1 and nothing else.** A citation naming two judgments is not a
     * near-miss; it is an ambiguous answer, and `exactCitation` already refuses
     * to pin in that case. Counting it as a pass would hide the ambiguity.
     */
    if (hits.length === 1 && hits[0]?.judgmentId === c.judgment_id) exact++;
    else {
      failures.push(
        `cite:${c.alias} → ${hits.length === 0 ? 'nothing' : `${hits.length} judgment(s), wrong or ambiguous`}`,
      );
    }
  }

  /* ── fieldPrecision ───────────────────────────────────────────────────── */

  const judges = await sql<{ judge_name: string }[]>`
    SELECT judge_name FROM judgment_judges
     GROUP BY judge_name HAVING count(*) BETWEEN 5 AND 400
     ORDER BY md5(judge_name) LIMIT ${sampleSize}`;

  let checked = 0;
  let clean = 0;
  for (const j of judges) {
    const hits = await runStructured(sql, parse(`judge:${q(j.judge_name)}`), 10);
    if (hits.length === 0) continue;
    checked++;

    // Re-read the bench from the rows themselves rather than trusting the query.
    const ids = hits.map((h) => h.judgmentId);
    const rows = await sql<{ judgment_id: string }[]>`
      SELECT DISTINCT judgment_id FROM judgment_judges
       WHERE judgment_id = ANY(${ids}) AND judge_name = ${j.judge_name}`;
    if (rows.length === hits.length) clean++;
    else {
      failures.push(
        `judge:${j.judge_name} → ${hits.length - rows.length} of ${hits.length} results do NOT have that judge`,
      );
    }
  }

  return {
    // Null, never 0, over an empty sample — an absent check is not a negative
    // result, and `grade` treats null as a failure for exactly that reason.
    structuredExactness: citations.length === 0 ? null : exact / citations.length,
    fieldPrecision: checked === 0 ? null : clean / checked,
    failures,
    citationsTested: citations.length,
    fieldQueriesTested: checked,
  };
}
