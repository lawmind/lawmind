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

  /**
   * `TABLESAMPLE SYSTEM`, not `ORDER BY md5(id::text)` over the whole table —
   * found necessary 18 Aug 2026. `array_length(reporter_citations, 1) >= 1` has
   * no usable index (GIN supports containment/overlap, not a generic existence
   * check), so a plain filtered scan reads all 9.5M rows before sorting a
   * random key over them. Under the ingest fleet's current write load this
   * missed a 20s `statement_timeout` outright — the earlier 8s attempt also
   * failed here, not in the `cite:` loop below.
   *
   * `retrieve.ts`'s own measurement (`exactCitation`'s header) puts reporter
   * citations at **0.53% of rows** — sparse, not rare — so `SYSTEM (5)` (5% of
   * physical blocks) expects ~2,500 qualifying rows against a `LIMIT` of
   * `sampleSize`, comfortably enough margin that an empty result would itself
   * be a finding worth surfacing rather than silently retrying.
   */
  const citations = await sql<{ judgment_id: string; alias: string }[]>`
    (SELECT judgment_id, alias FROM judgment_citation_aliases
      ORDER BY md5(id::text) LIMIT ${sampleSize})
    UNION ALL
    (SELECT id AS judgment_id, reporter_citations[1] AS alias
       FROM judgments TABLESAMPLE SYSTEM (5)
      WHERE array_length(reporter_citations, 1) >= 1
      ORDER BY md5(id::text) LIMIT ${sampleSize})`;

  let exact = 0;
  let timedOut = 0;
  /**
   * A TIGHTER `statement_timeout` for THIS loop only, restored to `DEFAULT`
   * in the `finally` below. The setup query above needs room for ordinary
   * write contention (minutes, not seconds); the `cite:` loop needs a short
   * leash because ONE call here can be the 47-million-cost plan described
   * below, and averaging the two into one connection-wide setting is what
   * killed the setup query on the first two attempts at this fix (18 Aug).
   *
   * Correct only when the caller's `sql` is a single connection (`max: 1`) —
   * `SET` is session state, and a pool free to route the next query elsewhere
   * would silently stop enforcing this. `structured-gate-cli.ts` documents
   * that requirement at its own connection. `run-cli.ts`, the OTHER caller,
   * is not verified to hold it — noted rather than fixed here, since changing
   * its pool sizing is outside what this gate's own correctness needs.
   */
  await sql`SET statement_timeout = 8000`;
  try {
    for (const c of citations) {
    /**
     * **`runStructured`'s `cite:` branch (`citationMatchFragment` in
     * `compile.ts`) can trigger a full-table backward index scan.** Found
     * running this gate 18 Aug 2026: `EXPLAIN` on a real, common citation
     * showed the planner choosing `Index Scan Backward using
     * judgments_judgment_date_idx` — walking the table in date order and
     * evaluating the (unindexable, correlated) `unnest(reporter_citations)`
     * predicate row by row — cost estimate 47 MILLION, over `Index Scan using
     * judgments_neutral_citation_key`, the exact functional index this WHERE
     * clause matches byte-for-byte. One query ran 31 minutes before being
     * cancelled. `retrieve.ts`'s `exactCitation` hit and fixed the identical
     * predicate shape on 17 Aug (see its own header); that fix was never
     * carried to this sibling call site.
     *
     * This is a correctness-adjacent PRODUCTION finding, not a harness-only
     * one — `search/structured.ts` calls this same `runStructured` for a live
     * `cite:` field query — and it is server-lane code
     * (`services/api/src/search/qlang/compile.ts`), not this lane's to fix.
     * Reported to LCC. Guarded here so one pathological citation cannot hang
     * this gate for half an hour: a per-query timeout is treated as a
     * measured FAILURE (the query ran and did not complete), never as a
     * silent skip — `citationsTested` still counts it. The bound is the `SET
     * statement_timeout = 8000` immediately above this loop.
     */
    let hits: Awaited<ReturnType<typeof runStructured>>;
    try {
      hits = await runStructured(sql, parse(`cite:${q(c.alias)}`), 2);
    } catch {
      timedOut += 1;
      failures.push(
        `cite:${c.alias} → TIMED OUT — likely the full-table backward scan defect, see header`,
      );
      continue;
    }
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
  } finally {
    // Restored even if the loop threw for a reason other than a timeout —
    // this session-level setting must never outlive this function's need for it.
    await sql`SET statement_timeout = DEFAULT`;
  }
  if (timedOut > 0) {
    failures.unshift(
      `${timedOut} of ${citations.length} citation queries TIMED OUT (>8s) — see the runStructured plan-defect note above`,
    );
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
