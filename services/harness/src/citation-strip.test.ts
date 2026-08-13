import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stripResidualCitations } from './citation-strip.ts';

test('strips a genuine SCC citation', () => {
  const out = stripResidualCitations('this Court in State of Punjab v. Baldev Singh, (1999) 6 SCC 172 held that');
  assert.equal(out.includes('SCC'), false);
  assert.equal(out.includes('State of Punjab v. Baldev Singh'), true);
});

test('strips a genuine AIR citation', () => {
  const out = stripResidualCitations('as held in Kesavananda Bharati, AIR 1973 SC 1461, the basic structure');
  assert.equal(out.includes('AIR'), false);
  assert.equal(out.includes('the basic structure'), true);
});

test('strips a genuine SCR citation, year-first house style', () => {
  const out = stripResidualCitations('this principle, 1976 (1) SCR 906, was affirmed');
  assert.equal(out.includes('SCR'), false);
});

test('strips a genuine neutral INSC citation', () => {
  const out = stripResidualCitations('the nine-judge bench in MADA v. SAIL, 2024 INSC 554, overruled');
  assert.equal(out.includes('INSC'), false);
});

test('strips a genuine High Court neutral citation', () => {
  const out = stripResidualCitations('reported at 2023:DHC:2720, the Delhi High Court held');
  assert.equal(out.includes('DHC'), false);
});

test('strips two distinct citations in one passage', () => {
  const out = stripResidualCitations('following (1999) 6 SCC 172 and distinguishing AIR 1973 SC 1461 on facts');
  assert.equal(out.includes('SCC'), false);
  assert.equal(out.includes('AIR'), false);
});

test('strips a repeated occurrence of the same citation', () => {
  const out = stripResidualCitations('as in (1999) 6 SCC 172, and again (1999) 6 SCC 172 confirms');
  assert.equal(out.includes('SCC'), false);
});

// ─────────────────────────────────────────────────────────────────────────
// ADVERSARIAL — Q1.45 step 5: must NOT remove legitimate legal terms that
// merely resemble a citation. Every case here is a real shape this
// benchmark's queries actually carry (build-queries.ts's own query style).
// ─────────────────────────────────────────────────────────────────────────

test('does NOT strip a bare section reference', () => {
  const q = 'the power conferred by Section 302 of the Code cannot be exercised';
  assert.equal(stripResidualCitations(q), q);
});

test('does NOT strip an Article reference', () => {
  const q = 'Article 21 of the Constitution guarantees personal liberty to every person';
  assert.equal(stripResidualCitations(q), q);
});

test('does NOT strip a statute short-form with a number', () => {
  const q = 'under Section 103 BNS the offence is made out on these facts alone';
  assert.equal(stripResidualCitations(q), q);
});

test('does NOT strip a bare year mentioned in prose', () => {
  const q = 'the amendment made in 1985 changed the position of law considerably for everyone';
  assert.equal(stripResidualCitations(q), q);
});

test('does NOT strip a case name with "versus" but no citation', () => {
  const q = 'the ratio in State of Punjab versus Baldev Singh applies squarely to this case';
  assert.equal(stripResidualCitations(q), q);
});

test('does NOT strip a paragraph or clause number', () => {
  const q = 'as this Court held in paragraph 47 of the judgment, the test is objective';
  assert.equal(stripResidualCitations(q), q);
});

test('does NOT strip a plain page or serial number sequence', () => {
  const q = 'reported at page 906 of the volume, the observation reads as follows for the record';
  assert.equal(stripResidualCitations(q), q);
});

test('does NOT strip a bench-strength or judge count', () => {
  const q = 'a nine judge bench of this Court considered the question in 2024 and answered it';
  assert.equal(stripResidualCitations(q), q);
});

// ─────────────────────────────────────────────────────────────────────────
// Structural
// ─────────────────────────────────────────────────────────────────────────

test('no-op on a query with no citation span -- exact identity, not approximate', () => {
  const q = 'the question is whether the accused had the requisite mens rea at the time of the act';
  assert.equal(stripResidualCitations(q), q);
});

test('collapses whitespace left behind by a removed citation', () => {
  const out = stripResidualCitations('the ruling in (1999) 6 SCC 172 settled the point conclusively');
  assert.equal(/\s{2,}/.test(out), false);
  assert.equal(out.startsWith(' '), false);
  assert.equal(out.endsWith(' '), false);
});
