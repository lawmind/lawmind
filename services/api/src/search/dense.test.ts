/**
 * The dense half of retrieval, which `route.test.ts` deliberately does not cover
 * — it stubs `embedQuery` to null and exercises the lexical degradation path.
 *
 * These assert the three properties that decide whether dense retrieval is usable
 * in production. All three failed silently at some point during S1, and none of
 * them shows up as an error: the product returns results either way, just worse
 * ones.
 *
 *   1. The dense query goes THROUGH the vector index. It orders by cosine
 *      distance multiplied by `text_quality`, and that product is not an
 *      expression the index can answer — an earlier version made every search a
 *      sequential scan of the whole corpus. Measured server-side on the full
 *      616,197-chunk corpus: **10.7 ms through the index against 1,100.5 ms
 *      scanning**, for the same query shape. Gate S1 allows 3s for the whole
 *      request. Nothing in the product reports this; only the plan does.
 *
 *   2. `hnsw.ef_search` is actually applied, and does not leak. The connection is
 *      pooled, so a leaked setting changes recall for whatever request is served
 *      next.
 *
 *   3. `ef_search` is not below the candidate depth. This is the one that would
 *      never have been noticed: pgvector returns FEWER rows than LIMIT when
 *      `ef_search` is under it, without erroring. At the default of 40 that was
 *      short candidate lists on 40 of 40 measured queries.
 *
 * Assertions are on EXPLAIN output and row counts rather than latency, because a
 * timing threshold on shared infrastructure is a flaky test and a plan is not.
 *
 * **The index is HNSW, replacing ivfflat**, and these tests moved with it.
 * `sprints/SPRINT_1.md` §4 names "ivfflat on vector_cosine_ops", but the same
 * sprint's DONE criterion is a citation retrieved under 3s p95 on the production
 * instance — ivfflat was the means, and the measurement above is what chose
 * between them. `docs/LCC_PLAN.md` §2B records the reversal and why.
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

/** Mirrors `retrieve.ts`: CANDIDATE_DEPTH 50, unfiltered annDepth 4x that. */
const CANDIDATE_DEPTH = 50;
const ANN_DEPTH = CANDIDATE_DEPTH * 4;

describe('dense retrieval plan', () => {
  let chunks = 0;
  let hasHnsw = false;

  before(async () => {
    const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM judgment_chunks`;
    chunks = row?.n ?? 0;
    const idx = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'judgment_chunks' AND indexdef ILIKE '%hnsw%'`;
    hasHnsw = idx.length > 0;
  });

  after(async () => {
    await sql.end();
  });

  it('uses the hnsw index for the candidate search, not a sequential scan', async (t) => {
    // Skips rather than fails against a fresh or partly-embedded corpus: an index
    // on a near-empty table is correctly ignored by the planner, and asserting
    // otherwise would fail for the wrong reason. CI runs on an empty database.
    if (!hasHnsw || chunks < 10_000) {
      return t.skip(
        `needs an hnsw index over a populated table (chunks=${chunks}, index=${hasHnsw})`,
      );
    }

    const q = unitVector();
    const plan = await sql.begin(async (tx) => {
      await tx`SET LOCAL hnsw.ef_search = 200`;
      return tx<Record<string, string>[]>`
        EXPLAIN
        WITH candidates AS MATERIALIZED (
          SELECT c.judgment_id, c.chunk_text, c.text_quality,
                 c.embedding <=> ${q}::vector AS d
          FROM judgment_chunks c
          ORDER BY c.embedding <=> ${q}::vector
          LIMIT ${ANN_DEPTH}
        )
        SELECT c.judgment_id, c.chunk_text,
               c.d * (2 - LEAST(COALESCE(c.text_quality, 1.0), 1.0)) AS distance
        FROM candidates c
        JOIN judgments j ON j.id = c.judgment_id
        ORDER BY distance
        LIMIT ${ANN_DEPTH}`;
    });

    const text = plan.map((r) => Object.values(r)[0]).join('\n');
    assert.match(
      text,
      /Index Scan using judgment_chunks_embedding_hnsw/,
      `dense candidate search must use the hnsw index. Plan was:\n${text}`,
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
    if (!hasHnsw || chunks < 10_000) return t.skip('needs a populated hnsw index');

    const q = unitVector();
    const plan = await sql<Record<string, string>[]>`
      EXPLAIN
      SELECT c.judgment_id
      FROM judgment_chunks c
      ORDER BY (c.embedding <=> ${q}::vector)
               * (2 - LEAST(COALESCE(c.text_quality, 1.0), 1.0))
      LIMIT ${ANN_DEPTH}`;

    const text = plan.map((r) => Object.values(r)[0]).join('\n');
    assert.doesNotMatch(
      text,
      /Index Scan using judgment_chunks_embedding_hnsw/,
      'if this now uses the index, pgvector gained support for the multiplied ' +
        'expression and the two-stage CTE in retrieve.ts can be simplified',
    );
  });

  it('applies hnsw.ef_search inside the transaction and does not leak it', async (t) => {
    if (!hasHnsw) return t.skip('needs an hnsw index');

    const inside = await sql.begin(async (tx) => {
      await tx`SET LOCAL hnsw.ef_search = 77`;
      const [row] = await tx<{ v: string }[]>`SHOW hnsw.ef_search`;
      return row?.v;
    });
    assert.equal(inside, '77', 'SET LOCAL must apply within the transaction');

    // The connection is pooled, so a leaked setting would silently change recall
    // for whatever request is served next.
    const [after_] = await sql<{ v: string }[]>`SHOW hnsw.ef_search`;
    assert.notEqual(after_?.v, '77', 'hnsw.ef_search must not outlive its transaction');
  });

  it('returns a full candidate list, because a short one is a silent recall loss', async (t) => {
    if (!hasHnsw || chunks < ANN_DEPTH * 10) {
      return t.skip(`needs an hnsw index over a populated table (chunks=${chunks})`);
    }

    const q = unitVector();
    const rows = await sql.begin(async (tx) => {
      // Exactly what retrieve.ts sets.
      await tx`SET LOCAL hnsw.ef_search = 200`;
      await tx`SET LOCAL hnsw.iterative_scan = relaxed_order`;
      return tx<{ id: string }[]>`
        SELECT id FROM judgment_chunks
        ORDER BY embedding <=> ${q}::vector
        LIMIT ${ANN_DEPTH}`;
    });

    assert.equal(
      rows.length,
      ANN_DEPTH,
      `the index returned ${rows.length} of ${ANN_DEPTH} candidates. pgvector stops early ` +
        'when ef_search is below the LIMIT and does NOT error — RRF would silently fuse ' +
        'half a candidate list. Raise HNSW_EF_SEARCH to at least the annDepth in retrieve.ts.',
    );
  });
});
