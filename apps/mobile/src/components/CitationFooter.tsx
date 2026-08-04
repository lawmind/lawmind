import { StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';
import type { SearchResult } from '../api/contract';
import { citationRender } from '../citation/renderState';
import { color, radius, space } from '../theme/tokens';

/**
 * THE DRAFT FOOTER — one of the three places verification stays visible, and
 * the only one that is not the advocate tapping something.
 *
 * IN-APP ONLY. It never reaches the exported document: PD-8 removed the mark,
 * consent is taken once at onboarding, and a watermark on a court filing is
 * both patronising and a competitive disadvantage.
 *
 * COPY IS LICENCE PROTECTION, NOT AN AUDIT.
 *   "3 of 4 citations verified"  →  "One citation could put you at risk"
 * A tally is an audit of the advocate. The risk sentence is the app standing
 * between them and a cost order, which is the same fact stated from the side
 * they are on.
 *
 * EXPORT IS NEVER BLOCKED. With a risk present the primary action drops to
 * secondary reading "Export anyway" — the advocate is a professional operating
 * under their own duty to the court, and refusing to export their own document
 * would be the app overruling them.
 */
export function CitationFooter({
  citations,
  onExport,
}: {
  citations: SearchResult[];
  onExport?: () => void;
}) {
  const atRisk = citations.filter((c) => {
    const { existence, moved } = citationRender(c);
    return existence.kind === 'unconfirmed' || moved.kind === 'moved';
  });

  const clean = atRisk.length === 0;

  return (
    <View style={[styles.footer, !clean && styles.footerAtRisk]}>
      {clean ? (
        <Text variant="uiStrong">
          {citations.length === 1
            ? '1 citation safe to file'
            : `All ${citations.length} citations safe to file`}
        </Text>
      ) : (
        <>
          <Text variant="uiStrong">
            {atRisk.length === 1
              ? 'One citation could put you at risk'
              : `${atRisk.length} citations could put you at risk`}
          </Text>
          {atRisk.map((c) => (
            <Text key={c.judgmentId} variant="ui" style={styles.named}>
              {c.caseTitle} — {describe(c)}
            </Text>
          ))}
        </>
      )}

      <Button
        label={clean ? 'Export' : 'Export anyway'}
        onPress={onExport}
        variant={clean ? 'primary' : 'secondary'}
      />
    </View>
  );
}

/** Names the reason, so the footer is actionable rather than merely worrying. */
function describe(citation: SearchResult): string {
  const { existence, moved } = citationRender(citation);
  if (moved.kind === 'moved') return moved.chipLabel.toLowerCase();
  if (existence.kind === 'unconfirmed') return 'we could not confirm this exists';
  return '';
}

const styles = StyleSheet.create({
  footer: {
    borderTopWidth: 1,
    borderTopColor: color.rule,
    backgroundColor: color.card,
    padding: space.sm,
    gap: space.xs,
  },
  /**
   * Dashed neutral ink. Our uncertainty is never amber — amber means the law
   * has moved, and a draft footer is about us.
   */
  footerAtRisk: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.inkFaint,
    borderRadius: radius.base,
    margin: space.sm,
  },
  named: { color: color.inkMuted },
});
