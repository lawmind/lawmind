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

type BriefingContent = { blocks?: { authorities?: { judgmentId: string }[] } };

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
  if (ids.length === 0) return [];

  const rows = await sql<
    {
      id: string;
      case_title: string;
      neutral_citation: string | null;
      overruled_status: string;
      overruled_by_judgment_id: string | null;
      overruled_paras: number[] | null;
      overruled_note: string | null;
      overruled_by_title: string | null;
    }[]
  >`
    SELECT j.id, j.case_title, j.neutral_citation, j.overruled_status,
           j.overruled_by_judgment_id, j.overruled_paras, j.overruled_note,
           o.case_title AS overruled_by_title
    FROM judgments j
    LEFT JOIN judgments o ON o.id = j.overruled_by_judgment_id
    WHERE j.id = ANY(${ids}::uuid[])
  `;

  const byId = new Map(rows.map((r) => [r.id, r]));
  // Preserve the order the sweep chose, and NEVER silently drop an authority
  // whose row has gone: an authority that vanishes from a briefing is
  // indistinguishable from one that was never cited, which is the silent-drop
  // failure wearing different clothes.
  return ids.map((id) => {
    const r = byId.get(id);
    if (!r) {
      return {
        judgmentId: id,
        available: false as const,
        note: 'This authority could not be read from the corpus just now. It has not been removed from your briefing.',
      };
    }
    return {
      judgmentId: r.id,
      available: true as const,
      caseTitle: r.case_title,
      neutralCitation: r.neutral_citation,
      /** Read live, this request. Never the value the sweep saw last night. */
      overruledStatus: r.overruled_status,
      overruledByJudgmentId: r.overruled_by_judgment_id,
      overruledByTitle: r.overruled_by_title,
      overruledParas: r.overruled_paras,
      overruledNote: r.overruled_note,
      /**
       * The one refusal in the product, restated where it is acted on. A
       * briefing may SHOW a set-aside authority — the advocate needs to know it
       * moved — but it must not be addable to the matter from here.
       */
      addToMatterAllowed: r.overruled_status !== 'set_aside',
    };
  });
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
      blocks: content.blocks ?? null,
      authorities: await liveAuthorities(sql, content),
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
