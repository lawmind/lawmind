import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractParties, extractPartiesFromTitle, partiesFromSourceMetadata } from './parties.ts';

// --- source metadata method — real Supreme Court sample, year=2018 --------

test('source metadata: both fields present, straightforward', () => {
  const r = partiesFromSourceMetadata(
    'V. RAVI KUMAR',
    'STATE, REP. BY INSPECTOR OF POLICE, DISTRICT CRIME BRANCH, SALEM, TAMIL NADU & ORS.',
  );
  assert.deepEqual(r, {
    petitioner: 'V. RAVI KUMAR',
    respondent:
      'STATE, REP. BY INSPECTOR OF POLICE, DISTRICT CRIME BRANCH, SALEM, TAMIL NADU & ORS.',
    method: 'source_metadata',
  });
});

test('source metadata: both blank returns null, not an empty extraction', () => {
  assert.equal(partiesFromSourceMetadata('', ''), null);
  assert.equal(partiesFromSourceMetadata(null, undefined), null);
});

test('source metadata: one side present is still a real extraction', () => {
  const r = partiesFromSourceMetadata('SOME PETITIONER', '');
  assert.deepEqual(r, {
    petitioner: 'SOME PETITIONER',
    respondent: null,
    method: 'source_metadata',
  });
});

// --- title-parsed method — real corpus case_title samples ------------------

test('title_parsed: Supreme Court "versus" separator', () => {
  const r = extractPartiesFromTitle(
    'CHINTAMAN RAO AND RAM KRISHNA versus THE STATE OF MADHYA PRADESH',
  );
  assert.deepEqual(r, {
    petitioner: 'CHINTAMAN RAO AND RAM KRISHNA',
    respondent: 'THE STATE OF MADHYA PRADESH',
    method: 'title_parsed',
  });
});

test('title_parsed: High Court "Vs" separator', () => {
  const r = extractPartiesFromTitle(
    'SHRI BASWANTRAO @ PANDITRAO HUKKERI Vs THE STATE OF MAHARASHTRA AND OTHERS',
  );
  assert.deepEqual(r, {
    petitioner: 'SHRI BASWANTRAO @ PANDITRAO HUKKERI',
    respondent: 'THE STATE OF MAHARASHTRA AND OTHERS',
    method: 'title_parsed',
  });
});

test('title_parsed: "Vs." with a trailing period also splits', () => {
  const r = extractPartiesFromTitle('DENA BANK Vs. MRS. M.D. NATHAN and ANR.');
  assert.deepEqual(r, {
    petitioner: 'DENA BANK',
    respondent: 'MRS. M.D. NATHAN and ANR.',
    method: 'title_parsed',
  });
});

// --- real edge cases: 64 corpus-wide rows with no separator or an empty side

test('edge case: "Vs" alone — both sides absent, still title_parsed since the separator matched', () => {
  const r = extractPartiesFromTitle('Vs');
  assert.deepEqual(r, { petitioner: null, respondent: null, method: 'title_parsed' });
});

test('edge case: petitioner present, respondent absent — "SATTO YADAV Vs"', () => {
  const r = extractPartiesFromTitle('SATTO YADAV Vs');
  assert.deepEqual(r, { petitioner: 'SATTO YADAV', respondent: null, method: 'title_parsed' });
});

test('edge case: petitioner absent, respondent present — "Vs M/S.ZU-ZU WIRES LTD."', () => {
  const r = extractPartiesFromTitle('Vs M/S.ZU-ZU WIRES LTD.');
  assert.deepEqual(r, {
    petitioner: null,
    respondent: 'M/S.ZU-ZU WIRES LTD.',
    method: 'title_parsed',
  });
});

test('edge case: a genuine suo motu / reference matter — "versus" with nothing after it', () => {
  const r = extractPartiesFromTitle(
    'IN RE: ALARMING RISE IN THE NUMBER OF REPORTED CHILD RAPE INCIDENTS versus',
  );
  assert.deepEqual(r, {
    petitioner: 'IN RE: ALARMING RISE IN THE NUMBER OF REPORTED CHILD RAPE INCIDENTS',
    respondent: null,
    method: 'title_parsed',
  });
});

test('edge case: trailing punctuation-only respondent is treated as absent, not stored as "."', () => {
  const r = extractPartiesFromTitle('Vs .');
  assert.deepEqual(r, { petitioner: null, respondent: null, method: 'title_parsed' });
});

test('unknown: no recognised separator at all', () => {
  const r = extractPartiesFromTitle('IN THE MATTER OF THE ESTATE OF X');
  assert.deepEqual(r, { petitioner: null, respondent: null, method: 'unknown' });
});

// --- the combined entry point ----------------------------------------------

test('extractParties prefers source metadata over title parsing', () => {
  const r = extractParties({
    caseTitle: 'A versus B',
    sourcePetitioner: 'REAL PETITIONER',
    sourceRespondent: 'REAL RESPONDENT',
  });
  assert.equal(r.method, 'source_metadata');
  assert.equal(r.petitioner, 'REAL PETITIONER');
});

test('extractParties falls back to title parsing when source metadata is absent', () => {
  const r = extractParties({ caseTitle: 'DENA BANK Vs MRS. M.D. NATHAN' });
  assert.equal(r.method, 'title_parsed');
  assert.equal(r.petitioner, 'DENA BANK');
});

test('extractParties falls back to title parsing when source metadata is present but blank', () => {
  const r = extractParties({
    caseTitle: 'DENA BANK Vs MRS. M.D. NATHAN',
    sourcePetitioner: '',
    sourceRespondent: '',
  });
  assert.equal(r.method, 'title_parsed');
});

// --- negative control: never fabricate a separator that is not there -------

test('negative control: "V" alone with no dot/space around it does not falsely split a name containing the letter', () => {
  // "VASANT" contains "V" but must not be read as a bare-V separator.
  const r = extractPartiesFromTitle('VASANT GANPAT PADAVE versus ANANT MAHADEV SAWANT');
  assert.equal(r.petitioner, 'VASANT GANPAT PADAVE');
  assert.notEqual(r.petitioner, 'ASANT GANPAT PADAVE');
});
