import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { extractText, getDocumentProxy } from 'unpdf';

import { classifyCorruption } from './text-corruption.ts';

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
export type TextExtractionMethod = 'unpdf' | 'pdftotext_fallback';

export async function fetchPdfText(
  url: string,
  signal?: AbortSignal,
): Promise<{ text: string; pages: number; method: TextExtractionMethod }> {
  const res = await fetch(url, signal ? { signal } : {});
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const primary = normaliseWhitespace(text);

  /**
   * FALL BACK TO POPPLER WHEN `unpdf` SHATTERS THE TEXT.
   *
   * Measured 12 Aug 2026: **2,403 of 6,493 Bombay High Court judgments (37.0%)
   * extracted to unreadable text**, against 0.00% at every other court in the
   * corpus. The failure is systematic character DROPPING, not misreading —
   * `voc te for t e etitio e` for *"advocate for the petitioner"* — because
   * those PDFs embed subsetted fonts with an incomplete glyph→Unicode map and
   * `unpdf` silently discards every glyph it cannot resolve.
   *
   * **This is not an OCR problem and no OCR runs here**: we read the PDF's own
   * text layer. `pdftotext` resolves the same fonts correctly, and on a
   * re-extraction of 30 corrupt documents it repaired **30 of 30**, with the
   * recovered text roughly DOUBLING in length — we had been losing about half
   * the content of every affected judgment.
   *
   * `unpdf` still runs first: it needs no subprocess and is correct for
   * 99%+ of the corpus. Poppler is used only when the cheap path produced
   * something that fails `classifyCorruption`, and only kept when it is
   * genuinely better — never shorter, never still corrupt. If `pdftotext` is
   * not installed the fallback is skipped and the original text is returned,
   * so this degrades to previous behaviour rather than failing an ingest.
   */
  if (classifyCorruption(primary)?.corrupt !== true) {
    return { text: primary, pages: totalPages || 1, method: 'unpdf' };
  }
  const recovered = await pdftotextFallback(bytes);
  if (recovered !== null && recovered.length >= primary.length && classifyCorruption(recovered)?.corrupt === false) {
    return { text: normaliseWhitespace(recovered), pages: totalPages || 1, method: 'pdftotext_fallback' };
  }
  return { text: primary, pages: totalPages || 1, method: 'unpdf' };
}

/** Poppler `pdftotext` over an in-memory PDF. Null when the tool is absent or fails. */
/**
 * Poppler ships with Git for Windows but is NOT on the PATH of a process
 * launched outside Git Bash. A detached worker started from PowerShell died on
 * `spawnSync pdftotext ENOENT` for every document, while the identical command
 * worked interactively — so the binary is resolved explicitly, with the bare
 * name kept as the fallback for machines where it is properly installed.
 * `PDFTOTEXT_PATH` overrides both.
 */
const PDFTOTEXT =
  process.env['PDFTOTEXT_PATH'] ??
  (existsSync('C:/Program Files/Git/mingw64/bin/pdftotext.exe')
    ? 'C:/Program Files/Git/mingw64/bin/pdftotext.exe'
    : 'pdftotext');

/**
 * ASYNCHRONOUS, and that is the whole point of this rewrite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `execFileSync` HAD TO GO — NEW2 reproduced it three times
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This used `execFileSync` with `timeout: 30_000`, and the comment beside it
 * conceded the flaw while keeping it: **a synchronous call blocks the event
 * loop, so the caller's `withTimeout` can never fire against it.** The timeout
 * only bounds the CHILD; the parent thread is frozen for the duration
 * regardless, and stays frozen if the child ignores the signal.
 *
 * NEW2 hit it deterministically — Orissa partition `21_11/2026`, candidate #459,
 * three separate processes, immune to batch size, frozen 30+ minutes — and
 * correctly stopped restarting rather than guessing a fourth time.
 *
 * **And the concurrency win makes it worse, not better.** At `--concurrency 40`
 * a single blocking extraction stalls **39 other in-flight fetches** on that
 * worker. The 1.9x throughput gain multiplies the cost of every such stall.
 *
 * `execFile` returns to the event loop while poppler runs, so the timeout is
 * real, the other 39 fetches keep moving, and a stuck document costs one slot
 * instead of the whole worker.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES NOT FIX, AND IT MATTERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `unpdf`/pdf.js runs BEFORE this and does its font repair **synchronously on
 * the main thread**. That is the original hang this file was written to route
 * around, and no promise-based timeout can interrupt a synchronous CPU loop
 * either. If Orissa #459 still hangs after this, the cause is upstream in
 * extraction, not here, and the real fix is moving extraction to a worker
 * thread. Recorded so the next person does not re-derive it.
 */
async function pdftotextFallback(bytes: Uint8Array): Promise<string | null> {
  let dir: string | null = null;
  try {
    dir = mkdtempSync(join(tmpdir(), 'lawmind-pdf-'));
    const pdfPath = join(dir, 'in.pdf');
    writeFileSync(pdfPath, bytes);
    return await new Promise<string | null>((resolve) => {
      const child = execFile(
        PDFTOTEXT,
        ['-q', pdfPath, '-'],
        { encoding: 'utf8', maxBuffer: 200e6, timeout: 30_000 },
        (err, stdout) => resolve(err ? null : stdout),
      );
      /**
       * `timeout` sends SIGTERM, which poppler may ignore while wedged. Nothing
       * downstream can recover a worker that never gets its callback, so the
       * process is killed outright a little later.
       */
      const hard = setTimeout(() => child.kill('SIGKILL'), 35_000);
      child.on('close', () => clearTimeout(hard));
    });
  } catch {
    return null;
  } finally {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
  }
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
