import { StyleSheet, View } from 'react-native';

import { CitationMark, movedTone } from '../../components/CitationMark';
import { Pressable } from '../../components/Pressable';
import { Text } from '../../components/Text';
import type { BriefingAuthority } from '../../api/contract';
import { citationDisplay, NO_CITATION_MARK } from '../../citation/citationDisplay';
import { citationRender } from '../../citation/renderState';
import { color, radius, space } from '../../theme/tokens';

/**
 * ONE AUTHORITY ON A BRIEFING.
 *
 * ── WHY THIS IS NOT A `ResultCard` ──────────────────────────────────────────
 *
 * `GET /briefings/:id` does not send a search result. It sends a union on
 * `available` carrying the case title, the citation and the four overruled
 * fields, re-read live on the request — and no holding, no operative
 * paragraph, no verification state. `BriefingScreen` passed these rows to
 * `ResultCard` as `SearchResult` until 11 Aug 2026, which typechecked only
 * because the type claimed fields the endpoint has never sent.
 *
 * It decides NOTHING about a citation itself: `citationRender` owns both
 * marks, `citationDisplay` owns the slot. This file is layout.
 *
 * ── THE UNAVAILABLE ARM IS RENDERED, NEVER SKIPPED ──────────────────────────
 *
 * `route.ts` refuses to drop an authority whose row could not be read, in its
 * own words: "an authority that vanishes from a briefing is indistinguishable
 * from one that was never cited, which is the silent-drop failure wearing
 * different clothes." A client that filtered the arm out would reintroduce
 * exactly what the server took care to avoid, one layer up.
 */
export function BriefingAuthorityRow({
  authority,
  onOpen,
  onSaveToMatter,
  saveState,
  statusAsOf,
}: {
  authority: BriefingAuthority;
  onOpen: () => void;
  /**
   * SAVES INTO THE BRIEFING'S OWN MATTER — no picker, because a briefing
   * belongs to exactly one matter and asking which one would be asking a
   * question we already know the answer to.
   *
   * The authorities in a briefing come from `judgment_annotations` — the
   * advocate's own highlights (`briefings/assemble.ts`) — NOT from
   * `matter_authorities`. So they are not already saved, and this is the
   * moment an advocate standing outside court decides one of them matters.
   */
  onSaveToMatter?: () => void;
  /** `null` while idle. The error is the server's own words, never rephrased. */
  saveState?: { saving: boolean; saved: boolean; error: string | null };
  /** Set only when this briefing came off the device — the never-cached rule. */
  statusAsOf?: string;
}) {
  if (!authority.available) {
    return (
      <View style={styles.unavailable}>
        <Text variant="uiStrong">This authority could not be read just now</Text>
        {/*
          The server's own sentence, which ends "It has not been removed from
          your briefing." Rewriting it here would be a second opinion about
          what happened, from the side that knows less.
        */}
        <Text variant="ui" style={styles.muted}>
          {authority.note}
        </Text>
      </View>
    );
  }

  const { existence, moved } = citationRender({
    verificationState: authority.verificationState,
    verifiedBySource: authority.verifiedBySource,
    overruledStatus: authority.overruledStatus,
    overruledNote: authority.overruledNote,
    overruledParas: authority.overruledParas,
    ...(statusAsOf ? { statusAsOf } : {}),
  });
  const citation = citationDisplay(authority);

  return (
    <Pressable onPress={onOpen} style={[styles.row, moved.kind === 'moved' && styles.rowMoved]}>
      {/* All three moved states carry a chip in a list, `doubted` included. */}
      {moved.kind === 'moved' ? (
        <CitationMark label={moved.chipLabel} tone={movedTone(moved.band)} />
      ) : null}

      <Text
        variant="legal"
        scale="cardTitle"
        style={moved.kind === 'moved' && moved.strikeTitle ? styles.struck : undefined}
      >
        {authority.caseTitle}
      </Text>

      <Text
        opticalNudge
        variant="record"
        style={[styles.citation, !citation.citable && styles.citationAbsent]}
      >
        {citation.text}
      </Text>

      {!citation.citable ? (
        <Text variant="ui" style={styles.uncitable}>
          {NO_CITATION_MARK}
        </Text>
      ) : null}

      {/* What still stands is stated FIRST — it is the half still being relied on. */}
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
        NAMED, NOT MERELY FLAGGED. The server joins the overruling judgment's
        case title precisely so this line can say WHICH judgment moved the law.
        An advocate who is told an authority fell, and not what felled it, has
        to go and find out at the worst possible moment.
      */}
      {moved.kind === 'moved' && authority.overruledByTitle ? (
        <Text variant="ui" style={styles.overruledBy}>
          {moved.status === 'doubted' ? 'Doubted in' : 'Set aside in'} {authority.overruledByTitle}
        </Text>
      ) : null}

      {/*
        THE STATUS'S AS-OF DATE, on an offline copy only. `CITATION_HARNESS.md`:
        an offline surface renders the status it last read WITH ITS AS-OF DATE
        SHOWN, never as current.
      */}
      {moved.kind === 'moved' && moved.asOf ? (
        <Text variant="ui" style={styles.muted}>
          Good-law status as of {moved.asOf}
        </Text>
      ) : null}

      {/*
        VERIFIED IS SILENT, and it is silent again from 11 Aug 2026.
        Until the endpoint sent `verificationState` this drew on every row —
        "absence never upgrades to confirmed" is the harness's rule and the
        client obeyed it rather than defaulting the field away. Reporting it
        (bus 0038) got the field rather than the exception.
      */}
      {existence.kind === 'unconfirmed' ? (
        <View style={styles.unconfirmed}>
          <Text variant="uiStrong">{existence.headline}</Text>
          <Text variant="ui" style={styles.muted}>
            {existence.reason}
          </Text>
        </View>
      ) : null}

      {/*
        SAVE IT INTO THE MATTER — the same refusal at both ends.

        `set_aside` is the one state where Lawmind refuses to let an authority
        be used. The server decides it (`addToMatterAllowed`, and a `409
        AUTHORITY_SET_ASIDE` if asked anyway) and the client refuses it too,
        from `moved.blocksAddToMatter`. That is not a duplicated rule: a
        replayed request or a stale build bypasses the client one, and a client
        that offered the action would be offering something that cannot happen.
        Both ends, exactly as `JudgmentScreen` does it.

        The refusal is STATED, not silent. An advocate who knows the authority
        exists and finds no button would think the feature is broken.
      */}
      {onSaveToMatter ? (
        authority.addToMatterAllowed && !(moved.kind === 'moved' && moved.blocksAddToMatter) ? (
          <Pressable
            accessibilityLabel={`Save ${authority.caseTitle} to this matter`}
            disabled={saveState?.saving || saveState?.saved}
            onPress={onSaveToMatter}
            style={styles.save}
          >
            <Text variant="ui" style={styles.saveLabel}>
              {saveState?.saved
                ? 'Saved to this matter'
                : saveState?.saving
                  ? 'Saving…'
                  : 'Save to this matter'}
            </Text>
          </Pressable>
        ) : (
          <Text variant="ui" style={styles.muted}>
            This authority has been set aside, so it cannot be added to the matter.
          </Text>
        )
      ) : null}

      {/* The server's message verbatim — on `set_aside` it names the
          replacement judgment, which is the actionable part. */}
      {saveState?.error ? (
        <Text variant="ui" style={styles.saveError}>
          {saveState.error}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.base,
    padding: space.sm,
    gap: space.xs,
  },
  rowMoved: { borderColor: color.ink },
  struck: { textDecorationLine: 'line-through' },
  citation: { color: color.inkMuted },
  citationAbsent: { color: color.inkFaint },
  /** Ink weight and a solid rule, the same mark every other surface draws. */
  uncitable: {
    color: color.ink,
    borderLeftWidth: 2,
    borderLeftColor: color.ink,
    paddingLeft: space.xs,
  },
  stillStands: { color: color.ink },
  doubtedLine: { color: color.inkMuted },
  overruledBy: { color: color.inkMuted },
  muted: { color: color.inkMuted },
  save: { alignSelf: 'flex-start', paddingVertical: 4 },
  saveLabel: { color: color.oxblood },
  saveError: { color: color.oxblood },

  /** Our own uncertainty: neutral ink, dashed edge, never amber. */
  unconfirmed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.ink,
    borderRadius: radius.base,
    backgroundColor: color.paperDesk,
    padding: space.xs,
    gap: 4,
  },
  unavailable: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    borderRadius: radius.base,
    padding: space.sm,
    gap: 4,
  },
});
