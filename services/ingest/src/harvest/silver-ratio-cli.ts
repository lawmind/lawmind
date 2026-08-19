/**
 * NEW2 — the REAL Silver-layer compression ratio, measured on real judgment text.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * `docs/CURRENT_PLAN.md` NEW2.14 item 7 says the Silver export is calibrated on
 * "a real representative sample" and that **CX1's synthetic ratio is not used
 * for capacity planning**. CX1 reported
 * `compression_ratio_full_text_to_parquet: 117.88` on generated text, and its
 * own v2 run marked that number `INVALID FOR CAPACITY PLANNING` with the right
 * reason: *"Synthetic text does not represent LawMind legal-text entropy."*
 *
 * 117.88x is not a small overstatement. Sizing storage against it would
 * under-provision by roughly an order of magnitude, and the error would only
 * surface once the export was already running.
 *
 * This measures the same quantity on documents that are actually in the corpus's
 * source: real High Court PDFs from the AWS Open Data bucket, text extracted the
 * way the pipeline extracts it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT MEASURES, AND WHY THE SECOND NUMBER IS THE IMPORTANT ONE
 * ---------------------------------------------------------------------------
 * Two ratios, because the architecture decision depends on the difference
 * between them rather than on either alone:
 *
 *   PER DOCUMENT   each document compressed on its own. This is the ratio you
 *                  get with one object per document.
 *   CONCATENATED   the whole sample compressed as one stream. This is the ratio
 *                  you get from compact objects, because zstd can then reuse a
 *                  window across documents that share boilerplate — and Indian
 *                  judgments share a great deal of it (cause titles, "IN THE
 *                  HIGH COURT OF ...", statutory references, order formulae).
 *
 * The gap between them IS the quantified argument for the mission's "compact
 * objects rather than one-object-per-document". Reporting only the first would
 * make one-object-per-document look cheaper than it is.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DELIBERATELY DOES NOT DO
 * ---------------------------------------------------------------------------
 * - **No database connection.** It runs during the write freeze, and the text it
 *   measures is the source's, not ours. That is a deliberate limitation, stated
 *   in the output: our `full_text` has been through cleaning, so the real Silver
 *   ratio will differ. This bounds the estimate; it does not finish it.
 * - **It does not write a parquet file.** Parquet adds columnar framing and page
 *   headers on top of the codec, so a real export will land slightly WORSE than
 *   the concatenated ratio here. Quoted as an upper bound and labelled as one.
 * - **It does not project a corpus total.** A sample of a few dozen documents
 *   across a few courts is not a corpus, and multiplying it by 20,529,203 would
 *   be exactly the class of number this file exists to replace.
 *
 *   npx tsx src/harvest/silver-ratio-cli.ts --docs 60
 *   npx tsx src/harvest/silver-ratio-cli.ts --docs 120 --json
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';

import {
  listMetadataKeys,
  mapConcurrent,
  parsePartitions,
  pdfUrlFor,
  sampleRows,
} from './hc-metadata.ts';

/** The same resolution `constitution-cli.ts` uses — Git for Windows ships Poppler. */
const PDFTOTEXT = existsSync('C:/Program Files/Git/mingw64/bin/pdftotext.exe')
  ? 'C:/Program Files/Git/mingw64/bin/pdftotext.exe'
  : 'pdftotext';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const TARGET_DOCS = Number(arg('docs', '60'));
const JSON_ONLY = process.argv.includes('--json');

/**
 * A document with no text layer contributes a zero-byte string, which would drag
 * the ratio upward for a reason that has nothing to do with compression. Scans
 * are counted and reported separately rather than averaged in.
 */
const MIN_TEXT_BYTES = 200;

type Sampled = { court: string; year: number; bytes: number; text: string };

async function main(): Promise<void> {
  const objects = (await listMetadataKeys()).filter((o) => o.key.endsWith('.parquet'));

  /**
   * Spread across courts AND years rather than taking the first N of one file.
   * A ratio measured on one court is a ratio for that court's registry
   * boilerplate, and the whole point is to avoid a number that only holds where
   * it was taken.
   */
  const wanted = ['2018', '2021', '2023', '2025'];
  const chosen: { key: string; part: NonNullable<ReturnType<typeof parsePartitions>> }[] = [];
  const seen = new Set<string>();
  for (const year of wanted) {
    for (const o of objects) {
      const part = parsePartitions(o.key);
      if (!part || String(part.year) !== year || o.key.endsWith('-mobile.parquet')) continue;
      const slot = `${part.courtCode}|${year}`;
      if (seen.has(slot)) continue;
      seen.add(slot);
      chosen.push({ key: o.key, part });
      if (chosen.filter((c) => String(c.part.year) === year).length >= 4) break;
    }
  }

  const perPartition = Math.max(1, Math.ceil(TARGET_DOCS / chosen.length));
  const tmp = mkdtempSync(join(tmpdir(), 'silver-'));
  let scans = 0;
  let failed = 0;

  try {
    const batches = await mapConcurrent(chosen, 4, async ({ key, part }) => {
      /** A bounded window — never a full-file read. See COVERAGE_FRONTIER_17AUG §0b. */
      const rows = await sampleRows<{ pdf_link?: string }>(key, 0, perPartition * 3, undefined, [
        'pdf_link',
      ]);
      const out: Sampled[] = [];
      for (const row of rows) {
        if (out.length >= perPartition) break;
        if (!row.pdf_link) continue;
        try {
          const res = await fetch(pdfUrlFor(part, row.pdf_link));
          if (!res.ok) {
            failed++;
            continue;
          }
          const buf = Buffer.from(await res.arrayBuffer());
          const pdfPath = join(tmp, `d${out.length}-${part.courtCode}-${part.year}.pdf`);
          const txtPath = `${pdfPath}.txt`;
          writeFileSync(pdfPath, buf);
          execFileSync(PDFTOTEXT, [pdfPath, txtPath], { stdio: 'ignore' });
          const text = readFileSync(txtPath, 'utf8');
          rmSync(pdfPath, { force: true });
          rmSync(txtPath, { force: true });
          if (Buffer.byteLength(text) < MIN_TEXT_BYTES) {
            scans++;
            continue;
          }
          out.push({ court: part.courtCode, year: part.year, bytes: buf.length, text });
        } catch {
          failed++;
        }
      }
      return out;
    });

    const docs = batches.flat();
    if (docs.length === 0) {
      console.error('no documents with a text layer were sampled — nothing to measure');
      process.exit(1);
    }

    const rawText = docs.reduce((a, d) => a + Buffer.byteLength(d.text), 0);
    const pdfBytes = docs.reduce((a, d) => a + d.bytes, 0);

    const perDoc = docs.reduce((a, d) => a + zstdCompressSync(Buffer.from(d.text)).length, 0);
    const joined = Buffer.from(docs.map((d) => d.text).join('\n'));
    const concatenated = zstdCompressSync(joined).length;

    /**
     * THE THIRD MEASUREMENT — CAN A SHARED DICTIONARY BUY COMPACTION'S RATIO
     * WITHOUT LOSING PER-DOCUMENT ADDRESSABILITY?
     *
     * Compaction wins because zstd reuses a window across documents. A shared
     * dictionary offers the same reuse to documents compressed INDIVIDUALLY —
     * so if it closes the gap, one-object-per-document stops costing anything in
     * bytes and the compaction decision becomes purely about request count.
     *
     * **Held out on purpose.** The dictionary is built from the first fifth of
     * the sample and measured against the rest. Building it from the same
     * documents it compresses would measure how well zstd can quote text it was
     * handed, which is not a question anybody needs answered.
     *
     * **This is a RAW CONTENT dictionary, not a trained one.** Node exposes
     * zstd's dictionary parameter but not `ZDICT_trainFromBuffer`, so this is
     * held-out text used directly. A properly trained dictionary would do better,
     * which makes every figure here a FLOOR on what a dictionary is worth.
     *
     * Capped at 112 KB — zstd's own default trained-dictionary size. An
     * uncapped dictionary would flatter the result by simply containing more of
     * the corpus.
     */
    const DICT_CAP_BYTES = 112 * 1024;
    const splitAt = Math.max(1, Math.floor(docs.length / 5));
    const dictionary = Buffer.from(
      docs
        .slice(0, splitAt)
        .map((d) => d.text)
        .join('\n'),
    ).subarray(0, DICT_CAP_BYTES);
    const heldOut = docs.slice(splitAt);
    const heldOutRaw = heldOut.reduce((a, d) => a + Buffer.byteLength(d.text), 0);
    const heldOutPlain = heldOut.reduce(
      (a, d) => a + zstdCompressSync(Buffer.from(d.text)).length,
      0,
    );
    const heldOutWithDict = heldOut.reduce(
      (a, d) => a + zstdCompressSync(Buffer.from(d.text), { dictionary }).length,
      0,
    );

    const report = {
      tool: 'services/ingest/src/harvest/silver-ratio-cli.ts',
      takenAt: new Date().toISOString(),
      evidenceClass: 'MEASURED — real source documents, bounded sample',
      documents: docs.length,
      courtYearCells: chosen.length,
      scansSkippedNoTextLayer: scans,
      fetchFailures: failed,
      sourcePdfBytes: pdfBytes,
      extractedTextBytes: rawText,
      zstdPerDocumentBytes: perDoc,
      zstdConcatenatedBytes: concatenated,
      ratioPerDocument: Number((rawText / perDoc).toFixed(2)),
      ratioConcatenated: Number((rawText / concatenated).toFixed(2)),
      compactionGain: Number((perDoc / concatenated).toFixed(2)),
      dictionary: {
        kind: 'raw content, held out — NOT ZDICT-trained, so these figures are a FLOOR',
        dictionaryBytes: dictionary.length,
        builtFromDocuments: splitAt,
        measuredOnDocuments: heldOut.length,
        heldOutTextBytes: heldOutRaw,
        heldOutPerDocumentBytes: heldOutPlain,
        heldOutPerDocumentWithDictBytes: heldOutWithDict,
        ratioPerDocument: Number((heldOutRaw / heldOutPlain).toFixed(2)),
        ratioPerDocumentWithDict: Number((heldOutRaw / heldOutWithDict).toFixed(2)),
        dictionaryGain: Number((heldOutPlain / heldOutWithDict).toFixed(2)),
      },
      caveats: [
        'Source text, not our cleaned full_text — the real Silver ratio will differ.',
        'No parquet written: columnar framing costs extra, so ratioConcatenated is an UPPER BOUND on a real export.',
        'Bounded sample across a few court-year cells. Not a corpus projection, and must not be multiplied by the corpus size.',
        `CX1's synthetic 117.88x is not comparable and is not used.`,
        'The dictionary is raw held-out content, not ZDICT-trained — a trained dictionary would do better, so its gain is a floor.',
      ],
    };

    if (JSON_ONLY) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(
      `SILVER COMPRESSION — REAL SAMPLE (${docs.length} documents, ${chosen.length} court-year cells)\n`,
    );
    console.log(`  source PDF bytes        ${pdfBytes.toLocaleString().padStart(14)}`);
    console.log(`  extracted text bytes    ${rawText.toLocaleString().padStart(14)}`);
    console.log(
      `  zstd, per document      ${perDoc.toLocaleString().padStart(14)}   ratio ${report.ratioPerDocument}x`,
    );
    console.log(
      `  zstd, concatenated      ${concatenated.toLocaleString().padStart(14)}   ratio ${report.ratioConcatenated}x`,
    );
    console.log(
      `\n  COMPACTION GAIN         ${report.compactionGain}x smaller than one-object-per-document`,
    );
    console.log(
      `\n  SHARED DICTIONARY (raw held-out content, ${(dictionary.length / 1024).toFixed(0)} KB, built from ${splitAt} docs, measured on ${heldOut.length})`,
    );
    console.log(
      `    per document, no dictionary   ${heldOutPlain.toLocaleString().padStart(12)}   ratio ${report.dictionary.ratioPerDocument}x`,
    );
    console.log(
      `    per document, WITH dictionary ${heldOutWithDict.toLocaleString().padStart(12)}   ratio ${report.dictionary.ratioPerDocumentWithDict}x`,
    );
    console.log(`    DICTIONARY GAIN               ${report.dictionary.dictionaryGain}x`);
    console.log(`  documents with no text layer (scans, excluded): ${scans}`);
    console.log(`  fetch failures: ${failed}`);
    console.log('\n  caveats:');
    for (const c of report.caveats) console.log(`    - ${c}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

await main();
