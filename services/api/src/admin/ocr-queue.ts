/**
 * `GET /admin/ocr-queue` — `docs/SCHEMA_TRUTH.md#ocr_jobs`.
 *
 * **Will report empty today, honestly.** `POST /ocr/jobs` is still SPECCED
 * (`docs/API_CONTRACTS.md`), so `ocr_jobs` has no writer yet. This endpoint is
 * real and correct against the table as it exists — an empty queue is the true
 * state, not a bug here.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

export const ocrQueueQuery = z.object({
  status: z.enum(['queued', 'processing', 'complete', 'failed', 'needs_review']).optional(),
});

type OcrJobRow = {
  id: string;
  user_id: string;
  matter_id: string | null;
  source_type: string;
  engine: string;
  status: string;
  confidence_overall: string | null;
  confirmed_by_user: boolean;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export async function listOcrQueue(
  c: Context,
  sql: Sql,
  userId: string | undefined,
  query: z.infer<typeof ocrQueueQuery>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'the OCR queue is a privileged surface', 401);

  const rows = await sql<OcrJobRow[]>`
    SELECT id, user_id, matter_id, source_type, engine, status, confidence_overall,
           confirmed_by_user, error, ${sql.unsafe(isoColumn('created_at'))} AS created_at,
           ${sql.unsafe(isoColumn('completed_at'))} AS completed_at
    FROM ocr_jobs
    WHERE true ${query.status ? sql`AND status = ${query.status}` : sql``}
    ORDER BY created_at DESC
  `;

  return ok(c, {
    jobs: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      matterId: r.matter_id,
      sourceType: r.source_type,
      engine: r.engine,
      status: r.status,
      confidenceOverall: r.confidence_overall,
      confirmedByUser: r.confirmed_by_user,
      error: r.error,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    })),
  });
}
