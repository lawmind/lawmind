/**
 * What KIND of document the PLAIN High Court variant holds — measured on a real
 * sample, straight from the bucket, with no database connection.
 *
 * ---------------------------------------------------------------------------
 * THE HOLE THIS FILLS
 * ---------------------------------------------------------------------------
 * The standing caveat on every corpus figure is "documents, not judgments", and
 * the number usually attached to it is the **0.75%–18.64%** judgment share from
 * `docs/HC_ORDER_TYPES.json`. That range does not support the use it gets:
 * `hc-ordertype-cli.ts` measures the `order_type` column, which exists **only on
 * `metadata-mobile.parquet`** — 1,291,519 rows, four courts, **6.3% of the
 * corpus** — and its own header says the result "must never be quoted as a
 * corpus-wide judgment count".
 *
 * It is worse than narrow. The plain and mobile files are **disjoint record
 * sets** (zero shared CNRs, confirmed independently on `pdf_link` 17 Aug), so a
 * rate measured on the mobile variant is not a rate for the other 93.7% — it is
 * a rate for a different population that happens to live in the same bucket.
 *
 * **So the composition of 93.7% of the corpus has never been measured.** The
 * plain files publish no `order_type`, which is why: the answer needs the
 * document's text, not its metadata.
 *
 * ---------------------------------------------------------------------------
 * HOW IT ANSWERS THE QUESTION WITHOUT INVENTING ONE
 * ---------------------------------------------------------------------------
 * It runs the existing deterministic classifier, `classifyHcDocument`, which is
 * already the project's answer to this question on the database side. Nothing is
 * re-implemented here and no rule lives in this file — the same code path that
 * classifies production rows classifies the sample, so the two are comparable
 * rather than merely similar.
 *
 * The classifier needs three inputs. Two come from the parquet metadata
 * (`disposal_nature`, and the case number carried in `title`) and the third —
 * `fullText` — comes from fetching the PDF and extracting it with the same
 * Poppler binary the pipeline uses. That is the whole reason this is a sample
 * and not a survey: metadata is a range request, text is a document fetch.
 *
 * **`unclassified` is reported as its own line and never folded into a class.**
 * `hc-classify.ts` is explicit that *not classified* must not become *classified
 * as ordinary*, and a summary that hides the residual would defeat the one
 * property that makes the classifier trustworthy.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES NOT CLAIM
 * ---------------------------------------------------------------------------
 * - **It does not say what is an authority.** `hc-classify.ts` refuses that
 *   question deliberately — precedential weight is about reasoning and ratio,
 *   not about a metadata field — and this file inherits the refusal. `decided`
 *   means "a merits disposal with enough text to contain reasoning", which is an
 *   upper bound on the authority share and not the share itself.
 * - **A sample is not the corpus.** Court-year cells are chosen for spread, not
 *   drawn at random from all 20,529,203 documents, so the result is indicative.
 *   It replaces "unmeasured" with "measured on N documents", which is a real
 *   improvement and not the same as a corpus rate.
 * - **It writes nothing.** No database, no checkpoint, no ingest.
 *
 *   npx tsx src/harvest/hc-class-sample-cli.ts --docs 120
 *   npx tsx src/harvest/hc-class-sample-cli.ts --docs 240 --json
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { classifyHcDocument, type HcDocumentClass } from '../hc-classify.ts';

import {
  listMetadataKeys,
  mapConcurrent,
  parsePartitions,
  pdfUrlFor,
  sampleRows,
} from './hc-metadata.ts';

const PDFTOTEXT = existsSync('C:/Program Files/Git/mingw64/bin/pdftotext.exe')
  ? 'C:/Program Files/Git/mingw64/bin/pdftotext.exe'
  : 'pdftotext';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const TARGET_DOCS = Number(arg('docs', '120'));
const JSON_ONLY = process.argv.includes('--json');

/**
 * The case number as the source prints it, e.g.
 * `APPLN/4652/2024 of RUPESH ... Vs SAMPADA ...` → `APPLN/4652/2024`.
 * `classifyHcDocument` reads a prefix off this, so taking the whole title would
 * hand it the party names too and change which rules fire.
 */
function caseNumberFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const head = title.split(' of ')[0]?.trim();
  return head && head.length > 0 ? head : null;
}

type Row = { pdf_link?: string; disposal_nature?: string | null; title?: string | null };

async function main(): Promise<void> {
  const objects = (await listMetadataKeys()).filter(
    (o) => o.key.endsWith('.parquet') && !o.key.endsWith('-mobile.parquet'),
  );

  /** Spread across years and courts — a composition measured on one court is that court's docket. */
  const years = ['2018', '2021', '2023', '2025'];
  const chosen: { key: string; part: NonNullable<ReturnType<typeof parsePartitions>> }[] = [];
  const seen = new Set<string>();
  for (const year of years) {
    let taken = 0;
    for (const o of objects) {
      const part = parsePartitions(o.key);
      if (!part || String(part.year) !== year) continue;
      const slot = `${part.courtCode}|${year}`;
      if (seen.has(slot)) continue;
      seen.add(slot);
      chosen.push({ key: o.key, part });
      if (++taken >= 5) break;
    }
  }

  const perCell = Math.max(1, Math.ceil(TARGET_DOCS / chosen.length));
  const tmp = mkdtempSync(join(tmpdir(), 'hcclass-'));
  let noTextLayer = 0;
  let failed = 0;
  let noDisposal = 0;

  try {
    const batches = await mapConcurrent(chosen, 4, async ({ key, part }) => {
      /** Bounded window, never a full-file read — see COVERAGE_FRONTIER_17AUG §0b. */
      const rows = await sampleRows<Row>(key, 0, perCell * 3, undefined, [
        'pdf_link',
        'disposal_nature',
        'title',
      ]);
      const out: { documentClass: HcDocumentClass | null; method: string; chars: number }[] = [];
      for (const row of rows) {
        if (out.length >= perCell) break;
        if (!row.pdf_link) continue;
        try {
          const res = await fetch(pdfUrlFor(part, row.pdf_link));
          if (!res.ok) {
            failed++;
            continue;
          }
          const pdfPath = join(tmp, `c${out.length}-${part.courtCode}-${part.year}.pdf`);
          const txtPath = `${pdfPath}.txt`;
          writeFileSync(pdfPath, Buffer.from(await res.arrayBuffer()));
          execFileSync(PDFTOTEXT, [pdfPath, txtPath], { stdio: 'ignore' });
          const fullText = readFileSync(txtPath, 'utf8');
          rmSync(pdfPath, { force: true });
          rmSync(txtPath, { force: true });
          /**
           * A scan with no text layer would be classified on length alone and
           * land in `reference_stub` — a wrong answer produced confidently.
           * Counted separately instead.
           */
          if (fullText.trim().length < 40) {
            noTextLayer++;
            continue;
          }
          if (!row.disposal_nature) noDisposal++;
          const verdict = classifyHcDocument({
            disposalNature: row.disposal_nature ?? null,
            caseNumber: caseNumberFromTitle(row.title),
            fullText,
          });
          out.push({ ...verdict, chars: fullText.length });
        } catch {
          failed++;
        }
      }
      return out;
    });

    const docs = batches.flat();
    if (docs.length === 0) {
      console.error('no documents classified — nothing to report');
      process.exit(1);
    }

    const byClass = new Map<string, number>();
    const charsByClass = new Map<string, number>();
    for (const d of docs) {
      const k = d.documentClass ?? 'unclassified';
      byClass.set(k, (byClass.get(k) ?? 0) + 1);
      charsByClass.set(k, (charsByClass.get(k) ?? 0) + d.chars);
    }
    const byMethod = new Map<string, number>();
    for (const d of docs) byMethod.set(d.method, (byMethod.get(d.method) ?? 0) + 1);

    const decided = byClass.get('decided') ?? 0;
    const report = {
      tool: 'services/ingest/src/harvest/hc-class-sample-cli.ts',
      takenAt: new Date().toISOString(),
      evidenceClass: 'MEASURED — plain variant, real sample, deterministic classifier',
      variant: 'plain (metadata.parquet) — the 93.7% the mobile order_type survey does NOT cover',
      documentsClassified: docs.length,
      courtYearCells: chosen.length,
      skippedNoTextLayer: noTextLayer,
      rowsWithNoDisposalNature: noDisposal,
      fetchFailures: failed,
      byClass: Object.fromEntries([...byClass].sort((a, b) => b[1] - a[1])),
      byMethod: Object.fromEntries([...byMethod].sort((a, b) => b[1] - a[1])),
      meanCharsByClass: Object.fromEntries(
        [...charsByClass].map(([k, v]) => [k, Math.round(v / (byClass.get(k) ?? 1))]),
      ),
      decidedSharePercent: Number(((100 * decided) / docs.length).toFixed(2)),
      caveats: [
        '`decided` is an UPPER BOUND on the authority share: it means a merits disposal long enough to contain reasoning, not that reasoning is present.',
        'Court-year cells are chosen for spread, not drawn at random from the corpus. Indicative, not a corpus rate.',
        'Documents with no text layer are excluded and counted, never classified on length alone.',
        'Does not supersede docs/HC_ORDER_TYPES.json — that measures the DISJOINT mobile variant. These are two populations, not two estimates of one.',
      ],
    };

    if (JSON_ONLY) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(
      `HIGH COURT DOCUMENT CLASS — PLAIN VARIANT (${docs.length} documents, ${chosen.length} court-year cells)\n`,
    );
    for (const [k, n] of [...byClass].sort((a, b) => b[1] - a[1])) {
      const pct = ((100 * n) / docs.length).toFixed(1);
      console.log(
        `  ${k.padEnd(20)} ${String(n).padStart(5)}  ${pct.padStart(5)}%   mean ${(report.meanCharsByClass[k] ?? 0).toLocaleString()} chars`,
      );
    }
    console.log(
      `\n  decided share (UPPER BOUND on authority share): ${report.decidedSharePercent}%`,
    );
    console.log(`  skipped, no text layer: ${noTextLayer}   fetch failures: ${failed}`);
    console.log(`  rows with no disposal_nature: ${noDisposal}`);
    console.log('\n  caveats:');
    for (const c of report.caveats) console.log(`    - ${c}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

await main();
