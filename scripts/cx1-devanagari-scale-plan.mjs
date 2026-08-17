#!/usr/bin/env node
/**
 * CX1 Devanagari scale-validation plan.
 *
 * Offline only: reads existing CX1/NEW2 artifacts and writes a bounded plan plus
 * selector SQL. It does not query PostgreSQL, fetch PDFs, run OCR, or rewrite
 * any corpus text.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-devanagari-results');
const PLAN_FILE = path.join(OUT_DIR, 'scale-validation-plan.json');
const SQL_FILE = path.join(OUT_DIR, 'scale-validation-selector.sql');
const REPORT = path.join(ROOT, 'docs', 'ai', 'CX1_DEVANAGARI_SCALE_VALIDATION.md');

const COURT_STATS = [
  { court: 'High Court Of Rajasthan', sampledDevanagariDocs: 127, defectiveDocs: 121, yearsSeen: '2013-2026', role: 'highest_defect_rate' },
  { court: 'Allahabad High Court', sampledDevanagariDocs: 134, defectiveDocs: 47, yearsSeen: '2022-2026', role: 'largest_absolute_population' },
  { court: 'High Court of Chhattisgarh', sampledDevanagariDocs: 43, defectiveDocs: 33, yearsSeen: '2023-2026', role: 'high_defect_rate' },
  { court: 'Bombay High Court', sampledDevanagariDocs: 16, defectiveDocs: 9, yearsSeen: '2014-2026', role: 'mixed_defect_control' },
  { court: 'High Court of Jharkhand', sampledDevanagariDocs: 15, defectiveDocs: 10, yearsSeen: '2023-2026', role: 'high_defect_rate' },
  { court: 'High Court of Uttarakhand', sampledDevanagariDocs: 8, defectiveDocs: 6, yearsSeen: '2023-2026', role: 'small_high_defect_sample' },
  { court: 'High Court of Madhya Pradesh', sampledDevanagariDocs: 5, defectiveDocs: 2, yearsSeen: '2017-2023', role: 'low_count_mixed_control' },
  { court: 'High Court of Delhi', sampledDevanagariDocs: 4, defectiveDocs: 2, yearsSeen: '2019-2024', role: 'low_count_mixed_control' },
  { court: 'Patna High Court', sampledDevanagariDocs: 5, defectiveDocs: 0, yearsSeen: '2022-2026', role: 'clean_control' },
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function pct(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(6)) : null;
}

function targetFor(stat) {
  if (stat.role === 'highest_defect_rate' || stat.role === 'largest_absolute_population') return 32;
  if (stat.role === 'high_defect_rate') return 16;
  if (stat.role === 'clean_control') return 12;
  return 10;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function selectorSql(plan) {
  const values = plan.strata
    .map((s) => `  (${sqlString(s.court)}::text, ${s.targetDocuments}::int, ${sqlString(s.role)}::text)`)
    .join(',\n');
  return `/* CX1 Devanagari scale-validation selector.
   Prepared offline. Run only when scheduler permits DB sampling and PDF/OCR work.
   Uses ASCII chr() ranges to avoid Windows shell mojibake in Devanagari filters. */
WITH target(court, target_documents, role) AS (
  VALUES
${values}
),
candidate AS MATERIALIZED (
  SELECT
    j.id::text,
    j.case_title,
    j.neutral_citation,
    j.reporter_citations,
    j.court,
    extract(year FROM j.judgment_date)::int AS year,
    j.source_url,
    j.full_text,
    char_length(j.full_text)::int AS stored_text_chars,
    md5(j.full_text) AS stored_text_md5,
    count(jc.id) FILTER (WHERE coalesce(jc.citation_text, '') <> '')::int AS real_citation_count,
    count(jc.id) FILTER (
      WHERE coalesce(jc.citation_text, '') <> '' AND jc.cited_judgment_id IS NOT NULL
    )::int AS resolved_citation_count
  FROM judgments j
  JOIN target t ON t.court = j.court
  LEFT JOIN judgment_citations jc ON jc.citing_judgment_id = j.id
  WHERE j.full_text ~ ('[' || chr(2304) || '-' || chr(2431) || ']')
  GROUP BY j.id, j.case_title, j.neutral_citation, j.reporter_citations, j.court,
           j.judgment_date, j.source_url, j.full_text
),
ranked AS (
  SELECT
    c.*,
    row_number() OVER (
      PARTITION BY c.court
      ORDER BY
        (c.real_citation_count > 0) DESC,
        (c.resolved_citation_count > 0) DESC,
        c.year,
        md5(c.id)
    ) AS rn
  FROM candidate c
)
SELECT jsonb_build_object(
  'schema', 'cx1-devanagari-scale-validation-manifest-v1',
  'createdAt', now(),
  'status', 'selected_not_processed',
  'selector', 'docs/ai/cx1-devanagari-results/scale-validation-selector.sql',
  'documents', jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'caseTitle', r.case_title,
      'neutralCitation', r.neutral_citation,
      'reporterCitations', r.reporter_citations,
      'court', r.court,
      'year', r.year,
      'sourceUrl', r.source_url,
      'storedTextChars', r.stored_text_chars,
      'storedTextMd5', r.stored_text_md5,
      'realCitationCount', r.real_citation_count,
      'resolvedCitationCount', r.resolved_citation_count
    )
    ORDER BY r.court, r.rn
  )
)::text AS result_json
FROM ranked r
JOIN target t ON t.court = r.court
WHERE r.rn <= t.target_documents;`;
}

function fmtInt(n) {
  return new Intl.NumberFormat('en-US').format(Number(n));
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const bakeoff = readJson('docs/ai/cx1-devanagari-results/bakeoff-results.json');
  const sample = readJson('docs/ai/cx1-devanagari-results/sample-manifest.json');
  const unpdf = bakeoff.aggregates.unpdf;
  const poppler = bakeoff.aggregates.poppler;
  const ocr = bakeoff.aggregates.ocr_tesseract_hin_eng;

  const strata = COURT_STATS.map((stat) => ({
    ...stat,
    defectiveShare: pct(stat.defectiveDocs, stat.sampledDevanagariDocs),
    targetDocuments: targetFor(stat),
  }));
  const plan = {
    schema: 'cx1-devanagari-scale-validation-plan-v1',
    generatedAt: new Date().toISOString(),
    status: 'prepared_not_run',
    scope: 'offline plan and selector SQL only; no DB query, PDF fetch, OCR, or production write',
    sources: {
      characterization: 'docs/DEVANAGARI_EXTRACTION_DEFECTS.md',
      sampleManifest: 'docs/ai/cx1-devanagari-results/sample-manifest.json',
      bakeoffResults: 'docs/ai/cx1-devanagari-results/bakeoff-results.json',
      bakeoffReport: 'docs/ai/CX1_DEVANAGARI_BAKEOFF.md',
    },
    knownPopulationSignals: {
      devanagariDocumentShareLow: 0.0054,
      devanagariDocumentShareHigh: 0.0058,
      approximateCorpusDocumentsWithDevanagari: 40000,
      systematicSampleDevanagariDocuments: 395,
      systematicSampleDefectiveDocuments: 257,
      anyDefectShareAmongDevanagari: pct(257, 395),
    },
    bakeoffReadback: {
      manifestDocuments: sample.documents.length,
      unpdf: {
        attempted: unpdf.attempted,
        usable: unpdf.usable,
        devanagariTokens: unpdf.devanagariTokens,
        defectEvents: unpdf.orphanedMatras + unpdf.controlAdjacency + unpdf.latin1Bleed,
      },
      poppler: {
        attempted: poppler.attempted,
        usable: poppler.usable,
        devanagariDropped: poppler.devanagariDropped,
        devanagariTokens: poppler.devanagariTokens,
      },
      ocr: {
        attempted: ocr.attempted,
        usable: ocr.usable,
        devanagariTokens: ocr.devanagariTokens,
        defectEvents: ocr.orphanedMatras + ocr.controlAdjacency + ocr.latin1Bleed,
        citationPreservationProven: ocr.expectedCitations > 0,
      },
    },
    strata,
    proposedRun: {
      targetDocuments: strata.reduce((sum, s) => sum + s.targetDocuments, 0),
      ocrPolicy: 'Run OCR only where unpdf is structurally defective and Poppler fails script-retention gates.',
      citationBearingRequirement: 'Prioritize documents with real citation strings so OCR citation preservation is measured, not inferred.',
      gates: {
        acceptPopplerOnlyIf: [
          'structurally clean',
          '>= 0.80 Devanagari-token retention vs unpdf',
          '>= 0.80 character retention vs unpdf',
          'no expected-citation regression',
          'no case-name token regression',
        ],
        promoteOcrOnlyIf: [
          'source text retained with provenance',
          'extractor/version/settings/hash recorded',
          'citation strings survive and pass the five-state citation harness',
          'case-name preservation gate passes',
          'manual review route exists for retention failures',
        ],
      },
    },
    outputs: {
      plan: 'docs/ai/cx1-devanagari-results/scale-validation-plan.json',
      selectorSql: 'docs/ai/cx1-devanagari-results/scale-validation-selector.sql',
      report: 'docs/ai/CX1_DEVANAGARI_SCALE_VALIDATION.md',
    },
  };

  fs.writeFileSync(PLAN_FILE, `${JSON.stringify(plan, null, 2)}\n`);
  fs.writeFileSync(SQL_FILE, `${selectorSql(plan)}\n`);

  const lines = [];
  lines.push('# CX1 Devanagari Scale Validation');
  lines.push('');
  lines.push(`Generated: **${plan.generatedAt}**`);
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('This checkpoint is a prepared scale-validation plan. It reads existing CX1/NEW2 artifacts only and does not query PostgreSQL, fetch PDFs, run OCR, modify corpus text, or alter retrieval/citation behavior.');
  lines.push('');
  lines.push('## Known Signals');
  lines.push('');
  lines.push(`The existing systematic sample found **${fmtInt(plan.knownPopulationSignals.systematicSampleDefectiveDocuments)} / ${fmtInt(plan.knownPopulationSignals.systematicSampleDevanagariDocuments)}** Devanagari-bearing documents with one of the measured structural defects (**${(plan.knownPopulationSignals.anyDefectShareAmongDevanagari * 100).toFixed(1)}%**). The current corpus-scale estimate remains roughly **40,000** Devanagari-bearing documents.`);
  lines.push('');
  lines.push(`The bake-off readback remains binding: Poppler dropped Devanagari in **${poppler.devanagariDropped}/${poppler.succeeded}** successful outputs, so zero Poppler defect counters are not evidence of repair.`);
  lines.push('');
  lines.push('## Proposed Strata');
  lines.push('');
  lines.push('| Court | Role | Devanagari docs in 1% sample | Defective | Defective share | Target docs |');
  lines.push('|---|---|---:|---:|---:|---:|');
  for (const s of strata) {
    lines.push(`| ${s.court} | ${s.role} | ${s.sampledDevanagariDocs} | ${s.defectiveDocs} | ${(s.defectiveShare * 100).toFixed(1)}% | ${s.targetDocuments} |`);
  }
  lines.push(`| **TOTAL** |  |  |  |  | **${plan.proposedRun.targetDocuments}** |`);
  lines.push('');
  lines.push('## Prepared Artifacts');
  lines.push('');
  lines.push('- `docs/ai/cx1-devanagari-results/scale-validation-plan.json`');
  lines.push('- `docs/ai/cx1-devanagari-results/scale-validation-selector.sql`');
  lines.push('');
  lines.push('## Run Gate');
  lines.push('');
  lines.push('Run the selector and any PDF/OCR processing only after `node scripts/cx1-heavy-lab-runner.mjs recommend` reports a clean window. OCR promotion remains gated by citation preservation and the project five-state citation harness; an OCR string is not confirmed merely because it appears in extracted text.');
  lines.push('');
  lines.push('## Not Yet Done');
  lines.push('');
  lines.push('- The selector SQL has not been run.');
  lines.push('- No additional PDFs were fetched.');
  lines.push('- No OCR was run beyond the existing eight-document bake-off subset.');
  lines.push('- Citation preservation for OCR remains unproven because the existing OCR-routed subset carried no expected database citation strings.');
  fs.writeFileSync(REPORT, `${lines.join('\n')}\n`);

  console.log(`wrote ${path.relative(ROOT, PLAN_FILE)}`);
  console.log(`wrote ${path.relative(ROOT, SQL_FILE)}`);
  console.log(`wrote ${path.relative(ROOT, REPORT)}`);
  console.log(`planned ${plan.proposedRun.targetDocuments} scale-validation documents across ${strata.length} strata`);
}

main();
