/**
 * `pnpm --filter @lawmind/ingest hc:extract` — `docs/CURRENT_PLAN.md` §A3.3:
 * **measure PDF→text extraction on 1,000 real HC PDFs and publish an honest
 * completion date.**
 *
 * **Stratified across courts, not sampled from the top of the bucket.** A
 * thousand PDFs drawn from wherever the listing starts would be a thousand
 * PDFs from Allahabad, and Allahabad is 22% of the corpus, not 100% of it. The
 * sample takes an equal share per court so that a court with a scanning habit
 * cannot hide behind one that types.
 *
 * Writes `docs/HC_EXTRACTION_SAMPLE.json`.
 */
import { writeFile } from 'node:fs/promises';

import { measureExtraction, percentile, projectCompletion } from './hc-extract.ts';
import {
  type MetadataVariant,
  listMetadataKeys,
  mapConcurrent,
  parsePartitions,
  pdfUrlFor,
  rowCount,
  sampleRows,
} from './hc-metadata.ts';

const TARGET = Number(process.env['HC_EXTRACT_SAMPLE'] ?? '1000');
const CONCURRENCY = Number(process.env['HC_EXTRACT_CONCURRENCY'] ?? '8');
const VARIANT = (process.env['HC_EXTRACT_VARIANT'] ?? 'plain') as MetadataVariant;
const OUT_PATH = new URL('../../../../docs/HC_EXTRACTION_SAMPLE.json', import.meta.url);

/** Only the last decade — that is what §A3.2 would actually ingest. */
const FROM_YEAR = Number(process.env['HC_EXTRACT_FROM_YEAR'] ?? '2016');
const TO_YEAR = Number(process.env['HC_EXTRACT_TO_YEAR'] ?? '9999');
/** Narrow to one court code to chase a pattern the full sample surfaced. */
const ONLY_COURT = process.env['HC_EXTRACT_COURT'];

console.log(`HIGH COURT EXTRACTION SAMPLE — ${TARGET} PDFs, ${VARIANT} variant, ${FROM_YEAR}+`);
console.log('='.repeat(74));

const keys = await listMetadataKeys();
const candidates = keys
  .map(({ key }) => ({ key, p: parsePartitions(key) }))
  .filter(
    (x) =>
      x.p &&
      x.p.variant === VARIANT &&
      x.p.year >= FROM_YEAR &&
      x.p.year <= TO_YEAR &&
      (!ONLY_COURT || x.p.courtCode === ONLY_COURT),
  )
  .map((x) => ({ key: x.key, p: x.p! }));

const courts = [...new Set(candidates.map((c) => c.p.courtCode))].sort();
const perCourt = Math.max(1, Math.round(TARGET / courts.length));
console.log(`${courts.length} courts · ~${perCourt} PDFs each · concurrency ${CONCURRENCY}`);

/* ---------------------------------------------------- pick the sample rows -- */
type Pick = { url: string; court: string };
const picks: Pick[] = [];

/**
 * **A random offset into each file, not the first rows of it.**
 *
 * The pilot took rows 0–5 of whichever file came first per court. Parquet rows
 * are written in ingest order, so the head of a file is one court's earliest
 * filings of that year — a systematically unrepresentative slice, and precisely
 * the kind of sample that would report a clean text layer for a corpus that has
 * a scanning habit later in the year. The offset is drawn from the file's own
 * row count, which the footer already gives for free.
 */
await mapConcurrent(courts, 4, async (court) => {
  const files = candidates.filter((c) => c.p.courtCode === court);
  const mine: Pick[] = [];
  for (let i = 0; mine.length < perCourt && i < files.length * 6; i++) {
    // Walk files in a rotating order so years and benches both vary.
    const file = files[(i * 7 + i * i) % files.length]!;
    try {
      const total = await rowCount(file.key);
      if (total === 0) continue;
      const want = Math.min(5, perCourt - mine.length, total);
      const offset = Math.floor(Math.random() * Math.max(1, total - want));
      const rows = await sampleRows<{ pdf_link?: string; court?: string }>(
        file.key,
        offset,
        offset + want,
      );
      for (const row of rows) {
        if (mine.length >= perCourt) break;
        if (!row.pdf_link) continue;
        mine.push({ url: pdfUrlFor(file.p, row.pdf_link), court: row.court?.trim() || court });
      }
    } catch {
      /* a file we cannot sample is not a file we count — it simply supplies none */
    }
  }
  picks.push(...mine);
});

console.log(`sampled ${picks.length} PDF references`);
console.log('downloading and extracting ...');

/* ------------------------------------------------------------- measure it -- */
const t0 = Date.now();
let done = 0;
const samples = await mapConcurrent(picks, CONCURRENCY, async (pick) => {
  const s = await measureExtraction(pick.url, pick.court);
  if (++done % 100 === 0) console.log(`  ... ${done}/${picks.length}`);
  return s;
});
const wallMs = Date.now() - t0;

/* --------------------------------------------------------------- report it -- */
const by = (o: string) => samples.filter((s) => s.outcome === o);
const extracted = by('extracted');
const needsOcr = by('needs_ocr');
const missing = by('missing');
const failed = by('failed');
const share = (n: number) => `${((n / samples.length) * 100).toFixed(1)}%`;

console.log('');
console.log(`${samples.length} PDFs in ${(wallMs / 1000).toFixed(1)} s wall clock`);
console.log('');
console.log(`  extracted   ${String(extracted.length).padStart(5)}  ${share(extracted.length)}`);
console.log(
  `  needs OCR   ${String(needsOcr.length).padStart(5)}  ${share(needsOcr.length)}   (no usable text layer)`,
);
console.log(
  `  missing     ${String(missing.length).padStart(5)}  ${share(missing.length)}   (metadata references a PDF the bucket does not serve)`,
);
console.log(`  failed      ${String(failed.length).padStart(5)}  ${share(failed.length)}`);

const usable = [...extracted, ...needsOcr];
const dl = usable.map((s) => s.downloadMs);
const ex = usable.map((s) => s.extractMs);
const chars = extracted.map((s) => s.characters);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

console.log('');
console.log('PER PDF (fetched successfully):');
console.log(
  `  download   mean ${mean(dl).toFixed(0).padStart(6)} ms   p95 ${percentile(dl, 95).toFixed(0).padStart(6)} ms`,
);
console.log(
  `  extract    mean ${mean(ex).toFixed(0).padStart(6)} ms   p95 ${percentile(ex, 95).toFixed(0).padStart(6)} ms`,
);
console.log(`  bytes      mean ${mean(usable.map((s) => s.bytes)).toFixed(0)}`);
console.log(`  pages      mean ${mean(usable.map((s) => s.pages)).toFixed(1)}`);
console.log('');
console.log('EXTRACTED TEXT LENGTH (characters):');
console.log(
  `  mean ${mean(chars).toFixed(0)} · median ${percentile(chars, 50)} · p95 ${percentile(chars, 95)}`,
);
console.log(`  under 1,000 chars: ${chars.filter((c) => c < 1000).length} of ${chars.length}`);

/* The projection. Inputs printed beside the answer, per hc-extract.ts. */
const DOCUMENTS = 15_771_566; // docs/HC_CORPUS_SURVEY.md, last 10 years
const msPerDoc = mean(dl) + mean(ex);
console.log('');
console.log('PROJECTED COMPLETION — 15,771,566 documents (last 10 years):');
console.log(
  `  measured cost per PDF: ${msPerDoc.toFixed(0)} ms (${mean(dl).toFixed(0)} download + ${mean(ex).toFixed(0)} extract)`,
);
for (const workers of [1, 8, 32, 128]) {
  const p = projectCompletion({ documents: DOCUMENTS, msPerDocument: msPerDoc, workers });
  console.log(
    `  ${String(workers).padStart(4)} workers → ${p.days.toFixed(1).padStart(8)} days (${p.hours.toFixed(0)} h)`,
  );
}

const ocrShare = needsOcr.length / Math.max(1, extracted.length + needsOcr.length);
console.log('');
console.log(`OCR BURDEN: ${(ocrShare * 100).toFixed(1)}% of fetched PDFs have no text layer`);
console.log(`  ≈ ${Math.round(DOCUMENTS * ocrShare).toLocaleString()} documents needing OCR.`);
console.log('  OCR is NOT costed here. docs/CURRENT_PLAN.md §3: paddleocr and tesseract');
console.log('  are both at the benchmark floor on Devanagari (EasyOCR 93.6 → 58.3), so');
console.log('  this is a count of the problem, not an estimate of solving it.');

await writeFile(
  OUT_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      variant: VARIANT,
      fromYear: FROM_YEAR,
      sampled: samples.length,
      courtsCovered: new Set(samples.map((s) => s.court)).size,
      wallMs,
      concurrency: CONCURRENCY,
      outcomes: {
        extracted: extracted.length,
        needs_ocr: needsOcr.length,
        missing: missing.length,
        failed: failed.length,
      },
      perPdf: {
        downloadMsMean: mean(dl),
        downloadMsP95: percentile(dl, 95),
        extractMsMean: mean(ex),
        extractMsP95: percentile(ex, 95),
        bytesMean: mean(usable.map((s) => s.bytes)),
        pagesMean: mean(usable.map((s) => s.pages)),
      },
      textLength: {
        mean: mean(chars),
        median: percentile(chars, 50),
        p95: percentile(chars, 95),
        under1000: chars.filter((c) => c < 1000).length,
      },
      projection: {
        documents: DOCUMENTS,
        msPerDocument: msPerDoc,
        byWorkers: Object.fromEntries(
          [1, 8, 32, 128].map((w) => [
            w,
            projectCompletion({ documents: DOCUMENTS, msPerDocument: msPerDoc, workers: w }),
          ]),
        ),
      },
      ocrShare,
      // Every failure, with its error. A failure rate you cannot diagnose is a
      // failure rate you will rediscover at 15 million documents instead of 1,000.
      failures: failed.map((s) => ({ url: s.url, court: s.court, error: s.error })),
      needsOcrUrls: needsOcr.map((s) => ({
        url: s.url,
        court: s.court,
        pages: s.pages,
        characters: s.characters,
      })),
      perCourt: Object.fromEntries(
        [...new Set(samples.map((s) => s.court))].sort().map((court) => {
          const mine = samples.filter((s) => s.court === court);
          return [
            court,
            {
              sampled: mine.length,
              extracted: mine.filter((s) => s.outcome === 'extracted').length,
              needsOcr: mine.filter((s) => s.outcome === 'needs_ocr').length,
              missing: mine.filter((s) => s.outcome === 'missing').length,
              failed: mine.filter((s) => s.outcome === 'failed').length,
              meanChars: mean(
                mine.filter((s) => s.outcome === 'extracted').map((s) => s.characters),
              ),
            },
          ];
        }),
      ),
    },
    null,
    2,
  ),
);
console.log('');
console.log('written: docs/HC_EXTRACTION_SAMPLE.json');
