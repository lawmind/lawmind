/**
 * Every fixture is verbatim from the BPRD BSA↔IEA table. The two that matter
 * most are `New` (no counterpart — mapping it would be a fabrication) and
 * `, para N` (a paragraph, not a whole section).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCorrespondence } from './statute-correspondence.ts';

const REAL = [
  '        1           1  Short title, application and commencement.',
  '2(1)(a) 3, para 1 "Court".',
  '2(1) (c) 3, para 8 "disproved".',
  '62 65A  Special provisions as to evidence',
  '170 New Repeal and savings.',
].join('\n');

describe('BPRD correspondence table', () => {
  const { rows } = parseCorrespondence(REAL);

  it('reads a plain section-to-section row', () => {
    const r = rows.find((x) => x.newSection === '1');
    assert.equal(r?.oldSection, '1');
    assert.equal(r?.newlyAdded, false);
  });

  it('keeps the PARAGRAPH, because the new Act split the old section', () => {
    const r = rows.find((x) => x.newSection === '2(1)(a)');
    assert.equal(r?.oldSection, '3');
    assert.equal(r?.oldParagraph, 1, 'IEA "3, para 1" is not IEA 3');
  });

  it('survives the internal space the PDF layout leaks into a clause', () => {
    // Printed as "2(1) (c)" — the space is layout, not meaning.
    assert.ok(rows.some((x) => x.newSection === '2(1)(c)' && x.oldParagraph === 8));
  });

  it('keeps a letter-suffixed old section', () => {
    assert.equal(rows.find((x) => x.newSection === '62')?.oldSection, '65A');
  });

  it('NEVER invents a counterpart for a newly added provision', () => {
    const r = rows.find((x) => x.newSection === '170');
    assert.equal(r?.newlyAdded, true);
    assert.equal(r?.oldSection, null, '"New" means no counterpart — mapping it is fabrication');
    assert.equal(r?.oldParagraph, null);
  });
});

describe('refusals', () => {
  it('does not read wrapped summary prose as a mapping row', () => {
    // These follow a real row and begin with a digit or a lowercase connective.
    const { rows } = parseCorrespondence(
      '3 4 Facts in issue.\nthe word "man" is replaced by "person" in illustrations\nNo change.',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.newSection, '3');
  });

  it('reports an unrecognised row rather than dropping it', () => {
    const { rows, unparsed } = parseCorrespondence('99ZZ ~~~ garbled');
    assert.equal(rows.length, 0);
    assert.equal(unparsed.length, 1, 'a gap must be checkable, not invisible');
  });

  it('ignores header and copyright furniture', () => {
    const { rows, unparsed } = parseCorrespondence(
      'CORRESPONDENCE TABLE and COMPARISON SUMMARY OF THE\n© Anil Kishore Yadav, IPS, Director, CAPT Bhopal',
    );
    assert.equal(rows.length, 0);
    assert.equal(unparsed.length, 0);
  });
});
