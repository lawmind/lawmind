import { CircleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { CitationMark, movedTone } from './CitationMark';
import { Pressable } from './Pressable';
import { Text } from './Text';
import type { SearchResult } from '../api/contract';
import { citationDisplay, NO_CITATION_MARK } from '../citation/citationDisplay';
import { useCopyCitation } from '../citation/useCopyCitation';
import { citationRender } from '../citation/renderState';
import { color, radius, space, state } from '../theme/tokens';

/**
 * How much of the operative paragraph a card shows before eliding.
 *
 * Four lines is roughly the two sentences an advocate needs to decide whether
 * this judgment is worth opening, and it keeps five results scannable in one
 * thumb-length. It is a DISPLAY bound, not a data bound — see the block that
 * uses it.
 */
const EVIDENCE_LINES = 4;

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
  onOpenParagraph,
  onAddToMatter,
  onConfirmOnEcourts,
  statusAsOf,
}: {
  result: SearchResult;
  onPress?: () => void;
  /**
   * Open the judgment AT the operative paragraph. Falls back to `onPress` when
   * absent, so a surface that has not wired the anchor still opens the judgment
   * rather than swallowing the tap.
   */
  onOpenParagraph?: (paragraphNumber: number) => void;
  /**
   * Add this authority to a matter.
   *
   * NOT PASSED BY ANY SURFACE YET, AND THAT IS THE POINT. Checked 11 Aug 2026:
   * there is no `matter_authorities` table and no endpoint to save an authority
   * to a matter — `packages/db/src/schema.ts` has `matters`, `matter_events`
   * and `matter_shares` and nothing else, and `JudgmentScreen`'s own
   * "Add to a matter" button has never had an `onPress` either.
   *
   * So the action is OMITTED rather than drawn dead: a button that does nothing
   * is a promise the product cannot keep, and this card is where an advocate
   * decides what to rely on. The client path — the refusal gate and its test —
   * is finished and waiting, per the handoff sent to LCC. The day the endpoint
   * lands, a surface passes this prop and the action appears, already correct.
   */
  onAddToMatter?: () => void;
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
  /**
   * WHAT GOES IN THE CITATION SLOT — `citation/citationDisplay.ts`, the only
   * place that decides it. Never `result.neutralCitation` raw: 40,980 High
   * Court rows carry none, and interpolating null drew an empty slot that read
   * as the product failing to show something it holds.
   *
   * Verification is NOT re-decided here. `citationRender` above still owns the
   * unconfirmed and LAW MOVED marks; this only answers what string to print and
   * whether the authority can go into a filing.
   */
  const citation = citationDisplay(result);

  /**
   * The same copy action `JudgmentScreen` performs, from the same hook, so a
   * result copied from the list and the same judgment copied from its own page
   * produce an identical string and an identical `citation_copies` row.
   */
  const { copied, copy } = useCopyCitation();

  /**
   * The label states what will actually land on the clipboard. With no citation
   * that is the case name alone, and saying "Copy citation" would promise
   * something the paste does not deliver.
   */
  const copyLabel = citation.citable ? 'Copy citation' : 'Copy case name';

  /** `set_aside` is the ONE case where Lawmind refuses to let an authority be used. */
  const blocked = moved.kind === 'moved' && moved.blocksAddToMatter;

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
            <CitationMark label={moved.chipLabel} tone={movedTone(moved.band)} />
          ) : (
            <Text
              opticalNudge
              variant="record"
              style={[styles.citation, !citation.citable && styles.citationAbsent]}
            >
              {citation.text}
            </Text>
          )}
          <Text opticalNudge variant="record" style={styles.court}>
            {result.court}
          </Text>
        </View>

        {/* The chip took the slot above, so the citation moves here — same
            string, same rule, still never the raw field. */}
        {moved.kind === 'moved' ? (
          <Text opticalNudge variant="record" style={!citation.citable ? styles.citationAbsent : undefined}>
            {citation.text}
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

        {/*
          AN EMPTY HOLDING IS ORDINARY, NOT BROKEN.
          Most of the real corpus has no summary until a summarisation model is
          wired. The line is omitted entirely rather than filled with a
          placeholder, a skeleton or "no summary available" — all three read as
          a failure, and none of them is true. What remains is a citation, a
          court and a case name, which is exactly what a printed reporter's
          index entry gives an advocate.
        */}
        {result.holding ? (
          <Text variant="legal" style={styles.holding}>
            {result.holding}
          </Text>
        ) : null}

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

        {/*
          THE UNMISSABLE MARK FOR AN UNCITABLE JUDGMENT — `CITATION_HARNESS.md`
          §"The fourth concern", binding 11 Aug 2026.

          ADDITIVE AND INDEPENDENT of the other three concerns: a citation-less
          judgment that is ALSO unverified, or also overruled, shows both marks.
          It never replaces them and they never replace it, because they answer
          different questions — "does this exist", "is it still good law", and
          "what do I write to refer to it".

          It does NOT disable anything. The founder decided warn-not-block
          directly: a `set_aside` judgment is bad law, while an uncitable one
          may be perfectly good law we cannot yet pin-cite, and an advocate has
          real uses for it. Only `set_aside` refuses an action.
        */}
        {!citation.citable ? (
          <Text variant="uiStrong" style={styles.uncitable}>
            {NO_CITATION_MARK}
          </Text>
        ) : null}

        {/*
          ─────────────────────────────────────────────────────────────────────
          THE EVIDENCE PASSAGE — the court's own words, in the list.

          Until 11 Aug 2026 a result card showed a citation, a court and a case
          name, and nothing else: `holding` is the only prose it drew, and
          `services/api/src/search/route.ts` sets `holding: ''` on every row
          because summarisation is not wired. So the advocate opened every
          result to read a single word of any judgment, while the server had
          been sending the operative paragraph on every row the whole time.

          GATED ON THE NUMBER, exactly as `JudgmentScreen` gates it, and for the
          same reason: unnumbered, this field is ~2,600 characters of raw OCR —
          running headers, marginal letters, mid-word hyphen breaks. A paragraph
          number is the server's statement that it located the passage in the
          judgment. Without one we have text but not a position, and text
          without a position cannot be quoted or checked.

          VERBATIM, AND NEVER TOUCHED. No cleaning, no summarising, no
          paraphrase, no ellipsis spliced into the string. Truncation is
          `numberOfLines`, which is the platform eliding the DISPLAY while the
          value stays exactly what the database row held — a client that edited
          this text would be putting words in a court's mouth on the surface
          most likely to be quoted from.
          ─────────────────────────────────────────────────────────────────────
        */}
        {result.operativeParagraph && result.operativeParagraphNumber ? (
          <Pressable
            accessibilityLabel={`Read paragraph ${result.operativeParagraphNumber} in full`}
            accessibilityRole="button"
            onPress={
              onOpenParagraph
                ? () => onOpenParagraph(result.operativeParagraphNumber!)
                : onPress
            }
          >
            <View style={styles.evidence}>
              {/* The same label the judgment screen uses, so the advocate meets
                  the same passage under the same name in both places. */}
              <Text variant="eyebrow" style={styles.evidenceLabel}>
                Operative paragraph · {result.operativeParagraphNumber}
              </Text>
              <Text
                ellipsizeMode="tail"
                numberOfLines={EVIDENCE_LINES}
                style={styles.evidenceQuote}
                variant="legal"
              >
                {result.operativeParagraph}
              </Text>
              <Text variant="uiStrong" style={styles.evidenceOpen}>
                Read ¶ {result.operativeParagraphNumber} in full
              </Text>
            </View>
          </Pressable>
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

        {/*
          ─────────────────────────────────────────────────────────────────────
          ACTIONS — LAST, so they never push the evidence down.

          The advocate reads the passage to decide, then acts. Putting the
          buttons above it would make a list of five results a list of ten
          buttons with the reasoning underneath.

          COPY IS OFFERED IN EVERY STATE, including `set_aside` and including a
          judgment we hold no citation for. What changes is the STRING, never
          the permission — `citationCopyText` omits a citation segment we do not
          have rather than inventing one. Refusing the copy would destroy the
          `citation_copies` record that is the only way to warn this advocate if
          the law moves under them later.

          ADD-TO-MATTER IS REFUSED FOR `set_aside` AND NOTHING ELSE.
          `CITATION_HARNESS.md` §"The fourth concern" is explicit that an
          uncitable judgment does NOT block it — decided by the founder
          directly, because a set-aside judgment is bad law while an uncitable
          one may be perfectly good law we cannot yet pin-cite. The mark above
          says so; the button stays live.
        */}
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={copied ? 'Copied' : copyLabel}
            accessibilityRole="button"
            onPress={() =>
              copy({
                caseTitle: result.caseTitle,
                citation,
                judgmentId: result.judgmentId,
                // `SCHEMA_TRUTH.md#citation_copies` surface enum — not a free string.
                surface: 'search',
                citationCheckId: result.citationCheckId ?? undefined,
              })
            }
          >
            <Text variant="uiStrong" style={styles.action}>
              {copied ? 'Copied' : copyLabel}
            </Text>
          </Pressable>

          {onAddToMatter ? (
            <Pressable
              accessibilityLabel={blocked ? 'Cannot be added to a matter' : 'Add to a matter'}
              accessibilityRole="button"
              disabled={blocked}
              onPress={blocked ? undefined : onAddToMatter}
            >
              <Text
                variant="uiStrong"
                style={blocked ? styles.actionRefused : styles.action}
              >
                {blocked ? 'Cannot be added to a matter' : 'Add to a matter'}
              </Text>
            </Pressable>
          ) : null}
        </View>
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
  /**
   * "No citation on record" is a FACT ABOUT THE RECORD, not a warning and not
   * our uncertainty — so it is quieter ink and nothing else. No amber (reserved
   * for the law moving), no dashed edge (reserved for what we could not
   * confirm), and no icon. The card states it; the warning belongs on the
   * actions that need a citation, per the client contract §7.
   */
  citationAbsent: { color: color.inkFaint, fontStyle: 'italic' },
  /**
   * THE MARK, and it must be unmissable without borrowing a reserved colour.
   * Not amber — the law has not moved. Not the dashed edge — that is what we
   * could not confirm. Ink weight and a solid left rule carry it instead, so
   * it survives greyscale the way the other marks do.
   */
  uncitable: {
    color: color.ink,
    borderLeftWidth: 2,
    borderLeftColor: color.ink,
    paddingLeft: space.xs,
  },
  court: { flex: 1, textAlign: 'right' },
  struck: { textDecorationLine: 'line-through', color: color.inkMuted },
  holding: { color: color.inkMuted },
  stillStands: { color: color.ink },
  doubtedLine: { color: color.inkMuted },
  asOf: { color: color.inkFaint },
  reason: { color: color.inkMuted },
  ecourts: { color: color.oxblood },

  /** Actions sit last and stay on one line — the card is a list row, not a page. */
  actions: { flexDirection: 'row', gap: space.md, paddingTop: space.xs },
  action: { color: color.oxblood },
  /** Refused, not broken: neutral ink, and the label carries the reason. */
  actionRefused: { color: color.inkFaint },

  /**
   * THE EVIDENCE BLOCK IS SET APART FROM THE CARD'S OWN VOICE.
   *
   * Everything else on this card is Lawmind describing a judgment; this is the
   * judgment. The left rule and the inset say "these are not our words" without
   * a label claiming it — and it deliberately uses `rule`, not amber and not
   * oxblood: this is neither the law moving nor an action, and both of those
   * colours are spent elsewhere.
   */
  evidence: {
    borderLeftWidth: 2,
    borderLeftColor: color.rule,
    paddingLeft: space.xs,
    gap: 4,
  },
  evidenceLabel: { color: color.inkFaint },
  /** Italic, matching `JudgmentScreen.operativeQuote` — one passage, one voice. */
  evidenceQuote: { color: color.ink, fontStyle: 'italic' },
  evidenceOpen: { color: color.oxblood },
});
