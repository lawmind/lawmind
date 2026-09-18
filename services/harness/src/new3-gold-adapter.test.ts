import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadNew3Gold } from './new3-gold-adapter.ts';
import { assertFeatureAllowed, LeakageError } from './gold-contract.ts';

const prov = (over: Record<string, unknown> = {}) => ({
  method: 'citation-edge-verified',
  citingJudgmentId: 'citing-1',
  citingCase: 'A Vs B',
  citingCourt: 'High Court of Punjab and Haryana',
  citingDate: '2025-12-22',
  citedCase: 'C Vs D',
  citedCourt: 'High Court of Punjab and Haryana',
  citedDate: '2025-01-02',
  inboundCitations: 83,
  tag: 'PRIMARY',
  ...over,
});

function fixture(rows: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'new1-gold-'));
  const path = join(dir, 'gold.json');
  writeFileSync(path, JSON.stringify({ rows }));
  return path;
}

test('the three query types map to three different provenances', () => {
  const path = fixture([
    {
      id: 'p1',
      queryType: 'proposition',
      query: 'a passage about bail',
      goldJudgmentId: 'g1',
      relationship: 'cites',
      provenance: prov({ redacted: ['citation_text:X'] }),
    },
    {
      id: 'c1',
      queryType: 'exact_citation',
      query: '2025:PHHC:089161',
      goldJudgmentId: 'g1',
      relationship: 'cites',
      provenance: prov(),
    },
    {
      id: 't1',
      queryType: 'case_title',
      query: 'C Vs D',
      goldJudgmentId: 'g1',
      relationship: 'cites',
      provenance: prov(),
    },
  ]);
  const { rows, dropped } = loadNew3Gold(path);
  assert.equal(dropped.length, 0);
  assert.deepEqual(
    rows.map((r) => r.goldProvenanceType),
    ['citation_edge', 'own_citation_string', 'own_case_title'],
  );
  // All three are one authority and therefore one family.
  assert.deepEqual([...new Set(rows.map((r) => r.caseFamily))], ['g1']);
});

test('the loaded rows refuse the feature that built them', () => {
  const path = fixture([
    {
      id: 'p1',
      queryType: 'proposition',
      query: 'a passage',
      goldJudgmentId: 'g1',
      relationship: 'cites',
      provenance: prov(),
    },
  ]);
  const { rows } = loadNew3Gold(path);
  assert.throws(() => assertFeatureAllowed(rows[0]!, 'inbound_citation_graph'), LeakageError);
  assert.doesNotThrow(() => assertFeatureAllowed(rows[0]!, 'dense_similarity'));
});

test('an edge whose cited judgment postdates the citing one is dropped, with the dates', () => {
  const path = fixture([
    {
      id: 'p1',
      queryType: 'proposition',
      query: 'a passage',
      goldJudgmentId: 'g1',
      relationship: 'cites',
      provenance: prov({ citingDate: '2025-12-22', citedDate: '2026-01-12' }),
    },
  ]);
  const { rows, dropped } = loadNew3Gold(path);
  assert.equal(rows.length, 0);
  assert.equal(dropped[0]?.reason, 'cited_after_citing');
  assert.match(dropped[0]!.detail, /2026-01-12/);
});

test('the chronology drop can be turned off, because the fault may be the DATE not the edge', () => {
  const path = fixture([
    {
      id: 'p1',
      queryType: 'proposition',
      query: 'a passage',
      goldJudgmentId: 'g1',
      relationship: 'cites',
      provenance: prov({ citedDate: '2026-01-12' }),
    },
  ]);
  const { rows, dropped } = loadNew3Gold(path, { dropChronologyDefects: false });
  assert.equal(rows.length, 1);
  assert.equal(dropped.length, 0);
});

test('mojibake is dropped at five control characters, and four is not mojibake', () => {
  const ctl = (n: number) => 'text '.repeat(20) + String.fromCharCode(1).repeat(n);
  const path = fixture([
    {
      id: 'bad',
      queryType: 'proposition',
      query: ctl(151),
      goldJudgmentId: 'g1',
      relationship: 'cites',
      provenance: prov(),
    },
    {
      id: 'ok',
      queryType: 'proposition',
      query: ctl(4),
      goldJudgmentId: 'g2',
      relationship: 'cites',
      provenance: prov(),
    },
  ]);
  const { rows, dropped } = loadNew3Gold(path);
  assert.deepEqual(
    rows.map((r) => r.queryId),
    ['ok'],
  );
  assert.equal(dropped[0]?.reason, 'control_characters');
  assert.match(dropped[0]!.detail, /151/);
});

test('totals count the file as it was, so a shrinking gold set is visible', () => {
  const path = fixture([
    {
      id: 'p1',
      queryType: 'proposition',
      query: 'a',
      goldJudgmentId: 'g1',
      relationship: 'cites',
      provenance: prov({ citedDate: '2026-01-12' }),
    },
    {
      id: 'p2',
      queryType: 'proposition',
      query: 'b',
      goldJudgmentId: 'g2',
      relationship: 'cites',
      provenance: prov(),
    },
  ]);
  const { rows, totals } = loadNew3Gold(path);
  assert.equal(totals.rowsInFile, 2);
  assert.equal(totals.distinctAuthorities, 2);
  assert.equal(totals.distinctEdges, 2);
  assert.equal(rows.length, 1);
});
