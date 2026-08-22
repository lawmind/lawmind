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
 * **The date this turns on is the OVERRULING JUDGMENT'S OWN DATE.** Both sides of
 * the comparison are court records: the day this bench delivered, and the day the
 * bench that overruled the authority delivered.
 *
 * > This module originally compared against `overruled_status_changed_at`, and
 * > the comment here claimed that column was "exactly the discriminator needed".
 * > **It was the wrong column and the claim was false.** That timestamp records
 * > when *we* wrote the row — `overruled-cli.ts` sets it to `now()` during the
 * > back-fill — so every authority appeared to have moved after every judgment
 * > that cited it. `already_moved` was 0 corpus-wide and would have stayed 0.
 * >
 * > The client lane caught it on production: *Balwinder Singh (Binda) v. NCB*
 * > (2023-09-22) relied on *Kanhaiyalal*, set aside by *Tofan Singh* on
 * > 2020-10-29 — already gone by 1,058 days, and this endpoint called it
 * > `moved_since`. **That is not a shade of the same thing.** `moved_since` says
 * > the law changed under a bench that could not have known, which is
 * > unremarkable and true of a great deal of good law. `already_moved` says the
 * > bench relied on an authority that had been dead for three years. Rendering
 * > the first where the second is true tells an advocate the opposite of the
 * > fact.
 *
 * `overruled_status_changed_at` still exists and is still right for what
 * `SCHEMA_TRUTH.md` added it for — telling a badge that was wrong when rendered
 * from one the world invalidated afterwards. It is a fact about our database, not
 * a fact about the law, and it must never be used to date a legal event.
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
 *   `overruled_here`  **this judgment is the one that moved it**
 *   `moved_since`     it stood then and has fallen since. NOT a criticism of the
 *                     bench; it is what an advocate citing this judgment today
 *                     needs to know
 *   `unknown`         we hold no dated status. Said plainly, never guessed
 *
 * `overruled_here` exists because of a measurement, not a hunch. Cross-checking
 * every citation of a moved authority in the corpus — 99 edges — found that **22
 * of the 48 that date as "already moved" are the overruling judgment citing the
 * authority it overrules.** Tofan Singh reciting Kanhaiyalal. Navtej Singh Johar
 * reciting Suresh Kumar Koushal. Vidya Drolia, Sita Soren, Joseph Shine, Vineeta
 * Sharma, Puttaswamy — the landmarks, every one.
 *
 * Labelling those `already_moved` says a bench relied on dead law when the bench
 * is the one that killed it. It is the most misleading answer available on
 * exactly the judgments an advocate is most likely to open.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

type Row = {
  cited_id: string;
  case_title: string;
  neutral_citation: string | null;
  judgment_date: string;
  relationship: string;
  overruled_status: string;
  changed_at: string | null;
  overruled_by_judgment_id: string | null;
  /** The overruling judgment's OWN delivery date. The fact this endpoint turns on. */
  overruled_on: string | null;
  overruled_by_title: string | null;
  /** NEW2's `judgment_date_quality`. NULL means nothing has looked. */
  overruler_date_state: string | null;
  cited_date_state: string | null;
};

export async function getAuthoritiesAsAt(c: Context, sql: Sql, id: string): Promise<Response> {
  const [subject] = await sql<
    { id: string; case_title: string; judgment_date: string; date_state: string | null }[]
  >`
    SELECT j.id, j.case_title, j.judgment_date::text AS judgment_date,
           -- NULL means NOTHING HAS LOOKED, which is a different fact from
           -- DATE_UNKNOWN (looked, found no independent witness). NEW2's
           -- migration 0072 keeps them apart and so does this.
           q.state AS date_state
      FROM judgments j
      LEFT JOIN judgment_date_quality q ON q.judgment_id = j.id
     WHERE j.id = ${id}
  `;
  if (!subject) return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  const rows = await sql<Row[]>`
    SELECT cited.id AS cited_id, cited.case_title, cited.neutral_citation,
           cited.judgment_date::text AS judgment_date,
           c.relationship, cited.overruled_status,
           ${sql.unsafe(isoColumn('cited.overruled_status_changed_at'))} AS changed_at,
           cited.overruled_by_judgment_id,
           -- The overruling bench's own delivery date, not our write time.
           overruler.judgment_date::text AS overruled_on,
           overruler.case_title AS overruled_by_title,
           -- The date states of the TWO dates this endpoint subtracts.
           oq.state AS overruler_date_state,
           cq.state AS cited_date_state
    FROM judgment_citations c
    JOIN judgments cited ON cited.id = c.cited_judgment_id
    -- LEFT: an authority can carry a status with no overruling judgment
    -- recorded, and that case must reach the unknown state rather than vanish.
    LEFT JOIN judgments overruler ON overruler.id = cited.overruled_by_judgment_id
    LEFT JOIN judgment_date_quality oq ON oq.judgment_id = overruler.id
    LEFT JOIN judgment_date_quality cq ON cq.judgment_id = cited.id
    WHERE c.citing_judgment_id = ${id} AND c.cited_judgment_id IS NOT NULL
    ORDER BY cited.judgment_date DESC
  `;

  const deliveredAt = new Date(subject.judgment_date).getTime();

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * A CONTRADICTED DATE MAY NOT DECIDE A TEMPORAL CLAIM
   * ───────────────────────────────────────────────────────────────────────────
   *
   * This endpoint's entire output is a SUBTRACTION between two dates, and NEW2
   * measured that 4.45% of the corpus carries a date some independent witness
   * contradicts (`judgment_date_quality`, migration 0072). On those rows the
   * difference between `already_moved` — *this bench relied on an authority that
   * had been dead for three years* — and `moved_since` — unremarkable, and true
   * of a great deal of good law — turns on a date we have reason to doubt. The
   * module note above already records what happened the last time this endpoint
   * dated a legal event with the wrong column: it told an advocate the opposite
   * of the fact.
   *
   * So `DATE_SUSPECT` on EITHER side of the comparison REFUSES the claim rather
   * than qualifying it in prose a client may not render.
   *
   * **`DATE_UNKNOWN` and an absent row do NOT refuse**, and that distinction is
   * NEW2's rather than a convenience: `DATE_UNKNOWN` means we looked and found
   * no independent witness, an absent row means nothing has looked, and *silence
   * is not a contradiction*. Refusing on those would refuse a quarter of the
   * corpus on the strength of nobody having checked — the `is_bail_order` NULL
   * failure this repository has already paid for once.
   *
   * `judgments.judgment_date` is never rewritten. The state is published beside
   * it and the derived claim steps aside.
   */
  const dateContradicted = (state: string | null | undefined) => state === 'DATE_SUSPECT';
  const subjectDateSuspect = dateContradicted(subject.date_state);

  const authorities = rows.map((r) => {
    let standing:
      | 'good_law_then'
      | 'already_moved'
      | 'overruled_here'
      | 'moved_since'
      | 'date_unreliable'
      | 'unknown';
    let daysBefore: number | null = null;

    if (r.overruled_status === 'none') {
      standing = 'good_law_then';
    } else if (r.overruled_by_judgment_id === subject.id) {
      // This judgment IS the overruling one. Checked before any date comparison,
      // because the dates are necessarily equal and would otherwise fall through
      // to `already_moved` — see the module note.
      standing = 'overruled_here';
    } else if (!r.overruled_on) {
      // The status moved but no overruling judgment is recorded, so we hold no
      // date for the legal event. Saying "already_moved" would assert a date we
      // do not have; "good_law_then" would hide a real change. Neither is
      // honest, so this is its own state — and NOT a fallback to
      // `overruled_status_changed_at`, which would date the law by our write.
      standing = 'unknown';
    } else if (subjectDateSuspect || dateContradicted(r.overruler_date_state)) {
      // One of the two dates being subtracted is actively contradicted by a
      // witness. The ORDERING is the claim, and we cannot make it.
      standing = 'date_unreliable';
    } else {
      const movedOn = new Date(r.overruled_on).getTime();
      if (movedOn <= deliveredAt) {
        standing = 'already_moved';
        daysBefore = Math.floor((deliveredAt - movedOn) / 86_400_000);
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
      /**
       * The overruling judgment's own delivery date and title — the two facts
       * `standingWhenRelied` is derived from, sent so the client can show the
       * working rather than trust the label. Both are `judgments` rows.
       */
      overruledOn: r.overruled_on,
      overruledByCaseTitle: r.overruled_by_title,
      /**
       * The quality of the dates this row's `standingWhenRelied` rests on.
       *
       * Three distinct values and a null, never collapsed: `DATE_VERIFIED` (the
       * document prints the stored date), `DATE_SUSPECT` (a witness contradicts
       * it), `DATE_UNKNOWN` (looked, found no independent witness), and `null` —
       * nothing has looked. A client showing its working needs all four apart; a
       * client reading only `standingWhenRelied` sees `date_unreliable` and
       * needs nothing else.
       */
      dateQuality: {
        cited: r.cited_date_state,
        overruler: r.overruler_date_state,
        subject: subject.date_state,
      },
      /**
       * When OUR row changed, not when the law did. Kept for the stale-badge
       * metric in `SCHEMA_TRUTH.md` and for nothing else. **Never date a legal
       * event with this** — doing exactly that is what made `already_moved` read
       * 0 corpus-wide.
       */
      statusRecordedAt: r.changed_at,
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
      /** Authorities THIS judgment overruled. Not a criticism of it — its holding. */
      overruledHere: tally('overruled_here'),
      movedSince: tally('moved_since'),
      /**
       * Authorities whose standing could not be dated because one of the two
       * dates is CONTRADICTED by an independent witness. Counted separately
       * from `unknown` on purpose: `unknown` means we hold no date for the
       * legal event at all, this means we hold one and do not trust it. Rolling
       * them together would hide a data-quality problem inside a coverage gap.
       */
      dateUnreliable: tally('date_unreliable'),
      unknown: tally('unknown'),
    },
    /**
     * The subject judgment's own date state — it is one half of every
     * subtraction on this page, so a suspect value here disqualifies the whole
     * response rather than individual rows.
     */
    deliveredOnDateState: subject.date_state,
    authorities,
    /**
     * Resolvable authorities only. A citation we could not resolve to a corpus
     * judgment cannot be dated, so it is counted rather than quietly omitted —
     * a coverage figure the client can state instead of implying completeness.
     */
    resolvedAuthorities: authorities.length,
  });
}
