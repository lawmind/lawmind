/**
 * Corpus quality buckets — `docs/ai/CORPUS_QUALITY.md`, Stage 4 of the DATA →
 * RETRIEVAL EXECUTION PROGRAM.
 *
 * Pure classification, same pattern as `identity.ts`: a row shape in, a
 * bucket out, no I/O. `quality-report-cli.ts` is what reads the corpus and
 * calls this per row.
 *
 * **Deliberately built ONLY from columns already 100% (or near-100%)
 * populated** — `content_hash`, `cnr`, `text_quality`, plus the Stage 3
 * duplicate-membership fact. `native_text` and `source_document_type` are
 * read where present but never required for a row to reach tier A, because
 * both are populated on a small minority of the corpus today
 * (`docs/ai/DATA_MOAT_PROGRAM.md` §6/§7 — `native_text` only on rows written
 * since migration `0035`; `source_document_type` 0.0% corpus-wide) and a
 * bucket definition that silently required them would push nearly the whole
 * corpus into a lower tier for a reason that has nothing to do with the
 * text's actual quality. Stated as a real gap, not built around.
 */

export type QualityBucket = 'A' | 'B' | 'C' | 'D';

export type QualityInput = {
  contentHash: string | null;
  cnr: string | null | undefined;
  textQuality: number | null;
  hasCitationExtraction: boolean;
  isExactDuplicate: boolean;
};

export type QualityClassification = {
  bucket: QualityBucket;
  reasons: string[];
};

const blank = (v: string | null | undefined): boolean => !v || v.trim() === '';

/**
 * A — research ready: identity complete, extraction undamaged, citation pass
 *     has actually run, and the row is not a member of an exact-duplicate
 *     group (a duplicate can still be A-quality text; it is bucketed B
 *     because a search surface showing the same text under 124 titles is a
 *     real product cost even when the text itself is fine — `docs/ai/
 *     DEDUPLICATION.md` §6 leaves the display decision open, not this file).
 * B — usable with limitations: readable, but missing one signal — a lower
 *     but non-damaging `text_quality`, or exact-duplicate membership, or
 *     citation extraction has not yet run.
 * C — poor extraction: `text_quality` below the corpus's own established
 *     damage-proxy floor (0.90 — the same threshold every prior report in
 *     this program has used, `DATA_MOAT_PROGRAM.md` §6, not invented here).
 * D — unusable/blocked: no `content_hash` (extraction never completed far
 *     enough to hash the text) or `text_quality` is null (never scored).
 */
export function classifyQuality(row: QualityInput): QualityClassification {
  const reasons: string[] = [];

  if (blank(row.contentHash) || row.textQuality === null) {
    reasons.push(blank(row.contentHash) ? 'no content_hash' : 'text_quality never computed');
    return { bucket: 'D', reasons };
  }

  if (row.textQuality < 0.9) {
    reasons.push(`text_quality ${row.textQuality.toFixed(3)} below 0.90 floor`);
    return { bucket: 'C', reasons };
  }

  if (blank(row.cnr)) reasons.push('cnr missing');
  if (row.isExactDuplicate) reasons.push('member of an exact-duplicate group');
  if (!row.hasCitationExtraction) reasons.push('citation extraction has not run');

  const degraded = blank(row.cnr) || row.isExactDuplicate || !row.hasCitationExtraction;
  return { bucket: degraded ? 'B' : 'A', reasons };
}
