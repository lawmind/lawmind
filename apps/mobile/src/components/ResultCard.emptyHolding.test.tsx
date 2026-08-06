import { render, screen } from '@testing-library/react-native';

import { ResultCard } from './ResultCard';
import type { SearchResult } from '../api/contract';

/**
 * AN EMPTY HOLDING IS ORDINARY, NOT BROKEN.
 *
 * Most of the real corpus returns `holding: ""` — the two-sentence summary
 * needs a model that is not wired yet. The card must not reach for a
 * placeholder, a skeleton or an apology: all three tell the advocate something
 * failed, and nothing did. The authority is real and every other field is
 * there.
 */

const base: SearchResult = {
  judgmentId: 'jdg_test',
  citationCheckId: null,
  caseTitle: 'Mock Party v. Mock State',
  neutralCitation: 'MOCK 2026 EXAMPLE 1',
  reporterCitations: [],
  court: 'Mock SC · 2026',
  judgmentDate: '2026-01-01',
  holding: '',
  operativeParagraph: '',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
};

it('renders the judgment normally when there is no holding', async () => {
  await render(<ResultCard result={base} />);
  expect(screen.getByText('Mock Party v. Mock State')).toBeTruthy();
  expect(screen.getByText('MOCK 2026 EXAMPLE 1')).toBeTruthy();
  expect(screen.getByText('Mock SC · 2026')).toBeTruthy();
});

it('never fills the gap with an apology, a placeholder or a loading state', async () => {
  await render(<ResultCard result={base} />);
  for (const wrong of [
    'No summary available',
    'No holding',
    'Summary unavailable',
    'Loading',
    'Not available',
    '—',
  ]) {
    expect(screen.queryByText(wrong)).toBeNull();
  }
});

/** And an empty holding is still not a verification problem. */
it('stays silent — a missing summary is not a missing verification', async () => {
  await render(<ResultCard result={base} />);
  expect(screen.queryByText('Do not file this without checking it')).toBeNull();
});
