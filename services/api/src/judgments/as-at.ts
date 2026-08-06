/**
 * `GET /judgments/:id/authorities` — was each authority this judgment relied on
 * still good law **on the day this judgment was delivered**?
 *
 * A competitor ships an "audit the order against the legal context that existed
 * up to the day it was passed" tool. That framing is right and the hard part is
 * temporal: current overruled status answers *is this good law now*, which is a
 * different question from *was it good law then*, and only the second one tells
 * you whether a bench relied on something that had already fallen.
 *
 * We can answer it because `judgments.overruled_status_changed_at` exists.
 * `docs/SCHEMA_TRUTH.md` records why it was added — to separate "a badge that was
 * wrong when rendered" from "one the world invalidated afterwards" — and that is
 * exactly the discriminator needed here.
 *
 * **This states facts, never a rating.** It does not score a judgment's soundness
 * or grade its reasoning: those cannot be sourced to a primary record and are the
 * same class of claim `docs/FEATURE_PARITY.md` §4 declines. What it says is
 * checkable and carries two judgment ids: *this judgment relied on X, and X had
 * already been overruled by Y, N days earlier.*
 *
 * The honest cases matter as much as the alarming one:
 *
 *   `good_law_then`   the authority stood when it was relied on
 *   `already_moved`   it had already fallen — the finding that matters
 *   `moved_since`     it stood then and has fallen since. NOT a criticism of the
 *                     bench; it is what an advocate citing this judgment today
 *                     needs to know
 *   `unknown`         we hold no dated status. Said plainly, never guessed
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';

import { fail, ok } from '../envelope.ts';

type Row = {
  cited_id: string;
  case_title: string;
  neutral_citation: string | null;
  judgment_date: string;
  relationship: string;
  overruled_status: string;
  changed_at: string | null;
  overruled_by_judgment_id: string | null;
};

export async function getAuthoritiesAsAt(c: Context, sql: Sql, id: string): Promise<Response> {
  const [subject] = await sql<{ id: string; case_title: string; judgment_date: string }[]>`
    SELECT id, case_title, judgment_date::text AS judgment_date
    FROM judgments WHERE id = ${id}
  `;
  if (!subject) return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  const rows = await sql<Row[]>`
    SELECT cited.id AS cited_id, cited.case_title, cited.neutral_citation,
           cited.judgment_date::text AS judgment_date,
           c.relationship, cited.overruled_status,
           cited.overruled_status_changed_at::text AS changed_at,
           cited.overruled_by_judgment_id
    FROM judgment_citations c
    JOIN judgments cited ON cited.id = c.cited_judgment_id
    WHERE c.citing_judgment_id = ${id} AND c.cited_judgment_id IS NOT NULL
    ORDER BY cited.judgment_date DESC
  `;

  const deliveredAt = new Date(subject.judgment_date).getTime();

  const authorities = rows.map((r) => {
    let standing: 'good_law_then' | 'already_moved' | 'moved_since' | 'unknown';
    let daysBefore: number | null = null;

    if (r.overruled_status === 'none') {
      standing = 'good_law_then';
    } else if (!r.changed_at) {
      // The status moved but we do not know when. Saying "already_moved" would
      // assert a date we do not hold; saying "good_law_then" would hide a real
      // change. Neither is honest, so this is its own state.
      standing = 'unknown';
    } else {
      const movedAt = new Date(r.changed_at).getTime();
      if (movedAt <= deliveredAt) {
        standing = 'already_moved';
        daysBefore = Math.floor((deliveredAt - movedAt) / 86_400_000);
      } else {
        standing = 'moved_since';
      }
    }

    return {
      judgmentId: r.cited_id,
      caseTitle: r.case_title,
      neutralCitation: r.neutral_citation,
      judgmentDate: r.judgment_date,
      relationship: r.relationship,
      standingWhenRelied: standing,
      /** Days between the authority falling and this judgment relying on it. */
      daysAlreadyMoved: daysBefore,
      overruledStatus: r.overruled_status,
      overruledByJudgmentId: r.overruled_by_judgment_id,
      statusChangedAt: r.changed_at,
      verificationState: 'verified' as const,
      verifiedBySource: 'corpus' as const,
      asOf: new Date().toISOString(),
    };
  });

  const tally = (s: string) => authorities.filter((a) => a.standingWhenRelied === s).length;

  return ok(c, {
    judgmentId: subject.id,
    caseTitle: subject.case_title,
    deliveredOn: subject.judgment_date,
    asOf: new Date().toISOString(),
    counts: {
      goodLawThen: tally('good_law_then'),
      alreadyMoved: tally('already_moved'),
      movedSince: tally('moved_since'),
      unknown: tally('unknown'),
    },
    authorities,
    /**
     * Resolvable authorities only. A citation we could not resolve to a corpus
     * judgment cannot be dated, so it is counted rather than quietly omitted —
     * a coverage figure the client can state instead of implying completeness.
     */
    resolvedAuthorities: authorities.length,
  });
}
