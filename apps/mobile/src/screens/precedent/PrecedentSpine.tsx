import { ScrollView, StyleSheet, View } from 'react-native';

import { Pressable } from '../../components/Pressable';
import { Text } from '../../components/Text';
import type { GraphNode, PrecedentGraph, TreatmentRelationship } from '../../api/contract';
import { color, radius, space, state } from '../../theme/tokens';

/**
 * THE CITATION NETWORK AS A VERTICAL SPINE, NOT A NODE-AND-EDGE DIAGRAM.
 *
 * A force-directed graph on a 390px screen held in one hand is a diagram of a
 * diagram: the labels collide, the edges cross, and the advocate pinches and
 * pans instead of reading. A spine keeps the one relationship that matters —
 * this authority, and what each later judgment did to it — on a single axis
 * that scrolls with a thumb.
 *
 * THE SPINE SEGMENT CARRIES THE RELATIONSHIP, and it is the only place amber
 * appears: an overruling edge is the law moving. Followed and distinguished are
 * rule-coloured, because they are the ordinary life of a precedent.
 */

const RELATIONSHIP_LABEL: Record<TreatmentRelationship, string> = {
  followed: 'FOLLOWED',
  distinguished: 'DISTINGUISHED',
  doubted: 'DOUBTED',
  overruled: 'OVERRULED',
};

export function PrecedentSpine({
  graph,
  rootTitle,
  rootCitation,
  onOpenJudgment,
}: {
  graph: PrecedentGraph | null;
  rootTitle: string;
  rootCitation: string;
  onOpenJudgment: (judgmentId: string) => void;
}) {
  if (!graph) {
    return (
      <View style={styles.centred}>
        <Text variant="ui" style={styles.muted}>
          Drawing the network…
        </Text>
      </View>
    );
  }

  /** The edge that reaches each node, so the segment above it can be coloured. */
  const relationshipTo = new Map<string, TreatmentRelationship>();
  for (const e of graph.edges) relationshipTo.set(e.to, e.relationship);

  const children = graph.nodes.filter((n) => n.judgmentId !== graph.rootId);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {/* The authority being read. Ink, because it is the subject, not a result. */}
      <View style={styles.rootNode}>
        <Text lang="en" variant="record" style={styles.rootCitation}>
          {rootCitation}
        </Text>
        <Text variant="legal" scale="holding" style={styles.rootTitle}>
          {rootTitle}
        </Text>
      </View>

      {children.map((node) => {
        const rel = relationshipTo.get(node.judgmentId);
        const lawMoved = rel === 'overruled';
        return (
          <View key={node.judgmentId} style={styles.segmentHost}>
            {/*
              The spine. Amber ONLY where this judgment overruled the authority
              above it — the one edge that changes whether it can still be
              relied on.
            */}
            <View
              style={[styles.spine, { backgroundColor: lawMoved ? state.caution : color.rule }]}
            />
            <Node lawMoved={lawMoved} node={node} onOpen={() => onOpenJudgment(node.judgmentId)} relationship={rel} />
          </View>
        );
      })}

      {/*
        TRUNCATION IS A CORRECTNESS STATEMENT ON THIS SCREEN ABOVE ALL OTHERS.
        A network drawn as complete when it is not tells an advocate that this
        much law — and no more — bears on the authority. Rendered as a count,
        not implied by the number of boxes.
      */}
      {graph.truncated ? (
        <Text variant="ui" style={styles.truncated}>
          Showing {graph.returned} of {graph.totalNodes} judgments in this network.
        </Text>
      ) : null}

      <View style={styles.legend}>
        <Text variant="eyebrow">LEGEND</Text>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: color.ink }]} />
            <Text variant="ui" style={styles.muted}>
              No issue
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: state.caution }]} />
            <Text variant="ui" style={styles.muted}>
              Law has moved
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function Node({
  node,
  relationship,
  lawMoved,
  onOpen,
}: {
  node: GraphNode;
  relationship?: TreatmentRelationship;
  lawMoved: boolean;
  onOpen: () => void;
}) {
  return (
    <Pressable onPress={onOpen} style={[styles.node, lawMoved && styles.nodeMoved]}>
      {relationship ? (
        <Text
          variant="eyebrow"
          style={{ color: lawMoved || relationship === 'doubted' ? state.cautionText : color.ink }}
        >
          {RELATIONSHIP_LABEL[relationship]}
        </Text>
      ) : null}
      <Text variant="legal" scale="holding" style={styles.nodeTitle}>
        {node.caseTitle}
      </Text>
      {/*
        The node's OWN good-law status, independent of what it did to the root.
        Read live at render, never cached — a set-aside judgment must not sit in
        the network looking like any other node.
      */}
      {node.overruledStatus !== 'none' ? (
        <Text variant="ui" style={styles.nodeStatus}>
          This judgment has itself been {node.overruledStatus.replace(/_/g, ' ')}.
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: space.sm, alignItems: 'center' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
  muted: { color: color.inkFaint },

  rootNode: {
    width: '90%',
    backgroundColor: color.ink,
    borderRadius: radius.base,
    padding: space.sm,
    alignItems: 'center',
    gap: space.xs,
  },
  rootCitation: { color: color.parchment },
  rootTitle: { color: color.parchment, textAlign: 'center' },

  segmentHost: { width: '100%', alignItems: 'center' },
  spine: { width: 1.5, height: 44 },

  node: {
    width: '90%',
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    alignItems: 'center',
    gap: space.xs,
  },
  nodeMoved: { backgroundColor: state.cautionWash, borderColor: state.caution },
  nodeTitle: { color: color.ink, textAlign: 'center' },
  nodeStatus: { color: state.cautionText, textAlign: 'center' },

  truncated: { color: color.inkMuted, paddingTop: space.sm, textAlign: 'center' },

  legend: {
    width: '90%',
    marginTop: space.md,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    backgroundColor: color.card,
    padding: space.xs,
    gap: space.xs,
  },
  legendRow: { flexDirection: 'row', gap: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  swatch: { width: 9, height: 9, borderRadius: radius.base },
});
