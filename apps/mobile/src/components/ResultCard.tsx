import { CircleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { CitationMark } from './CitationMark';
import { Pressable } from './Pressable';
import { Text } from './Text';
import type { SearchResult } from '../api/contract';
import { citationRender } from '../citation/renderState';
import { color, radius, space, state } from '../theme/tokens';

/**
 * A judgment as it appears in a list. THE ONLY CARD THAT DRAWS A CITATION.
 *
 * VERIFIED RENDERS NOTHING. No badge, chip, tick, ring or colour. On a
 * five-result list that is zero marks instead of five. Verification did not
 * become less important — it became the floor, and a product that decorates its
 * floor has nothing left to say when the floor gives way.
 *
 * Two states draw, and they differ by SHAPE, not only by colour — a dashed edge
 * versus a filled block. Shape is the only property that survives sunlight
 * washout, a dirty screen and colour-vision deficiency.
 *
 * Both marks can appear on ONE card. A judgment can be `verified` and
 * `set_aside` at once, and `unverified` + `set_aside` is not a contradiction
 * either: we could not confirm it exists, and the thing it may be has moved.
 *
 * EVERY FIELD COMES FROM THE API RESPONSE, WHICH COMES FROM THE DATABASE ROW.
 * Nothing here constructs or reformats a citation string.
 * `renders/64-verified-silent@2x.png`, `docs/CITATION_HARNESS.md` §Rendering.
 */
export function ResultCard({
  result,
  onPress,
  onConfirmOnEcourts,
  statusAsOf,
}: {
  result: SearchResult;
  onPress?: () => void;
  onConfirmOnEcourts?: () => void;
  /**
   * Pass only when this row is being drawn from a status that could not be
   * re-read now. Absent means live, which is what the never-cached rule
   * requires of every online surface.
   */
  statusAsOf?: string;
}) {
  const { existence, moved } = citationRender({ ...result, statusAsOf });
  const unconfirmed = existence.kind === 'unconfirmed';
  const band = moved.kind === 'moved' ? moved.band : 'none';

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <View
        style={[
          styles.card,
          unconfirmed && styles.cardUnconfirmed,
          band === 'caution' && styles.cardCaution,
          band === 'danger' && styles.cardDanger,
        ]}
      >
        {unconfirmed ? (
          <>
            <View style={styles.markRow}>
              {/* Neutral ink, never red, never an alert triangle. Those say
                  "the product is broken"; dashed neutral ink says "open,
                  nothing was impressed here". */}
              <CircleAlert color={color.ink} size={18} strokeWidth={1.5} />
              <Text variant="uiStrong" style={styles.markHeadline}>
                {existence.headline}
              </Text>
            </View>
            <View style={styles.dashedRule} />
          </>
        ) : null}

        <View style={styles.recordRow}>
          {/*
            ALL THREE MOVED STATES CARRY A CHIP IN A LIST, including `doubted`.
            "The state is legible from the list without opening anything."
            renders/19-overruled-three-states.png, panel 3.
          */}
          {moved.kind === 'moved' ? (
            <CitationMark
              label={moved.chipLabel}
              tone={
                moved.band === 'danger'
                  ? 'moved-danger'
                  : moved.band === 'caution'
                    ? 'moved'
                    : 'moved-quiet'
              }
            />
          ) : (
            <Text opticalNudge variant="record" style={styles.citation}>
              {result.neutralCitation}
            </Text>
          )}
          <Text opticalNudge variant="record" style={styles.court}>
            {result.court}
          </Text>
        </View>

        {moved.kind === 'moved' ? (
          <Text opticalNudge variant="record">
            {result.neutralCitation}
          </Text>
        ) : null}

        {/* `set_aside` strikes the title wherever it appears. */}
        <Text
          variant="legal"
          scale="cardTitle"
          style={moved.kind === 'moved' && moved.strikeTitle ? styles.struck : undefined}
        >
          {result.caseTitle}
        </Text>

        <Text variant="legal" style={styles.holding}>
          {result.holding}
        </Text>

        {/* What still stands is stated FIRST — it is what the advocate is
            about to rely on. Leading with what fell buries the useful half. */}
        {moved.kind === 'moved' && moved.whatStillStands ? (
          <Text variant="ui" style={styles.stillStands}>
            {moved.whatStillStands}
          </Text>
        ) : null}

        {moved.kind === 'moved' && moved.band === 'none' ? (
          <Text variant="ui" style={styles.doubtedLine}>
            {moved.headline}
          </Text>
        ) : null}

        {/* Never present a status read earlier as current. */}
        {moved.kind === 'moved' && moved.asOf ? (
          <Text variant="ui" style={styles.asOf}>
            Good-law status as of {moved.asOf}
          </Text>
        ) : null}

        {unconfirmed ? (
          <>
            <View style={styles.dashedRule} />
            <Text variant="ui" style={styles.reason}>
              {existence.reason}
            </Text>
            {/* NEVER BYPASS THE eCOURTS CAPTCHA. This pre-fills the search and
                hands it to the advocate, who solves it. The result caches
                permanently once they confirm. */}
            <Pressable accessibilityRole="link" onPress={onConfirmOnEcourts}>
              <Text variant="uiStrong" style={styles.ecourts}>
                {existence.ecourtsAction}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: color.rule,
    padding: space.sm,
    gap: space.xs,
  },
  /**
   * 1.5px dashed `inkFaint`. A CARD, NOT A CHIP — with verified silent, a
   * mark's presence is the entire signal, so the exception gets the whole room
   * rather than competing with four decorations of the ordinary.
   */
  cardUnconfirmed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    backgroundColor: color.paper,
  },
  /** Amber means exactly one thing: the law has moved. */
  cardCaution: { backgroundColor: state.cautionWash, borderColor: state.caution },
  cardDanger: { backgroundColor: color.card, borderColor: state.danger, borderLeftWidth: 2 },

  markRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  markHeadline: { flex: 1, color: color.ink },

  dashedRule: { height: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: color.rule },

  recordRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  citation: { flex: 1 },
  court: { flex: 1, textAlign: 'right' },
  struck: { textDecorationLine: 'line-through', color: color.inkMuted },
  holding: { color: color.inkMuted },
  stillStands: { color: color.ink },
  doubtedLine: { color: color.inkMuted },
  asOf: { color: color.inkFaint },
  reason: { color: color.inkMuted },
  ecourts: { color: color.oxblood },
});
