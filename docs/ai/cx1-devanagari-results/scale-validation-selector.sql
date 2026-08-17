/* CX1 Devanagari scale-validation selector.
   Prepared offline. Run only when scheduler permits DB sampling and PDF/OCR work.
   Uses ASCII chr() ranges to avoid Windows shell mojibake in Devanagari filters. */
WITH target(court, target_documents, role) AS (
  VALUES
  ('High Court Of Rajasthan'::text, 32::int, 'highest_defect_rate'::text),
  ('Allahabad High Court'::text, 32::int, 'largest_absolute_population'::text),
  ('High Court of Chhattisgarh'::text, 16::int, 'high_defect_rate'::text),
  ('Bombay High Court'::text, 10::int, 'mixed_defect_control'::text),
  ('High Court of Jharkhand'::text, 16::int, 'high_defect_rate'::text),
  ('High Court of Uttarakhand'::text, 10::int, 'small_high_defect_sample'::text),
  ('High Court of Madhya Pradesh'::text, 10::int, 'low_count_mixed_control'::text),
  ('High Court of Delhi'::text, 10::int, 'low_count_mixed_control'::text),
  ('Patna High Court'::text, 12::int, 'clean_control'::text)
),
candidate AS MATERIALIZED (
  SELECT
    j.id::text,
    j.case_title,
    j.neutral_citation,
    j.reporter_citations,
    j.court,
    extract(year FROM j.judgment_date)::int AS year,
    j.source_url,
    j.full_text,
    char_length(j.full_text)::int AS stored_text_chars,
    md5(j.full_text) AS stored_text_md5,
    count(jc.id) FILTER (WHERE coalesce(jc.citation_text, '') <> '')::int AS real_citation_count,
    count(jc.id) FILTER (
      WHERE coalesce(jc.citation_text, '') <> '' AND jc.cited_judgment_id IS NOT NULL
    )::int AS resolved_citation_count
  FROM judgments j
  JOIN target t ON t.court = j.court
  LEFT JOIN judgment_citations jc ON jc.citing_judgment_id = j.id
  WHERE j.full_text ~ ('[' || chr(2304) || '-' || chr(2431) || ']')
  GROUP BY j.id, j.case_title, j.neutral_citation, j.reporter_citations, j.court,
           j.judgment_date, j.source_url, j.full_text
),
ranked AS (
  SELECT
    c.*,
    row_number() OVER (
      PARTITION BY c.court
      ORDER BY
        (c.real_citation_count > 0) DESC,
        (c.resolved_citation_count > 0) DESC,
        c.year,
        md5(c.id)
    ) AS rn
  FROM candidate c
)
SELECT jsonb_build_object(
  'schema', 'cx1-devanagari-scale-validation-manifest-v1',
  'createdAt', now(),
  'status', 'selected_not_processed',
  'selector', 'docs/ai/cx1-devanagari-results/scale-validation-selector.sql',
  'documents', jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'caseTitle', r.case_title,
      'neutralCitation', r.neutral_citation,
      'reporterCitations', r.reporter_citations,
      'court', r.court,
      'year', r.year,
      'sourceUrl', r.source_url,
      'storedTextChars', r.stored_text_chars,
      'storedTextMd5', r.stored_text_md5,
      'realCitationCount', r.real_citation_count,
      'resolvedCitationCount', r.resolved_citation_count
    )
    ORDER BY r.court, r.rn
  )
)::text AS result_json
FROM ranked r
JOIN target t ON t.court = r.court
WHERE r.rn <= t.target_documents;
