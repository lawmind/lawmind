import { StyleSheet, View } from 'react-native';

import { Text } from '../../components/Text';
import type { CounterAuthority } from '../../api/contract';
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
            <Text
              variant="eyebrow"
              style={category === 'risk' ? styles.riskHeading : undefined}
            >
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
                {f.authorities.map((a) => (
                  <View key={a.judgmentId} style={styles.authority}>
                    <Text variant="legal" style={styles.reliesOn}>
                      Relies on: {a.caseTitle}, {a.neutralCitation}
                    </Text>
                    {a.verificationState !== 'verified' ? (
                      <View style={styles.unconfirmed}>
                        <Text variant="uiStrong">We could not confirm this reference</Text>
                      </View>
                    ) : null}
                    {a.overruledStatus !== 'none' ? (
                      <Text variant="ui" style={styles.moved}>
                        The law has moved on this authority.
                      </Text>
                    ) : null}
                  </View>
                ))}
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
  moved: { color: state.cautionText },
  unconfirmed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    borderRadius: radius.base,
    padding: space.xs,
  },
  privacy: { paddingTop: space.sm },
});
