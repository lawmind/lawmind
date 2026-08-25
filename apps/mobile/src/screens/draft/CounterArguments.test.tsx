import { render, screen } from '@testing-library/react-native';

import { CounterArguments } from './CounterArguments';
import type {
  CounterArgument,
  CounterArgumentsResponse,
  CounterAuthority,
  ExcludedAuthority,
} from '../../api/contract';

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

const excluded: ExcludedAuthority[] = [
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
        'These are authorities on the point, not the argument against you. We do not draft the opposing case yet.',
      ),
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

    expect(screen.getByText('No sufficiently relevant authority found.')).toBeTruthy();
  });

  it('survives a response carrying none of the optional keys', async () => {
    await render(<CounterArguments data={{}} />);

    expect(screen.getByText('AUTHORITIES ON THIS POINT')).toBeTruthy();
    expect(screen.getByText('No sufficiently relevant authority found.')).toBeTruthy();
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
        'This authority has been set aside, so it is not offered as a counter-argument.',
      ),
    ).toBeTruthy();
  });

  it('renders a verified authority with no mark at all — verified is silent', async () => {
    await render(<CounterArguments data={s2} />);

    expect(screen.queryByText('We could not confirm this reference')).toBeNull();
  });

  it('never says "has been set aside" for review_required — that overclaims a certainty the server refused to assert', async () => {
    const reviewRequired: ExcludedAuthority = {
      ...excluded[0]!,
      precedentialEffect: 'review_required',
    };
    await render(<CounterArguments data={{ ...s2, excluded: [reviewRequired] }} />);

    expect(
      screen.queryByText(
        'This authority has been set aside, so it is not offered as a counter-argument.',
      ),
    ).toBeNull();
    expect(screen.getByText(/our records could not fully confirm/)).toBeTruthy();
  });

  it('marks an unverified authority and offers the eCourts route', async () => {
    const withUnverified: CounterArgumentsResponse = {
      ...s2,
      arguments: [
        { ...argument, authorities: [{ ...authority, verificationState: 'unverified' }] },
      ],
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
      unverifiedReferences: [
        { citationClaimed: 'Mock Ghost v. Nobody', reason: 'no tier matched' },
      ],
    };

    await render(<CounterArguments data={withStripped} />);

    expect(screen.getByText('Mock Ghost v. Nobody')).toBeTruthy();
  });
});

/**
 * THE STATE THIS PANEL COULD NOT SAY, until 11 Aug 2026.
 *
 * `services/api/src/arguments/counter.ts` filters `set_aside` and NOTHING
 * ELSE — `usable = retrieved.filter((r) => r.overruledStatus !== 'set_aside')`.
 * So `doubted` and `partly_set_aside` authorities are returned in
 * `authorities`, and this component drew only the existence mark: they
 * rendered as ordinary good law, with no chip, no headline and no amber.
 *
 * The stale-overruled threshold is zero and makes no exception for a panel.
 * It is also the surface where hiding it costs most: elsewhere the advocate
 * went looking and can weigh what they find, whereas here WE propose the
 * authority as something the other side may run.
 */
describe('an authority whose law has moved', () => {
  const withStatus = (over: Partial<CounterAuthority>) =>
    render(<CounterArguments data={{ ...s1, authorities: [{ ...authority, ...over }] }} />);

  it('marks a doubted authority, which the server returns and never filtered', async () => {
    await withStatus({ overruledStatus: 'doubted' });

    expect(screen.getByText('Doubted · referred')).toBeTruthy();
  });

  it('states in words that a doubted authority still binds', async () => {
    await withStatus({ overruledStatus: 'doubted' });

    expect(screen.getByText('Doubted in a later judgment. Still binding.')).toBeTruthy();
  });

  it('marks a partly set aside authority and names the paragraphs the server sent', async () => {
    await withStatus({ overruledStatus: 'partly_set_aside', overruledParas: [19, 20] });

    expect(screen.getByText('Paras 19–20 set aside')).toBeTruthy();
  });

  it('falls back to the unnumbered wording when the server named no paragraphs', async () => {
    await withStatus({ overruledStatus: 'partly_set_aside', overruledParas: null });

    expect(screen.getByText('Partly set aside')).toBeTruthy();
  });

  /**
   * Rendered without the excluded list, whose own card legitimately says "set
   * aside" — the assertion is about the AUTHORITY carrying no mark, and a
   * screen-wide match would have been satisfied by the wrong element.
   */
  it('draws nothing at all on an authority that is still good law', async () => {
    await render(<CounterArguments data={{ ...s1, authorities: [authority], excluded: [] }} />);

    expect(screen.queryByText('Doubted · referred')).toBeNull();
    expect(screen.queryByText(/set aside/i)).toBeNull();
    expect(screen.queryByText('Overruled')).toBeNull();
  });

  /**
   * `overruledNote` reached `authorities[]` on 11 Aug 2026, the same day this
   * client's audit found it was carried on `excluded[]` and not here
   * (bus 0037 → `counter.ts`). `renderState.ts` puts it in `whatStillStands`
   * and states it FIRST — it is the half the advocate is about to argue
   * against, and leading with what fell buries the useful half.
   */
  it('states what still stands, from the note the server now sends', async () => {
    await withStatus({
      overruledStatus: 'partly_set_aside',
      overruledParas: [19, 20],
      overruledNote: 'The directions on maintenance survive; only the arrest guidelines fell.',
    });

    expect(
      screen.getByText('The directions on maintenance survive; only the arrest guidelines fell.'),
    ).toBeTruthy();
  });

  /**
   * Verification and good-law status are different questions from different
   * sources. An authority can be both, and the panel must not let one mark
   * stand in for the other.
   */
  it('draws both marks on an authority that is unconfirmed AND doubted', async () => {
    await withStatus({ verificationState: 'unverified', overruledStatus: 'doubted' });

    expect(screen.getByText('We could not confirm this reference')).toBeTruthy();
    expect(screen.getByText('Doubted · referred')).toBeTruthy();
  });
});

/**
 * WHY IT WAS RULED OUT, IN THE COURT'S WORDS WHERE WE HOLD THEM.
 *
 * `design/screens/07-counter-arguments.dc.html` writes the reason as naming
 * the case that did the setting aside. `overruled_note` is where that sentence
 * lives and the server has always sent it on an excluded row; this client's
 * type declared three of the six fields, so the card printed one generic
 * sentence to every row regardless of what we held.
 */
describe('the exclusion reason', () => {
  const withNote = (overruledNote: string | null) =>
    render(<CounterArguments data={{ ...s1, excluded: [{ ...excluded[0]!, overruledNote }] }} />);

  it('names what was set aside and where, when the server sent the note', async () => {
    await withNote(
      'The relevant directions in this authority were set aside in Mock Social Action Forum (2018)',
    );

    expect(
      screen.getByText(
        'The relevant directions in this authority were set aside in Mock Social Action Forum (2018) — not offered as a counter-argument.',
      ),
    ).toBeTruthy();
  });

  it('says the smaller true thing when there is no note, rather than naming a judgment we do not hold', async () => {
    await withNote(null);

    expect(
      screen.getByText(
        'This authority has been set aside, so it is not offered as a counter-argument.',
      ),
    ).toBeTruthy();
  });

  /** A note that is present but blank is the same as none — never a bare dash. */
  it('treats a whitespace-only note as no note', async () => {
    await withNote('   ');

    expect(
      screen.getByText(
        'This authority has been set aside, so it is not offered as a counter-argument.',
      ),
    ).toBeTruthy();
  });
});
