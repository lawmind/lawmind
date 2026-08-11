/**
 * `upsertJudgments` against real Postgres, rolled back — never committed.
 *
 * `docs/ai/tasks/003-corpus-inventory.md`: `content_hash`, `text_quality` and
 * `source_document_type` (migration `0031`) are computed inside this shared
 * write path so every loader gets them without having to compute them itself.
 * The transaction pattern follows `services/harness/src/overruled-checks.ts`
 * — a sentinel thrown after the observation forces the rollback, so there is
 * no code path that could leave a synthetic row in the real corpus.
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import postgres, { type Sql } from 'postgres';

import { contentHash, upsertJudgments } from './load.ts';
import type { JudgmentRecord } from './sci.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

after(async () => {
  await sql.end();
});

/** Thrown to roll the probe back. Never escapes the test. */
class Rollback extends Error {
  constructor(readonly observed: unknown) {
    super('load.test.ts rollback');
  }
}

test('contentHash is a stable sha256 of the exact text — a known vector, not just "changes when input changes"', () => {
  // Verified against node:crypto directly, not hand-computed:
  //   node -e "console.log(require('crypto').createHash('sha256').update('hello lawmind','utf8').digest('hex'))"
  assert.equal(
    contentHash('hello lawmind'),
    '959197f4fcf6aeaf3a971d4930018ec1887417170dea17c47baa231fbfe685fc',
  );
});

test('two different texts never collide on the fixture inputs used elsewhere in this suite', () => {
  assert.notEqual(contentHash('a'), contentHash('b'));
});

test('upsertJudgments writes content_hash, text_quality and source_document_type — rolled back', async (t) => {
  if (!process.env['DATABASE_URL']) return t.skip('DATABASE_URL not set');

  const fakeUrl = `https://example.invalid/load-test-002-provenance-${Date.now()}.pdf`;
  const record: JudgmentRecord = {
    caseTitle: 'TEST versus PROVENANCE (never a real party)',
    neutralCitation: null,
    reporterCitations: [],
    court: 'Test Fixture Court',
    bench: null,
    judgmentDate: '2024-01-01',
    fullText: 'clean readable text with no OCR damage at all',
    language: 'en',
    sourceUrl: fakeUrl,
    caseNumber: null,
    caseType: null,
    sourceDocumentType: 'View Judgement/Order',
    cnr: 'TESTCNR0000012024',
    nativeText: true,
  };

  try {
    await sql.begin(async (tx) => {
      const result = await upsertJudgments(tx as unknown as Sql, [record]);
      assert.equal(result.inserted, 1);

      const [row] = await tx<
        {
          content_hash: string | null;
          text_quality: string | null;
          source_document_type: string | null;
          cnr: string | null;
          native_text: boolean | null;
        }[]
      >`SELECT content_hash, text_quality, source_document_type, cnr, native_text FROM judgments WHERE source_url = ${fakeUrl}`;

      assert.equal(row?.content_hash, contentHash(record.fullText));
      // numeric(4,3) comes back as a string from postgres.js; clean text scores 1.000.
      assert.equal(row?.text_quality, '1.000');
      assert.equal(row?.source_document_type, 'View Judgement/Order');
      // Found dropped entirely until migration 0034 — present on both source
      // metadata schemas, read by neither mapper, for the whole corpus.
      assert.equal(row?.cnr, 'TESTCNR0000012024');
      // Migration 0035 — the classifier already existed, only newly wired.
      assert.equal(row?.native_text, true);

      throw new Rollback({ ok: true });
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }

  // Prove the rollback actually happened — the fixture must not be findable.
  const [after1] = await sql<{ id: string }[]>`SELECT id FROM judgments WHERE source_url = ${fakeUrl}`;
  assert.equal(after1, undefined, 'the rolled-back fixture must not persist');
});

test('a null sourceDocumentType writes a database NULL, never the string "null"', async (t) => {
  if (!process.env['DATABASE_URL']) return t.skip('DATABASE_URL not set');

  const fakeUrl = `https://example.invalid/load-test-002-null-doctype-${Date.now()}.pdf`;
  const record: JudgmentRecord = {
    caseTitle: 'TEST versus NULL DOCTYPE (never a real party)',
    neutralCitation: null,
    reporterCitations: [],
    court: 'Test Fixture Court',
    bench: null,
    judgmentDate: '2024-01-01',
    fullText: 'plain variant text — no order_type column at all',
    language: 'en',
    sourceUrl: fakeUrl,
    caseNumber: null,
    caseType: null,
    // sourceDocumentType omitted — the plain-variant case.
  };

  try {
    await sql.begin(async (tx) => {
      await upsertJudgments(tx as unknown as Sql, [record]);
      const [row] = await tx<{ source_document_type: string | null }[]>`
        SELECT source_document_type FROM judgments WHERE source_url = ${fakeUrl}`;
      assert.equal(row?.source_document_type, null);
      throw new Rollback(null);
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
});
