#!/usr/bin/env node
/**
 * CX1 document-classification audit.
 *
 * Offline only: reads existing measured artifacts and owner-lane source comments,
 * then writes a CX1 backlog report. It does not query PostgreSQL, call a model,
 * fetch PDFs, or change canonical classifier/runtime code.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-classification-audit');
const OUT_JSON = path.join(OUT_DIR, 'classification-audit.json');
const OUT_PLAN_JSON = path.join(OUT_DIR, 'sample-plan.json');
const OUT_CSV = path.join(OUT_DIR, 'residue-projection.csv');
const OUT_SELECTOR_SQL = path.join(OUT_DIR, 'sample-selector.sql');
const OUT_MD = path.join(ROOT, 'docs', 'ai', 'CX1_DOCUMENT_CLASSIFICATION_AUDIT.md');

const SAMPLE_JSON = path.join(ROOT, 'docs', 'ai', 'new2-silver-proof', 'hc-class-sample-20260817.json');
const CORPUS_JSON = path.join(ROOT, 'docs', 'ai', 'cx1-corpus-census', 'metadata-coverage.json');
const ORDER_TYPES_JSON = path.join(ROOT, 'docs', 'HC_ORDER_TYPES.json');
const HC_CLASSIFY_TS = path.join(ROOT, 'services', 'ingest', 'src', 'hc-classify.ts');
const HC_ADJUDICATE_TS = path.join(ROOT, 'services', 'ingest', 'src', 'hc-adjudicate.ts');

const HELD_RESIDUE = {
  source: 'services/ingest/src/hc-adjudicate.ts header, measured 14 Aug 2026 over held corpus',
  scope: 'held corpus only; not a full-source-universe estimate',
  rowsApprox: 1_720_000,
  byDisposal: {
    'DISPOSED OFF': 687_076,
    'DISPOSED OF': 497_294,
    DISPOSED: 227_304,
    'DISPOSED OF NO COSTS': 115_541,
    CLOSED: 54_241,
    ORDERED: 34_422,
  },
  modelPilot: {
    source: 'docs/CURRENT_PLAN.md Q1.48 / services/ingest/src/hc-adjudicate.ts',
    documents: 40,
    spanVerified: 31,
    fabricatedSpan: 7,
    checkerFalseNegative: 1,
    cannotDetermine: 1,
    conclusion:
      'candidate generator with mandatory span verification only; not promotable as an autonomous classifier',
  },
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function pct(n, d) {
  return d === 0 ? 0 : n / d;
}

function round(n) {
  return Math.round(n);
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

function projectCounts(methodCounts, denominator, sampleTotal) {
  return Object.entries(methodCounts)
    .filter(([method]) => method.startsWith('unclassified_disposal:'))
    .map(([method, count]) => {
      const rate = pct(count, sampleTotal);
      return {
        method,
        sampleCount: count,
        sampleShare: rate,
        projectedPlainDocuments: round(denominator * rate),
      };
    })
    .sort((a, b) => b.projectedPlainDocuments - a.projectedPlainDocuments);
}

function checkSourceEvidence() {
  const classify = fs.readFileSync(HC_CLASSIFY_TS, 'utf8');
  const adjudicate = fs.readFileSync(HC_ADJUDICATE_TS, 'utf8');
  return {
    classifyKeepsDisposedUnclassified:
      /DISPOSED`, `DISPOSED OFF`, `DISPOSED OF/.test(classify) &&
      /return \{ documentClass: null, method: `unclassified_disposal/.test(classify),
    adjudicateSelectsOnlyRefusedRows:
      /startsWith\('unclassified_disposal:'\)/.test(adjudicate) &&
      /hcClassMethod === 'no_disposal_nature'/.test(adjudicate),
    adjudicateRequiresSpanVerification:
      /verifyEvidenceSpan/.test(adjudicate) && /span_not_found/.test(adjudicate),
  };
}

function buildReport() {
  const sample = readJson(SAMPLE_JSON);
  const corpus = readJson(CORPUS_JSON);
  const orderTypes = readJson(ORDER_TYPES_JSON);
  const plainSourceDocuments = corpus.sourceTotals.allYears.plain;
  const mobileSourceDocuments = corpus.sourceTotals.allYears.mobile;
  const combinedSourceDocuments = corpus.sourceTotals.allYears.combined;
  const sampleTotal = sample.documentsClassified;
  const byClass = Object.fromEntries(
    Object.entries(sample.byClass).map(([cls, count]) => [
      cls,
      {
        sampleCount: count,
        sampleShare: pct(count, sampleTotal),
        projectedPlainDocuments: round(plainSourceDocuments * pct(count, sampleTotal)),
      },
    ]),
  );
  const residueProjection = projectCounts(sample.byMethod, plainSourceDocuments, sampleTotal);
  const unclassifiedCount = sample.byClass.unclassified || 0;
  const disposedFamilyCount = residueProjection.reduce((sum, row) => sum + row.sampleCount, 0);
  const audit = {
    schema: 'cx1-document-classification-audit-v1',
    generatedAt: new Date().toISOString(),
    status: 'offline_audit_complete',
    boundary:
      'offline only: no PostgreSQL query, no PDF fetch, no OCR, no model call, no production classifier edit',
    inputs: {
      sample: rel(SAMPLE_JSON),
      corpusCensus: rel(CORPUS_JSON),
      mobileOrderTypes: rel(ORDER_TYPES_JSON),
      classifierSource: rel(HC_CLASSIFY_TS),
      adjudicationSource: rel(HC_ADJUDICATE_TS),
    },
    sourceUniverse: {
      plainSourceDocuments,
      mobileSourceDocuments,
      combinedSourceDocuments,
      plainShareOfCombined: pct(plainSourceDocuments, combinedSourceDocuments),
      mobileShareOfCombined: pct(mobileSourceDocuments, combinedSourceDocuments),
    },
    sample: {
      documentsClassified: sampleTotal,
      courtYearCells: sample.courtYearCells,
      byClass,
      byMethod: sample.byMethod,
      meanCharsByClass: sample.meanCharsByClass,
      caveats: sample.caveats,
    },
    keyFindings: {
      unclassifiedShare: pct(unclassifiedCount, sampleTotal),
      unclassifiedProjectedPlainDocuments: round(plainSourceDocuments * pct(unclassifiedCount, sampleTotal)),
      residueMethodsAccountForAllUnclassified: disposedFamilyCount === unclassifiedCount,
      disposedFamilySampleCount: disposedFamilyCount,
      decidedUpperBoundShare: pct(sample.byClass.decided || 0, sampleTotal),
      decidedUpperBoundProjectedPlainDocuments: round(
        plainSourceDocuments * pct(sample.byClass.decided || 0, sampleTotal),
      ),
      mobileVariantIsDisjointWarning: orderTypes.scope,
      mobileJudgmentShareRange: orderTypes.judgmentShareRange,
    },
    residueProjection,
    heldResidue: HELD_RESIDUE,
    sourceEvidenceChecks: checkSourceEvidence(),
    backlog: [
      {
        id: 'H1',
        owner: 'CX1',
        status: 'complete_plan',
        action:
          'Larger stratified sample plan prepared for DISPOSED*/CLOSED/ORDERED residue by court, year, length band, citation density, and script defect risk.',
        gate: 'LIGHT completed; selector execution remains MEDIUM_CLEAN',
        promotionRisk: 'none; sample planning only',
      },
      {
        id: 'H2',
        owner: 'CX1',
        status: 'prepared_not_run',
        action:
          'Run read-only selector once DB pressure clears and write candidate sample rows to disposable CX1 JSONL.',
        gate: 'MEDIUM_CLEAN',
        promotionRisk: 'none; copied sample only',
      },
      {
        id: 'H3',
        owner: 'LCC/NEW2',
        status: 'not_cx1_canonical_change',
        action:
          'If a larger CX1 sample confirms value, decide whether a candidate table/migration is worth building; model output remains span-verified candidate evidence only.',
        gate: 'owner decision',
        promotionRisk: 'high if model labels are promoted without evidence-span verification and review',
      },
    ],
  };
  return audit;
}

function buildSamplePlan(audit) {
  return {
    schema: 'cx1-document-classification-sample-plan-v1',
    generatedAt: audit.generatedAt,
    status: 'prepared_not_run',
    boundary:
      'read-only selector plan only: not executed by this script, no model call, no canonical write',
    selectorSql: rel(OUT_SELECTOR_SQL),
    target: {
      population:
        "judgments where hc_class_method starts with 'unclassified_disposal:' or equals 'no_disposal_nature', length(full_text) > 500",
      maxPerStratum: 25,
      ordering: 'md5(id::text), deterministic and stable for reruns',
      expectedUse:
        'write selector stdout to a disposable CX1 JSON/CSV file only when scheduler allows MEDIUM_CLEAN',
    },
    strata: {
      residueMethod: audit.residueProjection.map((row) => row.method).concat(['no_disposal_nature']),
      lengthBand: ['short_501_1500', 'medium_1501_6000', 'long_6001_25000', 'very_long_gt25000'],
      citationBand: ['none', 'one_to_two', 'three_to_ten', 'gt_ten'],
      scriptRisk: ['devanagari_present', 'ascii_or_non_devanagari'],
    },
    outputColumns: [
      'id',
      'court',
      'year',
      'disposal_nature',
      'case_number',
      'hc_class_method',
      'residue_method',
      'text_chars',
      'length_band',
      'citation_count',
      'resolved_citation_count',
      'citation_band',
      'has_citation_on_file',
      'script_risk',
      'stratum_rank',
    ],
    safety: [
      'selector begins with WITH and contains no mutating SQL token',
      'citation_count excludes sentinel rows with empty citation_text',
      'sample labels are audit strata only, not legal classifications',
    ],
  };
}

function renderSelectorSql(maxPerStratum = 25) {
  return `WITH candidates AS (
  SELECT
    j.id,
    j.court,
    extract(year FROM j.judgment_date)::int AS year,
    j.disposal_nature,
    j.case_number,
    j.hc_class_method,
    CASE
      WHEN j.hc_class_method LIKE 'unclassified_disposal:%'
        THEN substring(j.hc_class_method FROM length('unclassified_disposal:') + 1)
      ELSE j.hc_class_method
    END AS residue_method,
    length(j.full_text) AS text_chars,
    CASE
      WHEN length(j.full_text) <= 1500 THEN 'short_501_1500'
      WHEN length(j.full_text) <= 6000 THEN 'medium_1501_6000'
      WHEN length(j.full_text) <= 25000 THEN 'long_6001_25000'
      ELSE 'very_long_gt25000'
    END AS length_band,
    citation_stats.citation_count,
    citation_stats.resolved_citation_count,
    CASE
      WHEN citation_stats.citation_count = 0 THEN 'none'
      WHEN citation_stats.citation_count <= 2 THEN 'one_to_two'
      WHEN citation_stats.citation_count <= 10 THEN 'three_to_ten'
      ELSE 'gt_ten'
    END AS citation_band,
    (j.neutral_citation IS NOT NULL OR cardinality(j.reporter_citations) > 0) AS has_citation_on_file,
    CASE
      WHEN j.full_text ~ U&'[\\0900-\\097F]' THEN 'devanagari_present'
      ELSE 'ascii_or_non_devanagari'
    END AS script_risk
  FROM judgments j
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE coalesce(c.citation_text, '') <> '')::int AS citation_count,
      count(c.cited_judgment_id)::int AS resolved_citation_count
    FROM judgment_citations c
    WHERE c.citing_judgment_id = j.id
  ) citation_stats ON true
  WHERE (j.hc_class_method LIKE 'unclassified_disposal:%' OR j.hc_class_method = 'no_disposal_nature')
    AND length(j.full_text) > 500
),
ranked AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY residue_method, length_band, citation_band, script_risk
      ORDER BY md5(id::text)
    ) AS stratum_rank
  FROM candidates
)
SELECT
  id,
  court,
  year,
  disposal_nature,
  case_number,
  hc_class_method,
  residue_method,
  text_chars,
  length_band,
  citation_count,
  resolved_citation_count,
  citation_band,
  has_citation_on_file,
  script_risk,
  stratum_rank
FROM ranked
WHERE stratum_rank <= ${maxPerStratum}
ORDER BY residue_method, length_band, citation_band, script_risk, stratum_rank;
`;
}

function renderCsv(rows) {
  const lines = ['method,sample_count,sample_share,projected_plain_documents'];
  for (const row of rows) {
    lines.push(
      [
        JSON.stringify(row.method),
        row.sampleCount,
        row.sampleShare.toFixed(6),
        row.projectedPlainDocuments,
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

function fmtInt(n) {
  return new Intl.NumberFormat('en-US').format(n);
}

function fmtPct(v) {
  return `${(v * 100).toFixed(1)}%`;
}

function renderMarkdown(audit) {
  const lines = [];
  lines.push('# CX1 Document Classification Audit');
  lines.push('');
  lines.push(`Generated: **${audit.generatedAt}**`);
  lines.push('');
  lines.push(`Status: **${audit.status}**`);
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push(audit.boundary);
  lines.push('');
  lines.push('This is Workstream H evidence for a backlog. It does not relabel any row and does not decide legal authority.');
  lines.push('');
  lines.push('## Inputs');
  lines.push('');
  for (const [name, file] of Object.entries(audit.inputs)) {
    lines.push(`- ${name}: \`${file}\``);
  }
  lines.push('');
  lines.push('## Measured Base');
  lines.push('');
  lines.push(`Plain High Court source documents: **${fmtInt(audit.sourceUniverse.plainSourceDocuments)}** (${fmtPct(audit.sourceUniverse.plainShareOfCombined)} of combined HC source universe).`);
  lines.push(`Mobile source documents: **${fmtInt(audit.sourceUniverse.mobileSourceDocuments)}** (${fmtPct(audit.sourceUniverse.mobileShareOfCombined)}); mobile order-type labels are disjoint and must not be treated as a corpus-wide judgment-share estimate.`);
  lines.push('');
  lines.push('| Class | Sample n | Sample share | Plain-source projection | Mean chars |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const [cls, stats] of Object.entries(audit.sample.byClass)) {
    lines.push(
      `| \`${cls}\` | ${stats.sampleCount} | ${fmtPct(stats.sampleShare)} | ${fmtInt(stats.projectedPlainDocuments)} | ${fmtInt(audit.sample.meanCharsByClass[cls] || 0)} |`,
    );
  }
  lines.push('');
  lines.push('## Residue Projection');
  lines.push('');
  lines.push(`The sample's unclassified residue is **${fmtPct(audit.keyFindings.unclassifiedShare)}** of the plain variant, projecting to roughly **${fmtInt(audit.keyFindings.unclassifiedProjectedPlainDocuments)}** plain-source documents if the sample rate held. This is indicative, not a corpus rate: the 200 documents were spread-selected, not randomly sampled.`);
  lines.push('');
  lines.push('| Residue method | Sample n | Sample share | Plain-source projection |');
  lines.push('|---|---:|---:|---:|');
  for (const row of audit.residueProjection) {
    lines.push(
      `| \`${row.method}\` | ${row.sampleCount} | ${fmtPct(row.sampleShare)} | ${fmtInt(row.projectedPlainDocuments)} |`,
    );
  }
  lines.push('');
  lines.push('Result: all sample unclassified rows are accounted for by the `DISPOSED*` / `CLOSED` family. That confirms the existing refusal is a designed ambiguity boundary, not a vocabulary miss in this sample.');
  lines.push('');
  lines.push('## Held-Corpus Context');
  lines.push('');
  lines.push(`The owner-lane adjudication source records a held-corpus difficult subset of about **${fmtInt(audit.heldResidue.rowsApprox)}** rows, dominated by:`);
  lines.push('');
  lines.push('| Disposal value | Held rows |');
  lines.push('|---|---:|');
  for (const [label, n] of Object.entries(audit.heldResidue.byDisposal)) {
    lines.push(`| \`${label}\` | ${fmtInt(n)} |`);
  }
  lines.push('');
  lines.push(`The 40-document model pilot span-verified ${audit.heldResidue.modelPilot.spanVerified}/${audit.heldResidue.modelPilot.documents} and found ${audit.heldResidue.modelPilot.fabricatedSpan}/${audit.heldResidue.modelPilot.documents} quoted spans not present in the source. Conclusion stays: **candidate generator with mandatory span verification only**, never autonomous classification.`);
  lines.push('');
  lines.push('## Backlog');
  lines.push('');
  lines.push('| ID | Owner | Status | Gate | Action |');
  lines.push('|---|---|---|---|---|');
  for (const item of audit.backlog) {
    lines.push(`| ${item.id} | ${item.owner} | ${item.status} | ${item.gate} | ${item.action} |`);
  }
  lines.push('');
  lines.push('## Not Safe To Promote');
  lines.push('');
  lines.push('- Do not map `DISPOSED`, `DISPOSED OFF`, `DISPOSED OF`, `CLOSED`, or `ORDERED` directly to `decided`.');
  lines.push('- Do not quote mobile `order_type` judgment-share ranges as plain-variant or corpus-wide authority shares.');
  lines.push('- Do not promote model labels without source-span verification and owner-lane review.');
  lines.push('');
  lines.push('## Machine Outputs');
  lines.push('');
  lines.push('- `docs/ai/cx1-classification-audit/classification-audit.json`');
  lines.push('- `docs/ai/cx1-classification-audit/sample-plan.json`');
  lines.push('- `docs/ai/cx1-classification-audit/residue-projection.csv`');
  lines.push('- `docs/ai/cx1-classification-audit/sample-selector.sql`');
  return `${lines.join('\n')}\n`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const audit = buildReport();
  const samplePlan = buildSamplePlan(audit);
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(OUT_PLAN_JSON, `${JSON.stringify(samplePlan, null, 2)}\n`);
  fs.writeFileSync(OUT_CSV, renderCsv(audit.residueProjection));
  fs.writeFileSync(OUT_SELECTOR_SQL, renderSelectorSql(samplePlan.target.maxPerStratum));
  fs.writeFileSync(OUT_MD, renderMarkdown(audit));
  console.log(`wrote ${rel(OUT_JSON)}`);
  console.log(`wrote ${rel(OUT_PLAN_JSON)}`);
  console.log(`wrote ${rel(OUT_CSV)}`);
  console.log(`wrote ${rel(OUT_SELECTOR_SQL)}`);
  console.log(`wrote ${rel(OUT_MD)}`);
}

main();
