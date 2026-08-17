#!/usr/bin/env node
/**
 * CX1 HNSW parameter lab plan.
 *
 * Offline only: reads existing vector capacity and halfvec fidelity artifacts,
 * then writes a run-gated matrix for future VECTOR_EXCLUSIVE execution. It does
 * not connect to PostgreSQL, copy vectors, build indexes, or run retrieval.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-vector-results');
const PLAN_JSON = path.join(OUT_DIR, 'hnsw-parameter-plan.json');
const PLAN_CSV = path.join(OUT_DIR, 'hnsw-parameter-matrix.csv');
const REPORT = path.join(ROOT, 'docs', 'ai', 'CX1_HNSW_PARAMETER_LAB.md');

const ROW_SCALES = [100000, 300000, 600000];
const REPRESENTATIONS = ['fp32', 'halfvec'];
const M_VALUES = [8, 16, 24];
const EF_CONSTRUCTION_VALUES = [32, 64, 128];
const EF_SEARCH_VALUES = [20, 40, 80, 160, 320];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function fmtBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;
  while (Math.abs(value) >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function fmtInt(n) {
  return new Intl.NumberFormat('en-US').format(Number(n));
}

function priority(row) {
  if (row.m === 16 && row.efConstruction === 64 && row.efSearch === 40) return 0;
  if (row.m === 16 && row.efConstruction === 64 && [80, 160].includes(row.efSearch)) return 1;
  if (row.m === 8 && row.efConstruction === 64 && [80, 160].includes(row.efSearch)) return 2;
  if (row.m === 24 && row.efConstruction === 128 && [80, 160, 320].includes(row.efSearch)) return 3;
  if (row.scaleRows === 100000 && row.efSearch <= 160) return 4;
  return 5;
}

function measuredAt(capacity, scaleRows, representation) {
  return capacity.measurements.find(
    (m) => m.scaleRows === scaleRows && m.representation === representation,
  );
}

function toastObservation(capacity, representation) {
  return capacity.storageIncludingToastObservations.find((r) => r.representation === representation);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const capacity = readJson('docs/ai/cx1-vector-results/benchmark-results.json');
  const fidelity = readJson('docs/ai/cx1-vector-results/halfvec-fidelity.json');

  const baselineByRepresentation = Object.fromEntries(
    REPRESENTATIONS.map((representation) => {
      const obs = toastObservation(capacity, representation);
      const measured600 = measuredAt(capacity, 600000, representation);
      return [
        representation,
        {
          tableIncludingToastBytesPerVector: obs.tableIncludingToastBytesPerVector,
          hnswIndexBytesPerVectorAtM16: obs.hnswIndexBytesPerVector,
          combinedBytesPerVectorAtM16: obs.combinedBytesPerVector,
          measured600BuildSecondsAtM16Ef64: measured600.build.seconds,
          measured600QueryP50AtEf40Ms: measured600.queryLatencyMs.p50,
          measured600QueryP95AtEf40Ms: measured600.queryLatencyMs.p95,
        },
      ];
    }),
  );

  const matrix = [];
  for (const representation of REPRESENTATIONS) {
    const baseline = baselineByRepresentation[representation];
    for (const scaleRows of ROW_SCALES) {
      const measured = measuredAt(capacity, scaleRows, representation);
      for (const m of M_VALUES) {
        for (const efConstruction of EF_CONSTRUCTION_VALUES) {
          for (const efSearch of EF_SEARCH_VALUES) {
            const hnswBytesPerVectorHeuristic =
              baseline.hnswIndexBytesPerVectorAtM16 * (m / 16);
            const tableBytesPerVector = baseline.tableIncludingToastBytesPerVector;
            const row = {
              representation,
              scaleRows,
              m,
              efConstruction,
              efSearch,
              priority: null,
              measuredComparableBuildSeconds:
                m === 16 && efConstruction === 64 ? measured.build.seconds : null,
              measuredComparableP50Ms:
                m === 16 && efConstruction === 64 && efSearch === 40
                  ? measured.queryLatencyMs.p50
                  : null,
              measuredComparableP95Ms:
                m === 16 && efConstruction === 64 && efSearch === 40
                  ? measured.queryLatencyMs.p95
                  : null,
              heuristicHnswBytesPerVector: Math.round(hnswBytesPerVectorHeuristic),
              heuristicCombinedBytesPerVector: Math.round(
                tableBytesPerVector + hnswBytesPerVectorHeuristic,
              ),
              heuristicCombinedBytes: Math.round(
                scaleRows * (tableBytesPerVector + hnswBytesPerVectorHeuristic),
              ),
            };
            row.priority = priority(row);
            matrix.push(row);
          }
        }
      }
    }
  }
  matrix.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.representation.localeCompare(b.representation) ||
      a.scaleRows - b.scaleRows ||
      a.m - b.m ||
      a.efConstruction - b.efConstruction ||
      a.efSearch - b.efSearch,
  );

  const phase1 = matrix.filter((row) => row.priority <= 2 && row.scaleRows <= 300000);
  const phase2 = matrix.filter((row) => row.priority <= 3 && row.scaleRows === 600000);

  const plan = {
    schema: 'cx1-hnsw-parameter-plan-v1',
    generatedAt: new Date().toISOString(),
    status: 'prepared_not_run',
    scope: 'offline run matrix only; no DB query, vector copy, index build, or retrieval run',
    sources: {
      capacity: 'docs/ai/cx1-vector-results/benchmark-results.json',
      fidelity: 'docs/ai/cx1-vector-results/halfvec-fidelity.json',
      capacityReport: 'docs/ai/CX1_VECTOR_CAPACITY_BENCHMARK.md',
      fidelityReport: 'docs/ai/CX1_HALFVEC_FIDELITY.md',
    },
    gating: {
      schedulerRequired: 'VECTOR_EXCLUSIVE',
      reason: 'HNSW build and ANN recall tests compete with PostgreSQL memory/IO and existing vector indexes.',
      prerequisites: [
        'No active main-lane heavy readers/writers.',
        'Copied vector payload goes only under C:/lawmind/cx1-lab and is removed after run unless explicitly kept.',
        'Exact-neighbour baseline must be computed from the same copied population before ANN recall is scored.',
        'NEW1 owns retrieval-quality approval; CX1 only supplies infrastructure and recall evidence.',
      ],
    },
    measuredInputs: {
      sourceVectors: capacity.source.nonnullVectors,
      pgvectorVersion: capacity.source.pgvectorVersion,
      existingIndexDefinition: capacity.source.hnswIndexDefinition,
      halfvecFidelity: {
        loadedRows: fidelity.input.loadedRows,
        verdictCandidate: fidelity.verdictCandidate,
        p99AbsoluteDistanceError: fidelity.c1DistanceDistortion.absoluteError.p99,
        top10ExactOverlap: fidelity.c2ExactNearestNeighbourOverlap.topK['10'].meanOverlap,
        c3AnnRecallMeasured: false,
        c4GoldMeasured: false,
      },
      baselineByRepresentation,
    },
    parameters: {
      scales: ROW_SCALES,
      representations: REPRESENTATIONS,
      m: M_VALUES,
      efConstruction: EF_CONSTRUCTION_VALUES,
      efSearch: EF_SEARCH_VALUES,
    },
    phases: [
      {
        id: 'D0',
        status: 'prepared_not_run',
        purpose: 'Validate harness on 100k rows with baseline m=16/ef_construction=64 and ef_search sweep.',
        rows: phase1.filter((row) => row.scaleRows === 100000),
      },
      {
        id: 'D1',
        status: 'prepared_not_run',
        purpose: 'Measure fp32 vs halfvec ANN recall and latency on 300k rows for the priority frontier.',
        rows: phase1.filter((row) => row.scaleRows === 300000),
      },
      {
        id: 'D2',
        status: 'prepared_not_run',
        purpose: 'Repeat only promising frontier candidates at 600k rows.',
        rows: phase2,
      },
      {
        id: 'D3',
        status: 'blocked_by_quality_owner',
        purpose: 'Run NEW1 retrieval-gold impact only after ANN recall and scheduler gates pass.',
        rows: [],
      },
    ],
    matrix,
    warnings: [
      'heuristicHnswBytesPerVector scales measured m=16 bytes linearly by m/16; it is a planning prior, not evidence.',
      'Existing timing measurements are not monotonic across scale; no build-time extrapolation is made.',
      'Halfvec is not production-approved by this plan. C1/C2 was exact vector fidelity only; C3 ANN recall and C4 gold remain unmeasured.',
    ],
  };

  fs.writeFileSync(PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`);
  fs.writeFileSync(
    PLAN_CSV,
    [
      'priority,representation,scale_rows,m,ef_construction,ef_search,heuristic_combined_bytes,heuristic_combined_human,measured_comparable_build_seconds,measured_comparable_p50_ms,measured_comparable_p95_ms',
      ...matrix.map((r) =>
        [
          r.priority,
          r.representation,
          r.scaleRows,
          r.m,
          r.efConstruction,
          r.efSearch,
          r.heuristicCombinedBytes,
          fmtBytes(r.heuristicCombinedBytes),
          r.measuredComparableBuildSeconds ?? '',
          r.measuredComparableP50Ms ?? '',
          r.measuredComparableP95Ms ?? '',
        ].join(','),
      ),
    ].join('\n') + '\n',
  );

  const lines = [];
  lines.push('# CX1 HNSW Parameter Lab');
  lines.push('');
  lines.push(`Generated: **${plan.generatedAt}**`);
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('This is a prepared HNSW parameter lab plan. It reads existing vector capacity and halfvec fidelity artifacts only. It does not connect to PostgreSQL, copy vectors, build indexes, or run retrieval.');
  lines.push('');
  lines.push('## Current Evidence');
  lines.push('');
  lines.push(`Existing non-null vectors: **${fmtInt(capacity.source.nonnullVectors)}** on pgvector **${capacity.source.pgvectorVersion}**.`);
  lines.push('');
  lines.push('| Representation | Table+TOAST/vector | HNSW/vector at m=16 | Combined/vector | 600k build at m=16/efc=64 | 600k p50/p95 at ef=40 |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const representation of REPRESENTATIONS) {
    const b = baselineByRepresentation[representation];
    lines.push(`| ${representation} | ${fmtBytes(b.tableIncludingToastBytesPerVector)} | ${fmtBytes(b.hnswIndexBytesPerVectorAtM16)} | ${fmtBytes(b.combinedBytesPerVectorAtM16)} | ${b.measured600BuildSecondsAtM16Ef64}s | ${b.measured600QueryP50AtEf40Ms}/${b.measured600QueryP95AtEf40Ms} ms |`);
  }
  lines.push('');
  lines.push(`Halfvec C1/C2 fidelity candidate: **${fidelity.verdictCandidate}** on **${fmtInt(fidelity.input.loadedRows)}** copied vectors; p99 absolute distance error **${fidelity.c1DistanceDistortion.absoluteError.p99}**, top-10 exact overlap **${fidelity.c2ExactNearestNeighbourOverlap.topK['10'].meanOverlap}**. C3 ANN recall and C4 NEW1 gold are still unmeasured.`);
  lines.push('');
  lines.push('## Prepared Matrix');
  lines.push('');
  lines.push(`Matrix rows: **${fmtInt(matrix.length)}**. Priority frontier rows for D0/D1: **${fmtInt(phase1.length)}**. Priority frontier rows for D2: **${fmtInt(phase2.length)}**.`);
  lines.push('');
  lines.push('| Phase | Purpose | Rows |');
  lines.push('|---|---|---:|');
  for (const phase of plan.phases) {
    lines.push(`| ${phase.id} | ${phase.purpose} | ${phase.rows.length} |`);
  }
  lines.push('');
  lines.push('## Machine Outputs');
  lines.push('');
  lines.push('- `docs/ai/cx1-vector-results/hnsw-parameter-plan.json`');
  lines.push('- `docs/ai/cx1-vector-results/hnsw-parameter-matrix.csv`');
  lines.push('');
  lines.push('## Run Gate');
  lines.push('');
  lines.push('Run only when the CX1 scheduler reports `VECTOR_EXCLUSIVE`. Build one HNSW index at a time in a disposable lab cluster, compute exact neighbours from the same copied population, remove copied payloads after the run, and do not promote halfvec or parameter changes without NEW1 quality approval.');
  lines.push('');
  lines.push('## Caveats');
  lines.push('');
  for (const warning of plan.warnings) lines.push(`- ${warning}`);
  fs.writeFileSync(REPORT, `${lines.join('\n')}\n`);

  console.log(`wrote ${path.relative(ROOT, PLAN_JSON)}`);
  console.log(`wrote ${path.relative(ROOT, PLAN_CSV)}`);
  console.log(`wrote ${path.relative(ROOT, REPORT)}`);
  console.log(`matrix ${matrix.length} rows; phase1 ${phase1.length}; phase2 ${phase2.length}`);
}

main();
