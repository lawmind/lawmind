WITH citation_base AS (
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
