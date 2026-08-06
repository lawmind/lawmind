import { StyleSheet, View } from 'react-native';

import { Text } from '../../components/Text';
import type { CounterArgumentsResponse, CounterAuthority } from '../../api/contract';
import { color, radius, space } from '../../theme/tokens';

/**
 * WHAT THE OTHER SIDE WILL LIKELY ARGUE — `FEATURE_PARITY.md` §2.9.
 *
 * ── TWO SHAPES, ONE COMPONENT ───────────────────────────────────────────────
 *
 * S1 RETURNS AUTHORITIES AND NO PROSE. `POST /arguments/counter` answers
 * `{ position, asOf, authorities, excluded, unverifiedReferences }` today;
 * `arguments` is absent, not empty, because generating the argument and the
 * rebuttal waits for S2.
 *
 * The two paths render differently ON PURPOSE, and the difference is not
 * cosmetic. A list of authorities under the heading "the other side will likely
 * argue" IS AN IMPLIED ARGUMENT — the advocate reads a claim into it that we
 * never made and cannot source. So while the prose is missing the heading says
 * what the list actually is, and one line says what it is not. When generation
 * lands the prose arrives around these same rows and nothing else moves.
 *
 * ── THE EXCLUDED LIST IS THE POINT OF THIS COMPONENT ────────────────────────
 *
 * A `set_aside` authority is not offered — it cannot be relied on, so proposing
 * it would be proposing law that does not stand. But it is NOT silently removed
 * either. It is rendered, dimmed, struck through, with the reason it was ruled
 * out.
 *
 * Two failures are avoided by showing it rather than dropping it:
 *
 *   1. Silent-drop rate is measured at a zero threshold. A reference removed
 *      without a visible state is a harness failure regardless of how good the
 *      reason was.
 *   2. An advocate who already knows that authority exists would read its
 *      absence as "Lawmind did not find it" rather than "Lawmind ruled it out",
 *      and would go looking for it themselves — which is the opposite of what
 *      the exclusion was for.
 *
 * `excluded` IS NOT AN ERROR LIST. It is a worked decision with a reason
 * attached, and it renders as one: neutral ink with a dashed edge, never amber.
 * Amber means the law has moved, which is a statement about the authority. This
 * is a statement about what WE did with it, and our own decisions are never
 * amber.
 */
export function CounterArguments({ data }: { data: CounterArgumentsResponse }) {
  const generated = data.arguments ?? [];
  const authorities = data.authorities ?? [];
  const excluded = data.excluded ?? [];
  const unverified = data.unverifiedReferences ?? [];

  return (
    <View style={styles.host}>
      {generated.length ? (
        <>
          <Text variant="eyebrow">THE OTHER SIDE WILL LIKELY ARGUE</Text>

          {generated.map((arg, i) => (
            <View key={`${i}-${arg.argument.slice(0, 24)}`} style={styles.card}>
              <Text variant="uiStrong" style={styles.argument}>
                {arg.argument}
              </Text>

              {arg.authorities.map((a) => (
                <Authority authority={a} key={a.judgmentId} />
              ))}

              <View style={styles.rebuttal}>
                <Text variant="eyebrow" style={styles.rebuttalLabel}>
                  REBUTTAL
                </Text>
                <Text variant="ui" style={styles.rebuttalText}>
                  {arg.rebuttal}
                </Text>
              </View>
            </View>
          ))}
        </>
      ) : (
        <>
          {/*
            THE HEADING STATES WHAT THE LIST IS, NOT WHAT IT IMPLIES.

            "Authorities on this point" is checkable against the corpus.
            "What the other side will argue", over a bare list, is a claim about
            an opponent's case that nothing here supports.
          */}
          <Text variant="eyebrow">AUTHORITIES ON THIS POINT</Text>

          {data.position ? (
            <Text variant="ui" style={styles.position}>
              {data.position}
            </Text>
          ) : null}

          {authorities.length ? (
            <View style={styles.card}>
              {authorities.map((a) => (
                <Authority authority={a} key={a.judgmentId} />
              ))}
            </View>
          ) : (
            <Text variant="ui" style={styles.muted}>
              We found no authority in the corpus on this point.
            </Text>
          )}

          {/*
            SAID PLAINLY RATHER THAN LEFT TO BE INFERRED FROM A SHORT SCREEN.
            An advocate who expects the argument and gets a list would otherwise
            conclude the feature is broken, or worse, that these authorities ARE
            the opposing case.
          */}
          <Text variant="ui" style={styles.muted}>
            These are authorities on the point, not the argument against you. We do not draft the
            opposing case yet.
          </Text>
        </>
      )}

      {excluded.map((x) => (
        <View key={x.judgmentId} style={styles.excluded}>
          <Text variant="ui" style={styles.excludedTitle}>
            {x.caseTitle}
          </Text>
          {x.neutralCitation ? (
            <Text opticalNudge variant="record" style={styles.struck}>
              {x.neutralCitation}
            </Text>
          ) : null}
          <View style={styles.excludedFoot}>
            <Text variant="eyebrow">EXCLUDED</Text>
            <Text variant="ui" style={styles.excludedReason}>
              This authority has been set aside, so it is not offered as a counter-argument.
            </Text>
          </View>
        </View>
      ))}

      {/*
        Anything the model referenced that no tier confirmed is listed rather
        than stripped — `unverifiedReferences` is never empty-by-omission.
      */}
      {unverified.map((u) => (
        <View key={u.citationClaimed} style={styles.unconfirmed}>
          <Text variant="uiStrong">We could not confirm this reference</Text>
          <Text opticalNudge variant="record">
            {u.citationClaimed}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Authority({ authority }: { authority: CounterAuthority }) {
  return (
    <View style={styles.authority}>
      <Text opticalNudge variant="record">
        {authority.caseTitle}, {authority.neutralCitation}
      </Text>

      {/*
        Verified is silent. Only the exception draws, in neutral ink with a
        dashed edge — our uncertainty, not the law moving.
      */}
      {authority.verificationState !== 'verified' ? (
        <View style={styles.unconfirmed}>
          <Text variant="uiStrong">We could not confirm this reference</Text>
          <Text variant="ui" style={styles.ecourts}>
            Check on eCourts
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { padding: space.sm, gap: space.xs },
  card: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
  argument: { color: color.ink },
  position: { color: color.inkMuted },
  muted: { color: color.inkFaint },
  authority: { gap: 4 },
  unconfirmed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.ink,
    borderRadius: radius.base,
    backgroundColor: color.paperDesk,
    padding: space.xs,
    gap: 4,
  },
  ecourts: { color: color.ink, textDecorationLine: 'underline' },
  rebuttal: { borderTopWidth: 1, borderTopColor: color.hairline, paddingTop: space.xs, gap: 4 },
  rebuttalLabel: { color: color.oxblood },
  rebuttalText: { color: color.inkMuted },

  excluded: {
    backgroundColor: color.paperDesk,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
  excludedTitle: { color: color.inkMuted },
  struck: { textDecorationLine: 'line-through' },
  excludedFoot: { borderTopWidth: 1, borderTopColor: color.rule, paddingTop: space.xs, gap: 4 },
  excludedReason: { color: color.inkFaint },
});
