/**
 * The assertion the whole hard-negative set exists for, run against the real
 * corpus of 38,341 judgments.
 *
 * > **A citation one digit different must never resolve to the judgment it was
 * > derived from.**
 *
 * This guards the exact-citation fast path added on 9 Aug 2026
 * (`services/api/src/search/retrieve.ts`), which pins a resolved citation at
 * rank 1. Pinning is the strongest claim the retrieval pipeline can make — it
 * says *this is the answer*, not *this is relevant* — so the cost of pinning
 * the wrong judgment is correspondingly high: an advocate who typed a citation
 * one digit off gets handed a different case, silently, as an exact match.
 *
 * **Note what is NOT asserted.** A near miss may legitimately resolve to some
 * OTHER judgment — `(2019) 4 SCC 212` is a real citation of a real case. That
 * is correct behaviour, not a failure, and a test demanding "resolves to
 * nothing" would be wrong about the domain.
 *
 * Skipped without `DATABASE_URL`, visibly, rather than passing quietly.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { citationLookupKey } from '@lawmind/api/search/query-shape';
import postgres from 'postgres';

import { nearMissesFor } from './hard-negatives.ts';

const DATABASE_URL = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
const sql = postgres(DATABASE_URL ?? '', { max: 2, onnotice: () => {} });

/** How many real citations to derive negatives from. Each yields two. */
const SAMPLE = 150;

/**
 * The same lookup `exactCitation` performs, expressed once here so the test
 * exercises the real rule rather than a paraphrase of it. If these ever
 * diverge, the fast path is not what this test thinks it is.
 */
async function resolveExact(citation: string): Promise<string[]> {
  const key = citationLookupKey(citation);
  const rows = await sql<{ id: string }[]>`
    SELECT j.id
    FROM judgments j
    WHERE (
      upper(regexp_replace(coalesce(j.neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')) = ${key}
      OR EXISTS (
        SELECT 1 FROM unnest(j.reporter_citations) AS rc
        WHERE upper(regexp_replace(rc, '[^A-Za-z0-9]', '', 'g')) = ${key}
      )
    )
    LIMIT 5
  `;
  return rows.map((r) => r.id);
}

describe('hard negatives against the real corpus', { skip: !DATABASE_URL }, () => {
  before(async () => {
    await sql`SELECT 1`;
  });
  after(async () => {
    await sql.end();
  });

  it('a near-miss citation NEVER resolves to the judgment it came from', async (t) => {
    const rows = await sql<{ id: string; neutral_citation: string }[]>`
      SELECT id, neutral_citation
      FROM judgments
      WHERE neutral_citation IS NOT NULL
      ORDER BY id
      LIMIT ${SAMPLE}
    `;
    /**
     * "The test proves nothing" was right, and it was the wrong verdict. On an
     * EMPTY database it proves nothing because there is nothing; on a populated
     * one, zero rows with a neutral citation would be a real finding. Those are
     * different facts and a hard assertion made them the same one, which is what
     * took `pnpm ci:local` and the CI test step red — this file is named `.live`
     * and CI builds a fresh database.
     *
     * So: skip when there is no law at all, and keep the assertion for the case
     * it was written for — a corpus that holds judgments but none with a neutral
     * citation.
     */
    if (rows.length === 0) {
      const [any] = await sql<{ n: boolean }[]>`SELECT EXISTS (SELECT 1 FROM judgments) AS n`;
      if (!any?.n) {
        return t.skip(
          'needs a populated corpus. CI and `pnpm ci:local` build an EMPTY database; this file ' +
            'is a LIVE test and grades real citations. Run it with DATABASE_URL pointed at a corpus.',
        );
      }
    }
    assert.ok(rows.length > 0, 'no judgments with a neutral citation — the test proves nothing');

    const negatives = rows.flatMap((r) => nearMissesFor(r.neutral_citation, r.id));
    assert.ok(negatives.length >= rows.length, 'the generator produced too few negatives');

    const failures: string[] = [];
    for (const n of negatives) {
      const resolved = await resolveExact(n.nearMiss);
      if (resolved.includes(n.originalJudgmentId)) {
        failures.push(
          `${n.original} → ${n.nearMiss} (${n.method}) resolved back to its own judgment`,
        );
      }
    }
    assert.deepEqual(failures, [], failures.join('\n'));
    console.log(
      `      checked ${negatives.length} near-miss citations from ${rows.length} judgments`,
    );
  });

  it('the REAL citation does resolve — otherwise the test above is vacuous', async () => {
    /**
     * The guard on the guard. If exact lookup resolved nothing at all, the
     * assertion above would pass for the worst possible reason, and the fast
     * path would be silently dead — which is exactly the defect found and fixed
     * in `citationLookupKey` on 9 Aug 2026.
     */
    const rows = await sql<{ id: string; neutral_citation: string }[]>`
      SELECT id, neutral_citation
      FROM judgments
      WHERE neutral_citation IS NOT NULL
      ORDER BY id
      LIMIT 25
    `;
    let resolvedToSelf = 0;
    for (const r of rows) {
      const ids = await resolveExact(r.neutral_citation);
      if (ids.includes(r.id)) resolvedToSelf += 1;
    }
    assert.ok(
      resolvedToSelf >= Math.floor(rows.length * 0.9),
      `exact lookup resolved only ${resolvedToSelf}/${rows.length} real citations to themselves — ` +
        'the fast path is not working, and the near-miss test above proves nothing',
    );
    console.log(`      ${resolvedToSelf}/${rows.length} real citations resolved to themselves`);
  });

  it('reporter citations resolve too, brackets and full stops and all', async () => {
    // `[1950] 1 S.C.R. 536` is the format actually stored. If the lookup key
    // only handled parenthesised forms, half the corpus would be unreachable.
    const rows = await sql<{ id: string; rc: string[] }[]>`
      SELECT id, reporter_citations AS rc
      FROM judgments
      WHERE array_length(reporter_citations, 1) > 0
      ORDER BY id
      LIMIT 20
    `;
    let hit = 0;
    for (const r of rows) {
      const ids = await resolveExact(r.rc[0]!);
      if (ids.includes(r.id)) hit += 1;
    }
    assert.ok(
      hit >= Math.floor(rows.length * 0.9),
      `only ${hit}/${rows.length} reporter citations resolved`,
    );
    console.log(`      ${hit}/${rows.length} reporter citations resolved to themselves`);
  });
});
