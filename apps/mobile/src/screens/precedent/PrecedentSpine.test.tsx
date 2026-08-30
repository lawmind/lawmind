import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { PrecedentSpine } from './PrecedentSpine';
import type { GraphNode, OverruledStatus, PrecedentGraph } from '../../api/contract';
import { state } from '../../theme/tokens';

/**
 * THE RULE UNDER TEST: a node that is itself no longer good law must not sit in
 * the network looking like any other node, and the three states must not look
 * like each other.
 *
 * Until 11 Aug 2026 all three drew `state.cautionText` and the enum was printed
 * into the sentence by `.replace(/_/g, ' ')`. Two problems in one line: a
 * `set_aside` node carried the same weight as a `doubted` one, and a fourth
 * enum value would have printed itself into English unreviewed. This file is
 * the spine's first test.
 *
 * Also under test, and older: TRUNCATION IS A CORRECTNESS STATEMENT here. A
 * network drawn as complete when it is not tells an advocate that this much law
 * — and no more — bears on the authority.
 */

const node = (judgmentId: string, overruledStatus: OverruledStatus): GraphNode => ({
  judgmentId,
  caseTitle: `Mock Node ${judgmentId}`,
  neutralCitation: `MOCK 2020 EXAMPLE ${judgmentId}`,
  court: 'Mock SC',
  judgmentDate: '2020-01-01',
  verificationState: 'verified',
  verifiedBySource: 'corpus',
  overruledStatus,
  asOf: '2026-08-06T00:00:00.000Z',
  depth: 1,
});

const graphOf = (overruledStatus: OverruledStatus): PrecedentGraph => ({
  rootId: 'root',
  asOf: '2026-08-06T00:00:00.000Z',
  nodes: [node('root', 'none'), node('n1', overruledStatus)],
  edges: [{ from: 'root', to: 'n1', relationship: 'followed' }],
  totalNodes: 2,
  returned: 2,
  truncated: false,
  /**
   * G-3. The spine REFUSES to draw a graph that does not declare its own
   * partiality, so every fixture carries the declaration — the numbers are
   * LCC's measured ones (`docs/ai/lcc-r12/citation-graph-coverage.json`).
   */
  coverage: {
    basis: 'resolved outgoing citation edges',
    resolvedEdgesInCorpus: 200_761,
    judgmentsWithAnyResolvedOutgoing: 105_024,
    corpusDenominator: 18_758_460,
    declaredPartial: true,
    outgoingCoverageShare: 105_024 / 18_758_460,
    measuredAt: '2026-08-30T00:00:00.000Z',
    note: 'This citation graph is PARTIAL. An edge we do not hold is not evidence that the judgment does not cite the authority.',
  },
});

const draw = (graph: PrecedentGraph | null) =>
  render(
    <PrecedentSpine
      graph={graph}
      onOpenJudgment={() => {}}
      rootCitation="MOCK 2015 EXAMPLE 1"
      rootTitle="Mock Root v. Mock State"
    />
  );

const SENTENCE: Record<Exclude<OverruledStatus, 'none'>, string> = {
  set_aside: 'This judgment has itself been set aside.',
  partly_set_aside: 'Part of this judgment has itself been set aside.',
  doubted: 'This judgment has itself been doubted.',
};

const inkOf = (sentence: string) =>
  (StyleSheet.flatten(screen.getByText(sentence).props.style) as { color?: string }).color;

describe('a node’s own good-law status', () => {
  it('says nothing about a node that is still good law', async () => {
    await draw(graphOf('none'));

    for (const sentence of Object.values(SENTENCE)) {
      expect(screen.queryByText(sentence)).toBeNull();
    }
  });

  it.each(['set_aside', 'partly_set_aside', 'doubted'] as const)(
    'states %s in written-out words, never assembled from the enum',
    async (status) => {
      await draw(graphOf(status));

      expect(screen.getByText(SENTENCE[status])).toBeTruthy();
    }
  );

  it('draws the three states in three different inks, none borrowed from another', async () => {
    const seen: (string | undefined)[] = [];
    for (const status of ['set_aside', 'partly_set_aside', 'doubted'] as const) {
      await draw(graphOf(status));
      seen.push(inkOf(SENTENCE[status]));
    }

    expect(new Set(seen).size).toBe(3);
    expect(seen.every(Boolean)).toBe(true);
  });

  it('pins set_aside to danger — the state that disables an authority', async () => {
    await draw(graphOf('set_aside'));

    expect(inkOf(SENTENCE.set_aside)).toBe(state.danger);
  });

  it('never gives doubted the danger ink, because it still binds', async () => {
    await draw(graphOf('doubted'));

    expect(inkOf(SENTENCE.doubted)).not.toBe(state.danger);
  });
});

describe('the spine states what it is not showing', () => {
  it('renders the truncation as a count rather than letting the boxes imply it', async () => {
    await draw({ ...graphOf('none'), truncated: true, returned: 2, totalNodes: 57 });

    expect(screen.getByText('Showing 2 of 57 judgments in this network.')).toBeTruthy();
  });

  it('says nothing about truncation when the network is complete', async () => {
    await draw(graphOf('none'));

    expect(screen.queryByText(/Showing \d+ of \d+ judgments/)).toBeNull();
  });

  it('says it is still drawing rather than rendering an empty network', async () => {
    await draw(null);

    expect(screen.getByText('Drawing the network…')).toBeTruthy();
  });
});

/**
 * G-3 — ABSENCE OF AN EDGE IS NEVER ABSENCE OF A CITATION.
 *
 * Measured by LCC R12: 105,024 of 18,758,460 judgments carry any resolved
 * outgoing citation — 0.56% — and 71.97% of the citation rows are blank
 * sentinels. A judgment drawn with no edges is overwhelmingly likely to be one
 * whose citations we never resolved, not one that cites nothing. Two boxes on a
 * spine read as the whole network unless something says otherwise.
 */
describe('the spine declares that the graph is partial', () => {
  it('renders the server’s own sentence, verbatim', async () => {
    await draw(graphOf('none'));
    expect(
      screen.getByText(/This citation graph is PARTIAL/),
    ).toBeTruthy();
  });

  it('states the coverage denominator rather than implying completeness', async () => {
    await draw(graphOf('none'));
    expect(screen.getByText(/1,05,024 of 1,87,58,460 judgments we hold/)).toBeTruthy();
  });

  /**
   * The refusal. A pre-G-3 server sends no `coverage`, and drawing the network
   * anyway would be drawing an undeclared partial graph — the exact defect.
   */
  it('refuses to draw a graph that does not declare its partiality', async () => {
    const { coverage: _dropped, ...withoutCoverage } = graphOf('none');
    await draw(withoutCoverage as PrecedentGraph);
    expect(screen.getByText(/We cannot show this network yet/)).toBeTruthy();
    expect(screen.queryByText('Mock Root v. Mock State')).toBeNull();
  });
});
