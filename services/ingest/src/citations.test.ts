import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { citationKeys, detectTreatment, extractCitations, normaliseCitation } from './citations.ts';

describe('normaliseCitation', () => {
  it('treats the same citation typeset differently as equal', () => {
    const forms = ['(2019) 4 SCC 221', '(2019) 4 S.C.C. 221', '(2019)4 SCC  221'];
    const [first, ...rest] = forms.map(normaliseCitation);
    for (const other of rest) assert.equal(other, first);
  });

  it('normalises square brackets to round', () => {
    assert.equal(normaliseCitation('[1950] SCR 869'), normaliseCitation('(1950) SCR 869'));
  });

  it('NEVER conflates different numbers', () => {
    // The whole point. 221 and 212 are different cases and must never collapse.
    assert.notEqual(normaliseCitation('(2019) 4 SCC 221'), normaliseCitation('(2019) 4 SCC 212'));
    assert.notEqual(normaliseCitation('(2019) 4 SCC 221'), normaliseCitation('(2019) 5 SCC 221'));
    assert.notEqual(normaliseCitation('(2019) 4 SCC 221'), normaliseCitation('(2018) 4 SCC 221'));
  });
});

describe('extractCitations', () => {
  it('finds a neutral Supreme Court citation', () => {
    const found = extractCitations('As held in 2024 INSC 123, the position is settled.');
    assert.equal(found.length, 1);
    assert.equal(found[0]?.raw, '2024 INSC 123');
  });

  it('finds SCC, AIR, SCR and SCALE forms', () => {
    const text = `
      See (2019) 4 SCC 221 and AIR 1973 SC 1461.
      Also (1950) SCR 869 and (2019) 5 SCALE 123.
    `;
    const norms = extractCitations(text).map((c) => c.normalised);
    assert.ok(norms.some((n) => n.includes('SCC')));
    assert.ok(norms.some((n) => n.includes('AIR')));
    assert.ok(norms.some((n) => n.includes('SCR')));
    assert.ok(norms.some((n) => n.includes('SCALE')));
  });

  it('de-duplicates a citation repeated through a judgment', () => {
    const text = '(2019) 4 SCC 221 ... later again (2019) 4 SCC 221 ... and (2019) 4 S.C.C. 221';
    assert.equal(extractCitations(text).length, 1);
  });

  it('records the offset of first appearance so a row points back at its span', () => {
    const text = 'Preamble text. Then (2019) 4 SCC 221 appears here.';
    const [c] = extractCitations(text);
    assert.ok(c);
    assert.equal(text.slice(c.offset, c.offset + c.raw.length), c.raw);
  });

  it('does not match ordinary prose', () => {
    // No reporter abbreviation, so nothing here is a citation.
    const text = 'The appeal was filed in 2019 and 4 witnesses deposed on 221 occasions.';
    assert.equal(extractCitations(text).length, 0);
  });

  it('survives a judgment with no citations at all', () => {
    assert.deepEqual(extractCitations('A short order dismissing the appeal.'), []);
  });

  it('keeps a stable cursor across repeated calls', () => {
    // Module-level /g regexes share lastIndex; without a reset the second call
    // silently finds nothing. This asserts the reset.
    const text = 'See (2019) 4 SCC 221 for the rule.';
    assert.equal(extractCitations(text).length, 1);
    assert.equal(extractCitations(text).length, 1);
  });
});

describe('detectTreatment', () => {
  /** Markers trail their citation, so measure from the END of the citation. */
  const after = (text: string, citation: string) =>
    detectTreatment(text, text.indexOf(citation) + citation.length);

  it("reads the court's own overruled marker and records it", () => {
    const text = 'Sharma v. State, (2019) 4 SCC 221 – overruled.';
    const t = after(text, '(2019) 4 SCC 221');
    assert.equal(t.relationship, 'overruled');
    assert.match(t.evidence, /overruled/i);
  });

  it('maps relied on, approved and followed to followed', () => {
    for (const marker of ['relied on', 'approved', 'followed']) {
      const text = `Sharma v. State, (2019) 4 SCC 221 – ${marker}.`;
      assert.equal(after(text, '(2019) 4 SCC 221').relationship, 'followed', marker);
    }
  });

  it('maps distinguished and dissented from', () => {
    assert.equal(
      after('Sharma v. State, (2019) 4 SCC 221 – distinguished.', '(2019) 4 SCC 221').relationship,
      'distinguished',
    );
    assert.equal(
      after('Sharma v. State, (2019) 4 SCC 221 – dissented from.', '(2019) 4 SCC 221').relationship,
      'doubted',
    );
  });

  it('treats "referred to" as a mention, not a treatment', () => {
    // The most common marker in the corpus by a wide margin. A case being
    // mentioned is not a case being treated.
    const t = after('Sharma v. State, (2019) 4 SCC 221 – referred to.', '(2019) 4 SCC 221');
    assert.equal(t.relationship, 'cites');
    assert.equal(t.evidence, '');
  });

  it('carries the marker across parallel citations of the same case', () => {
    const text = 'Sharma v. State, 2019 INSC 45 : [2019] 3 SCR 12 : (2019) 4 SCC 221 – overruled.';
    assert.equal(after(text, '2019 INSC 45').relationship, 'overruled');
  });

  it('does NOT take a marker belonging to a later entry in the list', () => {
    // The marker after "Verma" describes Verma, not Sharma. A case name between
    // the two is the boundary.
    const text = 'Sharma v. State, (2019) 4 SCC 221. Verma v. State, (2020) 2 SCC 10 – overruled.';
    assert.equal(after(text, '(2019) 4 SCC 221').relationship, 'cites');
  });

  it('does NOT read "the impugned order is set aside" as overruling the citation', () => {
    // The defect this rewrite exists to fix. Scanning for "set aside" near a
    // citation put a fabricated overruling on N.P. Ponnuswami (1952), whose own
    // passage marked it "referred to". "Set aside" almost always describes the
    // order under appeal, not the authority cited beside it.
    const text =
      'The impugned order is hereby set aside. Case Law Cited: ' +
      'Ponnuswami v. Returning Officer, 1952 INSC 2 : (1952) 1 SCC 9 – referred to.';
    assert.equal(after(text, '(1952) 1 SCC 9').relationship, 'cites');
  });

  it('returns cites with NO evidence when there is no annotation at all', () => {
    const text = 'Reference was made to (2019) 4 SCC 221 during arguments by counsel.';
    const t = after(text, '(2019) 4 SCC 221');
    assert.equal(t.relationship, 'cites');
    assert.equal(t.evidence, '');
  });

  it('ignores a marker beyond the window', () => {
    const text = `Sharma v. State, (2019) 4 SCC 221${' filler'.repeat(60)} – overruled.`;
    assert.equal(after(text, '(2019) 4 SCC 221').relationship, 'cites');
  });
});

describe('citationKeys', () => {
  it('indexes a judgment under every form it can be cited by', () => {
    const keys = citationKeys({
      neutralCitation: '2019 INSC 45',
      reporterCitations: ['(2019) 4 SCC 221', 'AIR 2019 SC 1234'],
    });
    assert.equal(keys.length, 3);
    assert.ok(keys.includes(normaliseCitation('(2019) 4 SCC 221')));
  });

  it('handles a judgment with no neutral citation', () => {
    const keys = citationKeys({ neutralCitation: null, reporterCitations: ['(1950) SCR 869'] });
    assert.equal(keys.length, 1);
  });

  it('drops blank reporter entries rather than indexing an empty key', () => {
    const keys = citationKeys({ neutralCitation: null, reporterCitations: ['', '  '] });
    assert.deepEqual(keys, []);
  });
});
