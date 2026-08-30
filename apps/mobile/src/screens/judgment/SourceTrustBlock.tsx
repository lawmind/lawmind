import { Linking, StyleSheet, View } from 'react-native';

import { Pressable } from '../../components/Pressable';
import { Text } from '../../components/Text';
import type { JudgmentDetail } from '../../api/contract';
import { color, space } from '../../theme/tokens';

/**
 * WHERE THIS DOCUMENT CAME FROM, AND WHAT WE ACTUALLY KNOW ABOUT IT — R12 §5.
 *
 * Four separate facts, each with its own evidence and its own silence. They are
 * kept apart on the screen because conflating any two of them produces a claim
 * we cannot support:
 *
 *   1. **The source URL.** Present for 100% of the corpus. "Source: <court>,
 *      <url>" is true everywhere and is the one link that lets an advocate
 *      check us against the court itself. Never constructed, only opened.
 *   2. **The recorded provenance.** Migration 0092's four columns, put on the
 *      wire by LCC R12. **Measured 5,830 of 18,758,460 rows — 0.031%.** So this
 *      is absent for essentially everything, and absence of the RECORD is not
 *      absence of provenance. The frozen registry names the banned claim
 *      directly: *"Verified from the retained official PDF" is FALSE for 99.92%
 *      of the corpus and must never appear on a judgment surface.*
 *   3. **The text origin.** Derived per row, and the legally load-bearing one:
 *      a reporter's copy-edited text is not the court's own words (*EBC v.
 *      Modak*; `CLAUDE.md`). `REPORTER_EDITION` is stated. `UNKNOWN` is stated
 *      as unknown, never as court-sourced.
 *   4. **The date quality.** `DATE_UNCHECKED` was what the R12 probe observed
 *      and it means nobody looked. Present is not verified. Only `DATE_SUSPECT`
 *      is a contradiction, and only it gets a warning.
 *
 * NO AMBER ANYWHERE IN THIS BLOCK. Amber `#B4690E` means THE LAW HAS MOVED and
 * nothing else. Everything here is our own uncertainty about our own copy, and
 * that renders as neutral ink — muted, plain, unmissable but not alarming.
 */

const TEXT_ORIGIN_LABEL: Record<NonNullable<JudgmentDetail['textOrigin']>, string> = {
  /**
   * The one that changes what an advocate may do with the text. A reporter's
   * edition carries editorial matter that is not the court's words.
   */
  REPORTER_EDITION: 'From a law reporter’s edition — the text may include editorial matter',
  COURT_SOURCE: 'From the court’s own publication',
  /** Stated as unknown. Never quietly read as either of the other two. */
  UNKNOWN: 'The edition of this text is not recorded',
};

export function SourceTrustBlock({ judgment }: { judgment: JudgmentDetail }) {
  const provenance = judgment.provenance;
  const textOrigin = judgment.textOrigin;
  const dateState = judgment.dateQualityState;

  return (
    <View style={styles.block}>
      <Text variant="eyebrow">Where this came from</Text>

      {/*
        ALWAYS TRUE, ALWAYS SHOWN. The court is on every row, and the link is
        the check an advocate can run against us without our help.
      */}
      <Text variant="record" style={styles.line}>
        Source · {judgment.court}
      </Text>
      <Pressable
        accessibilityLabel="Open the court's own copy of this judgment"
        accessibilityRole="link"
        onPress={() => void Linking.openURL(judgment.sourceUrl)}
      >
        <Text variant="uiStrong" style={styles.link}>
          Open the court’s copy
        </Text>
      </Pressable>

      {/*
        THE EDITION. Shown whenever the server derived one — including UNKNOWN,
        because "we do not know which edition this is" is a fact an advocate
        quoting the text needs and cannot get anywhere else.
      */}
      {textOrigin !== undefined ? (
        <Text variant="record" style={styles.line}>
          {TEXT_ORIGIN_LABEL[textOrigin]}
        </Text>
      ) : null}

      {/*
        THE RECORDED PROVENANCE. Rendered ONLY where the row actually carries
        it. Where it does not, the block says nothing rather than saying
        "source unknown" — which would be a quality claim about the judgment
        when the truth is only that a structured record was never written.
      */}
      {provenance !== undefined && provenance.recorded ? (
        <Text variant="record" style={styles.line}>
          Recorded provenance · {provenance.source ?? 'unnamed source'}
          {provenance.sourceEdition === null ? '' : ` · ${provenance.sourceEdition}`}
          {provenance.basis === null ? '' : ` · held on the basis: ${provenance.basis}`}
        </Text>
      ) : null}

      {/*
        THE DATE. `DATE_SUSPECT` is the only state that contradicts anything, so
        it is the only one that warns. `DATE_UNCHECKED` and `DATE_UNKNOWN` are
        silences and are stated as silences — this is the field where "present
        is not verified" does the most damage if implied otherwise, because a
        judgment date decides which law applied.
      */}
      {dateState === 'DATE_SUSPECT' ? (
        <Text variant="record" style={styles.caution}>
          The date on this judgment does not agree with the court’s own record. Check it against
          the court’s copy before relying on it.
        </Text>
      ) : dateState === 'DATE_UNCHECKED' || dateState === 'DATE_UNKNOWN' ? (
        <Text variant="record" style={styles.line}>
          The date has not been checked against the court’s record.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * THE READER'S REFUSAL. `bodyText.evidenceWithheld` means the body text is
 * convicted damaged and `fullText` was emptied deliberately — empty by REFUSAL,
 * not by absence.
 *
 * **Never render an empty page.** An empty reader reads as "this judgment has
 * no text", which is a claim about the court rather than about our copy. Every
 * other fact about the judgment stays true and stays shown: the citation,
 * title, court, date and treatment are undamaged, and body damage is no
 * evidence against them.
 */
export function BodyTextWithheld({ judgment }: { judgment: JudgmentDetail }) {
  if (judgment.bodyText === undefined || !judgment.bodyText.evidenceWithheld) return null;
  return (
    <View style={styles.withheld}>
      <Text variant="eyebrow">The text of this judgment is not readable</Text>
      <Text variant="record" style={styles.line}>
        Our copy of this judgment’s text is damaged, so we are not showing it rather than showing
        you something the court did not write. Everything else on this page — the citation, the
        court, the date, and how later courts treated it — is unaffected.
      </Text>
      <Pressable
        accessibilityLabel="Open the court's own copy of this judgment"
        accessibilityRole="link"
        onPress={() => void Linking.openURL(judgment.sourceUrl)}
      >
        <Text variant="uiStrong" style={styles.link}>
          Open the court’s copy
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.xs, paddingVertical: space.md },
  line: { color: color.inkMuted },
  /**
   * Neutral ink with a dashed edge — the house style for OUR uncertainty.
   * Amber is reserved for LAW MOVED and appears nowhere in this file.
   */
  caution: {
    color: color.ink,
    borderLeftColor: color.ink,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    paddingLeft: space.sm,
  },
  link: { color: color.ink, textDecorationLine: 'underline' },
  withheld: {
    gap: space.xs,
    paddingVertical: space.md,
    borderTopColor: color.rule,
    borderTopWidth: 1,
  },
});
