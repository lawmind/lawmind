import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import postgres, { type Sql } from 'postgres';

import { judgmentInsertRow, upsertJudgments } from './load.ts';
import type { JudgmentRecord } from './sci.ts';

const record: JudgmentRecord = {
  caseTitle: 'A v. B',
  neutralCitation: null,
  reporterCitations: [],
  court: 'Example Court',
  bench: null,
  judgmentDate: '2026-08-29',
  fullText: 'reasoned judgment text',
  language: 'en',
  sourceUrl: 'https://example.invalid/judgment.pdf',
  sourceId: 'aws_hc',
  sourceEdition: 'court_raw',
  authorizationBasis: 'aws_open_data',
  caseNumber: null,
  caseType: null,
};

describe('judgment row provenance writer', () => {
  it('writes all known 0092 fields together with a recorded-at timestamp', () => {
    const row = judgmentInsertRow(record);
    assert.equal(row.source_id, 'aws_hc');
    assert.equal(row.source_edition, 'court_raw');
    assert.equal(row.authorization_basis, 'aws_open_data');
    assert.ok(row.provenance_recorded_at instanceof Date);
  });

  it('leaves unknown future-source provenance unrecorded rather than inferring from the URL', () => {
    const {
      sourceId: _sourceId,
      sourceEdition: _sourceEdition,
      authorizationBasis: _authorizationBasis,
      ...withoutProvenance
    } = record;
    const row = judgmentInsertRow({
      ...withoutProvenance,
    });
    assert.equal(row.source_id, null);
    assert.equal(row.source_edition, null);
    assert.equal(row.authorization_basis, null);
    assert.equal(row.provenance_recorded_at, null);
  });

  it('does not write a partial provenance tuple', () => {
    const row = judgmentInsertRow({ ...record, authorizationBasis: null });
    assert.equal(row.source_id, null);
    assert.equal(row.source_edition, null);
    assert.equal(row.authorization_basis, null);
    assert.equal(row.provenance_recorded_at, null);
  });

  it('persists known 0092 provenance together on the live write path and rolls the canary back', async (t) => {
    const url = process.env.DATABASE_URL;
    if (!url)
      return t.skip('DATABASE_URL is required for the transaction-rolled-back writer canary');
    const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
    const marker = new Error('ROLLBACK_PROVENANCE_CANARY');
    const sourceUrl = `https://example.invalid/lawmind-provenance-canary/${randomUUID()}.pdf`;
    try {
      await assert.rejects(
        sql.begin(async (tx) => {
          await upsertJudgments(tx as unknown as Sql, [{ ...record, sourceUrl }]);
          const [stored] = await tx<
            {
              source_id: string | null;
              source_edition: string | null;
              authorization_basis: string | null;
              provenance_recorded_at: Date | null;
            }[]
          >`
            SELECT source_id, source_edition, authorization_basis, provenance_recorded_at
              FROM judgments WHERE source_url = ${sourceUrl}`;
          assert.equal(stored?.source_id, 'aws_hc');
          assert.equal(stored?.source_edition, 'court_raw');
          assert.equal(stored?.authorization_basis, 'aws_open_data');
          assert.ok(stored?.provenance_recorded_at instanceof Date);
          throw marker;
        }),
        marker,
      );
      const [after] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM judgments WHERE source_url = ${sourceUrl}`;
      assert.equal(after?.n, 0, 'the canary must leave no corpus row behind');
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
