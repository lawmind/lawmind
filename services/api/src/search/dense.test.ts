/**
 * The dense half of retrieval, which `route.test.ts` deliberately does not cover
 * — it stubs `embedQuery` to null and exercises the lexical degradation path.
 *
 * These assert the two properties that decide whether dense retrieval is usable
 * in production, both of which failed silently before S1 finished:
 *
 *   1. The dense query goes THROUGH the ivfflat index. It orders by cosine
 *      distance multiplied by `text_quality`, and that product is not an
 *      expression ivfflat can answer — an earlier version of this query made
 *      every search a sequential scan over the whole corpus. Measured on a
 *      20,000-row table: 4.7 ms indexed against 109.7 ms scanning, identical
 *      results. The corpus is far larger, and Gate S1 allows 3s for the whole
 *      request. Nothing in the product reports this; only the plan does.
 *
 *   2. `ivfflat.probes` is actually applied. The default is 1, which searches a
 *      single centroid and quietly returns worse authorities.
 *
 * Both assert on EXPLAIN output rather than on latency, because a timing
 * threshold on shared infrastructure is a flaky test and a plan is not.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

/** A unit vector, so it is a legal query vector rather than an arbitrary one. */
function unitVector(dims = 1024): string {
  const v = Array.from({ length: dims }, (_, i) => Math.sin(i + 1));
  const norm = Math.hypot(...v);
  return `[${v.map((x) => (x / norm).toFixed(6)).join(',')}]`;
}

const CANDIDATE_DEPTH = 50;

describe('dense retrieval plan', () => {
  let chunks = 0;
  let hasIvfflat = false;

  before(async () => {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM judgment_chunks`;
    chunks = row?.n ?? 0;
    const idx = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'judgment_chunks' AND indexdef ILIKE '%ivfflat%'`;
    hasIvfflat = idx.length > 0;
  });

  after(async () => {
    await sql.end();
  });

  it('uses the ivfflat index for the candidate search, not a sequential scan', async (t) => {
    // Skips rather than fails while the corpus is still being embedded: an index
    // on a near-empty table is correctly ignored by the planner, and asserting
    // otherwise would fail for the wrong reason.
    if (!hasIvfflat || chunks < 10_000) {
      return t.skip(
        `needs an ivfflat index over a populated table (chunks=${chunks}, index=${hasIvfflat})`,
      );
    }

    const q = unitVector();
    const plan = await sql.begin(async (tx) => {
      await tx`SET LOCAL ivfflat.probes = 10`;
      return tx<Record<string, string>[]>`
        EXPLAIN
        WITH candidates AS MATERIALIZED (
          SELECT c.judgment_id, c.chunk_text, c.text_quality,
                 c.embedding <=> ${q}::vector AS d
          FROM judgment_chunks c
          ORDER BY c.embedding <=> ${q}::vector
          LIMIT ${CANDIDATE_DEPTH * 4}
        )
        SELECT c.judgment_id, c.chunk_text,
               c.d * (2 - LEAST(COALESCE(c.text_quality, 1.0), 1.0)) AS distance
        FROM candidates c
        JOIN judgments j ON j.id = c.judgment_id
        ORDER BY distance
        LIMIT ${CANDIDATE_DEPTH * 4}`;
    });

    const text = plan.map((r) => Object.values(r)[0]).join('\n');
    assert.match(
      text,
      /Index Scan using judgment_chunks_embedding_idx/,
      `dense candidate search must use the ivfflat index. Plan was:\n${text}`,
    );
    assert.doesNotMatch(
      text,
      /Seq Scan on judgment_chunks/,
      `dense candidate search must not scan the table. Plan was:\n${text}`,
    );
  });

  it('loses the index if the quality multiplier is ordered on directly', async (t) => {
    // Pins the reason the query is shaped the way it is. If a later refactor
    // "simplifies" the CTE away, this fails and says why.
    if (!hasIvfflat || chunks < 10_000) return t.skip('needs a populated ivfflat index');

    const q = unitVector();
    const plan = await sql<Record<string, string>[]>`
      EXPLAIN
      SELECT c.judgment_id
      FROM judgment_chunks c
      ORDER BY (c.embedding <=> ${q}::vector)
               * (2 - LEAST(COALESCE(c.text_quality, 1.0), 1.0))
      LIMIT ${CANDIDATE_DEPTH * 4}`;

    const text = plan.map((r) => Object.values(r)[0]).join('\n');
    assert.doesNotMatch(
      text,
      /Index Scan using judgment_chunks_embedding_idx/,
      'if this now uses the index, pgvector gained support for the multiplied ' +
        'expression and the two-stage CTE in retrieve.ts can be simplified',
    );
  });

  it('applies ivfflat.probes inside the transaction and does not leak it', async (t) => {
    if (!hasIvfflat) return t.skip('needs an ivfflat index');

    const inside = await sql.begin(async (tx) => {
      await tx`SET LOCAL ivfflat.probes = 7`;
      const [row] = await tx<{ v: string }[]>`SHOW ivfflat.probes`;
      return row?.v;
    });
    assert.equal(inside, '7', 'SET LOCAL must apply within the transaction');

    // The connection is pooled, so a leaked setting would silently change recall
    // for whatever request is served next.
    const [after_] = await sql<{ v: string }[]>`SHOW ivfflat.probes`;
    assert.notEqual(after_?.v, '7', 'ivfflat.probes must not outlive its transaction');
  });
});
