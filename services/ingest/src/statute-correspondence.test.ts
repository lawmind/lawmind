/**
 * Fixtures are verbatim from the BPRD tables, with the PDF's real column
 * geometry preserved — a fixture that "tidies" the spacing would test a
 * document we do not hold.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCorrespondence, parseOldSide } from './statute-correspondence.ts';

/** BNS layout: new | subject | old | summary. Note the multi-section row. */
const BNS = [
  'BNS        Subject                                 IPC      Summary of comparison',
  'Sections                                           Sections',
  "4           Punishments.                            53       ‘Community service' is added.",
  '5           Commutation of sentence.                54 & 55  given in BNS, but the explanation',
  '                                                    55A      23 of the BNSS defines it as',
  '8(6)        Imprisonment to terminate on            68 & 69  Heading is dropped as two sections',
  '1(2)        Commencement.                           New      By subsection 1(2) of the BNS,',
].join('\n');

/** BSA layout: new | old | subject | summary — a DIFFERENT column order. */
const BSA = [
  'BSA        IEA         Subject                       Summary of comparision',
  'Section    Section',
  '2(1)(a) 3, para 1 "Court".                           given individual alphabetical clauses.',
  '62 65A  Special provisions as to evidence            No change.',
  '170 New Repeal and savings.                          Newly added.',
].join('\n');

describe('multi-section mappings — never collapsed to a partial', () => {
  const { rows, pair } = parseCorrespondence(BNS);

  it('detects the BNS column order', () => {
    assert.equal(pair, 'BNS-IPC');
  });

  it('reads BNS 5 as IPC 54, 55 AND 55A — the continuation line included', () => {
    const r = rows.find((x) => x.newSection === '5');
    assert.deepEqual(
      r?.oldRefs.map((o) => o.section),
      ['54', '55', '55A'],
      'mapping BNS 5 to IPC 54 alone is fabrication by omission',
    );
  });

  it('reads an inline pair without a continuation', () => {
    const r = rows.find((x) => x.newSection === '8(6)');
    assert.deepEqual(
      r?.oldRefs.map((o) => o.section),
      ['68', '69'],
    );
  });

  it('does not leak a continuation into the wrong row', () => {
    // 55A belongs to 5, never to 4.
    assert.deepEqual(
      rows.find((x) => x.newSection === '4')?.oldRefs.map((o) => o.section),
      ['53'],
    );
  });

  it('keeps New as an explicit non-counterpart', () => {
    const r = rows.find((x) => x.newSection === '1(2)');
    assert.equal(r?.newlyAdded, true);
    assert.deepEqual(r?.oldRefs, []);
  });
});

describe('the other column order', () => {
  const { rows, pair } = parseCorrespondence(BSA);

  it('detects BSA', () => {
    assert.equal(pair, 'BSA-IEA');
  });

  it('preserves the paragraph qualifier exactly', () => {
    const r = rows.find((x) => x.newSection === '2(1)(a)');
    assert.deepEqual(r?.oldRefs, [{ section: '3', paragraph: 1 }], 'IEA "3, para 1" is not IEA 3');
  });

  it('keeps a letter-suffixed section', () => {
    assert.deepEqual(
      rows.find((x) => x.newSection === '62')?.oldRefs.map((o) => o.section),
      ['65A'],
    );
  });

  it('marks 170 as newly added', () => {
    assert.equal(rows.find((x) => x.newSection === '170')?.newlyAdded, true);
  });
});

describe('parseOldSide', () => {
  it('splits every separator the source uses', () => {
    for (const s of ['54 & 55', '54 and 55', '54, 55']) {
      assert.deepEqual(
        (parseOldSide(s) as { section: string }[]).map((o) => o.section),
        ['54', '55'],
        s,
      );
    }
  });

  it('attaches a paragraph to the section it follows, not to all of them', () => {
    const r = parseOldSide('3, para 1') as { section: string; paragraph: number | null }[];
    assert.deepEqual(r, [{ section: '3', paragraph: 1 }]);
  });

  it('returns null for text it cannot read, so the caller can record ambiguity', () => {
    assert.equal(parseOldSide('see the note below'), null);
  });

  it('recognises New rather than treating it as a section', () => {
    assert.equal(parseOldSide('New'), 'new');
  });
});
