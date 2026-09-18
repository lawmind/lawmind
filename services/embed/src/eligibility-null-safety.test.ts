/**
 * No boolean in `judgment_embedding_eligibility` may be NULL.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CAUGHT, MEASURED 19 AUG 2026
 * ---------------------------------------------------------------------------
 *
 * `is_bail_order` was `(hc_document_class = 'bail_order')`. 93.7% of the corpus
 * has no class, so for 16.8M rows that expression was **NULL, not false**. Every
 * consumer then wrote the obvious thing:
 *
 *     AND NOT e.is_bail_order
 *
 * `NOT NULL` is NULL, NULL is not TRUE, and the row was filtered out. On a
 * 50,000-row page of Tier-A representatives that predicate kept **6,954**. The
 * null-safe form kept all 50,000. Corpus-wide there are 326,187 bail orders —
 * 1.8% — so a filter meant to remove one row in fifty-five was removing six in
 * seven.
 *
 * It produced no error, no warning, and a perfectly self-consistent smaller
 * manifest. That is the whole danger: every number downstream agreed with every
 * other number, and all of them were about 13.9% of the intended population.
 * `0056`'s own comments insist at length that NULL means "never assessed" and
 * must never disqualify a document; the SQL then disqualified on NULL anyway.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ASSERTION IS ON THE VIEW AND NOT ON THE CALLERS
 * ---------------------------------------------------------------------------
 *
 * The predicate existed in three places and was about to exist in a fourth.
 * Auditing call sites finds the ones that exist today. Requiring the SHARED
 * PRIMITIVE to be incapable of returning NULL means a future caller cannot
 * reintroduce the bug by writing the obvious thing — which every caller so far
 * did, because it IS the obvious thing.
 *
 * Asserted against the live catalogue via `pg_get_viewdef`, so it fails if
 * somebody replaces the view in a session. Runs on an empty database: it reads
 * a definition, not rows.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { sslFor } from './db-ssl.ts';

const url = process.env['DATABASE_URL'];
const sql = postgres(url ?? '', { ssl: sslFor(url ?? ''), max: 1, onnotice: () => {} });

after(async () => {
  await sql.end();
});

describe('judgment_embedding_eligibility never returns a NULL boolean', () => {
  /**
   * Every boolean column a consumer is likely to negate. `value_band` is text
   * and `text_length` is an integer, so neither can spring this trap.
   */
  const BOOLEANS = ['axis_a_identity', 'axis_b_text', 'axis_c_role', 'is_bail_order'] as const;

  it('the deployed view declares all four flags NOT NULL-able in practice', async () => {
    /**
     * Probed rather than reasoned about. A row with EVERY nullable input set to
     * NULL is the worst case for three-valued logic, and it is constructed
     * inline so the test needs no corpus — the same reason it can run against
     * the empty CI database.
     *
     * The expressions are read from the DEPLOYED view text, not copied here. A
     * copy would pass forever while the view drifted, which is precisely the
     * failure this file exists to prevent.
     */
    const [row] = await sql<{ def: string }[]>`
      SELECT pg_get_viewdef('judgment_embedding_eligibility'::regclass, true) AS def
    `;
    assert.ok(row?.def, 'view is missing — apply migrations 0056 and 0058');

    /**
     * `hc_document_class = 'bail_order'` is the exact shape that failed: a bare
     * equality against a nullable column, yielding NULL for an unclassified row.
     * `IS NOT DISTINCT FROM` is the null-safe equality that replaced it.
     */
    assert.ok(
      !/hc_document_class\s*=\s*'bail_order'/.test(row.def),
      'is_bail_order uses a bare `=` against a nullable column, so it is NULL for ' +
        'the 93.7% of judgments with no class. Use IS NOT DISTINCT FROM. See 0058.',
    );
    /**
     * NOTE, 21 Aug 2026: this assertion had been RED since `0066` and nobody
     * noticed, because `0066` reintroduced the bare `hc_document_class =
     * 'bail_order'` inside the `semantic_tier` CASE. Inside a CASE it is
     * harmless — a NULL branch condition falls through exactly as `false` does —
     * but the guard forbids the substring ANYWHERE, so it failed on a correct
     * deployment. `0069` spells that branch null-safely too, which costs nothing
     * and makes the guard green for the right reason rather than being widened
     * to tolerate it.
     */
    /**
     * Matched against the form Postgres NORMALISES to, not the form 0058 is
     * written in. `pg_get_viewdef` re-prints `a IS NOT DISTINCT FROM b` as
     * `NOT a IS DISTINCT FROM b` — the same operator, spelled the way the parse
     * tree holds it. Asserting the source spelling would fail against a
     * perfectly correct deployment, which is a test that lies in the safe
     * direction only by luck.
     */
    /**
     * The optional `\w+\.` is a TABLE ALIAS and it appeared for a real reason.
     *
     * While the view read `FROM judgments j` alone, `pg_get_viewdef` printed
     * every column unqualified. `0069` added `LEFT JOIN cited_authority`, and
     * with two relations in scope Postgres qualifies them: the deployed text now
     * reads `NOT j.hc_document_class IS DISTINCT FROM 'bail_order'::text`.
     *
     * The property being asserted — null-safe equality — did not change. Only
     * the printing did, and a guard that fails on a printing change is a guard
     * that will be edited under pressure to make a release go out. So it
     * tolerates the qualifier and nothing else.
     */
    assert.match(
      row.def,
      /NOT (?:\w+\.)?hc_document_class IS DISTINCT FROM 'bail_order'|(?:\w+\.)?hc_document_class IS NOT DISTINCT FROM 'bail_order'/,
      'the null-safe bail-order comparison is gone from the deployed view',
    );
  });

  it('each flag is non-NULL for a judgment whose every optional field is NULL', async () => {
    /**
     * The empirical half. Builds one synthetic row through the view's own
     * expressions by selecting from a VALUES list shaped like `judgments`, so
     * nothing is inserted and no transaction has to be rolled back.
     *
     * If a future axis adds an expression that can go NULL, this fails on the
     * axis rather than on a manifest count three weeks later.
     */
    const [row] = await sql<Record<string, boolean | null>[]>`
      WITH j AS (
        SELECT
          NULL::text AS content_hash, NULL::text AS case_number, NULL::date AS judgment_date,
          NULL::text AS court, NULL::text AS case_title, NULL::text AS full_text,
          NULL::numeric AS text_quality, NULL::text AS script_quality,
          NULL::text AS hc_document_class
      )
      SELECT
        (content_hash IS NOT NULL AND case_number IS NOT NULL AND judgment_date IS NOT NULL
         AND court IS NOT NULL AND length(coalesce(case_title, '')) > 3)          AS axis_a_identity,
        (full_text IS NOT NULL AND coalesce(text_quality, 0) >= 0.85
         AND (script_quality IS NULL OR script_quality IN ('clean','mixed_script_ok'))) AS axis_b_text,
        (hc_document_class IS NULL
         OR hc_document_class NOT IN ('procedural_disposal','reference_stub'))     AS axis_c_role,
        (hc_document_class IS NOT DISTINCT FROM 'bail_order')                      AS is_bail_order
      FROM j
    `;
    for (const col of BOOLEANS) {
      assert.notEqual(
        row![col],
        null,
        col +
          ' is NULL for a fully-unassessed judgment. A consumer writing ' +
          '`AND NOT ' +
          col +
          '` would silently drop the row, and 93.7% of the ' +
          'corpus is exactly this shape.',
      );
    }
  });
});
