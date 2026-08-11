import { fireEvent, render, screen } from '@testing-library/react-native';

import { PrecedentPanel } from './PrecedentPanel';
import { NO_CITATION_MARK } from '../../citation/citationDisplay';
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
  asOf: '2026-08-06T00:00:00.000Z',
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

/**
 * DRAFT INSERTION AND THE UNCITABLE JUDGMENT.
 *
 * `CITATION_HARNESS.md` §"The fourth concern" names this surface directly:
 * *"`PrecedentPanel` (draft suggestions) stays enabled, carrying the same mark
 * inline. An uncitable judgment is not excluded from suggestions the way
 * `set_aside` judgments are — the current UNMARKED offering was the danger, not
 * the offering itself."*
 *
 * This is the worst place for an unmarked citationless judgment. Everywhere else
 * the advocate asked for the authority; here WE proposed it, into a document
 * that gets filed, and silence in this product means verified-and-fine.
 */
describe('a suggestion we hold no citation for', () => {
  const citationless = make({
    judgmentId: 'j_hc',
    caseTitle: 'Mock Petitioner v. State of Bihar',
    neutralCitation: null,
    reporterCitations: [],
  });

  it('is still offered — warn, not block', async () => {
    await render(<PrecedentPanel onInsert={() => {}} suggestions={[citationless]} />);

    expect(screen.getByText('Mock Petitioner v. State of Bihar')).toBeTruthy();
  });

  it('carries the uncitable mark inline, as the harness requires', async () => {
    await render(<PrecedentPanel onInsert={() => {}} suggestions={[citationless]} />);

    expect(screen.getByText(NO_CITATION_MARK)).toBeTruthy();
  });

  it('can still be inserted, and inserting it passes the judgment id', async () => {
    const onInsert = jest.fn();
    await render(<PrecedentPanel onInsert={onInsert} suggestions={[citationless]} />);

    await fireEvent.press(screen.getByText('Mock Petitioner v. State of Bihar'));

    expect(onInsert).toHaveBeenCalledWith('j_hc');
  });

  it('leaves a citable suggestion unmarked — verified stays silent', async () => {
    await render(
      <PrecedentPanel
        onInsert={() => {}}
        suggestions={[make({ judgmentId: 'j_ok', caseTitle: 'Mock Cited v. State' })]}
      />
    );

    expect(screen.queryByText(NO_CITATION_MARK)).toBeNull();
  });

  it('still refuses a set-aside suggestion outright — the one exclusion', async () => {
    await render(
      <PrecedentPanel
        onInsert={() => {}}
        suggestions={[make({ overruledStatus: 'set_aside' })]}
      />
    );

    expect(screen.toJSON()).toBeNull();
  });
});
