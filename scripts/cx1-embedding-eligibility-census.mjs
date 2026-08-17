#!/usr/bin/env node
/**
 * CX1 embedding-eligibility census, phase 1.
 *
 * Metadata/sample-driven population model only. It does not generate embeddings,
 * query the database, or label legal importance. The point is to make the
 * assumptions visible and machine-readable so NEW1 can replace estimates with
 * measured populations later.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-embedding-eligibility');
const REPORT = path.join(ROOT, 'docs', 'ai', 'CX1_EMBEDDING_ELIGIBILITY_CENSUS.md');

const FP32_BYTES_PER_VECTOR = 13778.58;
const HALFVEC_BYTES_PER_VECTOR = 5571.26;
const EXISTING_VECTOR_ROWS = 620300;
const EXISTING_VECTOR_JUDGMENTS = 40161;
const SUPREME_COURT_SOURCE = 38351;
const SUPREME_COURT_HELD = 38342;
const DEVANAGARI_DOC_SHARE_ESTIMATE = 0.0056;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function fmtInt(n) {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function fmtBytes(n) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = n;
  let unit = 0;
  while (Math.abs(value) >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function estimateClassCounts(heldHcDocuments, classSample) {
  const totalSample = classSample.documentsClassified;
  const counts = {};
  for (const [klass, sampleCount] of Object.entries(classSample.byClass)) {
    const share = sampleCount / totalSample;
    counts[klass] = {
      sampleCount,
      share,
      estimatedHeldDocuments: heldHcDocuments * share,
      meanChars: classSample.meanCharsByClass[klass] ?? null,
      estimatedUtf8Bytes:
        classSample.meanCharsByClass[klass] === undefined
          ? null
          : heldHcDocuments * share * classSample.meanCharsByClass[klass],
    };
  }
  return counts;
}

function storage(vectors) {
  return {
    vectors: Math.round(vectors),
    fp32CombinedBytes: Math.round(vectors * FP32_BYTES_PER_VECTOR),
    halfvecCombinedBytes: Math.round(vectors * HALFVEC_BYTES_PER_VECTOR),
    fp32CombinedHuman: fmtBytes(vectors * FP32_BYTES_PER_VECTOR),
    halfvecCombinedHuman: fmtBytes(vectors * HALFVEC_BYTES_PER_VECTOR),
  };
}

function scenario(id, description, documents, vectorsPerDocument, notes) {
  const vectors = documents * vectorsPerDocument;
  return {
    id,
    description,
    estimatedDocuments: Math.round(documents),
    vectorsPerDocument,
    storage: storage(vectors),
    notes,
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const census = readJson('docs/ai/cx1-corpus-census/metadata-coverage.json');
  const classSample = readJson('docs/ai/new2-silver-proof/hc-class-sample-20260817.json');
  const orderTypes = readJson('docs/HC_ORDER_TYPES.json');

  const heldHc = census.totals.heldDocuments;
  const classCounts = estimateClassCounts(heldHc, classSample);
  const decided = classCounts.decided.estimatedHeldDocuments;
  const decidedBrief = classCounts.decided_brief.estimatedHeldDocuments;
  const bail = classCounts.bail_order.estimatedHeldDocuments;
  const unclassified = classCounts.unclassified.estimatedHeldDocuments;
  const procedural = classCounts.procedural_disposal.estimatedHeldDocuments;
  const stubs = classCounts.reference_stub.estimatedHeldDocuments;
  const substantiveUpper = SUPREME_COURT_HELD + decided + decidedBrief;
  const practicalWithBail = substantiveUpper + bail;
  const modelTriageResidue = unclassified;
  const usefulUpper = practicalWithBail + modelTriageResidue;
  const excludedDefer = procedural + stubs;

  const tiers = [
    {
      id: 'TIER_A',
      label: 'canonical substantive authorities with reliable identity/text',
      population: Math.round(substantiveUpper),
      components: {
        supremeCourtHeld: SUPREME_COURT_HELD,
        hcDecidedUpperBound: Math.round(decided),
        hcDecidedBriefUpperBound: Math.round(decidedBrief),
      },
      caution:
        '`decided` and `decided_brief` are sample-derived upper bounds on authority; they are not legal weight.',
    },
    {
      id: 'TIER_B',
      label: 'verified legal objects',
      population: null,
      components: {},
      caution:
        'Population needs document_enrichments task/status counts by task and verification_state; not estimated from document class.',
    },
    {
      id: 'TIER_C',
      label: 'important paragraphs from substantive authorities',
      population: null,
      components: {},
      caution:
        'Paragraph count and importance signals require sampled paragraph/citation/user-action data; not estimated in phase 1.',
    },
    {
      id: 'TIER_D',
      label: 'procedural/non-precedential material whose embedding value is uncertain',
      population: Math.round(bail + procedural),
      components: {
        hcBailOrders: Math.round(bail),
        hcProceduralDisposals: Math.round(procedural),
      },
      caution:
        'Bail orders may be practically useful but are not automatically precedential. Procedural disposals are a retrieval-value experiment, not an authority tier.',
    },
    {
      id: 'TIER_E',
      label: 'exclude/defer',
      population: Math.round(stubs + modelTriageResidue),
      components: {
        referenceStubs: Math.round(stubs),
        disposedClosedUnclassifiedResidue: Math.round(modelTriageResidue),
      },
      caution:
        'The unclassified residue is model-triage work, not safe exclusion forever; reference stubs are the true hard defer in this phase.',
    },
  ];

  const scenarios = [
    scenario(
      'MINIMAL',
      'Existing dense coverage plus one document vector for TIER_A candidate authorities only.',
      substantiveUpper,
      1,
      [
        'Uses sample-derived HC decided + decided_brief upper bound and all Supreme Court held rows.',
        'Does not include unclassified DISPOSED/CLOSED residue.',
      ],
    ),
    scenario(
      'BALANCED',
      'TIER_A plus bail-order practical material, one document vector each.',
      practicalWithBail,
      1,
      [
        'Includes bail_order because criminal-practice retrieval may need it.',
        'Still excludes DISPOSED/CLOSED residue until triaged.',
      ],
    ),
    scenario(
      'AGGRESSIVE',
      'All plausibly useful non-procedural/non-stub material, one document vector each.',
      usefulUpper,
      1,
      [
        'Includes the unclassified DISPOSED/CLOSED residue as a triage candidate.',
        'This is not a recommendation to embed it before classification.',
      ],
    ),
    scenario(
      'BALANCED_PLUS_OBJECTS',
      'BALANCED plus three legal-object vectors per included document.',
      practicalWithBail,
      4,
      [
        'One document vector plus three legal-object/proposition vectors per document.',
        'Legal-object acceptance rates are not included yet; this is an upper cost envelope.',
      ],
    ),
  ];

  const manifest = {
    schema: 'cx1-embedding-eligibility-phase1-v1',
    generatedAt: new Date().toISOString(),
    evidenceClass: 'ESTIMATED_FROM_EXISTING_MEASUREMENTS_NO_DB_READ',
    inputs: {
      corpusCensus: 'docs/ai/cx1-corpus-census/metadata-coverage.json',
      hcClassSample: 'docs/ai/new2-silver-proof/hc-class-sample-20260817.json',
      mobileOrderTypes: 'docs/HC_ORDER_TYPES.json',
      vectorCapacity: 'docs/ai/CX1_VECTOR_CAPACITY_BENCHMARK.md',
    },
    constants: {
      fp32CombinedBytesPerVector: FP32_BYTES_PER_VECTOR,
      halfvecCombinedBytesPerVector: HALFVEC_BYTES_PER_VECTOR,
      existingVectorRows: EXISTING_VECTOR_ROWS,
      existingVectorJudgments: EXISTING_VECTOR_JUDGMENTS,
      supremeCourtSource: SUPREME_COURT_SOURCE,
      supremeCourtHeld: SUPREME_COURT_HELD,
      supremeCourtGap: SUPREME_COURT_SOURCE - SUPREME_COURT_HELD,
      devanagariDocumentShareEstimate: DEVANAGARI_DOC_SHARE_ESTIMATE,
    },
    heldHighCourtDocuments: heldHc,
    classEstimates: classCounts,
    tiers,
    scenarios,
    deferOrMeasure: {
      proceduralAndReferenceStubEstimate: Math.round(excludedDefer),
      unclassifiedResidueEstimate: Math.round(modelTriageResidue),
      mobileSliceWarning: {
        scope: orderTypes.scope,
        labelledRows: orderTypes.labelledRows,
        warning: 'Disjoint mobile variant only; not a corpus-wide judgment share.',
      },
      missingMetrics: [
        'paragraph count distribution',
        'citation-count distribution by class',
        'existing vector coverage by court/year after migration',
        'legal-object acceptance rates by task',
        'verified legal-object population',
        'duplicate/canonical collapse impact',
        'language distribution beyond Devanagari character presence proxy',
      ],
    },
  };

  const jsonPath = path.join(OUT_DIR, 'population-scenarios.json');
  const csvPath = path.join(OUT_DIR, 'population-scenarios.csv');
  fs.writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(
    csvPath,
    [
      'scenario,estimated_documents,vectors,fp32_combined_bytes,halfvec_combined_bytes',
      ...scenarios.map((s) =>
        [
          s.id,
          s.estimatedDocuments,
          s.storage.vectors,
          s.storage.fp32CombinedBytes,
          s.storage.halfvecCombinedBytes,
        ].join(','),
      ),
    ].join('\n') + '\n',
  );

  const lines = [];
  lines.push('# CX1 Embedding Eligibility Census');
  lines.push('');
  lines.push(`Generated: **${manifest.generatedAt}**`);
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push('This is a phase-1 population and storage model. It generates **no embeddings**, performs **no database read**, and makes **no legal-importance decision**.');
  lines.push('');
  lines.push('Every tier below is experimental. NEW1 owns retrieval-quality judgment; NEW2/LCC own classification and promotion into canonical structures.');
  lines.push('');
  lines.push(`Supreme Court context: source denominator **${fmtInt(SUPREME_COURT_SOURCE)}**, held **${fmtInt(SUPREME_COURT_HELD)}**, gap **${fmtInt(SUPREME_COURT_SOURCE - SUPREME_COURT_HELD)}**. The large uncertainty is the High Court/plain corpus, not Supreme Court coverage.`);
  lines.push('');
  lines.push('## Inputs');
  lines.push('');
  lines.push('- `docs/ai/cx1-corpus-census/metadata-coverage.json`');
  lines.push('- `docs/ai/new2-silver-proof/hc-class-sample-20260817.json`');
  lines.push('- `docs/HC_ORDER_TYPES.json`');
  lines.push('- `docs/ai/CX1_VECTOR_CAPACITY_BENCHMARK.md`');
  lines.push('');
  lines.push('## Class-Derived Population Estimates');
  lines.push('');
  lines.push('| Class | Sample share | Projected held HC docs if sample applies | Mean chars | Projected text bytes |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const [klass, row] of Object.entries(classCounts)) {
    lines.push(
      `| ${klass} | ${pct(row.share)} | ${fmtInt(row.estimatedHeldDocuments)} | ${row.meanChars === null ? 'n/a' : fmtInt(row.meanChars)} | ${row.estimatedUtf8Bytes === null ? 'n/a' : fmtBytes(row.estimatedUtf8Bytes)} |`,
    );
  }
  lines.push('');
  lines.push('These projections apply a 200-document, 20-cell plain-variant sample to the current held HC document count. The sample was chosen for spread, not as a random corpus estimator, so use the direction and order of magnitude, not the last digit.');
  lines.push('');
  lines.push('The `decided` class remains an upper bound on authority share. The `unclassified` residue is the `DISPOSED*` / `CLOSED` family and is triage work, not safe positive or negative truth.');
  lines.push('');
  lines.push('## Provisional Tiers');
  lines.push('');
  lines.push('| Tier | Population | Meaning | Caution |');
  lines.push('|---|---:|---|---|');
  for (const tier of tiers) {
    lines.push(
      `| ${tier.id} | ${tier.population === null ? 'not measured' : fmtInt(tier.population)} | ${tier.label} | ${tier.caution} |`,
    );
  }
  lines.push('');
  lines.push('## Scenarios');
  lines.push('');
  lines.push('| Scenario | Estimated docs | Vectors/doc | Vectors | fp32 combined | halfvec combined |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const s of scenarios) {
    lines.push(
      `| ${s.id} | ${fmtInt(s.estimatedDocuments)} | ${s.vectorsPerDocument} | ${fmtInt(s.storage.vectors)} | ${s.storage.fp32CombinedHuman} | ${s.storage.halfvecCombinedHuman} |`,
    );
  }
  lines.push('');
  lines.push('Storage uses CX1 measured TOAST-inclusive table plus HNSW costs: **13,778.58 bytes/vector fp32** and **5,571.26 bytes/vector halfvec** at ~600k scale. These are linear estimates, not build-time forecasts.');
  lines.push('');
  lines.push('## What Must Be Measured Next');
  lines.push('');
  for (const item of manifest.deferOrMeasure.missingMetrics) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## Machine Outputs');
  lines.push('');
  lines.push('- `docs/ai/cx1-embedding-eligibility/population-scenarios.json`');
  lines.push('- `docs/ai/cx1-embedding-eligibility/population-scenarios.csv`');

  fs.writeFileSync(REPORT, `${lines.join('\n')}\n`);
  console.log(`wrote ${path.relative(ROOT, REPORT)}`);
  console.log(`wrote ${path.relative(ROOT, jsonPath)}`);
  console.log(`wrote ${path.relative(ROOT, csvPath)}`);
  console.log(`balanced ${fmtInt(scenarios[1].storage.vectors)} vectors -> fp32 ${scenarios[1].storage.fp32CombinedHuman}, halfvec ${scenarios[1].storage.halfvecCombinedHuman}`);
}

main();
