import { StyleSheet, View } from 'react-native';

import { CitationMark, movedTone } from '../../components/CitationMark';
import { Text } from '../../components/Text';
import type { CounterAuthority } from '../../api/contract';
import { citationDisplay } from '../../citation/citationDisplay';
import { citationRender } from '../../citation/renderState';
import { color, radius, space, state } from '../../theme/tokens';

/**
 * DOCUMENT REVIEW — risk and negotiation analysis. `FEATURE_PARITY.md` §2.3.
 *
 * SENSITIVE CLASS. Everything reaching this screen came from an uploaded case
 * document: it was pseudonymised before any model call, sent one document per
 * call, and routed only to a provider with written data-processing terms. None
 * of that is enforced here — it is enforced server-side, and the admin surface
 * refuses sensitive routing without a countersigned DPA — but this screen is
 * where the advocate is told what it cost.
 *
 * COVERAGE IS A MEASURED NUMBER, NOT A REASSURING SENTENCE.
 *
 * The design draws a static line: "Automated detection of personal information
 * is partial, not complete." True, and not enough. `PRIVACY_PII.md` requires
 * coverage to be measured and reported as a number — computed from
 * `pii_entities` against detected-entity counts — precisely so it cannot drift
 * into a claim nobody checks. The endpoint returns it, so it is rendered.
 *
 * We never claim complete PII removal, in product or anywhere else.
 */

export type ReviewFinding = {
  clauseIndex: string;
  category: 'standard' | 'risk' | 'negotiation';
  finding: string;
  detail?: string;
  authorities: CounterAuthority[];
};

const ORDER: ReviewFinding['category'][] = ['risk', 'negotiation', 'standard'];
const LABEL: Record<ReviewFinding['category'], string> = {
  risk: 'Risk',
  negotiation: 'Negotiation',
  standard: 'Standard',
};

export function DocumentReview({
  findings,
  clausesRead,
  pseudonymisationCoverage,
  measuredAt,
}: {
  findings: ReviewFinding[];
  clausesRead: number;
  /** 0–1, measured. Rendered as a number; never rounded up to "complete". */
  pseudonymisationCoverage: number;
  measuredAt: string;
}) {
  return (
    <View style={styles.host}>
      <Text variant="legal" scale="cardTitle">
        Review complete
      </Text>
      <Text variant="ui" style={styles.muted}>
        {clausesRead} clauses read · {findings.length}{' '}
        {findings.length === 1 ? 'finding' : 'findings'}
      </Text>

      {/*
        RISK FIRST. The order is not alphabetical and not the order the clauses
        appear in: an advocate reading a contract under time pressure needs the
        thing that can hurt their client at the top, and the things that are
        merely normal at the bottom.
      */}
      {ORDER.map((category) => {
        const group = findings.filter((f) => f.category === category);
        if (!group.length) return null;

        return (
          <View key={category} style={styles.group}>
            <Text variant="eyebrow" style={category === 'risk' ? styles.riskHeading : undefined}>
              {LABEL[category]} · {group.length}
            </Text>

            {group.map((f) => (
              <View key={`${category}-${f.clauseIndex}`} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text opticalNudge variant="record">
                    CLAUSE {f.clauseIndex}
                  </Text>
                  {category === 'risk' ? (
                    <Text variant="eyebrow" style={styles.riskHeading}>
                      RISK
                    </Text>
                  ) : null}
                </View>

                <Text variant="uiStrong" style={styles.finding}>
                  {f.finding}
                </Text>

                {f.detail ? (
                  <Text variant="ui" style={styles.muted}>
                    {f.detail}
                  </Text>
                ) : null}

                {/*
                  EVERY FLAGGED CLAUSE LINKS TO THE AUTHORITY IT RELIES ON.
                  That is the difference between this and a model's opinion
                  about your contract: the finding is traceable to a judgment,
                  and the judgment carries its own verification state.
                */}
                {f.authorities.map((a) => {
                  const { moved } = citationRender(a);
                  return (
                    <View key={a.judgmentId} style={styles.authority}>
                      <Text
                        variant="legal"
                        style={[
                          styles.reliesOn,
                          moved.kind === 'moved' && moved.strikeTitle ? styles.struck : null,
                        ]}
                      >
                        Relies on: {a.caseTitle}, {citationDisplay(a).text}
                      </Text>
                      {a.verificationState !== 'verified' ? (
                        <View style={styles.unconfirmed}>
                          <Text variant="uiStrong">We could not confirm this reference</Text>
                        </View>
                      ) : null}

                      {/*
                        THREE STATES, THREE TREATMENTS — `CITATION_HARNESS.md`
                        §"When the law moves", and the same `CitationMark`
                        mapping `ResultCard` uses. This surface used to draw one
                        muted line, "The law has moved on this authority", for
                        all three, which understated the state that matters
                        most here: a risk finding that RELIES ON a judgment set
                        aside in 2018 is not a caution, it is a finding with no
                        authority under it, and it read identically to a
                        doubted one.

                        `set_aside` now strikes the case name and takes the
                        danger chip, `partly_set_aside` the amber chip naming
                        the paragraphs the server sent, `doubted` the neutral
                        chip plus its sentence — it still binds.
                      */}
                      {moved.kind === 'moved' ? (
                        <CitationMark label={moved.chipLabel} tone={movedTone(moved.band)} />
                      ) : null}

                      {moved.kind === 'moved' && moved.whatStillStands ? (
                        <Text variant="ui" style={styles.stillStands}>
                          {moved.whatStillStands}
                        </Text>
                      ) : null}

                      {moved.kind === 'moved' && moved.band === 'none' ? (
                        <Text variant="ui" style={styles.moved}>
                          {moved.headline}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })}

      <View style={styles.privacy}>
        <Text variant="ui" style={styles.muted}>
          Automated detection of personal information reached{' '}
          {(pseudonymisationCoverage * 100).toFixed(1)}% on this document, measured on{' '}
          {measuredAt.slice(0, 10)}. It is partial, not complete. Read before relying on it.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: space.sm, gap: space.xs },
  muted: { color: color.inkFaint },
  group: { gap: space.xs, paddingTop: space.sm },
  riskHeading: { color: state.danger },
  card: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  finding: { color: color.ink },
  authority: { gap: 4 },
  reliesOn: { color: color.inkMuted },
  /** `set_aside` only — the case name is struck wherever it appears. */
  struck: { textDecorationLine: 'line-through' },

  /** `doubted`. One muted line, no band: still binding law. */
  moved: { color: state.cautionText },
  stillStands: { color: color.ink },
  unconfirmed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    borderRadius: radius.base,
    padding: space.xs,
  },
  privacy: { paddingTop: space.sm },
});
