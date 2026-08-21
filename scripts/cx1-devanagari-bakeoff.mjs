#!/usr/bin/env node
/** Read-only unpdf vs Poppler vs necessary-only OCR bake-off. */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { extractText, getDocumentProxy } from 'unpdf';

const ROOT = resolve(import.meta.dirname, '..');
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const MANIFEST = resolve(ROOT, arg('manifest', 'docs/ai/cx1-devanagari-results/sample-manifest.json'));
const OUT = resolve(ROOT, arg('out', 'docs/ai/cx1-devanagari-results/bakeoff-results.json'));
const OCR_LIMIT = Number(arg('ocr-limit', '8'));
const PDFTOTEXT = arg('pdftotext', 'C:/Program Files/Git/mingw64/bin/pdftotext.exe');
const TESSERACT = arg('tesseract', 'C:/Program Files/Tesseract-OCR/tesseract.exe');
const PYTHON = arg('python', 'python');
const TESSDATA = arg('tessdata', 'C:/lawmind/cx1-lab/tessdata');

const DEVANAGARI = /[\u0900-\u097f]/u;
const BASE = /[\u0904-\u0939\u0958-\u0961\u0972-\u097f]/u;
const MATRA = /[\u093a-\u094c\u094e-\u094f\u0955-\u0957\u0962-\u0963]/u;
const LATIN1 = /[\u00a0-\u00ff]/u;
/**
 * The control characters in this class are THE DEFECT BEING DETECTED, not an
 * accident. `docs/DEVANAGARI_EXTRACTION_DEFECTS.md` section 3 records a raw
 * control byte standing where a base consonant should be - the one defect class
 * of the three that destroys information and cannot be repaired by any
 * normalisation. A lint rule that removed them would silently disable the
 * detector while it went on reporting zero.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const CITATION_PATTERNS = [
  /\(\d{4}\)\s*\d+\s+(?:SCC|SCR)\s+\d+/giu,
  /\b\d{4}\s+(?:INSC|SCC\s+OnLine\s+[A-Za-z]+|AIR\s+[A-Za-z]+)\s+\d+\b/giu,
  /\bAIR\s+\d{4}\s+[A-Za-z]+\s+\d+\b/giu,
];

const normalise = (value) => value.normalize('NFC').replace(/\s+/gu, ' ').trim();
const key = (value) => normalise(value).toLocaleUpperCase('en-IN').replace(/[^\p{L}\p{N}]/gu, '');
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

function metrics(raw, document) {
  const text = normalise(raw);
  const chars = [...text];
  let orphanedMatras = 0;
  let controlAdjacency = 0;
  let latin1Bleed = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const prev = chars[i - 1] ?? '';
    const next = chars[i + 1] ?? '';
    if (MATRA.test(ch) && !BASE.test(prev) && !/[\u093c\u094d]/u.test(prev)) orphanedMatras++;
    if (CONTROL.test(ch) && (DEVANAGARI.test(prev) || DEVANAGARI.test(next))) controlAdjacency++;
    if (LATIN1.test(ch) && DEVANAGARI.test(prev) && DEVANAGARI.test(next)) latin1Bleed++;
  }
  const tokens = text.split(/[\s\p{P}\p{S}]+/u).filter(Boolean);
  const devanagariTokens = tokens.filter((token) => DEVANAGARI.test(token));
  const validTokens = devanagariTokens.filter(
    (token) => BASE.test(token) && !CONTROL.test(token) && !LATIN1.test(token),
  );
  const expectedCitations = [document.neutralCitation, ...(document.reporterCitations ?? [])].filter(Boolean);
  const detected = [...new Set(CITATION_PATTERNS.flatMap((pattern) => text.match(pattern) ?? []).map(key))];
  const expectedPresent = expectedCitations.filter((citation) => key(text).includes(key(citation))).length;
  const titleTokens = normalise(document.caseTitle)
    .split(/[\s\p{P}\p{S}]+/u)
    .filter((token) => [...token].length >= 3 && !/^(?:versus|state|court|appeal)$/iu.test(token));
  const textKey = key(text);
  const titlePresent = titleTokens.filter((token) => textKey.includes(key(token))).length;
  const lines = raw.split(/\r?\n/u);
  const nonempty = lines.filter((line) => line.trim());
  const blankParagraphs = raw.split(/(?:\r?\n\s*){2,}/u).filter((part) => part.trim()).length;
  const numberedParagraphs = nonempty.filter((line) => /^\s*(?:\d+|\(\d+\))[.)\s]/u.test(line)).length;
  return {
    chars: chars.length,
    bytes: Buffer.byteLength(text),
    devanagariTokens: devanagariTokens.length,
    validDevanagariTokens: validTokens.length,
    validDevanagariTokenRate: devanagariTokens.length
      ? Number((validTokens.length / devanagariTokens.length).toFixed(6))
      : null,
    orphanedMatras,
    orphanedMatraRate: devanagariTokens.length
      ? Number((orphanedMatras / devanagariTokens.length).toFixed(6))
      : null,
    controlAdjacency,
    latin1Bleed,
    defectEvents: orphanedMatras + controlAdjacency + latin1Bleed,
    expectedCitations: expectedCitations.length,
    expectedCitationsPresent: expectedPresent,
    detectedCitationKeys: detected,
    caseNameTokens: titleTokens.length,
    caseNameTokensPresent: titlePresent,
    caseNamePreservationRate: titleTokens.length
      ? Number((titlePresent / titleTokens.length).toFixed(6))
      : null,
    structure: {
      lines: lines.length,
      nonemptyLines: nonempty.length,
      blankSeparatedParagraphs: blankParagraphs,
      numberedParagraphs,
    },
    sha256: createHash('sha256').update(text).digest('hex'),
  };
}

async function unpdf(bytes) {
  const owned = Uint8Array.from(bytes);
  const pdf = await getDocumentProxy(owned);
  const extracted = await extractText(pdf, { mergePages: true });
  return { text: extracted.text, pages: extracted.totalPages || 1 };
}

function poppler(pdfPath) {
  return execFileSync(PDFTOTEXT, ['-q', pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 300e6,
  });
}

function ocr(pdfPath) {
  return execFileSync(
    PYTHON,
    [
      resolve(ROOT, 'scripts/cx1-ocr-pdf.py'),
      pdfPath,
      '--tesseract',
      TESSERACT,
      '--tessdata',
      TESSDATA,
    ],
    { encoding: 'utf8', maxBuffer: 300e6 },
  );
}

/**
 * ZERO DEFECTS AND ZERO DEVANAGARI ARE THE SAME NUMBER AND OPPOSITE RESULTS.
 *
 * Every defect metric here counts events INSIDE Devanagari text. A method that
 * emits no Devanagari at all therefore scores a perfect zero on all three, and
 * in the first run of this bake-off that is exactly what happened: Poppler
 * reported `orphanedMatras 0 · controlAdjacency 0 · latin1Bleed 0` against
 * unpdf's 1,986 / 546 / 69 and read as the clear winner.
 *
 * It produced **zero Devanagari tokens on 32 of 32 documents**, against unpdf's
 * 28,285, and 27 of its 32 outputs are pure ASCII (`bytes === chars`). On one
 * Allahabad 2023 judgment unpdf returned 138,406 characters carrying 17,869
 * Devanagari tokens and Poppler returned 31,476 characters carrying none — 77%
 * of the document silently absent. Poppler did not clean the Hindi. It dropped
 * it, and this table applauded.
 *
 * Every document in the manifest is Devanagari-bearing by construction, so
 * `devanagariTokens === 0` is not a data property, it is a method failure. It is
 * counted as `devanagariDropped` and, when non-zero, `usable` is false —
 * `orphanedMatras: 0` must never again be readable without it. The per-document
 * OCR routing already knew this (it treats zero tokens as a defect condition);
 * only the aggregate, which is the part anyone integrates from, did not.
 */
function aggregate(results, method) {
  const rows = results.flatMap((row) => row.methods.filter((item) => item.method === method));
  const successes = rows.filter((row) => !row.error);
  const totalTokens = successes.reduce((sum, row) => sum + row.metrics.devanagariTokens, 0);
  const validTokens = successes.reduce((sum, row) => sum + row.metrics.validDevanagariTokens, 0);
  const devanagariDropped = successes.filter((row) => row.metrics.devanagariTokens === 0).length;
  const pureAsciiOutput = successes.filter((row) => row.metrics.bytes === row.metrics.chars).length;
  return {
    attempted: rows.length,
    succeeded: successes.length,
    /**
     * `succeeded` means the process exited 0. `usable` means it returned the
     * script it was asked to extract. They are different questions and the
     * first one alone was misleading enough to nearly ship a routing rule that
     * deletes Hindi from the corpus.
     */
    usable: devanagariDropped === 0,
    devanagariDropped,
    devanagariDroppedRate: successes.length
      ? Number((devanagariDropped / successes.length).toFixed(6))
      : null,
    pureAsciiOutput,
    devanagariTokens: totalTokens,
    failureRate: rows.length ? Number(((rows.length - successes.length) / rows.length).toFixed(6)) : null,
    runtimeMs: {
      p50: percentile(successes.map((row) => row.runtimeMs), 50),
      p95: percentile(successes.map((row) => row.runtimeMs), 95),
      mean: successes.length
        ? Number((successes.reduce((sum, row) => sum + row.runtimeMs, 0) / successes.length).toFixed(2))
        : null,
    },
    validDevanagariTokenRate: totalTokens ? Number((validTokens / totalTokens).toFixed(6)) : null,
    orphanedMatras: successes.reduce((sum, row) => sum + row.metrics.orphanedMatras, 0),
    controlAdjacency: successes.reduce((sum, row) => sum + row.metrics.controlAdjacency, 0),
    latin1Bleed: successes.reduce((sum, row) => sum + row.metrics.latin1Bleed, 0),
    textChars: successes.reduce((sum, row) => sum + row.metrics.chars, 0),
    expectedCitationsPresent: successes.reduce((sum, row) => sum + row.metrics.expectedCitationsPresent, 0),
    expectedCitations: successes.reduce((sum, row) => sum + row.metrics.expectedCitations, 0),
    caseNameTokensPresent: successes.reduce((sum, row) => sum + row.metrics.caseNameTokensPresent, 0),
    caseNameTokens: successes.reduce((sum, row) => sum + row.metrics.caseNameTokens, 0),
  };
}

/**
 * --reaggregate <results.json> — rescore a completed run WITHOUT touching a PDF.
 *
 * The per-document metrics are already recorded; only the summary was wrong.
 * Re-running the whole bake-off to fix a summary would mean 32 fresh document
 * fetches and eight ~4.3s OCR passes, and it would produce a DIFFERENT run
 * rather than a corrected reading of the one whose conclusion is in circulation.
 * The correction has to apply to the evidence that was actually published.
 */
const REAGGREGATE = arg('reaggregate', '');
if (REAGGREGATE) {
  const path = resolve(ROOT, REAGGREGATE);
  const prior = JSON.parse(readFileSync(path, 'utf8'));
  const methodNames = [...new Set(prior.documents.flatMap((d) => d.methods.map((m) => m.method)))];
  prior.aggregates = Object.fromEntries(
    methodNames.map((m) => [m, aggregate(prior.documents, m)]),
  );
  prior.reaggregatedAt = new Date().toISOString();
  prior.reaggregateNote =
    'Aggregates rescored 17 Aug 2026 to add usable/devanagariDropped. The original summary scored Poppler as defect-free when it had emitted no Devanagari at all. Per-document metrics are unchanged — only the reading of them.';
  writeFileSync(path, `${JSON.stringify(prior, null, 2)}\n`);
  console.log(`rescored ${prior.documents.length} documents in ${path}\n`);
  for (const [name, a] of Object.entries(prior.aggregates)) {
    console.log(
      `${name.padEnd(24)} usable=${String(a.usable).padEnd(5)} droppedDevanagari=${a.devanagariDropped}/${a.succeeded}  devTokens=${a.devanagariTokens}  defects=${a.orphanedMatras + a.controlAdjacency + a.latin1Bleed}  p50=${a.runtimeMs.p50}ms`,
    );
  }
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
if (!existsSync(PDFTOTEXT)) throw new Error(`Poppler pdftotext not found: ${PDFTOTEXT}`);
const ocrAvailable = existsSync(TESSERACT);
const temp = mkdtempSync(join(tmpdir(), 'lawmind-cx1-devanagari-'));
const results = [];
try {
  for (const [index, document] of manifest.documents.entries()) {
    const row = { id: document.id, court: document.court, year: document.year, defectClasses: document.defects.labels, methods: [] };
    const pdfPath = join(temp, `${index}.pdf`);
    try {
      const started = performance.now();
      const response = await fetch(document.sourceUrl);
      if (!response.ok) throw new Error(`GET ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      writeFileSync(pdfPath, bytes);
      row.pdfPath = pdfPath;
      row.pdfBytes = bytes.length;
      row.downloadMs = Number((performance.now() - started).toFixed(2));

      for (const [method, run] of [
        ['unpdf', () => unpdf(bytes)],
        ['poppler', async () => ({ text: poppler(pdfPath) })],
      ]) {
        const t0 = performance.now();
        try {
          const got = await run();
          row.methods.push({ method, runtimeMs: Number((performance.now() - t0).toFixed(2)), metrics: metrics(got.text, document) });
          if (got.pages) row.pages = got.pages;
        } catch (error) {
          row.methods.push({ method, runtimeMs: Number((performance.now() - t0).toFixed(2)), error: String(error?.message ?? error) });
        }
      }
    } catch (error) {
      row.fetchError = String(error?.message ?? error);
    }
    results.push(row);
    console.log(`${index + 1}/${manifest.documents.length} ${document.court} ${document.year} ${row.fetchError ? 'FETCH_FAIL' : 'ok'}`);
  }

  if (ocrAvailable && OCR_LIMIT > 0) {
    const eligible = results.filter((row) => {
      const unpdfResult = row.methods.find((item) => item.method === 'unpdf' && !item.error);
      const popplerResult = row.methods.find((item) => item.method === 'poppler' && !item.error);
      return (
        unpdfResult?.metrics.defectEvents > 0 &&
        (popplerResult?.metrics.defectEvents > 0 || popplerResult?.metrics.devanagariTokens === 0)
      );
    });
    const byCourt = new Map();
    for (const row of eligible) {
      if (!byCourt.has(row.court)) byCourt.set(row.court, []);
      byCourt.get(row.court).push(row);
    }
    for (const rows of byCourt.values()) rows.sort((a, b) => a.pages - b.pages || a.id.localeCompare(b.id));
    const selected = [];
    while (selected.length < OCR_LIMIT && [...byCourt.values()].some((rows) => rows.length)) {
      for (const rows of byCourt.values()) {
        if (rows.length && selected.length < OCR_LIMIT) selected.push(rows.shift());
      }
    }
    for (const [index, row] of selected.entries()) {
      const document = manifest.documents.find((item) => item.id === row.id);
      const t0 = performance.now();
      try {
        const text = ocr(row.pdfPath);
        row.methods.push({ method: 'ocr_tesseract_hin_eng', runtimeMs: Number((performance.now() - t0).toFixed(2)), metrics: metrics(text, document) });
      } catch (error) {
        row.methods.push({ method: 'ocr_tesseract_hin_eng', runtimeMs: Number((performance.now() - t0).toFixed(2)), error: String(error?.message ?? error) });
      }
      console.log(`OCR ${index + 1}/${selected.length} ${row.court} ${row.year} ${row.pages} pages`);
    }
  }
  for (const row of results) delete row.pdfPath;
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const methods = ['unpdf', 'poppler', 'ocr_tesseract_hin_eng'];
const artifact = {
  kind: 'cx1_devanagari_bakeoff_results',
  createdAt: new Date().toISOString(),
  manifest: MANIFEST.replace(`${ROOT}\\`, '').replaceAll('\\', '/'),
  controls: {
    poppler: PDFTOTEXT,
    ocr: ocrAvailable ? `${TESSERACT} (hin+eng best, 250 dpi, psm 6)` : 'unavailable',
    ocrRouting: `only when unpdf and Poppler both have structural defects; cap ${OCR_LIMIT}`,
  },
  aggregates: Object.fromEntries(methods.map((method) => [method, aggregate(results, method)])),
  documents: results,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`wrote ${OUT}`);
