import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { CompareSummary } from './CompareSummary';
import type { CompareResponse } from '../../api/contract';
import { state } from '../../theme/tokens';

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

  /**
   * THE THREE STATES MUST NOT COLLAPSE INTO ONE.
   *
   * This surface used to draw one amber band, "The law has moved on this
   * authority", for `set_aside`, `partly_set_aside` and `doubted` alike. That
   * was wrong in both directions at once: `set_aside` — the one state where
   * Lawmind refuses to let an authority be used — was painted in caution amber
   * rather than danger, and `doubted`, which is still binding law and which
   * `CITATION_HARNESS.md` §"When the law moves" says gets no band at all, was
   * banded exactly as loudly. "A notification that shouted equally for all
   * three would train advocates to ignore it" is the rule, and a diff is where
   * an advocate looks immediately before filing.
   *
   * The old test asserted the collapsed string, so it passed throughout.
   */
  const withStatus = (
    overruledStatus: CompareResponse['citationChanges'][number]['overruledStatus'],
  ): CompareResponse => ({
    ...data,
    citationChanges: [{ ...data.citationChanges[0]!, overruledStatus }],
  });

  it('gives set_aside its own chip, distinct from the other two states', async () => {
    await render(<CompareSummary data={withStatus('set_aside')} />);

    expect(screen.getByText('Overruled')).toBeTruthy();
    expect(screen.queryByText('Doubted · referred')).toBeNull();
    expect(screen.queryByText('Partly set aside')).toBeNull();
  });

  it('gives partly_set_aside its own chip, and never the set_aside one', async () => {
    await render(<CompareSummary data={withStatus('partly_set_aside')} />);

    expect(screen.getByText('Partly set aside')).toBeTruthy();
    expect(screen.queryByText('Overruled')).toBeNull();
  });

  it('marks doubted, says it still binds, and does not shout it as overruled', async () => {
    await render(<CompareSummary data={withStatus('doubted')} />);

    expect(screen.getByText('Doubted · referred')).toBeTruthy();
    expect(screen.getByText(/Still binding/)).toBeTruthy();
    expect(screen.queryByText('Overruled')).toBeNull();
  });

  it('draws no moved mark at all when the law has not moved', async () => {
    await render(<CompareSummary data={data} />);

    for (const chip of ['Overruled', 'Partly set aside', 'Doubted · referred']) {
      expect(screen.queryByText(chip)).toBeNull();
    }
  });

  /**
   * The colour is the part a reader acts on before reading a word, so it is
   * asserted rather than trusted — and asserted as DISTINCTNESS rather than as
   * three hex values, following `CitationMark.test.tsx`. Three states drawn in
   * three treatments is the rule; which exact shade is a token's business, and
   * a test holding its own copy of the palette goes on passing while the token
   * underneath it moves.
   *
   * `set_aside` is additionally pinned to `state.danger`, because the
   * regression this exists to catch is the one that was live until 11 Aug 2026:
   * `set_aside` drawn in caution amber, indistinguishable from a judgment that
   * had merely been doubted.
   */
  const chipColours = async (
    status: CompareResponse['citationChanges'][number]['overruledStatus'],
    chip: string,
  ) => {
    const view = await render(<CompareSummary data={withStatus(status)} />);
    const flat = StyleSheet.flatten(view.getByText(chip).parent!.props.style) as {
      borderColor?: string;
      backgroundColor?: string;
    };
    return `${flat.borderColor}/${flat.backgroundColor}`;
  };

  it('draws the three states in three treatments, none borrowed from another', async () => {
    const seen = [
      await chipColours('set_aside', 'Overruled'),
      await chipColours('partly_set_aside', 'Partly set aside'),
      await chipColours('doubted', 'Doubted · referred'),
    ];

    expect(new Set(seen).size).toBe(3);
  });

  it('pins set_aside to danger — the one state where an authority may not be used', async () => {
    await render(<CompareSummary data={withStatus('set_aside')} />);

    const mark = screen.getByText('Overruled').parent!;
    expect(StyleSheet.flatten(mark.props.style)).toMatchObject({ borderColor: state.danger });
  });

  it('says plainly when nothing changed rather than rendering an empty diff', async () => {
    await render(<CompareSummary data={{ textChanges: [], citationChanges: [] }} />);

    expect(screen.getByText(/No prose changed\. No citations changed\./)).toBeTruthy();
  });
});
