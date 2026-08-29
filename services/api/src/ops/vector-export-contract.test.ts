/**
 * The vector export contract, asserted against the REAL factory table.
 *
 * `new1_doc_vector_stage` is factory scratch and is deliberately not in
 * `SERVING_TABLES`. That is exactly why this test exists: the guard has to be
 * proved on the day it does nothing, because the day it matters is the day
 * somebody promotes the table, and a guard first exercised then is a guard first
 * exercised after the bad export.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import {
  SERVING_TABLES,
  VECTOR_SNAPSHOT_IDENTITY_COLUMN,
  vectorExportRefusal,
} from './release-export-cli.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

describe('vector export contract', () => {
  after(async () => {
    await sql.end();
  });

  it('refuses the factory stage table as it stands today', async (t) => {
    const [exists] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'new1_doc_vector_stage'
        AND column_name = ${VECTOR_SNAPSHOT_IDENTITY_COLUMN}`;
    if (!exists?.n) return t.skip('new1_doc_vector_stage is not on this database');

    const refusal = await vectorExportRefusal(sql, 'new1_doc_vector_stage');
    assert.ok(refusal, 'the stage table must not be exportable in its current shape');
    /**
     * Measured 30 August 2026: the column is nullable with a constant DEFAULT of
     * `'5b5d02384b46c96c'` applied by no migration, and `doc-vector-embed.mjs`
     * mentions the column zero times. Both failures are real; the default is
     * reported first because it is the one that will mislabel a FUTURE snapshot
     * rather than merely leaving an old one blank.
     */
    assert.equal(refusal.reason, 'identity_from_column_default');
  });

  it('says nothing about a table that carries no snapshot identity column', async () => {
    // The guard runs over every serving table. A non-vector table must pass
    // silently rather than be refused for lacking a column it should not have.
    const refusal = await vectorExportRefusal(sql, 'statutes');
    assert.equal(refusal, null);
  });

  it('the approved serving set still contains no vector table', async () => {
    /**
     * NEW1 owns the promotion decision and the master plan forbids promoting the
     * staged vectors. If this ever goes red the export set changed, and the
     * change must arrive WITH an explicit snapshot identity on the rows — which
     * the guard above will then be enforcing rather than merely describing.
     */
    for (const { table } of SERVING_TABLES) {
      const refusal = await vectorExportRefusal(sql, table);
      assert.equal(
        refusal,
        null,
        `${table} is in SERVING_TABLES and would be refused: ${JSON.stringify(refusal)}`,
      );
    }
  });
});
