/**
 * Every fixture is a real production row, read 11 Aug 2026.
 *
 * `harvest/hc-load.test.ts` asserted `r.bench === 'patnahcucisdb94'` and passed
 * for exactly as long as that bug lived, because it was written from the same
 * assumption as the code. A classifier tested on invented documents tests the
 * author's idea of a High Court order.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BRIEF_MAX_CHARS, classifyHcDocument, STUB_MAX_CHARS } from './hc-classify.ts';

const doc = (over: Partial<Parameters<typeof classifyHcDocument>[0]> = {}) => ({
  disposalNature: 'ALLOWED',
  caseNumber: 'CR. MISC./1383/2026',
  fullText: 'x'.repeat(4000),
  ...over,
});

describe('reference stubs — the class that matters most', () => {
  it('catches a pointer that names another case, whatever its disposal says', () => {
    // Real, 185 chars. `disposal_nature` is DISPOSED, and the reasoning is not here.
    const r = classifyHcDocument(
      doc({
        disposalNature: 'DISPOSED',
        caseNumber: 'WPSS/14792/1999',
        fullText:
          'W.P. No. 1946 (S/S) of 2001 Old no. 14792/99 Hon’bel Rajesh Tandon J. The writ ' +
          'petition is allowed. Order passed in writ petition No. 3610 (SS) of 2001. ' +
          'Rajesh Tandon, J. 29-6-2004 M.K.',
      }),
    );
    assert.equal(r.documentClass, 'reference_stub');
    assert.equal(r.method, 'pointer_phrase');
  });

  it('catches "for order, see our order ... separate sheet"', () => {
    // Real, 212 chars, FA/627/2000.
    const r = classifyHcDocument(
      doc({
        disposalNature: 'DISPOSED',
        fullText:
          'F.A. No. 164 of 2001 (Old No. 627/2000) Hon’ble P.C. Verma, J. Hon’ble B.S. Verma, J. ' +
          'For order, see our order of date passed on the separate sheet in F.A. No.243 of 2001. ' +
          '(B.S.V., J.) (P.C.V., J.) 20-09-2004 SPA',
      }),
    );
    assert.equal(r.documentClass, 'reference_stub');
  });

  it('is tested BEFORE the disposal, so an "ALLOWED" pointer is not an authority', () => {
    // The trap: a 185-char pointer carrying disposal_nature = ALLOWED would be
    // classified `decided` by a rule that read the disposal first, and would go
    // into the index wearing an authority's clothes.
    const r = classifyHcDocument(
      doc({ disposalNature: 'ALLOWED', fullText: 'The petition is allowed. Order passed in W.P. No. 3610 of 2001.' }),
    );
    assert.equal(r.documentClass, 'reference_stub');
  });

  it('treats anything under the stub length as a stub even with no pointer phrase', () => {
    // 85 of the 131 sub-500 documents carry no explicit pointer. They are still
    // too short to hold a recital AND a finding.
    const r = classifyHcDocument(doc({ fullText: 'x'.repeat(STUB_MAX_CHARS - 1) }));
    assert.equal(r.documentClass, 'reference_stub');
    assert.equal(r.method, 'below_stub_length');
  });

  it('does NOT call a long judgment a stub because it cites another order', () => {
    // A reasoned judgment routinely refers to orders. Length is what stops the
    // pointer rule from swallowing real decisions.
    const r = classifyHcDocument(doc({ fullText: 'Order passed in CWJC 100/2020. ' + 'x'.repeat(9000) }));
    assert.equal(r.documentClass, 'decided');
  });
});

describe('classes read from disposal_nature, verbatim from source', () => {
  it('bail, either way — the largest class at 16,716 rows', () => {
    assert.equal(classifyHcDocument(doc({ disposalNature: 'BAIL GRANTED' })).documentClass, 'bail_order');
    assert.equal(classifyHcDocument(doc({ disposalNature: 'BAIL REJECTED' })).documentClass, 'bail_order');
  });

  it('procedural disposals, in every printed form the corpus uses', () => {
    for (const d of [
      'WITHDRAWN',
      'ABATED',
      'DISMISS FOR NON-PROSECUTION',
      'D.F.D. FOR NON APPEARANCE',
      'D.F.D. (PRE-EMPTORY)',
      'CONSIGNED',
      'CONVERTED',
    ]) {
      assert.equal(
        classifyHcDocument(doc({ disposalNature: d })).documentClass,
        'procedural_disposal',
        `${d} ended the case without deciding it`,
      );
    }
  });

  it('separates a merits disposal with reasoning from one without', () => {
    assert.equal(classifyHcDocument(doc({ fullText: 'x'.repeat(20614) })).documentClass, 'decided');
    // Real shape: MJC/4114/2025 "In Civil Writ Jurisdiction Case No.10330 of 2020",
    // 854 chars — an application inside another case, not a standalone decision.
    assert.equal(
      classifyHcDocument(doc({ caseNumber: 'MJC/4114/2025', fullText: 'x'.repeat(BRIEF_MAX_CHARS - 1) }))
        .documentClass,
      'decided_brief',
    );
  });
});

describe('bail hiding behind a merits disposal — found by the validation sample', () => {
  it('a CR. MISC. "ALLOWED" that is really a bail application is a bail_order', () => {
    // 5,092 of 6,598 CR. MISC. merits disposals carry an explicit bail phrase.
    // Calling them `decided` told the index that 58% of its "decided
    // authorities" were reasoned decisions on a legal question. They are bail.
    const r = classifyHcDocument(
      doc({
        disposalNature: 'ALLOWED',
        caseNumber: 'CR. MISC./10124/2026',
        fullText: 'Heard learned counsel. The prayer for anticipatory bail is allowed. ' + 'x'.repeat(3000),
      }),
    );
    assert.equal(r.documentClass, 'bail_order');
    assert.equal(r.method, 'text_bail_phrase', 'recorded as an inference, not as a source field');
  });

  it('does NOT reclassify a writ matter that never mentions bail', () => {
    // The control that makes the rule a signal: 1 of 738 CWJC merits disposals
    // mentions bail, so the phrase is genuinely discriminating.
    const r = classifyHcDocument(
      doc({ disposalNature: 'ALLOWED', caseNumber: 'CWJC/7804/2015', fullText: 'x'.repeat(20614) }),
    );
    assert.equal(r.documentClass, 'decided');
  });
});

describe('unclassified is a result, never a default', () => {
  it('refuses DISPOSED — 9,800 rows and the most ambiguous value in the column', () => {
    // It covers a reasoned decision, a consent order and an infructuous closure
    // alike. Guessing it into `decided` would inflate the authority count by 24%
    // of the corpus on a word that does not mean what the guess needs it to mean.
    const r = classifyHcDocument(doc({ disposalNature: 'DISPOSED' }));
    assert.equal(r.documentClass, null);
    assert.match(r.method, /^unclassified_disposal:DISPOSED/);
  });

  it('returns null when the source recorded no disposal at all', () => {
    // 189 of 40,980 rows. Absent is not "ordinary".
    const r = classifyHcDocument(doc({ disposalNature: null }));
    assert.equal(r.documentClass, null);
    assert.equal(r.method, 'no_disposal_nature');
  });

  it('always records the method, so any row is auditable without re-deriving it', () => {
    for (const d of ['BAIL GRANTED', 'WITHDRAWN', 'ALLOWED', 'DISPOSED', null]) {
      assert.ok(classifyHcDocument(doc({ disposalNature: d })).method.length > 0);
    }
  });
});
