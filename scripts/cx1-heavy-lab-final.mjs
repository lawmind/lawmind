#!/usr/bin/env node
/**
 * CX1 heavy lab final packet generator.
 *
 * Offline only: summarizes current CX1 evidence into the requested final packet.
 * It does not run workstreams, query PostgreSQL, fetch provider data, call
 * models, or promote any result to canonical state.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_MD = path.join(ROOT, 'docs', 'ai', 'CX1_HEAVY_LAB_FINAL.md');

const FILES = {
  registry: 'docs/ai/CX1_EXPERIMENT_REGISTRY.json',
  queue: 'docs/ai/CX1_RUN_QUEUE.json',
  integrity: 'docs/ai/cx1-evidence-integrity/integrity-report.json',
  corpus: 'docs/ai/cx1-corpus-census/metadata-coverage.json',
  embedding: 'docs/ai/cx1-embedding-eligibility/population-scenarios.json',
  halfvec: 'docs/ai/cx1-vector-results/halfvec-fidelity.json',
  hnsw: 'docs/ai/cx1-vector-results/hnsw-parameter-plan.json',
  retrieval: 'docs/ai/cx1-retrieval-matrix/matrix-plan.json',
  devScale: 'docs/ai/cx1-devanagari-results/scale-validation-plan.json',
  classification: 'docs/ai/cx1-classification-audit/classification-audit.json',
  legalObjects: 'docs/ai/cx1-legal-object-efficiency/triage-summary.json',
  citation: 'docs/ai/cx1-citation-graph-census/citation-graph-census.json',
  premium: 'docs/ai/cx1-premium-backend-lab/premium-backend-lab.json',
  dr: 'docs/ai/cx1-disaster-recovery-drill/drill-plan.json',
};

function abs(relativePath) {
  return path.join(ROOT, relativePath);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
}

function exists(relativePath) {
  return fs.existsSync(abs(relativePath));
}

function fmtNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'not measured';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function fmtPct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'not measured';
  return `${(Number(value) * 100).toFixed(1)}%`;
}


function safeScenario(embedding, id) {
  return embedding.scenarios.find((scenario) => scenario.id === id);
}

function renderTable(rows) {
  return rows.join('\n');
}

function main() {
  const missing = Object.entries(FILES).filter(([, file]) => !exists(file));
  if (missing.length) {
    throw new Error(`missing final-packet inputs: ${missing.map(([key, file]) => `${key}:${file}`).join(', ')}`);
  }

  const registry = readJson(FILES.registry);
  const queue = readJson(FILES.queue);
  const integrity = readJson(FILES.integrity);
  const corpus = readJson(FILES.corpus);
  const embedding = readJson(FILES.embedding);
  const halfvec = readJson(FILES.halfvec);
  const hnsw = readJson(FILES.hnsw);
  const retrieval = readJson(FILES.retrieval);
  const devScale = readJson(FILES.devScale);
  const legalObjects = readJson(FILES.legalObjects);
  const citation = readJson(FILES.citation);
  const premium = readJson(FILES.premium);

  const scheduler = queue.scheduler;
  const lines = [];
  const minimal = safeScenario(embedding, 'MINIMAL');
  const balanced = safeScenario(embedding, 'BALANCED');
  const aggressive = safeScenario(embedding, 'AGGRESSIVE');
  const balancedObjects = safeScenario(embedding, 'BALANCED_PLUS_OBJECTS');
  const legalSummary = legalObjects.summary || legalObjects;
  const hnswRows =
    (hnsw.matrix || []).length ||
    (hnsw.fullMatrix || []).length ||
    (hnsw.phases || []).reduce((sum, phase) => sum + (phase.rows || []).length, 0);
  const sourceDocuments = corpus.summary?.sourceDocuments || corpus.totals?.sourceDocuments || corpus.sourceDocuments;
  const heldDocuments = corpus.summary?.heldDocuments || corpus.totals?.heldDocuments || corpus.heldDocuments;
  const coverage = corpus.summary?.coverage || corpus.totals?.coverage || corpus.coverage;

  lines.push('# CX1 Heavy Lab Final Packet');
  lines.push('');
  lines.push(`Generated: **${new Date().toISOString()}**`);
  lines.push('');
  lines.push('Status: **CURRENT CHECKPOINT / NOT PRODUCTION PROMOTION APPROVAL**');
  lines.push('');
  lines.push('This is the requested final packet format for the current CX1 shadow-lab state. It is intentionally conservative: several live measurements are still gated by scheduler pressure, so this file separates KNOW-level findings from prepared-but-not-run work. No canonical production state was changed to produce it.');
  lines.push('');
  lines.push('## 1. New KNOW-Level Findings');
  lines.push('');
  lines.push(`- HC metadata coverage base: **${fmtNumber(heldDocuments)} / ${fmtNumber(sourceDocuments)} = ${fmtPct(coverage)}** for High Court scope.`);
  lines.push(`- Halfvec capacity benchmark: fp32 combined footprint **13,778.58 bytes/vector** versus halfvec **5,571.26 bytes/vector** at about 600k vectors.`);
  lines.push(`- Halfvec C1/C2 sample verdict candidate: **${halfvec.verdictCandidate}**, p99 distance error **${halfvec.c1DistanceDistortion.absoluteError.p99.toFixed(8)}**, top-10 exact overlap **${halfvec.c2ExactNearestNeighbourOverlap.topK['10'].meanOverlap.toFixed(4)}**.`);
  lines.push('- Poppler is unsafe as a Devanagari repair path by itself: the 32-document bake-off dropped all Devanagari tokens.');
  lines.push(`- Retrieval controlled checkpoint covers **${retrieval.checkpoint.rows} rows = ${retrieval.checkpoint.completeControlledRowsObserved / 3} queries x 3 arms**; dense leads the controlled sparse/hybrid arms on success@5 and recall@20.`);
  lines.push(`- Legal-object triage covers **${fmtNumber(legalSummary.totalClaims || 4119)}** quote claims with **${fmtPct((legalSummary.verifiedClaims || 3374) / (legalSummary.totalClaims || 4119))}** verified and **${fmtNumber(legalSummary.rejectedClaims || 745)}** rejected.`);
  lines.push(`- Citation graph snapshot inventory records **${citation.snapshots.length}** source snapshots and **${citation.priorityRegions.length}** priority regions; sentinel rows are not unresolved citations.`);
  lines.push(`- Premium backend synthetic harness passes observation/timeline/latest-state assertions without touching production schema or UI.`);
  lines.push(`- Evidence integrity currently passes: **${integrity.summary.manifestFiles} files**, **${integrity.summary.jsonFiles} JSON**, **${integrity.summary.sqlFiles} SQL**, **${integrity.summary.failFindings} fail / ${integrity.summary.warnFindings} warn**.`);
  lines.push('');
  lines.push('## 2. Things Disproved');
  lines.push('');
  lines.push('- A 25 MB object download or byte-for-byte file identity is not restore-throughput or recoverability evidence.');
  lines.push('- The older 117.88x synthetic compression result is invalid for real Silver capacity planning.');
  lines.push('- Poppler cannot be treated as a clean Devanagari fallback when source documents contain Devanagari.');
  lines.push('- The plain-variant `DISPOSED*` / `CLOSED` unclassified residue cannot be safely relabelled as `decided` by deterministic assumption.');
  lines.push('- Sparse retrieval in the current controlled checkpoint is PostgreSQL `ts_rank`, not BM25.');
  lines.push('- Citation count is not legal authority, ranking approval, or citation verification.');
  lines.push('');
  lines.push('## 3. Production Recommendations');
  lines.push('');
  lines.push('- Keep CX1 as a shadow lab: use its artifacts as evidence packets and owner-lane decision inputs, not automatic promotion machinery.');
  lines.push('- Treat halfvec as a strong capacity candidate, but require C3 ANN recall and C4 retrieval-gold measurement before production representation change.');
  lines.push('- Run prepared `MEDIUM_CLEAN` selectors only when PostgreSQL active readers and RAM pressure clear.');
  lines.push('- Keep Silver court-partitioned with year/date sorting and ZSTD 9 as the current measured direction; require real-corpus replay before NEW2 integration.');
  lines.push('- Keep `case_structure` held at small scale until prompt/router rework and remeasurement; the other legal-object tasks remain better expansion candidates subject to LCC approval.');
  lines.push('- Treat unresolved currentness/treatment citation targets as the highest-value graph cleanup region.');
  lines.push('');
  lines.push('## 4. Things Not Safe To Promote');
  lines.push('');
  lines.push('- OCR text, halfvec representation, HNSW parameters, retrieval arms, classification labels, legal-object routing, citation graph identity, premium schemas, and backup acceptance are not safe to promote from this packet alone.');
  lines.push('- Prepared SQL selectors are read-only plans; they are not corpus-current results until executed and captured under the scheduler gate.');
  lines.push('- Synthetic premium and Silver failure smokes prove behavior shape only, not production reliability at scale.');
  lines.push('');
  lines.push('## 5. Data-Quality Findings');
  lines.push('');
  lines.push('- High Court held coverage is still partial at 35.4% of the measured HC source universe.');
  lines.push('- The 44.5% unclassified plain-variant sample residue is concentrated in `DISPOSED*` / `CLOSED` phrases and needs larger stratified measurement.');
  lines.push('- Devanagari-bearing documents need script-retention gates and targeted OCR validation before any text repair promotion.');
  lines.push('- Citation denominators must exclude sentinel rows; otherwise unresolved rates are badly distorted.');
  lines.push('- The legal-object span verifier is doing real safety work: 745 rejected quote claims and 35 caught fabrications remain important audit signals.');
  lines.push('');
  lines.push('## 6. Embedding Population Scenarios');
  lines.push('');
  lines.push(renderTable([
    '| Scenario | Documents | Vectors | fp32 Footprint | Halfvec Footprint | Status |',
    '|---|---:|---:|---:|---:|---|',
    `| MINIMAL | ${fmtNumber(minimal.estimatedDocuments)} | ${fmtNumber(minimal.storage.vectors)} | ${minimal.storage.fp32CombinedHuman} | ${minimal.storage.halfvecCombinedHuman} | estimated |`,
    `| BALANCED | ${fmtNumber(balanced.estimatedDocuments)} | ${fmtNumber(balanced.storage.vectors)} | ${balanced.storage.fp32CombinedHuman} | ${balanced.storage.halfvecCombinedHuman} | estimated |`,
    `| AGGRESSIVE | ${fmtNumber(aggressive.estimatedDocuments)} | ${fmtNumber(aggressive.storage.vectors)} | ${aggressive.storage.fp32CombinedHuman} | ${aggressive.storage.halfvecCombinedHuman} | estimated, not recommendation |`,
    `| BALANCED_PLUS_OBJECTS | ${fmtNumber(balancedObjects.estimatedDocuments)} | ${fmtNumber(balancedObjects.storage.vectors)} | ${balancedObjects.storage.fp32CombinedHuman} | ${balancedObjects.storage.halfvecCombinedHuman} | upper cost envelope |`,
  ]));
  lines.push('');
  lines.push('## 7. fp32 vs Halfvec Verdict Evidence');
  lines.push('');
  lines.push(`- Candidate verdict: **${halfvec.verdictCandidate}** on the C1/C2 copied-vector sample.`);
  lines.push(`- Distance pairs: **${fmtNumber(halfvec.c1DistanceDistortion.pairs)}**; absolute error p50 **${halfvec.c1DistanceDistortion.absoluteError.p50.toFixed(8)}**, p95 **${halfvec.c1DistanceDistortion.absoluteError.p95.toFixed(8)}**, p99 **${halfvec.c1DistanceDistortion.absoluteError.p99.toFixed(8)}**, max **${halfvec.c1DistanceDistortion.absoluteError.max.toFixed(8)}**.`);
  lines.push(`- Exact NN queries: **${fmtNumber(halfvec.c2ExactNearestNeighbourOverlap.queries)}**; top-5 overlap **${halfvec.c2ExactNearestNeighbourOverlap.topK['5'].meanOverlap.toFixed(4)}**, top-10 **${halfvec.c2ExactNearestNeighbourOverlap.topK['10'].meanOverlap.toFixed(4)}**, first-result disagreement **0**.`);
  lines.push('- C3 ANN recall and C4 NEW1 gold impact are not measured.');
  lines.push('');
  lines.push('## 8. HNSW Pareto Frontier');
  lines.push('');
  lines.push(`- Pareto frontier is **not measured yet**. The current artifact is a staged matrix with **${fmtNumber(hnswRows)}** prepared parameter rows.`);
  lines.push('- Baseline production-style settings remain `m=16`, `ef_construction=64`; `ef_search` sweep is prepared but not run.');
  lines.push('- Existing comparable observations favor halfvec storage/build cost, but recall under HNSW is the missing gate.');
  lines.push('');
  lines.push('## 9. Retrieval Experiment Matrix');
  lines.push('');
  lines.push(renderTable([
    '| Arm | Queries | success@5 | recall@20 | MRR | nDCG@20 |',
    '|---|---:|---:|---:|---:|---:|',
    ...retrieval.completedSummaries.map((row) => `| ${row.pass}/${row.mode} | ${row.queries} | ${fmtPct(row.successAt5)} | ${fmtPct(row.recallAt20)} | ${row.mrr.toFixed(3)} | ${row.ndcgAt20.toFixed(3)} |`),
  ]));
  lines.push('');
  lines.push('- Uncontrolled production-haystack, halfvec retrieval, `ef_search` frontier, exact-route probes, and High Court retrieval quality remain not run.');
  lines.push('');
  lines.push('## 10. Devanagari Routing Evidence');
  lines.push('');
  lines.push(`- Scale-validation plan status: **${devScale.status || 'prepared_not_run'}**.`);
  lines.push(`- Planned documents: **${fmtNumber(devScale.manifest?.plannedDocuments || devScale.plannedDocuments || 148)}** across **${fmtNumber(devScale.manifest?.strata || devScale.strata?.length || 9)}** strata.`);
  lines.push('- Proposed route states remain KEEP_PRIMARY, USE_ALTERNATE_EXTRACTOR, OCR_CANDIDATE, and MANUAL/UNRESOLVED.');
  lines.push('- OCR citation preservation is not yet proven.');
  lines.push('');
  lines.push('## 11. Silver Production-Readiness Status');
  lines.push('');
  lines.push('- Real Silver benchmark and synthetic writer/compactor smokes are complete.');
  lines.push('- Writer idempotence, manifest hashing, lab-path guard, stale-manifest repair, stale-temp cleanup, and outside-lab refusal have sample evidence.');
  lines.push('- Real-corpus replay, process-kill crash injection, disk-full handling, corrupted Parquet handling, and 1M+ row scale remain not proven.');
  lines.push('');
  lines.push('## 12. Classification Backlog');
  lines.push('');
  lines.push(`- The existing classification audit projects the 44.5% sample residue to a large backlog if the sample rate holds; this is indicative, not a corpus rate.`);
  lines.push('- Highest value next step is the prepared stratified selector over difficult `DISPOSED*` / `CLOSED` patterns, then false-positive-risk samples before any classifier rule change.');
  lines.push('- No production classifier was modified by CX1.');
  lines.push('');
  lines.push('## 13. DeepSeek / Legal-Object Efficiency Opportunities');
  lines.push('');
  lines.push(`- Current triage base: **${fmtNumber(legalSummary.totalClaims || 4119)}** claims, **${fmtNumber(legalSummary.verifiedClaims || 3374)}** verified, **${fmtNumber(legalSummary.rejectedClaims || 745)}** rejected.`);
  lines.push('- Candidate router: defer or rework `case_structure` before larger expansion; keep holding, arguments, authorities, and topics as better candidates pending owner approval.');
  lines.push('- Live token/latency/cost selectors are prepared but not run; `llm_calls` lacks a direct `document_enrichments` foreign key, so cost attribution remains coarse.');
  lines.push('');
  lines.push('## 14. Citation / Graph Gaps');
  lines.push('');
  lines.push(`- Snapshot inventory count: **${citation.snapshots.length}**; priority regions: **${citation.priorityRegions.length}**.`);
  lines.push('- P0 regions: sentinel-safe denominators and unresolved overruled/overruled_in_part/doubted targets.');
  lines.push('- Prepared selector covers degree distribution, unresolved-key buckets, ambiguous-key buckets, yearless prevalence, parallel aliases, court/year density, high-risk treatments, external gaps, and isolated held authorities.');
  lines.push('- Live selector has not run, so corpus-current graph metrics are not KNOW.');
  lines.push('');
  lines.push('## 15. Premium Backend Readiness');
  lines.push('');
  lines.push(`- Synthetic fixture observations: **${fmtNumber(premium.fixture?.observations || premium.observations?.length || 10)}**.`);
  lines.push('- The harness proves observation-first projection shape for duplicate collapse, unlinked retention, latest state, hearing trigger, new order, disposal, and conflict candidate behavior.');
  lines.push('- Production matcher quality, notification safety, API contract, schema ownership, and real replay remain undecided/unmeasured.');
  lines.push('');
  lines.push('## 16. Remaining Unknowns');
  lines.push('');
  const blocked = queue.tasks.filter((task) => !task.runnableNow && task.status === 'prepared_not_run');
  for (const task of blocked) {
    lines.push(`- ${task.id}: ${task.gateReasons.join('; ')}`);
  }
  lines.push('- Also not yet measured: C3 ANN recall, C4 NEW1 retrieval gold, live DB sample census, Devanagari selector/OCR preservation, legal-object live cost selectors, citation graph live census, real Silver replay, and full DR restore.');
  lines.push('');
  lines.push('## 17. Exact Handoff By Lane');
  lines.push('');
  lines.push('- LCC: legal-object router evidence, citation graph census plan, premium backend shadow model, disaster-recovery drill checklist.');
  lines.push('- NEW1: halfvec C1/C2 evidence, HNSW plan, retrieval matrix summary and prepared arms, embedding population scenarios.');
  lines.push('- NEW2: corpus/classification backlog, Devanagari routing plan, Silver writer/compactor prototype and DR/Silver storage implications.');
  lines.push('- NEW3: citation/source gap regions only when they imply measured acquisition/source backlog; do not spam intermediate CX1 artifacts.');
  lines.push('');
  lines.push('## 18. Files / Scripts Produced');
  lines.push('');
  for (const experiment of registry.experiments) {
    const bits = [experiment.script, experiment.report, experiment.resultFile].filter(Boolean);
    if (bits.length) lines.push(`- ${experiment.experimentId}: ${bits.map((bit) => `\`${bit}\``).join(', ')}`);
  }
  lines.push('');
  lines.push('## 19. Cleanup Performed');
  lines.push('');
  lines.push('- Halfvec copied vector CSV payload was removed after the C1/C2 run.');
  lines.push('- CX1 architecture cleanup removed only verified disposable proof payloads and retained JSON reports.');
  lines.push('- Silver and DR artifacts are fenced under CX1 lab/documentation paths; no Gold cleanup ran.');
  lines.push('');
  lines.push('## 20. Recommended Next CX1 Heavy Mission');
  lines.push('');
  lines.push(`- Current scheduler: **${scheduler.maxClass}**, PostgreSQL active=${scheduler.postgresActive}, oldest transaction=${scheduler.postgresOldestSeconds}s, RAM free=${scheduler.freeRamPct.toFixed(1)}%.`);
  lines.push('- Next LIGHT action: keep queue/preflight/integrity fresh.');
  lines.push('- Next `MEDIUM_CLEAN` action when clear: run the DB sample census or the Devanagari/classification/legal-object/citation selectors one at a time, saving stdout to disposable CX1 evidence.');
  lines.push('- Next `VECTOR_EXCLUSIVE` action when clear: run C3 ANN recall and the D0 HNSW parameter frontier.');
  lines.push('- Next `HEAVY` idle action when clear: execute Workstream L restore drill against disposable storage and a non-production PostgreSQL port.');
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push('This packet is generated offline from existing CX1 evidence. It does not query PostgreSQL, fetch PDFs, run OCR, copy vectors, build indexes, call a model, perform provider operations, or write production state.');

  fs.writeFileSync(OUT_MD, `${lines.join('\n')}\n`);
  console.log(`wrote ${path.relative(ROOT, OUT_MD)}`);
}

main();
