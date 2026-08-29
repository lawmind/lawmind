/**
 * The bound on the ranked set — the sparse arm refusing a query it cannot rank.
 *
 * `statement_timeout` bounds TIME. The incident this exists for was not slow:
 *
 *     PostgresError: out of memory   code 53200
 *     "Failed on request of size 100663296 in memory context ExecutorState"
 *
 * Asserted through `hybridSearch` against the real corpus, because the whole
 * question is what happens to a query whose match set is measured in millions,
 * and a fixture corpus has no such query in it.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { hybridSearch, type DegradedArm } from './retrieve.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 4, onnotice: () => {} });

async function run(query: string) {
  const degraded: DegradedArm[] = [];
  const started = Date.now();
  const results = await hybridSearch(sql, query, null, {}, 50, 'hybrid', (a) => degraded.push(a));
  return { results, degraded, ms: Date.now() - started };
}

describe('sparse arm — the bound on the ranked set', () => {
  after(async () => {
    await sql.end();
  });

  it('refuses to rank a query whose rarest term is common, and SAYS SO', async (t) => {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM lexeme_document_frequency`;
    if (!row?.n) return t.skip('lexeme_document_frequency is not populated');

    // `court` appears in 90.7% of the corpus. ANDed terms cannot match more
    // than the rarest of them, so this one's upper bound is ~17 million rows.
    const { degraded, ms } = await run('court');

    assert.ok(
      degraded.includes('sparse_unbounded'),
      'the arm must report refusing, or a degraded search is indistinguishable from an empty corpus',
    );
    /**
     * It must refuse BEFORE running, not after. A refusal that costs the same
     * as the query it refuses has bought nothing — and the distinction between
     * this and `sparse_timeout` is exactly that one was never attempted.
     */
    assert.ok(ms < 2000, `refusal must be cheap; took ${ms}ms`);
    assert.ok(
      !degraded.includes('sparse_timeout'),
      'a refusal must not also be reported as a timeout — they are different facts',
    );
  });

  it('does NOT refuse an ordinary advocate query', async (t) => {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM lexeme_document_frequency`;
    if (!row?.n) return t.skip('lexeme_document_frequency is not populated');

    /**
     * The guard against a bound that solves the incident by turning the arm
     * off. `dowri` is 1.58% of the corpus and this is the shape the product is
     * for; if it ever starts reporting `sparse_unbounded` the threshold has
     * been tightened past usefulness.
     */
    const { results, degraded } = await run('anticipatory bail in a dowry harassment case');
    assert.ok(
      !degraded.includes('sparse_unbounded'),
      'an ordinary three-concept query must still be ranked',
    );
    assert.ok(results.length > 0, 'the sparse arm returned nothing for a query it accepted');
  });

  it('keeps the all-common fallback alive rather than deleting it', async (t) => {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM lexeme_document_frequency`;
    if (!row?.n) return t.skip('lexeme_document_frequency is not populated');

    /**
     * NEW1 bus 1025 measured that DELETING the all-common fallback is the worst
     * available arm — 100% timeouts, zero gold. This bound refuses only when
     * the fallback's own rarest term is common; a long query whose rarest terms
     * are genuinely rare still runs it, and that is the case asserted here.
     */
    const { results, degraded } = await run(
      'the petitioner was arrested by the police at the residence of his father in law ' +
        'and produced before the magistrate the next day where the remand was granted ' +
        'without hearing counsel',
    );
    assert.ok(
      !degraded.includes('sparse_unbounded'),
      'a long narrative with rare terms in it must still reach the ranker',
    );
    assert.ok(results.length > 0);
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * AB-2 — THE BOUND MUST ASK ABOUT THIS POPULATION, NOT ABOUT THE LEXEME
   * ───────────────────────────────────────────────────────────────────────────
   *
   * NEW3 measured a court+month `bail` refused on a corpus-wide document
   * frequency. Measured again 30 August 2026 across eight scopes, `rarestDf`
   * for `bail` was `0.25773984261292154` in ALL EIGHT — unfiltered, in one
   * court, and in a 54-document window. The refusal was a property of the word
   * and of nothing else.
   */
  it('admits a globally common term inside a NARROW court+date population', async (t) => {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM lexeme_document_frequency`;
    if (!row?.n) return t.skip('lexeme_document_frequency is not populated');

    /**
     * The scope is CHOSEN FROM THE LIVE CORPUS, not hardcoded. A fixed court
     * and month would start skipping silently the day that window changed, and
     * a test that skips looks exactly like a test that passes.
     */
    const [scope] = await sql<{ court: string; from: string; to: string; n: number }[]>`
      SELECT court,
             min(judgment_date)::text AS from,
             max(judgment_date)::text AS to,
             count(*)::int AS n
      FROM judgments
      WHERE judgment_date >= '2026-06-01' AND judgment_date <= '2026-06-30'
      GROUP BY court
      HAVING count(*) BETWEEN 200 AND 20000
      ORDER BY count(*) DESC
      LIMIT 1`;
    if (!scope) return t.skip('no bounded court-month population in this corpus');

    const degraded: DegradedArm[] = [];
    const started = Date.now();
    const results = await hybridSearch(
      sql,
      'bail',
      null,
      { court: scope.court, dateFrom: scope.from, dateTo: scope.to },
      10,
      'hybrid',
      (a) => degraded.push(a),
    );
    const ms = Date.now() - started;

    assert.ok(
      !degraded.includes('sparse_unbounded'),
      `a ${scope.n}-document window must not be refused because 'bail' is globally common`,
    );
    assert.ok(results.length > 0, 'the bounded population must actually be ranked');
    /**
     * **This number is asserting the PLAN FENCE, not the admission.** Admission
     * alone was implemented first and the same admitted query took 10,799 ms:
     * the planner cannot cost a tsquery built inside a CTE, so it BitmapAnd'd
     * 4,518,732 `bail` postings against the date index and applied the court as
     * a heap filter — to answer a 54-document window. If this assertion starts
     * failing, the `MATERIALIZED` fence in `rankWithinBoundedPopulation` has
     * been removed or inlined, and admission on its own will not catch it.
     */
    assert.ok(ms < 5000, `admitted narrow query must be fast; took ${ms}ms`);
  });

  it('still refuses a globally common term over a population it has NOT bounded', async (t) => {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM lexeme_document_frequency`;
    if (!row?.n) return t.skip('lexeme_document_frequency is not populated');

    /**
     * The largest court in the corpus. A filter IS present, so the filtered
     * probe runs — and must report the population as too large. "A filter was
     * supplied" is not evidence of narrowness, and treating it as such would
     * re-buy the site stall this whole bound exists to prevent.
     */
    const [big] = await sql<{ court: string }[]>`
      SELECT court FROM judgments GROUP BY court ORDER BY count(*) DESC LIMIT 1`;
    if (!big) return t.skip('no courts in this corpus');

    const degraded: DegradedArm[] = [];
    await hybridSearch(sql, 'bail', null, { court: big.court }, 10, 'hybrid', (a) =>
      degraded.push(a),
    );
    assert.ok(
      degraded.includes('sparse_unbounded'),
      'a filter that does not actually narrow must not buy admission',
    );
  });
});
