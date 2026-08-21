#!/usr/bin/env node
/**
 * CX1 read-only DB sample census harness.
 *
 * Default mode is dry-run: emit the SQL and plan artifacts, but do not connect.
 * Live execution is gated behind --run and should only happen after the CX1
 * scheduler reports a clean MEDIUM/HEAVY window with no competing lane work.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PG, psqlValue } from './migration/pg-local.mjs';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs', 'ai', 'cx1-db-sample-census');
const REPORT = path.join(ROOT, 'docs', 'ai', 'CX1_DB_SAMPLE_CENSUS.md');
const SQL_FILE = path.join(OUT_DIR, 'sample-census.sql');
const PLAN_FILE = path.join(OUT_DIR, 'sample-census-plan.json');
const RESULT_FILE = path.join(OUT_DIR, 'sample-census-result.json');

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function pctArg(name, fallback) {
  const value = Number(argValue(name, fallback));
  if (!Number.isFinite(value) || value <= 0 || value > 10) {
    throw new Error(`${name} must be > 0 and <= 10; got ${value}`);
  }
  return value;
}

function intArg(name, fallback) {
  const value = Number(argValue(name, fallback));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}


function fmtInt(n) {
  return new Intl.NumberFormat('en-US').format(Number(n));
}

function sampleSql({ samplePercent, limit, seed }) {
  return `/* CX1 read-only sample census. Do not run during vector/HNSW work. */
WITH sample AS MATERIALIZED (
  SELECT
    id,
    court,
    hc_document_class,
    source_document_type,
    language,
    judgment_date,
    full_text,
    storage_key,
    content_hash,
    text_quality,
    native_text
  FROM judgments TABLESAMPLE SYSTEM (${samplePercent}) REPEATABLE (${seed})
  ORDER BY id
  LIMIT ${limit}
),
citation_counts AS (
  SELECT
    s.id,
    count(jc.id) FILTER (WHERE coalesce(jc.citation_text, '') <> '')::int AS citation_count,
    count(jc.id) FILTER (
      WHERE coalesce(jc.citation_text, '') <> '' AND jc.cited_judgment_id IS NOT NULL
    )::int AS resolved_citation_count,
    count(jc.id) FILTER (WHERE coalesce(jc.citation_text, '') = '')::int AS sentinel_count
  FROM sample s
  LEFT JOIN judgment_citations jc ON jc.citing_judgment_id = s.id
  GROUP BY s.id
),
chunk_counts AS (
  SELECT
    s.id,
    count(ch.id)::int AS chunk_count,
    count(ch.id) FILTER (WHERE ch.char_offset IS NOT NULL AND ch.char_length IS NOT NULL)::int AS offset_chunk_count,
    avg(ch.token_count)::numeric(12,2) AS avg_chunk_tokens
  FROM sample s
  LEFT JOIN judgment_chunks ch ON ch.judgment_id = s.id
  GROUP BY s.id
),
enrichment_counts AS (
  SELECT
    s.id,
    count(de.id)::int AS enrichment_count,
    count(de.id) FILTER (WHERE de.verification_state = 'verified')::int AS verified_enrichment_count,
    count(de.id) FILTER (WHERE de.verification_state = 'rejected')::int AS rejected_enrichment_count
  FROM sample s
  LEFT JOIN document_enrichments de ON de.judgment_id = s.id
  GROUP BY s.id
),
per_doc AS (
  SELECT
    s.id,
    s.court,
    extract(year FROM s.judgment_date)::int AS year,
    coalesce(s.hc_document_class, '<null>') AS hc_document_class,
    coalesce(s.source_document_type, '<null>') AS source_document_type,
    s.language::text AS language,
    char_length(s.full_text)::int AS text_chars,
    octet_length(s.full_text)::int AS text_bytes,
    (s.full_text ~ '[ऀ-ॿ]') AS has_devanagari,
    (s.storage_key IS NOT NULL) AS tiered_out,
    (s.content_hash IS NOT NULL) AS has_content_hash,
    s.text_quality,
    s.native_text,
    cc.citation_count,
    cc.resolved_citation_count,
    cc.sentinel_count,
    ch.chunk_count,
    ch.offset_chunk_count,
    ch.avg_chunk_tokens,
    de.enrichment_count,
    de.verified_enrichment_count,
    de.rejected_enrichment_count
  FROM sample s
  JOIN citation_counts cc ON cc.id = s.id
  JOIN chunk_counts ch ON ch.id = s.id
  JOIN enrichment_counts de ON de.id = s.id
)
SELECT jsonb_build_object(
  'schema', 'cx1-db-sample-census-v1',
  'generatedAt', now(),
  'evidenceClass', 'READ_ONLY_DB_SAMPLE',
  'sampleConfig', jsonb_build_object(
    'tableSamplePercent', ${samplePercent},
    'limit', ${limit},
    'seed', ${seed},
    'tablesample', 'SYSTEM',
    'mode', 'sampled block read; no writes'
  ),
  'sample', (
    SELECT jsonb_build_object(
      'documents', count(*)::int,
      'courts', count(DISTINCT court)::int,
      'years', count(DISTINCT year)::int,
      'highCourtDocuments', count(*) FILTER (WHERE court <> 'Supreme Court of India')::int,
      'supremeCourtDocuments', count(*) FILTER (WHERE court = 'Supreme Court of India')::int
    )
    FROM per_doc
  ),
  'textLength', (
    SELECT jsonb_build_object(
      'avgChars', round(avg(text_chars))::int,
      'p50Chars', percentile_cont(0.50) WITHIN GROUP (ORDER BY text_chars)::int,
      'p95Chars', percentile_cont(0.95) WITHIN GROUP (ORDER BY text_chars)::int,
      'avgBytes', round(avg(text_bytes))::int,
      'devanagariDocuments', count(*) FILTER (WHERE has_devanagari)::int,
      'tieredOutDocuments', count(*) FILTER (WHERE tiered_out)::int,
      'contentHashDocuments', count(*) FILTER (WHERE has_content_hash)::int
    )
    FROM per_doc
  ),
  'citationDensity', (
    SELECT jsonb_build_object(
      'avgCitations', round(avg(citation_count), 3),
      'p50Citations', percentile_cont(0.50) WITHIN GROUP (ORDER BY citation_count)::numeric(12,3),
      'p95Citations', percentile_cont(0.95) WITHIN GROUP (ORDER BY citation_count)::numeric(12,3),
      'documentsWithRealCitations', count(*) FILTER (WHERE citation_count > 0)::int,
      'documentsWithResolvedCitations', count(*) FILTER (WHERE resolved_citation_count > 0)::int,
      'sentinelDocuments', count(*) FILTER (WHERE sentinel_count > 0 AND citation_count = 0)::int
    )
    FROM per_doc
  ),
  'chunkCoverage', (
    SELECT jsonb_build_object(
      'avgChunks', round(avg(chunk_count), 3),
      'p50Chunks', percentile_cont(0.50) WITHIN GROUP (ORDER BY chunk_count)::numeric(12,3),
      'p95Chunks', percentile_cont(0.95) WITHIN GROUP (ORDER BY chunk_count)::numeric(12,3),
      'documentsWithChunks', count(*) FILTER (WHERE chunk_count > 0)::int,
      'documentsWithOffsetChunks', count(*) FILTER (WHERE offset_chunk_count > 0)::int,
      'avgChunkTokens', round(avg(avg_chunk_tokens), 2)
    )
    FROM per_doc
  ),
  'enrichmentCoverage', (
    SELECT jsonb_build_object(
      'documentsWithEnrichments', count(*) FILTER (WHERE enrichment_count > 0)::int,
      'documentsWithVerifiedEnrichments', count(*) FILTER (WHERE verified_enrichment_count > 0)::int,
      'documentsWithRejectedEnrichments', count(*) FILTER (WHERE rejected_enrichment_count > 0)::int,
      'avgEnrichments', round(avg(enrichment_count), 3)
    )
    FROM per_doc
  ),
  'byClass', coalesce((
    SELECT jsonb_agg(to_jsonb(rows) ORDER BY documents DESC, hc_document_class)
    FROM (
      SELECT
        hc_document_class,
        count(*)::int AS documents,
        round(avg(text_chars))::int AS avg_chars,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY text_chars)::int AS p95_chars,
        round(avg(citation_count), 3) AS avg_citations,
        round(avg(chunk_count), 3) AS avg_chunks,
        count(*) FILTER (WHERE has_devanagari)::int AS devanagari_documents
      FROM per_doc
      GROUP BY hc_document_class
    ) rows
  ), '[]'::jsonb),
  'byCourtYear', coalesce((
    SELECT jsonb_agg(to_jsonb(rows) ORDER BY court, year)
    FROM (
      SELECT
        court,
        year,
        count(*)::int AS documents,
        round(avg(text_chars))::int AS avg_chars,
        round(avg(citation_count), 3) AS avg_citations,
        round(avg(chunk_count), 3) AS avg_chunks
      FROM per_doc
      GROUP BY court, year
    ) rows
  ), '[]'::jsonb)
)::text AS result_json;`;
}

function writeReport({ mode, generatedAt, samplePercent, limit, seed, result }) {
  const lines = [];
  lines.push('# CX1 DB Sample Census');
  lines.push('');
  lines.push(`Generated: **${generatedAt}**`);
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push('This is a read-only sampled database census harness for CX1 Workstreams A and B. It measures text length, citation density, chunk/vector coverage, enrichment coverage, class slices, and court/year slices from a bounded `judgments TABLESAMPLE SYSTEM` population.');
  lines.push('');
  lines.push('The harness writes only docs/report artifacts. It does not modify database rows, indexes, Gold data, retrieval behavior, or citation verification behavior.');
  lines.push('');
  lines.push('## Run State');
  lines.push('');
  lines.push(`Mode: **${mode}**`);
  lines.push('');
  lines.push('| Control | Value |');
  lines.push('|---|---:|');
  lines.push(`| TABLESAMPLE SYSTEM percent | ${samplePercent} |`);
  lines.push(`| Limit | ${fmtInt(limit)} |`);
  lines.push(`| Repeatable seed | ${seed} |`);
  lines.push('');
  lines.push('Machine artifacts:');
  lines.push('');
  lines.push('- `docs/ai/cx1-db-sample-census/sample-census.sql`');
  lines.push('- `docs/ai/cx1-db-sample-census/sample-census-plan.json`');
  if (result) lines.push('- `docs/ai/cx1-db-sample-census/sample-census-result.json`');
  lines.push('');
  if (!result) {
    lines.push('## Prepared SQL');
    lines.push('');
    lines.push('The SQL is prepared but intentionally not run in this checkpoint. Run only after `node scripts/cx1-heavy-lab-runner.mjs recommend` reports a clean MEDIUM or better window with no competing lane readers.');
  } else {
    lines.push('## Headline');
    lines.push('');
    lines.push(`Sampled documents: **${fmtInt(result.sample.documents)}** across **${fmtInt(result.sample.courts)}** courts and **${fmtInt(result.sample.years)}** years.`);
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|---|---:|');
    lines.push(`| Avg text chars | ${fmtInt(result.textLength.avgChars)} |`);
    lines.push(`| p95 text chars | ${fmtInt(result.textLength.p95Chars)} |`);
    lines.push(`| Devanagari-bearing docs | ${fmtInt(result.textLength.devanagariDocuments)} |`);
    lines.push(`| Docs with real citations | ${fmtInt(result.citationDensity.documentsWithRealCitations)} |`);
    lines.push(`| Docs with chunks | ${fmtInt(result.chunkCoverage.documentsWithChunks)} |`);
    lines.push(`| Docs with verified enrichments | ${fmtInt(result.enrichmentCoverage.documentsWithVerifiedEnrichments)} |`);
  }
  lines.push('');
  lines.push('## Caveats');
  lines.push('');
  lines.push('- `TABLESAMPLE SYSTEM` samples blocks, not uniformly random rows.');
  lines.push('- Citation sentinel rows are counted separately and excluded from real-citation density.');
  lines.push('- The Devanagari detector is a Unicode range screen, not OCR quality proof.');
  lines.push('- This is a measurement harness, not a promotion decision.');
  fs.writeFileSync(REPORT, `${lines.join('\n')}\n`);
}

function main() {
  const runLive = hasFlag('--run');
  const samplePercent = pctArg('--sample-percent', '0.25');
  const limit = intArg('--limit', '20000');
  const seed = intArg('--seed', '170817');
  const generatedAt = new Date().toISOString();
  const sql = sampleSql({ samplePercent, limit, seed });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(SQL_FILE, `${sql}\n`);

  const plan = {
    schema: 'cx1-db-sample-census-plan-v1',
    generatedAt,
    status: runLive ? 'run_requested' : 'prepared_not_run',
    db: {
      host: '127.0.0.1',
      port: PG.port,
      database: PG.database,
      helper: 'scripts/migration/pg-local.mjs',
    },
    controls: {
      samplePercent,
      limit,
      seed,
      dryRunDefault: true,
      runCommand: `node scripts/cx1-db-sample-census.mjs --run --sample-percent ${samplePercent} --limit ${limit} --seed ${seed}`,
    },
    outputs: {
      sql: 'docs/ai/cx1-db-sample-census/sample-census.sql',
      result: runLive ? 'docs/ai/cx1-db-sample-census/sample-census-result.json' : null,
      report: 'docs/ai/CX1_DB_SAMPLE_CENSUS.md',
    },
  };
  fs.writeFileSync(PLAN_FILE, `${JSON.stringify(plan, null, 2)}\n`);

  let result = null;
  if (runLive) {
    const raw = psqlValue(sql, PG.database);
    result = JSON.parse(raw);
    fs.writeFileSync(RESULT_FILE, `${JSON.stringify(result, null, 2)}\n`);
  }

  writeReport({
    mode: runLive ? 'complete_sample' : 'prepared_not_run',
    generatedAt,
    samplePercent,
    limit,
    seed,
    result,
  });

  console.log(runLive ? `wrote ${path.relative(ROOT, RESULT_FILE)}` : 'dry-run: SQL prepared, DB not queried');
  console.log(`wrote ${path.relative(ROOT, SQL_FILE)}`);
  console.log(`wrote ${path.relative(ROOT, PLAN_FILE)}`);
  console.log(`wrote ${path.relative(ROOT, REPORT)}`);
}

main();
