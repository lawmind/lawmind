/**
 * The two screens whose thresholds decide what the semantic core admits.
 *
 * Both are asserted against text taken from real sampled documents rather than
 * invented, because both were WRITTEN from real documents and a test built on
 * imagined input would agree with the implementation by construction.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BAIL_PHRASE,
  BAIL_PHRASE_AS_DEPLOYED,
  ENGLISH_RATE_FLOOR,
  citability,
  englishRate,
  identityState,
  roleVerdict,
  textVerdict,
} from './quality-state.ts';

/**
 * Verbatim from document `26573ee8`, an admitted Tier-A row. The line break
 * between `on` and `bail` is the PDF's, and it is the whole point.
 */
const WRAPPED_BAIL =
  'In view of the report of the investigating officer, applicants\nNo.1, 2, 6, and 8 namely Mukesh, Neeraj, Anil and Sonu be released on\nbail.\nThe applicants are directed to cooperate with the investigating agency.';

/** Verbatim tail of document `aeef5f80`, a Telangana row admitted to Tier A. */
const SUBSTITUTION_GARBAGE =
  '0 :270 49 86082627-43 49 %26: 92-1-3> @,-/, 7,0 .2-: 2;4537 .,211 /266< -37060.7 27 7,0 6270 49 82 964; 7,0 :270 49 :092517';

const REAL_ENGLISH_ORDER =
  'In view of this, no case is made out for invocation of powers under Section 115 of the Code of Civil Procedure. In the result, the Civil Revision Application fails and the same is dismissed. In view of the dismissal of the Civil Revision Application, nothing survives in the Civil Application and the same is disposed of accordingly.';

describe('bail phrase detection', () => {
  it('matches a phrase the PDF wrapped across a line', () => {
    assert.equal(BAIL_PHRASE.test(WRAPPED_BAIL), true);
  });

  /**
   * The regression this test exists for. `hc-classify.ts` runs the deployed
   * pattern today, so every bail order whose phrase wraps is currently getting a
   * different class. When that pattern is fixed and the corpus re-classified
   * with `--restale`, this assertion is the thing to delete — deliberately, in
   * the same commit, not by drift.
   */
  it('the DEPLOYED pattern misses it, which is why the corrected one exists', () => {
    assert.equal(BAIL_PHRASE_AS_DEPLOYED.test(WRAPPED_BAIL), false);
  });

  it('still refuses a word that merely contains bail', () => {
    assert.equal(BAIL_PHRASE.test('the bailiff attended and the bailiwick was noted'), false);
  });

  it('catches the two phrasings the deployed list has no entry for at all', () => {
    assert.equal(BAIL_PHRASE.test('the accused was granted bail on furnishing sureties'), true);
    assert.equal(BAIL_PHRASE.test('on furnishing a bail bond of Rs. 10,000/-'), true);
    assert.equal(
      BAIL_PHRASE_AS_DEPLOYED.test('the accused was granted bail on furnishing sureties'),
      false,
    );
  });
});

describe('english density screen', () => {
  it('scores real English legal prose far above the floor', () => {
    assert.ok(englishRate(REAL_ENGLISH_ORDER) > 40, `got ${englishRate(REAL_ENGLISH_ORDER)}`);
  });

  it('scores substitution garbage below the floor', () => {
    assert.ok(
      englishRate(SUBSTITUTION_GARBAGE) < ENGLISH_RATE_FLOOR,
      `got ${englishRate(SUBSTITUTION_GARBAGE)}`,
    );
  });

  it('returns 0 for empty text rather than dividing by zero', () => {
    assert.equal(englishRate(''), 0);
  });
});

describe('text verdict', () => {
  it('calls unreadable ASCII an OCR candidate, not clean', () => {
    const v = textVerdict({
      text: SUBSTITUTION_GARBAGE,
      storedScriptQuality: null,
      storedScriptMethod: null,
    });
    assert.equal(v.state, 'OCR_CANDIDATE');
  });

  /**
   * The single most important assertion in this file. Readable English with no
   * detected defect is UNKNOWN, never KNOWN_GOOD: nothing at scan time can tell
   * a genuine English judgment from a Hindi one whose Devanagari the extractor
   * deleted, and a wrong KNOWN_GOOD costs the whole purpose of the axis.
   */
  it('never upgrades to KNOWN_GOOD from the absence of a defect', () => {
    const v = textVerdict({
      text: REAL_ENGLISH_ORDER,
      storedScriptQuality: null,
      storedScriptMethod: null,
    });
    assert.equal(v.state, 'UNKNOWN');
  });

  it('takes KNOWN_GOOD only from a stored verdict, and keeps its method', () => {
    const v = textVerdict({
      text: REAL_ENGLISH_ORDER,
      storedScriptQuality: 'clean',
      storedScriptMethod: 'script_retention_v2',
    });
    assert.equal(v.state, 'KNOWN_GOOD');
    assert.equal(v.method, 'script_retention_v2');
  });

  it('reports empty text as its own state rather than as a defect', () => {
    assert.equal(
      textVerdict({ text: '', storedScriptQuality: null, storedScriptMethod: null }).state,
      'NO_EXTRACTABLE_TEXT',
    );
  });
});

describe('role verdict', () => {
  it('prefers the stored class and records which rule wrote it', () => {
    const v = roleVerdict({
      hcDocumentClass: 'decided',
      hcClassMethod: 'disposal_nature_merits',
      text: null,
    });
    assert.equal(v.role, 'judgment');
    assert.equal(v.method, 'disposal_nature_merits');
  });

  it('falls back to the bail screen only when no class was stored', () => {
    const v = roleVerdict({ hcDocumentClass: null, hcClassMethod: null, text: WRAPPED_BAIL });
    assert.equal(v.role, 'bail_order');
    assert.match(v.method, /^text_bail_phrase_/);
  });

  it('separates a rule that refused from a row nothing ever read', () => {
    const refused = roleVerdict({
      hcDocumentClass: null,
      hcClassMethod: 'unclassified_disposal:DISPOSED',
      text: 'x',
    });
    const never = roleVerdict({ hcDocumentClass: null, hcClassMethod: null, text: 'x' });
    assert.equal(refused.role, 'unknown');
    assert.equal(never.role, 'unknown');
    assert.notEqual(refused.method, never.method);
  });
});

describe('citability', () => {
  it('lets unsafe text outrank a reasoned role', () => {
    assert.equal(
      citability({ role: 'judgment', text: 'OCR_CANDIDATE', identity: 'sound' }),
      'unsafe',
    );
  });

  it('refuses to call a judgment substantive without positive text evidence', () => {
    assert.equal(citability({ role: 'judgment', text: 'UNKNOWN', identity: 'sound' }), 'unknown');
    assert.equal(
      citability({ role: 'judgment', text: 'KNOWN_GOOD', identity: 'sound' }),
      'citable_substantive',
    );
  });

  it('treats a bail order as usable but never as precedent', () => {
    assert.equal(
      citability({ role: 'bail_order', text: 'KNOWN_GOOD', identity: 'sound' }),
      'citable_with_care',
    );
  });

  it('does not penalise duplicate-group membership', () => {
    assert.equal(
      citability({ role: 'judgment', text: 'KNOWN_GOOD', identity: 'duplicate_member' }),
      'citable_substantive',
    );
  });
});

describe('identity state', () => {
  const sound = {
    contentHash: 'h',
    caseNumber: 'WP/1/2020',
    judgmentDate: '2020-01-01',
    court: 'Bombay High Court',
    caseTitle: 'A vs B',
    memberCount: 1,
  };

  it('is weak when any identity column is missing', () => {
    assert.equal(identityState({ ...sound, caseNumber: null }), 'weak');
    assert.equal(identityState({ ...sound, caseTitle: 'ab' }), 'weak');
  });

  it('records duplicate membership as a fan-out obligation, not a defect', () => {
    assert.equal(identityState({ ...sound, memberCount: 7118 }), 'duplicate_member');
  });

  it('treats a null member count as a singleton', () => {
    assert.equal(identityState({ ...sound, memberCount: null }), 'sound');
  });
});
