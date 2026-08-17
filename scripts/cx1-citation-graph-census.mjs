#!/usr/bin/env node
/**
 * CX1 citation graph census planner.
 *
 * Offline only: reads schema/source docs and prior measured reports, validates
 * the cited snapshot strings still exist, and writes Workstream J evidence plus
 * read-only selector SQL for a future clean scheduler window. It does not query
 * PostgreSQL, run citation extraction/resolution, write aliases, or change any
 * citation/treatment state.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-citation-graph-census');
const OUT_JSON = path.join(OUT_DIR, 'citation-graph-census.json');
const OUT_SNAPSHOT_CSV = path.join(OUT_DIR, 'snapshot-inventory.csv');
const OUT_PRIORITY_CSV = path.join(OUT_DIR, 'priority-regions.csv');
const OUT_SQL = path.join(OUT_DIR, 'graph-census-selector.sql');
const OUT_MD = path.join(ROOT, 'docs', 'ai', 'CX1_CITATION_GRAPH_CENSUS.md');

const INPUTS = {
  schemaTruth: 'docs/SCHEMA_TRUTH.md',
  treatmentGraphGap: 'docs/TREATMENT_GRAPH_GAP.md',
  dataMoatProgram: 'docs/ai/DATA_MOAT_PROGRAM.md',
  retrievalProgram: 'docs/ai/RETRIEVAL_PROGRAM.md',
  preMigrationBaseline: 'docs/ai/PRE_MIGRATION_RETRIEVAL_BASELINE.md',
  citationsCli: 'services/ingest/src/citations-cli.ts',
  citationKeysCli: 'services/ingest/src/citation-keys-cli.ts',
  graphExpand: 'services/api/src/search/graph-expand.ts',
  propagateTreatment: 'services/api/src/citations/propagate-treatment.ts',
};

const EXPECTED_PATTERNS = [
  ['schemaTruth', /sentinels\s+625,748[\s\S]*real unresolved\s+598,759[\s\S]*resolved\s+112,241/],
  ['schemaTruth', /A sentinel is not an unresolved citation/],
  ['schemaTruth', /adjudication aid, never a source of\s+truth/],
  ['dataMoatProgram', /judgment_citations` 273,383 rows, 99,887 resolved, \*\*50,645 sentinels\*\*/],
  ['dataMoatProgram', /external_citations` 51,272 rows, 15,102 resolved/],
  ['dataMoatProgram', /overruled 117[\s\S]*overruled_in_part 23[\s\S]*doubted 21/],
  ['dataMoatProgram', /40 of 40 returned zero citations/],
  ['retrievalProgram', /judgment_citations` 227,478 edges \/ 97,876 resolved/],
  ['retrievalProgram', /\+37,875 edges[\s\S]*\+20,276 resolved[\s\S]*77,600[\s\S]*97,876/],
  ['treatmentGraphGap', /unresolved:\s+\*\*32\*\*/],
  ['treatmentGraphGap', /34 edges: \*\*13 candidate, 1 ambiguous, 6 thin, 1 no-name-beside-citation,\s+13 no-candidate at all\*\*/],
  ['citationsCli', /DRY BY DEFAULT/],
  ['citationKeysCli', /OFFSET[\s\S]{0,120}WRONG/],
];

function abs(relativePath) {
  return path.join(ROOT, relativePath);
}

function rel(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

function read(relativePath) {
  return fs.readFileSync(abs(relativePath), 'utf8');
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs(relativePath))).digest('hex');
}

function pct(n, d) {
  return d ? n / d : 0;
}

function pctText(n, d) {
  return `${(pct(n, d) * 100).toFixed(1)}%`;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(file, rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function validateInputs(textByKey) {
  return EXPECTED_PATTERNS.map(([key, pattern]) => {
    const ok = pattern.test(textByKey[key]);
    if (!ok) throw new Error(`missing expected Workstream J evidence pattern in ${key}: ${pattern}`);
    return { input: key, status: 'pass', pattern: String(pattern) };
  });
}

function snapshotInventory() {
  return [
    {
      snapshotId: 'schema-truth-20260813-citation-denominator',
      source: INPUTS.schemaTruth,
      date: '2026-08-13',
      scope: 'judgment_citations denominator correction',
      metric: 'sentinels / real unresolved / resolved',
      value: '625748 / 598759 / 112241',
      derivedRate: 'resolved real-citation rate 15.8%; naive null-target rate 8.4%',
      caveat: 'snapshot in schema-truth; use live selector before making corpus-current claims',
    },
    {
      snapshotId: 'data-moat-20260812-production-inventory',
      source: INPUTS.dataMoatProgram,
      date: '2026-08-12',
      scope: 'pilot-era production citation inventory',
      metric: 'judgment_citations / resolved / sentinels; external_citations / resolved',
      value: '273383 / 99887 / 50645; 51272 / 15102',
      derivedRate: `judgment_citations resolved including sentinels ${pctText(99_887, 273_383)}`,
      caveat: 'older snapshot; corpus and extraction continued afterward',
    },
    {
      snapshotId: 'data-moat-20260812-treatment-counts',
      source: INPUTS.dataMoatProgram,
      date: '2026-08-12',
      scope: 'relationship distribution over then-current judgment_citations',
      metric: 'cites/followed/distinguished/overruled/overruled_in_part/doubted/approved',
      value: '257460 / 14007 / 1734 / 117 / 23 / 21 / 21',
      derivedRate: `non-cites relationship share ${pctText(14_007 + 1_734 + 117 + 23 + 21 + 21, 273_383)}`,
      caveat: 'relationship counts are diagnostics; citation count is not legal authority',
    },
    {
      snapshotId: 'retrieval-program-20260811-graph-architecture',
      source: INPUTS.retrievalProgram,
      date: '2026-08-11',
      scope: 'retrieval architecture graph status',
      metric: 'judgment_citations edges / resolved; aliases',
      value: '227478 / 97876; judgment_citation_aliases 4097',
      derivedRate: `resolved edge rate ${pctText(97_876, 227_478)}`,
      caveat: 'architecture snapshot; graph not a ranking signal yet',
    },
    {
      snapshotId: 'treatment-gap-20260814-high-risk-unresolved',
      source: INPUTS.treatmentGraphGap,
      date: '2026-08-14',
      scope: 'high-risk unresolved treatment targets',
      metric: 'overruled/overruled_in_part/doubted unresolved',
      value: '32 fresh-check unresolved, down from 34 after two fixes',
      derivedRate: 'not a rate; priority region',
      caveat: 'priority list, not target identity proof for every row',
    },
    {
      snapshotId: 'pre-migration-20260815-overruled-count',
      source: INPUTS.preMigrationBaseline,
      date: '2026-08-15',
      scope: 'migration baseline currentness cross-check',
      metric: 'overruled_status != none judgments',
      value: '95',
      derivedRate: 'set_aside 70 + partly_set_aside 8 + doubted 17 = 95',
      caveat: 'baseline spot-check; not a full Workstream J census',
    },
  ];
}

function priorityRegions() {
  return [
    {
      regionId: 'J1-sentinel-safe-denominators',
      priority: 'P0-diagnostic-safety',
      evidence: INPUTS.schemaTruth,
      finding:
        'Sentinel rows with empty citation_text must be excluded from unresolved-citation denominators and advocate-facing graph surfaces.',
      nextSelector: 'graph-census-selector.sql section sentinel_invariants',
    },
    {
      regionId: 'J2-unresolved-treatment-targets',
      priority: 'P0-currentness-risk',
      evidence: INPUTS.treatmentGraphGap,
      finding:
        'Overruled/overruled_in_part/doubted unresolved targets are the highest-value graph region because the failure mode is live-law currentness, not ranking.',
      nextSelector: 'graph-census-selector.sql section unresolved_treatment_targets',
    },
    {
      regionId: 'J3-citation-key-coverage',
      priority: 'P1-resolution-throughput',
      evidence: INPUTS.citationKeysCli,
      finding:
        'citation-key population is a derived table and must be measured without duplicating the active population job or using OFFSET.',
      nextSelector: 'graph-census-selector.sql section key_coverage',
    },
    {
      regionId: 'J4-high-degree-authorities',
      priority: 'P2-prioritisation',
      evidence: INPUTS.retrievalProgram,
      finding:
        'High in-degree/out-degree authorities are triage signals only; citation count alone is not legal authority or ranking approval.',
      nextSelector: 'graph-census-selector.sql section degree_distribution',
    },
    {
      regionId: 'J5-external-citation-gaps',
      priority: 'P2-source-gap',
      evidence: INPUTS.dataMoatProgram,
      finding:
        'external_citations and citation_concordance_resolutions need separate accounting because model adjudication is an aid, never canonical identity.',
      nextSelector: 'graph-census-selector.sql section external_citation_gaps',
    },
    {
      regionId: 'J6-ambiguous-yearless-parallel-keys',
      priority: 'P2-resolution-diagnostics',
      evidence: INPUTS.citationKeysCli,
      finding:
        'Ambiguous keys, yearless keys, and parallel citation alias multiplicity are separate resolution diagnostics; none should be collapsed into one unresolved count.',
      nextSelector:
        'graph-census-selector.sql sections ambiguous_key_distribution, yearless_key_prevalence, parallel_alias_multiplicity',
    },
  ];
}

function selectorSql() {
  return `WITH citation_base AS (
  SELECT
    count(*)::bigint AS total_rows,
    count(*) FILTER (WHERE coalesce(citation_text, '') = '')::bigint AS sentinel_rows,
    count(*) FILTER (WHERE coalesce(citation_text, '') <> '')::bigint AS real_edge_rows,
    count(*) FILTER (WHERE coalesce(citation_text, '') <> '' AND cited_judgment_id IS NOT NULL)::bigint AS resolved_real_edges,
    count(*) FILTER (WHERE coalesce(citation_text, '') <> '' AND cited_judgment_id IS NULL)::bigint AS unresolved_real_edges,
    count(DISTINCT citing_judgment_id) FILTER (WHERE coalesce(citation_text, '') = '')::bigint AS sentinel_judgments,
    count(DISTINCT citing_judgment_id) FILTER (WHERE coalesce(citation_text, '') <> '')::bigint AS citing_judgments
  FROM judgment_citations
),
sentinel_invariants AS (
  SELECT
    count(*) FILTER (WHERE sentinel_count > 1)::bigint AS judgments_with_multiple_sentinels,
    count(*) FILTER (WHERE sentinel_count > 0 AND real_count > 0)::bigint AS judgments_with_sentinel_and_real_edge
  FROM (
    SELECT
      citing_judgment_id,
      count(*) FILTER (WHERE coalesce(citation_text, '') = '') AS sentinel_count,
      count(*) FILTER (WHERE coalesce(citation_text, '') <> '') AS real_count
    FROM judgment_citations
    GROUP BY citing_judgment_id
  ) grouped
),
relationship_distribution AS (
  SELECT relationship, count(*)::bigint AS rows,
         count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)::bigint AS resolved_rows,
         count(*) FILTER (WHERE cited_judgment_id IS NULL AND coalesce(citation_text, '') <> '')::bigint AS unresolved_rows
  FROM judgment_citations
  WHERE coalesce(citation_text, '') <> ''
  GROUP BY relationship
),
degree_distribution AS (
  SELECT bucket, count(*)::bigint AS authorities
  FROM (
    SELECT cited_judgment_id,
           CASE
             WHEN count(*) >= 100 THEN '100_plus'
             WHEN count(*) >= 25 THEN '25_99'
             WHEN count(*) >= 10 THEN '10_24'
             WHEN count(*) >= 2 THEN '2_9'
             ELSE '1'
           END AS bucket
    FROM judgment_citations
    WHERE cited_judgment_id IS NOT NULL
      AND coalesce(citation_text, '') <> ''
    GROUP BY cited_judgment_id
  ) degrees
  GROUP BY bucket
),
court_year_edge_density AS (
  SELECT j.court,
         extract(year from j.judgment_date)::int AS year,
         count(*)::bigint AS outgoing_edges,
         count(*) FILTER (WHERE c.cited_judgment_id IS NOT NULL)::bigint AS resolved_edges,
         count(*) FILTER (WHERE c.cited_judgment_id IS NULL)::bigint AS unresolved_edges
  FROM judgment_citations c
  JOIN judgments j ON j.id = c.citing_judgment_id
  WHERE coalesce(c.citation_text, '') <> ''
  GROUP BY j.court, extract(year from j.judgment_date)::int
),
unresolved_treatment_targets AS (
  SELECT c.relationship,
         c.normalised_citation,
         c.citation_text,
         j.id AS citing_judgment_id,
         j.case_title AS citing_case_title,
         j.judgment_date AS citing_judgment_date
  FROM judgment_citations c
  JOIN judgments j ON j.id = c.citing_judgment_id
  WHERE c.cited_judgment_id IS NULL
    AND coalesce(c.citation_text, '') <> ''
    AND c.relationship IN ('overruled', 'overruled_in_part', 'doubted')
),
key_coverage AS (
  SELECT
    count(*)::bigint AS key_rows,
    count(DISTINCT citation_key)::bigint AS distinct_keys,
    count(DISTINCT judgment_id)::bigint AS keyed_judgments,
    count(*) FILTER (WHERE source = 'alias')::bigint AS alias_key_rows
  FROM judgment_citation_keys
),
external_citation_gaps AS (
  SELECT
    count(*)::bigint AS external_rows,
    count(*) FILTER (WHERE cited_judgment_id IS NOT NULL)::bigint AS resolved_external_rows,
    count(DISTINCT citation_key)::bigint AS distinct_external_keys,
    count(DISTINCT citation_key) FILTER (WHERE cited_judgment_id IS NULL)::bigint AS unresolved_external_keys
  FROM external_citations
),
unresolved_key_distribution AS (
  SELECT bucket, count(*)::bigint AS keys
  FROM (
    SELECT normalised_citation,
           CASE
             WHEN count(*) >= 100 THEN '100_plus_sightings'
             WHEN count(*) >= 25 THEN '25_99_sightings'
             WHEN count(*) >= 10 THEN '10_24_sightings'
             WHEN count(*) >= 2 THEN '2_9_sightings'
             ELSE '1_sighting'
           END AS bucket
    FROM judgment_citations
    WHERE cited_judgment_id IS NULL
      AND coalesce(citation_text, '') <> ''
    GROUP BY normalised_citation
  ) unresolved_keys
  GROUP BY bucket
),
ambiguous_key_distribution AS (
  SELECT bucket, count(*)::bigint AS keys
  FROM (
    SELECT citation_key,
           CASE
             WHEN count(DISTINCT judgment_id) >= 10 THEN '10_plus_targets'
             WHEN count(DISTINCT judgment_id) >= 5 THEN '5_9_targets'
             WHEN count(DISTINCT judgment_id) >= 2 THEN '2_4_targets'
             ELSE '1_target'
           END AS bucket
    FROM judgment_citation_keys
    GROUP BY citation_key
  ) keyed
  GROUP BY bucket
),
yearless_key_prevalence AS (
  SELECT
    count(*)::bigint AS key_rows,
    count(*) FILTER (WHERE coalesce(array_length(years, 1), 0) = 0)::bigint AS yearless_key_rows,
    count(DISTINCT citation_key)::bigint AS distinct_keys,
    count(DISTINCT citation_key) FILTER (WHERE coalesce(array_length(years, 1), 0) = 0)::bigint AS distinct_yearless_keys
  FROM judgment_citation_keys
),
parallel_alias_multiplicity AS (
  SELECT bucket, count(*)::bigint AS judgments
  FROM (
    SELECT judgment_id,
           CASE
             WHEN count(*) >= 10 THEN '10_plus_aliases'
             WHEN count(*) >= 5 THEN '5_9_aliases'
             WHEN count(*) >= 2 THEN '2_4_aliases'
             ELSE '1_alias'
           END AS bucket
    FROM judgment_citation_aliases
    GROUP BY judgment_id
  ) aliases
  GROUP BY bucket
),
isolated_held_authorities AS (
  SELECT count(*)::bigint AS isolated_judgments
  FROM judgments j
  WHERE NOT EXISTS (
    SELECT 1 FROM judgment_citations c
    WHERE c.cited_judgment_id = j.id
      AND coalesce(c.citation_text, '') <> ''
  )
  AND NOT EXISTS (
    SELECT 1 FROM judgment_citations c
    WHERE c.citing_judgment_id = j.id
      AND coalesce(c.citation_text, '') <> ''
  )
)
SELECT 'citation_base' AS section, to_jsonb(citation_base) AS data FROM citation_base
UNION ALL
SELECT 'sentinel_invariants', to_jsonb(sentinel_invariants) FROM sentinel_invariants
UNION ALL
SELECT 'relationship_distribution', jsonb_agg(to_jsonb(relationship_distribution) ORDER BY relationship) FROM relationship_distribution
UNION ALL
SELECT 'degree_distribution', jsonb_agg(to_jsonb(degree_distribution) ORDER BY bucket) FROM degree_distribution
UNION ALL
SELECT 'court_year_edge_density_top_unresolved', jsonb_agg(to_jsonb(x) ORDER BY x.unresolved_edges DESC, x.outgoing_edges DESC)
FROM (SELECT * FROM court_year_edge_density ORDER BY unresolved_edges DESC, outgoing_edges DESC LIMIT 100) x
UNION ALL
SELECT 'unresolved_treatment_targets', jsonb_agg(to_jsonb(y) ORDER BY y.citing_judgment_date DESC NULLS LAST, y.citation_text)
FROM (SELECT * FROM unresolved_treatment_targets ORDER BY citing_judgment_date DESC NULLS LAST, citation_text LIMIT 500) y
UNION ALL
SELECT 'key_coverage', to_jsonb(key_coverage) FROM key_coverage
UNION ALL
SELECT 'external_citation_gaps', to_jsonb(external_citation_gaps) FROM external_citation_gaps
UNION ALL
SELECT 'unresolved_key_distribution', jsonb_agg(to_jsonb(unresolved_key_distribution) ORDER BY bucket) FROM unresolved_key_distribution
UNION ALL
SELECT 'ambiguous_key_distribution', jsonb_agg(to_jsonb(ambiguous_key_distribution) ORDER BY bucket) FROM ambiguous_key_distribution
UNION ALL
SELECT 'yearless_key_prevalence', to_jsonb(yearless_key_prevalence) FROM yearless_key_prevalence
UNION ALL
SELECT 'parallel_alias_multiplicity', jsonb_agg(to_jsonb(parallel_alias_multiplicity) ORDER BY bucket) FROM parallel_alias_multiplicity
UNION ALL
SELECT 'isolated_held_authorities', to_jsonb(isolated_held_authorities) FROM isolated_held_authorities;
`;
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# CX1 Citation Graph Census');
  lines.push('');
  lines.push(`Generated: **${result.generatedAt}**`);
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('Workstream J offline checkpoint. This artifact summarizes existing measured citation/graph snapshots and prepares a read-only selector for later execution. It does not query PostgreSQL, run citation extraction, run resolution, write aliases, change treatment state, or make legal-authority claims from citation counts.');
  lines.push('');
  lines.push('## Snapshot Inventory');
  lines.push('');
  lines.push('| Snapshot | Date | Metric | Value | Caveat |');
  lines.push('|---|---|---|---|---|');
  for (const row of result.snapshots) {
    lines.push(`| \`${row.snapshotId}\` | ${row.date} | ${row.metric} | ${row.value} | ${row.caveat} |`);
  }
  lines.push('');
  lines.push('## Priority Regions');
  lines.push('');
  lines.push('| Region | Priority | Finding | Future selector |');
  lines.push('|---|---|---|---|');
  for (const row of result.priorityRegions) {
    lines.push(`| \`${row.regionId}\` | ${row.priority} | ${row.finding} | ${row.nextSelector} |`);
  }
  lines.push('');
  lines.push('## Prepared Selector');
  lines.push('');
  lines.push(`Read-only SQL selector: \`${rel(OUT_SQL)}\``);
  lines.push('');
  lines.push('It emits JSONB sections for citation-base counts, sentinel invariants, relationship distribution, degree buckets, top unresolved court/year cells, unresolved high-risk treatment targets, citation-key coverage, external-citation gaps, unresolved-key buckets, ambiguous-key buckets, yearless-key prevalence, parallel-alias multiplicity, and isolated held authorities.');
  lines.push('');
  lines.push('## Boundary');
  lines.push('');
  lines.push(result.boundary);
  return `${lines.join('\n')}\n`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const textByKey = Object.fromEntries(Object.entries(INPUTS).map(([key, file]) => [key, read(file)]));
  const validations = validateInputs(textByKey);
  const inputInventory = Object.entries(INPUTS).map(([key, file]) => ({
    key,
    path: file,
    sha256: sha256(file),
  }));
  const result = {
    schema: 'cx1-citation-graph-census-v1',
    generatedAt: new Date().toISOString(),
    status: 'prepared_not_run',
    boundary:
      'Offline Workstream J only: no PostgreSQL query, no citation extraction/resolution run, no alias/treatment/currentness write, no model call, no provider fetch, and citation counts are diagnostics rather than legal authority.',
    inputs: inputInventory,
    validations,
    snapshots: snapshotInventory(),
    priorityRegions: priorityRegions(),
    selectorSql: rel(OUT_SQL),
    nextGate: 'MEDIUM_CLEAN for read-only selector execution; do not duplicate active citation-key population or any LCC write job',
  };

  fs.writeFileSync(OUT_SQL, selectorSql());
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`);
  writeCsv(OUT_SNAPSHOT_CSV, result.snapshots, [
    'snapshotId',
    'source',
    'date',
    'scope',
    'metric',
    'value',
    'derivedRate',
    'caveat',
  ]);
  writeCsv(OUT_PRIORITY_CSV, result.priorityRegions, [
    'regionId',
    'priority',
    'evidence',
    'finding',
    'nextSelector',
  ]);
  fs.writeFileSync(OUT_MD, renderMarkdown(result));
  console.log(`wrote ${rel(OUT_JSON)}`);
  console.log(`wrote ${rel(OUT_MD)}`);
}

main();
