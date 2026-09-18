/**
 * The failures that matter are the ones producing a *well-formed* query that
 * measures the wrong thing: a sentence too long to take the AND path, a
 * reporter's headnote, or a question carrying its own answer.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ISSUE_BOUNDS, extractIssueStatements, looksLikeHeadnote } from './issue-statements.ts';

const PREAMBLE =
  'This appeal by special leave is directed against the judgment of the High Court. ' +
  'The facts lie within a narrow compass and may be stated briefly. ';

test('THE COURT’S OWN STATEMENT OF THE ISSUE IS EXTRACTED', () => {
  const text = `${PREAMBLE}The short question that arises for consideration is whether anticipatory bail granted under the Code may be limited in point of time. We have heard counsel.`;
  const found = extractIssueStatements(text);
  assert.equal(found.length, 1);
  assert.match(found[0]!.text, /^The short question/);
  assert.match(found[0]!.text, /limited in point of time\.$/);
});

test('the several formulations Indian courts actually use', () => {
  for (const opener of [
    'The question that arises for consideration is whether',
    'The only issue which falls for consideration is whether',
    'The substantial question of law involved is whether',
    'The controversy before us is whether',
    'The narrow point that arises is whether',
  ]) {
    const text = `${PREAMBLE}${opener} the presumption stands rebutted on these facts alone.`;
    assert.equal(extractIssueStatements(text).length, 1, `missed: ${opener}`);
  }
});

test('a direct question is taken too — it is how an advocate frames one', () => {
  const text = `${PREAMBLE}Whether the accused may be convicted on the sole testimony of a child witness without corroboration?`;
  const found = extractIssueStatements(text);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.via, 'direct');
});

/* ---------------------------------------------- what must be refused -- */

test('THE LENGTH CAP IS THE POINT OF THE FILE', () => {
  /**
   * Above 200 characters `retrieve.ts` stops attempting the AND pass, so a
   * longer query takes the OR path and measures exactly what the derived set
   * already measures. A "successful" extraction over the cap is a silent
   * duplicate of the existing instrument.
   */
  const long = 'x'.repeat(ISSUE_BOUNDS.MAX_CHARS + 50);
  const text = `${PREAMBLE}The question that arises for consideration is whether ${long}.`;
  assert.deepEqual(extractIssueStatements(text), []);
  assert.equal(ISSUE_BOUNDS.MAX_CHARS, 200, 'the cap must track retrieve.ts SPARSE_AND_MAX_CHARS');
});

test('A REPORTER HEADNOTE IS REFUSED — it is somebody else’s copyright', () => {
  // Eastern Book Company v. D.B. Modak. CLAUDE.md §6: raw court text, never a
  // law report's edition of it.
  const text =
    'Allowing the appeal, the Court HELD: 1.1. The question that arises for consideration is whether the protection continues beyond the period fixed.';
  assert.deepEqual(extractIssueStatements(text), []);
});

test('the headnote detector fires on each marker independently', () => {
  for (const marker of [
    'HELD:',
    'Dismissing the appeal, the Court',
    'Case Law Cited',
    'Cases referred',
  ]) {
    assert.equal(looksLikeHeadnote(`some text ${marker} more text`), true, `missed: ${marker}`);
  }
  assert.equal(looksLikeHeadnote(PREAMBLE), false, 'ordinary prose was called a headnote');
});

test('A QUESTION CARRYING A CITATION IS REFUSED — it hands over the answer', () => {
  // The same leakage build-queries.ts guards against. Refused rather than
  // redacted: these are one sentence long, and a question with […] in the
  // middle is not something anybody would type.
  for (const cite of ['(2019) 4 SCC 221', 'AIR 1963 SC 1295', '2023 INSC 456']) {
    const text = `${PREAMBLE}The question that arises for consideration is whether the rule in ${cite} applies to these facts.`;
    assert.deepEqual(extractIssueStatements(text), [], `leaked: ${cite}`);
  }
});

test('"the question of limitation was not pressed" ANNOUNCES NOTHING', () => {
  // The pattern requires the interrogative that follows. Without it this
  // sentence reads as an issue statement and is not one.
  const text = `${PREAMBLE}The question of limitation was not pressed before us and needs no consideration at all.`;
  assert.deepEqual(extractIssueStatements(text), []);
});

test('a judgment stating no question yields NOTHING, which is the normal case', () => {
  assert.deepEqual(extractIssueStatements(PREAMBLE), []);
  assert.deepEqual(extractIssueStatements(''), []);
});

/* --------------------------------------------------- bookkeeping -- */

test('two issues in one judgment both come back, in document order', () => {
  const text =
    `${PREAMBLE}The first question that arises for consideration is whether the notice was validly served on the tenant. ` +
    'Some intervening reasoning of no consequence here. ' +
    'The second issue that falls for consideration is whether the decree can survive that finding.';
  const found = extractIssueStatements(text);
  assert.equal(found.length, 2);
  assert.ok(found[0]!.offset < found[1]!.offset, 'not in document order');
  assert.match(found[0]!.text, /validly served/);
});

test('the same sentence twice is returned once', () => {
  const one =
    'The question that arises for consideration is whether the presumption stands rebutted.';
  const found = extractIssueStatements(`${PREAMBLE}${one} Then again. ${one}`);
  assert.equal(found.length, 1);
});

test('the offset points at the sentence, so an extraction can be checked', () => {
  const text = `${PREAMBLE}The question that arises for consideration is whether the notice was validly served.`;
  const [found] = extractIssueStatements(text);
  assert.ok(found);
  assert.ok(text.slice(found.offset).startsWith('The question that arises'));
});

/* ------------------------------- defects read off the REAL corpus -- */

test('A NEGATED FORMULATION IS REFUSED — it states a NON-issue', () => {
  /**
   * Verbatim from the corpus: "The question is not whether the discharge of
   * certain functions by the Corporation have statutory backing". The court is
   * clearing ground. As a query it asks for the opposite of what it appears to.
   */
  const text = `${PREAMBLE}The question is not whether the discharge of certain functions by the Corporation have statutory backing.`;
  assert.deepEqual(extractIssueStatements(text), []);
});

test('OCR DEBRIS IS REFUSED, using the rule build-queries.ts already owns', () => {
  // A second implementation of one rule is the drift CLAUDE.md forbids, so this
  // reuses looksOcrDamaged rather than copying it.
  const text = `${PREAMBLE}The question that arises for consideration is whether the mem· hers of the· board were validly appointed.`;
  assert.deepEqual(extractIssueStatements(text), []);
});

test('a clean statement still passes after both refusals', () => {
  // Over-refusing would empty the fixture as surely as under-refusing would
  // poison it.
  const text = `${PREAMBLE}The first issue is whether any prejudice was caused to the appellant, as his appeal was heard in the absence of his advocate.`;
  assert.equal(extractIssueStatements(text).length, 1);
});
