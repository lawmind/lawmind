/**
 * Highlight-and-save, per PD-9 item 3 — `docs/API_CONTRACTS.md` §Annotations.
 *
 * An annotation anchors on **what the court printed**, not on where the paragraph
 * happened to sit when it was made. `paragraph_number` is the citable unit;
 * `paragraph_index` exists only so an annotation on an unnumbered judgment still
 * has somewhere to land.
 *
 * That distinction is the whole point. A re-ingest can move a paragraph's
 * position — a headnote parsed differently, furniture stripped that was not
 * stripped before — and following the index would silently relocate an
 * advocate's note to a different passage of the same judgment. Nothing would
 * error; the note would just be attached to the wrong law.
 *
 * Deletion is a timestamp, never a row removal, for the same reason revocation
 * is on `matter_shares`: what an advocate had marked, and when, is the question
 * asked later.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';

export const annotationBody = z.object({
  /** What the court printed. Null on an unnumbered judgment — see the module note. */
  paragraphNumber: z.number().int().positive().nullable(),
  paragraphIndex: z.number().int().min(0),
  quote: z.string().min(1).max(4000),
  note: z.string().max(4000).optional(),
  matterId: z.string().uuid().optional(),
});

type Row = {
  id: string;
  judgment_id: string;
  matter_id: string | null;
  paragraph_number: number | null;
  paragraph_index: number;
  quote: string;
  note: string | null;
  created_at: string;
};

const shape = (r: Row) => ({
  annotationId: r.id,
  judgmentId: r.judgment_id,
  matterId: r.matter_id,
  paragraphNumber: r.paragraph_number,
  paragraphIndex: r.paragraph_index,
  quote: r.quote,
  note: r.note,
  createdAt: r.created_at,
});

/**
 * Auth is S5 and RCC-owned. Until it lands there is no user to attribute an
 * annotation to, and `judgment_annotations.user_id` is NOT NULL — correctly, an
 * annotation belongs to somebody. Rather than invent a user or make the column
 * nullable to work around a sequencing gap, these routes answer honestly.
 */
function requireUser(c: Context, userId: string | undefined): Response | null {
  if (userId) return null;
  return fail(
    c,
    'AUTH_REQUIRED',
    'annotations belong to a user and authentication ships in S5',
    401,
  );
}

export async function listAnnotations(
  c: Context,
  sql: Sql,
  judgmentId: string,
  userId: string | undefined,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const rows = await sql<Row[]>`
    SELECT id, judgment_id, matter_id, paragraph_number, paragraph_index,
           quote, note, created_at::text AS created_at
    FROM judgment_annotations
    WHERE user_id = ${userId!} AND judgment_id = ${judgmentId} AND deleted_at IS NULL
    ORDER BY paragraph_index, created_at
  `;
  return ok(c, { annotations: rows.map(shape) });
}

export async function createAnnotation(
  c: Context,
  sql: Sql,
  judgmentId: string,
  userId: string | undefined,
  body: z.infer<typeof annotationBody>,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const [judgment] = await sql<{ id: string }[]>`
    SELECT id FROM judgments WHERE id = ${judgmentId}`;
  if (!judgment) return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  const [row] = await sql<Row[]>`
    INSERT INTO judgment_annotations
      (user_id, judgment_id, matter_id, paragraph_number, paragraph_index, quote, note)
    VALUES (${userId!}, ${judgmentId}, ${body.matterId ?? null},
            ${body.paragraphNumber}, ${body.paragraphIndex}, ${body.quote}, ${body.note ?? null})
    RETURNING id, judgment_id, matter_id, paragraph_number, paragraph_index,
              quote, note, created_at::text AS created_at
  `;
  return ok(c, { annotation: shape(row!) });
}

export async function deleteAnnotation(
  c: Context,
  sql: Sql,
  annotationId: string,
  userId: string | undefined,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  // Soft delete, and scoped to the owner: a user must not be able to remove
  // another advocate's note by guessing an id.
  const [row] = await sql<{ id: string }[]>`
    UPDATE judgment_annotations SET deleted_at = now()
    WHERE id = ${annotationId} AND user_id = ${userId!} AND deleted_at IS NULL
    RETURNING id
  `;
  if (!row) return fail(c, 'NOT_FOUND', 'no annotation with that id', 404);
  return ok(c, { deleted: true });
}
