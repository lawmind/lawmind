/**
 * The startup gate itself — REB §1. Table/column/index absence and JS/SQL
 * citation-key drift must each be caught, and a healthy schema must produce
 * zero failures so a normal boot is never blocked.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Sql } from 'postgres';

import { citationLookupKey } from './search/query-shape.ts';
import { runPreflight } from './preflight.ts';

type FakeConfig = {
  tables?: readonly string[];
  columns?: readonly string[];
  indexCount?: number;
  sqlKey?: string;
};

const ALL_TABLES = ['judgments', 'citation_checks'];
const ALL_COLUMNS = [
  'id',
  'case_title',
  'full_text',
  'neutral_citation',
  'reporter_citations',
  'overruled_status',
];
const PROBE = '(2019) 4 S.C.C. 221';

function fakeSql(config: FakeConfig = {}): Sql {
  const tables = config.tables ?? ALL_TABLES;
  const columns = config.columns ?? ALL_COLUMNS;
  const indexCount = config.indexCount ?? 1;
  const sqlKey = config.sqlKey ?? citationLookupKey(PROBE);

  const sql = ((strings: TemplateStringsArray) => {
    const text = strings.join(' ');
    if (text.includes('information_schema.tables')) {
      return Promise.resolve(tables.map((table_name) => ({ table_name })));
    }
    if (text.includes('information_schema.columns')) {
      return Promise.resolve(columns.map((column_name) => ({ column_name })));
    }
    if (text.includes('pg_indexes')) {
      return Promise.resolve([{ n: indexCount }]);
    }
    if (text.includes('regexp_replace')) {
      return Promise.resolve([{ key: sqlKey }]);
    }
    throw new Error(`fakeSql: unrecognised query — ${text}`);
  }) as unknown as Sql;
  return sql;
}

test('a healthy schema produces zero failures', async () => {
  const failures = await runPreflight(fakeSql());
  assert.deepEqual(failures, []);
});

test('a missing required table is caught by name', async () => {
  const failures = await runPreflight(fakeSql({ tables: ['judgments'] }));
  assert.ok(failures.some((f) => f.check === 'table:citation_checks'));
});

test('a missing judgments column is caught by name', async () => {
  const failures = await runPreflight(
    fakeSql({ columns: ALL_COLUMNS.filter((c) => c !== 'overruled_status') }),
  );
  assert.ok(failures.some((f) => f.check === 'column:judgments.overruled_status'));
});

test('column and index checks are skipped, not cascaded, when judgments itself is missing', async () => {
  const failures = await runPreflight(fakeSql({ tables: ['citation_checks'] }));
  assert.deepEqual(
    failures.map((f) => f.check),
    ['table:judgments'],
  );
});

test('a missing citation-lookup index is caught', async () => {
  const failures = await runPreflight(fakeSql({ indexCount: 0 }));
  assert.ok(failures.some((f) => f.check === 'index:judgments_neutral_citation_key'));
});

test('JS and SQL citation-key normalisation drifting from each other is caught', async () => {
  // The one check that a present table, present columns and a present index
  // would all pass right through — the actual load-bearing assertion.
  const failures = await runPreflight(fakeSql({ sqlKey: 'WRONGKEY' }));
  const parity = failures.find((f) => f.check === 'citation-key-parity');
  assert.ok(parity, 'expected a citation-key-parity failure');
  assert.ok(parity.detail.includes('WRONGKEY'));
  assert.ok(parity.detail.includes(citationLookupKey(PROBE)));
});
