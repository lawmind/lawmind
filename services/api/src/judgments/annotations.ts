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

import { corpusTargetUnavailable } from '../corpus/target-unavailable.ts';
import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import { loadOnePrecedentialState } from './treatment-lookup.ts';

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
 * Auth ships in S5 and is THIS lane's — `sprints/SPRINT_5.md` gives LCC
 * `packages/auth/**`; RCC owns only the mobile screens. Until it lands there is
 * no user to attribute an
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
           quote, note, ${sql.unsafe(isoColumn('created_at'))} AS created_at
    FROM judgment_annotations
    WHERE user_id = ${userId!} AND judgment_id = ${judgmentId} AND deleted_at IS NULL
    ORDER BY paragraph_index, created_at
  `;
  return ok(c, { annotations: rows.map(shape) });
}

/**
 * `sql` is the USER role — `judgment_annotations` is an advocate's own work.
 * `corpusSql` reads the judgment and its precedential state, and defaults to
 * `sql` so single-database callers are unchanged.
 *
 * The two are genuinely different questions. Whether this judgment may be added
 * to a matter is a fact about published law, read live from the corpus on every
 * request; the note itself belongs to the advocate and must survive any corpus
 * rollback.
 */
export async function createAnnotation(
  c: Context,
  sql: Sql,
  judgmentId: string,
  userId: string | undefined,
  body: z.infer<typeof annotationBody>,
  corpusSql: Sql = sql,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const [judgment] = await corpusSql<
    { id: string; overruled_status: string; case_title: string }[]
  >`
    -- Read LIVE, never cached. Verification is permanent; good-law status is not,
    -- and a judgment that was fine to add last week may not be today.
    SELECT id, overruled_status, case_title FROM judgments WHERE id = ${judgmentId}`;
  /* Annotating WITH a `matterId` IS add-to-matter (see the note below), so this
   * is the closest of the eight to R17 §1's frozen write — and it takes §1's
   * exact refusal: this generation does not carry the target, which is not a
   * statement that the judgment does not exist (`corpus/target-unavailable.ts`). */
  if (!judgment) {
    return corpusTargetUnavailable(c, 'it cannot be annotated right now', { write: true });
  }

  /**
   * **`set_aside` disables add-to-matter — the one case where Lawmind refuses to
   * let an authority be used.** Attaching an annotation to a `matterId` IS
   * add-to-matter: it is how a passage becomes an authority in a case, and from
   * there it reaches a draft and then a filing.
   *
   * Enforced on the server because the client's disabled button is presentation,
   * not enforcement — the same reason citation locking lives in `PATCH
   * /documents/:id`. A rule that only exists in the UI is a rule that a second
   * client, a stale build, or a direct call does not have.
   *
   * **Saving the passage WITHOUT a matter is still allowed.** The refusal is
   * about using it as an authority, not about reading it: an advocate has every
   * reason to highlight the paragraph that was set aside, and blocking that would
   * teach them the product is broken rather than careful.
   *
   * The response NAMES the judgment. "You cannot add this" with no reason sends
   * the advocate to check manually, which is the work the product exists to save.
   */
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * OD-14 NEVER REACHED THIS ROUTE, AND IT IS THE SAME REFUSAL AS
   * `POST /matters/:id/authorities` — WHICH SAYS THE OPPOSITE
   * ───────────────────────────────────────────────────────────────────────────
   *
   * This was `judgment.overruled_status === 'set_aside'` read straight off the
   * stored column: a FOURTH independent reimplementation of the one policy
   * `precedential-effect.ts` centralises, and the one nobody noticed because
   * annotating into a matter does not look like add-to-matter from the outside.
   *
   * It is. `matters/authorities.ts` derives the effect and ALLOWS the 73
   * judgments carrying stored `set_aside` for what their verified edge calls
   * `overruled`. This route refused them. Same authority, same matter, same
   * second — allowed through one door and refused at the other, with a message
   * asserting a set aside that did not happen.
   *
   * Now the same derivation, and the same two refusing effects: a genuine
   * `set_aside`, and `review_required` — a stored adverse status no verified
   * edge accounts for, where quietly becoming addable is the dangerous
   * direction.
   */
  if (body.matterId) {
    const state = await loadOnePrecedentialState(corpusSql, judgmentId);
    if (state && state.policy.addToMatter === 'refuse') {
      const [overruler] = await corpusSql<
        { case_title: string; neutral_citation: string | null }[]
      >`
        SELECT o.case_title, o.neutral_citation
        FROM judgments j LEFT JOIN judgments o ON o.id = j.overruled_by_judgment_id
        WHERE j.id = ${judgmentId} AND o.id IS NOT NULL`;
      /* Copy is licence protection, not an audit: `review_required` does not
       * claim a set aside that nothing verified. Same wording as
       * `matters/authorities.ts`, for the same reason. */
      const displacedBy =
        state.effect === 'set_aside' && overruler
          ? ` It was set aside by ${overruler.case_title}${
              overruler.neutral_citation ? ` ${overruler.neutral_citation}` : ''
            }.`
          : '';
      const what =
        state.effect === 'set_aside'
          ? 'has been set aside and cannot be added to a matter.'
          : 'has a recorded change of status we could not confirm, so it cannot be added to a matter yet.';
      return fail(
        c,
        'AUTHORITY_SET_ASIDE',
        `${judgment.case_title} ${what}${displacedBy} You can still save the passage on its own.`,
        409,
      );
    }
  }

  const [row] = await sql<Row[]>`
    INSERT INTO judgment_annotations
      (user_id, judgment_id, matter_id, paragraph_number, paragraph_index, quote, note)
    VALUES (${userId!}, ${judgmentId}, ${body.matterId ?? null},
            ${body.paragraphNumber}, ${body.paragraphIndex}, ${body.quote}, ${body.note ?? null})
    RETURNING id, judgment_id, matter_id, paragraph_number, paragraph_index,
              quote, note, ${sql.unsafe(isoColumn('created_at'))} AS created_at
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
