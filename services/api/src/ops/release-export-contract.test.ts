/**
 * The release export contract for `judgment_paragraphs`, which the export
 * omitted until LCC R32B.
 *
 * The omission had two halves and both are pinned here. The table was absent
 * from `SERVING_TABLES`, so a release restored to a box whose Reader and
 * paragraph fallback have nothing to read. And it was absent from the bounding
 * rule, so the moment it was added a `--judgment-limit 500` rehearsal would
 * have walked the whole paragraph table. The second half is asserted against
 * the database's own foreign keys, because a hand-kept list of
 * "judgment-owned tables" is exactly the list that forgot this one.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { canonicalRowExpression, releaseChecksum } from './release-checksum.ts';
import { SERVING_TABLES, boundedWhere } from './release-export-cli.ts';

const IDS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
] as const;

/** The contract, as a function, so the test can prove it rejects a broken list. */
function paragraphContractViolations(
  tables: readonly { table: string; orderBy: string }[],
): string[] {
  const out: string[] = [];
  const entry = tables.find((t) => t.table === 'judgment_paragraphs');
  if (!entry) out.push('judgment_paragraphs is not in SERVING_TABLES');
  else if (entry.orderBy.replace(/\s+/g, ' ').trim() !== 'judgment_id, paragraph_index')
    out.push(`judgment_paragraphs is ordered by "${entry.orderBy}", not document order`);
  const j = tables.findIndex((t) => t.table === 'judgments');
  const p = tables.findIndex((t) => t.table === 'judgment_paragraphs');
  if (j === -1) out.push('judgments is not in SERVING_TABLES');
  else if (p !== -1 && p !== j + 1) out.push('judgment_paragraphs is not adjacent to judgments');
  return out;
}

describe('release export contract: judgment_paragraphs', () => {
  it('is in the serving set, in canonical document order, beside judgments', () => {
    assert.deepEqual(paragraphContractViolations(SERVING_TABLES), []);
  });

  it('the contract check fails when the table is removed or mis-ordered', () => {
    const removed = SERVING_TABLES.filter((t) => t.table !== 'judgment_paragraphs');
    assert.ok(paragraphContractViolations(removed).length > 0, 'removal must be caught');
    const byId = SERVING_TABLES.map((t) =>
      t.table === 'judgment_paragraphs' ? { ...t, orderBy: 'id' } : t,
    );
    assert.ok(paragraphContractViolations(byId).length > 0, 'random-uuid order must be caught');
  });

  it('a bounded release confines paragraphs to the bound judgments', () => {
    const where = boundedWhere('judgment_paragraphs', IDS);
    assert.match(where, /^WHERE judgment_id = ANY\('\{[^}]+\}'::uuid\[\]\)$/);
    for (const id of IDS) assert.ok(where.includes(id), `${id} missing from ${where}`);
  });

  it('an unbounded release exports every table whole', () => {
    for (const { table } of SERVING_TABLES) assert.equal(boundedWhere(table, null), '');
  });
});

describe('release export contract: every judgment-owned serving table is bounded', () => {
  const url = process.env['DATABASE_URL'];
  const sql = url ? postgres(url, { max: 1, onnotice: () => {} }) : null;
  after(async () => {
    await sql?.end();
  });

  it('matches the target schema foreign keys', async (t) => {
    if (!sql) return t.skip('DATABASE_URL is not set');
    const serving = SERVING_TABLES.map((s) => s.table);
    const rows = await sql<{ child: string }[]>`
      SELECT DISTINCT src.relname::text AS child
        FROM pg_constraint fk
        JOIN pg_class src ON src.oid = fk.conrelid
        JOIN pg_class dst ON dst.oid = fk.confrelid
       WHERE fk.contype = 'f'
         AND dst.relname = 'judgments'
         AND src.relname::text = ANY(${serving})`;
    const children = rows.map((r) => r.child).sort();
    assert.ok(children.includes('judgment_paragraphs'), `FK children seen: ${children.join(', ')}`);
    for (const child of children) {
      assert.notEqual(
        boundedWhere(child, IDS),
        '',
        `${child} references judgments but a bounded release would export it whole`,
      );
    }
  });
});

describe('release checksum: streaming equals the SQL aggregate it replaced', () => {
  const url = process.env['DATABASE_URL'];
  const sql = url ? postgres(url, { max: 1, onnotice: () => {} }) : null;
  after(async () => {
    await sql?.end();
  });

  /**
   * `md5(string_agg(...))` cannot run past 1 GB of digests (34M rows, measured
   * R32B), so the checksum now streams. Every manifest already written holds
   * the OLD value, so the new one must be byte-identical wherever the old one
   * could run — asserted on a real serving table, not on a fixture.
   */
  it('on statutes, and on an empty slice', async (t) => {
    if (!sql) return t.skip('DATABASE_URL is not set');
    await sql.unsafe(`SET TimeZone = 'UTC'`);
    await sql.unsafe(`SET DateStyle = 'ISO, YMD'`);
    const columns = (
      await sql<{ c: string }[]>`
        SELECT column_name AS c FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'statutes' AND is_generated = 'NEVER'`
    ).map((r) => r.c);
    for (const where of ['', 'WHERE false']) {
      const oldRows: { n: string; ck: string }[] = await sql.unsafe(
        `SELECT count(*)::text AS n,
                md5(coalesce(string_agg(t.h, '' ORDER BY t.ord), '')) AS ck
           FROM (SELECT row_number() OVER (ORDER BY id) AS ord,
                        ${canonicalRowExpression(columns)} AS h
                   FROM statutes ${where}) t`,
      );
      const old = oldRows[0];
      const got = await releaseChecksum(sql, 'statutes', 'id', where, columns, 97);
      assert.equal(got.rows, Number(old?.n), `rows, where=${where}`);
      assert.equal(got.checksum, old?.ck, `checksum, where=${where}`);
    }
  });
});
