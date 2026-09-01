import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyCitationGraphOccurrence, extractCitations } from './citations.ts';

function disposition(text: string, token: string) {
  const citation = extractCitations(text).find((c) => c.raw === token);
  assert.ok(citation, `fixture must parse ${token}`);
  return classifyCitationGraphOccurrence(text, citation);
}

test('blocks the two reproduced Meghalaya common-order false pins', () => {
  assert.equal(
    disposition(
      '2025:MLHC:405-DB2025:MLHC:411-DB\nPage 2 of the connected-matter order',
      '2025:MLHC:405-DB',
    ),
    'COMMON_ORDER_PAGE_FURNITURE',
  );
  assert.equal(
    disposition(
      '2025:MLHC:384-DB2025:MLHC:390-DB\r\nPage 2 of the connected-matter order',
      '2025:MLHC:384-DB',
    ),
    'COMMON_ORDER_PAGE_FURNITURE',
  );
});

test('does not suppress true outgoing suffixed precedent references', () => {
  const fixtures = [
    'placed reliance upon M/s Bansal Casting, 2026:PHHC:027747-DB to submit that',
    'Division Bench judgment in Rakesh Das, Neutral Citation: 2024:PHHC:147654-DB.',
    'reported foreign authority 2023:DHC:8491-DB in ordinary prose',
    'short order: followed 2023:PHHC:081753-DB.',
    'multiple citations 2023:PHHC:081753-DB and 2024:PHHC:147654-DB',
    'full bench authority 2024:DHC:5183-FB was distinguished',
  ];
  for (const text of fixtures) {
    for (const citation of extractCitations(text)) {
      assert.equal(classifyCitationGraphOccurrence(text, citation), 'OUTGOING_CITATION_CANDIDATE');
    }
  }
});

test('keeps exact citation parsing semantics for page furniture', () => {
  const text = '2025:MLHC:405-DB2025:MLHC:411-DB\nPage 2';
  assert.equal(extractCitations(text)[0]?.raw, '2025:MLHC:405-DB');
});
