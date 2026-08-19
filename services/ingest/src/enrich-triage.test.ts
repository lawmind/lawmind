/**
 * A DIAGNOSTIC THAT MIS-ATTRIBUTES IS WORSE THAN NO DIAGNOSTIC, because it
 * sends a real defect to the wrong lane and closes the question. So the tests
 * that matter here are the ones asserting the ladder does NOT reach for a
 * forgiving explanation: a fabricated quote must not be excused as page
 * furniture, and a dropped clause of the court's own reasoning must not be
 * laundered into an ingest ticket.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  diagnose,
  divergence,
  flatten,
  longestMatch,
  looksLikePageFurniture,
  reconstructWithSkips,
  substitutionAlign,
} from './enrich-triage.ts';

const SOURCE = `IN THE HIGH COURT OF KARNATAKA AT BENGALURU
Writ Petition No. 39444 of 2025

1. Against the order passed by the Customs Department, the petitioner had
filed an appeal
- 6 - HC-KAR NC: 2026:KHC:23440 WP No. 39444 of 2025
which also culminated in an order dated 30.12.2025, which was remanded for
de novo adjudication by the appellate authority.

2. The accused sent Ext.P6 reply raising false and untenable contentions,
and the complainant thereafter instituted proceedings under Section 138 of
the Negotiable Instruments Act, 1881.`;

const d = (quote: string, source = SOURCE, excerpt = source) =>
  diagnose({ quote, sourceText: source, excerpt, minEvidenceChars: 12 });

test('an exactly-quoted span is not something this module is asked about', () => {
  /* The caller only sends REJECTED claims. Handing it a passing one is a caller
   * bug, and it must not silently invent a content bucket for it. */
  const got = d('which also culminated in an order dated 30.12.2025');
  assert.equal(got.bucket, 'verifier_min_length');
});

test('a quote interrupted only by a page header is the INGEST lane, not the model', () => {
  const got = d('the petitioner had filed an appeal which also culminated in an order dated 30.12.2025');
  assert.equal(got.bucket, 'source_page_furniture');
});

test('a quote that skips the court’s own words is the MODEL, not page furniture', () => {
  /* Same shape as above — a gap in the middle — but the gap is real legal text.
   * If this ever returns source_page_furniture the detector has started
   * laundering omissions. */
  const got = d('The accused sent Ext.P6 reply raising false and untenable contentions, and the complainant thereafter instituted proceedings under Section 138 of the Negotiable Instruments Act');
  assert.notEqual(got.bucket, 'source_page_furniture');
});

test('a fabricated sentence is never explained away by any rung of the ladder', () => {
  const got = d('The Court held that the appellant was entitled to compensation of Rs. 15,00,000 with interest at 12% per annum');
  assert.ok(
    got.bucket === 'fabrication' || got.bucket === 'paraphrase',
    `fabrication was bucketed as ${got.bucket}`,
  );
});

test('a real span from a DIFFERENT document is not rescued by the skip walker', () => {
  const other = 'The appellant was convicted under Section 302 of the Indian Penal Code and sentenced to imprisonment for life by the Sessions Judge, Gwalior.';
  const got = d(other);
  assert.ok(got.bucket === 'fabrication' || got.bucket === 'paraphrase');
});

test('case is separated from punctuation, because they have different fixes', () => {
  assert.equal(d('THE ACCUSED SENT EXT.P6 REPLY RAISING FALSE AND UNTENABLE CONTENTIONS').bucket, 'case_only');
  assert.equal(
    d('the petitioner had filed an appeal — which also culminated', 'the petitioner had filed an appeal - which also culminated').bucket,
    'punctuation_only',
  );
});

test('a span the verifier refused only for length is named as the verifier’s rule', () => {
  assert.equal(d('appeal').bucket, 'verifier_min_length');
});

test('a quote that exists only in the excerpt proves the elision join', () => {
  const source = `${'A'.repeat(40)} the first half of a sentence ${'B'.repeat(40)} and the second half of it ${'C'.repeat(40)}`;
  const excerpt = 'the first half of a sentence and the second half of it';
  const got = diagnose({ quote: excerpt, sourceText: source, excerpt, minEvidenceChars: 12 });
  assert.equal(got.bucket, 'elision_boundary');
});

test('page furniture is recognised, running prose is not', () => {
  assert.ok(looksLikePageFurniture('- 6 - HC-KAR NC: 2026:KHC:23440 WP No. 39444 of 2025'));
  assert.ok(looksLikePageFurniture('Crl. Appeal No. 547 & batch : 7 :'));
  assert.ok(looksLikePageFurniture('Signed by: LOKENDRA JAIN Signing time: 7/31/2023 2:57:58 PM Signature Not Verified 3 Second Appeal No. 176/2023'));
  assert.ok(!looksLikePageFurniture('the learned counsel for the appellant impeached the finding of the trial court on appreciation of evidence'));
  /* No digits at all: not a page rule, not a stamp, not a case number. */
  assert.ok(!looksLikePageFurniture('and the same was registered against the petitioner'));
});

test('a substitution run at the end of a quote is refused, not counted as a typo', () => {
  /* This is the defect the first version shipped: a 5% budget absorbed the last
   * six characters of a quote that had run into a page header, and reported it
   * as an OCR substitution. */
  const source = 'the plaintiff has preferred Regular Appeal in RA.No.24 of 1993 on the file of First Appellate - 10 - HC-KAR';
  const quote = 'the plaintiff has preferred Regular Appeal in RA.No.24 of 1993 on the file of First Appellate Court.';
  assert.equal(substitutionAlign(quote, source).ok, false);
});

test('an isolated one-character OCR confusion IS a substitution', () => {
  const source = 'a charge sheet was Ied against accused on 24.07.2019, on the file of the Magistrate';
  const quote = 'a charge sheet was led against accused on 24.07.2019, on the file of the Magistrate';
  const got = substitutionAlign(quote, source);
  assert.equal(got.ok, true);
  assert.equal(got.diffs.length, 1);
  assert.equal(got.diffs[0]?.sourceChar, 'I');
});

test('the skip walker refuses a gap it cannot resume from', () => {
  const got = reconstructWithSkips('alpha beta gamma delta', 'alpha beta and nothing else at all');
  assert.equal(got.ok, false);
});

test('divergence reports where the two texts parted, not merely that they did', () => {
  const got = divergence('the petitioner had filed an appeal which also culminated', SOURCE);
  assert.ok(got.at >= 30);
  assert.ok(got.sourceNext.startsWith('- 6 -'));
});

test('longestMatch measures shared text without claiming an alignment', () => {
  /* Not zero — two English strings always share a letter. The bucket only ever
   * asks whether a LONG passage is shared, so a handful of characters is noise. */
  assert.ok(longestMatch('nothing here at all whatsoever', 'completely different text') <= 4);
  /* Flattened, because `longestMatch` takes the caller's normalisation as given
   * — `diagnose` flattens before it gets here and the raw text has a PDF line
   * break in the middle of this very phrase. */
  assert.ok(longestMatch('the petitioner had filed an appeal', flatten(SOURCE)) >= 30);
});
