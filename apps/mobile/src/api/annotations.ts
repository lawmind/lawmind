import type { JudgmentParagraph } from './contract';

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
 */

export type AnnotationDraft = {
  /** The printed number, or null where the judgment has no numbering to cite. */
  paragraphNumber: number | null;
  /** Position in the rendered array. Always present. */
  paragraphIndex: number;
  span: { start: number; end: number };
  note?: string;
  matterId?: string;
};

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
  span,
  note,
  matterId,
}: {
  paragraphs: JudgmentParagraph[];
  /** The paragraph the advocate marked, as it appears in `paragraphs`. */
  paragraph: JudgmentParagraph;
  span: { start: number; end: number };
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
    paragraphNumber: paragraph.number ?? null,
    paragraphIndex,
    span,
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
    const byNumber = paragraphs.find((p) => p.number === annotation.paragraphNumber);
    if (byNumber) return byNumber;
  }
  return paragraphs[annotation.paragraphIndex];
}
