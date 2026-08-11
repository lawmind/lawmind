/**
 * Every fixture is a real string from the corpus.
 *
 * The asymmetry that shapes this file: a MISSED treatment leaves a citation
 * recorded as `cites`, which is what it already is — no harm done. A WRONG
 * treatment writes `set_aside` onto a judgment, which raises the LAW MOVED mark
 * and disables add-to-matter. **That tells an advocate a good authority is
 * dead.** So the false-positive tests outnumber the happy path deliberately.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readReferenceTableEntry, readTreatment } from './treatment.ts';

/* ────────────────────────────── the real headnote forms ── */

test('a plain overruling', () => {
  const t = readTreatment(
    '[1990] 2 SCR 63',
    'Raj Kumar Karwal v. Union of India (1990) 2 SCC 409: [1990] 2 SCR 63 – overruled. State of Punjab',
  );
  assert.equal(t?.relationship, 'overruled');
  assert.equal(t?.overruled, 'set_aside');
});

test('PARTLY overruled is not overruled — the order of the rules decides this', () => {
  // If `overruled` were tested first, every partial overruling would be recorded
  // as total, telling an advocate a judgment is entirely dead when parts of it
  // still bind.
  const t = readTreatment(
    '[2008] 13 SCR 508',
    'Tukaram Maruti Chavan v. Maruti Narayan Chavan (2008) 9 SCC 358 : [2008] 13 SCR 508 – partly overruled.',
  );
  assert.equal(t?.relationship, 'overruled_in_part');
  assert.equal(t?.overruled, 'partly_set_aside');
});

test('"overruled to an extent" is also partial', () => {
  const t = readTreatment(
    '[2019] 5 SCR 579',
    'Garware Wall Ropes Ltd. v. Coastal Marine (2019) 9 SCC 209 : [2019] 5 SCR 579 – overruled to an extent',
  );
  assert.equal(t?.overruled, 'partly_set_aside');
});

test('an overruling stated in the negative — "Not correct law"', () => {
  const t = readTreatment(
    '(2007) 12 SCR 724',
    'New India Assurance Co. Ltd. v. Prabhu Lal (2008) 1 SCC 696 : (2007) 12 SCR 724 - Not correct law.',
  );
  assert.equal(t?.relationship, 'overruled');
  assert.equal(t?.overruled, 'set_aside');
});

test('"held not good law" is an overruling', () => {
  const t = readTreatment(
    '(2017) 6 SCC 751',
    'Government (NCT of Delhi) vs. Manav Dharam Trust and Anr., (2017) 6 SCC 751– held not good law.',
  );
  assert.equal(t?.overruled, 'set_aside');
});

/* ──────────────────────────── THE NEGATION TRAP ── */

test('"HELD NOT PER INCURIAM" MEANS THE CASE STANDS — the trap, and it is real', () => {
  /**
   * Verbatim from the corpus. A keyword matcher reads "per incuriam" here and
   * flags a judgment that was EXPRESSLY UPHELD. Since `set_aside` disables
   * add-to-matter, that error refuses an advocate an authority a court just
   * confirmed.
   */
  const t = readTreatment(
    '[2005] 2 SCR 954',
    'State of West Bengal v. Purvi Communication Pvt. Ltd. [2005] 2 SCR 954 : (2005) 3 SCC 711 – held not per incuriam.',
  );
  assert.equal(t?.overruled, null, 'an expressly upheld judgment was marked as disturbed');
  assert.equal(t?.relationship, 'cites');
});

test('"not overruled" likewise leaves the authority standing', () => {
  const t = readTreatment('[1990] 2 SCR 63', '[1990] 2 SCR 63 – not overruled.');
  assert.equal(t?.overruled, null);
});

test('per incuriam ALONE is doubted, not set aside', () => {
  // A criticism by a later bench, not a formal overruling. Recording it as
  // set_aside would disable add-to-matter for an authority that may still be
  // argued — overstating what the court did.
  const t = readTreatment('[2016] 2 SCR 1074', '[2016] 2 SCR 1074 – held per incuriam.');
  assert.equal(t?.overruled, 'doubted');
  assert.equal(t?.relationship, 'doubted');
});

/* ─────────────────────── what must NOT be read as treatment ── */

test('ORDINARY PROSE CONTAINING "OVERRULING" IS NOT A TREATMENT', () => {
  /**
   * Verbatim from the corpus: "the Collector of Bombay, overruling the objection
   * of the Corporation, assessed the new site…". A judge overruling an
   * objection is not a court overruling a precedent, and the separator
   * requirement is what keeps them apart.
   */
  const t = readTreatment(
    '[1964] 6 S.C.R. 984',
    '[1964] 6 S.C.R. 984 in 50 years. The Collector of Bombay, overruling the objection of the Corporation',
  );
  assert.equal(t, null, 'prose about overruling an objection was read as a citator entry');
});

test('the NEXT authority’s treatment is not borrowed by this one', () => {
  // A list of authorities where one is referred to and the next is overruled.
  // Reading past the clause end would mark the wrong judgment as dead.
  const t = readTreatment(
    '[1996] 1 SCR 683',
    '[1996] 1 SCR 683 ; Sneh Prabha v. State of U.P. (1996) 7 SCC 426 – overruled.',
  );
  assert.equal(t, null);
});

test('a following case NAME also ends the clause', () => {
  const t = readTreatment(
    '[1975] 3 SCR 220',
    '[1975] 3 SCR 220 – relied on. Anant Mills v. State overruled',
  );
  assert.equal(t?.relationship, 'followed', 'the treatment on THIS authority is "relied on"');
  assert.equal(t?.overruled, null);
});

test('a bare reference is no treatment at all', () => {
  assert.equal(readTreatment('[1973] 2 SCR 417', '[1973] 2 SCR 417 referred to Para 47'), null);
});

test('a citation that is not in the text returns null rather than guessing', () => {
  assert.equal(readTreatment('[1999] 1 SCR 1', 'some other text entirely'), null);
});

/* ─────────────── treatments that leave the authority standing ── */

test('followed, relied on, approved and distinguished are treatments with NO overruled effect', () => {
  for (const [text, rel] of [
    ['[1975] 3 SCR 220 – relied on.', 'followed'],
    ['[1975] 3 SCR 220 – followed.', 'followed'],
    ['[1975] 3 SCR 220 – distinguished.', 'distinguished'],
    // Its own relationship, not folded into `followed` — Stage 7,
    // docs/ai/CITATION_GRAPH_STAGE7.md.
    ['[1975] 3 SCR 220 – approved.', 'approved'],
  ] as const) {
    const t = readTreatment('[1975] 3 SCR 220', text);
    assert.equal(t?.relationship, rel, `wrong relationship for: ${text}`);
    assert.equal(t?.overruled, null, `${text} must not disturb the authority`);
  }
});

/* ──────────────────────── the SCR reference table ── */

test('the reference table form — treatment then a paragraph pinpoint', () => {
  const t = readReferenceTableEntry('[2002] 1 SCR 845 partly overruled Para 23');
  assert.equal(t?.relationship, 'overruled_in_part');
  assert.equal(t?.overruled, 'partly_set_aside');
});

test('the table form handles per incuriam and its negation', () => {
  assert.equal(readReferenceTableEntry('[2016] 2 SCR 1074 held per incuriam Para 19')?.overruled, 'doubted');
  assert.equal(readReferenceTableEntry('[2005] 2 SCR 954 held not per incuriam Para 8')?.overruled, null);
});

test('a table row with no paragraph pinpoint is NOT a table row', () => {
  // The pinpoint is what identifies the shape. Without it this is prose, and
  // the looser rule that would accept it is the whole risk.
  assert.equal(readReferenceTableEntry('[2002] 1 SCR 845 partly overruled'), null);
});

test('a referred-to table row carries no overruled effect', () => {
  const t = readReferenceTableEntry('[1987] 2 SCR 398 referred to Para 6');
  assert.equal(t, null, 'a bare reference is not a treatment');
});
