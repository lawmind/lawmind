WITH candidates AS (
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
      WHEN j.full_text ~ U&'[\0900-\097F]' THEN 'devanagari_present'
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
WHERE stratum_rank <= 25
ORDER BY residue_method, length_band, citation_band, script_risk, stratum_rank;
