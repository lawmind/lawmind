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
     * ─────────────────────────────────────────────────────────────────────────
     * THE HANDSHAKE BUS 1546 PREDICTED, COMPLETED 30 AUGUST 2026
     * ─────────────────────────────────────────────────────────────────────────
     *
     * This assertion used to read `identity_from_column_default`, and LCC told
     * NEW1 on the bus that *"when you land the writer change and drop the
     * default, that assertion will go red — that is the handshake, not a break.
     * Flip it then."*
     *
     * `packages/db/factory/0001_vector_snapshot_identity.sql` dropped the
     * default, `doc-vector-embed.mjs` now supplies the identity explicitly, and
     * a trigger refuses any write that cannot name a registered ACTIVE
     * generation. So the table is no longer refused for the reason that would
     * have mislabelled a FUTURE snapshot.
     *
     * It is STILL REFUSED, and that is correct rather than a leftover: 486,955
     * rows written before identity binding existed carry SQL NULL. They were
     * deliberately not rewritten — a mass UPDATE of half a million rows under a
     * live GPU writer buys neatness and costs bloat — and they are named
     * `UNIDENTIFIED_LEGACY_V1` in `embedding_snapshot` rather than left as a
     * silent residual class.
     *
     * So the reason moved from "the schema is supplying identity" to "some rows
     * have none", which is the honest remaining fact. A promotion of this table
     * must still decide what to do about those rows; it can no longer be
     * ambushed by the next generation wearing this one's label.
     */
    assert.equal(refusal.reason, 'null_snapshot_identity');
    assert.ok(
      'nullRows' in refusal && refusal.nullRows > 0,
      'the refusal must name how many rows carry no identity, not merely that some do',
    );

    // And the defect that USED to be reported is gone from the live schema.
    const [column] = await sql<{ column_default: string | null }[]>`
      SELECT column_default FROM information_schema.columns
       WHERE table_name = 'new1_doc_vector_stage'
         AND column_name = ${VECTOR_SNAPSHOT_IDENTITY_COLUMN}`;
    assert.equal(
      column?.column_default ?? null,
      null,
      'a constant column DEFAULT is not an identity — REPRO_DEBT_1 removed it',
    );
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
