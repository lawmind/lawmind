/**
 * The tests that matter here are the REFUSALS. A pipeline that accepts a
 * hallucinated judge name produces fluent, plausible, wrong metadata that
 * nobody can spot downstream — so every test below asserts that an ungrounded
 * claim is rejected, not that a good one is accepted.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type Claim,
  claimsFromCitations,
  claimsFromMetadata,
  claimsFromTreatment,
  enrichmentInputHash,
  parseJson,
  verificationState,
  verifyClaims,
} from './enrich.ts';

const SOURCE = `IN THE SUPREME COURT OF INDIA
CRIMINAL APPELLATE JURISDICTION
Criminal Appeal No. 462 of 2018
SATPAL SINGH versus THE STATE OF PUNJAB
MARCH 27, 2018
[KURIAN JOSEPH, MOHAN M. SHANTANAGOUDAR AND NAVIN SINHA, JJ.]
This Court in Kesavananda Bharati v. State of Kerala (1973) 4 SCC 225 held
that the basic structure could not be abrogated.`;

/* --------------------------------------------------------------- parsing -- */

test('a fenced JSON block parses despite the instruction not to fence it', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
});

test('prose around the object is recovered once, and never coerced twice', () => {
  assert.deepEqual(parseJson('Here you go: {"a":1} hope that helps'), { a: 1 });
  assert.equal(parseJson('no object at all'), null);
  assert.equal(parseJson('{ broken '), null);
});

/* ---------------------------------------------------------- verification -- */

test('a real span containing the claimed value verifies', () => {
  const claims: Claim[] = [
    { value: '(1973) 4 SCC 225', evidence: 'Kesavananda Bharati v. State of Kerala (1973) 4 SCC 225', kind: 'citation' },
  ];
  const [v] = verifyClaims(claims, SOURCE);
  assert.equal(v!.verified, true, v!.reason ?? '');
});

test('OCR NEWLINES DO NOT DEFEAT VERIFICATION — whitespace is the only normalisation', () => {
  // The source wraps "held\nthat"; a model copying the sentence cannot know that.
  const claims: Claim[] = [
    { value: 'basic structure', evidence: 'held that the basic structure could not be abrogated', kind: 'citation' },
  ];
  assert.equal(verifyClaims(claims, SOURCE)[0]!.verified, true);
});

test('A FABRICATED SPAN IS REJECTED — this is the whole safety property', () => {
  const claims: Claim[] = [
    { value: '(1999) 2 SCC 718', evidence: 'This Court in A.P. Pollution Control Board (1999) 2 SCC 718 observed', kind: 'citation' },
  ];
  const [v] = verifyClaims(claims, SOURCE);
  assert.equal(v!.verified, false);
  assert.match(v!.reason!, /not found in source/);
});

test('a claim with no evidence at all is rejected, however plausible', () => {
  // Kesavananda IS in the source — but an unevidenced claim still fails, because
  // the evidence requirement is what makes the rest of the pipeline checkable.
  const [v] = verifyClaims([{ value: '(1973) 4 SCC 225', evidence: null, kind: 'citation' }], SOURCE);
  assert.equal(v!.verified, false);
  assert.match(v!.reason!, /no evidence span/);
});

test('a trivially short span cannot be used to "prove" anything', () => {
  const [v] = verifyClaims([{ value: 'J.', evidence: 'JJ.', kind: 'judge' }], SOURCE);
  assert.equal(v!.verified, false);
  assert.match(v!.reason!, /shorter than/);
});

test('A REAL SPAN QUOTED TO SUPPORT AN UNRELATED VALUE IS REJECTED', () => {
  // The span is genuinely in the document. The judge name is not. Without this
  // check, any real sentence would "verify" any invented value pinned to it.
  const claims: Claim[] = [
    { value: 'RANJAN GOGOI', evidence: 'CRIMINAL APPELLATE JURISDICTION', kind: 'judge' },
  ];
  const [v] = verifyClaims(claims, SOURCE);
  assert.equal(v!.verified, false);
  assert.match(v!.reason!, /not present in source|does not contain/);
});

/**
 * The corpus prints coram lines in capitals and the prompt tells the model to
 * strip honorifics, so a correct answer comes back re-cased. Byte-exact
 * comparison rejected 7 of 41 correct claims in the first real pilot.
 */
test('CASE FOLDING accepts a correctly re-cased name...', () => {
  const source = 'CORAM: HONOURABLE MR. JUSTICE RAJESH KUMAR VERMA\nORAL JUDGMENT';
  const claims: Claim[] = [
    { value: 'Rajesh Kumar Verma', evidence: 'HONOURABLE MR. JUSTICE RAJESH KUMAR VERMA', kind: 'judge' },
  ];
  assert.equal(verifyClaims(claims, source)[0]!.verified, true);
});

test('...and STILL rejects a fabricated name in any casing — folding is not fuzzing', () => {
  const source = 'CORAM: HONOURABLE MR. JUSTICE RAJESH KUMAR VERMA\nORAL JUDGMENT';
  for (const value of ['Ranjan Gogoi', 'RANJAN GOGOI', 'ranjan gogoi']) {
    const claims: Claim[] = [
      { value, evidence: 'HONOURABLE MR. JUSTICE RAJESH KUMAR VERMA', kind: 'judge' },
    ];
    assert.equal(verifyClaims(claims, source)[0]!.verified, false, `${value} was accepted`);
  }
  // A near-miss must fail too: one wrong word is a different judge, not a typo
  // to be forgiven. No edit-distance tolerance is applied anywhere.
  const near: Claim[] = [
    { value: 'Rajesh Kumar Sharma', evidence: 'HONOURABLE MR. JUSTICE RAJESH KUMAR VERMA', kind: 'judge' },
  ];
  assert.equal(verifyClaims(near, source)[0]!.verified, false);
});

test('a real judge, evidenced by the coram line, verifies', () => {
  const claims: Claim[] = [
    { value: 'NAVIN SINHA', evidence: '[KURIAN JOSEPH, MOHAN M. SHANTANAGOUDAR AND NAVIN SINHA, JJ.]', kind: 'judge' },
  ];
  assert.equal(verifyClaims(claims, SOURCE)[0]!.verified, true);
});

test('treatment is exempt from the value-inside-span rule, and correctly so', () => {
  // "followed" is a LABEL for what the span says, not a substring of it. Every
  // treatment claim would otherwise be rejected for not containing its own name.
  const claims: Claim[] = [
    { value: 'followed', evidence: 'This Court in Kesavananda Bharati v. State of Kerala', kind: 'treatment' },
  ];
  assert.equal(verifyClaims(claims, SOURCE)[0]!.verified, true);
  // But its span must still be real.
  const bad: Claim[] = [{ value: 'overruled', evidence: 'we hereby overrule that decision entirely', kind: 'treatment' }];
  assert.equal(verifyClaims(bad, SOURCE)[0]!.verified, false);
});

/* ----------------------------------------------------------- claim shapes -- */

test('an empty answer is a valid answer, not a parse failure', () => {
  assert.deepEqual(claimsFromCitations({ citations: [] }), []);
  assert.equal(verificationState([]), 'unverified');
});

test('malformed rows are skipped rather than half-read', () => {
  const claims = claimsFromCitations({ citations: [{ citation: '' }, { nope: 1 }, { citation: '(1973) 4 SCC 225', evidence: 'x' }] });
  assert.equal(claims.length, 1);
});

test('an invented relationship value is refused, not mapped to the nearest one', () => {
  assert.deepEqual(claimsFromTreatment({ relationship: 'obliterated', evidence: 'x' }), []);
  assert.equal(claimsFromTreatment({ relationship: 'overruled_in_part', evidence: 'x' }).length, 1);
});

test('metadata claims carry their own kind so verification can differ per field', () => {
  const claims = claimsFromMetadata({
    judges: [{ name: 'NAVIN SINHA', evidence: 'AND NAVIN SINHA, JJ.' }],
    neutral_citation: { value: '2018 INSC 277', evidence: 'reported as 2018 INSC 277' },
    case_number: { value: null, evidence: null },
  });
  assert.deepEqual(claims.map((c) => c.kind), ['judge', 'neutral_citation']);
});

test('mixed outcomes report as partial, so a half-good answer is never "verified"', () => {
  const claims: Claim[] = [
    { value: 'NAVIN SINHA', evidence: '[KURIAN JOSEPH, MOHAN M. SHANTANAGOUDAR AND NAVIN SINHA, JJ.]', kind: 'judge' },
    { value: 'RANJAN GOGOI', evidence: 'Hon\'ble Mr. Justice Ranjan Gogoi presided', kind: 'judge' },
  ];
  assert.equal(verificationState(verifyClaims(claims, SOURCE)), 'partial');
});

/* -------------------------------------------------------------- idempotency -- */

test('the input hash changes with the prompt version, so a reworded prompt re-runs', () => {
  const a = enrichmentInputHash('metadata', 'v1', 'text');
  const b = enrichmentInputHash('metadata', 'v2', 'text');
  const c = enrichmentInputHash('treatment', 'v1', 'text');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.equal(a, enrichmentInputHash('metadata', 'v1', 'text'));
});
