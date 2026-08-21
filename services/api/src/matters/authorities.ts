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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GOOD-LAW STATUS IS READ LIVE, EVERY REQUEST — RCC BUS 0048
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This route shipped 11 Aug 2026 selecting seven columns, none of which said
 * whether the law still stood. RCC found it the same day and called it a P0,
 * correctly: a matter is where an authority sits for MONTHS, which makes it the
 * likeliest surface in the product for the law to move underneath a citation,
 * and the only one where the advocate has already decided to rely on it.
 * `docs/CITATION_HARNESS.md` sets the stale-overruled threshold at zero.
 *
 * And silence is not neutral in our UI. Verified is silent, so a row with no
 * mark reads as "checked, not decorated" — a bare row here did not read as "we
 * do not know", it read as "this is fine".
 *
 * `addAuthority` below already refuses `set_aside` at write time, so the status
 * was in hand once. Nothing re-read it afterwards, which is precisely the case
 * the harness exists for: the judgment WAS good law when it was saved.
 *
 * Hence `overruled_*` is joined from `judgments` on every read and never copied
 * onto `matter_authorities` — a status stored at save time is the cached value
 * the harness forbids.
 *
 * **`verificationState`/`verifiedBySource` do NOT come from a column.** Bus 0048
 * asked for `j.verification_state, j.verified_by_source`; `judgments` carries
 * neither — they live on `citation_checks` and `verification_cache`
 * (`docs/SCHEMA_TRUTH.md` §"three fields, three homes"). `judgment_id` is a NOT
 * NULL foreign key into our own corpus, so this row IS the corpus and resolves
 * to itself: `verified`/`corpus` by construction, exactly as
 * `briefings/route.ts`, `judgments/route.ts`, `search/route.ts` and
 * `search/saved.ts` each state it. The linked `citation_check_id` is
 * deliberately not consulted — it can only name a STRONGER source than `corpus`,
 * never a weaker one, and both render silently, so reading it would change no
 * mark on any screen.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import {
  precedentialEffect,
  precedentialPolicy,
  type OverruledStatus,
} from '../judgments/precedential-effect.ts';

export const addAuthorityBody = z.object({
  judgmentId: z.string().uuid(),
  citationCheckId: z.string().uuid().optional(),
});

type AuthorityRow = {
  id: string;
  judgment_id: string;
  case_title: string;
  neutral_citation: string | null;
  reporter_citations: string[];
  added_by_user_id: string;
  added_at: string;
  removed_at: string | null;
  overruled_status: string;
  overruled_by_judgment_id: string | null;
  overruled_by_title: string | null;
  overruled_paras: number[] | null;
  overruled_note: string | null;
};

const shape = (r: AuthorityRow) => ({
  authorityId: r.id,
  judgmentId: r.judgment_id,
  caseTitle: r.case_title,
  neutralCitation: r.neutral_citation,
  /**
   * RCC bus 0049. Absent until 11 Aug 2026, and its absence was not cosmetic:
   * the client reads citability as `neutralCitation === null AND
   * reporterCitations.length === 0` — `docs/CITATION_HARNESS.md`'s own rule —
   * so every Supreme Court judgment older than neutral citations (~2013) whose
   * only citation is a reporter citation rendered here as "No citation on file
   * — cannot be referenced in a filing". Wrong, and wrong in the direction that
   * makes a real, citable authority look unusable.
   */
  reporterCitations: r.reporter_citations,
  addedBy: r.added_by_user_id,
  addedAt: r.added_at,
  removedAt: r.removed_at,
  // Tier 1 by construction — see the module note. Not a placeholder.
  verificationState: 'verified' as const,
  verifiedBySource: 'corpus' as const,
  /** Read live, this request. Never a value stored when the authority was saved. */
  overruledStatus: r.overruled_status,
  overruledByJudgmentId: r.overruled_by_judgment_id,
  overruledByTitle: r.overruled_by_title,
  /** Required to render `partly_set_aside` at its own weight, not as a headline. */
  overruledParas: r.overruled_paras,
  overruledNote: r.overruled_note,
});

/** Only the OWNER writes. A sharee can read a matter but not add to it — see module note. */
async function ownedMatter(sql: Sql, matterId: string, userId: string) {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM matters WHERE id = ${matterId} AND user_id = ${userId}`;
  return row;
}

const AUTHORITY_COLUMNS = `a.id, a.judgment_id, j.case_title, j.neutral_citation,
       j.reporter_citations, a.added_by_user_id, ${isoColumn('a.added_at')} AS added_at,
       ${isoColumn('a.removed_at')} AS removed_at,
       j.overruled_status, j.overruled_by_judgment_id, j.overruled_paras,
       j.overruled_note, o.case_title AS overruled_by_title`;

/**
 * One FROM clause, both read paths. The `LEFT JOIN` is what lets a moved
 * authority NAME what displaced it rather than only saying that it moved.
 */
const AUTHORITY_FROM = `matter_authorities a
    JOIN judgments j ON j.id = a.judgment_id
    LEFT JOIN judgments o ON o.id = j.overruled_by_judgment_id`;

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
    FROM ${sql.unsafe(AUTHORITY_FROM)}
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
      reporter_citations: string[];
      overruled_status: string;
      overruled_by_judgment_id: string | null;
      overruled_paras: number[] | null;
      overruled_note: string | null;
      overruled_by_case_title: string | null;
      overruled_by_neutral_citation: string | null;
    }[]
  >`
    SELECT j.id, j.case_title, j.neutral_citation, j.reporter_citations, j.overruled_status,
           j.overruled_by_judgment_id, j.overruled_paras, j.overruled_note,
           r.case_title AS overruled_by_case_title,
           r.neutral_citation AS overruled_by_neutral_citation
    FROM judgments j
    LEFT JOIN judgments r ON r.id = j.overruled_by_judgment_id
    WHERE j.id = ${body.judgmentId}`;
  if (!judgment) return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  /**
   * The one refusal Lawmind enforces server-side — now keyed on the ACT rather
   * than on the label. OD-14, resolved 21 Aug 2026 on the founder's direction.
   *
   * `overruled_status = 'set_aside'` was carrying two different acts: 73
   * judgments read `set_aside` for what their own verified edge calls
   * `overruled`, because `set_aside` was the value that produced the strongest
   * warning and an overruling deserved the strongest warning. The warning was
   * right; the refusal that came attached to it was not. An overruling leaves
   * the decision between the original parties standing, and Lawmind was
   * declining to let an advocate rely on law that is still law.
   *
   * `precedential-effect.ts` holds the reasoning and the table. Only two effects
   * refuse: a genuine `set_aside`, and `review_required` — a stored adverse
   * status no verified edge accounts for, where quietly becoming addable is the
   * dangerous direction.
   *
   * The banner is UNCHANGED in every case. Nothing here weakens a warning.
   */
  const treatment = await sql<{ relationship: string }[]>`
    SELECT DISTINCT relationship
      FROM judgment_citations
     WHERE cited_judgment_id = ${body.judgmentId}
       AND relationship IN ('overruled', 'overruled_in_part', 'doubted')`;

  const effect = precedentialEffect({
    overruledStatus: judgment.overruled_status as OverruledStatus,
    inboundRelationships: treatment.map((t) => t.relationship),
  });
  const policy = precedentialPolicy(effect);

  if (policy.addToMatter === 'refuse') {
    /* Copy is licence protection, not an audit (`CLAUDE.md`): it says what the
     * advocate can act on, and for `review_required` it does not claim a set
     * aside that nothing verified. */
    const what =
      effect === 'set_aside'
        ? 'was set aside and cannot be added to a matter.'
        : 'has a recorded change of status we could not confirm, so it cannot be added to a matter yet.';
    return fail(
      c,
      'AUTHORITY_SET_ASIDE',
      effect === 'set_aside' && judgment.overruled_by_case_title
        ? `${judgment.case_title} was set aside and cannot be added to a matter. ` +
          `${judgment.overruled_by_case_title}${judgment.overruled_by_neutral_citation ? ` (${judgment.overruled_by_neutral_citation})` : ''} replaced it.`
        : `${judgment.case_title} ${what}`,
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
          reporter_citations: judgment.reporter_citations,
          added_by_user_id: row.added_by_user_id,
          added_at: row.added_at,
          removed_at: row.removed_at,
          // From the same read that just enforced the `set_aside` refusal —
          // `doubted` and `partly_set_aside` are ADDABLE and must say so on the
          // way in, not only on the next list. An authority that arrives
          // unmarked and grows a mark on refresh reads as a bug, not a warning.
          overruled_status: judgment.overruled_status,
          overruled_by_judgment_id: judgment.overruled_by_judgment_id,
          overruled_by_title: judgment.overruled_by_case_title,
          overruled_paras: judgment.overruled_paras,
          overruled_note: judgment.overruled_note,
        }),
      },
      201,
    );
  }

  // Already live. Idempotent rather than an error — the advocate's intent
  // (this authority is saved) is already satisfied.
  const [existing] = await sql<AuthorityRow[]>`
    SELECT ${sql.unsafe(AUTHORITY_COLUMNS)}
    FROM ${sql.unsafe(AUTHORITY_FROM)}
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
