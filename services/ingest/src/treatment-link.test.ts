/**
 * Every fixture here is verbatim corpus text taken from the citing judgment
 * named beside it, and every assertion is a refusal this pass must keep making.
 * The two REJECT cases are live defects NEW3 found (`TREATMENT_MANIFEST_V1.md`
 * §0, bus 0718): resolving them "successfully" would put a self-doubting edge
 * on a judgment that is good law.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { citationKey, harvestPairings, nameAgrees, yearAgrees } from './treatment-link.ts';

/** MADA v. SAIL (2024 INSC 554) — the row that renders dead law as live today. */
const MADA =
  'State of Orissa v. Mahanadi Coalfields Ltd. [1995] 3 SCR 639 : (1995) Supp 2 SCC 686; ' +
  'P Kannadasan v. State of Tamil Nadu [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670 – overruled. ' +
  'Banarsi Dass Chadha v. Lt Governor, Delhi Administration [1979] 1 SCR 271 : (1978) 4 SCC 11;';

/** Aligarh Muslim University v. Naresh Agarwal (2024) — the AIR pairing form. */
const AMU =
  'Case Law Cited In the judgment of Dr. D.Y. Chandrachud, CJI: ' +
  'S Azeez Basha v. Union of India [1968] 1 SCR 833 : AIR 1968 SC 662 – overruled. ' +
  'Prof. Yashpal v. State of Chhattisgarh [2005] 2 SCR 23 : (2005) 5 SCC 420 – held inapplicable.';

/** State of U.P. v. Lalta Prasad Vaish (2024) — a running header sits INSIDE the list. */
const LALTA =
  'Case Law Cited In the Judgment of Dr Dhananjaya Y Chandrachud, CJI. ' +
  'Synthetics and Chemicals Ltd. v. State of UP [1989] Supp. 1 SCR 623 : (1990) 1 SCC 109 – overruled. ' +
  'State of Madras v. Gannon Dunkerley [1959] 1 SCR 379 : 1959 SCR 379 – followed.';

const bySccKey = (text: string, key: string) =>
  harvestPairings(text).find((p) => citationKey(p.alt) === key);

describe('harvestPairings', () => {
  it('reads the SCR↔SCC pairing the bench printed, with the name in front of it', () => {
    const p = bySccKey(MADA, '19965SCC670');
    assert.ok(p, '(1996) 5 SCC 670 pairing not found in MADA');
    assert.equal(citationKey(p.scr), '1996SUPP4SCR92');
    assert.match(p.name, /Kannadasan/);
    assert.equal(p.scrYear, 1996);
  });

  it('reads the AIR pairing form, which the SCC-only regexes could not', () => {
    const p = bySccKey(AMU, 'AIR1968SC662');
    assert.ok(p, 'AIR 1968 SC 662 pairing not found in AMU');
    assert.equal(citationKey(p.scr), '19681SCR833');
    assert.equal(p.altForm, 'AIR');
    assert.match(p.name, /Azeez Basha/);
  });

  it('does not need a recognised disposition marker — the pairing stands on its own', () => {
    const noMarker = 'Synthetics and Chemicals Ltd. v. State of UP [1989] Supp. 1 SCR 623 : (1990) 1 SCC 109';
    const p = bySccKey(noMarker, '19901SCC109');
    assert.ok(p, 'pairing outside any disposition group must still be harvested');
    assert.equal(citationKey(p.scr), '1989SUPP1SCR623');
  });

  /**
   * The defect that refused P. Kannadasan on the first live run. PDF extraction
   * wraps mid-name; treating the wrap as an entry separator returned `Nadu` as
   * the printed name, which scored 0.33 against the target's title.
   */
  it('a name wrapped across a line is read whole, not from the wrap onward', () => {
    const wrapped =
      'State of Orissa v. Mahanadi Coalfields Ltd. [1995] 3 SCR 639 : (1995) Supp 2 SCC 686; ' +
      'P Kannadasan v. State of Tamil\nNadu [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670 – overruled.';
    const p = bySccKey(wrapped, '19965SCC670');
    assert.ok(p);
    assert.equal(p.name, 'P Kannadasan v. State of Tamil Nadu');
    assert.equal(nameAgrees(p.name, 'P. KANNADASAN ETC. ETC. versus STATE OF TAMIL NADU AND ORS. ETC. ETC.').agrees, true);
  });

  it('a citation wrapped across a line still resolves to one key', () => {
    const wrapped = 'Ram Kumar v. State [1989] Supp. 1 SCR\n623 : (1990) 1 SCC 109';
    const p = bySccKey(wrapped, '19901SCC109');
    assert.ok(p);
    assert.equal(citationKey(p.scr), '1989SUPP1SCR623');
  });

  /**
   * The verbatim *Lalta Prasad Vaish* list, end to end: the pairing is read, the
   * bench line in front of it does not defeat the name guard, and the entry that
   * prints `1959 SCR 379` twice with no colon-joined SCC form yields no pairing.
   */
  it('reads Lalta Prasad Vaish whole — one pairing, and the unpaired entry beside it is ignored', () => {
    const pairings = harvestPairings(LALTA);
    assert.equal(pairings.length, 1, 'Gannon Dunkerley prints no SCR:SCC pair and must not produce one');
    const p = pairings[0]!;
    assert.equal(citationKey(p.alt), '19901SCC109');
    assert.equal(citationKey(p.scr), '1989SUPP1SCR623');
    assert.equal(
      nameAgrees(p.name, 'SYNTHETICS & CHEMICALS LTD. ETC. versus STATE OF U.P. AND ORS.').agrees,
      true,
    );
  });

  it('never pairs two citations that merely sit near each other', () => {
    const proximity = 'Lisie Medical Institutions v. State of Kerala (2017) 14 SCC 533 [2017] 8 SCR 900';
    assert.equal(harvestPairings(proximity).length, 0);
  });

  it('a (supra) backreference produces no pairing — bus 0718, the misattribution class', () => {
    const caritas =
      'the Apex Court in Lisie Medical Institutions v. State of Kerala [(2017) 14 SCC 533] ' +
      'doubted the correctness of certain observations contained in S.H. Medical Centre Hospital (supra)';
    assert.equal(harvestPairings(caritas).length, 0);
  });

  it('strips the running header that would read volume 1574', () => {
    const withHeader =
      'Jindal Stainless Steel v. State of Haryana [2016] 10 SCR 1 : (2017) 1574 [2024] 7 S.C.R.Digital Supreme Court Reports 12 SCC 1';
    const p = harvestPairings(withHeader)[0];
    assert.ok(p);
    assert.equal(citationKey(p.alt), '201712SCC1');
  });
});

describe('citationKey', () => {
  it('S.C.R. and SCR produce one key — the corpus prints one and the bench the other', () => {
    assert.equal(citationKey('[1996] SUPP. 4 S.C.R. 92'), citationKey('[1996] Supp. 4 SCR 92'));
  });
});

describe('nameAgrees', () => {
  it('agrees across ETC/versus/ORS furniture in a corpus title', () => {
    const v = nameAgrees(
      'P Kannadasan v. State of Tamil Nadu',
      'P. KANNADASAN ETC. ETC. versus STATE OF TAMIL NADU AND ORS. ETC. ETC.',
    );
    assert.equal(v.agrees, true);
  });

  /**
   * The bench line the reports print immediately before a Case Law list lands
   * inside the name window with no punctuation this parser cuts on. Under the
   * first version — token Jaccard — those eight extra tokens scored *Synthetics
   * and Chemicals* at 0.18 against a title whose every distinctive token was
   * present, and a correct link refused itself.
   */
  it('a bench line in front of the name does not defeat the guard', () => {
    const printed =
      'e Law Cited In the Judgment of Dr Dhananjaya Y Chandrachud, CJI. Synthetics and Chemicals Ltd. v. State of UP';
    const v = nameAgrees(printed, 'SYNTHETICS & CHEMICALS LTD. ETC. versus STATE OF U.P. AND ORS.');
    assert.equal(v.agrees, true);
    assert.ok(v.jaccard < 0.34, 'and it agrees DESPITE a Jaccard that would have refused it');
  });

  it('one shared word is never enough, however clean the name looks', () => {
    const v = nameAgrees('Kannadasan v. State of Kerala', 'P. KANNADASAN versus STATE OF TAMIL NADU AND ORS.');
    assert.equal(v.agrees, false, 'KANNADASAN alone leaves TAMIL and NADU unaccounted for');
  });

  /**
   * *V Revathi v. Union of India* tokenises to a single distinctive word — the
   * rest are stopwords. A flat floor of two shared tokens refused a printed name
   * that matched the target's title exactly, at Jaccard 1.00.
   */
  it('a title whose distinctive part is one word can still agree', () => {
    const v = nameAgrees('V. Revathi v. Union of India and others', 'V REVATHI versus UNION OF INDIA & ORS.');
    assert.equal(v.agrees, true);
    assert.equal(v.sharedTokens, 1);
  });

  it('refuses two unrelated cases that share only stopwords', () => {
    const v = nameAgrees('State of Punjab v. Union of India', 'STATE OF KERALA versus UNION OF INDIA AND ORS.');
    assert.equal(v.agrees, false, 'stopword-only overlap must not agree');
  });
});

describe('yearAgrees', () => {
  it('accepts the report year and one year of reporting lag', () => {
    assert.equal(yearAgrees(1996, '1996-07-26'), true);
    assert.equal(yearAgrees(1968, '1967-10-20'), true);
  });

  it('refuses a judgment decided AFTER the report that carries it', () => {
    assert.equal(yearAgrees(1996, '1997-01-10'), false);
    assert.equal(yearAgrees(1996, '1994-01-10'), false);
  });
});
