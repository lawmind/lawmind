/**
 * The explanation exists to make a MISPARSE visible, so the tests that matter
 * are the ones where two different groupings must not read the same.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { explainQuery } from './explain.ts';
import { FIELDS, parse } from './parse.ts';

const say = (q: string) => explainQuery(parse(q));

test('TWO DIFFERENT GROUPINGS MUST NOT READ THE SAME', () => {
  /**
   * The whole reason this file exists. `a AND b OR c` and `a AND (b OR c)`
   * return different judgments; if the sentence cannot tell them apart it
   * cannot catch the misparse it was built to catch.
   */
  const flat = say('bail AND parole OR remission');
  const nested = say('bail AND (parole OR remission)');
  assert.notEqual(flat, nested);
  // `a AND b OR c` groups as `(a AND b) OR c` — the AND is the inner clause.
  assert.match(flat, /either \(containing “bail”, and containing “parole”\), or/);
  // `a AND (b OR c)` — the OR is the inner clause.
  assert.match(nested, /and \(either containing “parole”, or containing “remission”\)/);
});

test('the sentence names the FIELD, not the syntax', () => {
  // Echoing the syntax back proves only that we can print what was typed.
  const s = say('judge:"Kania"');
  assert.match(s, /decided by a judge matching/);
  assert.ok(!s.includes('judge:'), 'the raw syntax leaked into the explanation');
});

test('every field has phrasing — a new field cannot silently render as blank', () => {
  for (const f of FIELDS) {
    const value = f === 'date' ? '2019' : f === 'type' ? 'criminal' : f === 'section' ? '138' : 'x';
    const s = say(`${f}:${value}`);
    assert.ok(s.length > 'Judgments .'.length, `${f}: produced an empty explanation`);
    assert.match(s, /^Judgments .+\.$/, `${f}: did not produce a sentence`);
  }
});

test('a negation reads as an exclusion, and keeps its scope', () => {
  assert.match(say('section:138 NOT party:"State"'), /and not involving a party matching/);
  assert.match(say('section:138 NOT (party:"State" OR party:"Union")'), /not \(either/);
});

test('NEAR states the distance in words, and agrees in number', () => {
  assert.match(say('"anticipatory bail" NEAR/5 "twin conditions"'), /within 5 words of/);
  assert.match(say('"a b" NEAR/1 "c d"'), /within 1 word of/);
});

test('a range reads as a period, not as brackets', () => {
  assert.equal(say('date:[2019 TO 2024]'), 'Judgments decided between 2019 and 2024.');
});

test('a wildcard says so — otherwise the advocate cannot tell it widened', () => {
  assert.match(say('bail*'), /any ending/);
});

test('the sentence is a claim about what comes back, so it is easy to check', () => {
  assert.equal(
    say('judge:"Chandrachud" section:138 date:[2019 TO 2024]'),
    'Judgments (decided by a judge matching “Chandrachud”, and referring to section 138), ' +
      'and decided between 2019 and 2024.',
  );
});
