import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { extractText, getDocumentProxy, resolvePDFJSImport } from 'unpdf';

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

/**
 * DNS failures on the S3 host are TRANSIENT, and until now they were FATAL.
 *
 * NEW2 lost two workers outright to
 * `getaddrinfo ENOTFOUND indian-high-court-judgments.s3.ap-south-1.amazonaws.com`
 * — the identical failure class `db-host.ts` already routes around for the
 * database. **This machine's only configured resolver is the consumer router at
 * `192.168.1.1`**, and it intermittently fails to answer. S3 is fine; the router
 * is not.
 *
 * The error surfaces from `fetch` as a `TypeError` with a `cause` carrying the
 * real code, so the code has to be dug out rather than matched on the top-level
 * error.
 *
 * **What this does NOT do, stated plainly:** it does not take the OS resolver
 * out of the path the way `openDb()` does. `fetch` accepts no `lookup` option,
 * and doing it properly needs either `https.request` with a custom `lookup` or
 * an undici `Agent` — undici is not a dependency here and adding one for this is
 * not the smallest correct change. So a router that is down for longer than the
 * backoff still fails, and that is the honest limit.
 *
 * What it DOES do is convert a **fatal, worker-killing** error into a retried
 * one, which is the difference between losing a court for hours and losing a
 * few seconds.
 */
const DNS_ERRORS = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT']);

export function transientNetworkCode(err: unknown): string | null {
  for (let e: unknown = err, depth = 0; e && depth < 4; depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && DNS_ERRORS.has(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

async function fetchWithRetry(url: string, signal?: AbortSignal): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fetch(url, signal ? { signal } : {});
    } catch (err) {
      // An abort is the caller's decision, never something to retry past.
      if (signal?.aborted) throw err;
      const code = transientNetworkCode(err);
      if (code === null) throw err;
      last = err;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  throw last;
}

/**
 * Resolve `unpdf`'s bundled PDF.js ONCE, before any concurrency starts.
 *
 * ---------------------------------------------------------------------------
 * THE FAILURE THIS PREVENTS, AND WHY NO `catch` COULD REACH IT
 * ---------------------------------------------------------------------------
 * Scope `hc-boot-29_3-y2023` died three times in 32 seconds on 18 Aug 2026,
 * each run ending:
 *
 *     FATAL unhandledRejection: Error
 *         at BaseExceptionClosure (unpdf/dist/pdfjs.mjs:1:7031)
 *         at ModuleJob.run (node:internal/modules/esm/module_job:430:25)
 *         at async resolvePDFJSImport (unpdf/dist/index.mjs:112:20)
 *
 * The supervisor then applied its "died within 20s three times running" rule
 * and stopped the scope. It was right to: the failure was perfectly repeatable,
 * because a restart resumes at the same checkpoint offset and replays the same
 * first batch. That is a POISON PILL, not a network blip.
 *
 * `unpdf`'s own resolver is guarded by a plain value, not a promise:
 *
 *     async function resolvePDFJSImport(...) {
 *       if (resolvedModule && !reload) return;
 *       ...
 *       resolvedModule = await import("unpdf/pdfjs");
 *     }
 *
 * With `--concurrency 32`, the first batch enters `getDocumentProxy` on 32
 * tasks at once, every one of them sees `resolvedModule` unset, and all 32 call
 * `import("unpdf/pdfjs")` before any of them can assign it. Node collapses
 * those onto one ModuleJob — and when that job's evaluation throws, the
 * rejection surfaces on the job itself rather than only on the awaited import
 * promises. Nothing in this codebase is on that promise's chain, so
 * `hc-load-cli`'s per-document `try/catch` cannot see it and the process-level
 * `unhandledRejection` handler kills the worker instead.
 *
 * The tell that it is the JOB's rejection and not the resolver's: `unpdf` wraps
 * its own failure as `new Error("Serverless PDF.js bundle could not be resolved:
 * ...")`. The fatal one has an EMPTY message. They are two different rejections
 * from the same evaluation, and only one of them was ever catchable.
 *
 * ---------------------------------------------------------------------------
 * WHAT WARMING CHANGES
 * ---------------------------------------------------------------------------
 * One serial call before the pool starts. `resolvedModule` is then set, so no
 * concurrent caller re-enters the import and the race cannot occur.
 *
 * If the bundle genuinely cannot load, this **still fails** — but it fails once,
 * at startup, as an ordinary awaited rejection the caller can report honestly,
 * instead of an uncatchable one 16 seconds into a batch. Turning an unreachable
 * error into a reachable one is the whole point; it is not a claim that the
 * bundle always loads.
 *
 * Safe to call more than once: `resolvePDFJSImport` returns immediately once
 * `resolvedModule` is set.
 */
export async function warmPdfEngine(): Promise<void> {
  await resolvePDFJSImport();
}

export async function fetchPdfText(
  url: string,
  signal?: AbortSignal,
): Promise<{ text: string; pages: number; method: TextExtractionMethod }> {
  const res = await fetchWithRetry(url, signal);
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
