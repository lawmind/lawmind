-- CX1 read-only legal-object efficiency selector. Run only under MEDIUM_CLEAN.
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
