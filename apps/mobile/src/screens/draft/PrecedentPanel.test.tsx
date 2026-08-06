import { render, screen } from '@testing-library/react-native';

import { PrecedentPanel } from './PrecedentPanel';
import type { SearchResult } from '../../api/contract';

/**
 * THE RULE UNDER TEST: a suggestion can never introduce an unverified citation,
 * and never proposes an authority that has been set aside.
 *
 * This is not a rendering test. It pins the one behaviour that separates a
 * suggestion panel from a liability: everywhere else the product SHOWS an
 * unverified or overruled authority because the advocate asked for it. Here we
 * are the ones proposing, and proposing law that does not stand is different in
 * kind from displaying it.
 */

const base: SearchResult = {
  judgmentId: 'j1',
  citationCheckId: null,
  caseTitle: 'Mock Verified v. State',
  neutralCitation: 'MOCK 2026 EXAMPLE 1',
  reporterCitations: [],
  court: 'Mock SC',
  judgmentDate: '2026-01-01',
  holding: '',
  operativeParagraph: '',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
};

const make = (over: Partial<SearchResult>): SearchResult => ({ ...base, ...over });

describe('PrecedentPanel', () => {
  it('offers a verified authority that is still good law', async () => {
    await render(<PrecedentPanel onInsert={() => {}} suggestions={[base]} />);
    expect(screen.getByText('Mock Verified v. State')).toBeTruthy();
  });

  it('never offers an unverified authority', async () => {
    await render(
      <PrecedentPanel
        onInsert={() => {}}
        suggestions={[
          make({
            judgmentId: 'j2',
            citationCheckId: null,
            caseTitle: 'Mock Unverified v. State',
            verificationState: 'unverified',
          }),
        ]}
      />
    );
    expect(screen.queryByText('Mock Unverified v. State')).toBeNull();
  });

  it('never offers an authority whose check could not run', async () => {
    await render(
      <PrecedentPanel
        onInsert={() => {}}
        suggestions={[
          make({
            judgmentId: 'j3',
            citationCheckId: null,
            caseTitle: 'Mock Failed v. State',
            verificationState: 'failed',
          }),
        ]}
      />
    );
    expect(screen.queryByText('Mock Failed v. State')).toBeNull();
  });

  it('never offers a set-aside authority, even though it is verified', async () => {
    await render(
      <PrecedentPanel
        onInsert={() => {}}
        suggestions={[
          make({
            judgmentId: 'j4',
            citationCheckId: null,
            caseTitle: 'Mock SetAside v. State',
            overruledStatus: 'set_aside',
          }),
        ]}
      />
    );
    expect(screen.queryByText('Mock SetAside v. State')).toBeNull();
  });

  it('offers a doubted authority — it is still binding — but says so', async () => {
    await render(
      <PrecedentPanel
        onInsert={() => {}}
        suggestions={[
          make({ judgmentId: 'j5', caseTitle: 'Mock Doubted v. State', overruledStatus: 'doubted' }),
        ]}
      />
    );
    expect(screen.getByText('Mock Doubted v. State')).toBeTruthy();
    expect(screen.getByText('This judgment has been doubted.')).toBeTruthy();
  });

  it('renders nothing at all when no suggestion survives the filter', async () => {
    await render(
      <PrecedentPanel onInsert={() => {}} suggestions={[make({ verificationState: 'unverified' })]} />
    );
    expect(screen.toJSON()).toBeNull();
  });
});
