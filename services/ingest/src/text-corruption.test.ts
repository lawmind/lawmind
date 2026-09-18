/**
 * Every corrupt string below is a REAL document's opening, copied from the
 * corpus during the 12 Aug 2026 measurement — not invented to make the
 * thresholds look good. The `text_quality` score each one currently receives is
 * noted beside it, because that score is the reason this module exists.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MIN_TOKENS_TO_JUDGE, classifyCorruption, corruptionSignals } from './text-corruption.ts';

/** Real, and `text_quality` scores it 1.000. */
const GARBAGE_A =
  'S PP L W S PP L W S PP L 0 W S PP L 0 W V L PPL 7 S / / W V L PPL 77 S PP L W S PP L 0 W V L ' +
  'PPL 7 S W V L PPL 77 S PP L W S PP L 0 W V L PPL 7 S / / W V L PPL 77 S PP L W';

/** Real, `text_quality` 1.000. */
const GARBAGE_B =
  'Megha 501_fa_1558_1996.odt pp lla s sp d s : , : 22 d , 2019 :- b a d s d , d s : , d s p d s ' +
  ': , : 22 d , 2019 :- b a d s d , d s : , d s p d s : , : 22 d , 2019 :- b a d s d';

/** Real judgment text — heavily abbreviated, which is exactly the false-positive risk. */
const REAL_CAUSE_TITLE =
  'IN THE HIGH COURT OF JUDICATURE AT PATNA Criminal Miscellaneous No. 3376 of 2025 Arising Out ' +
  'of PS. Case No. 45 Year 2019 Thana District Patna Sri Ram Kumar S/o Late Ram Bahadur Singh ' +
  'Resident of Village Bhagwanpur PS Phulwari Sharif District Patna versus The State of Bihar ' +
  'Appearance For the Petitioner Mr. Ajay Kumar Advocate For the State Mr. S K Verma APP';

const REAL_PROSE =
  'Heard learned counsel for the petitioner and learned Additional Public Prosecutor for the ' +
  'State. The petitioner apprehends arrest in connection with the aforesaid case instituted ' +
  'for the offences punishable under Sections 341, 323, 379 and 504 of the Indian Penal Code. ' +
  'Having considered the submissions advanced and the nature of the accusation, this Court is ' +
  'inclined to grant anticipatory bail to the petitioner on the conditions stated below.';

/* ------------------------------------------------------------ the failures -- */

test('SHATTERED WORDS ARE CAUGHT — the case text_quality scores 1.000', () => {
  const v = classifyCorruption(GARBAGE_A)!;
  assert.equal(v.corrupt, true);
  assert.match(v.reasons.join(' '), /single letter/);
});

test('a second real garbage document is caught too', () => {
  assert.equal(classifyCorruption(GARBAGE_B)!.corrupt, true);
});

/* ---------------------------------------------------- the false positives -- */

test('AN ABBREVIATION-HEAVY CAUSE TITLE IS NOT CORRUPT', () => {
  // The likeliest false positive in this corpus: initials, S/o, PS, APP.
  const v = classifyCorruption(REAL_CAUSE_TITLE)!;
  assert.equal(v.corrupt, false, v.reasons.join(' · '));
});

test('ordinary judgment prose is not corrupt', () => {
  assert.equal(classifyCorruption(REAL_PROSE)!.corrupt, false);
});

test('Hindi and Devanagari text is not corrupt merely for lacking Latin words', () => {
  // `wordLikeRatio` is Latin-only by construction, so a Devanagari judgment
  // scores 0 on it. It must not be condemned for that — the mean token length
  // is what keeps it safe, and this test pins the behaviour.
  const hindi = Array.from({ length: 60 }, () => 'याचिकाकर्ता अधिवक्ता न्यायालय').join(' ');
  assert.equal(classifyCorruption(hindi)!.corrupt, false);
});

/* ---------------------------------------------------------------- unknown -- */

test('A SHORT DOCUMENT IS UNKNOWN, NEVER CORRUPT', () => {
  // A two-line order is not evidence of anything. UNKNOWN MUST REMAIN UNKNOWN.
  const short = 'Heard. Put up this matter on 15.1.2018. Biswanath Rath, J.';
  const v = classifyCorruption(short)!;
  assert.ok(v.signals.tokens < MIN_TOKENS_TO_JUDGE);
  assert.equal(v.corrupt, false);
  assert.deepEqual(v.reasons, []);
});

test('empty text yields null rather than a verdict about nothing', () => {
  assert.equal(classifyCorruption(''), null);
  assert.equal(corruptionSignals('   '), null);
});

/* ---------------------------------------------------------------- signals -- */

test('the signals separate the two populations by an order of magnitude', () => {
  const bad = corruptionSignals(GARBAGE_A)!;
  const good = corruptionSignals(REAL_PROSE)!;
  assert.ok(bad.singleCharRatio > 0.4, `garbage single-char ${bad.singleCharRatio}`);
  assert.ok(good.singleCharRatio < 0.1, `prose single-char ${good.singleCharRatio}`);
  assert.ok(good.meanTokenLength > bad.meanTokenLength);
});

test('one weak signal alone never condemns a document', () => {
  // Low word-like ratio but healthy token length: an all-caps cause title.
  const caps = Array.from({ length: 60 }, () => 'STATE OF BIHAR VERSUS RAMESH KUMAR SINGH').join(
    ' ',
  );
  const v = classifyCorruption(caps)!;
  assert.ok(v.signals.wordLikeRatio < 0.2, 'expected a low word-like ratio for all caps');
  assert.equal(v.corrupt, false, 'all-caps text was condemned on one signal');
});

/* ------------------------------------- the SECOND corruption shape (bus 0167) -- */

/**
 * NEW2 found 51 Gujarat and 1 Telangana documents carrying the same font-cmap
 * defect as Bombay that `classifyCorruption` passed as clean. Bombay SHATTERS
 * words; this shape DROPS LEADING CHARACTERS, leaving word-shaped remnants that
 * every shape-based signal reads as prose. Measured on a real document:
 * single-char 0.009, word-like 0.312, mean length 5.2 — all three say clean.
 */
const LEADING_DROP =
  'PLICATION NO. 19966 of 2021 filed by the etitioner against the nion of ndia and the ' +
  'tate of ujarat. The ourt has heard learned counsel for the etitioner and the espondent. '.repeat(
    6,
  );
const LEADING_DROP_CLEAN =
  'APPLICATION NO. 19966 of 2021 filed by the Petitioner against the Union of India and the ' +
  'State of Gujarat. The Court has heard learned counsel for the Petitioner and the Respondent. '.repeat(
    6,
  );

test('LEADING-CHARACTER DROP IS CAUGHT, though every shape signal says clean', () => {
  const v = classifyCorruption(LEADING_DROP)!;
  assert.equal(v.corrupt, true, 'the second corruption shape passed as clean');
  assert.match(v.reasons.join(' '), /first character missing/);
  // The point: the shape signals genuinely do not see it.
  assert.ok(v.signals.singleCharRatio < 0.1, 'single-char ratio should look clean here');
});

test('...and the SAME TEXT spelled correctly is not condemned', () => {
  const v = classifyCorruption(LEADING_DROP_CLEAN)!;
  assert.equal(v.corrupt, false, v.reasons.join(' · '));
  assert.equal(v.signals.truncatedShare, 0);
});

test('the probe ratio needs enough sightings to be a rate at all', () => {
  // One stray "tate" in an otherwise clean document is a typo, not corruption.
  const text = `${LEADING_DROP_CLEAN} An isolated tate appears once here.`;
  assert.equal(classifyCorruption(text)!.corrupt, false);
});

test('a document with no probe words yields a null share, never a false alarm', () => {
  const devanagari = Array.from({ length: 60 }, () => 'याचिकाकर्ता अधिवक्ता न्यायालय').join(' ');
  const v = classifyCorruption(devanagari)!;
  assert.equal(v.signals.truncatedShare, null);
  assert.equal(v.corrupt, false);
});
