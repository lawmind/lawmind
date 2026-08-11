import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CitationMark, movedTone } from '../../components/CitationMark';
import { Pressable } from '../../components/Pressable';
import { Screen } from '../../components/Screen';
import { SectionRule } from '../../components/SectionRule';
import { SkeletonCard } from '../../components/SkeletonCard';
import { Text } from '../../components/Text';
import { api } from '../../api/client';
import type { DraftCitation, DraftDocument } from '../../api/contract';
import { citationRender } from '../../citation/renderState';
import { color, space } from '../../theme/tokens';

/**
 * A SAVED DRAFT, READ ONLY — R4. First screen to render `GET /documents/:id`.
 *
 * DELIBERATELY NOT AN EDITOR. `PATCH /documents/:id` (paragraph prose only,
 * PD-7), `POST /documents/:id/citations` (swap an authority) and export are
 * all real endpoints with no client caller yet — building an editing surface
 * means deciding interaction UX nobody has specified, which is a different
 * and larger piece of work than making a saved draft readable. This screen
 * does the second thing only.
 *
 * CITATION RENDERING GOES THROUGH `citationRender()`, THE ONE PLACE THAT
 * DECIDES — never a second, draft-specific interpretation of the same three
 * fields.
 *
 * THIS NOTE USED TO ARGUE THE OPPOSITE, AND THE ARGUMENT WAS WRONG. It read:
 * *"`overruledStatus` is coerced from `null` to `'none'` before the call: null
 * here means 'no judgment row to read a status from', which is the same fact as
 * 'nothing has moved' for rendering purposes."* Those are not the same fact.
 * Null means the citation matched no judgment we hold, so its good-law status
 * is UNKNOWN — and on every surface in this product the absence of a moved mark
 * is how we say the law has not moved. Corrected 11 Aug 2026: the null is
 * passed through as absent and the row states what it does not know.
 *
 * The stale comment is quoted rather than deleted because it is the reason the
 * defect survived — a wrong justification written down reads as a decision
 * somebody already made carefully.
 */
export function DraftDetailScreen({
  documentId,
  onBack,
  onOpenJudgment,
}: {
  documentId: string;
  onBack: () => void;
  onOpenJudgment: (judgmentId: string, citationCheckId: string) => void;
}) {
  const [document, setDocument] = useState<DraftDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api.document(documentId).then((r) => {
      if (!alive) return;
      if (r.ok) setDocument(r.data.document);
      else setLoadError(r.error.message);
    });
    return () => {
      alive = false;
    };
  }, [documentId]);

  return (
    <Screen topInset>
      <View style={styles.nav}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack}>
          <Text variant="ui" style={styles.link}>
            ‹ Drafts
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loadError ? (
          <Text variant="ui" style={styles.error}>
            {loadError}
          </Text>
        ) : document ? (
          <>
            <Text variant="eyebrow">{humanize(document.documentType)}</Text>
            <Text variant="ui" style={styles.muted}>
              {formatWhen(document.createdAt)}
              {document.language === 'hi' ? ' · हिं' : ''}
            </Text>

            {/*
              THE ONE PLACE "VERIFIED" IS A NUMBER RATHER THAN A SILENT
              ABSENCE — documented as the exception in
              `docs/API_CONTRACTS.md` §Drafting, not a lapse of the
              verified-is-silent rule everywhere else in the app.
            */}
            <Text variant="ui" style={styles.summary}>
              {document.citationSummary.verified} of {document.citationSummary.total} citations verified.
            </Text>

            {/*
              PRODUCT RULE, `CLAUDE.md`: every generated document carries this
              until the advocate removes it deliberately. Nothing on this
              screen can remove it — it is read-only — so it always shows.
            */}
            <Text variant="ui" style={styles.aiMark}>
              AI-assisted draft — verify before filing
            </Text>

            <View style={styles.rule} />

            {document.content
              .split(/\n{2,}/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((paragraph, index) => (
                <Text key={`${index}-${paragraph.slice(0, 24)}`} variant="legal" style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}

            {document.citations.length > 0 ? (
              <>
                <SectionRule label="Citations" />
                {document.citations.map((citation) => (
                  <DraftCitationRow citation={citation} key={citation.citationCheckId} onOpenJudgment={onOpenJudgment} />
                ))}
              </>
            ) : null}
          </>
        ) : (
          <SkeletonCard index={0} />
        )}
      </ScrollView>
    </Screen>
  );
}

function DraftCitationRow({
  citation,
  onOpenJudgment,
}: {
  citation: DraftCitation;
  onOpenJudgment: (judgmentId: string, citationCheckId: string) => void;
}) {
  /**
   * `overruledStatus: null` MEANS UNKNOWN, AND IT WAS BEING COERCED TO `none`.
   *
   * `readDocument` in `documents/route.ts` reads the status through a
   * `LEFT JOIN judgments`, so it is null on exactly the rows where the citation
   * resolved to no judgment we hold. `?? 'none'` turned "we cannot say whether
   * this authority is still good law" into "the law has not moved" — and on
   * every other surface the ABSENCE of a moved mark is precisely that claim.
   * Silence is how this product says good law; spending it on an unknown is
   * inventing certainty on the one axis a draft is filed against.
   *
   * `undefined` is passed instead of a fabricated value. `citationRender` draws
   * no moved mark for it — correct, because nothing told us the law moved — and
   * the unresolved row says what it does not know in its own line below.
   */
  const { existence, moved } = citationRender({
    verificationState: citation.verificationState,
    ...(citation.overruledStatus === null ? {} : { overruledStatus: citation.overruledStatus }),
  });
  const label = citation.caseTitle ?? citation.citationClaimed;
  const openable = citation.judgmentId !== null;

  const row = (
    <View style={styles.citationRow}>
      <Text variant="uiStrong" style={openable ? undefined : styles.muted}>
        {label}
      </Text>
      {existence.kind === 'unconfirmed' ? <CitationMark label="Not confirmed" tone="unconfirmed" /> : null}
      {moved.kind === 'moved' ? (
        <CitationMark label={moved.chipLabel} tone={movedTone(moved.band)} />
      ) : null}
      {/*
        THE UNRESOLVED ROW SAYS WHAT IT DOES NOT KNOW.
        Not openable, not markable, and — until now — silent about its
        good-law status, which reads as "no issue". A citation in a document
        the advocate is about to file deserves the plainer answer.
      */}
      {citation.overruledStatus === null ? (
        <Text variant="ui" style={styles.unresolved}>
          We could not match this to a judgment we hold, so we cannot say whether it is still good
          law.
        </Text>
      ) : null}
    </View>
  );

  if (!openable) return row;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpenJudgment(citation.judgmentId!, citation.citationCheckId)}
    >
      {row}
    </Pressable>
  );
}

/** "bail_application" -> "Bail application". Not a translation, just readable. */
function humanize(documentType: string): string {
  const s = documentType.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "6 August 2026." Never a raw ISO timestamp on screen. */
function formatWhen(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingVertical: space.xs },
  link: { color: color.oxblood },
  body: { padding: space.sm, gap: space.xs, paddingBottom: space.xxl },

  unresolved: { color: color.ink },
  muted: { color: color.inkMuted },
  error: { color: color.oxblood },
  summary: { color: color.inkMuted, marginTop: space.xs },
  aiMark: { color: color.inkFaint, fontStyle: 'italic' },
  rule: { height: 1, backgroundColor: color.ink, marginVertical: space.xs },
  paragraph: { marginBottom: space.sm },

  citationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
});
