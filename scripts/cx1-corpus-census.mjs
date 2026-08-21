#!/usr/bin/env node
/**
 * CX1 corpus census, phase 1.
 *
 * This phase is metadata-only: it reads existing JSON artifacts on disk and
 * writes compact outputs. No database connection, no S3 calls, no corpus scan.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-corpus-census');
const REPORT = path.join(ROOT, 'docs', 'ai', 'CX1_FULL_CORPUS_CENSUS.md');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function pct(numerator, denominator) {
  if (!denominator) return null;
  return numerator / denominator;
}

function bandForYear(year) {
  if (year < 2016) return 'pre_2016';
  if (year <= 2022) return 'y2016_2022';
  if (year === 2023) return 'y2023';
  if (year === 2024) return 'y2024';
  return 'y2025_2026';
}

function bandLabel(band) {
  return {
    pre_2016: 'pre-2016',
    y2016_2022: '2016-2022',
    y2023: '2023',
    y2024: '2024',
    y2025_2026: '2025-2026',
  }[band] || band;
}

function blankBand() {
  return { sourceDocuments: 0, heldDocuments: 0, remainingDocuments: 0, coverage: null };
}

function addToBand(target, year, source, held) {
  const band = bandForYear(year);
  target[band] ??= blankBand();
  target[band].sourceDocuments += source;
  target[band].heldDocuments += held;
  target[band].remainingDocuments += source - held;
}

function finalizeBands(bands) {
  for (const b of Object.values(bands)) {
    b.coverage = pct(b.heldDocuments, b.sourceDocuments);
  }
  const total = blankBand();
  for (const b of Object.values(bands)) {
    total.sourceDocuments += b.sourceDocuments;
    total.heldDocuments += b.heldDocuments;
    total.remainingDocuments += b.remainingDocuments;
  }
  total.coverage = pct(total.heldDocuments, total.sourceDocuments);
  return total;
}

function fmtInt(n) {
  return new Intl.NumberFormat('en-US').format(n);
}

function fmtPct(n) {
  return n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`;
}

function main() {
  const survey = readJson('docs/HC_METADATA_SURVEY.json');
  const held = readJson('docs/ops/migration/new2-held-by-court-year.json');
  const orderTypes = readJson('docs/HC_ORDER_TYPES.json');

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const codeByName = new Map(survey.perCourt.map((c) => [c.name, c.code]));

  const rows = [];
  const byCourt = [];
  const byBand = {};

  for (const [courtName, byYear] of Object.entries(survey.perCourtPerYear)) {
    const code = codeByName.get(courtName);
    if (!code) throw new Error(`No court code for ${courtName}`);
    const heldByYear = held.heldByCourtCodeByYear[code] || {};
    const courtBands = {};
    let sourceTotal = 0;
    let heldTotal = 0;

    for (const [yearText, sourceCount] of Object.entries(byYear)) {
      const year = Number(yearText);
      const heldCount = Number(heldByYear[yearText] || 0);
      sourceTotal += sourceCount;
      heldTotal += heldCount;
      addToBand(courtBands, year, sourceCount, heldCount);
      addToBand(byBand, year, sourceCount, heldCount);
      rows.push({
        courtCode: code,
        courtName,
        year,
        sourceDocuments: sourceCount,
        heldDocuments: heldCount,
        remainingDocuments: sourceCount - heldCount,
        coverage: pct(heldCount, sourceCount),
      });
    }

    const courtTotal = finalizeBands(courtBands);
    byCourt.push({
      courtCode: code,
      courtName,
      sourceDocuments: sourceTotal,
      heldDocuments: heldTotal,
      remainingDocuments: sourceTotal - heldTotal,
      coverage: pct(heldTotal, sourceTotal),
      bands: courtBands,
      total: courtTotal,
      mobileVariant: Boolean(survey.perCourt.find((c) => c.code === code)?.hasMobileVariant),
      mobileOrderTypes: orderTypes.byCourt[code] || null,
    });
  }

  const total = finalizeBands(byBand);
  byCourt.sort((a, b) => b.remainingDocuments - a.remainingDocuments);
  rows.sort((a, b) => a.courtCode.localeCompare(b.courtCode) || a.year - b.year);

  const output = {
    schema: 'cx1-corpus-census-phase1-v1',
    generatedAt: new Date().toISOString(),
    scope: 'High Court source universe only; Supreme Court has no denominator in HC_METADATA_SURVEY.json',
    inputs: {
      sourceSurvey: 'docs/HC_METADATA_SURVEY.json',
      heldSnapshot: 'docs/ops/migration/new2-held-by-court-year.json',
      mobileOrderTypes: 'docs/HC_ORDER_TYPES.json',
    },
    sourceTotals: survey.totals,
    heldSnapshot: {
      takenAt: held.takenAt,
      totalRowsCounted: held.totalRowsCounted,
      note: 'Includes Supreme Court rows; HC coverage calculations use only court codes present in the HC survey.',
    },
    totals: total,
    byBand,
    byCourt,
    rows,
    mobileOrderTypeSlice: {
      scope: orderTypes.scope,
      labelledRows: orderTypes.labelledRows,
      judgmentRowsConfident: orderTypes.judgmentRowsConfident,
      judgmentRowsAmbiguous: orderTypes.judgmentRowsAmbiguous,
      judgmentShareRange: orderTypes.judgmentShareRange,
      warning: 'Disjoint mobile variant only. Do not quote as corpus-wide judgment share.',
    },
  };

  const jsonPath = path.join(OUT_DIR, 'metadata-coverage.json');
  const csvPath = path.join(OUT_DIR, 'metadata-coverage.csv');
  fs.writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(
    csvPath,
    [
      'court_code,court_name,year,source_documents,held_documents,remaining_documents,coverage',
      ...rows.map((r) =>
        [
          r.courtCode,
          JSON.stringify(r.courtName),
          r.year,
          r.sourceDocuments,
          r.heldDocuments,
          r.remainingDocuments,
          r.coverage === null ? '' : r.coverage.toFixed(6),
        ].join(','),
      ),
    ].join('\n') + '\n',
  );

  const topCourts = byCourt.slice(0, 10);
  const lines = [];
  lines.push('# CX1 Full Corpus Census');
  lines.push('');
  lines.push(`Generated: **${output.generatedAt}**`);
  lines.push('');
  lines.push('## Phase 1 Scope');
  lines.push('');
  lines.push('This is the metadata-only census base. It reads existing local artifacts only: no database query, no S3 request, no full corpus scan.');
  lines.push('');
  lines.push('Scope boundary: High Court source universe from `docs/HC_METADATA_SURVEY.json`. Supreme Court rows are held in `judgments` but have no denominator in this High Court survey.');
  lines.push('');
  lines.push('## Headline');
  lines.push('');
  lines.push('| Band | Source documents | Held documents | Remaining | Coverage |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const key of ['pre_2016', 'y2016_2022', 'y2023', 'y2024', 'y2025_2026']) {
    const b = byBand[key] || blankBand();
    lines.push(`| ${bandLabel(key)} | ${fmtInt(b.sourceDocuments)} | ${fmtInt(b.heldDocuments)} | ${fmtInt(b.remainingDocuments)} | ${fmtPct(b.coverage)} |`);
  }
  lines.push(`| **TOTAL** | **${fmtInt(total.sourceDocuments)}** | **${fmtInt(total.heldDocuments)}** | **${fmtInt(total.remainingDocuments)}** | **${fmtPct(total.coverage)}** |`);
  lines.push('');
  lines.push('## Largest Remaining Courts');
  lines.push('');
  lines.push('| Court | Source documents | Held documents | Remaining | Coverage |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const court of topCourts) {
    lines.push(`| ${court.courtName} (${court.courtCode}) | ${fmtInt(court.sourceDocuments)} | ${fmtInt(court.heldDocuments)} | ${fmtInt(court.remainingDocuments)} | ${fmtPct(court.coverage)} |`);
  }
  lines.push('');
  lines.push('## Mobile Order-Type Slice');
  lines.push('');
  lines.push(`` + `docs/HC_ORDER_TYPES.json` + ` covers **${fmtInt(orderTypes.labelledRows)}** labelled rows in the mobile metadata variant only. It is disjoint from the plain variant and must not be quoted as corpus-wide judgment share.`);
  lines.push('');
  lines.push(`Confident judgment rows: **${fmtInt(orderTypes.judgmentRowsConfident)}**. Ambiguous judgment/order rows: **${fmtInt(orderTypes.judgmentRowsAmbiguous)}**.`);
  lines.push('');
  lines.push('## Machine Outputs');
  lines.push('');
  lines.push('- `docs/ai/cx1-corpus-census/metadata-coverage.json`');
  lines.push('- `docs/ai/cx1-corpus-census/metadata-coverage.csv`');
  lines.push('');
  lines.push('## Next Phase');
  lines.push('');
  lines.push('Add read-only stratified samples for text length, paragraph count, citation count, citation availability, Devanagari presence, and classification failure modes. The scheduler must allow at least MEDIUM work before any database sampling phase starts.');

  fs.writeFileSync(REPORT, `${lines.join('\n')}\n`);
  console.log(`wrote ${path.relative(ROOT, REPORT)}`);
  console.log(`wrote ${path.relative(ROOT, jsonPath)}`);
  console.log(`wrote ${path.relative(ROOT, csvPath)}`);
  console.log(`coverage ${fmtPct(total.coverage)} (${fmtInt(total.heldDocuments)} / ${fmtInt(total.sourceDocuments)})`);
}

main();
