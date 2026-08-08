/**
 * If this splitter is wrong, s. 302 contains half of s. 303, and the IPC↔BNS
 * mapping built on it tells an advocate the wrong offence. So the tests are
 * mostly about the two ways it could quietly be wrong: firing on ordinary
 * numbered prose, and parsing the table of contents.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  KNOWN_BAD_HANDLES,
  REPEALED_ACT_HANDLES,
  compareSectionNumbers,
  dropTableOfContents,
  keepAscendingRun,
  looksLikeFootnote,
  parseSections,
  stripPageFurniture,
} from './repealed-acts.ts';

/** How the IPC actually prints, em-dash and all. */
const IPC = `
THE INDIAN PENAL CODE, 1860
299. Culpable homicide.—Whoever causes death by doing an act with the intention of
causing death, or with the intention of causing such bodily injury as is likely to cause
death, commits the offence of culpable homicide.
300. Murder.—Except in the cases hereinafter excepted, culpable homicide is murder, if
the act by which the death is caused is done with the intention of causing death.
302. Punishment for murder.—Whoever commits murder shall be punished with death, or
imprisonment for life, and shall also be liable to fine.
304A. Causing death by negligence.—Whoever causes the death of any person by doing any
rash or negligent act not amounting to culpable homicide, shall be punished with
imprisonment of either description for a term which may extend to two years.
`;

test('sections split on the heading, keeping the number exactly as printed', () => {
  const s = parseSections(IPC);
  assert.deepEqual(
    s.map((x) => x.number),
    ['299', '300', '302', '304A'],
  );
});

test('a suffixed section number is not normalised away', () => {
  // 304A is a different offence from 304. Normalising it would merge two
  // offences with different sentences.
  const s = parseSections(IPC);
  assert.ok(
    s.some((x) => x.number === '304A'),
    '304A was lost or normalised',
  );
});

test('the heading and the text are separated, and neither swallows the other', () => {
  const murder = parseSections(IPC).find((x) => x.number === '302')!;
  assert.equal(murder.heading, 'Punishment for murder');
  assert.match(murder.text, /^Whoever commits murder/);
  assert.doesNotMatch(murder.text, /Causing death by negligence/, 'it ran into the next section');
});

test('it does NOT fire on ordinary numbered prose', () => {
  // The failure that would ruin the corpus quietly. A statute is full of
  // numbered clauses that look like headings to a looser rule.
  const prose = `
302. Punishment for murder.—Whoever commits murder shall be punished with death.
The following applies. (2) Nothing in section 5 shall apply to this case.
1. The accused was present at the scene.
2. The witness deposed otherwise.
`;
  const s = parseSections(prose);
  assert.deepEqual(
    s.map((x) => x.number),
    ['302'],
    'ordinary numbered prose was parsed as sections',
  );
});

test('the table of contents does not double every section', () => {
  // A statute PDF lists each section twice: once in the contents with no body,
  // once in the Act with its text. Keeping both gives every number two rows,
  // and whichever the mapping reads decides whether s.302 has any text at all.
  const withContents = `
SECTIONS
299. Culpable homicide.—
300. Murder.—
302. Punishment for murder.—
${IPC}
`;
  const s = parseSections(withContents);
  const numbers = s.map((x) => x.number);
  assert.equal(new Set(numbers).size, numbers.length, 'a section number appeared twice');
  assert.match(s.find((x) => x.number === '302')!.text, /Whoever commits murder/);
});

test('where a number appears twice, the copy WITH TEXT wins', () => {
  const kept = dropTableOfContents([
    { number: '302', heading: 'Punishment for murder', text: '' },
    {
      number: '302',
      heading: 'Punishment for murder',
      text: 'Whoever commits murder shall be punished with death.',
    },
  ]);
  assert.equal(kept.length, 1);
  assert.match(kept[0]!.text, /Whoever commits murder/);
});

test('an empty section is dropped, not stored empty', () => {
  // An empty section reads as "this section says nothing" downstream, which is
  // a different and false statement from "we do not have this section".
  const kept = dropTableOfContents([{ number: '5', heading: 'Repealed', text: '' }]);
  assert.equal(kept.length, 0);
});

test('page furniture never ends up inside a section', () => {
  const stripped = stripPageFurniture('THE INDIAN PENAL CODE, 1860\n302\nsome text\n');
  assert.doesNotMatch(stripped, /THE INDIAN PENAL CODE/);
  assert.match(stripped, /some text/);
});

test('text before the first heading is discarded, not attached to section 1', () => {
  const withPreamble = `An Act to provide a general Penal Code for India.
WHEREAS it is expedient to provide a general Penal Code for India;
${IPC}`;
  const s = parseSections(withPreamble);
  assert.doesNotMatch(s[0]!.text, /WHEREAS/, 'the preamble was attached to a section');
});

test('nothing parseable returns an empty list, never a guess', () => {
  assert.deepEqual(parseSections('This document contains no sections at all.'), []);
  assert.deepEqual(parseSections(''), []);
});

test('sections order the way a lawyer reads them', () => {
  const ordered = ['303', '302A', '302', '99'].sort(compareSectionNumbers);
  assert.deepEqual(ordered, ['99', '302', '302A', '303']);
});

test('the three handles are the ones verified against India Code', () => {
  // Pinned so a future edit cannot quietly point at a different Act. Each was
  // confirmed on 8 Aug 2026 by the title India Code itself returns.
  const byAct = Object.fromEntries(REPEALED_ACT_HANDLES.map((h) => [h.oldAct, h.handle]));
  assert.equal(byAct['ipc'], '123456789/11091');
  assert.equal(byAct['crpc'], '123456789/4221');
  assert.equal(byAct['evidence'], '123456789/4218');
});

test('the handle that looks right and is not stays recorded', () => {
  // 16225 appears in search results for the CrPC and India Code answers
  // "Invalid URL or Argument(s)". Recorded so nobody tries it twice.
  assert.ok(KNOWN_BAD_HANDLES.includes('123456789/16225'));
  assert.ok(
    !REPEALED_ACT_HANDLES.some((h) => KNOWN_BAD_HANDLES.includes(h.handle as never)),
    'a known-bad handle is in the live list',
  );
});

test('an amendment footnote is not a section, however much it looks like one', () => {
  // The real failure. "1. Subs. by Act 27 of 1870, s. 1, for the original
  // section." matches the heading rule exactly: number, stop, capital, phrase,
  // stop. Only the vocabulary and the ordering separate it.
  assert.equal(looksLikeFootnote('Subs. by Act 27 of 1870, s. 1, for the original section'), true);
  assert.equal(looksLikeFootnote('Ins by Act 8 of 1882, s. 3'), true);
  assert.equal(looksLikeFootnote('The words “British India” omitted'), true);
  assert.equal(looksLikeFootnote('Punishment for murder'), false);
  assert.equal(looksLikeFootnote('Culpable homicide'), false);
});

test('the ascending rule removes descents — but it cannot break a genuine tie', () => {
  /**
   * What `keepAscendingRun` actually guarantees, stated honestly after three
   * attempts to make it guarantee more.
   *
   * It removes headings whose numbers go BACKWARDS, which is what a page of
   * footnote markers looks like when it restarts at 1. It does NOT decide
   * between two ascending runs of the same length — and low-numbered markers
   * appearing early can legitimately prefix the real sequence, so
   * `1, 2, 302, 304` is exactly as long and exactly as ascending as
   * `299, 300, 302, 304`.
   *
   * **That is a limitation, not a bug, and the fix is not here.**
   * `looksLikeFootnote` is the primary defence: real footnotes open with
   * "Subs. by", "Ins. by", "Omitted by". This rule is the second line, and
   * inventing a tie-break to make an artificial test pass would have been
   * fitting the algorithm to the test rather than to the documents.
   */
  const withDescent = [
    { number: '299', heading: 'Culpable homicide', text: 'a'.repeat(50) },
    { number: '300', heading: 'Murder', text: 'b'.repeat(50) },
    { number: '5', heading: 'Marker', text: 'c'.repeat(50) },
    { number: '302', heading: 'Punishment for murder', text: 'd'.repeat(50) },
  ];
  const kept = keepAscendingRun(withDescent).map((s) => s.number);
  assert.deepEqual(kept, ['299', '300', '302'], 'a descent survived');
  assert.ok(!kept.includes('5'), 'the out-of-order marker was kept');
});

test('the ascending rule keeps the LONGEST run, not the first one', () => {
  const s = [
    { number: '500', heading: 'A', text: 'x'.repeat(50) },
    { number: '1', heading: 'B', text: 'x'.repeat(50) },
    { number: '2', heading: 'C', text: 'x'.repeat(50) },
    { number: '3', heading: 'D', text: 'x'.repeat(50) },
  ];
  assert.deepEqual(
    keepAscendingRun(s).map((x) => x.number),
    ['1', '2', '3'],
  );
});

test('an already-ordered Act is unchanged by the ascending rule', () => {
  const s = parseSections(IPC);
  assert.deepEqual(
    s.map((x) => x.number),
    ['299', '300', '302', '304A'],
  );
});
