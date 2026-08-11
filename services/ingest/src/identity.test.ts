/**
 * `docs/ai/CANONICAL_IDENTITY.md` §4. Pure-function tests — no database, no
 * network, matching `text.test.ts`/`sci.test.ts`'s convention. The two
 * multi-row fixtures below are not invented: they encode real, previously
 * measured corpus findings so the model is asserted against the shapes that
 * actually exist, not just plausible-sounding cases.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { caseIdentity, documentKey, isSameCase, isSameDocument, sourceArtifactKey } from './identity.ts';
import type { IdentityRow } from './identity.ts';

const base: IdentityRow = {
  court: 'Gujarat High Court',
  judgmentDate: '1993-06-01',
  caseNumber: null,
  cnr: null,
  contentHash: null,
  sourceUrl: 'https://example/gujarat/1993/a.pdf',
};

test('documentKey is stable for identical contentHash', () => {
  const a = { ...base, contentHash: 'hash-x' };
  const b = { ...base, contentHash: 'hash-x' };
  assert.equal(documentKey(a), documentKey(b));
});

test('documentKey is distinct for distinct contentHash', () => {
  assert.notEqual(documentKey({ ...base, contentHash: 'hash-x' }), documentKey({ ...base, contentHash: 'hash-y' }));
});

test('documentKey does not throw and returns null when contentHash is not yet computed', () => {
  assert.equal(documentKey({ ...base, contentHash: null }), null);
  assert.equal(documentKey({ ...base, contentHash: undefined }), null);
});

test('caseIdentity: CNR always wins, even when caseNumber is also present', () => {
  const row: IdentityRow = { ...base, cnr: 'GJHC010012341993', caseNumber: 'CR.RA/151/1991' };
  const id = caseIdentity(row);
  assert.equal(id.tier, 'cnr');
  assert.equal(id.key, 'cnr:GJHC010012341993');
});

test('caseIdentity: falls back to (court, caseNumber) when cnr is null', () => {
  const row: IdentityRow = { ...base, cnr: null, caseNumber: 'CR.RA/151/1991' };
  const id = caseIdentity(row);
  assert.equal(id.tier, 'case_number');
  assert.equal(id.key, 'case:Gujarat High Court::CR.RA/151/1991');
});

test('caseIdentity: falls back to the weak (court, date, contentHash) tier when both are null', () => {
  const row: IdentityRow = { ...base, cnr: null, caseNumber: null, contentHash: 'hash-x' };
  const id = caseIdentity(row);
  assert.equal(id.tier, 'weak');
  assert.equal(id.key, 'weak:Gujarat High Court::1993-06-01::hash-x');
});

test('sourceArtifactKey is verbatim source_url', () => {
  assert.equal(sourceArtifactKey({ sourceUrl: 'https://x/y.pdf' }), 'https://x/y.pdf');
});

// --- Fixture 1: the Gujarat/Patna batch-judgment shape ---------------------
// docs/ai/tasks/003-corpus-inventory.md: one consolidated text disposing of
// many distinct case numbers. ONE DOCUMENT, MANY CASES — the exact shape
// CANONICAL_IDENTITY.md §1 names as the reason DOCUMENT and CASE must stay
// separate concepts rather than collapse into a single "identity."
test('one document, many cases: shared contentHash, distinct case numbers — same document, different case', () => {
  const batchText = 'hash-of-327-matter-gujarat-judgment';
  const matterA: IdentityRow = {
    court: 'Gujarat High Court',
    judgmentDate: '1993-06-01',
    caseNumber: 'CR.RA/151/1991',
    cnr: null,
    contentHash: batchText,
    sourceUrl: 'https://example/gujarat/1993/151.pdf',
  };
  const matterB: IdentityRow = {
    ...matterA,
    caseNumber: 'CR.RA/274/1991',
    sourceUrl: 'https://example/gujarat/1993/274.pdf',
  };

  assert.equal(isSameDocument(matterA, matterB), true);
  assert.equal(isSameCase(matterA, matterB), false);
});

// --- Fixture 2: the Supreme Court year-boundary shape -----------------------
// docs/ai/AWS_CORPUS_INVENTORY.md §3: the same judgment served under two
// year-partition URLs, which overstated the SC source count by 5,181 before
// being corrected. ONE CASE, MANY SOURCE_ARTIFACTS.
test('one case, many source artifacts: shared cnr and contentHash, distinct source_url — same case, same document, different artifact', () => {
  const yearBoundaryText = 'hash-of-sr-bommai-style-judgment';
  const underYearA: IdentityRow = {
    court: 'Supreme Court of India',
    judgmentDate: '1994-03-11',
    caseNumber: 'CIVIL APPEAL No. 3645/1989',
    cnr: 'SCIN010019941994',
    contentHash: yearBoundaryText,
    sourceUrl: 'https://example/sc/1993/3645.pdf',
  };
  const underYearB: IdentityRow = {
    ...underYearA,
    sourceUrl: 'https://example/sc/1994/3645.pdf',
  };

  assert.equal(isSameDocument(underYearA, underYearB), true);
  assert.equal(isSameCase(underYearA, underYearB), true);
  assert.notEqual(sourceArtifactKey(underYearA), sourceArtifactKey(underYearB));
});

// --- Negative control --------------------------------------------------------
// Two unrelated same-day, same-court judgments are common (a High Court
// disposes of dozens of cases on one day). Coincidence on (court, date) with
// NO shared contentHash must never present as a case match.
test('negative control: same court and date but different text is NOT the same case', () => {
  const first: IdentityRow = { ...base, contentHash: 'hash-unrelated-1' };
  const second: IdentityRow = { ...base, contentHash: 'hash-unrelated-2' };

  assert.equal(isSameDocument(first, second), false);
  assert.equal(isSameCase(first, second), false);
});

test('negative control: two never-hashed rows are not the same document', () => {
  const first: IdentityRow = { ...base, contentHash: null };
  const second: IdentityRow = { ...base, contentHash: null };
  assert.equal(isSameDocument(first, second), false);
});
