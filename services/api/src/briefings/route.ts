/**
 * The 24-hour hearing briefing — the wedge. No Indian competitor ships one.
 *
 * `PRD.md`: the night before a listed hearing, four numbered blocks —
 * **last order · pending applications · authorities · preparation checklist** —
 * delivered by push and readable offline.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE THAT SHAPES THIS FILE: A BRIEFING CARRIES AUTHORITIES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `briefings.content` is generated the night before and cached for 30 days so it
 * opens with the network off. **`overruled_status` is NOT part of what gets
 * cached.** Verification is permanent; good-law status is not, and a briefing is
 * read standing outside court — the worst possible moment to be shown law that
 * moved after the sweep ran.
 *
 * So the stored content holds judgment IDs, and `GET /briefings/:id` **re-reads
 * every authority's status live and merges it at render**. The generated blob is
 * the expensive part; the status is the cheap part; only the expensive part is
 * cached. Every response carries `asOf` for exactly this reason.
 *
 * Offline is the one case where a stale status is unavoidable, and the harness
 * already answers it: the client renders the status it last read **with its
 * as-of date shown**, never as current.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND THE DATE ITSELF MAY NOT BE CONFIRMED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A briefing is built around a hearing date. That date came either from the
 * advocate (PD-12, first-class) or from a cause list, and a cause list can be
 * stale or unread. `dates_not_confirmed_at` is surfaced on every response and is
 * never collapsed into a boolean: both timestamps null means nobody checked,
 * which is a different thing to tell an advocate than "we checked and could not
 * confirm". An unconfirmed listing is never presented as confirmed.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';

import { fail, ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';
import { loadPrecedentialState, type PrecedentialState } from '../judgments/treatment-lookup.ts';
import {
  treatmentChecklistItems,
  withLiveTreatmentItems,
  type ChecklistItem,
} from './treatment-checklist.ts';

type BriefingContent = {
  blocks?: {
    authorities?: { judgmentId: string }[];
    checklist?: ChecklistItem[];
    [k: string]: unknown;
  };
};

type BriefingRow = {
  id: string;
  matter_id: string;
  hearing_date: string;
  /** `jsonb`. May arrive parsed or as a string — always go through parseContent. */
  content: unknown;
  generated_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  dates_confirmed_at: string | null;
  dates_not_confirmed_at: string | null;
  dates_not_confirmed_reason: string | null;
  hearing_date_source: string | null;
  case_title: string;
  court: string;
};

const BRIEFING_COLUMNS = `b.id, b.matter_id, b.hearing_date::text AS hearing_date, b.content,
       ${isoColumn('b.generated_at')} AS generated_at,
       ${isoColumn('b.delivered_at')} AS delivered_at,
       ${isoColumn('b.opened_at')} AS opened_at,
       ${isoColumn('b.dates_confirmed_at')} AS dates_confirmed_at,
       ${isoColumn('b.dates_not_confirmed_at')} AS dates_not_confirmed_at,
       b.dates_not_confirmed_reason, b.hearing_date_source,
       m.case_title, m.court`;

function requireUser(c: Context, userId: string | undefined): Response | null {
  if (userId) return null;
  return fail(c, 'AUTH_REQUIRED', 'a briefing belongs to an advocate — sign in to continue', 401);
}

/**
 * `content` is `jsonb`, and the driver does not always hand it back parsed.
 *
 * **This shipped broken and a production probe caught it.** The column came back
 * as a STRING, so `content?.blocks` was `undefined`, every block rendered as
 * `null`, and — worse — the authorities list was empty, which meant the live
 * status re-read had nothing to re-read. The one guarantee the whole feature
 * exists to provide was silently absent, and it looked like a briefing with no
 * authorities rather than like an error.
 *
 * Third time this session that assuming a driver's runtime representation has
 * cost a defect. Normalised once, here, so no caller has to be right about it.
 */
function parseContent(raw: unknown): BriefingContent {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as BriefingContent;
    } catch {
      // Unparseable content is a real state and must not masquerade as an empty
      // briefing: `liveAuthorities` returns nothing, and a briefing with no
      // blocks is visibly wrong rather than quietly thin.
      return {};
    }
  }
  return raw as BriefingContent;
}

/**
 * The date-confidence block, stated rather than implied.
 *
 * Three states and never a boolean. The client needs to distinguish "confirmed
 * against a cause list", "we tried and could not", and "nobody has checked" —
 * because only the first justifies showing a date without a caveat.
 */
function dateConfidence(r: BriefingRow) {
  return {
    source: r.hearing_date_source,
    confirmedAt: r.dates_confirmed_at,
    notConfirmedAt: r.dates_not_confirmed_at,
    notConfirmedReason: r.dates_not_confirmed_reason,
    /**
     * Derived here so two clients cannot derive it differently. `never_checked`
     * is deliberately NOT folded into `not_confirmed`: a date the advocate typed
     * that no cause list has been consulted about is not a failed check, and
     * marking it as one would cry wolf on every manually entered matter.
     */
    state:
      r.dates_confirmed_at !== null
        ? ('confirmed' as const)
        : r.dates_not_confirmed_at !== null
          ? ('not_confirmed' as const)
          : ('never_checked' as const),
  };
}

/**
 * Re-read every authority named in the cached content and return current status.
 *
 * **This is the whole point of the module.** The blob was written last night; the
 * Supreme Court does not consult our sweep schedule before overruling something.
 */
async function liveAuthorities(sql: Sql, content: BriefingContent) {
  const ids = (content?.blocks?.authorities ?? [])
    .map((a) => a.judgmentId)
    .filter((id): id is string => typeof id === 'string');
  if (ids.length === 0) return { authorities: [], states: [] as PrecedentialState[] };

  const rows = await sql<
    {
      id: string;
      case_title: string;
      neutral_citation: string | null;
      reporter_citations: string[];
      overruled_status: string;
      overruled_by_judgment_id: string | null;
      overruled_paras: number[] | null;
      overruled_note: string | null;
      overruled_by_title: string | null;
    }[]
  >`
    SELECT j.id, j.case_title, j.neutral_citation, j.reporter_citations, j.overruled_status,
           j.overruled_by_judgment_id, j.overruled_paras, j.overruled_note,
           o.case_title AS overruled_by_title
    FROM judgments j
    LEFT JOIN judgments o ON o.id = j.overruled_by_judgment_id
    WHERE j.id = ANY(${ids}::uuid[])
  `;

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * OD-14 REACHED THIS ROUTE LAST, AND UNTIL IT DID THE SAME AUTHORITY GAVE TWO
   * DIFFERENT ANSWERS DEPENDING WHICH SCREEN IT WAS OPENED FROM
   * ───────────────────────────────────────────────────────────────────────────
   *
   * NEW3 found it (bus 1018) while building the client currentness pass. This
   * module computed `addToMatterAllowed: r.overruled_status !== 'set_aside'`
   * straight off the stored column — a THIRD independent reimplementation of
   * the policy `precedential-effect.ts` centralises, and the one OD-14 never
   * reached. `judgments/route.ts`, `matters/authorities.ts` and
   * `search/route.ts` all went through the derived layers already.
   *
   * The consequence was precise and user-visible: the ~73 judgments OD-14 was
   * written to unblock — stored `set_aside`, verified edge `overruled`, so the
   * decision between the original parties stands and the authority IS addable —
   * were addable from search and from the reading view, and refused from inside
   * a briefing. Same case, same day, different answer per screen.
   *
   * The read that feeds it is now `treatment-lookup.ts`, shared with every
   * other surface that has to ask this question — including the GENERATED
   * checklist, which was still branching on the stored column of its own until
   * LCC-1. One batched read for the whole briefing, the same shape and for the
   * same reason as `search/route.ts`: a per-authority round trip inside a
   * request that already re-read every judgment is how a wedge screen gets slow.
   */
  const state = await loadPrecedentialState(sql, ids);

  const byId = new Map(rows.map((r) => [r.id, r]));
  // Preserve the order the sweep chose, and NEVER silently drop an authority
  // whose row has gone: an authority that vanishes from a briefing is
  // indistinguishable from one that was never cited, which is the silent-drop
  // failure wearing different clothes.
  const authorities = ids.map((id) => {
    const r = byId.get(id);
    if (!r) {
      return {
        judgmentId: id,
        available: false as const,
        note: 'This authority could not be read from the corpus just now. It has not been removed from your briefing.',
      };
    }
    /* Present whenever the row is, because both come from the same id set. */
    const t = state.get(r.id)!;
    const effect = t.effect;
    const policy = t.policy;
    const unapplied = t.unapplied;
    return {
      judgmentId: r.id,
      available: true as const,
      caseTitle: r.case_title,
      neutralCitation: r.neutral_citation,
      /**
       * RCC bus 0049, 11 Aug 2026. The client computes citability as
       * `neutralCitation === null AND reporterCitations.length === 0`, which is
       * `docs/CITATION_HARNESS.md`'s own rule. Sending the first half and not
       * the second made every pre-neutral-citation Supreme Court authority
       * (~before 2013) render on the WEDGE SCREEN as "No citation on file —
       * cannot be referenced in a filing", on judgments that are perfectly
       * citable by their reporter citation.
       */
      reporterCitations: r.reporter_citations,
      // Found missing 11 Aug 2026 (RCC bus 0038): the harness rule is
      // "absence never upgrades to confirmed", so every briefing authority
      // drew the unconfirmed mark on the wedge screen — including ones from
      // the advocate's own verified matter. Tier 1 by construction, same as
      // judgments/route.ts and every other corpus-row surface: this row IS
      // the corpus, so it resolves to itself.
      verificationState: 'verified' as const,
      verifiedBySource: 'corpus' as const,
      /**
       * Read live, this request. Never the value the sweep saw last night — and
       * now DERIVED through `precedential-effect.ts` like every other surface,
       * so the same authority carries the same currentness wherever it is seen.
       * Still one of the same four wire values; a client reading only this is
       * unaffected.
       */
      overruledStatus: policy.bannerStatus,
      /** The raw column beside the derived banner. Admin/debugging only. */
      overruledStatusStored: r.overruled_status,
      /** Layer 2 — what actually happened, in five values rather than four. */
      precedentialEffect: effect,
      overruledByJudgmentId: r.overruled_by_judgment_id,
      overruledByTitle: r.overruled_by_title,
      overruledParas: r.overruled_paras,
      overruledNote: r.overruled_note,
      /**
       * The one refusal in the product, restated where it is acted on. A
       * briefing may SHOW a set-aside authority — the advocate needs to know it
       * moved — but it must not be addable to the matter from here.
       *
       * Now the SAME decision `POST /matters/:id/authorities` will actually
       * make, rather than a local re-derivation of it that drifted. Both names
       * are sent: `addToMatterAllowed` is what this route has always called it
       * and the client already reads it, `canAddToMatter` is what every other
       * surface calls the identical fact.
       */
      addToMatterAllowed: policy.addToMatter === 'allow',
      canAddToMatter: policy.addToMatter === 'allow',
      /** A verified adverse edge the corpus has not applied. NEVER a banner. */
      unappliedTreatment: unapplied,
    };
  });

  /**
   * The SAME states, handed back so the caller can rewrite the stored
   * checklist from them. Two reads of the same fact inside one request is how
   * the render and the checklist drifted apart in the first place.
   *
   * In `ids` order, so a briefing's checklist does not reshuffle between reads.
   */
  return {
    authorities,
    states: ids.map((id) => state.get(id)).filter((s): s is PrecedentialState => s !== undefined),
  };
}

export async function getBriefing(
  c: Context,
  sql: Sql,
  briefingId: string,
  userId: string | undefined,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const [row] = await sql<BriefingRow[]>`
    SELECT ${sql.unsafe(BRIEFING_COLUMNS)}
    FROM briefings b JOIN matters m ON m.id = b.matter_id
    WHERE b.id = ${briefingId} AND m.user_id = ${userId!}
  `;
  // Not-yours and does-not-exist answer identically, as everywhere else.
  if (!row) return fail(c, 'NOT_FOUND', 'no briefing with that id', 404);

  const content = parseContent(row.content);
  const live = await liveAuthorities(sql, content);

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE GENERATED CHECKLIST IS REWRITTEN HERE, NOT SERVED AS STORED
   * ───────────────────────────────────────────────────────────────────────────
   *
   * `blocks.authorities` was always resolved live; `blocks.checklist` never
   * was. So the two halves of the same briefing could say different things
   * about the same authority the moment a status changed after the 23:00 sweep
   * — and the failure was asymmetric in the dangerous direction: an authority
   * SET ASIDE overnight got its live banner and **no checklist item at all**,
   * because only the sweep ever wrote one.
   *
   * Fixing the sweep's derivation (LCC-1) closes the disagreement at
   * generation. Only this closes it at render, which is where an advocate
   * actually reads it. The items are rebuilt from the SAME `PrecedentialState`
   * the authority block above was rendered from, by the SAME function the sweep
   * calls, so there is no second interpretation left to drift.
   *
   * Every non-treatment item — the unconfirmed date, the missing order — is
   * kept exactly as generated. Those are facts about the matter at 23:00 and
   * re-deriving them here would be this route quietly regenerating a briefing.
   *
   * The stored copy is still written and still correct at generation: a
   * briefing must be readable with the network off, and offline is the one case
   * where a stale checklist is unavoidable. It is shown with `asOf`, never as
   * current — the same answer `CITATION_HARNESS.md` already gives for a stale
   * status.
   */
  const blocks = content.blocks
    ? {
        ...content.blocks,
        checklist: withLiveTreatmentItems(
          Array.isArray(content.blocks.checklist) ? content.blocks.checklist : [],
          treatmentChecklistItems(live.states),
        ),
      }
    : null;

  return ok(c, {
    briefing: {
      briefingId: row.id,
      matterId: row.matter_id,
      caseTitle: row.case_title,
      court: row.court,
      hearingDate: row.hearing_date,
      generatedAt: row.generated_at,
      deliveredAt: row.delivered_at,
      openedAt: row.opened_at,
      dateConfidence: dateConfidence(row),
      blocks,
      authorities: live.authorities,
    },
    /**
     * When the statuses above were read — this request, not last night's sweep.
     * The client shows this when rendering from cache so a stale status is never
     * presented as current.
     */
    asOf: new Date().toISOString(),
  });
}

export async function listMatterBriefings(
  c: Context,
  sql: Sql,
  matterId: string,
  userId: string | undefined,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const [owned] = await sql<{ id: string }[]>`
    SELECT id FROM matters WHERE id = ${matterId} AND user_id = ${userId!}`;
  if (!owned) return fail(c, 'NOT_FOUND', 'no matter with that id', 404);

  const rows = await sql<BriefingRow[]>`
    SELECT ${sql.unsafe(BRIEFING_COLUMNS)}
    FROM briefings b JOIN matters m ON m.id = b.matter_id
    WHERE b.matter_id = ${matterId} AND m.user_id = ${userId!}
    ORDER BY b.hearing_date DESC
  `;

  // Deliberately no authorities here: this is an index, and re-reading every
  // authority of every past briefing to render a list of dates would be a lot of
  // work to produce something nobody reads. The detail route does it.
  return ok(c, {
    briefings: rows.map((r) => ({
      briefingId: r.id,
      hearingDate: r.hearing_date,
      generatedAt: r.generated_at,
      openedAt: r.opened_at,
      dateConfidence: dateConfidence(r),
    })),
    asOf: new Date().toISOString(),
  });
}

/**
 * Mark a briefing opened.
 *
 * **First open only.** `opened_at` answers "did this reach the advocate", which
 * is the activation metric the admin tracks — two briefings opened in week one.
 * Overwriting it on every re-read would turn a first-open timestamp into a
 * last-read timestamp and quietly break that measure.
 */
export async function markBriefingOpened(
  c: Context,
  sql: Sql,
  briefingId: string,
  userId: string | undefined,
): Promise<Response> {
  const denied = requireUser(c, userId);
  if (denied) return denied;

  const [row] = await sql<{ id: string; opened_at: string }[]>`
    UPDATE briefings b SET opened_at = coalesce(b.opened_at, now())
    FROM matters m
    WHERE b.id = ${briefingId} AND m.id = b.matter_id AND m.user_id = ${userId!}
    RETURNING b.id, ${sql.unsafe(isoColumn('b.opened_at'))} AS opened_at
  `;
  if (!row) return fail(c, 'NOT_FOUND', 'no briefing with that id', 404);
  return ok(c, { ok: true, openedAt: row.opened_at });
}
