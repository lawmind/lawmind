/**
 * Assembling a 24-hour briefing — the four blocks from `PRD.md`:
 * **last order · pending applications · authorities · preparation checklist.**
 *
 * Called by the nightly sweep (23:00 IST, `DEPLOYMENT.md` §cron job order), and
 * written as a plain function rather than a route because generation is a cron
 * concern and nothing in the contract exposes it. The read side is `route.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FUNCTION IS NOT ALLOWED TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It never writes `overruled_status` into the stored blob.** Only judgment IDs
 * go in. The status is re-read at every render — see `route.ts`. A briefing is
 * read standing outside court, and a status frozen at 23:00 last night is exactly
 * the stale-overruled failure the harness grades as severely as a hallucination.
 *
 * **It never composes legal advice.** The checklist is derived from the state of
 * the matter — a date nobody confirmed, an authority that has been set aside, a
 * hearing with no order recorded — and every item points at something the
 * advocate can check. It does not suggest arguments, and no model is called
 * anywhere in this file.
 *
 * **It never invents a block it has no data for.** An empty block says it is
 * empty. "No order has been recorded on this matter" is useful; a fabricated
 * summary is a liability, and an omitted block reads as "nothing to report" when
 * it may mean "we never looked".
 */
import type { Sql } from 'postgres';

import { isoColumn } from '../iso-time.ts';
import { loadPrecedentialState } from '../judgments/treatment-lookup.ts';
import { treatmentChecklistItems } from './treatment-checklist.ts';

export type BriefingBlocks = {
  lastOrder: {
    present: boolean;
    eventId?: string;
    eventDate?: string;
    orderText?: string;
    note?: string;
  };
  pendingApplications: {
    count: number;
    items: { eventId: string; eventDate: string; description: string }[];
    note?: string;
  };
  /** IDs only. Status is resolved live at render — never stored here. */
  authorities: { judgmentId: string; addedAt: string; paragraphNumber: number | null }[];
  checklist: { id: string; text: string; basis: string }[];
};

export type AssembledBriefing = {
  matterId: string;
  hearingDate: string;
  blocks: BriefingBlocks;
};

/**
 * Build the four blocks for one matter and one hearing date.
 *
 * Reads only. Nothing is written until `persistBriefing`.
 */
export async function assembleBriefing(
  sql: Sql,
  matterId: string,
  hearingDate: string,
): Promise<AssembledBriefing | null> {
  const [matter] = await sql<
    { id: string; case_title: string; court: string; next_hearing_date: string | null }[]
  >`
    SELECT id, case_title, court, next_hearing_date::text AS next_hearing_date
    FROM matters WHERE id = ${matterId}`;
  if (!matter) return null;

  // ---- block 1: last order ------------------------------------------------
  // The court record, not our summary of it. `order_text` is what was recorded;
  // it travels to a share, unlike notes (PD-4).
  const [lastOrder] = await sql<{ id: string; event_date: string; order_text: string | null }[]>`
    SELECT id, event_date::text AS event_date, order_text
    FROM matter_events
    WHERE matter_id = ${matterId} AND event_type = 'order' AND order_text IS NOT NULL
    ORDER BY event_date DESC, created_at DESC LIMIT 1`;

  // ---- block 2: pending applications --------------------------------------
  // A filing with no order recorded after it. Deliberately date-based and
  // conservative: it can over-report where an order was disposed of but never
  // entered, and over-reporting is the safe direction — an advocate reminded of
  // a filing that was already decided loses a moment, one who is not reminded of
  // a live application loses the point.
  const pending = await sql<
    { id: string; event_date: string; order_text: string | null; notes: string | null }[]
  >`
    SELECT f.id, f.event_date::text AS event_date, f.order_text, f.notes
    FROM matter_events f
    WHERE f.matter_id = ${matterId} AND f.event_type = 'filing'
      AND NOT EXISTS (
        SELECT 1 FROM matter_events o
        WHERE o.matter_id = f.matter_id AND o.event_type = 'order'
          AND o.event_date >= f.event_date AND o.id <> f.id
      )
    ORDER BY f.event_date ASC`;

  // ---- block 3: authorities ------------------------------------------------
  // What the advocate saved to this matter. IDs and anchors only.
  const authorities = await sql<
    { judgment_id: string; created_at: string; paragraph_number: number | null }[]
  >`
    SELECT DISTINCT ON (judgment_id)
           judgment_id, ${sql.unsafe(isoColumn('created_at'))} AS created_at, paragraph_number
    FROM judgment_annotations
    WHERE matter_id = ${matterId} AND deleted_at IS NULL
    ORDER BY judgment_id, created_at DESC`;

  // ---- block 4: preparation checklist --------------------------------------
  const checklist: BriefingBlocks['checklist'] = [];

  // Is the date itself trustworthy? Read from the PREVIOUS briefing for this
  // matter-date if one exists, because that is where confirmation is recorded.
  // Asked as booleans, not timestamps. Nothing here needs the value, only
  // whether it is set — and a timestamp that crosses into JavaScript is a
  // timestamp whose runtime representation somebody has to be right about.
  const [dateState] = await sql<{ confirmed: boolean; not_confirmed: boolean }[]>`
    SELECT (dates_confirmed_at     IS NOT NULL) AS confirmed,
           (dates_not_confirmed_at IS NOT NULL) AS not_confirmed
    FROM briefings WHERE matter_id = ${matterId} AND hearing_date = ${hearingDate}::date`;

  if (dateState?.not_confirmed) {
    checklist.push({
      id: 'confirm-date',
      text: 'Confirm tomorrow’s listing with the court. We could not confirm it against a cause list.',
      basis: 'cause list sync failed or was stale for this court and date',
    });
  } else if (!dateState?.confirmed) {
    // Never checked is not the same as checked and failed, and saying so keeps
    // the confirmed case meaningful.
    checklist.push({
      id: 'date-unchecked',
      text: 'This date has not been checked against a cause list. It is the date on your file.',
      basis: 'no cause list has been consulted for this court and date',
    });
  }

  /**
   * An authority that has moved is the single most important thing to say the
   * night before.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * OD-14 REACHED THE RENDER PATH AND NOT THIS ONE
   * ───────────────────────────────────────────────────────────────────────────
   *
   * This block used to read `overruled_status` and branch on the literal value:
   * a stored `set_aside` produced *"has been set aside. Do not rely on it —
   * find a replacement authority."*
   *
   * For the 73 judgments OD-14 exists for — stored `set_aside`, verified
   * `overruled` edge — that sentence is false in both halves. A later bench
   * held the PROPOSITION is no longer good law; nothing in that case was set
   * aside, the decision between the original parties stands, and the authority
   * is frequently still citable for propositions the overruling court never
   * reached. `route.ts` says exactly that on the same screen and sends
   * `canAddToMatter: true`. The generated checklist was the one surface still
   * telling the advocate to drop it — in a blob written at 23:00 and read
   * standing outside court.
   *
   * The fix is not a different `if`. Both the derivation and the SENTENCE are
   * now shared — `treatment-lookup.ts` and `treatment-checklist.ts` — and
   * `route.ts` rewrites these items from live state on every render, so a
   * status that changes after generation cannot leave a stale instruction
   * behind either.
   */
  if (authorities.length > 0) {
    const state = await loadPrecedentialState(
      sql,
      authorities.map((a) => a.judgment_id),
    );
    checklist.push(...treatmentChecklistItems(state.values()));
  } else {
    checklist.push({
      id: 'no-authorities',
      text: 'No authorities are saved to this matter.',
      basis: 'no annotations reference this matter',
    });
  }

  if (!lastOrder) {
    checklist.push({
      id: 'no-order',
      text: 'No order has been recorded on this matter. Carry the last order from your file.',
      basis: 'no matter_events row of type order carries order_text',
    });
  }

  return {
    matterId,
    hearingDate,
    blocks: {
      lastOrder: lastOrder
        ? {
            present: true,
            eventId: lastOrder.id,
            eventDate: lastOrder.event_date,
            orderText: lastOrder.order_text ?? '',
          }
        : {
            present: false,
            note: 'No order has been recorded on this matter.',
          },
      pendingApplications: {
        count: pending.length,
        items: pending.map((p) => ({
          eventId: p.id,
          eventDate: p.event_date,
          // The court record where there is one; the advocate's own line
          // otherwise. Never a generated description.
          description: p.order_text ?? p.notes ?? 'Filing recorded with no description.',
        })),
        ...(pending.length === 0 ? { note: 'No pending applications recorded.' } : {}),
      },
      authorities: authorities.map((a) => ({
        judgmentId: a.judgment_id,
        addedAt: a.created_at,
        paragraphNumber: a.paragraph_number,
      })),
      checklist,
    },
  };
}

/**
 * Write the briefing, idempotently.
 *
 * `briefings` is unique on (matter_id, hearing_date) and the sweep must be safe
 * to re-run — a retry after a partial night must update tonight's briefing, not
 * grow a second one. `opened_at` is deliberately never touched: regenerating a
 * briefing must not make it look unread.
 */
export async function persistBriefing(
  sql: Sql,
  assembled: AssembledBriefing,
  hearingDateSource: 'advocate' | 'cause_list',
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO briefings (matter_id, hearing_date, generated_at, content, hearing_date_source)
    VALUES (${assembled.matterId}, ${assembled.hearingDate}::date, now(),
            ${JSON.stringify({ blocks: assembled.blocks })}::jsonb, ${hearingDateSource})
    ON CONFLICT (matter_id, hearing_date) DO UPDATE SET
      generated_at        = now(),
      content             = excluded.content,
      hearing_date_source = excluded.hearing_date_source
    RETURNING id
  `;
  if (!row) throw new Error('briefing upsert returned no row');
  return row.id;
}
