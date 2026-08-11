import { render, screen } from '@testing-library/react-native';

import { CitationFooter } from './CitationFooter';
import type { SearchResult } from '../api/contract';

/**
 * The draft footer is the last thing between a citation and a filing counter.
 *
 * Two rules it must never break: the copy is licence protection rather than an
 * audit of the advocate, and EXPORT IS NEVER BLOCKED.
 */

const clean: SearchResult = {
  judgmentId: 'jdg_clean',
  citationCheckId: null,
  caseTitle: 'Mock Party v. Mock State',
  neutralCitation: 'MOCK 2026 EXAMPLE 1',
  reporterCitations: [],
  court: 'Mock Supreme Court',
  judgmentDate: '2026-01-01',
  holding: 'Fixture holding.',
  operativeParagraph: 'Fixture operative paragraph.',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
  asOf: '2026-08-06T00:00:00.000Z',
};

const unconfirmed: SearchResult = {
  ...clean,
  judgmentId: 'jdg_unconfirmed',
  citationCheckId: null,
  caseTitle: 'Mock Doubtful v. Mock Registrar',
  verificationState: 'unverified',
  verifiedBySource: 'none',
};

const setAside: SearchResult = {
  ...clean,
  judgmentId: 'jdg_set_aside',
  citationCheckId: null,
  caseTitle: 'Mock Overruled v. Mock State',
  overruledStatus: 'set_aside',
};

it('says safe to file when every citation is clean, and never "we verified this"', async () => {
  await render(<CitationFooter citations={[clean, { ...clean, judgmentId: 'b' }]} />);
  expect(screen.getByText('All 2 citations safe to file')).toBeTruthy();
  expect(screen.queryByText(/we verified/i)).toBeNull();
});

it('states the risk rather than a tally', async () => {
  await render(<CitationFooter citations={[clean, unconfirmed]} />);
  expect(screen.getByText('One citation could put you at risk')).toBeTruthy();
  // "1 of 2 citations verified" is the retired framing — an audit of the advocate.
  expect(screen.queryByText(/1 of 2/)).toBeNull();
});

it('names which citation carries the risk', async () => {
  await render(<CitationFooter citations={[clean, unconfirmed]} />);
  expect(
    screen.getByText('Mock Doubtful v. Mock Registrar — we could not confirm this exists')
  ).toBeTruthy();
});

it('counts an overruled citation as a risk even though it is verified', async () => {
  await render(<CitationFooter citations={[clean, setAside]} />);
  expect(screen.getByText('One citation could put you at risk')).toBeTruthy();
});

/** The advocate is a professional. Refusing to export their own document is not ours to do. */
it('never blocks export — it only drops it to secondary', async () => {
  await render(<CitationFooter citations={[clean, unconfirmed]} />);
  expect(screen.getByText('Export anyway')).toBeTruthy();
});
