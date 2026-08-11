import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Below this many characters per page, the PDF is a scan and the text layer
 * is absent or useless. **A deliberately conservative floor, not a quality
 * bar**: a real judgment page carries 1,500–3,000 characters; a page
 * yielding under 100 has no usable text at all. Measured against real High
 * Court PDFs in the extraction-cost benchmark
 * (`harvest/hc-extract.ts`, `docs/CURRENT_PLAN.md` §A3.3) before this
 * constant moved here — this is the single definition both that benchmark
 * and the real ingest path (`fetchPdfText` below, `harvest/hc-load-cli.ts`)
 * now share, per `docs/ai/AWS_CORPUS_INVENTORY.md` §6: the classifier
 * already existed, it just was not wired to persist a value per judgment.
 */
export const OCR_CHARS_PER_PAGE_FLOOR = 100;

/**
 * Whether a PDF's extracted text is native (a real text layer) rather than
 * a scan with no usable layer. Per-page, not per-document, so a 40-page
 * scan and a 1-page scan classify the same way.
 */
export function isNativeText(characters: number, pages: number): boolean {
  return characters / Math.max(1, pages) >= OCR_CHARS_PER_PAGE_FLOOR;
}

/**
 * Fetches a judgment PDF and returns its text and page count. **The PDF is
 * never written to disk** — Stage 1 alone is ~15 GB of PDFs and the text is
 * a fraction of that.
 */
export async function fetchPdfText(
  url: string,
  signal?: AbortSignal,
): Promise<{ text: string; pages: number }> {
  const res = await fetch(url, signal ? { signal } : {});
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: normaliseWhitespace(text), pages: totalPages || 1 };
}

/**
 * Strips byte sequences Postgres refuses in a `text` column.
 *
 * PDF text extraction yields NUL bytes and unpaired surrogates from judgments
 * whose embedded fonts carry broken encodings. Postgres rejects both with
 * SQLSTATE 22021, `invalid byte sequence for encoding "UTF8"`, and the error
 * aborts the whole batch — which is what silently ended the 2023 run after
 * 2020–2022 had loaded cleanly.
 *
 * Dropping these characters loses nothing readable: a NUL is not text, and an
 * unpaired surrogate is a half-character that no renderer can draw.
 */
export function stripUnstorable(text: string): string {
  return (
    text
      // NUL is rejected outright by Postgres text.
      .replace(/\0/g, '')
      // Unpaired surrogates: a high surrogate not followed by a low one, or a low
      // one not preceded by a high one.
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
      .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
  );
}

/**
 * Column-extracted PDF text arrives with ragged spacing and hard-wrapped lines.
 * Collapsing it matters twice over: `to_tsvector` tokenises on it, and chunk
 * boundaries are measured in characters.
 */
export function normaliseWhitespace(text: string): string {
  return stripUnstorable(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
