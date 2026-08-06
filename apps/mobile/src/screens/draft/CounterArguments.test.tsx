import { render, screen } from '@testing-library/react-native';

import { CounterArguments } from './CounterArguments';
import type { CounterArgumentsResponse } from '../../api/contract';

/**
 * THE RULE UNDER TEST: an excluded authority is SHOWN, never silently dropped.
 *
 * Silent-drop rate carries a zero threshold. A `set_aside` authority that is
 * correctly not offered as a counter-argument, but also not named, is
 * indistinguishable from one we never found — and an advocate who knows it
 * exists would go looking for it, which is the opposite of the point.
 */

const data: CounterArgumentsResponse = {
  arguments: [
    {
      argument: 'The recovery memo shows possession of stolen property',
      rebuttal: 'The memo bears no independent witness signature.',
      authorities: [
        {
          judgmentId: 'j1',
          caseTitle: 'Mock Authority v. State',
          neutralCitation: 'MOCK 2026 EXAMPLE 1',
          verificationState: 'verified',
          verifiedBySource: 'corpus',
          overruledStatus: 'none',
          asOf: '2026-08-06T00:00:00.000Z',
        },
      ],
    },
  ],
  excluded: [
    {
      judgmentId: 'j9',
      caseTitle: 'Mock SetAside v. State',
      neutralCitation: 'MOCK 2017 EXAMPLE 746',
      reason: 'set_aside',
    },
  ],
  unverifiedReferences: [],
};

describe('CounterArguments', () => {
  it('names the excluded authority rather than dropping it', async () => {
    await render(<CounterArguments data={data} />);

    expect(screen.getByText('Mock SetAside v. State')).toBeTruthy();
    expect(screen.getByText('EXCLUDED')).toBeTruthy();
  });

  it('says WHY it was excluded, so absence is never mistaken for not-found', async () => {
    await render(<CounterArguments data={data} />);

    expect(
      screen.getByText(
        'This authority has been set aside, so it is not offered as a counter-argument.'
      )
    ).toBeTruthy();
  });

  it('renders a verified authority with no mark at all — verified is silent', async () => {
    await render(<CounterArguments data={data} />);

    expect(screen.queryByText('We could not confirm this reference')).toBeNull();
  });

  it('marks an unverified authority and offers the eCourts route', async () => {
    const withUnverified: CounterArgumentsResponse = {
      ...data,
      arguments: [
        {
          ...data.arguments[0]!,
          authorities: [
            { ...data.arguments[0]!.authorities[0]!, verificationState: 'unverified' },
          ],
        },
      ],
    };

    await render(<CounterArguments data={withUnverified} />);

    expect(screen.getByText('We could not confirm this reference')).toBeTruthy();
    expect(screen.getByText('Check on eCourts')).toBeTruthy();
  });

  it('lists a reference no tier confirmed rather than stripping it', async () => {
    const withStripped: CounterArgumentsResponse = {
      ...data,
      unverifiedReferences: [{ citationClaimed: 'Mock Ghost v. Nobody', reason: 'no tier matched' }],
    };

    await render(<CounterArguments data={withStripped} />);

    expect(screen.getByText('Mock Ghost v. Nobody')).toBeTruthy();
  });
});
