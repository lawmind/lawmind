/**
 * The P0 guarantee, tested three ways, because it can break in three ways.
 *
 *   1. the predicate itself is wrong           → unit tests
 *   2. a body-text path forgets to apply it    → a structural test over SITES
 *   3. the contract view moves underneath it   → a drift test against the
 *                                                DEPLOYED `pg_get_viewdef`
 *
 * (2) is the one that has actually happened in this repository, twice, to a
 * different predicate — `citation-predicate-parity.test.ts` records both — and
 * it is the failure a purely behavioural test cannot see: a new evidence path
 * added next month is green on every existing assertion while serving glyph
 * dumps.
 *
 * (3) matters because the refusal is only as good as its agreement with
 * `judgment_quality_contract`. If NEW2 widens or narrows `body_text_safe` and
 * this file does not move with it, retrieval silently applies last week's
 * definition of damage.
 *
 * The database halves SKIP, loudly, when `DATABASE_URL` is absent or the corpus
 * is empty — CI runs against a freshly migrated scratch database where every
 * such assertion would pass vacuously.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { BODY_TEXT_UNCONVICTED, isBodyTextSafe } from './body-text-safety.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('isBodyTextSafe', () => {
  it('treats an absent verdict as safe — nothing has convicted this document', () => {
    assert.equal(isBodyTextSafe(null), true);
    assert.equal(isBodyTextSafe(undefined), true);
  });

  it('treats both unconvicted values as safe', () => {
    for (const v of BODY_TEXT_UNCONVICTED) assert.equal(isBodyTextSafe(v), true);
  });

  it('refuses every convicted value, including ones added later', () => {
    // Not an allow-list of known damage: ANY value that is not one of the two
    // unconvicted ones refuses. A new damage class NEW2 invents tomorrow is
    // refused the day it is written, with no change here.
    for (const v of ['damaged_other', 'legacy_font_ascii', 'something_new_2027']) {
      assert.equal(isBodyTextSafe(v), false, `${v} must not be treated as safe`);
    }
  });
});

/**
 * Every query in the API that reads a judgment's BODY as evidence.
 *
 * A site belongs here when its output is a passage, a chunk, a paragraph, a
 * span, or a match computed from `full_text`. A site does NOT belong here when
 * it reads identity fields — `neutral_citation`, `case_title`, `case_number` —
 * because those are the metadata route that must keep working on a damaged
 * document. That distinction is the whole of P0 and it is why this list is
 * hand-maintained rather than a grep for the word "judgments".
 */
const SITES: { file: string; fn: string; why: string; delegatesTo?: string }[] = [
  {
    file: 'search/retrieve.ts',
    fn: 'sparse',
    why: 'lexical match over full_text_tsv',
    // Since NEW1 bus 1025 this is a one-line delegator: there is a single sparse
    // pass and `sparseAny` is it. Recorded as a DELEGATION rather than removed
    // from the list, so the day somebody gives `sparse` a query of its own again
    // it has to satisfy the predicate rule itself.
    delegatesTo: 'sparseAny',
  },
  { file: 'search/retrieve.ts', fn: 'sparseAny', why: 'lexical match over full_text_tsv' },
  { file: 'search/retrieve.ts', fn: 'dense', why: 'vectors built from body text' },
  { file: 'search/retrieve.ts', fn: 'passagesForRerank', why: 'body text handed to a reranker' },
  {
    file: 'search/retrieve.ts',
    fn: 'fillParagraphFallback',
    why: 'paragraph evidence and exactSpan',
  },
];

describe('every body-text path applies the predicate', () => {
  for (const site of SITES) {
    it(`${site.file} :: ${site.fn} — ${site.why}`, () => {
      const source = readFileSync(join(here, '..', site.file), 'utf8');
      const start = source.indexOf(`function ${site.fn}(`);
      assert.notEqual(start, -1, `${site.fn} not found in ${site.file} — rename? update SITES`);
      // To the start of the next top-level declaration, which is enough of the
      // body to contain its queries without needing a parser.
      const rest = source.slice(start + 1);
      const nextDecl = rest.search(/\n(?:export )?(?:async )?function |\nconst [A-Za-z]+ = /);
      const body = nextDecl === -1 ? rest : rest.slice(0, nextDecl);
      const applies = /andBodyTextSafe\(/.test(body);
      if (site.delegatesTo) {
        // Either it applies the predicate itself, or it does nothing but hand
        // the work to a site that does. Anything else — a delegator that has
        // grown its own query — fails.
        // `includes`, not a RegExp: the function name is followed by a literal
        // `(`, which is a group opener in a pattern and needs escaping that a
        // template literal quietly eats.
        const delegates = body.includes(`return ${site.delegatesTo}(`);
        assert.ok(
          applies || delegates,
          `${site.fn} neither applies andBodyTextSafe nor delegates to ${site.delegatesTo}`,
        );
        if (delegates && !applies) {
          assert.ok(
            !/sql</.test(body),
            `${site.fn} delegates to ${site.delegatesTo} but ALSO runs a query of its own — that query is unguarded`,
          );
        }
        return;
      }
      assert.ok(
        applies,
        `${site.fn} reads body text (${site.why}) but does not apply andBodyTextSafe`,
      );
    });
  }
});

/**
 * The drift guard. Reads the view as the SERVER has it, not as the migration
 * file says it should be — a migration that was never applied, or was applied
 * and then superseded by hand, is exactly the case where the file and the
 * database disagree and only the database matters.
 */
describe('agreement with the deployed quality contract', () => {
  const url = process.env['DATABASE_URL'];

  it('the predicate matches judgment_quality_contract.body_text_safe, row for row', async (t) => {
    if (!url) return t.skip('DATABASE_URL not set — skipped, not passed');
    const sql = postgres(url, { max: 1, connection: { statement_timeout: 60_000 } });
    try {
      const [count] = await sql<{ n: string }[]>`SELECT count(*)::text AS n FROM judgments`;
      if (Number(count?.n ?? 0) === 0) return t.skip('empty corpus — skipped, not passed');

      // The view's own answer beside ours, on a sample that DELIBERATELY
      // over-weights the convicted population: a uniform sample of a corpus
      // that is 90.7% unconvicted would agree perfectly while getting every
      // damaged row wrong.
      const rows = await sql<{ script_quality: string | null; view_says: boolean }[]>`
        (SELECT j.script_quality, q.body_text_safe AS view_says
           FROM judgments j JOIN judgment_quality_contract q ON q.id = j.id
          WHERE j.script_quality IS NOT NULL LIMIT 500)
        UNION ALL
        (SELECT j.script_quality, q.body_text_safe AS view_says
           FROM judgments j JOIN judgment_quality_contract q ON q.id = j.id
          WHERE j.script_quality IS NULL LIMIT 500)`;

      assert.ok(rows.length > 0, 'sample came back empty');
      let convicted = 0;
      for (const r of rows) {
        if (r.view_says === false) convicted++;
        assert.equal(
          isBodyTextSafe(r.script_quality),
          r.view_says,
          `disagreed with the view on script_quality=${String(r.script_quality)}`,
        );
      }
      // A sample containing no convicted rows proves nothing about the half
      // that matters, so say so rather than pass.
      assert.ok(convicted > 0, 'sample contained no convicted rows — assertion was vacuous');
    } finally {
      await sql.end();
    }
  });

  it('the view still defines body_text_safe the way this module assumes', async (t) => {
    if (!url) return t.skip('DATABASE_URL not set — skipped, not passed');
    const sql = postgres(url, { max: 1, connection: { statement_timeout: 30_000 } });
    try {
      const [row] = await sql<{ def: string }[]>`
        SELECT pg_get_viewdef('judgment_quality_contract'::regclass, true) AS def`;
      const def = row?.def ?? '';
      if (def === '') return t.skip('view not present — skipped, not passed');
      assert.match(
        def,
        /script_quality IS NULL OR \(?j?\.?script_quality = ANY \(ARRAY\['clean'::text, 'mixed_script_ok'::text\]\)\)? AS body_text_safe/,
        'judgment_quality_contract.body_text_safe has changed shape — update body-text-safety.ts WITH it',
      );
    } finally {
      await sql.end();
    }
  });
});
