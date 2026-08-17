/**
 * The two exact-lookup hot paths must PARSE. That is the whole test, and it
 * exists because a parse error on this path is invisible everywhere else.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A TEST AND NOT A CODE REVIEW NOTE
 * ---------------------------------------------------------------------------
 *
 * `exactCitation` was rewritten from an `OR` into a `UNION` of two separately
 * indexable branches (migration `0052`). The rewrite shipped as:
 *
 *     SELECT … LIMIT 2  UNION  SELECT … LIMIT 2
 *
 * which PostgreSQL rejects at PARSE time — `42601`, `syntax error at or near
 * "UNION"`. A `LIMIT` binds to the whole set operation, so a branch carrying one
 * has to be parenthesised. NEW1 found it (bus 0638) by accident, while running
 * something else, and isolated it in four cases: the error fires even in a
 * statement that never mentions `lawmind_citation_keys`, which is what proves it
 * is the query SHAPE and not the missing migration.
 *
 * Nothing in this repository would have caught it. The query is only assembled
 * at runtime against a live connection, so `tsc` sees a template literal and
 * every unit test that stubs the database sees nothing at all. The failure mode
 * is a hard `500` on `/search` for every `cite:"…"` query — not a slow query, not
 * a degraded result, a total outage of the product's first feature — and the
 * first person to find out would have been an advocate.
 *
 * The same defect was sitting in a SECOND copy, `scripts/migration/
 * hotpath-measure.mjs`, where it would have turned the migration's own
 * before/after measurement into an error rather than a number.
 *
 * ---------------------------------------------------------------------------
 * IT CALLS THE REAL FUNCTION, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 *
 * NEW1's own suggestion came with the reason not to take the easy version:
 * *"a harness test that silently starts passing when the API changes shape is
 * worse than none."* A test holding its own copy of the SQL passes forever while
 * `retrieve.ts` drifts away from it.
 *
 * So this drives `hybridSearch` — the real exported entry point — with queries
 * shaped to reach each lookup. `classifyQuery` decides which one fires, so the
 * probes are chosen to satisfy `warrantsExactLookup` and the `case_name` branch
 * respectively. If either query stops being reachable, these assertions become
 * vacuous rather than wrong, which is why each one asserts the pin was ATTEMPTED
 * by checking the classifier first.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES NOT ASSERT
 * ---------------------------------------------------------------------------
 *
 * Nothing about results, ranking or latency. It runs against whatever database
 * `DATABASE_URL` names — in CI that is a freshly migrated, EMPTY scratch
 * database, so every arm legitimately returns zero rows. Emptiness is the
 * feature: parse and plan both happen on an empty table, in milliseconds, with
 * no corpus required. A timing or result assertion here would be a flaky test
 * pretending to be a safety net.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { classifyQuery, warrantsExactLookup } from './query-shape.ts';
import { hybridSearch } from './retrieve.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

const NO_FILTERS = {} as Parameters<typeof hybridSearch>[3];

after(async () => {
  await sql.end();
});

describe('exact-lookup hot paths parse', () => {
  it('exactCitation: a cite-shaped query reaches the UNION and PostgreSQL accepts it', async () => {
    const query = 'cite:"(1994) 3 SCC 1"';

    // If the classifier stops routing this to the citation pin, the assertion
    // below still passes while testing nothing. Fail loudly instead.
    const shape = classifyQuery(query);
    assert.ok(
      warrantsExactLookup(shape) && shape.citation !== null,
      'probe no longer reaches exactCitation — update the probe, do not delete the test',
    );

    // The assertion IS "does not throw". `42601` is a parse error, so it fires
    // before a row is read: an empty database proves it exactly as well as a
    // populated one, and in milliseconds rather than the 14m39s a real scan of
    // 7.3M rows costs.
    await assert.doesNotReject(
      () => hybridSearch(sql, query, null, NO_FILTERS, 10, 'sparse'),
      /syntax error|42601/,
    );
  });

  it('exactCaseTitle: a case-name query reaches the normalised-title lookup', async () => {
    const query = 'Kesavananda Bharati v. State of Kerala';

    const shape = classifyQuery(query);
    assert.equal(
      shape.shape,
      'case_name',
      'probe no longer reaches exactCaseTitle — update the probe, do not delete the test',
    );

    await assert.doesNotReject(
      () => hybridSearch(sql, query, null, NO_FILTERS, 10, 'sparse'),
      /syntax error|42601/,
    );
  });

  /**
   * `lawmind_citation_keys` is the one object `exactCitation` needs that the
   * query cannot conjure. Asserted separately from the parse checks above
   * because the two failures are genuinely different and only one is fixable by
   * deploying: `42601` is a permanent parse error that no migration clears,
   * `42883` is "the migration has not run yet". Confusing them cost a
   * measurement cycle already.
   */
  it('migration 0052 is applied: lawmind_citation_keys exists, IMMUTABLE and PARALLEL SAFE', async () => {
    const [fn] = await sql<{ provolatile: string; proparallel: string }[]>`
      SELECT provolatile, proparallel FROM pg_proc WHERE proname = 'lawmind_citation_keys'
    `;
    assert.ok(fn, 'lawmind_citation_keys is missing — migration 0052 has not been applied');
    // IMMUTABLE is not decoration: an index over a function call requires it, so
    // a future edit that weakens it to STABLE silently makes the GIN index
    // impossible to build rather than merely slower.
    assert.equal(fn.provolatile, 'i', 'lawmind_citation_keys must be IMMUTABLE to be indexable');
    assert.equal(fn.proparallel, 's', 'lawmind_citation_keys must be PARALLEL SAFE');
  });

  /**
   * The normalisation rule exists in THREE places — this function, the
   * expression in `judgments_neutral_citation_key`, and `citationLookupKey()` in
   * `@lawmind/ingest/citations`. `0052`'s own comment says a divergence shows up
   * as a citation that silently stops resolving, which is the failure mode this
   * product cannot have. One concrete pair, pinned.
   */
  it('lawmind_citation_keys normalises the way the neutral-citation index does', async () => {
    const [row] = await sql<{ keys: string[]; neutral: string }[]>`
      SELECT lawmind_citation_keys(ARRAY['(1994) 3 SCC 1', 'AIR 1973 SC 1461']) AS keys,
             upper(regexp_replace(coalesce('(1994) 3 SCC 1', ''), '[^A-Za-z0-9]', '', 'g')) AS neutral
    `;
    assert.deepEqual(row!.keys, ['19943SCC1', 'AIR1973SC1461']);
    // The array form and the scalar form of the same rule must agree, because
    // the two branches of the UNION rely on exactly that.
    assert.equal(row!.keys[0], row!.neutral);
  });
});
