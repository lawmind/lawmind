import { render, screen } from '@testing-library/react-native';

import { CompareSummary } from './CompareSummary';
import type { CompareResponse } from '../../api/contract';

/**
 * THE RULE UNDER TEST: a changed citation is never rendered as though it were
 * changed prose.
 *
 * `API_CONTRACTS.md` keeps `citationChanges` separate from `textChanges` on
 * purpose — "a diff that renders them the same way hides the one change that
 * matters". The client has to honour that separation or the contract's care is
 * undone at the last step.
 */

const data: CompareResponse = {
  textChanges: [
    { paragraphIndex: 1, kind: 'changed' },
    { paragraphIndex: 4, kind: 'changed' },
  ],
  citationChanges: [
    {
      paragraphIndex: 1,
      kind: 'added',
      after: 'Mock Authority v. State, MOCK 2022 EXAMPLE 1',
      verificationState: 'verified',
      verifiedBySource: 'corpus',
      overruledStatus: 'none',
      asOf: '2026-08-06T00:00:00.000Z',
    },
  ],
};

describe('CompareSummary', () => {
  it('lists citation changes individually, not as a prose count', async () => {
    await render(<CompareSummary data={data} />);

    expect(screen.getByText('CITATIONS CHANGED · 1')).toBeTruthy();
    expect(screen.getByText('Mock Authority v. State, MOCK 2022 EXAMPLE 1')).toBeTruthy();
  });

  it('summarises prose changes as a count and keeps them out of the citation list', async () => {
    await render(<CompareSummary data={data} />);

    expect(screen.getByText(/2 paragraphs of prose changed/)).toBeTruthy();
  });

  it('re-states verification on a changed citation rather than assuming it carried over', async () => {
    const unverified: CompareResponse = {
      ...data,
      citationChanges: [{ ...data.citationChanges[0]!, verificationState: 'unverified' }],
    };

    await render(<CompareSummary data={unverified} />);
    expect(screen.getByText('We could not confirm this reference')).toBeTruthy();
  });

  it('flags a citation added in the new version whose law has since moved', async () => {
    const moved: CompareResponse = {
      ...data,
      citationChanges: [{ ...data.citationChanges[0]!, overruledStatus: 'set_aside' }],
    };

    await render(<CompareSummary data={moved} />);
    expect(screen.getByText('The law has moved on this authority')).toBeTruthy();
  });

  it('says plainly when nothing changed rather than rendering an empty diff', async () => {
    await render(<CompareSummary data={{ textChanges: [], citationChanges: [] }} />);

    expect(screen.getByText(/No prose changed\. No citations changed\./)).toBeTruthy();
  });
});
