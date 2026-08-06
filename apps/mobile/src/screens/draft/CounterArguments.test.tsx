import { render, screen } from '@testing-library/react-native';

import { CounterArguments } from './CounterArguments';
import type { CounterArgument, CounterArgumentsResponse, CounterAuthority } from '../../api/contract';

/**
 * THE RULE UNDER TEST: an excluded authority is SHOWN, never silently dropped.
 *
 * Silent-drop rate carries a zero threshold. A `set_aside` authority that is
 * correctly not offered as a counter-argument, but also not named, is
 * indistinguishable from one we never found — and an advocate who knows it
 * exists would go looking for it, which is the opposite of the point.
 *
 * The second rule, added when the S1 shape landed: A LIST OF AUTHORITIES IS
 * NEVER PRESENTED AS THE OPPOSING ARGUMENT. Production returns authorities and
 * no prose; a heading that promised the argument would have the advocate read a
 * claim into the list that we never made.
 */

const authority: CounterAuthority = {
  judgmentId: 'j1',
  caseTitle: 'Mock Authority v. State',
  neutralCitation: 'MOCK 2026 EXAMPLE 1',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus: 'none',
  asOf: '2026-08-06T00:00:00.000Z',
};

const excluded = [
  {
    judgmentId: 'j9',
    caseTitle: 'Mock SetAside v. State',
    neutralCitation: 'MOCK 2017 EXAMPLE 746',
    reason: 'set_aside' as const,
  },
];

/** What production actually returns today: authorities, no `arguments` key. */
const s1: CounterArgumentsResponse = {
  position: 'Section 67 NDPS statements are admissible as confessions',
  asOf: '2026-08-06T19:14:19.222Z',
  authorities: [authority],
  excluded,
  unverifiedReferences: [],
};

/** What it will return once generation lands in S2. */
const argument: CounterArgument = {
  argument: 'The recovery memo shows possession of stolen property',
  rebuttal: 'The memo bears no independent witness signature.',
  authorities: [authority],
};

const s2: CounterArgumentsResponse = {
  arguments: [argument],
  excluded,
  unverifiedReferences: [],
};

describe('CounterArguments — S1, authorities only', () => {
  it('says what the list is, and does not promise the opposing argument', async () => {
    await render(<CounterArguments data={s1} />);

    expect(screen.getByText('AUTHORITIES ON THIS POINT')).toBeTruthy();
    expect(screen.queryByText('THE OTHER SIDE WILL LIKELY ARGUE')).toBeNull();
  });

  it('states plainly that the opposing case is not drafted yet', async () => {
    await render(<CounterArguments data={s1} />);

    expect(
      screen.getByText(
        'These are authorities on the point, not the argument against you. We do not draft the opposing case yet.'
      )
    ).toBeTruthy();
  });

  it('renders the grounded authorities', async () => {
    await render(<CounterArguments data={s1} />);

    expect(screen.getByText('Mock Authority v. State, MOCK 2026 EXAMPLE 1')).toBeTruthy();
  });

  it('shows the excluded authority in the S1 shape too', async () => {
    await render(<CounterArguments data={s1} />);

    expect(screen.getByText('Mock SetAside v. State')).toBeTruthy();
    expect(screen.getByText('EXCLUDED')).toBeTruthy();
  });

  it('says so rather than rendering an empty card when nothing was found', async () => {
    await render(<CounterArguments data={{ ...s1, authorities: [], excluded: [] }} />);

    expect(screen.getByText('We found no authority in the corpus on this point.')).toBeTruthy();
  });

  it('survives a response carrying none of the optional keys', async () => {
    await render(<CounterArguments data={{}} />);

    expect(screen.getByText('AUTHORITIES ON THIS POINT')).toBeTruthy();
    expect(screen.getByText('We found no authority in the corpus on this point.')).toBeTruthy();
  });
});

describe('CounterArguments — S2, once generation lands', () => {
  it('names the excluded authority rather than dropping it', async () => {
    await render(<CounterArguments data={s2} />);

    expect(screen.getByText('Mock SetAside v. State')).toBeTruthy();
    expect(screen.getByText('EXCLUDED')).toBeTruthy();
  });

  it('says WHY it was excluded, so absence is never mistaken for not-found', async () => {
    await render(<CounterArguments data={s2} />);

    expect(
      screen.getByText(
        'This authority has been set aside, so it is not offered as a counter-argument.'
      )
    ).toBeTruthy();
  });

  it('renders a verified authority with no mark at all — verified is silent', async () => {
    await render(<CounterArguments data={s2} />);

    expect(screen.queryByText('We could not confirm this reference')).toBeNull();
  });

  it('marks an unverified authority and offers the eCourts route', async () => {
    const withUnverified: CounterArgumentsResponse = {
      ...s2,
      arguments: [{ ...argument, authorities: [{ ...authority, verificationState: 'unverified' }] }],
    };

    await render(<CounterArguments data={withUnverified} />);

    expect(screen.getByText('We could not confirm this reference')).toBeTruthy();
    expect(screen.getByText('Check on eCourts')).toBeTruthy();
  });

  it('shows the argument and rebuttal, and drops the S1 caveat', async () => {
    await render(<CounterArguments data={s2} />);

    expect(screen.getByText('THE OTHER SIDE WILL LIKELY ARGUE')).toBeTruthy();
    expect(screen.getByText('REBUTTAL')).toBeTruthy();
    expect(screen.queryByText(/We do not draft the opposing case yet/)).toBeNull();
  });

  it('lists a reference no tier confirmed rather than stripping it', async () => {
    const withStripped: CounterArgumentsResponse = {
      ...s2,
      unverifiedReferences: [{ citationClaimed: 'Mock Ghost v. Nobody', reason: 'no tier matched' }],
    };

    await render(<CounterArguments data={withStripped} />);

    expect(screen.getByText('Mock Ghost v. Nobody')).toBeTruthy();
  });
});
