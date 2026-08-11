/**
 * Authorities saved to a matter.
 *
 * `matters/route.ts`'s own header comment already described this feature —
 * *"`set_aside` disables add-to-matter... it NAMES the judgment that
 * displaced it"* — before anything existed behind it. RCC found the gap
 * 11 Aug 2026 reading the code rather than the docs: no table, no route, and
 * the client's "Add to a matter" button had never had an `onPress`.
 * `docs/SCHEMA_TRUTH.md` §matter_authorities.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WRITES ARE OWNER-ONLY — MATCHING `createMatterEvent`, NOT `getMatter`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `getMatter` uses `accessToMatter` so a sharee can READ a matter. Every write
 * in `matters/route.ts` checks `user_id = ${userId}` directly instead — a
 * sharee can see the file but cannot add to it. This module follows the write
 * convention for create/remove and the read convention for list, exactly as
 * the rest of the module already splits it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `set_aside` REFUSES, AND NAMES THE REPLACEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The one case Lawmind refuses to let an authority be used at all — enforced
 * here, server-side, so it cannot be styled away by a client that forgot to
 * grey out a button. Naming what replaced it is not a courtesy: an advocate
 * who is told "no" and nothing else has to go and find the current authority
 * themselves, which is the exact task this refusal should be saving them.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

export const addAuthorityBody = z.object({
  judgmentId: z.string().uuid(),
  citationCheckId: z.string().uuid().optional(),
});

type AuthorityRow = {
  id: string;
  judgment_id: string;
  case_title: string;
  neutral_citation: string | null;
  added_by_user_id: string;
  added_at: string;
  removed_at: string | null;
};

const shape = (r: AuthorityRow) => ({
  authorityId: r.id,
  judgmentId: r.judgment_id,
  caseTitle: r.case_title,
  neutralCitation: r.neutral_citation,
  addedBy: r.added_by_user_id,
  addedAt: r.added_at,
  removedAt: r.removed_at,
});

/** Only the OWNER writes. A sharee can read a matter but not add to it — see module note. */
async function ownedMatter(sql: Sql, matterId: string, userId: string) {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM matters WHERE id = ${matterId} AND user_id = ${userId}`;
  return row;
}

const AUTHORITY_COLUMNS = `a.id, a.judgment_id, j.case_title, j.neutral_citation,
       a.added_by_user_id, ${isoColumn('a.added_at')} AS added_at,
       ${isoColumn('a.removed_at')} AS removed_at`;

export async function listAuthorities(
  c: Context,
  sql: Sql,
  matterId: string,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);

  // Read follows accessToMatter's convention (owner or live share), not the
  // owner-only write check below — a sharee can see what was saved.
  const [access] = await sql<{ access: string }[]>`
    SELECT CASE
      WHEN m.user_id = ${userId} THEN 'owner'
      WHEN EXISTS (
        SELECT 1 FROM matter_shares s
        WHERE s.matter_id = m.id AND s.invited_user_id = ${userId} AND s.revoked_at IS NULL
      ) THEN 'shared'
      ELSE 'none'
    END AS access
    FROM matters m WHERE m.id = ${matterId}`;
  if (!access || access.access === 'none') {
    return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  }

  // Removed authorities are returned too, same reasoning as revoked shares:
  // what was saved, and when it was taken off, is the question asked later.
  const rows = await sql<AuthorityRow[]>`
    SELECT ${sql.unsafe(AUTHORITY_COLUMNS)}
    FROM matter_authorities a JOIN judgments j ON j.id = a.judgment_id
    WHERE a.matter_id = ${matterId}
    ORDER BY a.added_at DESC`;

  return ok(c, { authorities: rows.map(shape), asOf: new Date().toISOString() });
}

export async function addAuthority(
  c: Context,
  sql: Sql,
  matterId: string,
  userId: string | undefined,
  body: z.infer<typeof addAuthorityBody>,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedMatter(sql, matterId, userId))) {
    return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  }

  const [judgment] = await sql<
    {
      id: string;
      case_title: string;
      neutral_citation: string | null;
      overruled_status: string;
      overruled_by_case_title: string | null;
      overruled_by_neutral_citation: string | null;
    }[]
  >`
    SELECT j.id, j.case_title, j.neutral_citation, j.overruled_status,
           r.case_title AS overruled_by_case_title,
           r.neutral_citation AS overruled_by_neutral_citation
    FROM judgments j
    LEFT JOIN judgments r ON r.id = j.overruled_by_judgment_id
    WHERE j.id = ${body.judgmentId}`;
  if (!judgment) return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  // The one refusal Lawmind enforces server-side, unconditionally.
  // `CITATION_HARNESS.md`, `matters/route.ts` module comment.
  if (judgment.overruled_status === 'set_aside') {
    return fail(
      c,
      'AUTHORITY_SET_ASIDE',
      judgment.overruled_by_case_title
        ? `${judgment.case_title} was set aside and cannot be added to a matter. ` +
          `${judgment.overruled_by_case_title}${judgment.overruled_by_neutral_citation ? ` (${judgment.overruled_by_neutral_citation})` : ''} replaced it.`
        : `${judgment.case_title} was set aside and cannot be added to a matter.`,
      409,
    );
  }

  if (body.citationCheckId) {
    const [check] = await sql<{ id: string }[]>`
      SELECT id FROM citation_checks WHERE id = ${body.citationCheckId}`;
    if (!check) return fail(c, 'INVALID_REQUEST', 'citationCheckId does not exist', 400);
  }

  const [row] = await sql<{ id: string; added_by_user_id: string; added_at: string; removed_at: string | null }[]>`
    INSERT INTO matter_authorities (matter_id, judgment_id, added_by_user_id, citation_check_id)
    VALUES (${matterId}, ${body.judgmentId}, ${userId}, ${body.citationCheckId ?? null})
    -- The partial unique index covers LIVE rows only, so re-adding one
    -- previously removed is allowed — matter_shares' "brought back onto a
    -- case" reasoning, applied to authorities.
    ON CONFLICT DO NOTHING
    RETURNING id, added_by_user_id, ${sql.unsafe(isoColumn('added_at'))} AS added_at,
              ${sql.unsafe(isoColumn('removed_at'))} AS removed_at
  `;

  if (row) {
    return ok(
      c,
      {
        authority: shape({
          id: row.id,
          judgment_id: judgment.id,
          case_title: judgment.case_title,
          neutral_citation: judgment.neutral_citation,
          added_by_user_id: row.added_by_user_id,
          added_at: row.added_at,
          removed_at: row.removed_at,
        }),
      },
      201,
    );
  }

  // Already live. Idempotent rather than an error — the advocate's intent
  // (this authority is saved) is already satisfied.
  const [existing] = await sql<AuthorityRow[]>`
    SELECT ${sql.unsafe(AUTHORITY_COLUMNS)}
    FROM matter_authorities a JOIN judgments j ON j.id = a.judgment_id
    WHERE a.matter_id = ${matterId} AND a.judgment_id = ${body.judgmentId} AND a.removed_at IS NULL`;
  // ON CONFLICT DO NOTHING with no existing live row means the unique index
  // did not fire, which should be unreachable — but never guess a response.
  if (!existing) return fail(c, 'INTERNAL_ERROR', 'could not add this authority', 500);
  return ok(c, { authority: shape(existing) }, 200);
}

export async function removeAuthority(
  c: Context,
  sql: Sql,
  matterId: string,
  authorityId: string,
  userId: string | undefined,
): Promise<Response> {
  if (!userId) return fail(c, 'AUTH_REQUIRED', 'sign in to continue', 401);
  if (!(await ownedMatter(sql, matterId, userId))) {
    return fail(c, 'NOT_FOUND', 'no matter with that id', 404);
  }

  const [row] = await sql<{ removed_at: string }[]>`
    UPDATE matter_authorities
       -- Never a DELETE — same reasoning as matter_shares.
       SET removed_at = now(), removed_by_user_id = ${userId}
     WHERE id = ${authorityId} AND matter_id = ${matterId} AND removed_at IS NULL
    RETURNING ${sql.unsafe(isoColumn('removed_at'))} AS removed_at
  `;
  if (!row) return fail(c, 'NOT_FOUND', 'no live authority with that id', 404);

  return ok(c, { removedAt: row.removed_at });
}
