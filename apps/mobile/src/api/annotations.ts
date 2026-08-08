import type { AnnotationDraft, JudgmentParagraph } from './contract';

/**
 * TWO FIELDS, BECAUSE THEY ANSWER DIFFERENT QUESTIONS AND DIVERGE.
 *
 * Settled by LCC, 6 August 2026, and recorded here because the whole point of
 * this module is that the distinction lives in ONE place:
 *
 *   `paragraphNumber` — the number printed in the judgment (¶ 22). NULLABLE.
 *     This is the citable unit: advocates cite "para 22", PD-9 anchors on it,
 *     and `overruled_paras` is expressed in it. Older OCR'd judgments lose
 *     their numbering entirely, so it is genuinely absent sometimes and
 *     MUST NOT BE FAKED.
 *
 *   `paragraphIndex` — zero-based position in the rendered array. Always
 *     present, never citable, purely a rendering handle for scroll targeting.
 *
 * An annotation stores both: the number for anything that must survive a
 * re-render or be shared, the index for finding it on screen again.
 *
 * WHY A NUMBER IS NOT AN INDEX. Judgment numbering is neither guaranteed
 * contiguous nor guaranteed to start at 1 — judgments skip numbers, restart per
 * section, and carry sub-numbering. Treating position 11 as "¶ 11" puts an
 * advocate's note on a different paragraph than the one they marked, silently,
 * in a document they may quote into a filing.
 *
 * PARAGRAPH-LEVEL, NOT A CHARACTER RANGE — see the `Annotation` type's own
 * comment in `contract.ts`. `quote` is the paragraph's full text, matching
 * what `renders/62-judgment-reading@2x.png` actually shows: tap a paragraph,
 * get an action bar for that whole paragraph. An earlier version of this file
 * carried a `span: { start, end }` field toward sub-paragraph selection that
 * the product never asked for and the server's `quote` field never existed to
 * receive — found 8 Aug 2026 when the real endpoint turned out to require a
 * field this module never sent.
 */

/**
 * Builds the wire payload for `POST /judgments/:id/annotations`.
 *
 * Takes the rendered paragraph list rather than a bare number so the index is
 * derived from the same array the reader is looking at — the only thing that
 * makes the two fields consistent with each other.
 */
export function toWireAnnotation({
  paragraphs,
  paragraph,
  note,
  matterId,
}: {
  paragraphs: JudgmentParagraph[];
  /** The paragraph the advocate tapped, as it appears in `paragraphs`. */
  paragraph: JudgmentParagraph;
  note?: string;
  matterId?: string;
}): AnnotationDraft {
  const paragraphIndex = paragraphs.indexOf(paragraph);

  return {
    /**
     * `number` is optional on `JudgmentParagraph` precisely because an
     * unnumbered judgment has nothing to cite. It is passed through as null
     * rather than substituted with the index — a fabricated citation is the
     * failure this whole product exists to prevent, and it would be
     * indistinguishable from a real one once it is in someone's note.
     */
    paragraphNumber: paragraph.paragraphNumber ?? null,
    paragraphIndex,
    quote: paragraph.text,
    ...(note === undefined ? {} : { note }),
    ...(matterId === undefined ? {} : { matterId }),
  };
}

/**
 * Finds the paragraph an annotation refers to when the judgment is re-rendered.
 *
 * PREFERS THE PRINTED NUMBER, falls back to the index. The number survives a
 * re-render, a re-ingest and a change in how the text was split; the index
 * survives none of those and is only correct if nothing upstream moved. Where
 * the number exists it is the truth, which is exactly why it is stored.
 */
export function resolveAnnotationParagraph(
  paragraphs: JudgmentParagraph[],
  annotation: Pick<AnnotationDraft, 'paragraphNumber' | 'paragraphIndex'>
): JudgmentParagraph | undefined {
  if (annotation.paragraphNumber !== null) {
    const byNumber = paragraphs.find((p) => p.paragraphNumber === annotation.paragraphNumber);
    if (byNumber) return byNumber;
  }
  return paragraphs[annotation.paragraphIndex];
}
