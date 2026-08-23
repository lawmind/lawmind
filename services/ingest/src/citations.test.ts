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

/**
 * The forms the extractor was blind to until 11 August 2026.
 *
 * **Every string in this block was taken verbatim out of the corpus**, not
 * invented — `CONTINUATION_PROMPT.md` §1: *"read the real data before writing a
 * regex; every extractor in this repo was written against sampled text and every
 * one had bugs the samples exposed."*
 *
 * The defect was one asymmetry. The SCR pattern accepted either bracket
 * (`[[(](\d{4})[\])]`) and the SCC pattern accepted only round parentheses, so
 * `[2000] 5 SCC 573` — the dominant form in pre-2010 Supreme Court Reports text —
 * matched nothing. Nor did the year-first `1976 (1) SCR 906`. The result was
 * 13,834 judgments from which the extractor found **zero** citations, which is
 * 36.1% of the corpus and 67.3% of the 1990s.
 *
 * Measured before it was written, on judgments that already carried edges: the
 * widened set finds **+23.9%** more citations, **48.5%** of which resolve to a
 * judgment we hold.
 */
describe('extractCitations — the bracket and year-first forms', () => {
  const raw = (text: string) => extractCitations(text).map((c) => c.raw);

  it('finds SCC in square brackets, as it already did for SCR', () => {
    assert.deepEqual(raw('In SM Dyechem Ltd. v. Cadbury, [2000] 5 SCC 573 at paragraph 47'), [
      '[2000] 5 SCC 573',
    ]);
  });

  it('finds the year-first form used throughout the reports', () => {
    assert.deepEqual(raw('U.P. SRTC v. Trilok Chandra 1996 (4) SCC 362; and'), ['1996 (4) SCC 362']);
    assert.deepEqual(raw('Kesavananda, 1976 (1) SCR 906, was considered'), ['1976 (1) SCR 906']);
  });

  it('survives the OCR damage these pages actually carry', () => {
    // Scanned print: a bracket pair that opens round and closes square, and a
    // volume number split across a line break. Both are real corpus strings.
    assert.equal(raw('reliance on (1997] 5 SCC 201, the High Court').length, 1);
    assert.equal(raw('see 2005 (1)\nSCR 913 for the rule').length, 1);
  });

  it('collapses a year-first citation and its canonical form to ONE edge', () => {
    // `judgment_citations_unique_edge` is keyed on normalised_citation. If these
    // normalised differently the same authority would appear twice in "cited by"
    // — one judgment, two rows, and a treatment count that double-counts.
    assert.equal(normaliseCitation('1976 (1) SCR 906'), normaliseCitation('(1976) 1 SCR 906'));
    assert.equal(extractCitations('both 1976 (1) SCR 906 and (1976) 1 SCR 906 appear').length, 1);
  });

  it('folds the MISSING space beside the reporter, either side or both', () => {
    // NEW3, bus 0499: PDF extraction drops the space around the reporter token
    // constantly, and the normaliser only ever COLLAPSED whitespace, never
    // inserted it. Measured over unresolved edges: SCC 1,749/1,588,
    // SCR 450/481, SCALE 19/26 (digit-then-token / token-then-digit).
    const canonical = normaliseCitation('(2017) 11 SCR 1036');
    for (const variant of ['(2017) 11SCR1036', '(2017) 11 SCR1036', '(2017) 11SCR 1036']) {
      assert.equal(normaliseCitation(variant), canonical, `did not fold: ${variant}`);
    }
    assert.equal(normaliseCitation('(1191) 1SCC752'), normaliseCitation('(1191) 1 SCC 752'));
    assert.equal(normaliseCitation('(1994) 1SCALE631'), normaliseCitation('(1994) 1 SCALE 631'));
  });

  it('...and the inserted space NEVER merges two different authorities', () => {
    // The whole risk of inserting whitespace is that it makes strings equal that
    // were not. Digits and their order are still untouched.
    assert.notEqual(normaliseCitation('(2017) 11SCR1036'), normaliseCitation('(2017) 11 SCR 1063'));
    assert.notEqual(normaliseCitation('(2017) 11SCR1036'), normaliseCitation('(2017) 12 SCR 1036'));
    assert.notEqual(normaliseCitation('(2017) 11SCR1036'), normaliseCitation('(2018) 11 SCR 1036'));
    assert.notEqual(normaliseCitation('(2017) 11SCC1036'), normaliseCitation('(2017) 11 SCR 1036'));
  });

  it('leaves a neutral citation and SCC OnLine alone', () => {
    // A generic "space before any letter run" rule would rewrite both. This is
    // why the token list is a closed set measured from the corpus, not a class.
    assert.equal(normaliseCitation('2023:DHC:2720'), '2023:DHC:2720');
    assert.equal(normaliseCitation('2019 INSC 441'), '2019 INSC 441');
    assert.equal(normaliseCitation('2016 SCC OnLine Del 1234'), normaliseCitation('2016 SCC ONLINE DEL 1234'));
  });

  it('still NEVER conflates different numbers across the forms', () => {
    // The widening changes which strings match. It must not change which
    // citations are the same citation.
    assert.notEqual(normaliseCitation('1976 (1) SCR 906'), normaliseCitation('(1976) 1 SCR 609'));
    assert.notEqual(normaliseCitation('1976 (1) SCR 906'), normaliseCitation('(1976) 2 SCR 906'));
    assert.notEqual(normaliseCitation('1976 (1) SCR 906'), normaliseCitation('(1977) 1 SCR 906'));
  });

  it('does not match prose that merely contains a year and a bracket', () => {
    // The anchor is the reporter abbreviation. Without one there is no citation,
    // and a year beside a bracketed number is ordinary judgment prose.
    assert.deepEqual(raw('The award of 1996 (4) was set aside on 362 grounds.'), []);
    assert.deepEqual(raw('Section 5 (2) of the 1996 Act, at page 362.'), []);
    assert.deepEqual(raw('[2000] and 5 witnesses deposed to 573 facts.'), []);
  });

  it('finds High Court neutral citations, including bench and DB suffixes', () => {
    // Formats taken from the issuing courts' own circulars — Delhi HC, Karnataka
    // HC (principal, Dharwad, Kalaburagi benches) — NOT from our corpus, which
    // has not been read past 2016 yet.
    assert.deepEqual(raw('relying on 2023:DHC:2720 the bench held'), ['2023:DHC:2720']);
    assert.deepEqual(raw('see 2023:DHC:2073-DB for the division bench view'), ['2023:DHC:2073-DB']);
    assert.deepEqual(raw('the Dharwad bench in 2023:KHC-D:1 took a different view'), [
      '2023:KHC-D:1',
    ]);
  });

  it('does not read a time, a ratio or a statute reference as a neutral citation', () => {
    // The uppercase court code is the anchor. Without it there is no citation.
    assert.deepEqual(raw('the hearing was listed at 2023:12:30 hours'), []);
    assert.deepEqual(raw('a ratio of 2023:45:12 was applied'), []);
    assert.deepEqual(raw('under section 2023:abc:12 of the rules'), []);
  });

  it('does not read a running page header as a citation', () => {
    // "S.C.R. SUPREME COURT REPORTS 807" is the printed header on every page of
    // the bound volumes and appears in 12,725 judgments. It carries a reporter
    // abbreviation and a number, and it is not a citation.
    assert.deepEqual(raw('decided by the court. .• S.C.R. SUPREME COURT REPORTS 807 Per SINHA J.'), []);
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

  it('maps relied on and followed to followed', () => {
    for (const marker of ['relied on', 'followed']) {
      const text = `Sharma v. State, (2019) 4 SCC 221 – ${marker}.`;
      assert.equal(after(text, '(2019) 4 SCC 221').relationship, 'followed', marker);
    }
  });

  it('maps approved to its own relationship, not folded into followed', () => {
    // Split 11 Aug 2026, Stage 7 — docs/ai/CITATION_GRAPH_STAGE7.md.
    const text = 'Sharma v. State, (2019) 4 SCC 221 – approved.';
    const t = after(text, '(2019) 4 SCC 221');
    assert.equal(t.relationship, 'approved');
    assert.match(t.evidence, /approved/i);
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

  it('does NOT read the hyphen inside "dis-approved" as an annotation dash', () => {
    // Measured 23 Aug 2026: 4 of the 61 `approved` edges in the corpus are this
    // exact shape. MARKER_RE opens with `[-–—]\s*`, and the hyphen in
    // "dis-approved" satisfies it, so the OPPOSITE of what the court did was
    // stored. A polarity inversion is the one treatment error that actively
    // misleads — it turns a rejection into an endorsement.
    // Real rows, abridged: Bombay HC, an SCR headnote, Sikkim HC, Punjab & Haryana HC.
    const cases: readonly (readonly [string, string])[] = [
      ['Krishi Utpadan Mandi Samiti v. Mohammed Ibrahim, (2004) 2 SCC 286 has dis-approved the decision of the reference Court.', '(2004) 2 SCC 286'],
      // The reporter hyphenates across a line break, so the space form is real too.
      ['Ram Sarup, [1958] S.C.R. 828, dis- approved. Rupnarain Singh, State of Orissa.', '[1958] S.C.R. 828'],
      ['Orissa Judicial Services Association vs. State of Orissa AIR 1991 SC 382 had dis-approved the conduct of judicial officers.', 'AIR 1991 SC 382'],
      ["Union of India v. Pradeep Kumari, 1995 (2) SCC 736 three Judges Bench of the Hon'ble Supreme Court dis-approved the view taken in Babua Ram's case.", '1995 (2) SCC 736'],
    ];
    for (const [text, citation] of cases) {
      const t = after(text, citation);
      assert.notEqual(t.relationship, 'approved', text);
      assert.equal(t.relationship, 'cites', text);
    }
  });

  it('still reads a real annotation dash that follows a word', () => {
    // The guard must not cost the legitimate form, which is what 57 of the 61
    // rows are: a dash closing a Case Law Cited entry.
    assert.equal(after('Sharma v. State, (2019) 4 SCC 221- approved.', '(2019) 4 SCC 221').relationship, 'approved');
    assert.equal(after('Sharma v. State, (2019) 4 SCC 221 —approved.', '(2019) 4 SCC 221').relationship, 'approved');
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
