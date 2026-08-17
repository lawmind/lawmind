-- CX1 read-only coarse extract-cost selector. Run only under MEDIUM_CLEAN.
WITH extract_cost AS (
  SELECT
    date_trunc('day', created_at)::date AS day,
    model,
    count(*) AS extract_rows,
    sum(input_tokens) AS input_tokens,
    sum(output_tokens) AS output_tokens,
    sum(cost_usd) AS cost_usd,
    round(avg(NULLIF(latency_ms, 0))::numeric, 2) AS avg_latency_ms
  FROM llm_calls
  WHERE feature = 'extract'
  GROUP BY date_trunc('day', created_at)::date, model
)
SELECT *
FROM extract_cost
ORDER BY day, model;
