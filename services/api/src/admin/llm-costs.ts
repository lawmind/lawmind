/**
 * `GET /admin/llm-costs` — `docs/SCHEMA_TRUTH.md#llm_calls`: "every call writes
 * a row, no exceptions."
 *
 * **This will report all zeros today, honestly.** No LLM has ever been called
 * from this codebase — `docs/FOUNDER_QUEUE.md` §`POST /documents` traced this
 * for drafting specifically, and it holds for search/briefing/extract/
 * ocr_postprocess too. An empty `llm_calls` table is the true current state,
 * not a bug in this endpoint — the same "absent check is not a negative
 * result" reasoning as everywhere else, just visibly zero rather than null,
 * because a cost total of $0 over zero calls is not a claim that costs are
 * controlled; it is a claim that nothing has been measured yet.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';

export const llmCostsQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function getLlmCosts(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  query: z.infer<typeof llmCostsQuery>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'LLM cost data is a privileged surface', 401);

  const range = sql`
    ${query.from ? sql`AND created_at >= (${query.from}::text)::timestamptz` : sql``}
    ${query.to ? sql`AND created_at <= (${query.to}::text)::timestamptz` : sql``}
  `;

  const byDay = await sql<{ day: string; cost: string; calls: number }[]>`
    SELECT created_at::date::text AS day, sum(cost_usd)::text AS cost, count(*)::int AS calls
    FROM llm_calls WHERE true ${range} GROUP BY day ORDER BY day`;
  const byFeature = await sql<{ feature: string; cost: string; calls: number }[]>`
    SELECT feature, sum(cost_usd)::text AS cost, count(*)::int AS calls
    FROM llm_calls WHERE true ${range} GROUP BY feature`;
  const byModel = await sql<{ model: string; cost: string; calls: number }[]>`
    SELECT model, sum(cost_usd)::text AS cost, count(*)::int AS calls
    FROM llm_calls WHERE true ${range} GROUP BY model`;
  const byDataClass = await sql<{ data_class: string; cost: string; calls: number }[]>`
    SELECT data_class, sum(cost_usd)::text AS cost, count(*)::int AS calls
    FROM llm_calls WHERE true ${range} GROUP BY data_class`;
  const [total] = await sql<{ cost: string; calls: number }[]>`
    SELECT coalesce(sum(cost_usd), 0)::text AS cost, count(*)::int AS calls
    FROM llm_calls WHERE true ${range}`;

  return ok(c, {
    byDay,
    byFeature: Object.fromEntries(
      byFeature.map((r) => [r.feature, { cost: r.cost, calls: r.calls }]),
    ),
    byModel: Object.fromEntries(byModel.map((r) => [r.model, { cost: r.cost, calls: r.calls }])),
    byDataClass: Object.fromEntries(
      byDataClass.map((r) => [r.data_class, { cost: r.cost, calls: r.calls }]),
    ),
    total: { cost: total?.cost ?? '0', calls: total?.calls ?? 0 },
  });
}
