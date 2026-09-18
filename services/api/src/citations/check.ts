/**
 * `GET /citations/:id` — what each verification tier actually did, and when.
 *
 * The client lane is blocked without this: the verification sheet and the
 * unverified-citation screen are both sitting on a mock because nothing returned
 * per-tier results with timestamps. `citation_checks` has held the rows all
 * along; nothing exposed them.
 *
 * **The honest part is the tiers that have not been built.** `CITATION_HARNESS.md`
 * defines four:
 *
 *   Tier 1  internal corpus       BUILT — resolves an id against `judgments`
 *   Tier 2  IndianKanoon + AWS S3 S2
 *   Tier 3  eCourts, human        S2 — advocate-vouched; distinct from authorized bulk
 *   Tier 4  say so plainly        BUILT — it is the absence of the others
 *
 * In S1 only Tier 1 runs. So this endpoint reports Tier 2 and Tier 3 as
 * `not_implemented`, with the sprint they arrive in — **never as `miss`**. Those
 * are different facts and the difference is the whole point: `miss` says we
 * looked and found nothing, `not_implemented` says we have not looked yet.
 * Rendering the second as the first would tell an advocate a citation failed
 * independent verification when no independent verification was ever attempted.
 *
 * That distinction is also what stops the coverage metric lying to us. A harness
 * that counts un-run tiers as misses reports a false confirmation rate and agrees
 * with itself — the same failure mode as a corpus that never learned an
 * overruling.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import { dateQualityOf, dateQualityState } from '../judgments/date-quality.ts';
import { toWireSourceUnsafe } from './source-strength.ts';

/** What a tier did. Never collapsed — see the module note. */
type TierStatus = 'confirmed' | 'miss' | 'not_attempted' | 'not_implemented';

type Row = {
  id: string;
  citation_claimed: string;
  judgment_id_matched: string | null;
  verification_state: string;
  verified_by_source: string;
  match_confidence: string | null;
  shown_to_user: boolean;
  overruled_status_shown: string | null;
  surface: string | null;
  created_at: string;
  case_title: string | null;
  neutral_citation: string | null;
  court: string | null;
  judgment_date: string | null;
  overruled_status: string | null;
};

/**
 * Tier 1 is the only tier with a recorded outcome in S1, and its evidence is the
 * resolved judgment id. `verified_by_source = corpus` means the id resolved
 * against our own `judgments` table, which `CITATION_HARNESS.md` step 4 treats as
 * confirmation by construction.
 */
function tierOne(r: Row): { status: TierStatus; detail: string; at: string | null } {
  if (r.verified_by_source === 'corpus' && r.judgment_id_matched) {
    return {
      status: 'confirmed',
      detail: 'resolved against the internal corpus',
      at: r.created_at,
    };
  }
  if (r.judgment_id_matched) {
    return {
      status: 'confirmed',
      detail: `resolved, recorded source ${r.verified_by_source}`,
      at: r.created_at,
    };
  }
  return {
    status: 'miss',
    detail: 'no judgment in the corpus matched this citation exactly',
    at: r.created_at,
  };
}

export async function getCitationCheck(
  c: Context,
  sql: Sql,
  id: string,
  /** The CORPUS role; defaults to `sql` so single-database use is unchanged. */
  corpusSql: Sql = sql,
): Promise<Response> {
  const [check] = await sql<
    Omit<Row, 'case_title' | 'neutral_citation' | 'court' | 'judgment_date' | 'overruled_status'>[]
  >`
    SELECT cc.id, cc.citation_claimed, cc.judgment_id_matched,
           cc.verification_state, cc.verified_by_source,
           cc.match_confidence::text AS match_confidence,
           cc.shown_to_user, cc.overruled_status_shown, cc.surface,
           ${sql.unsafe(isoColumn('cc.created_at'))} AS created_at
    FROM citation_checks cc
    WHERE cc.id = ${id}
  `;
  if (!check) return fail(c, 'NOT_FOUND', 'no citation check with that id', 404);

  /**
   * The rendered fields still come from the JUDGMENT row and never from what a
   * model typed — `CITATION_HARNESS.md` step 8, the one most often skipped. What
   * changed is only WHERE that row is read from: `citation_checks` is user-owned
   * and `judgments` is corpus-owned, so the `LEFT JOIN` becomes a second read
   * against the corpus role (NEW3 R20, `SOFT_CORPUS_REFERENCE`).
   *
   * `LEFT` is preserved in behaviour: a check with no match, or one whose match
   * the active corpus generation does not carry, still renders with null corpus
   * fields rather than 404ing. The advocate's record of the check is theirs.
   */
  const [judgment] = check.judgment_id_matched
    ? await corpusSql<
        {
          case_title: string | null;
          neutral_citation: string | null;
          court: string | null;
          judgment_date: string | null;
          overruled_status: string | null;
        }[]
      >`
        SELECT j.case_title, j.neutral_citation, j.court,
               j.judgment_date::text AS judgment_date,
               -- Read live at render, never cached. Same rule as everywhere else.
               j.overruled_status
          FROM judgments j WHERE j.id = ${check.judgment_id_matched}`
    : [];

  const r: Row = {
    ...check,
    case_title: judgment?.case_title ?? null,
    neutral_citation: judgment?.neutral_citation ?? null,
    court: judgment?.court ?? null,
    judgment_date: judgment?.judgment_date ?? null,
    overruled_status: judgment?.overruled_status ?? null,
  } as Row;

  const one = tierOne(r);
  const dateQuality = r.judgment_id_matched
    ? await dateQualityOf(corpusSql, r.judgment_id_matched)
    : null;

  return ok(c, {
    citationCheckId: r.id,
    citationClaimed: r.citation_claimed,
    checkedAt: r.created_at,
    surface: r.surface,
    /** Measures silent-drop rate. A citation not shown in any state is a failure. */
    shownToUser: r.shown_to_user,

    // The three independent fields, from the row. Never one enum.
    verificationState: r.verification_state,
    // Through the boundary, never straight from the column: the enum has seven
    // values and the contract has five. `citations/source-strength.ts`.
    verifiedBySource: toWireSourceUnsafe(r.verified_by_source),
    overruledStatus: r.overruled_status ?? r.overruled_status_shown,
    /** What the server sent when this was rendered — the stale-overruled metric. */
    overruledStatusShown: r.overruled_status_shown,
    matchConfidence: r.match_confidence === null ? null : Number(r.match_confidence),

    judgment: r.judgment_id_matched
      ? {
          judgmentId: r.judgment_id_matched,
          caseTitle: r.case_title,
          neutralCitation: r.neutral_citation,
          court: r.court,
          judgmentDate: r.judgment_date,
          /**
           * NEW2's date state for the MATCHED judgment. A citation check is the
           * surface an advocate reaches when they doubt a citation, so the one
           * thing it must not do is present a contradicted date as sound. Four
           * values, `null` = nothing has looked; the date itself is unchanged
           * and the check is not failed by it — a doubted date is a data-quality
           * fact, not a verification failure. `judgments/date-quality.ts`.
           */
          dateQuality,
          /**
           * The same fact named rather than absent — R8.3 §5.5. `null` on the
           * wire could not be told apart from "this route does not carry it",
           * and 96.19% of the corpus is in that state.
           */
          dateQualityState: dateQualityState(dateQuality),
        }
      : null,

    tiers: [
      { tier: 1, source: 'corpus', ...one },
      {
        tier: 2,
        source: 'public_x2',
        status: 'not_implemented' as TierStatus,
        detail: 'IndianKanoon and AWS S3 cross-reference ships in S2',
        at: null,
      },
      {
        tier: 3,
        source: 'ecourts',
        status: 'not_implemented' as TierStatus,
        detail:
          'eCourts human confirmation ships in S2. Authorized bulk observations use ecourts_bulk and cannot impersonate this tier',
        at: null,
      },
    ],

    /**
     * Said in words, because the client should not have to infer it from an
     * array. Tiers 2 and 3 have not run, so "unverified" here means "unconfirmed
     * by the only tier that exists yet" — not "checked everywhere and failed".
     */
    coverage: {
      tiersImplemented: 1,
      tiersDefined: 3,
      note: 'Only Tier 1 (internal corpus) runs in S1. An unverified citation has not been checked against an independent source yet — it has not failed one.',
    },
    asOf: new Date().toISOString(),
  });
}
