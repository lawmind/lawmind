import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { neutralCitationFrom } from './hc-load.ts';
import { stripPageFurniture } from './page-furniture.ts';

/**
 * The negative tests are the point of this file.
 *
 * A cleaner that removes furniture is easy; a cleaner that never removes a word
 * the court wrote is the only kind that may run. Every case under "leaves legal
 * text alone" is real text drawn from the corpus that a DRAFT of this module
 * deleted — they are regressions, not hypotheticals.
 */

describe('stripPageFurniture — removes furniture', () => {
  it('removes a Karnataka page-header block from between two halves of a sentence', () => {
    const doc = [
      'Investigating Officer conducted a detailed investigation and',
      '- 3 -',
      'HC-KAR',
      'NC: 2025:KHC-D:8979',
      'CRL.RP No. 100113 of 2021',
      'filed a charge sheet against the accused for the offences',
      'punishable under Sections 279, 337 and 304-A.',
      '- 4 -',
      'HC-KAR',
      'NC: 2025:KHC-D:8979',
      'CRL.RP No. 100113 of 2021',
      'The Trial Court also relied upon the evidence of PW2.',
    ].join('\n');

    const r = stripPageFurniture(doc);
    assert.equal(r.linesRemoved, 8);
    assert.match(r.text, /detailed investigation and\nfiled a charge sheet/);
    assert.equal(/HC-KAR|KHC-D|- 3 -/.test(r.text), false);
  });

  it('removes an e-signature panel', () => {
    const doc = [
      'the said amount was handed over to the petitioner',
      'Signed by: LOKENDRA JAIN',
      'Signing time: 7/31/2023 2:57:58 PM',
      'Signature Not Verified',
      'Location: HIGH COURT OF MADHYA PRADESH',
      'in his favour, and the appeal is allowed.',
    ].join('\n');

    const r = stripPageFurniture(doc);
    assert.equal(r.linesRemoved, 4);
    assert.match(r.text, /handed over to the petitioner\nin his favour/);
  });

  it('removes page rules in both the dash and colon forms, and Page N of M', () => {
    const r = stripPageFurniture(['A', '- 12 -', 'B', ': 4 :', 'C', 'Page 2 of 9', 'D'].join('\n'));
    assert.equal(r.text, 'A\nB\nC\nD');
  });
});

describe('stripPageFurniture — leaves legal text alone', () => {
  it('keeps prose that merely begins "signed by"', () => {
    const line = 'signed by the successful candidate as well as C.W. 2, Jathedar Ram E';
    assert.equal(stripPageFurniture(line).text, line);
  });

  it('keeps prose that merely begins "verification"', () => {
    const line = 'verification of account statement, it was revealed that Rs.11,07,000';
    assert.equal(stripPageFurniture(line).text, line);
  });

  it('keeps prose that merely begins "location"', () => {
    const line = 'location of the disputed property was never established by the plaintiff';
    assert.equal(stripPageFurniture(line).text, line);
  });

  it('keeps a case number that appears ONCE — a reference, not a running header', () => {
    const doc = [
      'The question was considered in',
      'C.S. No.13 of 1958',
      'and answered in the affirmative.',
    ].join('\n');
    assert.equal(stripPageFurniture(doc).text, doc);
    assert.equal(stripPageFurniture(doc).linesRemoved, 0);
  });

  it('removes a case number that repeats — that is what a running header is', () => {
    const doc = [
      'WP No. 58125 of 2017',
      'The petitioner seeks a writ of mandamus.',
      'WP No. 58125 of 2017',
      'The respondent opposes.',
    ].join('\n');
    const r = stripPageFurniture(doc);
    assert.equal(r.linesRemoved, 2);
    assert.equal(r.text, 'The petitioner seeks a writ of mandamus.\nThe respondent opposes.');
  });

  it('keeps a numeric range inside a sentence — the flowed-text regex trap', () => {
    const line = 'Having considered paragraphs 12 - 15 - which deal with limitation - we hold';
    assert.equal(stripPageFurniture(line).text, line);
  });

  it('keeps a citation to another judgment on its own line', () => {
    const line = 'State of Karnataka v. Basavva, (1977) 4 SCC 358';
    assert.equal(stripPageFurniture(line).text, line);
  });

  it('keeps a section reference that resembles a page rule only superficially', () => {
    const line = 'under Section 4, 5, 7 and 12 of the Karnataka Prevention of Slaughter Act';
    assert.equal(stripPageFurniture(line).text, line);
  });

  it('never reports removing a line it did not list', () => {
    const doc = ['- 1 -', 'Some reasoning of the court.', 'Signature Not Verified'].join('\n');
    const r = stripPageFurniture(doc);
    const counted = Object.values(r.removedByRule).reduce((a, b) => a + b, 0);
    assert.equal(counted, r.linesRemoved);
    assert.equal(r.removedLines.length, 2);
  });

  it('is a no-op on a document with no furniture, byte for byte', () => {
    const doc = 'The appeal is allowed.\n\nThe impugned order is set aside.\nNo costs.';
    const r = stripPageFurniture(doc);
    assert.equal(r.text, doc);
    assert.equal(r.linesRemoved, 0);
    assert.equal(r.charsBefore, r.charsAfter);
  });

  it('preserves blank lines, so paragraph segmentation downstream is unchanged', () => {
    const doc = 'First paragraph.\n\n- 5 -\n\nSecond paragraph.';
    assert.equal(stripPageFurniture(doc).text, 'First paragraph.\n\n\nSecond paragraph.');
  });
});

describe('stripPageFurniture — the ordering constraint against neutralCitationFrom', () => {
  /**
   * This is the one way this cleaner can destroy something irreplaceable, and it
   * is not obvious from either file on its own.
   *
   * `neutralCitationFrom` derives `judgments.neutral_citation` by scanning the
   * first 3,000 characters of `full_text` — that stamp is the ONLY place a High
   * Court judgment's own citation appears, and per its own comment it is "the
   * whole reason 2023+ documents are citable at all". This cleaner removes that
   * stamp. Run it before ingest maps the record and a citable judgment silently
   * becomes uncitable, with nothing to recover it from.
   *
   * The test asserts the hazard is REAL rather than asserting it is handled, so
   * that anyone who moves the cleaner earlier in the pipeline fails here.
   */
  const karnatakaHeader = [
    'IN THE HIGH COURT OF KARNATAKA AT BENGALURU',
    '- 1 -',
    'HC-KAR',
    'NC: 2025:KHC:40621',
    'CRL.P No. 12949 of 2025',
    'ORDER',
    'Learned counsel for the petitioner has sought to quash the FIR.',
    '- 2 -',
    'HC-KAR',
    'NC: 2025:KHC:40621',
    'CRL.P No. 12949 of 2025',
    'The petition is dismissed.',
  ].join('\n');

  it('the raw text yields the neutral citation', () => {
    assert.equal(neutralCitationFrom(karnatakaHeader, 2025), '2025:KHC:40621');
  });

  it('the CLEANED text does not — so cleaning must happen after ingest, never before', () => {
    const cleaned = stripPageFurniture(karnatakaHeader).text;
    assert.equal(neutralCitationFrom(cleaned, 2025), null);
  });

  it('cleaning loses no reference to another judgment', () => {
    const withAuthority = [
      'NC: 2025:KHC:40621',
      'The Hon’ble Apex Court in Basavva Kom Dyamangouda Patil v. State of',
      'Mysore, (1977) 4 SCC 358, held as follows.',
      '- 6 -',
      'HC-KAR',
    ].join('\n');
    const cleaned = stripPageFurniture(withAuthority).text;
    assert.match(cleaned, /\(1977\) 4 SCC 358/);
    assert.match(cleaned, /Basavva Kom Dyamangouda Patil/);
  });
});
