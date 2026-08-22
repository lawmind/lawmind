import assert from 'node:assert/strict';
import test from 'node:test';

import { digitTrust } from './ocr-digit-trust.ts';

/* The Karnataka defect, verbatim from the probe: a year rendered `2O17`. */
test('a year rendered with a letter O is SUSPECT, not CROSSCHECKED', () => {
  const v = digitTrust({
    text: 'IN THE HIGH COURT OF KARNATAKA DATED THIS THE 1ST DAY OF MARCH 2O17',
    caseNumber: null,
    judgmentDate: '2017-03-01',
  });
  assert.equal(v.trust, 'SUSPECT');
  assert.deepEqual(
    v.witnesses.map((w) => w.found),
    ['substituted'],
  );
  assert.ok(v.damagedNumbers.includes('2O17'));
});

test('a literal match on a witness that never came from the text is CROSSCHECKED', () => {
  const v = digitTrust({
    text: 'CRM-M-69613-2025 (O&M) order of the High Court dated 23.12.2025',
    caseNumber: 'CRM-M-69613-2025',
    judgmentDate: '2025-12-23',
  });
  assert.equal(v.trust, 'CROSSCHECKED');
  assert.equal(v.witnesses.find((w) => w.field === 'case_number')?.found, 'exact');
});

test('the defect outranks a witness that survived it', () => {
  /* Case number is exact AND the document renders another year as 2O19. The
   * defect is a property of the rendering, so the exact match does not clear
   * it — this is the assertion the whole module exists for. */
  const v = digitTrust({
    text: 'CRM-M-100-2025 following the judgment reported in 2O19 SCC 441',
    caseNumber: 'CRM-M-100-2025',
    judgmentDate: '2025-01-01',
  });
  assert.equal(v.trust, 'SUSPECT');
  assert.ok(v.damagedNumbers.includes('2O19'));
});

test('no witness present at all is UNVERIFIED, never CROSSCHECKED', () => {
  const v = digitTrust({
    text: 'The petition is allowed in terms of the above observations.',
    caseNumber: 'WP-4444-2019',
    judgmentDate: '2019-06-01',
  });
  assert.equal(v.trust, 'UNVERIFIED');
  assert.ok(v.witnesses.every((w) => w.found === 'absent'));
});

test('missing metadata is UNVERIFIED with no witnesses, not a crash', () => {
  const v = digitTrust({ text: 'anything at all', caseNumber: null, judgmentDate: null });
  assert.equal(v.trust, 'UNVERIFIED');
  assert.equal(v.witnesses.length, 0);
});

test('ordinary prose containing letters and numbers is not read as glyph damage', () => {
  /* `Section 302` and `2019` are clean. A false SUSPECT here would mark every
   * recovered document suspect and make the state useless. */
  const v = digitTrust({
    text: 'Under Section 302 IPC, as held in the 2019 decision, the appeal fails.',
    caseNumber: null,
    judgmentDate: '2019-01-01',
  });
  assert.deepEqual(v.damagedNumbers, []);
  assert.equal(v.trust, 'CROSSCHECKED');
});

test('a two-character witness is refused as a witness', () => {
  /* It would match by accident in any document long enough to be worth OCR. */
  const v = digitTrust({ text: '12 12 12 12', caseNumber: '12', judgmentDate: null });
  assert.equal(v.trust, 'UNVERIFIED');
  assert.equal(v.witnesses[0]?.found, 'absent');
});
