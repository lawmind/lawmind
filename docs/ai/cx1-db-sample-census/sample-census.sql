/* CX1 read-only sample census. Do not run during vector/HNSW work. */
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
  FROM judgments TABLESAMPLE SYSTEM (0.25) REPEATABLE (170817)
  ORDER BY id
  LIMIT 20000
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
    'tableSamplePercent', 0.25,
    'limit', 20000,
    'seed', 170817,
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
)::text AS result_json;
