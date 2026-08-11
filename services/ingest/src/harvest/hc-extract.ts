/**
 * PDF→text extraction, measured on real High Court PDFs.
 * `docs/CURRENT_PLAN.md` §A3.3 — and the reason it is the number that decides
 * the ingest: **extraction is the cost, not download or storage.** AWS sponsors
 * the transfer and `CORPUS_TIERING.md` puts the whole corpus under $8/month.
 * What nobody has measured is how long 15.77M PDFs take to turn into text, and
 * how many of them have no text to turn.
 *
 * Extraction uses the same `unpdf` path the Supreme Court ingest uses
 * (`src/text.ts`), so the number measured here is the number the real loader
 * would pay rather than a benchmark of a different library.
 */
import { extractText, getDocumentProxy } from 'unpdf';

import { normaliseWhitespace, OCR_CHARS_PER_PAGE_FLOOR } from '../text.ts';

/**
 * Re-exported, not redefined — `docs/ai/AWS_CORPUS_INVENTORY.md` §6: this
 * constant now lives in `../text.ts` so the real ingest path
 * (`fetchPdfText`, `harvest/hc-load-cli.ts`) and this benchmark share the
 * one definition. Re-exported here so existing imports of it from this
 * module keep working.
 */
export { OCR_CHARS_PER_PAGE_FLOOR };

/**
 * What one PDF cost, and what came out.
 *
 * `outcome` is deliberately four values rather than ok/failed. **A judgment
 * that downloads perfectly and yields 40 characters is not a success**, and
 * counting it as one is how an ingest reports 99% completion over a corpus of
 * empty rows.
 */
export type ExtractionSample = {
  url: string;
  court: string;
  outcome: 'extracted' | 'needs_ocr' | 'missing' | 'failed';
  httpStatus: number | null;
  bytes: number;
  pages: number;
  characters: number;
  downloadMs: number;
  extractMs: number;
  error?: string;
};

/** Downloads and extracts one PDF, timing each half separately. Never writes to disk. */
export async function measureExtraction(url: string, court: string): Promise<ExtractionSample> {
  const base = { url, court, bytes: 0, pages: 0, characters: 0, downloadMs: 0, extractMs: 0 };

  let bytes: Uint8Array;
  const t0 = Date.now();
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        ...base,
        outcome: 'missing',
        httpStatus: res.status,
        downloadMs: Date.now() - t0,
      };
    }
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (error) {
    return {
      ...base,
      outcome: 'failed',
      httpStatus: null,
      downloadMs: Date.now() - t0,
      error: String((error as Error)?.message ?? error),
    };
  }
  const downloadMs = Date.now() - t0;

  /**
   * **Read the size BEFORE pdf.js sees the array.** `getDocumentProxy` takes
   * ownership of the buffer and detaches it, after which `bytes.length` is `0`
   * — not an error, just silently zero. The first run of this measurement
   * reported a mean PDF size of **0 bytes** for fifty PDFs that had plainly
   * downloaded and extracted, which is the only reason it was caught.
   */
  const byteLength = bytes.length;

  const t1 = Date.now();
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const characters = normaliseWhitespace(text).length;
    const pages = totalPages || 1;
    return {
      url,
      court,
      // The floor is per page, so a 40-page scan and a 1-page scan classify the
      // same way. Dividing by pages is what makes this a property of the
      // document rather than of its length.
      outcome: characters / pages < OCR_CHARS_PER_PAGE_FLOOR ? 'needs_ocr' : 'extracted',
      httpStatus: 200,
      bytes: byteLength,
      pages,
      characters,
      downloadMs,
      extractMs: Date.now() - t1,
    };
  } catch (error) {
    return {
      ...base,
      outcome: 'failed',
      httpStatus: 200,
      bytes: byteLength,
      downloadMs,
      extractMs: Date.now() - t1,
      error: String((error as Error)?.message ?? error),
    };
  }
}

/** The percentile of a numeric series. Sorts a copy; the caller's array is untouched. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index]!;
}

/**
 * How long the whole corpus takes, at a measured per-PDF cost.
 *
 * **Reported as wall-clock days at a stated worker count, never as a single
 * number.** `CONTINUATION_PROMPT.md` §1 records a 274 GB estimate that was 7×
 * too high because a total was scaled by a row count without checking that the
 * unit matched. A projection is a multiplication, and the only honest way to
 * publish one is with its inputs attached.
 */
export function projectCompletion(args: {
  documents: number;
  msPerDocument: number;
  workers: number;
}): { hours: number; days: number; perWorkerHours: number } {
  const totalMs = args.documents * args.msPerDocument;
  const hours = totalMs / args.workers / 3_600_000;
  return {
    hours,
    days: hours / 24,
    perWorkerHours: totalMs / 3_600_000,
  };
}
