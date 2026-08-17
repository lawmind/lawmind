WITH extension_versions AS (
  SELECT extname, extversion
  FROM pg_extension
  WHERE extname IN ('vector', 'pg_trgm', 'uuid-ossp', 'pgcrypto')
),
database_shape AS (
  SELECT
    current_database() AS database_name,
    version() AS postgres_version,
    pg_database_size(current_database())::bigint AS database_bytes
),
relation_estimates AS (
  SELECT
    n.nspname AS schema_name,
    c.relname AS relation_name,
    c.relkind,
    c.reltuples::bigint AS estimated_rows,
    pg_total_relation_size(c.oid)::bigint AS total_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'm', 'i')
),
representative_samples AS (
  SELECT 'judgments' AS table_name, count(*)::bigint AS bounded_rows
  FROM (SELECT 1 FROM judgments LIMIT 1000) s
  UNION ALL
  SELECT 'judgment_chunks', count(*)::bigint
  FROM (SELECT 1 FROM judgment_chunks LIMIT 1000) s
  UNION ALL
  SELECT 'judgment_citations', count(*)::bigint
  FROM (SELECT 1 FROM judgment_citations LIMIT 1000) s
  UNION ALL
  SELECT 'document_enrichments', count(*)::bigint
  FROM (SELECT 1 FROM document_enrichments LIMIT 1000) s
),
generated_columns AS (
  SELECT
    c.relname AS table_name,
    a.attname AS column_name,
    a.attgenerated AS generated_kind
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND a.attgenerated <> ''
),
citation_lookup_probe AS (
  SELECT
    count(*)::bigint AS alias_rows_sampled,
    count(*) FILTER (WHERE alias_key IS NULL OR judgment_id IS NULL)::bigint AS malformed_alias_rows
  FROM (SELECT alias_key, judgment_id FROM judgment_citation_aliases LIMIT 1000) a
),
full_text_probe AS (
  SELECT count(*)::bigint AS hits
  FROM (
    SELECT id
    FROM judgments
    WHERE search_tsv @@ plainto_tsquery('english', 'constitutional')
    LIMIT 5
  ) q
),
vector_probe AS (
  SELECT
    count(*)::bigint AS vector_rows_sampled,
    max(vector_dims(embedding))::int AS max_embedding_dims
  FROM (SELECT embedding FROM judgment_chunks WHERE embedding IS NOT NULL LIMIT 100) v
)
SELECT 'database_shape' AS section, to_jsonb(database_shape) AS data FROM database_shape
UNION ALL
SELECT 'extension_versions', coalesce(jsonb_agg(to_jsonb(extension_versions) ORDER BY extname), '[]'::jsonb) FROM extension_versions
UNION ALL
SELECT 'relation_estimates_top', jsonb_agg(to_jsonb(x) ORDER BY x.total_bytes DESC)
FROM (SELECT * FROM relation_estimates ORDER BY total_bytes DESC LIMIT 50) x
UNION ALL
SELECT 'representative_samples', jsonb_agg(to_jsonb(representative_samples) ORDER BY table_name) FROM representative_samples
UNION ALL
SELECT 'generated_columns', coalesce(jsonb_agg(to_jsonb(generated_columns) ORDER BY table_name, column_name), '[]'::jsonb) FROM generated_columns
UNION ALL
SELECT 'citation_lookup_probe', to_jsonb(citation_lookup_probe) FROM citation_lookup_probe
UNION ALL
SELECT 'full_text_probe', to_jsonb(full_text_probe) FROM full_text_probe
UNION ALL
SELECT 'vector_probe', to_jsonb(vector_probe) FROM vector_probe;
