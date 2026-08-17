#!/usr/bin/env node
/**
 * CX1 legal-object efficiency audit.
 *
 * Offline only. Reads existing rejection triage JSON and writes a reproducible
 * CX1 summary plus prepared read-only selectors for a later clean DB window.
 * It does not call a model, query PostgreSQL, or promote enrichment data.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-legal-object-efficiency');
const OUT_JSON = path.join(OUT_DIR, 'triage-summary.json');
const OUT_TASK_CSV = path.join(OUT_DIR, 'task-summary.csv');
const OUT_KIND_CSV = path.join(OUT_DIR, 'kind-risk.csv');
const OUT_ROUTER_JSON = path.join(OUT_DIR, 'router-proposal.json');
const OUT_SELECTOR_SQL = path.join(OUT_DIR, 'efficiency-selector.sql');
const OUT_COST_SQL = path.join(OUT_DIR, 'llm-cost-selector.sql');
const OUT_MD = path.join(ROOT, 'docs', 'ai', 'CX1_LEGAL_OBJECT_EFFICIENCY.md');

const TRIAGE_FILES = [
  '.agents/triage-arguments.json',
  '.agents/triage-authorities.json',
  '.agents/triage-case_structure.json',
  '.agents/triage-holding.json',
  '.agents/triage-topics.json',
];

const MODEL_BUCKETS = new Set(['paraphrase', 'fabrication', 'source_interpolation', 'internal_ellipsis']);
const INGEST_BUCKETS = new Set(['source_page_furniture', 'ocr_spacing', 'char_transcription']);
const VERIFIER_BUCKETS = new Set(['case_only', 'verifier_min_length', 'punctuation_only']);
const MIXED_BUCKETS = new Set(['unexplained_drift']);
const ELIGIBLE_DOCS_BASELINE = 233_656;
const SECONDS_PER_DOCUMENT_TASK = 16;

function abs(relativePath) {
  return path.join(ROOT, relativePath);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
}

function pct(part, whole, digits = 4) {
  if (!whole) return 0;
  return Number((part / whole).toFixed(digits));
}

function ownerForBucket(bucket) {
  if (MODEL_BUCKETS.has(bucket)) return 'model';
  if (INGEST_BUCKETS.has(bucket)) return 'ingest';
  if (VERIFIER_BUCKETS.has(bucket)) return 'verifier';
  if (MIXED_BUCKETS.has(bucket)) return 'mixed';
  return 'unknown';
}

function sumObjectValues(value) {
  return Object.values(value || {}).reduce((sum, item) => sum + Number(item || 0), 0);
}

function formatPct(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(file, rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  }
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function taskRecommendation(task, fabricationRate) {
  if (task === 'case_structure' || fabricationRate > 0.01) {
    return {
      decision: 'HOLD_AT_100',
      reason: 'fabrication concentration needs prompt/router work before wider spend',
    };
  }
  return {
    decision: 'CLEAR_TO_1000',
    reason: 'post-fix rejection profile is mostly ingest/verifier noise and fabrications are at or near zero',
  };
}

function summarizeTask(triage) {
  const total = Number(triage.claimsTotal || 0);
  const rejected = Number(triage.claimsBad || 0);
  const verified = total - rejected;
  const owners = {
    ingest: Number(triage.owners?.ingest || 0),
    model: Number(triage.owners?.model || 0),
    verifier: Number(triage.owners?.verifier || 0),
    mixed: 0,
    unknown: 0,
  };

  for (const [bucket, count] of Object.entries(triage.buckets || {})) {
    const owner = ownerForBucket(bucket);
    if (owner === 'mixed' || owner === 'unknown') owners[owner] += Number(count || 0);
  }

  const fabrication = Number(triage.buckets?.fabrication || 0);
  const modelOwnedBuckets = Object.entries(triage.buckets || {})
    .filter(([bucket]) => MODEL_BUCKETS.has(bucket))
    .reduce((sum, [, count]) => sum + Number(count || 0), 0);
  const recommendation = taskRecommendation(triage.task, pct(fabrication, total));
  return {
    task: triage.task,
    claimsTotal: total,
    claimsVerified: verified,
    claimsRejected: rejected,
    verificationRate: pct(verified, total),
    rejectionRate: pct(rejected, total),
    ingestOwnedRejected: owners.ingest,
    modelOwnedRejected: owners.model,
    verifierOwnedRejected: owners.verifier,
    mixedRejected: owners.mixed,
    unknownRejected: owners.unknown,
    ingestShareOfRejected: pct(owners.ingest, rejected),
    modelShareOfRejected: pct(owners.model, rejected),
    verifierShareOfRejected: pct(owners.verifier, rejected),
    fabricationCount: fabrication,
    fabricationRate: pct(fabrication, total),
    modelBucketRejected: modelOwnedBuckets,
    modelBucketRate: pct(modelOwnedBuckets, total),
    recommendation: recommendation.decision,
    recommendationReason: recommendation.reason,
  };
}

function summarizeKinds(triage) {
  const rows = [];
  for (const [kind, counts] of Object.entries(triage.byKind || {})) {
    const bucketCounts = triage.bucketByKind?.[kind] || {};
    const modelOwned = Object.entries(bucketCounts)
      .filter(([bucket]) => MODEL_BUCKETS.has(bucket))
      .reduce((sum, [, count]) => sum + Number(count || 0), 0);
    const ingestOwned = Object.entries(bucketCounts)
      .filter(([bucket]) => INGEST_BUCKETS.has(bucket))
      .reduce((sum, [, count]) => sum + Number(count || 0), 0);
    const verifierOwned = Object.entries(bucketCounts)
      .filter(([bucket]) => VERIFIER_BUCKETS.has(bucket))
      .reduce((sum, [, count]) => sum + Number(count || 0), 0);
    const mixed = Object.entries(bucketCounts)
      .filter(([bucket]) => MIXED_BUCKETS.has(bucket))
      .reduce((sum, [, count]) => sum + Number(count || 0), 0);
    const total = Number(counts.total || 0);
    const rejected = Number(counts.bad || 0);
    const fabrication = Number(bucketCounts.fabrication || 0);
    rows.push({
      task: triage.task,
      kind,
      claimsTotal: total,
      claimsRejected: rejected,
      rejectionRate: pct(rejected, total),
      modelBucketRejected: modelOwned,
      modelBucketRate: pct(modelOwned, total),
      ingestBucketRejected: ingestOwned,
      verifierBucketRejected: verifierOwned,
      mixedBucketRejected: mixed,
      fabricationCount: fabrication,
      fabricationRate: pct(fabrication, total),
      bucketTotalCheck: sumObjectValues(bucketCounts),
    });
  }
  return rows;
}

function buildRouter(taskRows, kindRows) {
  const taskPolicy = taskRows.map((row) => ({
    task: row.task,
    recommendation: row.recommendation,
    rationale: row.recommendationReason,
    verificationRate: row.verificationRate,
    fabricationRate: row.fabricationRate,
    modelShareOfRejected: row.modelShareOfRejected,
  }));

  const kindPolicy = kindRows
    .filter((row) => row.fabricationCount > 0 || row.modelBucketRate >= 0.05)
    .sort((a, b) => b.fabricationRate - a.fabricationRate || b.modelBucketRate - a.modelBucketRate)
    .map((row) => ({
      task: row.task,
      kind: row.kind,
      recommendation:
        row.fabricationRate >= 0.02 || (row.task === 'case_structure' && row.kind === 'fact')
          ? 'ROUTE_TO_PROMPT_REWORK'
          : 'KEEP_SPAN_VERIFICATION_AND_MONITOR',
      claimsTotal: row.claimsTotal,
      rejectionRate: row.rejectionRate,
      fabricationRate: row.fabricationRate,
      modelBucketRate: row.modelBucketRate,
    }));

  const allTaskExecutions = ELIGIBLE_DOCS_BASELINE * 5;
  const clearTaskExecutions =
    ELIGIBLE_DOCS_BASELINE * taskRows.filter((row) => row.recommendation === 'CLEAR_TO_1000').length;

  return {
    schema: 'cx1-legal-object-router-proposal-v1',
    generatedAt: new Date().toISOString(),
    boundary:
      'proposal only: no canonical routing, prompt, verifier, enrichment, retrieval, or product behavior changed',
    eligibleDocsBaseline: ELIGIBLE_DOCS_BASELINE,
    secondsPerDocumentTask: SECONDS_PER_DOCUMENT_TASK,
    estimatedSingleGrantHours: {
      allFiveTasks: Number(((allTaskExecutions * SECONDS_PER_DOCUMENT_TASK) / 3600).toFixed(1)),
      fourClearedTasks: Number(((clearTaskExecutions * SECONDS_PER_DOCUMENT_TASK) / 3600).toFixed(1)),
      deferredCaseStructure: Number(((ELIGIBLE_DOCS_BASELINE * SECONDS_PER_DOCUMENT_TASK) / 3600).toFixed(1)),
    },
    taskPolicy,
    kindPolicy,
    notes: [
      'Continue span verification for every promoted quote candidate.',
      'Treat labels as model gloss, not verified legal fact.',
      'Do not widen case_structure until narrative fact fabrication is reworked and remeasured.',
      'llm_calls has no foreign key to document_enrichments, so per-task cost attribution needs either log correlation or future schema work.',
    ],
  };
}

function renderMarkdown(summary, router) {
  const lines = [];
  lines.push('# CX1 Legal-Object Efficiency Audit');
  lines.push('');
  lines.push(`Generated: **${summary.generatedAt}**`);
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push('Offline CX1 analysis only. This audit reads existing triage JSON and schema documentation, writes lab artifacts, and prepares read-only selectors. It does not call a model, query PostgreSQL, change prompts, promote enrichments, or alter retrieval.');
  lines.push('');
  lines.push('## Overall Triage');
  lines.push('');
  lines.push(`Across the five 0051 legal-object tasks, the existing post-fix triage contains **${summary.overall.claimsTotal.toLocaleString()}** candidate quote claims, **${summary.overall.claimsVerified.toLocaleString()}** verified and **${summary.overall.claimsRejected.toLocaleString()}** rejected. Overall verification rate is **${formatPct(summary.overall.verificationRate)}**.`);
  lines.push('');
  lines.push(`Owner-labelled rejected mix: ingest **${summary.overall.owners.ingest}**, model **${summary.overall.owners.model}**, verifier **${summary.overall.owners.verifier}**. Additional unexplained-drift bucket count: **${summary.overall.bucketGroups.mixed}**. Fabrications caught by span verification: **${summary.overall.fabricationCount}** (**${formatPct(summary.overall.fabricationRate)}** of all claims).`);
  lines.push('');
  lines.push('## Task Summary');
  lines.push('');
  lines.push('| Task | Verified | Rejected | Verification | Fabrications | Model rejected | Recommendation |');
  lines.push('|---|---:|---:|---:|---:|---:|---|');
  for (const row of summary.tasks) {
    lines.push(`| \`${row.task}\` | ${row.claimsVerified}/${row.claimsTotal} | ${row.claimsRejected} | ${formatPct(row.verificationRate)} | ${row.fabricationCount} (${formatPct(row.fabricationRate)}) | ${row.modelOwnedRejected} (${formatPct(row.modelShareOfRejected)} of rejected) | ${row.recommendation} |`);
  }
  lines.push('');
  lines.push('## Routing Proposal');
  lines.push('');
  lines.push('- Keep `holding`, `arguments`, `authorities`, and `topics` eligible for the existing 1,000-document expansion plan, subject to owner-lane approval and continued span verification.');
  lines.push('- Hold `case_structure` at 100 until prompt/router changes reduce narrative `fact` fabrication and the task is remeasured.');
  lines.push('- Treat this as spend and quality triage only. It is not a product safety waiver, because span verification caught and dropped the rejected claims.');
  lines.push('');
  lines.push('## Single-Grant Runtime Envelope');
  lines.push('');
  lines.push(`Baseline classified substantive population from the legal-object program: **${router.eligibleDocsBaseline.toLocaleString()}** documents. At the observed **${router.secondsPerDocumentTask}s/document-task**, all five tasks would be about **${router.estimatedSingleGrantHours.allFiveTasks.toLocaleString()} hours** on one grant. Running only the four cleared tasks is about **${router.estimatedSingleGrantHours.fourClearedTasks.toLocaleString()} hours**, deferring about **${router.estimatedSingleGrantHours.deferredCaseStructure.toLocaleString()} hours** of \`case_structure\` spend.`);
  lines.push('');
  lines.push('## High-Risk Kinds');
  lines.push('');
  lines.push('| Task | Kind | Rejected | Fabrication | Model bucket rate | Recommendation |');
  lines.push('|---|---|---:|---:|---:|---|');
  for (const item of router.kindPolicy.slice(0, 12)) {
    lines.push(`| \`${item.task}\` | \`${item.kind}\` | ${formatPct(item.rejectionRate)} | ${formatPct(item.fabricationRate)} | ${formatPct(item.modelBucketRate)} | ${item.recommendation} |`);
  }
  lines.push('');
  lines.push('## Prepared Selectors');
  lines.push('');
  lines.push('- `docs/ai/cx1-legal-object-efficiency/efficiency-selector.sql` measures enrichment coverage, verification, token, and latency slices by task/model/court/year/class/length band.');
  lines.push('- `docs/ai/cx1-legal-object-efficiency/llm-cost-selector.sql` measures coarse `feature = extract` cost by model/day. Current schema does not link `llm_calls` rows to `document_enrichments`, so per-task cost attribution remains not-yet-KNOW.');
  lines.push('');
  lines.push('## Evidence Files');
  lines.push('');
  lines.push('- `docs/ai/cx1-legal-object-efficiency/triage-summary.json`');
  lines.push('- `docs/ai/cx1-legal-object-efficiency/task-summary.csv`');
  lines.push('- `docs/ai/cx1-legal-object-efficiency/kind-risk.csv`');
  lines.push('- `docs/ai/cx1-legal-object-efficiency/router-proposal.json`');
  return `${lines.join('\n')}\n`;
}

function selectorSql() {
  return `-- CX1 read-only legal-object efficiency selector. Run only under MEDIUM_CLEAN.
WITH enrichment_slices AS (
  SELECT
    e.task,
    e.prompt_version,
    e.model,
    COALESCE(j.court, 'unknown') AS court,
    COALESCE(EXTRACT(YEAR FROM j.judgment_date)::int, 0) AS judgment_year,
    COALESCE(j.hc_document_class::text, 'unknown') AS hc_document_class,
    CASE
      WHEN length(COALESCE(j.full_text, '')) < 2000 THEN 'lt_2k'
      WHEN length(COALESCE(j.full_text, '')) < 8000 THEN '2k_8k'
      WHEN length(COALESCE(j.full_text, '')) < 20000 THEN '8k_20k'
      ELSE 'gte_20k'
    END AS text_length_band,
    count(*) AS enrichment_rows,
    count(*) FILTER (WHERE e.status = 'ok') AS ok_rows,
    count(*) FILTER (WHERE e.verification_state = 'verified') AS verified_rows,
    count(*) FILTER (WHERE e.verification_state = 'partial') AS partial_rows,
    count(*) FILTER (WHERE e.verification_state = 'rejected') AS rejected_rows,
    sum(COALESCE(e.verified_count, 0)) AS verified_claims,
    sum(COALESCE(e.rejected_count, 0)) AS rejected_claims,
    round(avg(NULLIF(e.input_tokens, 0))::numeric, 2) AS avg_input_tokens,
    round(avg(NULLIF(e.output_tokens, 0))::numeric, 2) AS avg_output_tokens,
    round(avg(NULLIF(e.latency_ms, 0))::numeric, 2) AS avg_latency_ms
  FROM document_enrichments e
  JOIN judgments j ON j.id = e.judgment_id
  WHERE e.task IN ('case_structure', 'holding', 'arguments', 'authorities', 'topics')
  GROUP BY
    e.task,
    e.prompt_version,
    e.model,
    COALESCE(j.court, 'unknown'),
    COALESCE(EXTRACT(YEAR FROM j.judgment_date)::int, 0),
    COALESCE(j.hc_document_class::text, 'unknown'),
    text_length_band
)
SELECT *
FROM enrichment_slices
ORDER BY task, model, court, judgment_year, hc_document_class, text_length_band;
`;
}

function costSql() {
  return `-- CX1 read-only coarse extract-cost selector. Run only under MEDIUM_CLEAN.
WITH extract_cost AS (
  SELECT
    date_trunc('day', created_at)::date AS day,
    model,
    count(*) AS extract_rows,
    sum(input_tokens) AS input_tokens,
    sum(output_tokens) AS output_tokens,
    sum(cost_usd) AS cost_usd,
    round(avg(NULLIF(latency_ms, 0))::numeric, 2) AS avg_latency_ms
  FROM llm_calls
  WHERE feature = 'extract'
  GROUP BY date_trunc('day', created_at)::date, model
)
SELECT *
FROM extract_cost
ORDER BY day, model;
`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const triages = TRIAGE_FILES.map((file) => ({ file, ...readJson(file) }));
  const taskRows = triages.map(summarizeTask).sort((a, b) => a.task.localeCompare(b.task));
  const kindRows = triages.flatMap(summarizeKinds).sort((a, b) => {
    if (a.task !== b.task) return a.task.localeCompare(b.task);
    return b.fabricationRate - a.fabricationRate || b.modelBucketRate - a.modelBucketRate || a.kind.localeCompare(b.kind);
  });

  const overall = {
    claimsTotal: taskRows.reduce((sum, row) => sum + row.claimsTotal, 0),
    claimsVerified: taskRows.reduce((sum, row) => sum + row.claimsVerified, 0),
    claimsRejected: taskRows.reduce((sum, row) => sum + row.claimsRejected, 0),
    owners: {
      ingest: taskRows.reduce((sum, row) => sum + row.ingestOwnedRejected, 0),
      model: taskRows.reduce((sum, row) => sum + row.modelOwnedRejected, 0),
      verifier: taskRows.reduce((sum, row) => sum + row.verifierOwnedRejected, 0),
    },
    bucketGroups: {
      mixed: taskRows.reduce((sum, row) => sum + row.mixedRejected, 0),
      unknown: taskRows.reduce((sum, row) => sum + row.unknownRejected, 0),
    },
    fabricationCount: taskRows.reduce((sum, row) => sum + row.fabricationCount, 0),
  };
  overall.verificationRate = pct(overall.claimsVerified, overall.claimsTotal);
  overall.rejectionRate = pct(overall.claimsRejected, overall.claimsTotal);
  overall.fabricationRate = pct(overall.fabricationCount, overall.claimsTotal);

  const summary = {
    schema: 'cx1-legal-object-efficiency-v1',
    generatedAt: new Date().toISOString(),
    boundary:
      'offline only: no model call, no PostgreSQL query, no enrichment promotion, no retrieval change',
    inputs: TRIAGE_FILES,
    overall,
    tasks: taskRows,
    kinds: kindRows,
    caveats: [
      'Triage rows are sampled post-fix evidence, not corpus-wide legal-object truth.',
      'All legal-object text fields remain quote candidates until span verification confirms them.',
      'llm_calls cost rows are not linked to document_enrichments; task-level cost attribution is not yet measured.',
    ],
  };
  const router = buildRouter(taskRows, kindRows);

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(OUT_ROUTER_JSON, `${JSON.stringify(router, null, 2)}\n`);
  writeCsv(OUT_TASK_CSV, taskRows, [
    'task',
    'claimsTotal',
    'claimsVerified',
    'claimsRejected',
    'verificationRate',
    'rejectionRate',
    'ingestOwnedRejected',
    'modelOwnedRejected',
    'verifierOwnedRejected',
    'mixedRejected',
    'unknownRejected',
    'fabricationCount',
    'fabricationRate',
    'modelBucketRejected',
    'modelBucketRate',
    'recommendation',
    'recommendationReason',
  ]);
  writeCsv(OUT_KIND_CSV, kindRows, [
    'task',
    'kind',
    'claimsTotal',
    'claimsRejected',
    'rejectionRate',
    'modelBucketRejected',
    'modelBucketRate',
    'ingestBucketRejected',
    'verifierBucketRejected',
    'mixedBucketRejected',
    'fabricationCount',
    'fabricationRate',
    'bucketTotalCheck',
  ]);
  fs.writeFileSync(OUT_SELECTOR_SQL, selectorSql());
  fs.writeFileSync(OUT_COST_SQL, costSql());
  fs.writeFileSync(OUT_MD, renderMarkdown(summary, router));

  console.log(`wrote ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`wrote ${path.relative(ROOT, OUT_ROUTER_JSON)}`);
  console.log(`wrote ${path.relative(ROOT, OUT_MD)}`);
}

main();
